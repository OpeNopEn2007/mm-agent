# OpenCode Plugin Harness

根目录 [README.md](../../README.md) 是完整产品与机制设计入口；宿主无关机制固定在 [Canonical Core](canonical-core.md) 与 [Artifact 协议](../context/artifact-protocol.md)。本文只固定 OpenCode Adapter 的实现接口和不变量，不重新定义 Case schema、状态推进或 Context Manifest。

## 交付形态

v1 发布 npm 包 `@mm-agent/opencode`，包含 Plugin、安装器、Skills、Agent prompt、Python runtime 定义、HMML 资产和报告模板。

OpenCode Plugin 通过以下宿主机制接入：

| OpenCode 机制 | mm-agent 用途 |
|---------------|---------------|
| `config` hook | 注入 `mm-analyst`、`mm-modeler`、`mm-solver`、`mm-writer`、`mm-critic`。 |
| Plugin tool registry | 注册 6 个 `mm_agent_*` Tools。 |
| built-in `task` | 为每次阶段或任务派发创建 fresh child session。 |
| Skill discovery | 安装后的 `mm-agent` Skill 提供 `/mm-agent`。 |
| compaction hook | 可选注入 active Case 和 `state.json` 路径，不承担恢复正确性。 |

## Plugin 接口

目标导出结构：

```ts
export default async function mmAgentPlugin(ctx: PluginInput): Promise<Hooks>
```

Plugin 初始化时只做三件事：

1. 解析 package assets 和平台 cache 路径。
2. 注册 hidden Agents 和 Tools。
3. 建立进程内的 Case mutex registry。

模型下载、Python 环境完善和 TeX 检查由用户调用 `/mm-agent` 后的 preflight 驱动，不能发生在 Plugin import 阶段。

## Tool 接口

### `mm_agent_check`

输入包含检查范围和可选 Case 路径。输出结构化检查项：

```ts
type CheckResult = {
  ok: boolean
  checks: Array<{
    id: string
    status: "pass" | "warn" | "fail"
    evidence: string
    repair: "automatic" | "user" | "none"
  }>
}
```

### `mm_agent_prepare`

解析显式输入或 `problems/`，创建 `runs/<case-id>/input/manifest.json` 和 `runs/<case-id>/case.json`，把输入副本和 Case Policy（含 revision budget 与四份 Rubric 快照）固化到 Case；不修改源文件，不保留可被后续访问的用户原始绝对路径。

### `mm_agent_case`

使用 discriminated union 暴露四个 action，调用 `CaseContextStore`：

```ts
type CaseAction =
  | { action: "open"; caseId: string; inputManifest?: InputManifest; policy?: CasePolicy }
  | { action: "dispatch"; caseId: string; role: Role; taskId?: string; baseRevision?: number }
  | { action: "gate"; caseId: string; attemptId: AttemptId; review: Review; expectedRevision: number }
  | { action: "inspect"; caseId: string }
```

四个 action 直接映射 Core Interface：

- `open` 既能根据 `inputManifest` 与 `CasePolicy` 固化输入副本、Rubric 快照、`case.json` 与初始 `state.json`，也能省略这些参数并先做 schema 校验以恢复已有 Case。
- `dispatch` 为 Actor 创建唯一 Attempt，写入 `context.json`；`baseRevision` 仅作为 Manifest 的审计字段，不参与 Gate 的 compare-and-swap。
- `gate` 必须携带调用方的 `expectedRevision`，由 Core 拒绝并发覆盖；只有 `pass` 才能提升 Artifact 并推进 Case 状态。
- `inspect` 是只读操作，返回 `state.json`、accepted artifact index、由 attempt 目录推导的 active attempts、blockers 和派生 completion evidence，不写任何状态。

### `mm_agent_hmml`

输入 query、top-k 和输出路径。输出必须记录 retrieval mode、模型 ID、revision、index hash、分数和降级原因；检索结果不能替代 Modeler 的方法选择。

### `mm_agent_compute`

输入 Case 内工作目录、入口脚本、参数和 timeout。拒绝 Case 外路径，返回执行 manifest，作为 Runtime Evidence 供 Gate 校验。

### `mm_agent_compile`

输入 `main.tex` 和输出目录。优先 `latexmk -xelatex`，其次多遍 `xelatex`。返回引擎、命令、exit code、日志和 PDF 路径；未产生非空 PDF 时不能返回成功。

## CaseContextStore

`CaseContextStore` 是 Core 的深模块。调用方不自行拼路径、加载依赖或更新 state。

```ts
interface CaseContextStore {
  open(caseId: string, input?: OpenInput): Promise<CaseSnapshot>
  dispatch(input: DispatchInput): Promise<Dispatch>
  gate(input: GateInput): Promise<GateResult>
  inspect(caseId: string): Promise<CaseSnapshot>
}
```

实现必须保证：

