# Artifact 协议

本协议定义 `runs/<case-id>/` 的持久事实。它服务运行期 Case，不服务项目文档或私人聊天。

[Canonical Core](../architecture/canonical-core.md) 定义宿主无关机制；本文件定义 Case 文件的职责、状态和提升规则。

## 所有权

| 对象 | 创建者 | 可修改者 | 读取者 |
|------|--------|----------|--------|
| `input/` | Core `open` | 无，除非显式迁移 | 所有角色 |
| `case.json` | Core `open` | 无，除非显式迁移 | 所有角色 |
| `state.json` | Core `open` | 仅 Core `gate` | 所有角色 |
| `attempts/**/context.json` | Core `dispatch` | 无，除非显式迁移 | 对应 Actor、Critic、Orchestrator |
| attempt candidate | 对应 Actor | 对应 Actor | Critic、gate |
| `review.json` | Core `gate` | 无，除非显式迁移 | Orchestrator、下一 attempt |
| `artifacts/`、`tasks/`、`report/` | `gate` 提升 candidate | 仅后续成功 gate 替换 | 下游 Role、用户 |
| `feedback/` | 用户或 Orchestrator | 用户或 Orchestrator | 后续 Case 分析 |

Actor、Critic 和 Orchestrator 都不能直接修改 `state.json` 或 stable artifact 路径。

## Case 目录

