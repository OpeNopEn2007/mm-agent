# Canonical Core

Canonical Core 定义 MM-Agent Harness 的宿主无关机制。任何 Adapter 都必须遵守本协议，不能把 Case 真相留在宿主会话、私有 memory 或平台专用配置中。

## 范围

Canonical Core 负责：

- Case 身份和输入快照。
- 四阶段及任务 DAG。
- Candidate、Attempt、Review 和 Gate。
- Accepted Artifact 和 Task Memory。
- Fresh Context 重建。
- 状态推进、失败恢复和完成规则。

Canonical Core 不负责模型提供商、聊天界面、宿主会话承载、角色绑定语法、命令调度、进程隔离或软件分发。这些职责属于 Adapter 和 Local Runtime。

## 领域词汇

| 术语 | 定义 |
|------|------|
| Case | 一道赛题从输入快照到最终 PDF 的完整运行。 |
| Case Policy | `open` 时固化的修订预算、Rubric 引用和其他运行约束。 |
| Intake | 发现并整理输入的确定性过程，以一次 `open` 调用结束。 |
| Stage | Problem Analysis、Mathematical Modeling、Computational Solving 或 Solution Reporting。 |
| Task | 由问题分解产生、位于任务 DAG 中的可求解节点。 |
| Role | Analyst、Modeler、Solver、Writer 或 Critic 的语义职责，不等同于宿主中的具体身份标识。 |
| Actor | 负责产生 Candidate 的 Role；Critic 不属于 Actor。 |
| Orchestrator | 调用 Core、派发 Role 和提交 Review 的控制者，不拥有 Case 状态。 |
| Artifact | 某个 Stage 或 Task 产生的领域成果。 |
| Candidate | 尚未通过 Gate 的 Artifact。 |
| Attempt | 为一个 Stage 或 Task 生成 Candidate 的一次独立尝试。 |
| Context Manifest | Attempt 的本地输入清单、目标、约束、允许输出和验收条件。 |
| Review | Critic 对 Candidate 的结构化语义判断。 |
| Gate | 验证 Candidate 和 Review、提升 Artifact、推进 Case 状态的唯一机制。 |
| Accepted Artifact | 通过 Gate、可以成为后续上下文事实的 Artifact。 |
| Task Memory | 已完成 Task 的紧凑语义投影，供依赖 Task 和报告阶段读取。 |
| Runtime Evidence | 检索、计算或编译等确定性操作产生的带 provenance 和 hash 的不可变证据。 |
| Adapter | 将宿主的会话、委派和工具能力映射到 Canonical Core 的实现。 |
| Local Runtime | 执行检索、计算和编译的受控本地环境。 |

这些词不能互换。Candidate 不是已接受事实，Review 不是 Gate，Task Memory 也不是完整执行日志。

## 数据流

```text
Input
  -> Case
  -> Dispatch Context
  -> Actor Attempt
  -> Candidate
  -> Critic Review
  -> Gate
       pass   -> Accepted Artifact -> next Stage or Task
       revise -> new Attempt with latest Candidate and Review
       block  -> Case blocker
  -> Report Gate
  -> LaTeX + compile log + PDF
```

Actor 与 Critic 只产生候选和判断。Gate 才能改变 Case 的持久事实。

## Core Interface

Adapter 通过四个操作使用 Canonical Core：

```text
open(case_id, input_manifest?)
dispatch(case_id, role, task_id?)
gate(case_id, attempt_id, review, expected_revision)
inspect(case_id)
```

### `open`

创建新 Case 或读取现有 Case。新 Case 必须提供 input manifest 和 Case Policy，`open` 负责固化输入、Rubric、`case.json` 和初始 `state.json`；现有 Case 省略这些参数，并先通过 schema 校验。Intake 负责发现和整理输入，但不独立写 Case 状态。

### `dispatch`

