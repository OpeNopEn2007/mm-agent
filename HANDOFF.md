# HANDOFF.md

本文件记录当前仓库的交接状态。它不是任务清单，也不是聊天摘要，而是让任意智能体接手项目时可以恢复现场的共享记录器。

## 当前交接状态

### Workspace

- worktree: `E:\Study\CodingWorkSpace\mm-agent\main`
- branch: `main`
- dirty state: 归档 commit 已完成；当前工作区包含 Pi CLI 调研、MM-Agent 论文深度解读与文档同步改动，尚未提交。

### Current Phase

- phase: `v1.0.0` 新方向启动
- step: Pi CLI 调研、MM-Agent 论文 workflow 梳理与本机最小验证
- phase spec: `PLAN.md`
- latest report: `docs/reference/mm-agent-paper-deep-dive.md`；Pi 调研见 `docs/research/pi-cli-extension-analysis.md`

### Accepted

- item: `v0.2.0` 已作为旧 Claude/Codex 插件方向终点。
- evidence: `CHANGELOG.md` 已记录 `0.2.0` legacy final snapshot。
- item: 旧方向资产进入 `.archived/legacy-claude-codex-plugin/`。
- evidence: 本地提交 `8b25667 chore: archive legacy direction and reset v1 docs` 已记录旧资产归档。
- item: 新主线文档已转向 Pi CLI Extension + MM-Agent Harness。
- evidence: `README.md`、`IDEA.md`、`PLAN.md`、`docs/context/`、`docs/architecture/` 和 `docs/roadmap/v1.0.0.md` 已更新。
- item: Pi CLI 已完成本机用户级安装验证；当前本机版本需按新鲜命令看待。
- evidence: 历史调研记录 `pi --version` 返回 `0.79.4`；2026-07-03 新鲜复核返回 `0.80.2`，`Get-Command pi` 曾指向 `C:\Users\OpeNopEn\AppData\Roaming\npm\pi.ps1`。
- item: 已新增 MM-Agent 论文中文深度解读，明确本项目 v1 应构建 artifact-first、单 coordinator 的 Pi workflow。
- evidence: `docs/reference/mm-agent-paper-deep-dive.md` 已梳理从论文四阶段、HMML、DAG/Memory、Actor-Critic、代码执行到 PDF gate 的目标清单。
- item: 当前项目没有生成 `.pi/` 运行产物。
- evidence: `Test-Path .pi` 返回 `False`。
- item: Windows shell 需要显式确认。
- evidence: `where.exe bash` 首位为 `C:\Windows\System32\bash.exe`，Git Bash 位于 `E:\Study\AI\Git\bin\bash.exe`。

### In Flight

- owner: Hephaestus
- task: 收口 MM-Agent 论文深度解读文档与索引同步，并等待用户验收。
- expected output: `docs/reference/mm-agent-paper-deep-dive.md`、`docs/README.md`、`CHANGELOG.md`、`HANDOFF.md` 更新。
- next commander should wait for: 当前没有并行 worker 在同一文件面上工作。

### Next Commander Action

1. read: `README.md`、`PLAN.md`、`HANDOFF.md`、`docs/reference/mm-agent-paper-deep-dive.md`、`docs/research/pi-cli-extension-analysis.md`、`docs/architecture/pi-extension-harness.md`。
2. verify: `git status --short --branch`、`git diff --check`、`pi --version`，并检查 `docs/README.md` 与 `CHANGELOG.md` 是否已记录新增参考文档。
3. accept by writing: 更新 `HANDOFF.md` 的 Accepted / In Flight / Next Commander Action，并在用户要求时提交文档变更。
4. reject by writing: 在 `HANDOFF.md` 记录不接受的原因、需要修复的文件面和下一步最小修复任务。

## Commit 判断

当前变更适合在用户验收后形成一个文档/调研 commit：它同时记录新方向第一步的 Pi CLI 工程事实，以及 MM-Agent 论文到 v1 workflow 的目标梳理。

建议提交信息：

```text
docs: document pi harness and mm-agent workflow
```
