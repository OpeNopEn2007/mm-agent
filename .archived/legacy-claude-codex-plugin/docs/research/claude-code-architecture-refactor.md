# MM-Agent Claude Code 插件架构重构方案

> 基于 Claude Code 插件开发规范的分析与重构建议
> 创建日期: 2026-05-16

---

## 1. 当前架构问题分析

### 1.1 核心问题：没有充分利用 Claude Code 原生机制

| 功能 | 当前实现 | 问题 |
|------|---------|------|
| **HMML 检索** | Python 脚本 + 预计算 embedding | ❌ 脱离 Claude Code 生态，需要用户手动运行预计算脚本 |
| **Actor-Critic** | Skill 文件自然语言描述 | ⚠️ 同一个 skill 中 Actor 和 Critic 由同一个 Claude 执行，缺乏独立性 |
| **Memory System** | JSON 文件 + Python 脚本 | ❌ 未利用 Agent 的 `memory: project` 特性 |
| **报告生成** | Python 模块（导入断裂） | ❌ 应该是纯 Skill 方案，由 Claude 生成内容 |
| **Agent Teams** | 未使用 | ❌ 论文核心是多 Agent 协作，但当前只用 Skill 链式调用 |

### 1.2 plugin.json 配置不完整

```json
// 当前配置
{
  "name": "mm-agent",
  "version": "0.1.0",
  "description": "...",
  // 缺少路径配置
}

// 应该配置
{
  "name": "mm-agent",
  "skills": "./skills",
  "agents": "./agents",
  "hooks": "./hooks/hooks.json"
}
```

### 1.3 Agent 文件未被调用

当前目录结构：
```
agents/
├── mm-agent-coordinator.md  ← 未被任何 Skill 调用
├── mm-agent-modeler.md      ← 未被任何 Skill 调用
├── mm-agent-programmer.md   ← 未被任何 Skill 调用
└── mm-agent-reporter.md     ← 未被任何 Skill 调用
```

coordinator.md 使用 `Skill tool` 调用子 skill，而不是 `Agent tool` 调用 Agent。

---

## 2. 推荐架构重构

### 2.1 Agent Team 架构（符合论文设计）

论文核心是多 Agent 协作：

```
┌─────────────────────────────────────────┐
│     Main Session (Team Lead)             │
│  - 接收用户命令                           │
│  - 创建 Agent Team                        │
│  - 分配任务、综合结果                       │
└─────────────────────────────────────────┘
         ↑ 消息传递 ↓ 任务分配
    ┌─────┴─────┬─────────────┬─────────────┐
    ↓           ↓             ↓             ↓
┌────────┐ ┌────────┐ ┌──────────┐ ┌──────────┐
│Problem │ │ Modeler│ │Programmer│ │ Reporter │
│Analyst │ │+Critic │ │          │ │          │
└────────┘ └────────┘ └──────────┘ └──────────┘
```

**Claude Code 实现方式：**

```text
/mm-agent --problem problem.pdf

→ Main session 创建 Agent Team:
  - problem-analyst: 解析问题（Actor-Critic）
  - modeler: 建模方案（Actor-Critic）
  - programmer: 代码执行
  - reporter: 论文生成
```

### 2.2 HMML 检索的正确实现

**方案 A: MCP Server（推荐）**

HMML 检索应该作为 MCP Server 提供，而不是 Python 脚本：

```json
// .mcp.json
{
  "mcpServers": {
    "hmml-retrieval": {
      "command": "${CLAUDE_PLUGIN_ROOT}/servers/hmml-server",
      "args": ["--knowledge-dir", "${CLAUDE_PLUGIN_DATA}/hmml"]
    }
  }
}
```

MCP Server 优势：
- 自动随插件加载
- Claude 可以直接调用 MCP 工具
- 无需用户手动预计算 embedding

**方案 B: Skill + 动态计算**

如果不用 MCP，应该让 Skill 在执行时计算 embedding：

