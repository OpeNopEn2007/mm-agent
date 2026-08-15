# OpenCode Plugin Harness

根目录 [README.md](../../README.md) 是完整产品与机制设计入口；宿主无关机制固定在 [Canonical Core](canonical-core.md) 与 [Artifact 协议](../context/artifact-protocol.md)。本文只固定 OpenCode Adapter 的实现接口和不变量，不重新定义 Case schema、状态推进或 Context Manifest。多宿主安装与分发架构（仅设计、不触当前实现）见 [多宿主安装架构](multi-host-install.md)。

## 交付形态

v1 发布 npm 包 `mm-agent`，包含 Plugin、安装器、Skills、Agent prompt、Python runtime 定义、HMML 资产和报告模板。

OpenCode Plugin 通过以下宿主机制接入：

| OpenCode 机制 | mm-agent 用途 |
|---------------|---------------|
| `config` hook | 注入 `mm-analyst`、`mm-modeler`、`mm-solver`、`mm-writer`、`mm-critic`。 |
| Plugin tool registry | 注册正式运行面六个 `mm_agent_*` Tools：`check`、`prepare`、`flow`、`hmml`、`compute`、`compile`。 |
| built-in `task` | 为每次阶段或任务派发创建 fresh child session。 |
| Skill discovery | 安装后的 `mm-agent` Skill 提供 `/mm-agent`。 |

## Plugin 接口

目标导出结构：

```ts
export default async function mmAgentPlugin(ctx: PluginInput): Promise<Hooks>
```

Plugin 初始化时只做三件事：

1. 解析 package assets 和平台 cache 路径。
2. 注册 hidden Agents 和 Tools。
3. 建立正式 Flow 的进程内待执行 directive registry 和 Case mutex registry。

模型下载、Python 环境完善和 TeX 检查由用户调用 `/mm-agent` 后的 preflight 驱动，不能发生在 Plugin import 阶段。Plugin API 没有受支持的接口从 hook 直接调用 built-in `task`；Skill 必须机械发出一次 Task，hook 只能在原调用中校正参数。

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

`mm_agent_check` 只报告 HMML index/cache 的当前可用性与修复分类；embedding 模型选择和最终索引构建属于 HMML 里程碑，不能由 preflight 提前完成。

当前实现支持 `all`、`environment`、`case`、`hmml` 和 `tex` scope。完整检查项固定为 Node、OpenCode 与 Plugin API 兼容性、uv、禁止下载/禁止 project discovery 的 Python 3.12 探测、`runs/` 独占写入/删除探针、HMML candidate index、MM-Agent 专用 cache，以及 `templates/cumcmthesis/example.tex` 的真实 XeLaTeX 编译和非空 PDF 字节数。版本字符串不能替代模板编译；Python 探测会移除 `.venv`、Conda 和用户 site 环境影响，不安装或修改任何 Python。

### `mm_agent_prepare`

解析显式输入或 `problems/`，构造 input manifest 与 Case Policy，并且只通过 `CaseContextStore.open` 创建 `runs/<case-id>/input/manifest.json`、`case.json` 和初始 `state.json`。Core `open` 把输入副本、revision budget 与四份 Rubric 快照固化到 Case；Intake 不直接写 Case 状态，不修改源文件，也不保留可被后续访问的用户原始绝对路径。

Tool 返回 `{ ok: true, result }` 或 `{ ok: false, error }`。错误包含稳定 code、可行动 message、`automatic / user / none` repair 和是否需要用户输入；无效 Case ID、空/缺失输入、linked input、linked/unwritable `runs/`、冲突输入或 Policy、源文件在发现与固化之间变化，以及损坏的 Rubric 都不能发布部分 Case。恢复已有 Case 的调用只传 `case_id`，持久化 input manifest、policy、state revision 和 revision budget 权威，不接受新 input/policy/budget 覆盖，也不重新读取原始来源。

### `mm_agent_flow`

正式用户路径只暴露 `advance` 和 `submit_review` 两个 action：

```ts
type FlowInput =
  | { action: "advance"; caseId: string }
  | {
      action: "submit_review"
      caseId: string
      verdict: "pass" | "revise" | "block"
      findings: string[]
      requiredFixes: string[]
      evidence: string[]
    }
```