根据当前 state、Role Recipe、任务 DAG 和 Accepted Artifact Index 创建唯一 Actor Attempt，并写入 `context.json`。`dispatch` 是动作，Attempt 是其持久产物，`attempt_id` 是该产物的标识。Critic 不创建第二个 Attempt；它从同一 Manifest 的 Review Section、Candidate expected outputs 和 Rubric 重建 Fresh Role Session。`dispatch` 不能把未通过 Gate 的 Candidate 当作普通上游事实，也不修改 `state.json`。

### `gate`

验证调用方提供的 `expected_revision`、Context Manifest 的 read set、Candidate、Review 和 Artifact Schema。`expected_revision` 用于当前状态写入的 compare-and-swap；Manifest 的 `base_revision` 只记录 Candidate 基于哪个状态创建。只有 `pass` 可以提升 Artifact 和推进 Stage；`revise` 创建后续修订条件；`block` 记录阻塞原因。

### `inspect`

只读返回 Case 状态、Accepted Artifact Index、从 attempt 目录推导的 active attempts、blockers 和完成证据。完成证据由当前文件和完成规则实时计算，不保存为第二份状态。`inspect` 不能修复或推进状态。

## 状态所有权

`state.json` 是 Case 的唯一机器状态。`open` 只创建初始状态；创建完成后，只有 Gate 能修改：

- `stage`：`analysis`、`modeling`、`solving` 或 `reporting`。
- `status`：`prepared`、`running`、`blocked`、`failed` 或 `completed`。
- `current_wave`：只在 Solving 使用并从 `1` 开始，其他 Stage 为 `null`。
- `accepted_artifacts`：Accepted Artifact Index。
- `revision_budget`：Analysis、Modeling、每个 Solving Task 和 Reporting 的剩余修订次数。
- `blockers`：追加式阻塞记录及其解决状态。

初始 state 的 `revision` 为 `0`。每次成功 Gate 都增加 `revision`。Gate 必须比较调用方的 `expected_revision` 与当前 revision，拒绝并发覆盖；随后逐项验证 Manifest 中的 required read hash 仍与输入快照、Runtime Evidence 或 Accepted Artifact Index 一致。这样，同一 wave 基于相同 `base_revision` 生成的独立 Task 可以依次 Gate，而相关上游变化仍会使 Candidate 失效。

状态写入使用临时文件和原子替换。Candidate、Review 和日志不能通过修改文件名或目录位置绕过 Gate。

Revision Budget 表示初稿之后允许的修订次数。`open` 从 Case Policy 初始化 Analysis、Modeling 和 Reporting 预算；Modeling Gate 接受 DAG 时，按 Case Policy 的 `solving_per_task` 为每个 Task 建立独立预算。Adapter 不能自行选择不同默认值。

## Fresh Context 重建

角色之间不直接传递聊天。每次派发都从本地持久事实重建上下文：

```text
Current State
  + Role Recipe
  + Current Task
  + Immutable Input and Runtime Evidence
  + Accepted Upstream Artifacts
  + Direct Dependency Task Memory
  + Latest Review for Revision
  -> Context Manifest
```

Manifest 内联少量控制信息，使用 Case-root-relative path 引用大型内容。Adapter 将 Manifest 路径交给 Fresh Role Session，Role 再读取必需文件。

上下文不能默认包含：

- 前序 Role 的完整聊天。
- 无关兄弟 Task。
- 全部失败 Attempt 历史。
- Orchestrator 的隐藏推理。
- 未通过 Gate 的 Candidate，除非当前任务是针对该 Candidate 的 Critic 或修订。

## Role Recipes

| Role | 必需上下文 | 主要输出 |
|------|------------|----------|
| Analyst | 输入 manifest、题目、附件、用户约束。 | 问题理解、任务分解、任务 DAG。 |
| Modeler | 输入、Accepted Problem Analysis、方法检索结果。 | 建模方案、变量、假设、公式和任务要求。 |
| Solver | 当前 Task、Accepted Modeling Scheme、直接依赖 Task Memory。 | 代码、执行结果、图表和 Task Memory。 |
| Critic | 同一 Attempt Manifest 的 Review Section、Candidate expected outputs、Rubric 和必要上游约束。 | `pass`、`revise` 或 `block` Review。 |
| Writer | Accepted Artifact Index、Task Memories、报告要求。 | 大纲、符号表、LaTeX 和报告 Candidate。 |

