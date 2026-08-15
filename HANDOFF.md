# HANDOFF.md

本文件记录项目级交接状态，不代替 Case 内的 `state.json`、Attempt、Review 或 Runtime Evidence。字段级协议见 [Artifact Protocol](docs/context/artifact-protocol.md)，正式运行面见 [formal-runtime-convergence](docs/architecture/formal-runtime-convergence.md)。不要把外部题目、Case 路径、PDF、trace、provider 凭据或用户数据写入本文件。

## 当前交接状态

- 工作树：`feat/opencode-plugin-spike`，基线 HEAD 为 `7e33dd8`；本里程碑改动尚未提交。没有在途 Agent、后台 OpenCode 进程或需要等待的外部操作。
- 脏改动分类：所有已修改和未跟踪文件均属于正式运行面收敛、Core Gate 修复、正式 Flow/Agent/Skill、Golden 开发期适配、回归测试与文档同步；不要把它们误当作可清理的生成物，也不要回滚到 checkpoint。
- 最新可验证候选：实际 `npm pack` 为 122 files、2,185,700 bytes、SHA-1 `042e284b2d7d6ac6b7b8f1eac4cf546bbc8a00d8`、SHA-256 `d5e011645eaf1899aac2c6ae94a85935ccd1a1e4040ed51a8a52798d899156f4`。该包已在隔离目录安装，确认含 `dist/runtime/formal-runtime-coordinator.js` 与四个 Skill；未 publish。
- 最新定向修复：`revise` 在 Review/Manifest/read-set/evidence/promotion contract 验证后立即创建下一 Attempt，`pass` 仍严格验证 Candidate 和 Runtime Evidence。`requires_computation: false` 的 Solver 正式写 direct synthesis `execution-result.json`（`kind: synthesis`、`status: succeeded`、`exit_code: 0`、`path`、`sha256`、可选 `size_bytes`）；旧 `evidence/*.json` synthesis envelope 仍兼容。Critic 按 Compute/legacy envelope/direct synthesis 分流，不把普通 artifact 当 JSON payload 解析。
- 本会话增量（仅文档与注释，不触代码语义、不改持久 schema、不改行为）：
  - 给 `src/index.ts`、`src/agents.ts`、`src/runtime/formal-runtime-coordinator.ts`、`src/install.ts` 加中文注释，点明 OpenCode 机制语义和不变量（plugin `console` 生命周期、`tool.execute.before` 重写 task、`pending` 不持久、Critical evidence allowlist 四类、handoff 是投影不是真相、install 事务/realpath/sha256 安全底座等）。`tsc --noEmit` 通过。
  - 四个 `skills/*/SKILL.md` 文字英译中，`name` 标识符和工具名/文件名/JSON key/路径示例保留原样；`mm-agent/SKILL.md` 把"调用 `mm_agent_*`"统一为"调用工具 `mm_agent_*`"以消除"工具还是脚本"的二义；`built-in task` 提法保留不动。
  - 新建 `docs/architecture/multi-host-install.md`（Design 状态、不触代码、锁定 v2 多宿主安装与分发架构）：包名 `mm-agent` 无作用域、bin `mm-agent → dist/mm-agent.js`、receipt `~/.config/mm-agent/receipt/<host>.json` 每 host 一份、Skill 同源硬约束、`npx mm-agent install [hosts...]` 无参扫全发/有参显式、宿主检测两层（目录初筛 + `<host> --version` 正则确认）、OpenCode 全局装优先放弃项目级 shim、v2 实施项 7 条、与 GSD 取舍（复制分发层、不复制运行时层）。
  - `docs/README.md` 的 `architecture/` 分类描述加上"多宿主安装与分发架构"，边界规则追加一条指明该文档是 Design、v1 不变、实施以根 `PLAN.md` 为准；`docs/architecture/opencode-plugin-harness.md:3` 顶部互引一行。