```text
runs/<case-id>/
├── case.json
├── state.json
├── handoff.json                 # Flow 派生的恢复投影，不是权威状态
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

所有 `*_at` 时间戳使用 UTC RFC 3339 格式。所有 JSON 顶层对象都包含整数 `schema_version`。`open` 遇到未知版本时必须拒绝，并要求显式迁移。

## `case.json`

`case.json` 描述不可变的 Case 身份和输入来源。Intake 发现并整理输入，随后由 `open` 一次性固化输入副本、manifest、`case.json` 和初始 `state.json`：

```json
{
  "schema_version": 1,
  "case_id": "mmb-2024-c",
  "created_at": "2026-07-16T00:00:00Z",
  "input_manifest": "input/manifest.json",
  "source_kind": "explicit-path",
  "policy": {
    "revision_budget": {
      "analysis": 2,
      "modeling": 2,
      "solving_per_task": 2,
      "reporting": 2
    },
    "rubrics": {
      "analysis": {
        "path": "input/policy/rubrics/analysis.md",
        "sha256": "..."
      },
      "modeling": {
        "path": "input/policy/rubrics/modeling.md",
        "sha256": "..."
      },
      "solving": {
        "path": "input/policy/rubrics/solving.md",
        "sha256": "..."
      },
      "reporting": {
        "path": "input/policy/rubrics/reporting.md",
        "sha256": "..."
      }
    }
  }
}
```

`input/manifest.json` 对每个源文件记录来源标签、Case 内副本路径、大小和 SHA-256。来源标签只用于展示，不能作为后续文件访问路径。源文件不存在或 hash 变化不改变已创建 Case 的输入副本。`policy` 固化本次运行的预算和 Rubric 快照，Adapter 不能在 Case 创建后替换它。

## `handoff.json`

`handoff.json` 是正式 Flow 从 `state.json`、active Attempt 的 `context.json`、accepted artifacts、Task DAG 和 Runtime Evidence 派生的交接投影。它服务恢复和人类检查，不是第二套状态机，也不能作为 promotion、Gate 或 completion 的依据。Flow 每次 `advance`、`submit_review` 和恢复都可以原子覆盖它；旧的 `schema_version: 1` Case 在首次恢复时懒生成该文件，不改写 `case.json`、`state.json` 或既有 Attempt。

```json
{
  "schema_version": 1,
  "case_id": "mmb-2024-c",
  "status": "awaiting_actor",
  "current_agent": "mm-modeler",
  "next_agent": "mm-critic",
  "attempt_id": "modeling-001",
  "context_path": "attempts/modeling/001/context.json",
  "required_reads": [],
  "expected_outputs": [],
  "updated_at": "2026-07-16T00:00:00Z"
}
```

新会话仍以权威 Case 文件为准：恢复调用只传 `case_id`，持久化的 input manifest、policy、state revision 和 revision budget 不接受新参数覆盖；输出不完整时恢复同一 Actor/Manifest，输出完整但没有 Review 时派同一 Attempt 的 fresh Critic，没有 active Attempt 时才 dispatch 下一 Actor。Case completed 只返回最终报告，不重派 Agent。

## `state.json`

`state.json` 是唯一的机器状态。它至少包含：

```json
{
  "schema_version": 1,
  "case_id": "mmb-2024-c",
  "revision": 8,
  "stage": "solving",
  "status": "running",
  "current_wave": 2,
  "accepted_artifacts": [
    {
      "kind": "modeling-scheme",
      "path": "artifacts/modeling-scheme.md",
      "sha256": "...",
      "accepted_at": "2026-07-16T00:00:00Z"
    }
  ],
  "revision_budget": {
    "analysis": 2,
    "modeling": 2,
    "solving": {
      "task-01": 2,
      "task-02": 1,
      "task-03": 2
    },
    "reporting": 2
  },
  "blockers": []
}
```

`stage` 只能是 `analysis`、`modeling`、`solving` 或 `reporting`。`status` 只能是 `prepared`、`running`、`blocked`、`failed` 或 `completed`。`current_wave` 只在 Solving 使用，从 `1` 开始；其他 Stage 为 `null`。

初始 `revision` 为 `0`。`dispatch` 不修改 state；每次成功 gate 将 `revision` 增加 `1`。`open` 从 `case.json.policy` 初始化 Analysis、Modeling 和 Reporting 预算；Modeling Gate 接受 DAG 时，使用 `solving_per_task` 为每个 Task 创建预算。

Blocker 对象结构如下：

```json
{
  "id": "blocker-001",
  "scope": "solving/task-03",
  "attempt_id": "solving-task-03-001",
  "reason": "required dataset is missing",
  "created_at": "2026-07-16T00:00:00Z",
  "resolved_at": null
}
```

Gate 对 `block` 追加 blocker 并设置 `status: "blocked"`。后续 Context Manifest 可以通过 `resolves_blocker` 引用 blocker ID；该 Attempt 成功 Gate 后填写 `resolved_at`。没有未解决 blocker 时，Gate 将 status 恢复为 `running`。

## Context Manifest

`attempts/<scope>/<attempt-id>/context.json` 是一次 Actor Attempt 及其 Critic Review 的可审计输入清单。`dispatch` 是创建动作，Attempt 是持久产物，`attempt_id` 是产物标识。scope 只能是 `analysis`、`modeling`、`solving/<task-id>` 或 `reporting`。Manifest 不复制 Markdown、数据或代码内容。

目录中的 `<attempt-id>` 使用三位递增序号，例如 `001`。Manifest 的全局 `attempt_id` 使用 `<scope-slug>-<sequence>`，其中 scope 中的 `/` 转为 `-`，因此 `solving/task-03` 的第一次 Attempt 为 `solving-task-03-001`，路径为 `attempts/solving/task-03/001/`。

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
      "candidate": "attempts/solving/task-03/001/figures/",
      "target": "tasks/task-03/figures/",
      "required": false
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

`dispatch` 根据固定 role recipe 生成 manifest：

| Role | Required Reads |
|------|----------------|
| `analyst` | 输入 manifest、原题、附件、用户约束。 |
| `modeler` | 输入、accepted problem understanding、HMML 结果。 |
| `solver` | 当前任务、accepted modeling scheme、DAG 直接依赖的 task memory。 |
| `critic` | Candidate、阶段 Rubric，以及同一 Manifest 外层 `required_reads` 指向的必要上游 Accepted Artifact。 |
| `writer` | accepted artifact index、task memory、报告要求。 |

Actor Role Session 最终消息只能报告 `status`、`output_paths` 和 `unresolved_issues`。领域结论必须位于 Candidate Artifact。Critic 使用同一 Manifest 的 `review` section、`expected_outputs`、Rubric 和上游约束重建 Fresh Role Session，不创建第二个 Attempt。

## Attempt 与 Review

每个 attempt 目录只代表一次候选。每次修订创建新的 attempt ID，不覆盖先前 candidate。

Critic 使用结构化 verdict：

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

`verdict` 只能是 `pass`、`revise` 或 `block`。`review.json` 在 gate 验证结构后写入 attempt 目录。下一次 revise attempt 只读取最近 candidate、最近 review 和仍然有效的上游 accepted artifacts。

同一 scope 存在未写入有效 Review 的 Attempt 时，`dispatch` 拒绝创建第二个 Attempt。Role Session 崩溃后，Orchestrator 可以恢复该 Attempt，或提交引用 Runtime Evidence 的 `block` Review。Core 不使用 TTL 自动删除 Attempt。

### Review Evidence allowlist

Flow 在调用 Gate 前把 Critic 的每条 evidence 规范化为 Case-relative path，并要求它属于当前交接声明的合法集合：

1. 当前 Manifest 的 candidate / `review.required_reads`；目录声明允许其真实后代文件。
2. Manifest `required_reads` 中的 immutable input 或 accepted upstream artifact。
3. 当前 Manifest 的 Rubric。
4. 当前 Attempt 的 Runtime Evidence（包括 candidate `execution-result.json`）以及通过 schema 和 SHA-256 校验的引用文件；正式 synthesis producer 不要求手写 `evidence/*.json` payload，旧版 envelope 在兼容校验通过时仍可读取。

Evidence 必须非空；`pass` 至少引用一个 candidate，`block` 在没有 candidate 时必须引用有效失败 Runtime Evidence。Critic 对需要计算的 Solver 可读取 `execution-result.json` 引用的 raw compute payload 做语义核验；`requires_computation: false` 的 direct synthesis 分支只校验 execution-result 的 `path`/hash，不把 artifact 当作 raw payload 解析。正式 producer 的 evidence 只引用声明的 `execution-result.json`；旧版 Runtime Evidence envelope 仍可在 schema/hash 兼容校验通过时读取。manifest、context、目录、`runs/<case-id>/` 前缀和自然语言均不合法。绝对路径、`..` 穿越、未声明的 `tmp/`、其他 Attempt、其他 Case、任意未声明 stable 文件和自然语言描述全部拒绝。仅“Case 内存在”不构成合法 evidence。

## Artifact 提升

`gate` 必须按以下顺序执行；任何 Candidate、Runtime Evidence、expected output、promotion、路径或 hash 校验失败都返回 `SCHEMA_INVALID`，不写 Review、不创建新 Attempt、不提升 Artifact、不改变 state：

1. 读取并验证 `state.json`、manifest、review 和 candidate schema。
2. 确认调用方的 `expected_revision` 等于当前 state revision。
3. 逐项确认 manifest 的 required read path 与 hash 仍匹配输入快照、Runtime Evidence 或 Accepted Artifact Index。
4. 确认 candidate 均位于 `allowed_writes` 中，所有 expected output 存在且 hash 可计算；每个 promotion target 都属于当前 scope 的 stable artifact 路径。
5. 确认 evidence allowlist、Runtime Evidence schema/hash 和本次 verdict 的严格语义条件。
6. 将 review 写入 attempt。
7. 对 `pass`，复制或原子替换 stable artifact，并将 path 与 hash 写入 accepted index；缺失 expected/promotion 文件保持 `SCHEMA_INVALID`，不推进状态。
8. 对 `revise`，保留已验证的 attempt；剩余 revision budget 大于 `0` 时扣减并创建下一 Attempt，已经为 `0` 时设置 `status: "failed"`。
9. 对 `block`，追加 blocker，保留当前 stage 和 wave，并设置 `status: "blocked"`。
10. 检查 Stage 推进、blocker 解决和最终完成条件。
11. 将 revision 增加 `1`，使用临时文件和原子替换写入更新后的 `state.json`。

错误 `expected_revision` 的 gate 必须失败，不得覆盖新状态。Context Manifest 的 `base_revision` 仅用于审计，不要求在 gate 时仍等于当前 revision。Core 保留同一 wave 并行 Attempt 的兼容能力，但正式 `/mm-agent` 首条纵向链按 DAG 可执行顺序串行运行；并发不是正式用户路径的前置验收条件。

Stage 推进规则：

1. Analysis 必需 Artifact 全部 Accepted 后进入 Modeling。
2. Modeling 必需 Artifact 和有效 DAG 全部 Accepted 后进入 Solving，`current_wave` 设为 `1`。
3. 当前 wave 的 Task 全部 Accepted 后推进 wave；全部 Task Accepted 后进入 Reporting，`current_wave` 设为 `null`。
4. Reporting 必需 Artifact 和完成条件全部通过后设置 `status: "completed"`。

第一次成功 gate 后，未完成且未阻塞的 Case 从 `prepared` 进入 `running`。`failed` 表示修订预算耗尽或不可恢复的输入/运行错误，不能通过普通 dispatch 继续。

Case blocked 时，不依赖 blocker 的同 wave sibling Task 仍可 Gate；wave 不能在 blocker 解决前推进。`resolves_blocker` 必须引用同 scope 的一个未解决 blocker，Critic Session 不能设置它，一个 blocker 只能由第一个成功 Gate 的 Actor Attempt 解决。正式 `/mm-agent` 不自动回滚已接受阶段；若 blocker 暴露 immutable input 缺失或 accepted upstream 错误，用户应补充事实并创建新 Case，或等待未来显式 reopen/migration 机制，不能让模型原地改写 stable artifact。

Promotion target 按 scope 固定：

| Scope | 允许的 Stable Target |
|-------|----------------------|
| `analysis` | `artifacts/problem-understanding.md`、`artifacts/tasks.json`、`artifacts/task-graph.json`。 |
| `modeling` | `artifacts/modeling-scheme.md` 和 `tasks/<task-id>/retrieved-methods.json` 等任务级建模 Artifact。 |
| `solving/<task-id>` | `tasks/<task-id>/code/`、`figures/`、`execution-result.json`、`memory.json`。 |
| `reporting` | `report/outline.md`、`notation.md`、`main.tex`、`compile.log`、`report.pdf`。 |

Gate 拒绝当前 scope 白名单之外的 promotion target。

`tasks.json` 与 `task-graph.json` 的 Task ID 必须匹配 `[a-z0-9][a-z0-9-]{0,63}`；两者的 Task ID 集合必须完全相同。DAG 只列出 Modeling 后由 `mm-solver` 执行的问题域求解任务，不把阶段或 Flow/Writer/Critic 编排伪装成 Task。

### 非计算 Solver 的 synthesis Evidence

当 Task 的 `requires_computation` 为 `false` 时，Solver 仍必须写入当前 Attempt `allowed_writes` 内的 candidate artifact，并将同一 Attempt 的 `execution-result.json` 作为正式 Runtime Evidence：其 `kind` 为 `synthesis`、`status` 为 `succeeded`、`exit_code` 为 `0`，`path` 直接指向该 candidate，`sha256` 等于 candidate hash，可带 `size_bytes`。该分支不要求手写 `evidence/*.json` payload；Gate 以 execution-result、路径和 hash 校验 synthesis 合法性。

## Task Memory

每个 accepted Solver 任务在 `tasks/<task-id>/memory.json` 写入紧凑投影（无论是成功 Compute 还是合法 synthesis）：

```json
{
  "schema_version": 1,
  "task_id": "task-03",
  "task_description": "...",
  "modeling_method": "...",
  "result_interpretation": "...",
  "execution_result": "tasks/task-03/execution-result.json",
  "code_outputs": ["tasks/task-03/code/solve.py"],
  "figures": ["tasks/task-03/figures/result.png"]
}
```

后续 Solver 默认读取直接依赖的 task memory。它需要验证细节时，再按 manifest 显式读取完整代码或结果。

## 阶段产物

| 阶段 | 必要 stable artifact |
|------|----------------------|
| Problem Analysis | `problem-understanding.md`、`tasks.json`、`task-graph.json`。 |
| Mathematical Modeling | `modeling-scheme.md`、任务级检索结果与模型 artifact。 |
| Computational Solving | 任务代码、`execution-result.json`、图表和 `memory.json`。 |
| Solution Reporting | `outline.md`、`notation.md`、`main.tex`、`compile.log`、`report.pdf`。 |

## 完成规则

Case 只有在以下条件全部成立时才能设置 `status: "completed"`：

- 四阶段的必需 stable artifact 均在 accepted index 中。
- 每个需要计算的任务有成功 Compute execution manifest；`requires_computation: false` 的任务有成功 synthesis `execution-result.json`，其 candidate 路径和 hash 通过 Gate 校验。
- `report/main.tex` 存在。
- `report/compile.log` 存在。
- `report/report.pdf` 存在且非空。

人类反馈保存到 `feedback/feedback.md`，使用自然语言记录 final report feedback、suspected failures、stage notes 和 next adjustments。它不改变当前 Case 已接受事实。只有当新 Case 显式把旧 Case 和反馈列入 input manifest 或约束时，Role Recipe 才能读取它。

`inspect` 返回的完成证据由本节规则和当前文件实时推导，不保存在 `state.json`。失败 Candidate、Context Manifest、Runtime Evidence 和 Review 均保留在 attempt 目录，不自动清理。