- persisted paths 使用 Case-root-relative path；解析真实路径后再次确认其仍位于 Case 根目录内，拒绝绝对路径、`..` 路径穿越和符号链接逃逸。
- `state.json` 通过 schema validation 后才能读取。
- `dispatch` 只引用 accepted artifacts、Runtime Evidence 和输入快照；Solver 只加载 DAG 直接依赖的 task memory。
- 每个 attempt 使用 `attempts/<scope>/<attempt-id>/` 唯一目录，`attempt-id` 为 `<scope-slug>-<sequence>` 三位序号。
- `gate` 比较调用方 `expected_revision` 与当前 `revision`，并发 stale write 必须失败。
- `gate` 逐项校验 Manifest 的 `required_reads` hash 仍对应输入快照、Runtime Evidence 或 accepted artifact。
- `gate` 校验 `promotions` 列表中每个 candidate 路径与 `allowed_writes` 一致，且每个 target 都在当前 scope 的稳定 artifact 白名单内。
- `gate` 只接受 `pass` 提升 Artifact 并推进 Stage；`revise` 创建下一次 Attempt，`block` 追加 blocker 并保留 stage/wave。
- state 更新使用临时文件和原子替换。
- 唯一 `gate` 可以改变 accepted index、Stage、`current_wave` 和 `revision`。
- 同 scope 存在 `context.json` 但尚未拥有有效 `review.json` 的 Attempt 时，`dispatch` 拒绝创建第二个 Attempt。

## Context Recipe

Context recipe 是代码中的数据映射，不是由 LLM 临时决定的目录扫描：

```ts
type ContextRecipe = {
  role: Role
  resolveReads(snapshot: CaseSnapshot, taskId?: string): ArtifactRef[]
  resolveWrites(snapshot: CaseSnapshot, taskId?: string): string[]
  expectedOutputs(snapshot: CaseSnapshot, taskId?: string): string[]
  promotions(snapshot: CaseSnapshot, taskId?: string): Promotion[]
  acceptance: string[]
}
```

小型控制信息写入 `context.json`。大型输入和成果只写引用、kind 和 hash。Recipe 由五个 Role 共享：

| Role | Required Reads | Allowed Writes |
|------|----------------|----------------|
| Analyst | 输入 manifest、原题、附件、用户约束。 | `attempts/analysis/<attempt-id>/`。 |
| Modeler | 输入、accepted problem understanding、HMML 候选。 | `attempts/modeling/<attempt-id>/`。 |
| Solver | 当前 task、accepted modeling scheme、直接依赖 task memory。 | `attempts/solving/<task-id>/<attempt-id>/`。 |
| Critic | 同一 Attempt Manifest 的 `review` section、candidate `expected_outputs`、阶段 Rubric 和必要上游约束。 | 仅写 `attempts/<scope>/<attempt-id>/review.json`（由 Gate 写入）。 |
| Writer | accepted artifact index、task memories、报告要求。 | `attempts/reporting/<attempt-id>/`。 |

## Agent 派发

`mm-agent` Skill 执行以下宿主原生步骤：

1. 调用 `mm_agent_case` 的 `dispatch` 生成唯一 Actor Attempt 与 `context.json`。
2. 使用 OpenCode built-in `task` 选择 hidden Agent。
3. Prompt 指定 `context.json` 路径和最终返回 schema。
4. 检查预期 candidate 文件与 `expected_outputs` 是否存在。
5. 派发 fresh `mm-critic`，向其交付同一 `context.json` 的 `review` section、candidate expected outputs、Rubric 和必要上游约束，不创建第二个 Attempt。
6. Critic 返回结构化 verdict，主 Agent 将其封装为 `Review` 提交 `gate`，携带 `expectedRevision`。
7. `gate` 返回后，主 Agent 根据 pass / revise / block 决定下一动作。

Subagent 不得嵌套委派。Worker 最终消息只用于当前控制流，持久事实必须写入 candidate artifact。

## 权限

Agents 使用静态角色权限和动态 gate 双层控制：

- Actor Agents 只允许写 `runs/**`。
- Critic 不得写项目文件；其 verdict 必须通过 `gate` 落入 `review.json`。
- 进程执行通过 `mm_agent_compute` 和 `mm_agent_compile`。
- Tool 再次验证 resolved path 位于当前 Case。
- `gate` 拒绝 `context.json.allowed_writes` 之外的候选路径，拒绝当前 scope 白名单之外的 promotion target。

## 安装器

安装器必须显式支持 `install`、`update` 和 `remove`。receipt 至少记录：

```json
{
  "package": "@mm-agent/opencode",
  "version": "1.0.0",
  "plugin_entry": "...",
  "installed_skills": [],
  "files": [{ "path": "...", "sha256": "..." }]
}
```

更新前比较 receipt 和磁盘 hash。用户修改过的已安装文件不能被静默覆盖。卸载只删除 receipt 拥有且 hash 匹配的文件。

## Runtime seam

TypeScript 负责 Plugin、Case、文件和进程编排。Python 3.12 + uv 负责 embedding 和科学计算。两者通过 JSON stdin/stdout 或 manifest 文件交互。

Python runtime 不读取用户 `.venv`。Plugin 通过 `shell.env` 或显式 spawn env 设置 MM-Agent cache、Python 环境和 Hugging Face cache。

## 不依赖项

v1 正确性不依赖：

- OpenCode 实验性 compaction hook。
- 独立 MCP server。
- 数据库或向量数据库。
- Plugin import 时联网。
- 归档中的 Claude/Codex Agent、Hook 或 `.planning/`。
- 任何宿主的私有聊天或 memory。

## Spike Gate

完整实现前必须通过 Plugin Spike：

1. npm 包能被 OpenCode 加载。
2. `config` hook 注入一个测试 hidden Agent。
3. 一个自定义 Tool 能读取 `directory` 和 `worktree`。
4. 安装后的 Skill 出现在 slash command 列表。
5. built-in `task` 创建 fresh child session，并能读取项目内 `context.json`。
6. Windows 路径、更新、卸载和 OpenCode 重启均通过。

Spike 之后只保留通过条件对应的代码与测试，临时探针必须删除。