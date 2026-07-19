# mm-agent

`mm-agent` 是一个面向数学建模赛题的本地 Agent Harness。它把赛题、附件和数据转化为一组可检查的阶段产物，最后生成可编译的 LaTeX 和 PDF 论文。

```text
赛题输入
  -> Problem Analysis
  -> Mathematical Modeling
  -> Computational Solving
  -> Solution Reporting
  -> LaTeX
  -> PDF
```

## 当前状态

`v1.0.0` 的 Canonical Core 由 `4ce82cd` 接受，OpenCode Adapter 设计由 `1040e63` 接受。OpenCode Plugin Spike 已由 `315c319` 接受；Step 2 CaseContextStore 已由 `cfda6ea` 接受；Step 3 Preflight 与输入整理已在当前 acceptance HEAD 完成并通过 focused、完整回归、Build、package/diff 和 5 个无跳过的真实 OpenCode runtime gate。Step 4 尚未开始。

- Canonical Core：[`docs/architecture/canonical-core.md`](docs/architecture/canonical-core.md) 与 [`docs/context/artifact-protocol.md`](docs/context/artifact-protocol.md) 是宿主无关机制唯一来源。
- OpenCode Adapter：[`docs/architecture/opencode-plugin-harness.md`](docs/architecture/opencode-plugin-harness.md) 定义 v1 唯一 Adapter 的实现接口。
- Plugin Spike：`315c319 feat: validate OpenCode plugin harness` 已验证安装生命周期、Plugin/Agent/Tool/Skill、fresh child session、重启和 compaction-off 恢复；它不是完整四阶段实现。
- `v0.2.0` 是旧 Claude/Codex Plugin 方向的最终快照；Pi CLI Extension 一度出现在 `Unreleased` 文档重置中，也已结束。
- 旧实现保存在 `.archived/legacy-claude-codex-plugin/`，只用于回溯。
- 当前目标是交付 Canonical Core 的 OpenCode Adapter 与一个真实赛题到 PDF 的 Golden Case。
- PDF 不存在或 LaTeX 编译失败时，Case 不得标记为完成。

当前里程碑结果契约见 [PLAN.md](PLAN.md)。当前交接状态见 [HANDOFF.md](HANDOFF.md)。

## 产品标准

MM-Agent 论文定义了四阶段、HMML 检索、Actor-Critic、任务 DAG、任务 memory、计算求解和报告生成。`mm-agent` 将这些方法实现为宿主原生工作流，同时把可复用价值保存在项目自己的文件协议中。

系统必须满足以下条件：

- 用户通过 `/mm-agent` 一个入口启动或恢复 Case。
- 每个阶段生成明确、可验证的 artifact。
- Subagent 使用 fresh context，不依赖前序聊天历史。
- 只有已验收的 artifact 才能进入后续上下文。
- 数值结论来自可重复执行的代码或明确记录的直接推导。
- 报告阶段生成 LaTeX、编译日志和 PDF。
- 人类可以检查任一 Case 的状态、尝试、评审和最终结果。
- 完成证据由 `inspect` 从当前文件实时推导，不在 `state.json` 维护第二份状态。

## 设计概念

| 概念 | 含义 |
|------|------|
| Harness | 驱动四阶段、工具、状态和验收循环的整体系统。 |
| Canonical Core | 与宿主无关的 Case、artifact、context、review 和 gate 协议。 |
| Adapter | 将 Canonical Core 接入某个 Agent 宿主的薄层；v1 只实现 OpenCode Adapter。 |
| Agent | 承担一种语义角色的 fresh subagent，例如 Analyst 或 Solver。 |
| Skill | 告诉 Agent 应按什么方法完成工作。 |
| Tool | 执行确定性操作，例如环境检查、DAG 校验、检索、计算和编译。 |
| Case | 一道赛题从输入快照到最终 PDF 的完整本地运行。 |
| Case Policy | `open` 时固化的 revision budget、Rubric 引用和其他运行约束。 |
| Intake | 发现并整理输入的确定性过程，以一次 `open` 调用结束。 |
| Stage | Problem Analysis、Mathematical Modeling、Computational Solving 或 Solution Reporting。 |
| Task | 由问题分解产生、位于任务 DAG 中的可求解节点。 |
| Role | Analyst、Modeler、Solver、Writer 或 Critic 的语义职责，不等同于宿主中的具体身份标识。 |
| Actor | 负责产生 Candidate 的 Role；Critic 不属于 Actor。 |
| Orchestrator | 调用 Core、派发 Role 和提交 Review 的控制者，不拥有 Case 状态。 |
| Artifact | 某个 Stage 或 Task 产生的领域成果。 |
| Candidate | 尚未通过 Gate 的 Artifact。 |
| Attempt | 为一个 Stage 或 Task 生成 Candidate 的一次独立尝试。 |
| Context Manifest | Attempt 的本地输入清单、目标、约束、允许输出、promotion targets 和验收条件。 |
| Review | Critic 对 Candidate 的结构化语义判断。 |
| Gate | 验证 Candidate 和 Review、提升 Artifact、推进 Case 状态的唯一机制。 |
| Accepted Artifact | 通过 Gate、可以成为后续上下文事实的 Artifact。 |
| Task Memory | 已完成 Task 的紧凑语义投影，供依赖 Task 和报告阶段读取。 |
| Runtime Evidence | 检索、计算或编译等确定性操作产生的带 provenance 和 hash 的不可变证据。 |
| Local Runtime | 执行检索、计算和编译的受控本地环境。 |

