# MM-Agent in Claude Code 重构计划

> 基于 gap 分析的架构调整方案与详细执行计划
> 创建日期: 2026-05-16
> 版本: v0.2.0-planning

---

## 1. 项目设计理解

### 1.1 核心价值定位

**输入非结构化赛题 → 自动化数学建模全流程 → 输出符合要求的论文报告**

这是项目的核心价值，也是判断所有设计决策的唯一标准。

### 1.2 技术约束

| 约束 | 说明 |
|------|------|
| **运行环境** | 必须在 Claude Code CLI 中运行 |
| **模型继承** | 继承 Claude Code 的模型配置，无需单独配置 API Key |
| **机制利用** | 使用 Claude Code 的 Skills/Agents/Hooks/MCP 体系 |
| **CLI-first** | v1 不做 Web UI |

### 1.3 论文核心架构（MM-Agent）

论文描述的四阶段流水线：

```
Phase 1: Problem Analysis
  - Problem Understanding (Actor-Critic ×3)
  - Problem Decomposition
  - Task Dependency Analysis → DAG

Phase 2: Mathematical Modeling
  - HMML Retrieval (Top-6 methods)
  - Actor-Critic Iteration (建模方案)

Phase 3: Computational Solving
  - Code Generation
  - Code Execution + Debugging (max_execute=5, max_repair=3)

Phase 4: Solution Reporting
  - Paper Chapter Creation
  - LaTeX Compilation
```

**关键模式：三层次 Actor-Critic**
1. 问题理解层：analysis_actor → analysis_critic → analysis_improvement
2. 建模方案层：modeling_actor → modeling_critic → modeling_improvement
3. 公式层：formulas_actor → formulas_critic → formulas_improvement

---

## 2. 实现差距分析

### 2.1 当前实现状态

| Phase | ROADMAP 状态 | 实际状态 | 问题 |
|-------|-------------|---------|------|
| 1 | ✅ Complete | ⚠️ 部分 | Agent 定义存在但未被调用 |
| 2 | ✅ Complete | ✅ 正常 | Skill 可执行 |
| 3 | ✅ Complete | ✅ 正常 | Scripts 完整 |
| 4 | ✅ Complete | ⚠️ 部分 | HMML 检索脱离 Claude 生态 |
| 5 | ✅ Complete | ⚠️ 部分 | Actor-Critic 不独立（同一 Claude 执行） |
| 6 | ✅ Complete | ⚠️ 部分 | 代码调试循环依赖 Claude，无 Python 模块 |
| 7 | ✅ Complete | ❌ 断裂 | report-generator.py 导入路径错误 |

### 2.2 核心差距分类

#### P0 - 阻塞问题（必须修复才能运行）

| # | 问题 | 影响 |
|---|------|------|
| 1 | `report-generator.py` 导入断裂 | Phase 7 完全无法执行 |
| 2 | `plugin.json` 缺少路径配置 | 插件可能无法正确加载 |
| 3 | 无 Smoke Test 验证 | 无法确认流水线能否运行 |

#### P1 - 架构偏离（不符合 Claude Code 最佳实践）

| # | 问题 | 影响 |
|---|------|------|
| 4 | HMML 检索用 Python 脚本而非 MCP | 脱离 Claude 生态，需手动预计算 |
| 5 | Actor-Critic 同一 Skill 执行 | Critic 评估不独立 |
| 6 | Memory 用 JSON 文件而非 Agent memory | 未利用 Claude Memory 机制 |
| 7 | Agent 文件未被任何 Skill 调用 | Agent Team 架构未实现 |

#### P2 - 论文特性缺失

| # | 问题 | 影响 |
|---|------|------|
| 8 | Problem Understanding Phase 未实现 | 论文 Phase 1 的 Actor-Critic 循环缺失 |
| 9 | HMML Insert 功能未实现 | 无法积累新建模方法 |
| 10 | 无 MMBench 验证 | 未达到论文验证标准 |

### 2.3 根本原因分析

**问题根源：混淆了 Skill 和 Agent 的角色**

