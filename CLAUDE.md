# AGENTS.md / CLAUDE.md

本文件是项目的 Agent 入口。本文件与同名入口（`AGENTS.md` 或 `CLAUDE.md`）保持同一套规则。任何在本仓库工作的智能体都应将其视为项目入口和操作约束。

## 项目方向

`mm-agent` 是一个以 OpenCode Plugin 为首个 Adapter 的数学建模 Harness。Canonical Core 由 `4ce82cd` 接受，OpenCode Adapter 设计由 `1040e63` 接受；两者分别是宿主无关机制和 v1 Adapter 实现接口的唯一来源。OpenCode Plugin Spike 已由 `315c319` 接受，CaseContextStore 已完成，下一步是 Preflight 与输入整理。它把赛题转化为四阶段 artifacts、可编译 LaTeX 和 PDF 论文：

```text
赛题输入 -> 四阶段工作流 -> 可编译 LaTeX -> PDF 论文
```

`v0.2.0` 的 Claude/Codex Plugin 方向已结束；Pi CLI Extension 一度出现在 `Unreleased` 文档重置中，也已结束。历史资产位于：

```text
.archived/legacy-claude-codex-plugin/
```

不要恢复归档中的 Plugin、Hook、Agent、Skill、MCP 或 `.planning/` 结构。Pi 不再是活跃 runtime 决策。

## 核心产品标准

`v1.0.0` 必须跑完 MM-Agent 的端到端流程：

1. Problem Analysis
2. Mathematical Modeling
3. Computational Solving
4. Solution Reporting

每个 Case 必须保存阶段 artifacts。只有 `report/main.tex`、`report/compile.log` 和非空 `report/report.pdf` 均存在，并由 Report Gate 验证时，Case 才能完成。

## 必读顺序

非平凡工作开始前，按以下顺序恢复项目事实：

1. `README.md`
2. `IDEA.md`
3. `HANDOFF.md`
4. `PLAN.md`
5. `docs/context/project-kernel.md`
6. `docs/architecture/canonical-core.md`
7. `docs/context/artifact-protocol.md`
8. `docs/architecture/opencode-plugin-harness.md`
9. `docs/architecture/paper-alignment.md`

`docs/research/` 和 `.archived/` 是证据或历史，不是活跃指令。

## Case 规则

- 运行期状态只属于 `runs/<case-id>/`，`runs/` 已 gitignore。
- `state.json`、accepted artifact、attempt `context.json` 和 review 是 Case 的持久事实。
- 每次 subagent 使用 fresh context，由主 Agent 根据 state、DAG 和 accepted artifacts 重建。
- Subagent 不直接传递完整聊天，也不得直接修改 `state.json`。
- 只有 `mm_agent_case gate` 能提升 candidate artifact 并推进 Case 状态；`gate` 使用 `expected_revision` 做 compare-and-swap。
- Critic 复用同一 Attempt Manifest，不创建第二个 Attempt。
- 不要把 Case 日志、PDF、临时 memory 或用户数据写进项目文档。

## OpenCode 规则

- 用户入口只有 `/mm-agent`。
- OpenCode Plugin 负责 hidden Agents 和确定性 Tools；OpenCode built-in `task` 负责 fresh child session。
- 活跃 Skills 为 `mm-agent`、`mm-hmml`、`mm-compute`、`mm-report`。
- 活跃 Agents 为 `mm-analyst`、`mm-modeler`、`mm-solver`、`mm-writer`、`mm-critic`。
- 活跃 Tools 为 `mm_agent_check`、`mm_agent_prepare`、`mm_agent_case`、`mm_agent_hmml`、`mm_agent_compute`、`mm_agent_compile`。
- TypeScript 负责 Plugin 和 Case 协议；Python 3.12 + uv 负责 HMML 和科学计算；TeX 是系统依赖。
- 不读取用户项目 `.venv`，也不把模型 cache、Python 环境或运行产物提交到仓库。

## 文档纪律