```yaml
---
name: hmml-retrieval
description: 检索相关建模方法
allowed-tools: Bash, Read
---

步骤：
1. 加载知识库：Read knowledge/hmml/hmml.json
2. 计算相似度：Bash python3 scripts/hmml_retrieval.py ...
3. 返回 Top-K 方法
```

当前问题是：用户必须先运行 `hmml_precompute_embeddings.py`，这脱离了 Claude Code 工作流。

### 2.3 Actor-Critic 的正确实现

**问题：** 当前 Actor 和 Critic 由同一个 Claude 执行，缺乏独立性。

**论文设计：** Actor 和 Critic 是两个独立的 Agent。

**Claude Code 实现：**

```markdown
# agents/mm-agent-modeler.md (Actor)

---
name: mm-agent-modeler
description: 生成建模方案（Actor）
tools: Read, Bash
memory: project
---

生成建模方案...

# agents/mm-agent-critic.md (Critic)

---
name: mm-agent-critic
description: 评估建模方案（Critic）
tools: Read
model: opus  ← 用更强的模型做 Critic
memory: project
---

评估建模方案质量：
- 假设合理性 (1-10)
- 公式正确性 (1-10)
- 方法适配度 (1-10)
```

**调用流程：**

```yaml
# skills/mm-agent/modeling.md

---
name: modeling
description: 数学建模 Actor-Critic
---

Actor-Critic 迭代：

1. 使用 Agent tool 调用 mm-agent-modeler（生成方案）
2. 使用 Agent tool 调用 mm-agent-critic（评估方案）
3. 如果评分 < 8，让 modeler 改进
4. 重复直到评分 >= 8 或达到 max_rounds=3
```

### 2.4 Memory System 的正确实现

**当前问题：** JSON 文件 + Python 脚本，脱离 Claude Memory 机制。

**Claude Code Agent Memory：**

```markdown
---
name: mm-agent-modeler
memory: project  ← 自动持久化到 .claude/agent-memory/mm-agent-modeler/
---

Agent 完成任务后，Claude 自动保存记忆到：
.claude/agent-memory/mm-agent-modeler/session-{id}.json
```

**跨 Agent 传递：**

Agent 可以读取其他 Agent 的 memory：

```markdown
---
name: mm-agent-programmer
memory: project
skills: load-modeler-memory  ← 预加载 modeler 的输出
---
```

### 2.5 报告生成的正确实现

**当前问题：** Python 模块导入断裂，且脱离 Claude 生成能力。

**正确方案：纯 Skill**

```yaml
# skills/mm-agent/report-generation/SKILL.md

---
name: report-generation
description: 生成 LaTeX 报告
allowed-tools: Read, Write, Bash(xelatex)
context: fork
agent: general-purpose
---

## 输入

读取 Memory 文件：
- .planning/memory/problem.md
- .planning/memory/task-*.json
- .planning/memory/model-*.md
- .planning/memory/results-*.json

## 输出

逐章节生成 LaTeX 内容：

### 章节生成（使用 Actor-Critic）

1. Problem Restatement
   - 使用 Agent tool 调用 chapter-writer
   - 使用 Agent tool 调用 chapter-reviewer

2. Model Assumptions
   ...

### LaTeX 编译

Bash: xelatex report.tex

## 注意

- 内容由 Claude 生成，不是 Python 模块
- 使用 PAPER_CHAPTER_PROMPT（从 prompts/mm-agent-prompts.py 加载）
```

---

## 3. 重构后的插件结构