## 设计原则

### 报告是产品

中间推理和日志用于解释、修复和改进报告。最终产品是可以阅读、评价和提交的 PDF 论文。

### Artifact 是阶段接口

后续阶段需要的事实必须写入本地 artifact。聊天内容、隐藏推理和 subagent 最终消息都不能成为唯一事实来源。

### Fresh Context 由当前事实重建

Subagent A 不直接把聊天传给 Subagent B。主 Agent 根据 `state.json`、Role Recipe、任务 DAG 和 accepted artifacts，为每次派发重建一个最小上下文。Context Manifest 是这次重建的可审计产物。

### 语义判断与确定性操作分离

Agent 负责问题理解、模型选择、结果解释和文章写作。Tool 负责文件、schema、DAG、进程、hash、编译和状态推进。`gate` 是唯一同时执行 schema 验证、hash 校验、revision compare-and-swap、promotion target 白名单与 stage 推进的位置。

### 本地文件优先

Case 上下文使用 Markdown、JSON、代码、CSV、图片和 LaTeX，不使用数据库或独立 memory 服务。文件便于检查、恢复、移动和测试。

### 宿主原生

OpenCode 负责模型会话、built-in tools 和 fresh subagent session。`mm-agent` 不重复建设 LLM runtime、TUI 或聊天系统。

## 总体架构

```text
User
  |
  | /mm-agent
  v
OpenCode primary agent
  |
  +-- mm-agent Skill ----------------------- workflow policy
  |
  +-- OpenCode task tool ------------------- fresh child sessions
  |     +-- mm-analyst
  |     +-- mm-modeler
  |     +-- mm-solver
  |     +-- mm-writer
  |     `-- mm-critic
  |
  +-- @mm-agent/opencode Plugin
        +-- config hook -------------------- hidden Agent definitions
        +-- six custom Tools --------------- deterministic operations
        +-- CaseContextStore --------------- Canonical Core seam
        +-- Python runtime ----------------- HMML and scientific compute
        `-- optional compaction hook ------- resume hint only
```

架构分为四层：

| 层 | 职责 |
|----|------|
| Product Method | 四阶段、HMML、Actor-Critic、DAG、Memory 和报告纪律。 |
| Canonical Core | Case 状态、context manifest、artifact schema、gate 和恢复协议。 |
| OpenCode Adapter | Plugin、Agents、Skills、Tools、安装和宿主权限。 |
| Local Runtime | uv Python 环境、科学计算、模型 cache 和外部 TeX 工具链。 |

Adapter 只负责把宿主能力映射到 Canonical Core，不能重新定义 Case schema、状态推进或 Context Manifest。

## Canonical Core 接口

Adapter 通过四个操作使用 Canonical Core：

```text
open(case_id, input_manifest?, case_policy?)
dispatch(case_id, role, task_id?, base_revision?)
gate(case_id, attempt_id, review, expected_revision)
inspect(case_id)
```

- `open` 既能根据 `input_manifest` 与 `case_policy` 固化输入副本、Rubric 快照、`case.json` 与初始 `state.json`，也能省略这些参数并先做 schema 校验以恢复已有 Case。
- `dispatch` 为 Actor 创建唯一 Attempt 并写入 `context.json`；Critic 不创建第二个 Attempt，它从同一 Manifest 的 `review` section、candidate `expected_outputs` 和 Rubric 重建 Fresh Role Session。
- `gate` 携带调用方的 `expected_revision`，与 Manifest 的 `base_revision` 是不同概念：`base_revision` 记录 Candidate 基于哪个状态生成（用于审计），`expected_revision` 用于 `gate` 的 compare-and-swap 并防止并发覆盖。
- `inspect` 是只读返回，由当前文件和完成规则实时推导 completion evidence，不写任何状态。