- 关键未决定事项：
  - 包名从 `@mm-agent/opencode`→`mm-agent` 未做对账改动：会卡 npm publish，属数据完整性敏感不可逆改动（涉及 `install.ts` 多处 hardcoded 和 `validateReceipt` 严格匹配）。详见 `docs/architecture/multi-host-install.md` v2 实施项 #2。
  - 项目分支名 `feat/opencode-plugin-spike` 是否改名待用户决定；本会话建议**不改**，因 `spike` 是项目术语（`opencode-plugin-harness.md` Spike Gate 一节）且与仓库目录名一致；改名有收益需求才动。
  - 用户提出"Gate 一直卡一直修"问题，初步诊断为 Core `gate` 单门多校验项串行 throw、一次只报一个错导致循环；根因也可能在上游 `ContextRecipe`（`src/core/context-recipes.ts`）而非 gate 本身。下一步要么用户给出具体卡住的报错码与场景，要么由读 `src/core/case-context-store.ts` 的 `gate()` 与 `context-recipes.ts` 出一份"gate 拒绝码 → 根因定位"诊断报告，再决定是否加 dry-run collect 模式。**未动手任何代码改动。**
- 下一个受控动作：先阅读本文件和 AGENTS 必读顺序，再用 `npm test`、`npm run build`、`npm run validate-config` 与 `git diff --check` 复验（最近结果均通过）；只有用户明确要求时才提交、tag、push 或 publish。

## 当前已验收运行面

- 当前工作是正式 `/mm-agent` 运行面收敛，不是新宿主或新工作流引擎。
- 目标架构是一个薄 `FormalRuntimeCoordinator` + 五个 OpenCode hidden Agents + 六个模型可见 Tool + Case 文件交接。
- 模型可见 Tool 固定为：`mm_agent_check`、`mm_agent_prepare`、`mm_agent_flow`、`mm_agent_hmml`、`mm_agent_compute`、`mm_agent_compile`。`mm_agent_case` 保留为 Flow、Golden runner 和兼容测试的内部 Core seam，不注册到模型可见 Tool registry。
- Flow 只暴露 `advance` / `submit_review`。正式链固定为 `mm_agent_flow → built-in task → mm_agent_flow`；Plugin API 不直接执行 built-in `task`，Skill 机械调用一次，`tool.execute.before` 原地校正 Agent/description/prompt，并清除 `task_id`、`background`、`command`，保证 fresh foreground child。
- 五个 hidden Agents 为 `mm-analyst`、`mm-modeler`、`mm-solver`、`mm-writer`、`mm-critic`。Critic 只返回四个语义字段；Review 的 `schema_version`、`attempt_id`、`reviewed_at`、revision 等机器字段由 runtime 生成。
- Flow 每次从权威 Case 文件派生 `runs/<case-id>/handoff.json`，只作恢复和检查投影，不是第二套状态机。旧持久 `schema_version: 1` Case 恢复时懒生成 handoff，不改写既有文件。
- Review evidence 使用严格 allowlist：当前 Manifest 声明的 candidate/read/rubric、immutable input/accepted upstream，或当前 Attempt 下通过 schema/hash 校验的 Runtime Evidence；未声明路径、其他 Attempt/Case、`tmp/`、绝对路径、路径穿越和自然语言描述均拒绝。
- 首条正式链中的 Solver task 按 DAG 可执行顺序串行。Golden runner 只作开发期验收，不进入 npm 包；npm 包不声明或打包不存在的 `schemas/` 目录。
- `blocked` 不自动回滚已接受阶段。缺少 immutable input 或 accepted upstream 错误时，应补充事实并创建新 Case，或等待未来显式 reopen/migration 机制。
- 外部 `.tgz` 独立项目验收已完成：OpenCode `1.18.9` + `minimax/MiniMax-M3`，用户仅执行 `/mm-agent`；5 个 hidden Agents、4 个 Skills、6 个最小公开 Tool 均发现成功，未使用 Golden runner。
- 正式 Flow 完整运行 Analyst → Modeler → Solver DAG（按可执行顺序串行，含 revision）→ Writer → Critic。真实 uv/Python 3.12 计算与 Compute Evidence、真实 XeLaTeX 与 Compile Evidence 均通过；最终 state 为 `completed`、stage 为 `reporting`、revision `27`，handoff 为 `completed` 且 blockers 为空。
- 非空的 `main.tex`（34989 bytes，SHA-256 前缀 `762877…`）、`compile.log`（29154 bytes，SHA-256 前缀 `ad917d…`）和 `report/report.pdf`（1720007 bytes，SHA-256 前缀 `2d6c8e…`）均存在；PDF 为 A4 17 页，逐页渲染目检无裁切、重叠、缺字或黑块，最终 compile/review 均通过；三个结果 XLSX 存在。
- 跨真实 run/resume 日志共 59 个 completed built-in task，59 个 fresh child session ID 全唯一（analyst 1、modeler 1、solver 24、writer 2、critic 31），均使用 `minimax/MiniMax-M3`；最终 `main.tex` 无 TODO/TBD/PENDING/placeholder/TO VERIFY 命中。
- `npm test` 179 total / 168 pass / 0 fail / 11 skip；build、validate-config 和定向复审均通过。
- 独立受控中断实验已完成：analysis-001 三输出落盘、revision 0 时精确终止 OpenCode；新会话从 mm-critic 接续，仅创建一个 Critic child，Analysis Attempt 仍为 1；pass 后 revision 1 / modeling，在 Modeler 执行前停止。多次进程中断均从同一磁盘 Case/Attempt 接续，恢复不依赖旧聊天。
- `npm pack --dry-run` 最新候选为 122 files、packageSize 2,185,700 bytes、unpacked 3,288,455 bytes、SHA-1 `042e284b2d7d6ac6b7b8f1eac4cf546bbc8a00d8`；这是包清单/大小证据，不声称长模型链在该候选上重跑。`1.0.0` 仍未 npm publish，第三方 notices 再分发授权仍是公开发布边界；本文件不记录外部绝对路径或 Case 数据。

