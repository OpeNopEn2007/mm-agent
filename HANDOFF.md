# HANDOFF.md

本文件记录当前仓库的交接状态。它不是任务清单，也不是聊天摘要，而是让任意智能体接手项目时可以恢复现场的共享记录器。

## 当前交接状态

### Workspace

- worktree: `E:\Study\CodingWorkSpace\mm-agent`
- branch: `main`
- dirty state: 当前有一组已暂存的文档重置与 legacy 归档变更，等待形成归档 commit。

### Current Phase

- phase: `v1.0.0` 文档与资产边界重整
- step: 为 Pi CLI Extension + MM-Agent Harness 主线建立干净项目上下文
- phase spec: `PLAN.md`
- latest report: 暂无单独报告；本轮状态以 `README.md`、`PLAN.md`、`docs/context/`、`docs/architecture/` 和本文件为准。

### Accepted

- item: `v0.2.0` 已作为旧 Claude/Codex 插件方向终点。
- evidence: `CHANGELOG.md` 已记录 `0.2.0` legacy final snapshot。
- item: 旧方向资产进入 `.archived/legacy-claude-codex-plugin/`。
- evidence: `git status --short` 显示旧 `.planning/`、`.claude-plugin/`、`agents/`、`hooks/`、`skills/` 及旧研究文档均以 rename 方式暂存。
- item: 新主线文档已转向 Pi CLI Extension + MM-Agent Harness。
- evidence: `README.md`、`IDEA.md`、`PLAN.md`、`docs/context/`、`docs/architecture/` 和 `docs/roadmap/v1.0.0.md` 已更新。

### In Flight

- owner: Codex
- task: 完成本轮 Handoff 设计补充，并确认是否提交归档 commit。
- expected output: `HANDOFF.md`、`docs/context/handoff-protocol.md` 以及相关入口文档同步。
- next commander should wait for: 当前没有并行 worker 在同一文件面上工作。

### Next Commander Action

1. read: `README.md`、`PLAN.md`、`HANDOFF.md`、`docs/context/handoff-protocol.md`、`docs/context/project-kernel.md`。
2. verify: `git status --short --branch`、`git diff --cached --check`、`git diff --name-only`。
3. accept by writing: 更新 `HANDOFF.md` 的 Accepted / In Flight / Next Commander Action，并在需要时更新 `CHANGELOG.md`。
4. reject by writing: 在 `HANDOFF.md` 记录不接受的原因、需要修复的文件面和下一步最小修复任务。

## Commit 判断

当前变更适合形成一个归档 commit：它是旧方向资产归档、v1 文档上下文重置和 Handoff 入口建立的同一切口。

建议提交信息：

```text
chore: archive legacy direction and reset v1 docs
```