## OpenCode 机制

OpenCode Plugin 提供三类宿主能力：

- `config` hook 将 5 个 hidden Agents 注入 OpenCode 的合并配置。
- Plugin `tool` registry 注册 6 个 `mm_agent_*` Tools。
- OpenCode 内置 `task` tool 为每次委派创建独立 child session。

主 Agent 使用 `task` 派发角色和 `context.json` 路径。Subagent 共享项目工作目录，但不继承父会话的完整聊天上下文。

OpenCode 的实验性 compaction hook 只能注入恢复提示：

```text
active case: <case-id>
state: runs/<case-id>/state.json
resume by inspecting local state
```

系统正确性不依赖该 hook。OpenCode 重启后，再次运行 `/mm-agent` 必须能够从本地 Case 恢复。

## 分发与安装

目标分发物是 npm 包 `@mm-agent/opencode`。包内包含：

- 编译后的 TypeScript Plugin。
- 安装、更新和卸载 CLI。
- 4 个 Skills。
- 5 个 Agent prompt/rubric 资产。
- Python runtime 定义和 uv lock。
- HMML 只读知识源及选定模型的预计算索引。
- 报告模板和安装 receipt schema。

安装器负责：

1. 检测 OpenCode 配置位置。
2. 在配置中注册 Plugin。
3. 将 bundled Skills 复制到 OpenCode 能扫描的配置目录。
4. 写入包含版本、目标路径和文件 hash 的 receipt。
5. 提示用户重启 OpenCode。

更新和卸载根据 receipt 操作，不能扫描或删除不属于 `mm-agent` 的文件。OCX 和 OpenCode 远程 Skill URL 可以作为辅助渠道，但不是 v1 的主分发路径。

## 唯一用户入口

公开入口只有：

```text
/mm-agent
```

OpenCode 会将安装后的 `mm-agent` Skill 自动暴露为 slash command。v1 不设计 `/mm-agent:check`、`/doctor` 或 `/setup` 等额外命令。

入口流程：

```text
/mm-agent
  -> 内部 preflight
  -> 发现输入
  -> 创建或恢复 Case
  -> 请求用户确认进入正文工作流
  -> 自动执行四阶段闭环
```

如果 preflight 失败，主 Agent 给出完整完善计划。用户回复“完善”后，系统修复可以安全自动处理的部分，并为需要人工操作的项目提供逐步指南。复检通过后，系统再次询问是否开始正文。

## 输入发现

默认输入位置是项目根目录的 `problems/`。用户也可以在请求中使用 `@目录` 或 `@文件` 指定输入。

发现优先级：

1. 用户显式提供的路径。
2. `problems/` 下的赛题文件、附件和数据。
3. 两者都不存在时询问用户。

`mm_agent_prepare` 验证发现的输入，构造 input manifest 与 Case Policy，并且只通过 `CaseContextStore.open` 把输入副本、四份 Rubric 快照、`case.json` 和初始 `state.json` 固化到 Case。已有 Case 在省略新 intake 参数时恢复；冲突重复创建返回错误，不覆盖不可变事实。整个过程不修改用户原始题目目录，也不保留可被后续访问的用户原始绝对路径。

## 四阶段工作流

### 1. Problem Analysis

`mm-analyst` 读取原题、附件描述和用户约束，生成：

- `artifacts/problem-understanding.md`
- `artifacts/tasks.json`
- `artifacts/task-graph.json`

任务依赖由 Agent 明确给出。Tool 只验证 task schema、引用完整性和 DAG 无环性，不根据关键词猜测依赖。

### 2. Mathematical Modeling

`mm-modeler` 读取已验收的问题分析，并针对各任务调用 HMML 检索。它生成整体建模方案、变量、假设、公式、方法选择和任务求解要求。

主要输出：

- `artifacts/modeling-scheme.md`
- `tasks/<task-id>/retrieved-methods.json`
- 每个任务的建模段落或结构化公式 artifact

检索相似度只提供候选方法，不替代 Modeler 对假设、数据条件和公式的判断。

### 3. Computational Solving

`mm-solver` 按 DAG 波次运行。同一波次中没有依赖关系的任务可以并行；后续波次只读取直接依赖任务的已验收 `memory.json`。

每个任务输出：

- `tasks/<task-id>/code/`
- `tasks/<task-id>/execution-result.json`
- `tasks/<task-id>/figures/`
- `tasks/<task-id>/memory.json`