Adapter 可以改变宿主中的 Role 名称，但不能改变这些语义职责。

## HMML Method Retrieval

MM-Agent 的 Modeling Stage 需要从 HMML 获得候选方法。Canonical Core 规定检索结果必须记录知识源标识、知识源版本或 hash、检索模式、候选方法、分数和查询；具体 embedding 模型、词法算法和执行语言属于 Local Runtime。

Modeler 将 HMML 结果作为证据，而不是结论。最终方法选择、适用条件和拒绝其他候选的理由必须进入 Modeling Artifact。

## Attempt 与 Review

每次 Attempt 使用唯一目录并保存生成它的 Context Manifest。修订创建新 Attempt，不覆盖旧 Candidate。

Review 必须包含：

- `verdict`：`pass`、`revise` 或 `block`。
- `findings`：发现的问题。
- `required_fixes`：下一次 Attempt 必须处理的修改。
- `evidence`：支持判断的 Candidate 或上游路径。

Critic 负责语义判断。Gate 负责 schema、文件、hash、路径、revision 和完成条件。两者都通过后，Candidate 才能提升。

`attempts/<scope>/<attempt-id>/` 中的 scope 只能是 `analysis`、`modeling`、`solving/<task-id>` 或 `reporting`。Attempt 的 Review 写入后即结束；`inspect` 通过是否存在有效 Review 推导 active attempts，不在 `state.json` 维护第二份列表。同一 scope 存在 active Attempt 时，`dispatch` 拒绝创建第二个 Attempt。

Role Session 崩溃后，Orchestrator 可以使用同一 Manifest 恢复该 Attempt，或提交带 Runtime Evidence 的 `block` Review 使 Gate 关闭它。系统不按 wall-clock TTL 猜测 Attempt 已失效。

## DAG 与 Task Memory

任务依赖由语义 Role 明确提出，Core 只验证：

- Task ID 唯一。
- 所有依赖均引用存在的 Task。
- 图无环。
- 当前 wave 的所有依赖已经 Accepted。

同一 wave 的 Task 可以并行产生 Candidate，但 Gate 必须以可检测冲突的方式串行推进 state。

Task Memory 保存依赖方真正需要的紧凑结果：任务描述、建模方法、结果解释，以及代码、执行结果和图表的路径。完整代码和日志留在相邻 Artifact 中，按需读取。

## Actor-Critic

需要语义质量控制的 Stage 和 Task 使用以下循环：

```text
Actor Candidate
  -> Fresh Critic
  -> Review
  -> Gate
  -> Accepted or Revised Attempt
```

Revision Budget 是 Case 状态的一部分。预算表示初稿之后还能创建多少个修订 Attempt：处理 `revise` 时，剩余预算大于 `0` 才能扣减并允许下一 Attempt；预算已经为 `0` 时，Gate 保存 Review 并将 Case 设为 `failed`。系统不能静默接受低质量 Candidate。

Critic 判断仍可能出错。用户或后续监督发现 Accepted Artifact 错误时，当前 Case 保留历史事实和反馈；修正通过显式创建新 Case，并把旧 Case 和反馈列入新输入。系统不能直接编辑 stable artifact 或历史 Review。

## 四阶段不变量

### Problem Analysis

必须产生问题理解、任务清单和无环 DAG。后续阶段不能使用只存在于分析聊天中的目标、假设或约束。

### Mathematical Modeling

必须记录方法候选、最终方法选择、变量、假设、公式和求解要求。检索相似度只提供证据，不能代替语义选择。

### Computational Solving

