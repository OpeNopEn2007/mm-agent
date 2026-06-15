# AGENTS.md

本文件在 `CLAUDE.md` 与 `AGENTS.md` 之间保持镜像同步。

任何在本仓库工作的智能体，都应把这两个文件视为 Handoff 入口和当前项目操作规则。

## 项目方向

`mm-agent` 现在是一个基于 Pi CLI Extension 的 MM-Agent Harness 项目。

旧 Claude/Codex 插件方向已经在 `v0.2.0` 结束，并归档到：

```text
.archived/legacy-claude-codex-plugin/
```

除非用户明确要求回溯旧方向，否则不要恢复归档中的插件结构。

## 核心产品标准

本项目存在的目的，是把数学建模赛题转化为一篇真实报告：

```text
赛题输入 -> 四阶段工作流 -> 可编译 LaTeX -> PDF 论文
```

对 `v1.0.0` 来说，Harness 必须跑完 MM-Agent 论文的端到端流程：

1. Problem Analysis
2. Mathematical Modeling
3. Computational Solving
4. Solution Reporting

LaTeX 没有编译成功、PDF 不存在，就不能认为 Case 完成。

## 必读顺序

非平凡工作开始前，按以下顺序阅读：

1. `README.md`
2. `IDEA.md`
3. `HANDOFF.md`
4. `PLAN.md`
5. `docs/context/project-kernel.md`
6. `docs/context/handoff-protocol.md`
7. `docs/context/artifact-protocol.md`
8. `docs/architecture/pi-extension-harness.md`
9. `docs/architecture/paper-alignment.md`

`docs/research/` 只能作为证据，不是当前指令。

## 文档纪律

保持文档简洁且不重叠：

- `IDEA.md` 解释项目为什么存在。
- `README.md` 解释项目是什么、目录怎么读。
- `HANDOFF.md` 记录当前交接状态。
- `PLAN.md` 解释下一步做什么。
- `docs/context/` 定义项目级协议。
- `docs/architecture/` 定义 Harness 设计。
- `docs/roadmap/` 记录简短版本目标。
- `docs/research/` 只存放历史调研。
- `.archived/` 只存放非活跃历史资产。

如果一个文档开始承担另一个文档的职责，应移动内容，而不是复制内容。

## 运行产物边界

运行输出属于：

```text
runs/<case-id>/
```

`runs/` 已 gitignore。不要把 Case 日志、反馈堆积、生成的 PDF 或临时 memory 写进项目文档。

## 可复用资产

以下活跃资产可以被 Pi Harness 复用：

- `knowledge/`
- `prompts/`
- `scripts/`
- `servers/`
- `templates/`
- `tests/`

复用资产，不复用旧 Claude/Codex 入口。

## 工程规则

- 优先使用简单、可检查的本地文件，而不是隐藏状态。
- 保持阶段间 artifact 流转。
- 除非用户要求或里程碑明确需要，否则不要提交 commit。
- 不要清理无关的用户改动。
- 报告完成前，用新鲜命令验证结论。
- 在 v1 闭环跑通前，保持实现面窄。

## 变更收口清单

涉及移动、归档、改名或文档结构调整时，收尾前必须逐项检查：

- `README.md` 是否仍准确描述根目录结构。
- `docs/README.md` 是否同步文档分类边界。
- `HANDOFF.md` 是否同步当前阶段、dirty state、已接受事实和下一步动作。
- `CHANGELOG.md` 是否记录本次变更。
- `CLAUDE.md` 与 `AGENTS.md` 是否仍保持同一套规则。
- `.archived/` 下的 README 是否说明新增归档内容。
- 是否搜索并处理了旧路径、旧方向、旧文档名的残留引用。
- `git status --short` 是否只包含本次任务预期文件。

这条规则来自一次实际遗漏：归档 research 文档后漏同步 `CHANGELOG.md`。后续不能只移动文件，必须同步项目记录器。

## Handoff 规则

交接给其他智能体前，先更新 `HANDOFF.md`。下一个智能体应能从文件继续，而不是依赖私人聊天历史。

Handoff 设计以 `docs/context/handoff-protocol.md` 为准。`HANDOFF.md` 是活状态，协议文档是长期规则；不要把二者混成流水账。