`memory.json` 保存任务描述、建模方法、结果解释、代码输出路径和图表路径。它是依赖上下文的紧凑投影，不复制完整日志。`mm_agent_compute` 写出的执行 manifest 作为 Runtime Evidence，可被同 scope 或下游依赖的 Manifest 引用。

### 4. Solution Reporting

`mm-writer` 先读取 accepted artifact 索引和各任务 memory，再按需读取完整结果。它生成：

- `report/outline.md`
- `report/notation.md`
- `report/main.tex`
- `report/compile.log`
- `report/report.pdf`

报告阶段必须保留编译与修复轨迹。Report Gate 同时检查 PDF、LaTeX 源文件和编译日志；只有 `report.pdf` 存在且非空，且 `main.tex`、`compile.log` 同时存在时，Case 才能完成。

## Agents

| Agent | 职责 | 主要权限 |
|-------|------|----------|
| `mm-analyst` | 解析问题、提取约束、分解任务、提出 DAG。 | 读取输入，写自己的 attempt。 |
| `mm-modeler` | 检索 HMML、选择方法、建立公式和建模方案。 | 读取 accepted analysis，写自己的 attempt。 |
| `mm-solver` | 编写并执行代码、解释结果、生成 task memory。 | 读任务依赖，写独立任务目录，调用 compute。 |
| `mm-writer` | 组装论文、维护符号、调用编译修复循环。 | 读取 accepted artifacts，写 report attempt。 |
| `mm-critic` | 按阶段 rubric 审查候选 artifact。 | 只读候选和上游约束，返回结构化 review；不创建第二个 Attempt。 |

Subagent 不得更新 `state.json`，也不能派发下一层 Agent。主 Agent 是唯一调度者。

## Skills

| Skill | 内容 |
|-------|------|
| `mm-agent` | 唯一入口、preflight、Case 恢复、阶段调度、Critic 循环和完成规则。 |
| `mm-hmml` | 何时检索、如何解释候选方法、如何避免把相似度当成模型结论。 |
| `mm-compute` | 可复现代码、输入输出纪律、数值校验、图表和错误修复。 |
| `mm-report` | 论文结构、符号一致性、artifact 引用、LaTeX 生成和编译修复。 |

Problem Analysis、Modeling 和 Critic 的角色专属规则放在 Agent prompt 和 rubric 中，不为每个阶段额外增加 Skill。

## Tools

| Tool | 确定性职责 |
|------|------------|
| `mm_agent_check` | 检查 OpenCode、Plugin、Skills、uv/Python、Case 写权限、模型 cache 和 TeX 模板编译；只报告 HMML 状态，不选择模型或构建最终索引。 |
| `mm_agent_prepare` | 发现并验证输入，构造 manifest 与 Case Policy，委托 `CaseContextStore.open` 固化不可变 Case。 |
| `mm_agent_case` | `open`、`dispatch`、`gate`、`inspect`；管理 Case 状态、Context Manifest、Attempt 和 Artifact 提升。 |
| `mm_agent_hmml` | 校验索引、执行 dense 或 lexical retrieval、记录模式、模型、revision、index hash 和分数。 |
| `mm_agent_compute` | 在受控工作目录执行 Python、保存 stdout/stderr、timeout 和 Runtime Evidence。 |
| `mm_agent_compile` | 使用 `latexmk -xelatex` 或多遍 `xelatex` 编译，保留日志和 PDF。 |

`mm_agent_case` 通过 `CaseContextStore` 暴露四个 action：

```ts
type CaseAction =
  | { action: "open"; caseId: string; inputManifest?: InputManifest; policy?: CasePolicy }
  | { action: "dispatch"; caseId: string; role: Role; taskId?: string; baseRevision?: number }
  | { action: "gate"; caseId: string; attemptId: AttemptId; review: Review; expectedRevision: number }
  | { action: "inspect"; caseId: string }
```

`gate` 接收 `expectedRevision`，由 Core 与当前 `state.revision` 做 compare-and-swap；`baseRevision` 仅写入 Manifest 作为审计字段。

## Fresh Subagent Context

### 上下文重建

每次派发执行以下流程：

```text
mm_agent_case dispatch
  -> 读取 state.json
  -> 根据 role/task 选择 context recipe
  -> 解析直接 DAG 依赖
  -> 只选择 accepted artifacts
  -> 创建唯一 attempt 目录
  -> 写入 context.json
  -> 返回 context.json 路径

OpenCode task
  -> 创建 fresh child session
  -> 告诉 subagent 读取 context.json
  -> subagent 自己读取大文件并写 candidate
```