## 本轮已同步的文档事实

- `README.md`：唯一 `/mm-agent`、六个正式 Tool、Flow/Task 固定链、hook 清理参数、handoff、串行 Solver、Golden/package 边界和正式外部验收结果。
- `PLAN.md`：结果契约与已取得外部证据；不把 Golden/历史 RC 替代正式用户路径接受。
- `docs/architecture/opencode-plugin-harness.md`：区分模型可见 Flow 与内部 `mm_agent_case`，定义 Task hook、evidence allowlist、handoff 和兼容边界。
- `docs/context/artifact-protocol.md`：补充 handoff 投影、严格 Review evidence allowlist、串行正式链和 blocked 语义；持久 schema v1 不变。
- `docs/architecture/canonical-core.md`、`docs/architecture/paper-alignment.md`：同步 Flow 隐藏 Core 机器字段、串行 Solver 和不自动回滚边界。
- `AGENTS.md` 与 `CLAUDE.md`：同步 durable 运行面规则并保持字节一致；未写入本轮外部现场状态。
- `docs/README.md`、`CHANGELOG.md`：已同步文档导航和 Unreleased 实现/外部验收事实。

## 外部验收结论

以下证据均已取得，后续仅需按发布边界维护：

1. 外部 npm RC 已在独立项目通过项目级发现和正式 `/mm-agent` 完整链；未依赖源码仓库内部路径或 Golden runner。
2. 中断恢复已从磁盘 handoff/Attempt 接续，未复制旧聊天；完成链 fresh child session ID 均唯一。
3. Python/XeLaTeX、Evidence、最终文件和 PDF 逐页目检均已通过。
4. 当前仅保留未 npm publish 和第三方 notices 再分发授权边界；不把 npm/node 的 transitive `ini` EBADENGINE warning 当作产品失败，安装和运行均通过。

## 交接动作

- 下一个智能体先按 `AGENTS.md` 必读顺序恢复事实，并检查 `git status --short`；不要依赖本文件之外的聊天记忆。
- 代码、测试和新规格由其各自所有者继续维护；文档修改不得回滚无关工作树变更。
- 验收后仍不创建新的公开入口、不把 Golden runner 包入发布物、不修改持久 schema；除非另有授权，不提交 tag/push/npm publish。