`advance` 从磁盘权威事实推导下一 Actor/Critic directive；`submit_review` 只接收 Critic 的四个语义字段。Flow 生成 `schema_version`、`attempt_id`、`reviewed_at`、`expected_revision` 等机器字段，执行 Review evidence allowlist 校验，再调用内部 Core Gate，并立即从 fresh state 路由下一动作。Gate 在任何 mutation 前严格校验 candidate、Runtime Evidence、expected outputs、promotion 和 hash；`revise` 只有校验通过才创建下一 Attempt，`pass` 缺失文件返回 `SCHEMA_INVALID`，两者都不以不完整文件推进 state。Critic 对需要计算的 Solver 可读取 `execution-result.json` 引用的 raw compute payload 做语义核验；direct synthesis 分支只校验 execution-result 的 `path`/hash，不把 artifact 当作 raw payload 解析。Evidence 只引用声明的 `execution-result.json`，不得出现 manifest/context/目录/`runs/<case-id>/` 前缀或自然语言。返回值为 `task`、`blocked`、`failed` 或 `completed`。

### 内部 `mm_agent_case` Core seam

`mm_agent_case` 不注册到模型可见 Tool registry。它是 Flow、Golden runner 和兼容测试使用的内部 Core seam，使用 discriminated union 调用 `CaseContextStore`：

```ts
type CaseAction =
  | { action: "open"; caseId: string; inputManifest?: InputManifest; policy?: CasePolicy }
  | { action: "dispatch"; caseId: string; role: Role; taskId?: string; baseRevision?: number }
  | { action: "gate"; caseId: string; attemptId: AttemptId; review: Review; expectedRevision: number }
  | { action: "inspect"; caseId: string }
```

四个 action 直接映射 Core Interface：

- `open` 既能根据 `inputManifest` 与 `CasePolicy` 固化输入副本、Rubric 快照、`case.json` 与初始 `state.json`，也能仅凭 `caseId` 先做 schema 校验以恢复已有 Case；已有 Case 收到新的 intake 参数时必须返回冲突，不得覆盖不可变事实，持久化 input/policy/state revision/budget 继续作为权威。
- `dispatch` 为 Actor 创建唯一 Attempt，写入 `context.json`；`baseRevision` 仅作为 Manifest 的审计字段，不参与 Gate 的 compare-and-swap。
- `gate` 必须携带调用方的 `expectedRevision`，由 Core 拒绝并发覆盖；所有 verdict 先严格验证 candidate/runtime；`revise` 验证通过后才创建下一 Attempt，`pass` 缺少 expected/promotion 文件返回 `SCHEMA_INVALID`，只有成功 `pass` 才能提升 Artifact 并推进 Case 状态。
- `inspect` 是只读操作，返回 `state.json`、accepted artifact index、由 attempt 目录推导的 active attempts、blockers 和派生 completion evidence，不写任何状态。旧 `schema_version: 1` Case 可在 Flow 恢复时懒生成 `handoff.json`，不改写既有持久 schema。

### `mm_agent_hmml`

输入 query、top-k 和输出路径。输出必须记录 retrieval mode、模型 ID、revision、index hash、分数和降级原因；检索结果不能替代 Modeler 的方法选择。

### `mm_agent_compute`

输入 Case 内工作目录、入口脚本、参数和 timeout。拒绝 Case 外路径，返回执行 manifest，作为 Runtime Evidence 供 Gate 校验。`requires_computation: false` 的 Solver 不伪造 Compute；它把 `execution-result.json` 写成 `kind: "synthesis"`、`status: "succeeded"`、`exit_code: 0`，`path` 直接指向当前 Attempt `allowed_writes` 内 candidate artifact，并以 `sha256`（可选 `size_bytes`）绑定该 artifact，不要求手写 `evidence/*.json` payload。

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
- `gate` 校验 `promotions` 列表中每个 candidate 路径与 `allowed_writes` 一致，且每个 target 都在当前 scope 的稳定 artifact 白名单内；缺失 expected/promotion 文件或 Runtime Evidence 不合规时返回 `SCHEMA_INVALID`，不写 Review、不创建 Attempt、不改变 state。
- `gate` 只接受 `pass` 提升 Artifact 并推进 Stage；`revise` 仅在严格验证通过后创建下一次 Attempt，`block` 追加 blocker 并保留 stage/wave。
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

正式 `/mm-agent` Skill 只执行固定的宿主原生循环：

```text
mm_agent_flow(advance)
  → OpenCode built-in task（恰好一次）
  → mm_agent_flow(advance)
  → [Actor 完整时] built-in task（fresh mm-critic）
  → mm_agent_flow(submit_review)
```