主 Agent 的派发 prompt 只内联角色、目标、用户约束和完成格式。原题、数据、模型、代码和依赖结果通过本地相对路径引用。

### Context Manifest

`attempts/<scope>/<attempt-id>/context.json` 是 Actor Attempt 与 Critic Review 的可审计输入清单：

```json
{
  "schema_version": 1,
  "case_id": "mmb-2024-c",
  "attempt_id": "solving-task-03-001",
  "scope": "solving/task-03",
  "sequence": 1,
  "created_at": "2026-07-16T00:00:00Z",
  "base_revision": 8,
  "role": "solver",
  "goal": "求解 task-03 并解释结果",
  "required_reads": [
    {
      "path": "artifacts/modeling-scheme.md",
      "kind": "model",
      "sha256": "..."
    },
    {
      "path": "tasks/task-01/memory.json",
      "kind": "dependency",
      "sha256": "..."
    }
  ],
  "constraints": ["只使用已验收的上游结果"],
  "allowed_writes": [
    "attempts/solving/task-03/001/code/",
    "attempts/solving/task-03/001/execution-result.json",
    "attempts/solving/task-03/001/figures/",
    "attempts/solving/task-03/001/memory.json"
  ],
  "expected_outputs": [
    "attempts/solving/task-03/001/code/",
    "attempts/solving/task-03/001/execution-result.json",
    "attempts/solving/task-03/001/memory.json"
  ],
  "promotions": [
    {
      "candidate": "attempts/solving/task-03/001/code/",
      "target": "tasks/task-03/code/",
      "required": true
    },
    {
      "candidate": "attempts/solving/task-03/001/execution-result.json",
      "target": "tasks/task-03/execution-result.json",
      "required": true
    },
    {
      "candidate": "attempts/solving/task-03/001/memory.json",
      "target": "tasks/task-03/memory.json",
      "required": true
    }
  ],
  "acceptance": ["代码可重复执行"],
  "review": {
    "rubric": {
      "path": "input/policy/rubrics/solving.md",
      "sha256": "..."
    },
    "required_reads": [
      "attempts/solving/task-03/001/code/",
      "attempts/solving/task-03/001/execution-result.json",
      "attempts/solving/task-03/001/memory.json"
    ]
  },
  "latest_review": null,
  "resolves_blocker": null
}
```

Manifest 全部使用 Case-root-relative path。`base_revision` 记录 Candidate 基于哪个状态生成；`gate` 的 `expectedRevision` 是另一个独立输入，不来自 Manifest。

### 角色 Context Recipes

| Role | Required Reads | 主要输出 |
|------|----------------|----------|
| Analyst | 输入 manifest、原题、附件、用户约束。 | 问题理解、任务分解、任务 DAG。 |
| Modeler | 输入、accepted problem understanding、HMML 候选。 | 建模方案、变量、假设、公式和任务要求。 |
| Solver | 当前 task、accepted modeling scheme、直接依赖 task memory。 | 代码、执行结果、图表和 Task Memory。 |
| Critic | 同一 Attempt Manifest 的 `review` section、candidate `expected_outputs`、Rubric 和必要上游约束。 | `pass`、`revise` 或 `block` Review。 |
| Writer | accepted artifact index、task memories、报告要求。 | 大纲、符号表、LaTeX 和报告 Candidate。 |

Context 不包含其他 Agent 的完整聊天、无关兄弟任务、全部失败历史或主 Agent 的隐藏推理。

## 本地 Case 布局

```text
runs/<case-id>/
├── case.json
├── state.json
├── input/
│   ├── manifest.json
│   ├── policy/
│   │   └── rubrics/
│   └── source files copied from the selected input
├── artifacts/
│   ├── problem-understanding.md
│   ├── tasks.json
│   ├── task-graph.json
│   └── modeling-scheme.md
├── tasks/
│   └── <task-id>/
│       ├── retrieved-methods.json
│       ├── code/
│       ├── figures/
│       ├── execution-result.json
│       └── memory.json
├── attempts/
│   └── <scope>/<attempt-id>/
│       ├── context.json
│       ├── evidence/
│       ├── candidate files
│       └── review.json
├── report/
│   ├── outline.md
│   ├── notation.md
│   ├── main.tex
│   ├── compile.log
│   └── report.pdf
└── feedback/
    └── feedback.md
```

所有 persisted path 都以 Case 根目录为基准。实现必须解析真实路径后再次确认其仍位于 Case 根目录内，拒绝绝对路径、`..` 路径穿越和符号链接逃逸。