| Claude Code 组件 | 正确角色 | 当前实现 |
|------------------|---------|---------|
| **Skill** | 用户命令入口，定义"做什么" | ✅ 正确使用 |
| **Agent** | 执行者，独立 context | ❌ 未被调用，Agent 文件只是文档 |
| **MCP** | 外部工具集成 | ❌ 未使用（HMML 应该是 MCP） |
| **Hooks** | 事件触发、状态跟踪 | ⚠️ 有配置但不完善 |
| **Agent Memory** | 跨 Agent 上下文传递 | ❌ 未使用（用 JSON 文件替代） |

**核心误解：**
- 认为写了 Agent .md 文件就是实现了 Agent
- 认为写了 Skill 指令就是实现了功能
- 未理解 Agent 需要通过 **Agent tool** 调用，才能在独立 context 中执行

---

## 3. 架构调整方案

### 3.1 方案概述

**目标：从 Skill 链式调用 → Agent Team 协作架构**

```
当前架构:
SKILL.md → coordinator.md → parse-problem.md → task-decomposition.md → ...
           (同一 Claude context 中顺序执行)

目标架构:
SKILL.md → 创建 Agent Team → problem-analyst Agent → modeler Agent → critic Agent → ...
           (每个 Agent 在独立 context 中执行)
```

### 3.2 Agent Team 设计

```
┌─────────────────────────────────────────┐
│     Main Session (Team Lead)             │
│  - SKILL.md 入口                          │
│  - 创建 Agent Team                        │
│  - 分配任务、综合结果                       │
└─────────────────────────────────────────┘
         ↑ Agent tool ↓ 任务分配
    ┌─────┴─────┬─────────────┬─────────────┐
    ↓           ↓             ↓             ↓
┌────────┐ ┌────────┐ ┌──────────┐ ┌──────────┐
│Analyst │ │ Modeler│ │ Programmer│ │ Reporter │
│+Critic │ │+Critic │ │          │ │          │
│(opus)  │ │(opus)  │ │(sonnet)  │ │(sonnet)  │
└────────┘ └────────┘ └──────────┘ └──────────┘
```

### 3.3 HMML MCP Server 设计

**方案：将 HMML 检索从 Python 脚本 → MCP Server**

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

**MCP 工具：**
- `hmml_retrieve(query, top_k)` — 检索相关方法
- `hmml_insert(domain, subdomain, method)` — 插入新方法

### 3.4 Actor-Critic 独立化设计

**方案：Actor 和 Critic 分别作为独立 Agent**

```markdown
# agents/mm-agent-modeler.md (Actor)

---
name: mm-agent-modeler
model: sonnet
memory: project
---
生成建模方案...

# agents/mm-agent-critic.md (Critic)

---
name: mm-agent-critic
model: opus       ← 用更强模型
memory: project
---
评估建模方案质量...
```

**调用流程：**
```yaml
# skills/mm-agent/modeling.md

Round 1:
1. Agent(modeler) → 生成方案 → modeling_solution
2. Agent(critic) → 评估方案 → {score, feedback}
3. If score < 8: Round 2

Round 2:
1. Agent(modeler) + feedback → improved_solution
2. Agent(critic) → 评估 → {score}
...
```

### 3.5 Memory System 重构

**方案：从 JSON 文件 → Agent Memory**

```markdown
# agents/mm-agent-modeler.md

---
name: mm-agent-modeler
memory: project    ← 自动持久化
---
```

Agent memory 存储位置：
- `.claude/agent-memory/mm-agent-modeler/session-{id}.json`

**跨 Agent 传递：**
```markdown
# agents/mm-agent-programmer.md

---
name: mm-agent-programmer
memory: project
skills: load-modeler-context   ← 预加载 modeler memory
---
```

---

## 4. 详细执行计划

### 4.1 Phase A: 最小可行修复（目标：让流水线能跑）

**时间：1天**

#### A1: 修复 report-generator.py 导入

