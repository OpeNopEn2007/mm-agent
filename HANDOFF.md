# HANDOFF.md

本文件记录当前项目交接状态。它不记录 Case 运行；Case 使用 `runs/<case-id>/state.json` 和 artifact 协议。

## 当前交接状态

### Workspace

- worktree: `D:\0_Main\02_Coding\mm-agent`
- branch: `main`
- handoff commit: 本文件所在的 `docs: prepare Codex development handoff` commit；其直接父提交为 `49b9fb2 chore: ignore development worktrees`。
- accepted baselines: `4ce82cd docs: define canonical core mechanisms`；`1040e63 docs: align OpenCode adapter build plan`
- dirty state: handoff commit 后应为 clean；该 commit 只包含文档，没有实现代码或运行产物。接手时以 fresh `git status --short --branch` 为准。
- remote state: `main` 含尚未 push 的本地文档提交；未获用户要求前不要 push。
- linked worktrees: 无；本地 `.worktrees/` 为空并由 `49b9fb2` gitignore。
- stash: 保留 `stash@{0}: docs: define OpenCode harness architecture`。该 stash 早于当前 accepted baselines，不要 apply/pop/drop，除非用户明确要求。

### Current Phase

- phase: `v1.0.0` OpenCode Harness 预构建文档 gate 已通过，可以进入正式开发。
- step: 下一步只执行 `PLAN.md` 第 1 步 OpenCode Plugin Spike；通过 Spike Gate 前不开始 CaseContextStore。
- phase spec: `PLAN.md`
- latest report: `1040e63` 已通过独立文档复审，无 Critical/Important findings；本文件记录 Codex 接手现场。
- canonical source: `docs/architecture/canonical-core.md`、`docs/context/artifact-protocol.md`

### Accepted

- item: `4ce82cd` 提交包含的 Canonical Core（`docs/architecture/canonical-core.md` + `docs/context/artifact-protocol.md`）是宿主无关机制唯一来源。
- evidence: `git log --oneline` 中 `4ce82cd docs: define canonical core mechanisms`；`docs/architecture/canonical-core.md` 的数据流、Core Interface、状态所有权和四阶段不变量；`docs/context/artifact-protocol.md` 的所有权、`case.json`/`state.json`/Context Manifest/Artifact 提升/完成规则。
- item: `1040e63` 接受 OpenCode Adapter 设计和预构建实施计划；当前没有 `src/`、`skills/`、`runtime/`、`package.json` 或 `tsconfig.json`，实现尚未开始。
- evidence: `docs/architecture/opencode-plugin-harness.md`、`PLAN.md`、`README.md` 与实际文件树。
- item: v1 唯一 Adapter 是 OpenCode Plugin；Pi CLI Extension 不再是活跃 runtime 决策。
- evidence: `README.md` 的总体架构、`docs/architecture/opencode-plugin-harness.md`、`IDEA.md` 的"为什么选择 OpenCode Adapter"节、`docs/roadmap/v1.0.0.md` 的目标与验收标准。
- item: 用户入口固定为 `/mm-agent`；实现使用 4 Skills、5 hidden Agents 和 6 个确定性 Tools。
- evidence: `README.md` 的 OpenCode、Skills、Agents 和 Tools 章节。
- item: Case 状态只能由 `mm_agent_case gate` 推进；`gate` 使用调用方 `expected_revision` 做 compare-and-swap，并校验 Manifest read-set hash 与 promotion target 白名单。
- evidence: `docs/architecture/canonical-core.md` 的 `gate` 节、`docs/context/artifact-protocol.md` 的 Artifact 提升节。
- item: Subagent fresh context 由 `context.json`、accepted artifacts 和 DAG 直接依赖 Task Memory 重建；Critic 复用同一 Attempt Manifest，不创建第二个 Attempt。
- evidence: `docs/architecture/canonical-core.md` 的 Fresh Context 重建与 Actor-Critic 节、`docs/context/artifact-protocol.md` 的 Context Manifest 与 Attempt 与 Review 节。
- item: Case Policy（revision budget、Rubric 快照）在 `open` 时固化到 `case.json.policy`；Solving Gate 接受 DAG 时按 `solving_per_task` 为每个 Task 建立独立 revision budget。
- evidence: `docs/context/artifact-protocol.md` 的 `case.json` 与 `state.json` 节。
- item: Blocker 以追加式记录存在 `state.json`，由同 scope Actor Attempt 通过 `resolves_blocker` 解决。
- evidence: `docs/architecture/canonical-core.md` 的 Stage 推进节、`docs/context/artifact-protocol.md` 的 `state.json` 节。
- item: `inspect` 从当前文件和完成规则实时推导 completion evidence，不在 `state.json` 维护第二份状态。
- evidence: `docs/architecture/canonical-core.md` 的 `inspect` 节、`docs/context/artifact-protocol.md` 的完成规则节。
- item: HMML 模型在 GTE 与 BGE-M3 小评测后锁定，使用预定义的 Recall@5 差距规则；评测四元组 `(model, hmml-embeddings.npy, embedding-meta.json, method-index.json)` 原子更新。
- evidence: `README.md` 的 HMML 节、`PLAN.md` 第 4 步。
- item: 旧 `tests/smoke_test.py` 仍验证已退休的 Claude Plugin 布局；当前 `python -m pytest` 有 6 个预期基线失败，其中 Windows 上的 `python3` 调用也是旧测试假设。它们由 `PLAN.md` 第 7 步清理，不是 Plugin Spike 的验收 gate。
- evidence: 2026-07-16 fresh `python -m pytest` 输出；`PLAN.md` 第 7 步的旧资产清理范围。Step 1 必须建立并使用新的 npm test/build/runtime gate。

### In Flight

- owner: 无
- task: 无并行实现任务。
- expected output: 不适用。
- next commander should wait for: 不适用。

### Next Commander Action

1. read: `README.md` → `IDEA.md` → `HANDOFF.md` → `PLAN.md` → `docs/context/project-kernel.md` → `docs/architecture/canonical-core.md` → `docs/context/artifact-protocol.md` → `docs/architecture/opencode-plugin-harness.md` → `docs/architecture/paper-alignment.md`。
2. verify: 先确认本交接文档改动已独立保存，再从当前 HEAD 创建隔离 worktree；核对 OpenCode Plugin 官方接口后，只执行 `PLAN.md` 第 1 步。
3. accept by writing: 使用 test-first 开发，逐项记录 Plugin load、Agent 注入且不覆盖用户配置、Tool context、Skill discovery、fresh child session、install/update/remove/reinstall、Windows 路径、重启与 compaction-off 恢复证据；Spike Gate 全部通过后再接受该 commit。
4. reject by writing: 记录失败的 OpenCode 层、命令和日志、最小修复范围及仍成立的架构决策；不得为绕过宿主限制而重写 Canonical Core。

## Commit 判断

本文件所在的独立 docs commit 完成 Codex 开发交接，不包含 Plugin Spike 实现。后续实现任务按 `PLAN.md` 的验收切口独立 commit；未获用户要求前不要 push。