`runs/` 已被 gitignore。Case 文件留在项目本地，不写入项目文档，也不写入 OpenCode 全局配置。

## State、Attempt 与 Gate

### `state.json`

`state.json` 是机器拥有的流程状态。Agent 只能读取，不能直接编辑。它至少包含：

- `schema_version`、`case_id`。
- `stage`：`analysis`、`modeling`、`solving` 或 `reporting`。
- `status`：`prepared`、`running`、`blocked`、`failed` 或 `completed`。
- `current_wave`：只在 Solving 使用并从 `1` 开始，其他 Stage 为 `null`。
- 单调递增的 `revision`。
- `accepted_artifacts`：accepted artifact index。
- `revision_budget`：Analysis、Modeling、Solving（按 task-id）和 Reporting 的剩余修订次数。
- `blockers`：追加式阻塞记录及 `resolved_at`。

`state.json` 不保存 active dispatches；`inspect` 从 `attempts/<scope>/<attempt-id>/` 推导 active attempt（拥有 `context.json` 但尚未拥有有效 `review.json`）。

### Gate 流程

`mm_agent_case gate` 是唯一状态写入入口：

```text
candidate + critic verdict + expected_revision
  -> 校验 review schema
  -> 校验 expected_revision == state.revision
  -> 校验 required_reads hash 仍匹配输入快照、Runtime Evidence 或 accepted artifact
  -> 校验 candidate 路径位于 allowed_writes
  -> 校验 promotions 中每个 target 属于当前 scope 的稳定 artifact 白名单
  -> 保存 review.json

pass
  -> 复制或原子替换稳定 artifacts/tasks/report 路径
  -> 更新 accepted index
  -> 按完成条件推进 stage / current_wave
  -> revision + 1

revise
  -> 保留 attempt
  -> 剩余 revision budget > 0 时扣减并允许下一 Attempt
  -> revision budget == 0 时设置 status: "failed"

block
  -> 追加 blocker
  -> 保留 stage 与 current_wave
  -> 设置 status: "blocked"
  -> 同 wave 不依赖 blocker 的 sibling Task 仍可 gate，但 wave 不能前进
  -> 同 scope Actor Attempt 可通过 resolves_blocker 解决该 blocker
```

Gate 输入的 `expected_revision` 用于 compare-and-swap，与 Manifest 的 `base_revision` 是两个独立概念。状态写入使用临时文件和原子替换。每个 dispatch 使用唯一 `attempts/<scope>/<attempt-id>/` 目录。

### Stage 转换与完成

```text
analysis   --pass--> modeling
modeling   --pass--> solving (current_wave=1)
solving    --all tasks pass--> reporting (current_wave=null)
reporting  --report gate pass--> completed
```

Modeling Gate 接受 DAG 时按 `case_policy.solving_per_task` 为每个 Task 建立独立 revision budget。Report Gate 必须验证 `report/main.tex`、`report/compile.log` 与非空 `report/report.pdf` 同时存在。完成证据由 `inspect` 实时从文件推导，不在 `state.json` 维护第二份 `completed` flag。

## Actor-Critic

Actor 先生成 candidate，`mm-critic` 使用 fresh context 独立审查。Critic 返回结构化结果：

```json
{
  "schema_version": 1,
  "attempt_id": "solving-task-03-001",
  "verdict": "pass",
  "findings": [],
  "required_fixes": [],
  "evidence": ["attempts/solving/task-03/001/execution-result.json"],
  "reviewed_at": "2026-07-16T00:00:00Z"
}
```

Critic 复用同一 Attempt Manifest 的 `review` section、candidate `expected_outputs`、Rubric 与必要上游约束，不创建第二个 Attempt。Critic 不得设置 `resolves_blocker`。

每个需要 Critic 的阶段允许一个初始版本和最多两次修订（来自 `case_policy.revision_budget`）。`gate` 执行 schema、hash、路径、revision 与完成条件验证；Critic 执行语义验证。两者都通过才能推进。

## DAG 与并行求解

Modeler 明确输出任务依赖。`mm_agent_case` 验证 task ID、依赖引用和无环性，并计算拓扑波次。

```text
Wave 1: task-01, task-02     parallel
Wave 2: task-03              reads accepted memory from task-01
Wave 3: task-04              reads accepted memory from task-02/task-03
```

并行任务只写自己的 attempt 目录。主 Agent 等待一个 wave 完成后串行执行 gate，再启动下一 wave。每个 Task 有独立 `state.revision_budget.solving.<task-id>`。

## HMML

活跃知识源位于 `knowledge/hmml/`：