```
mm-agent/
├── .claude-plugin/
│   └── plugin.json              ← 补全路径配置
├── skills/
│   └── mm-agent/
│       ├── SKILL.md             ← 主入口（创建 Agent Team）
│       ├── problem-analysis.md  ← Phase 2（调用 problem-analyst Agent）
│       ├── modeling.md          ← Phase 5（调用 modeler + critic Agents）
│       ├── code-execution.md    ← Phase 6（调用 programmer Agent）
│       └── report-generation.md ← Phase 7（调用 reporter Agent）
├── agents/
│   ├── mm-agent-coordinator.md  ← Team Lead（可选）
│   ├── problem-analyst.md       ← 问题解析 + Actor-Critic
│   ├── mm-agent-modeler.md      ← Actor
│   ├── mm-agent-critic.md       ← Critic（用 opus）
│   ├── mm-agent-programmer.md   ← 代码生成执行
│   └── mm-agent-reporter.md     ← 论文生成
├── hooks/
│   └ hooks.json                 ← 增强：验证 Memory 格式
│   └ session-start              ← 加载 HMML 知识库
├── servers/                     ← MCP Servers（新增）
│   └── hmml-server/             ← HMML 检索 MCP
│       ├── package.json
│       └── index.js
├── .mcp.json                    ← MCP 配置（新增）
├── prompts/
│   └ mm-agent-prompts.py        ← Prompt 模板（保留）
├── knowledge/
│   └ hmml/                      ← HMML 知识库（保留）
├── templates/
│   ├── mcmthesis/               ← LaTeX 模板（保留）
│   └── cumcmthesis/
└── scripts/                     ← 辅助脚本（保留，但降低优先级）
    ├── dag_topological_sort.py
    └── hmml_precompute_embeddings.py
```

---

## 4. 关键改动清单

### 4.1 P0 - 必须立即修复

| # | 改动 | 文件 | 说明 |
|---|------|------|------|
| 1 | 补全 plugin.json 路径配置 | `.claude-plugin/plugin.json` | 添加 skills, agents, hooks 路径 |
| 2 | 修改 SKILL.md 调用方式 | `skills/mm-agent/SKILL.md` | 改为创建 Agent Team |
| 3 | 创建 mm-agent-critic.md | `agents/mm-agent-critic.md` | 独立的 Critic Agent（用 opus） |
| 4 | 修改 modeling.md 调用方式 | `skills/mm-agent/modeling.md` | 用 Agent tool 调用 modeler + critic |

### 4.2 P1 - 提升用户体验

| # | 改动 | 文件 | 说明 |
|---|------|------|------|
| 5 | 创建 HMML MCP Server | `servers/hmml-server/` | 让 HMML 检索成为 MCP 工具 |
| 6 | 配置 .mcp.json | `.mcp.json` | 注册 hmml-retrieval MCP |
| 7 | 增强 hooks.json | `hooks/hooks.json` | 添加 Memory 验证、Actor-Critic 状态跟踪 |

### 4.3 P2 - 架构优化

| # | 改动 | 文件 | 说明 |
|---|------|------|------|
| 8 | 删除断裂的 report-generator.py | `templates/report-generator.py` | 改为纯 Skill 方案 |
| 9 | 重构 report-generation.md | `skills/mm-agent/report-generation.md` | 由 Claude 生成 LaTeX |
| 10 | 添加 Agent memory 配置 | `agents/*.md` | `memory: project` |

---

## 5. HMML MCP Server 设计

### 5.1 为什么用 MCP

| 方案 | 优点 | 缺点 |
|------|------|------|
| **Python 脚本** | 简单 | 需要用户手动预计算，脱离 Claude 生态 |
| **Skill + 动态计算** | 集成 | 每次调用都要计算 embedding（慢） |
| **MCP Server** | 自动加载、可复用、符合 Claude 生态 | 需要开发 MCP Server |

### 5.2 MCP Server 结构

```
servers/hmml-server/
├── package.json
├── index.js
├── lib/
│   ├── embeddings.js      ← 嵌入计算（调用外部 API 或本地模型）
│   └── retrieval.js       ← 检索逻辑
└── knowledge/
    └ hmml.json            ← HMML 数据（或从插件目录加载）
```

### 5.3 MCP 工具定义

