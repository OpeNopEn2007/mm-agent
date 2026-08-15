# PLAN

## 当前里程碑结果契约

本里程碑收敛 `mm-agent` 的正式 `/mm-agent` 运行面。目标不是扩张工作流引擎，而是让用户路径由一个薄 Flow 可靠地驱动五个 OpenCode hidden Agents，并把每一步交接落到 Case 文件。

正式用户链必须成立：

```text
/mm-agent
  → mm_agent_check / mm_agent_prepare
  → mm_agent_flow(advance)
  → built-in task（一次 fresh foreground child）
  → mm_agent_flow(advance)
  → fresh mm-critic
  → mm_agent_flow(submit_review)
  → ...
  → Writer + Compile
  → 非空 report/report.pdf
```

Flow 只决定下一步并维护机器事实；专业 Agent 负责领域判断和 Candidate。首条正式链中的 Solver task 按 DAG 可执行顺序串行运行；DAG/wave 语义仍由 Canonical Core 保留，但 same-wave 并发不是本里程碑的用户路径前置条件。

## 固定公开面

- 唯一用户入口是 `/mm-agent`。
- 模型可见 Tool 恰好六个：`mm_agent_check`、`mm_agent_prepare`、`mm_agent_flow`、`mm_agent_hmml`、`mm_agent_compute`、`mm_agent_compile`。
- `mm_agent_flow` 只接受 `advance` 和 `submit_review`。Critic 只提交 `verdict`、`findings`、`required_fixes`、`evidence` 四个语义字段。
- `mm_agent_case` 的 `open / dispatch / gate / inspect` 仍是 Core、Flow、Golden runner 和兼容测试的内部接口，不注册为模型可见 Tool。
- Plugin 注入五个 hidden Agents：`mm-analyst`、`mm-modeler`、`mm-solver`、`mm-writer`、`mm-critic`。它们使用 fresh built-in `task` session，不嵌套委派。
- Plugin API 没有从 hook 直接调用 built-in `task` 的受支持接口。Skill 机械发出一次 Task；`tool.execute.before` 在原地校正 `subagent_type`、`description`、`prompt`，并清掉 `task_id`、`background`、`command`，保证 fresh foreground child。

## 持久事实与兼容边界

- `case.json`、`state.json`、Attempt `context.json`、Review、Runtime Evidence 和 accepted artifacts 的持久 `schema_version: 1` 本轮不变。
- `handoff.json` 是 Flow 从 `state.json`、active Attempt、accepted artifacts 和 DAG 派生的交接投影，只用于恢复和检查，不是第二套状态机，也不是 promotion/completion 依据。旧 Case 在恢复时懒生成它，不改写既有持久文件。
- Flow 在 Gate 前生成 Review 的 `schema_version`、`attempt_id`、`reviewed_at`、`expected_revision` 等机器字段；模型不得提交这些字段。
- Review evidence 必须为 Case-relative path，并属于当前 Manifest 声明的 candidate/read/rubric、immutable input/accepted upstream，或当前 Attempt 下通过 schema/hash 校验的 Runtime Evidence。未声明的 `tmp/`、其他 Attempt/Case、任意 stable 文件、绝对路径、路径穿越和自然语言描述均拒绝；`pass` 至少引用一个 Candidate。
- `block` 只追加当前 Case 的 blocker，不自动回滚已接受阶段。若缺少 immutable input 或 accepted upstream 已错误，需补充事实并创建新 Case，或等待未来显式 reopen/migration 机制。
- Golden runner 只作为开发期验收工具，通过内部 Core 接口运行；不驱动用户 Case，不进入 npm 包。
- 发布包以 `package.json.files` 的真实清单为准，不声明或打包不存在的 `schemas/` 目录；tests、Golden runner、runs、benchmark 输入、cache、模型权重和凭据均不入包。

## 当前里程碑状态

正式 Flow、六个公开 Tool、五个 hidden Agent、Task hook 和派生 handoff 已完成实现，并已在外部 npm `.tgz` 独立项目中验收。Canonical Core、Artifact Protocol、OpenCode Adapter 和论文对齐文档均按上述边界同步；本里程碑已达到 Go。