- `hmml.json`
- `method-index.json`
- `hmml-embeddings.npy`
- `embedding-meta.json`

当前索引使用 BGE-M3，但 v1 不直接继承该选择。实现前运行小型离线评测：

- 至少 30 个中英文数学方法查询。
- 人工标注相关方法。
- 比较 `Alibaba-NLP/gte-multilingual-base` 与 `BAAI/bge-m3`。
- 主指标为 `Recall@5` 和 MRR，同时记录模型体积、冷启动和查询延迟。
- 如果 GTE 的 `Recall@5` 与最佳结果相差不超过 3 个百分点，选择更小且与官方实现一致的 GTE；否则选择 BGE-M3。

最终发布只携带一个模型对应的预计算 HMML 索引，不携带模型权重。评测四元组 `(model, hmml-embeddings.npy, embedding-meta.json, method-index.json)` 原子更新。首次完善环境时，用户确认后将固定 revision 的模型下载到 MM-Agent 专用 cache。

模型不可用时，`mm_agent_hmml` 使用本地 BM25/关键词检索并在结果中标记 `retrieval_mode: "bm25"` 的 degraded mode。检索候选只是建模证据，Modeler 仍负责方法选择。

## Python 与 Cache

Plugin 和 CaseContextStore 使用 TypeScript。HMML 和科学计算使用 Python 3.12，由 uv 管理 MM-Agent 自有环境。

系统不得读取用户项目 `.venv` 或把依赖安装进系统 Python。跨平台 cache 使用操作系统约定目录：

- Windows：`%LOCALAPPDATA%/mm-agent/`
- macOS：`~/Library/Caches/mm-agent/`
- Linux：`$XDG_CACHE_HOME/mm-agent/` 或 `~/.cache/mm-agent/`

cache 保存 uv 环境、Hugging Face 模型和可重建索引。Case artifacts 始终保存在项目的 `runs/`。

## 计算执行

`mm_agent_compute` 在当前 task 的独立工作目录中执行代码。它记录：

- 精确命令和工作目录。
- timeout。
- stdout、stderr 和 exit code。
- 生成文件列表与 hash。
- Python 环境和依赖摘要。

Tool 不自动解释结果。Solver 根据 execution manifest 和输出文件生成 `execution-result.json` 与 `memory.json`。执行 manifest 作为 Runtime Evidence，可被同一 Attempt 或下游 Manifest 的 `required_reads` 引用。

## LaTeX 编译

`mm_agent_compile` 不捆绑 TeX 发行版。Preflight 用真实模板执行编译测试。

编译优先级：

1. `latexmk -xelatex`。
2. 缺少 `latexmk` 时，使用多遍 `xelatex`。

支持目标是 TeX Live、MacTeX 和 MiKTeX 提供的标准 XeLaTeX。编译失败后，Writer 根据结构化错误摘要修复 `main.tex`，同时保留原始 `compile.log`。编译 manifest 作为 Runtime Evidence。未产生非空 `report/report.pdf` 时，compile Tool 不能返回成功。

## 失败恢复

- Worker 退出但未产生候选时，`state.json` 不推进，可以重新派发。
- Critic 拒绝候选时，失败 attempt 保留，下一次只加载最新候选和最新 review。
- OpenCode 主会话压缩或重启后，`/mm-agent` 调用 `inspect` 恢复当前 Case。
- 上游 hash 与 manifest 不一致时，依赖 attempt 失效并重新生成。
- 两个进程使用相同 `expected_revision` 推进同一 Case 时，旧 revision 的 gate 返回冲突，不覆盖新状态。

## 权限和安全

- Hidden Agents 的写权限限制在 `runs/**`。
- Critic 使用只读权限。
- Compute 和 Compile 通过自定义 Tool 执行受控进程。
- persisted paths 必须是 Case-root-relative path，拒绝路径穿越和符号链接逃逸。
- Plugin receipt 只管理自己安装的文件。
- 模型下载固定 revision 和文件 hash。
- Case 留在本地不代表内容不会发送给模型提供商；Agent 读取的文本仍会进入所选模型的请求上下文。

## 测试策略

### Contract Tests

覆盖 Case schema、context recipes、Case-root-relative path、hash、DAG、state revision、attempt 隔离、gate 提升、promotion target 白名单、Case Policy 快照、scope 内 solving budget、blocker 追加与解决、completion evidence 推导以及并发 gate。

### Tool Integration Tests

使用临时项目验证输入整理、Python 执行、HMML degraded mode、TeX 检测和编译日志；每个 manifest 都包含命令/模式、环境、stdout、stderr、exit、timeout 与 output hash。