```javascript
// index.js
server.setRequestHandler(ListTools, async () => ({
  tools: [
    {
      name: "hmml_retrieve",
      description: "检索相关数学建模方法",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "任务描述" },
          top_k: { type: "number", default: 6 }
        }
      }
    },
    {
      name: "hmml_insert",
      description: "插入新建模方法",
      inputSchema: {
        type: "object",
        properties: {
          domain: { type: "string" },
          subdomain: { type: "string" },
          method: { type: "string" },
          core_idea: { type: "string" },
          application: { type: "string" }
        }
      }
    }
  ]
}));
```

### 5.4 使用方式

```yaml
# skills/mm-agent/modeling.md

---
name: modeling
mcpServers: hmml-retrieval  ← 预加载 MCP
---

使用 hmml_retrieve 工具检索方法：
hmml_retrieve(query="建立预测模型", top_k=6)
```

---

## 6. Actor-Critic 实现细节

### 6.1 当前问题

同一个 Skill 中 Actor 和 Critic 由同一个 Claude 执行：

```
modeling.md:
  Step 2: Actor - Generate solution
  Step 3: Critic - Evaluate solution
  Step 4: Iterate
```

当 Claude 执行 Step 3（Critic）时，它已经知道 Step 2（Actor）生成的方案，评估不独立。

### 6.2 正确实现

使用两个 Agent：

```yaml
# skills/mm-agent/modeling.md

Actor-Critic 迭代：

## Round 1

1. Actor: 使用 Agent tool 调用 mm-agent-modeler
   - modeler 在独立 context 中生成方案
   - 返回 modeling_solution

2. Critic: 使用 Agent tool 调用 mm-agent-critic
   - critic 在独立 context 中评估方案
   - 返回 {score, weaknesses, improvements}

3. 如果 score >= 8，停止
   如果 score < 8，进入 Round 2

## Round 2

1. Actor: 再次调用 mm-agent-modeler
   - 传入 Critic 的 feedback
   - 返回 improved_solution

2. Critic: 再次调用 mm-agent-critic
   - 评估 improved_solution
   ...
```

### 6.3 Agent 配置差异

```markdown
# agents/mm-agent-modeler.md

---
name: mm-agent-modeler
model: sonnet       ← Actor 用 Sonnet（平衡成本和质量）
effort: high
memory: project
---

# agents/mm-agent-critic.md

---
name: mm-agent-critic
model: opus         ← Critic 用 Opus（更强评估能力）
effort: medium
memory: project
---
```

---

## 7. 实施路径

### Phase A: 最小可行重构（1天）

1. 补全 `plugin.json` 路径配置
2. 创建 `mm-agent-critic.md`
3. 修改 `modeling.md` 使用 Agent tool 调用 modeler + critic

### Phase B: MCP 集成（2-3天）

4. 开发 `servers/hmml-server/`
5. 配置 `.mcp.json`
6. 修改 Skills 使用 MCP 工具

### Phase C: 架构完善（1周）

7. 重构报告生成为纯 Skill
8. 增强 hooks 配置
9. 添加 Agent memory 配置
10. Smoke Test 验证

---

## 8. 结论

当前实现的根本问题是：

1. **混淆了 Skill 和 Agent 的角色**
   - Skill 是用户命令入口
   - Agent 是执行者
   - 当前只用 Skill 链式调用，未利用 Agent Team

2. **脱离 Claude Code 生态**
   - HMML 检索用 Python 脚本（应该用 MCP）
   - Memory 用 JSON 文件（应该用 Agent memory）
   - 报告生成用 Python 模块（应该用 Skill）

3. **Actor-Critic 不独立**
   - 同一个 Claude 执行 Actor 和 Critic
   - 应该用两个 Agent

重构后，mm-agent 将成为真正的 Claude Code 原生插件，充分利用 Agent Team、MCP、Agent Memory 等机制。

---

*方案创建: 2026-05-16*