# HANDOFF.md

本文件记录当前项目交接状态。它不记录 Case 运行；Case 使用 `runs/<case-id>/state.json` 和 artifact 协议。

## 当前交接状态

### Workspace

- worktree: `D:\0_Main\02_Coding\mm-agent`
- branch: `main`
- 提交基线：`4ce82cd docs: define canonical core mechanisms`
- dirty state（commit 后）：本次 commit 收口的 dirty surface 全部入档；任何新增 dirty 由后续工作按本文 Handoff 规则追加记录。

### Current Phase

- phase: `v1.0.0` OpenCode Harness 预构建文档收口完成，等待实现切口
- step: Canonical Core 与 `PLAN.md` 已接受；本 commit 完成预构建文档收口；下一步执行 `PLAN.md` 第 1 步 OpenCode Plugin Spike。
- phase spec: `PLAN.md`
- canonical source: `docs/architecture/canonical-core.md`、`docs/context/artifact-protocol.md`

### Accepted

- item: `4ce82cd` 提交包含的 Canonical Core（`docs/architecture/canonical-core.md` + `docs/context/artifact-protocol.md`）是宿主无关机制唯一来源。
- evidence: `git log --oneline` 中 `4ce82cd docs: define canonical core mechanisms`；`docs/architecture/canonical-core.md` 的数据流、Core Interface、状态所有权和四阶段不变量；`docs/context/artifact-protocol.md` 的所有权、`case.json`/`state.json`/Context Manifest/Artifact 提升/完成规则。
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

### In Flight

- owner: 无
- task: 无并行实现任务。
- expected output: 不适用。
- next commander should wait for: 不适用。

### Next Commander Action

1. read: `README.md` → `IDEA.md` → `HANDOFF.md` → `PLAN.md` → `docs/context/project-kernel.md` → `docs/architecture/canonical-core.md` → `docs/context/artifact-protocol.md` → `docs/architecture/opencode-plugin-harness.md` → `docs/architecture/paper-alignment.md`。
2. verify: 检查 OpenCode Plugin 官方接口是否仍与 Spike 假设一致，随后执行 `PLAN.md` 第 1 步（OpenCode Plugin Spike）。
3. accept by writing: 在 Spike 通过后记录 `package.json`、`src/index.ts`、`src/agents.ts`、安装器、Agent 注入、Skill 发现、fresh task session 与 Windows 验证证据，并按 `PLAN.md` 第 1 步通过条件逐项打勾。
4. reject by writing: 记录失败的 OpenCode 层、日志位置、最小修复范围和未改变的架构决策，避免悄悄回退 Canonical Core。

## Commit 判断

本 commit 已完成预构建文档收口，是用户授权的 docs commit，message 为 `docs: align OpenCode adapter build plan`。后续 commit 仍应只在用户要求或里程碑切口上发生。