### OpenCode Plugin Spike

在完整实现前验证：

- npm 安装、更新和卸载。
- Plugin config hook 注入 Agent。
- Skills 安装后出现 `/mm-agent`。
- built-in `task` 创建 fresh session。
- Windows 路径和重启恢复。
- compaction 关闭或不可用时，新会话仍可通过本地 Case state 恢复。

### Golden Case

首个真实闭环 Case 计划使用 MM-Bench `2024_C` Wimbledon Momentum。测试 fixture 和数据需先完成来源与许可证检查。

Golden Case 只有在以下条件全部满足时通过：

- 四阶段都留下 accepted artifacts。
- 计算代码和结果可重新执行。
- `report/main.tex` 存在。
- `report/compile.log` 存在。
- `report/report.pdf` 存在且非空。
- 新 OpenCode 会话能从 `state.json` 恢复并由 `inspect` 检查完成证据。

## v1 非目标

- Web UI。
- 自定义 LLM runtime 或 TUI。
- 训练模型权重。
- 大规模 benchmark。
- 同时支持多个 Agent 宿主。
- 恢复归档中的 Claude/Codex Plugin 或 Pi CLI Extension 入口。
- 捆绑完整 TeX 发行版或 embedding 模型权重。
- 用数据库、MCP memory server 或隐藏会话状态替代 Case 文件。

## 目标项目结构

```text
mm-agent/
├── README.md              # 完整产品与机制设计入口
├── IDEA.md                # 项目为什么存在
├── PLAN.md                # 里程碑结果与验收契约
├── HANDOFF.md             # 当前交接状态
├── CHANGELOG.md           # 版本与结构变化
├── AGENTS.md              # 通用 Agent 项目规则
├── CLAUDE.md              # 与 AGENTS.md 字节内容一致的 Claude 入口
├── docs/
│   ├── context/           # Case、artifact、反馈和项目协议
│   ├── architecture/      # 实现接口、论文对齐和参考取舍
│   ├── roadmap/           # 版本验收标准
│   ├── research/          # 历史调研证据
│   └── reference/         # 一手资料
├── knowledge/             # HMML 与写作知识资产
├── prompts/               # 论文 prompt 迁移来源
├── scripts/               # 现有 DAG、HMML 和 memory 实验
├── servers/               # 旧工具服务实验，待按 v1 取舍
├── templates/             # LaTeX 模板
├── tests/                 # fixtures 和验证代码
├── problems/              # 计划中的默认赛题入口
├── runs/                  # gitignored Case 输出
└── .archived/             # 非活跃历史资产
```

Step 1 已创建 npm package、最小 Plugin/Agent/installer 与宿主验证测试；Step 2 已创建 `src/core/` 的 CaseContextStore、持久 schema、安全路径、迁移、Context Recipe、Gate transaction 和 contract tests；Step 3 已交付 `mm_agent_check`、`mm_agent_prepare`、`/mm-agent` 的 preflight/intake 流程、四份 Rubric 快照源与 `problems/` 默认入口。Step 4 及其后的 HMML runtime、Compute/Compile、完整四阶段 Agents/Skills 和 Golden Case 仍以 [PLAN.md](PLAN.md) 的里程碑结果为准。

## 文档入口

- [IDEA.md](IDEA.md)：项目动机和工程品味。
- [PLAN.md](PLAN.md)：里程碑预期结果、完成边界和验收证据。
- [HANDOFF.md](HANDOFF.md)：当前阶段、dirty state 和下一步动作。
- [docs/context/project-kernel.md](docs/context/project-kernel.md)：项目 Kernel 与协作原则。
- [docs/architecture/canonical-core.md](docs/architecture/canonical-core.md)：宿主无关机制唯一来源。
- [docs/context/artifact-protocol.md](docs/context/artifact-protocol.md)：Case 文件与状态契约。
- [docs/architecture/opencode-plugin-harness.md](docs/architecture/opencode-plugin-harness.md)：OpenCode Adapter 的实现接口。
- [docs/architecture/paper-alignment.md](docs/architecture/paper-alignment.md)：论文机制到本地实现的映射。
- [docs/roadmap/v1.0.0.md](docs/roadmap/v1.0.0.md)：v1 验收标准。

## 参考资料

- [MM-Agent 论文](https://arxiv.org/abs/2505.14148)
- [LLM-MM-Agent 官方实现](https://github.com/usail-hkust/LLM-MM-Agent)
- [OpenCode](https://github.com/anomalyco/opencode)
- [GSD Core](https://github.com/open-gsd/gsd-core)