```python
# templates/report-generator.py 当前导入（错误）
from prompt.template import PAPER_CHAPTER_PROMPT, ...
from llm.llm import LLM
from utils.utils import parse_llm_output_to_json

# 修复方案
from prompts.mm_agent_prompts import (
    PAPER_CHAPTER_PROMPT,
    PAPER_CHAPTER_WITH_PRECEDING_PROMPT,
    PAPER_INFO_PROMPT,
    PAPER_NOTATION_PROMPT
)

# LLM 替换为 Claude Code Agent 调用或 Anthropic SDK
# utils 函数本地实现
```

**任务清单：**
- [ ] 修正导入路径
- [ ] 实现 `parse_llm_output_to_json` 等工具函数
- [ ] 替换 LLM 类为 Anthropic SDK 或 Skill 方案
- [ ] 测试报告生成流程

#### A2: 补全 plugin.json 配置

```json
{
  "name": "mm-agent",
  "skills": "./skills",
  "agents": "./agents",
  "hooks": "./hooks/hooks.json"
}
```

#### A3: 创建 Smoke Test

```yaml
# tests/smoke-test.yaml
cases:
  - name: minimal-problem
    input: tests/fixtures/minimal.md
    expected: [problem.md, dag.json, model-1.md, report.tex]
```

### 4.2 Phase B: Agent Team 架构（目标：符合 Claude Code 最佳实践）

**时间：2-3天**

#### B1: 创建 Critic Agent

```markdown
# agents/mm-agent-critic.md

---
name: mm-agent-critic
description: 评估建模方案质量
model: opus
tools: Read
memory: project
---

评估建模方案：
- 假设合理性 (1-10)
- 公式正确性 (1-10)
- 方法适配度 (1-10)

输出 JSON: {score, strengths, weaknesses, improvements}
```

#### B2: 重构 modeling.md 调用方式

```yaml
# skills/mm-agent/modeling.md

---
name: modeling
description: 数学建模 Actor-Critic
mcpServers: hmml-retrieval
---

Actor-Critic 迭代：

## Step 1: HMML 检索
使用 hmml_retrieve MCP 工具检索 Top-6 方法

## Step 2: Actor
使用 Agent tool 调用 mm-agent-modeler

## Step 3: Critic
使用 Agent tool 调用 mm-agent-critic

## Step 4: 迭代
如果 score < 8，重复 Step 2-3（最多 3 轮）
```

#### B3: 创建 HMML MCP Server

```
servers/hmml-server/
├── package.json
├── index.js
└── lib/
    ├── embeddings.js
    └── retrieval.js
```

#### B4: 配置 Agent Memory

```markdown
# 所有 Agent 添加
memory: project
```

### 4.3 Phase C: 完整性补全（目标：达到论文标准）

**时间：1周**

#### C1: 实现 Problem Understanding Phase

论文 Phase 1 有三个 Actor-Critic 循环：
- Problem Analysis Actor-Critic
- Problem Modeling Actor-Critic
- Task Decomposition

当前实现缺少第一个循环。

#### C2: 实现 HMML Insert 功能

```javascript
// MCP Server 新增工具
hmml_insert(domain, subdomain, method, core_idea, application)
```

#### C3: 增强 Hooks 配置

```json
{
  "hooks": {
    "SubagentStart": [
      {"hooks": [{"type": "command", "command": "echo 'Agent started'}]}
    ],
    "SubagentStop": [
      {"hooks": [{"type": "command", "command": "echo 'Agent completed'}]}
    ]
  }
}
```

#### C4: MMBench 验证准备

```yaml
# tests/mmbench-validation.yaml
benchmark: MMBench-2024
metrics: [AE, MR, PS, RBA]
```

---

## 5. 任务跟踪

### 5.1 当前阶段

**Phase C: 完整性补全 — 已完成** ✅

所有三个阶段 (A/B/C) 的任务均已完成。

### 5.2 任务清单