1. `mm_agent_flow { action: "advance" }` 通过内部 Core `dispatch` 生成唯一 Actor Attempt 和 `context.json`，或恢复已有 active Attempt。
2. Skill 原样机械发出一次 built-in `task`，使用 Flow directive 的 `agent`、`description` 和 `prompt`。
3. `tool.execute.before` hook 在原地校正 Task 参数，并清除 `task_id`、`background`、`command`；这保证调用是 fresh foreground child。Hook 不绕过宿主 API 另起子会话。
4. Agent 只读取 directive 指向的 `context.json` 及其声明文件。Actor 写 candidate；Critic 只返回 `verdict`、`findings`、`required_fixes`、`evidence`，不生成机器字段、不写文件、不 Gate、不委派。
5. Skill 再次调用 Flow。Flow 检查 `expected_outputs` 是否齐全；完整时派同一 Attempt 的 fresh Critic，不创建第二个 Attempt；不完整时恢复同一 Actor。`submit_review` 前后的 Core Gate 会严格验证 candidate/runtime，只有验证通过的 `revise` 才能进入下一 Attempt，缺失文件的 `pass` 返回 `SCHEMA_INVALID`。
6. Skill 把 Critic 四个语义字段提交 `submit_review`。Flow 规范化并校验 evidence，生成 Review 机器字段，调用内部 Core `gate`，再从 fresh state 路由下一 directive 或终态。

首条正式链中的 Solver task 按 DAG 可执行顺序串行运行；DAG 仍记录依赖，但不启用 same-wave 并发。Subagent 不得嵌套委派，持久事实必须写入 candidate artifact 或 Runtime Evidence。

## 权限

Agents 使用静态角色权限和动态 gate 双层控制：

- Actor Agents 只允许写 `runs/**`。
- Critic 不得写项目文件；其 verdict 必须通过 `gate` 落入 `review.json`。
- 进程执行通过 `mm_agent_compute` 和 `mm_agent_compile`。
- Tool 再次验证 resolved path 位于当前 Case。
- `gate` 拒绝 `context.json.allowed_writes` 之外的候选路径，拒绝当前 scope 白名单之外的 promotion target。
- Review evidence 必须是 Case-relative path，并且属于当前 Manifest 的 candidate、review required reads、immutable input/accepted upstream、Rubric，或当前 Attempt 的 Runtime Evidence（包括 `execution-result.json`）并通过 schema 与 hash 校验；Critic 对需要计算的 Solver 可读取 execution-result 引用的 raw compute payload，direct synthesis 只校验 execution-result 的 `path`/hash，不把 artifact 当作 raw payload 解析。Evidence 不得改引 payload，也不得出现 manifest/context/目录/`runs/<case-id>/` 前缀、任意未声明的 `tmp/`、其他 Attempt、其他 Case、stable 文件、绝对路径和自然语言描述。
- Flow 生成的 `runs/<case-id>/handoff.json` 是从 `state.json`、active Attempt、accepted artifacts 和 DAG 派生的交接投影，不是 promotion 或 completion 依据。每次 `advance`、`submit_review` 和恢复都允许覆盖它。

## 安装器

安装器必须显式支持 `install`、`update` 和 `remove`。receipt 至少记录：

```json
{
  "package": "mm-agent",
  "version": "0.1.0",
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

正式运行面正确性不依赖：

- OpenCode compaction hint 或压缩后的聊天摘要；恢复只读取 Case 磁盘事实。
- 独立 MCP server。
- 数据库或向量数据库。
- Plugin import 时联网。
- 归档中的 Claude/Codex Agent、Hook 或 `.planning/`。
- 任何宿主的私有聊天或 memory。

## 兼容与失败边界

- `case.json`、`state.json`、`context.json`、Review 和 Runtime Evidence 的持久 `schema_version: 1` 本轮不变。旧 Case 恢复时由 Flow 懒生成 `handoff.json`，不静默猜测或改写旧文件。
- `block` 只记录当前 Case 的追加式 blocker；正式运行面不自动回滚已接受阶段。输入缺失或 accepted upstream 已错误时，用户需补充事实并创建新 Case，或等待未来显式 reopen/migration 机制。
- Golden runner 仅作为开发期验收工具，通过内部 Core 接口运行；它不进入 npm 包，也不驱动用户 `/mm-agent` 流程。
- npm package 清单以真实 `package.json.files` 为准，不声明或打包不存在的 `schemas/` 目录。

## Spike Gate

完整实现前必须通过 Plugin Spike：

1. npm 包能被 OpenCode 加载。
2. `config` hook 注入一个测试 hidden Agent。
3. 一个自定义 Tool 能读取 `directory` 和 `worktree`。
4. 安装后的 Skill 出现在 slash command 列表。
5. built-in `task` 创建 fresh child session，并能读取项目内 `context.json`。
6. Windows 路径、更新、卸载和 OpenCode 重启均通过。

Spike 之后只保留通过条件对应的代码与测试，临时探针必须删除。