外部验收使用 OpenCode `1.18.9` 与 `minimax/MiniMax-M3`，用户只执行 `/mm-agent`，完整运行 Analyst → Modeler → Solver DAG（按可执行顺序串行，含 revision）→ Writer → Critic。该链由正式 Flow 驱动，不使用 Golden runner；五个 hidden Agents、四个 Skills 和六个最小公开 Tool 均被发现，59 个 completed built-in task 的 fresh child session ID 全部不同。

真实 uv/Python 3.12 计算留下 Compute Evidence，XeLaTeX 编译留下 Compile Evidence；`main.tex` 为 34989 bytes（SHA-256 前缀 `762877…`）、`compile.log` 为 29154 bytes（SHA-256 前缀 `ad917d…`）、`report/report.pdf` 为 1720007 bytes（SHA-256 前缀 `2d6c8e…`）。最终 Case `status` 为 `completed`、stage 为 `reporting`、revision 为 `27`，handoff 为 `completed` 且 blockers 为空；PDF 为 A4 17 页，逐页渲染目检无裁切、重叠、缺字或黑块；最终 compile/review 均通过，三个结果 XLSX 存在。

独立受控中断实验也已完成：analysis-001 三输出落盘且 revision 0 时精确终止 OpenCode；新会话从 mm-critic 接续，只创建一个 Critic child，Analysis Attempt 仍为 1；Critic pass 后 revision 1 / modeling，在 Modeler 执行前停止。多次进程中断均从同一磁盘 Case/Attempt 接续，恢复不依赖旧聊天。

`1.0.0` 仍未 npm publish；第三方 notices 的再分发授权仍是公开发布边界。Golden runner 只属于开发期证据，不驱动用户 Case，也不进入发布包。

完整回归为 `npm test` 179 total / 168 pass / 0 fail / 11 skip，build、validate-config 和定向复审均通过；此前 Step 1–8、Gate A/B/C 和 Golden runner 证据继续保留为开发期证据，它们补充而不替代本次正式 `/mm-agent` 外部验收。

## 已取得的外部验收证据

上述独立项目、完整 Flow 链、受控中断恢复、真实 Python/XeLaTeX、PDF 目检和 package 记录均已取得；不再把它们列为待验收事项。最新 `npm pack --dry-run` 候选为 122 files、packageSize 2,185,700 bytes、unpacked 3,288,455 bytes、SHA-1 `042e284b2d7d6ac6b7b8f1eac4cf546bbc8a00d8`；该候选记录不声称长模型链在其上重跑。

## 验收规则与已取得证据

里程碑只有在以下事实同时成立时才算接受：

- 外部 `.tgz` 的正式 `/mm-agent` 链路实际完成四阶段并留下 Case artifacts、Runtime Evidence、LaTeX、日志和非空 PDF。
- `advance → task → advance` 和 `submit_review` 的调用边界由真实 Plugin hook 验证；Task 参数被原地校正且无 `task_id`、`background`、`command` 残留。
- Core Gate 仍是唯一 promotion/state 入口；旧 `schema_version: 1` Case 可恢复，handoff 只作派生事实。
- evidence allowlist、Case-relative path/realpath、hash、CAS、revision budget、blocker 和失败保留证据均有针对性回归。
- `npm test`、`npm run build`、`npm run validate-config`、受影响的真实 runtime gate、`npm pack --dry-run --json`、package forbidden-path scan、`git diff --check` 和 AGENTS/CLAUDE 一致性检查均以新鲜命令通过；外部 `.tgz` 独立项目证据已在上节记录，不以 Golden runner 替代。

## 非目标

- 不新增 Coordinator Agent，不恢复旧 Claude/Codex Plugin、Pi CLI Extension、Superpowers 或 `.planning/` runtime。
- 不把 Golden runner、测试、Case、trace、题目、cache、模型权重、schemas 目录或 provider 凭据放入发布包。
- 不在首条正式链启用 Solver 并发，不依赖 compaction hint，不把更长的自然语言 prompt 当作状态机。
- 不静默迁移或重写持久 schema；如需改变 `case.json`、`state.json`、`context.json`、Review 或 Evidence schema，另立版本和显式 migration。

## 后续候选

安装器的独立收敛、Solver 并发、显式 reopen/migration、跨 Case 监督反馈和第二宿主均不属于本里程碑；正式用户链和外部证据已闭环后再单独立项。