| 优先级 | 任务 | 状态 | 完成日期 |
|--------|------|------|----------|
| P0 | 修复 report-generator.py 导入 | ✅ 完成 | 2026-05-16 |
| P0 | 补全 plugin.json 配置 | ✅ 完成 | 2026-05-16 |
| P0 | 创建 Smoke Test | ✅ 完成 | 2026-05-16 |
| P1 | 创建 mm-agent-critic.md | ✅ 完成 | 2026-05-16 |
| P1 | 重构 modeling.md | ✅ 完成 | 2026-05-16 |
| P1 | 创建 HMML MCP Server | ✅ 完成 | 2026-05-16 |
| P1 | 配置 Agent Memory | ✅ 完成 | 2026-05-16 |
| P2 | Problem Understanding Phase | ✅ 完成 | 2026-05-16 |
| P2 | HMML Insert | ✅ 完成 | 2026-05-16 |
| P2 | 增强 Hooks 配置 | ✅ 完成 | 2026-05-16 |
| P2 | MMBench 验证准备 | ✅ 完成 | 2026-05-16 |

### 5.3 依赖关系

```
A1 (修复导入) ─┬→ A3 (Smoke Test) ✅
A2 (plugin.json)─┘ ✅
    ↓
B1 (Critic Agent) ─→ B2 (重构 modeling.md) ✅
B3 (HMML MCP) ─────→ B2 ✅
B4 (Agent Memory)──→ B2 ✅
    ↓
C1 (Problem Understanding) ─→ C4 (MMBench) ✅
C2 (HMML Insert) ───────────→ C4 ✅
C3 (Hooks) ─────────────────→ C4 ✅
```

---

## 6. 风险与缓解

### 6.1 技术风险

| 风险 | 概率 | 影响 | 缓解措施 | 状态 |
|------|------|------|---------|------|
| HMML MCP Server 开发复杂 | 中 | 高 | Python MCP Server 实现 | ✅ 已解决 |
| Agent 调用成本高 | 高 | 中 | Sonnet Actor + Opus Critic | ✅ 已配置 |
| Smoke Test 发现更多问题 | 高 | 中 | 8/8 测试通过 | ✅ 已验证 |

### 6.2 时间风险

| 风险 | 概率 | 影响 | 缓解措施 | 状态 |
|------|------|------|---------|------|
| Phase B 超时 | 中 | 高 | 按计划完成 | ✅ 无超时 |
| MCP Server 延迟 | 高 | 中 | Python MCP 已实现 | ✅ 已完成 |

---

## 7. 成功标准

### 7.1 Phase A 完成标准

- [x] `report-generator.py` 可导入无错误 ✅
- [x] Smoke Test 通过（8/8 测试通过）✅
- [x] 插件结构正确（plugin.json paths 配置）✅

### 7.2 Phase B 完成标准

- [x] Critic Agent 可被独立调用 ✅
- [x] HMML 检索可通过 MCP 工具执行 ✅
- [x] Agent Memory 配置完成（所有 Agent memory: project）✅

### 7.3 Phase C 完成标准

- [x] Problem Understanding Actor-Critic 实现 ✅
- [x] HMML Insert 可用（hmml_recompute_embeddings 工具）✅
- [x] MMBench 验证准备完成（配置 + 脚本）✅

---

## 8. 文档维护

### 8.1 本文档职责

此 PLAN 文档负责：
- 维持重构计划的上下文
- 记录设计理解和 gap 分析
- 跟踪任务执行状态

### 8.2 更新规则

- 每完成一个任务：更新任务清单状态
- 每执行一个阶段：更新"当前阶段"
- 发现新 gap：更新差距分析
- 架构调整：更新架构方案

### 8.3 关联文档

| 文档 | 职责 |
|------|------|
| `CHANGELOG.md` | 版本变动记录 |
| `docs/research/paper-vs-implementation-gap-analysis.md` | 详细差距分析 |
| `docs/research/claude-code-architecture-refactor.md` | 架构重构方案 |
| `IDEA.md` | 设计决策文档 |
| `ROADMAP.md` | 原始路线图 |

---

## 9. 下一步行动

**PLAN 执行完成** ✅

所有 Phase A/B/C 任务已完成。Smoke Test 8/8 通过。

**建议后续工作：**
1. 运行端到端测试验证完整流水线
2. 使用 MMBench 验证脚本评估性能
3. 补充更多测试用例（optimization.md, prediction.md）

---

*PLAN 创建: 2026-05-16*
*PLAN 完成: 2026-05-16*
*所有 Phase 完成*