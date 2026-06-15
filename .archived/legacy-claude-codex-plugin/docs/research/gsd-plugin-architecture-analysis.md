# GSD 插件架构分析报告

> 聚焦于 GSD 在 Claude Code 中的构建模式，特别是上下文传递保护和智能体实现
> 基于 GitHub 仓库 [gsd-build/get-shit-done](https://github.com/gsd-build/get-shit-done) 分析
> 分析日期: 2025-05-07

---

## 1. 核心架构理念

GSD 的本质是**用 Markdown 文件编排多 Agent 协作**，而非传统的代码框架。它有三层：

```
Commands (用户入口)
    ↓ 调用
Workflows (流程编排)
    ↓ 派发
Agents (专业执行)
```

**关键约束：Workflow 只做调度，不做实际工作。Agent 包含所有领域知识。**

---

## 2. 上下文传递机制（核心设计）

### 2.1 文件即上下文（File-as-Context）

GSD 的核心原则：**永远不通过对话传递上下文，通过文件路径传递。**

```
❌ 错误方式：
"好的，现在我已经分析了问题，问题是关于 XXX，包含数据 A、B、C，
接下来需要建模..."（把所有上下文塞进 prompt）

✅ 正确方式：
"<files_to_read>
  .planning/PROJECT.md
  .planning/STATE.md
  .planning/phases/01-analysis/PLAN.md
</files_to_read>"
（只给路径，Agent 自己读取）
```

**为什么这样做：**
- 每个子 Agent 都有独立的上下文窗口
- 文件内容按需加载，不占用对话空间
- 多个 Agent 可以并行读取同一文件，互不干扰
- 持久化到文件系统，跨会话可用

### 2.2 CONTEXT.md（阶段决策捕获）

每个阶段有自己的 CONTEXT.md，存储在 `.planning/phases/XX-name/{phase_num}-CONTEXT.md`。

结构：
```markdown
<domain>阶段边界 — 这个阶段交付什么</domain>

<decisions>
### [讨论领域 1]
- D-01: [具体决策]
### Claude's Discretion
[用户说"你决定"的部分]
</decisions>

<canonical_refs>必须读取的参考文档（带完整路径）</canonical_refs>

<code_context>可复用的代码资产和模式</code_context>

<deferred>属于其他阶段的想法</deferred>
```

**关键设计：**
- `<canonical_refs>` 是**强制字段** — 每个 CONTEXT.md 必须有
- 决策是**具体的**，不是模糊的（"卡片布局"不是"现代感"）
- 下游 Agent 不需要重新问用户已捕获的决策

### 2.3 Context Monitor Hook（上下文监控）

GSD 通过 `PostToolUse` Hook 实现上下文监控：

```
35% 剩余 → WARNING：提醒 Agent 注意上下文预算
25% 剩余 → CRITICAL：强制压缩或停止
```

工作原理：
1. StatusLine Hook 写入桥接文件 `/tmp/claude-ctx-{session_id}.json`
2. PostToolUse Hook 读取该文件
3. 注入警告到对话中

---

## 3. 状态管理

### 3.1 STATE.md（短期记忆）

STATE.md 是项目的"短期记忆"，必须控制在 **100 行以内**。

```yaml
---
gsd_state_version: 1.0
milestone: v2.0
status: in_progress
active_phase: "4.5"          # 当前执行的阶段
next_action: execute-phase    # 下一步推荐命令
next_phases: ["4.5"]          # 适用的阶段
progress:
  total_phases: 17
  completed_phases: 10
  percent: 59
---

# State: 项目名称
## Current Position
Phase: 4.5 of 17 (API Routes)
Plan: 3 of 5 in current phase
Status: Executing
## Performance Metrics
- Total plans: 31
- Avg duration: 12min
## Accumulated Context
### Decisions
- Phase 3: 选择 PostgreSQL 而非 SQLite
### Blockers
- Phase 5 依赖外部 API 密钥
## Session Continuity
Last session: 2025-05-07 14:30
Stopped at: Plan 3 完成，准备开始 Plan 4
```

### 3.2 状态变更通过 CLI 工具

Agent **永远不直接编辑** STATE.md。所有变更通过 `gsd-tools.cjs`：

```bash
gsd-tools.cjs state begin-phase --phase 4 --name "API Routes" --plans 5
gsd-tools.cjs state advance-plan
gsd-tools.cjs state update-progress
gsd-tools.cjs state add-decision --phase 4 --summary "选择 RESTful" --rationale "团队熟悉"
gsd-tools.cjs state add-blocker --text "需要 AWS 密钥"
gsd-tools.cjs state record-session --stopped-at "Plan 3 完成" --resume-file .continue-here.md
```

**为什么用 CLI 而不是 Agent 直接编辑：**
- 确保 Markdown 格式一致性
- Frontmatter 解析和更新是确定性的
- 防止 Agent 意外破坏状态结构
- 支持原子操作（要么全成功，要么全失败）

### 3.3 状态生命周期

```
ready_to_plan → planning → ready_to_execute → executing → in_progress → phase_complete
                    ↑                                          |
                    └──────────────────────────────────────────┘
```

StatusLine 渲染场景：
1. **Phase Active** — `active_phase` 有值 → 显示 "Phase 4.5 executing"
2. **Idle, Next Recommended** — `next_action` 有值 → 显示 "next execute-phase 4.5"
3. **Milestone Complete** — `percent: 100` → 显示 "milestone complete"
4. **Default Fallback** — 其他 → 显示原有格式

---

## 4. 智能体实现模式

### 4.1 Agent 定义格式

```markdown
---
name: gsd-executor
description: Executes GSD plans with atomic commits, deviation handling...
tools: Read, Write, Edit, Bash, Grep, Glob, mcp__context7__*
color: yellow
---

<role>
You are a GSD plan executor. You execute PLAN.md files atomically...

@~/.claude/get-shit-done/references/mandatory-initial-read.md
</role>
```

**关键点：**
- `tools` 字段限制 Agent 可用工具
- `@path` 引用自动注入到 Agent 上下文
- 角色定义、方法论、约束全部写在 Agent 文件里

### 4.2 Agent 调用模式

```python
# Workflow 中调用 Agent
Task(
    subagent_type="gsd-executor",      # Agent 类型
    model="{executor_model}",           # 模型选择
    isolation="worktree",               # 隔离模式
    prompt="""
    <objective>Execute plan {plan_num}</objective>
    <files_to_read>
    - {phase_dir}/PLAN.md
    - .planning/STATE.md
    - .planning/PROJECT.md
    </files_to_read>
    """
)
```

### 4.3 Agent Skills 注入

在派发 Agent 前，Workflow 先获取该 Agent 的专属规则：

```bash
AGENT_SKILLS=$(gsd-tools.cjs agent-skills gsd-executor)
```

返回的规则注入到 Agent 的 prompt 中，实现：
- 每个 Agent 有独立的行为规范
- 共享的规则在公共 references 中
- 特化规则在 Agent 自己的文件中

### 4.4 Agent 通信协议

Agent 通过**结构化文本标记**与 Workflow 通信：

```
## PLANNING COMPLETE       → Workflow 接管，进入执行
## CHECKPOINT REACHED      → Workflow 暂停，等待用户确认
## RESEARCH BLOCKED        → Workflow 需要额外信息
## PHASE COMPLETE          → Workflow 更新状态，准备下一阶段
```

### 4.5 Checkpoint 与 Fresh Agent

当 Agent 遇到检查点时：

```
Agent 返回：
## CHECKPOINT REACHED
<checkpoint_state>
completed_tasks: [...]
current_task: "..."
resume_point: "..."
</checkpoint_state>

Workflow 处理：
1. 向用户展示检查点状态
2. 用户确认后，派发**全新的 Agent**（不是恢复旧的）
3. 新 Agent 接收 <completed_tasks> 和 <resume_point>
```

**为什么用 Fresh Agent 而不是 Resume：**
> "Resume relies on internal serialization that breaks with parallel tool calls."
> — GSD 文档

### 4.6 Worktree 隔离

并行 Agent 使用 git worktree 实现文件系统隔离：

```
主仓库: /project/
Agent 1: /project/.worktrees/executor-1/  (独立 checkout)
Agent 2: /project/.worktrees/executor-2/  (独立 checkout)
```

- 每个 Agent 在自己的 worktree 中工作
- 不会互相覆盖文件
- Workflow 在所有 Agent 完成后统一验证
- 编排器上下文占用仅 10-15%

---

## 5. 工作流编排

### 5.1 execute-phase（阶段执行）

```
1. gsd-tools.cjs init execute-phase → 加载所有上下文（JSON）
2. gsd-tools.cjs phase-plan-index → 发现计划，按 wave 分组
3. Wave 执行：
   ├── Wave 1: 并行执行（每个 plan → gsd-executor + worktree）
   ├── Wave 1 完成 → 验证 hooks + 检查 SUMMARY.md
   ├── Wave 2: 并行执行
   └── ...
4. 所有 Wave 完成 → gsd-verifier 验证阶段目标
5. gsd-tools.cjs phase complete → 更新 roadmap + state
6. 如果 --auto → 自动进入下一阶段
```

### 5.2 plan-phase（阶段规划）

```
1. [可选] gsd-phase-researcher → RESEARCH.md
2. gsd-planner → PLAN.md 文件
3. gsd-plan-checker → 验证计划质量
4. 如果有问题 → 返回步骤 2（最多 3 轮）
5. 需求覆盖检查 → 所有 REQ-IDs 必须被覆盖
```

---

## 6. CLI 工具（gsd-tools.cjs）

`bin/gsd-tools.cjs` 是 ~918 行的 Node.js 单文件 CLI，是所有操作的编程后端。

**核心能力：**

| 命令 | 功能 |
|------|------|
| `init <workflow>` | 一次性加载所有上下文（JSON） |
| `state <action>` | STATE.md CRUD 操作 |
| `resolve-model <agent>` | 根据 profile 解析模型 |
| `phase <action>` | 阶段增删改查 |
| `agent-skills <agent>` | 获取 Agent 专属规则 |
| `phase-plan-index` | 发现计划并分组 |
| `commit` | 规范化 git commit |
| `verify <type>` | 计划结构/引用验证 |
| `fill-template <type>` | 生成预填充的 SUMMARY/PLAN/VERIFICATION |

**`--pick` 标志：** 类似 jq 的字段提取，无需外部依赖：
```bash
gsd-tools.cjs state load --pick ".current_position.phase"
```

**`--cwd` 标志：** 允许沙箱化的子 Agent 在项目根目录外运行。

---

## 7. 对 mm-agent 的启示

### 7.1 必须采纳的模式

| GSD 模式 | mm-agent 应用 |
|---------|---------------------|
| **File-as-Context** | Agent 之间通过 `.planning/` 文件传递上下文，不内联到 prompt |
| **Thin Orchestrator** | coordinator.md 只做调度，不做建模/编码/报告 |
| **STATE.md** | 用 STATE.md 跟踪当前任务、进度、决策 |
| **CLI 工具** | 创建 mm-tools（Node.js）处理状态变更和文件操作（参考 gsd-tools.cjs） |
| **Fresh Agent** | 不恢复旧 Agent，派发新 Agent + 上次的 checkpoint 状态 |
| **Worktree** | 并行任务使用 worktree 隔离 |

### 7.1.1 Claude Code 原生 Agent Panel UI（2026-05-07 确认）

Claude Code 提供了**原生的子智能体监控面板**（Agent Panel），位于终端输入框下方：

- **v2.1.97** (2026-04-08)：`/agents` 命令显示运行中的子智能体
- **v2.1.98** (2026-04-09)：`/agents` 分 Running/Library 标签页，支持 "View running instance"
- **v2.1.129** (2026-05-06)：修复 agent panel 被隐藏的回归 bug

**对 mm-agent 的意义**：用户可以实时看到每个建模子智能体的工作进展（问题分析 Agent、建模 Agent、代码 Agent 等），这种透明度是论文 Python 实现做不到的。设计 Agent 时应考虑输出对用户可见的进度信息。

**快捷键**：`↑↓` 选择会话，`Enter` 进入查看，`x` 停止子智能体。

### 7.2 mm-agent 的特殊需求

mm-agent 与 GSD 有本质区别：

| 维度 | GSD | mm-agent |
|------|-----|----------------|
| **任务类型** | 通用软件开发 | 特定领域（数学建模） |
| **Agent 数量** | 33 个通用 Agent | 6-8 个领域 Agent |
| **状态复杂度** | Phase/Plan 层级 | Task/Subtask + Memory 层级 |
| **执行模式** | 按计划执行 | 按 DAG 拓扑排序执行 |
| **外部依赖** | 无 | HMML 嵌入模型、Python 执行环境 |
| **输出物** | 代码 + 文档 | 代码 + LaTeX 论文 + 图表 |

### 7.3 建议的 Agent 分解

参考 GSD 的 Agent 设计和论文工程仓库的实现：

```
mm-agent-coordinator     → 编排器（调度 + 状态管理）
mm-agent-problem-analyst → 问题理解（Actor-Critic×3）
mm-agent-decomposer      → 任务分解 + 细化
mm-agent-modeler         → 数学建模（HMML 检索 + 公式 Actor-Critic）
mm-agent-coder           → 代码生成 + 执行 + 调试
mm-agent-reporter        → LaTeX 论文生成
mm-agent-verifier        → 结果验证（可选）
```

### 7.4 建议的文件结构

```
.claude/
├── skills/mm-agent/
│   ├── SKILL.md              # 入口（调度到 coordinator workflow）
│   └── workflows/
│       ├── execute-task.md   # 单任务执行流
│       └── generate-report.md # 报告生成流
├── agents/
│   ├── mm-agent-coordinator.md
│   ├── mm-agent-problem-analyst.md
│   ├── mm-agent-decomposer.md
│   ├── mm-agent-modeler.md
│   ├── mm-agent-coder.md
│   └── mm-agent-reporter.md
├── scripts/
│   ├── mm-tools.py           # 状态管理 CLI（类似 gsd-tools.cjs）
│   ├── dag_topological_sort.py
│   └── hmml_retrieval.py
```

### 7.5 实施优先级

1. **Phase 0: 基础设施** — 创建 mm-tools.py（状态管理 CLI），定义 Agent 文件
2. **Phase 1: 单任务流水线** — Problem Analyst → Modeler → Coder 串联
3. **Phase 2: 多任务编排** — Coordinator + DAG + Memory 传递
4. **Phase 3: 报告生成** — Reporter Agent + LaTeX 编译
5. **Phase 4: 质量保证** — Actor-Critic 完整循环 + Verifier
