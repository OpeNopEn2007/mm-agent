# HANDOFF.md

本文件记录当前仓库的交接状态。它不是任务清单，也不是聊天摘要，而是让任意智能体接手项目时可以恢复现场的共享记录器。

## 当前交接状态

### Workspace

- worktree: `E:\Study\CodingWorkSpace\mm-agent\exp-harness-rewrite`
- branch: `exp/harness-rewrite`
- dirty state: 8 个 staged 改动（5 个 Pi 期文档归档 R100 + 1 个 `pi-extension-harness.md` 归档 R100 + `project-kernel.md` M + `handoff-protocol.md` M），以及 7 个 active-doc 收口改动未 stage（README / docs/README / AGENTS / CLAUDE / PLAN / HANDOFF / IDEA / roadmap/v1.0.0）。

### Current Phase

- phase: `v1.0.0` 收口与重构
- step: 完成 active-doc 收口与 Pi 期文档归档，准备 host adapter 骨架
- phase spec: `PLAN.md`
- latest report: `docs/abstracted-design.md`（架构唯一权威依据）；本次重构涉及的 Pi 期协议已归档到 `.archived/legacy-pi-design/`

### Accepted

- item: `v0.2.0` 已作为旧 Claude/Codex 插件方向终点。
  - evidence: `CHANGELOG.md` 已记录 `0.2.0` legacy final snapshot。
- item: 旧 Claude/Codex 方向资产进入 `.archived/legacy-claude-codex-plugin/`。
  - evidence: 本地提交 `8b25667 chore: archive legacy direction and reset v1 docs` 已记录旧资产归档。
- item: 旧 Pi CLI Extension 协议层（canonical-core / paper-alignment / artifact-protocol / design-principles / supervision-loop / pi-extension-harness）进入 `.archived/legacy-pi-design/`。
  - evidence: 本分支已 `git mv` 完成归档，文件内容未改动保留为历史参考。
- item: `docs/abstracted-design.md` 是新方向架构唯一权威依据。
  - evidence: `f5d5851` commit 已落地；后续 active-doc 收口 README / AGENTS / PLAN / HANDOFF / IDEA / roadmap 均回指该文件。
- item: active-doc 收口完成。`docs/context/{project-kernel, handoff-protocol}.md` 为项目级协议双根，`docs/abstracted-design.md` 为架构唯一权威。
  - evidence: 8 个 active-doc 同步修改完成，待 commit。

### In Flight

- owner: 当前会话
- task: 把 active-doc 收口的 7 个文档修改 stage 并 commit；同时让接手者从文件而不是聊天历史理解项目当前方向。
- expected output: `git add -A` 后单条 commit 收口。
- next commander should wait for: 当前没有并行 worker 在同一文件面上工作。

### Next Commander Action

1. read: `README.md`、`IDEA.md`、`HANDOFF.md`、`PLAN.md`、`docs/abstracted-design.md`、`docs/context/project-kernel.md`、`docs/context/handoff-protocol.md`、`docs/roadmap/v1.0.0.md`。
2. verify: `git status --short --branch`、`git diff --check`，确认 active-doc 收口未引入意外改动。
3. accept by writing: 更新 `HANDOFF.md` 的 Accepted / In Flight / Next Commander Action，并在用户要求时提交文档变更。
4. reject by writing: 在 `HANDOFF.md` 记录不接受的原因、需要修复的文件面和下一步最小修复任务。

## Commit 判断

本次 active-doc 收口与 Pi 期文档归档适合合并成一条 commit，作为 v1.0.0 重构的第一个文档收口节点。建议提交信息：

```text
docs: archive legacy-pi-design and align active docs with abstracted-design
```

后续 host adapter 骨架与 Knowledge 重组是独立 commit。