- `README.md` 解释产品、机制、目录和使用入口。
- `IDEA.md` 解释项目为什么存在。
- `PLAN.md` 定义当前里程碑的预期结果、完成边界和验收证据。
- `HANDOFF.md` 记录当前交接状态。
- `docs/context/` 定义持久项目与 Case 协议。
- `docs/architecture/` 定义实现接口和论文对齐。
- `docs/roadmap/` 记录版本验收标准。
- `docs/research/` 保存历史调研。
- `.archived/` 保存非活跃历史资产。

一个文档不得复制另一个文档的职责。修改机制时更新负责该机制的 canonical 文档，并让其他文档链接到它。Canonical Core 与 Artifact 协议一旦接受，只允许通过显式 schema migration 演进，不允许活跃文档重写。

## 工程规则

- 使用简单、可检查的本地文件，不使用隐藏状态替代 Case 事实。
- 复用 `knowledge/`、`prompts/`、`scripts/`、`servers/`、`templates/` 和 `tests/` 中与 v1 协议兼容的资产；不复用旧入口。
- 不清理或回滚无关的用户改动。
- Case 完成前用新鲜命令验证计算、编译和 PDF。
- 在 Golden Case 跑通前保持实现面窄。
- 除非用户要求或里程碑需要，否则不要提交 commit。
- 根 `PLAN.md` 是结果契约：描述里程碑结束时必须成立的事实、交付边界和验收证据，不规定逐步执行过程。
- 本项目不使用 Superpowers 作为执行框架，也不强制 TDD、RED/GREEN、mutation 或逐微任务全量回归。执行模型根据风险选择实现与测试顺序。
- 本仓库不得调用 `tdd` Skill；测试是验收证据，不是强制实现顺序。
- 协议、安全、并发、迁移、数据完整性和 bug 修复必须有针对性回归证据；里程碑收口时 fresh 执行完整相关测试、Build、受影响的真实 runtime gate 和 diff/package checks。
- 独立审查默认在里程碑候选完成后执行一次；只有新的 Critical/Important 风险证据才触发定向复审，不进行无新增证据的循环审查。
- Subagent 只用于边界清楚且能独立验收的任务，不得与主 Agent 重复工作或并行修改同一文件。机械搜索/文档整理默认 `gpt-5.6-terra medium`，确定性枚举可用 `terra low`，低风险且边界明确的代码实现用 `gpt-5.6-sol medium`，安全、并发、跨平台、架构和最终验收保留 `gpt-5.6-sol high`；除非用户明确授权，不使用 `xhigh`、`max` 或 `ultra`。
- 需要为 subagent 指定较低档位时，使用 `fork_turns="none"` 或有限正整数并提供自包含 brief；完整历史 fork 会继承主 Agent 的模型与推理档位，不能作为降档手段。

## 文档变更收口

涉及移动、归档、改名、架构或运行时调整时，收尾前检查：

- `README.md`、`PLAN.md`、`HANDOFF.md` 和 `CHANGELOG.md` 是否与当前事实一致。
- `docs/README.md` 是否准确描述文档分类。
- `AGENTS.md` 与 `CLAUDE.md` 是否保持同一套规则（字节一致）。
- 对旧路径、旧 runtime、旧命令、旧入口和旧执行框架的活跃引用是否已搜索并移除（Pi CLI Extension、旧 Claude/Codex Plugin、Superpowers、`${CLAUDE_PLUGIN_ROOT}`、`dispatch_id`、`state_revision`、`active_dispatches`、`../../../` 路径示例、`pi-extension-harness.md`、`.planning/` 作为活跃 runtime 路径）。
- `.archived/` 的索引是否仍说明其历史性质。
- `git status --short` 的无关改动是否被保留并记录。

## Handoff

交接前更新 `HANDOFF.md`。下一个智能体必须能够依靠文件恢复当前阶段、已接受事实、进行中工作和下一步动作，不应依赖私人聊天历史。

项目级交接遵循 `docs/context/handoff-protocol.md`。Case 内 subagent context 遵循 `docs/context/artifact-protocol.md`；不要混淆两种协议。