必须记录可重复执行的代码和执行证据，或记录有明确理由的直接推导。每个 Accepted Task 产生 Task Memory。

### Solution Reporting

必须从 Accepted Artifacts 生成报告。Writer 不得把未验收 Candidate 写入最终论文。

## Stage 推进

Gate 在每次 `pass` 后检查当前 Stage 的必要 Artifact：

1. Analysis 的必要 Artifact 全部 Accepted 后，`stage` 进入 `modeling`。
2. Modeling 的必要 Artifact 和有效 DAG 全部 Accepted 后，`stage` 进入 `solving`，`current_wave` 设为 `1`。
3. 当前 Solving wave 的所有 Task Accepted 后，`current_wave` 增加；所有 Task Accepted 后，`stage` 进入 `reporting`，`current_wave` 设为 `null`。
4. Reporting 的必要 Artifact 和最终完成条件全部通过后，`status` 设为 `completed`。

`block` 将 `status` 设为 `blocked`，但保留当前 `stage` 和 `current_wave`。Blocker 是追加式记录。后续同 scope Actor Attempt 可以通过 `resolves_blocker` 引用一个未解决 blocker ID；该 Attempt 成功 Gate 后写入 `resolved_at`，没有未解决 blocker 时将 `status` 恢复为 `running`。Case blocked 时，不依赖该 blocker 的同 wave sibling Task 仍可 Gate，但 wave 不能在 blocker 解决前推进。

第一次成功 Gate 后，未完成且未阻塞的 Case 将 `status` 从 `prepared` 改为 `running`。`failed` 表示修订预算耗尽或存在不可恢复的输入/运行错误；它只能通过显式创建新 Case 或协议迁移重新开始。

## 完成规则

Case 只有在以下条件全部成立时才能完成：

- 四阶段必需 Artifact 全部 Accepted。
- 所有必需 Task 已 Accepted 或有显式允许的非计算结果。
- `report/main.tex` 存在。
- `report/compile.log` 存在。
- `report/report.pdf` 存在且非空。

完成状态必须由最终 Gate 写入 `status: "completed"`。Adapter 的成功消息、模型回答或进程 exit code 都不能单独代表 Case 完成。

## 恢复与失败

- Role Session 失败且未产生 Candidate 时，state 不推进；Orchestrator 可以恢复同一 Attempt，或先用 `block` Review 关闭它再创建新 Attempt。
- Review 要求修订时，下一 Context 只增加最新 Candidate 和最新 Review。
- 上游 Artifact hash 改变时，依赖它的未完成 Attempt 失效。
- Orchestrator 或宿主重启后，Adapter 通过 `inspect` 恢复，不依赖聊天摘要。
- 两个 Orchestrator 同时推进同一 Case 时，错误 `expected_revision` 的 Gate 必须失败。
- Role Session 或 Local Runtime 超时、崩溃或返回非成功执行证据时，Candidate 不能通过 Gate；具体 timeout 和 backoff 由 Adapter 或 Local Runtime 配置。
- `open` 遇到未知 `schema_version` 时必须拒绝运行并要求显式迁移，不能由 Role 原地猜测修改。
- `failed` Attempt 的 Candidate、Context Manifest、Runtime Evidence 和 Review 保留在 attempt 目录中，Core 不自动删除审计证据。

## Adapter Contract

Adapter 必须提供：

- Fresh Role Session。
- 对 Case 文件的受控读写。
- 对 Core 四个操作的调用方式。
- 结构化 Review 回传。
- 重启后从本地 state 恢复的入口。

Adapter 不得：

- 把宿主聊天当作唯一 Case 状态。
- 允许 Role 绕过 Gate 写 stable artifacts。
- 用平台专用路径替代 Case 相对路径。
- 在 Core 中加入只为一个宿主服务的控制、角色绑定或分发概念。

本文件定义机制和不变量。Case 路径、JSON 字段和时间格式以 [Artifact 协议](../context/artifact-protocol.md) 为唯一来源。
