# HANDOFF.md

本文件记录当前项目交接状态。它不记录 Case 运行；Case 使用 `runs/<case-id>/state.json` 和 artifact 协议。

## 当前交接状态

### Workspace

- primary worktree: `D:\0_Main\02_Coding\mm-agent`，branch `main`，仍停在 `cb72307`；本轮未修改 main。
- development worktree: `D:\0_Main\02_Coding\mm-agent\.worktrees\opencode-plugin-spike`，branch `feat/opencode-plugin-spike`。
- accepted implementation: `315c319 feat: validate OpenCode plugin harness`。
- dirty state: 本文件所在 docs closeout commit 完成后应为 clean；`node_modules/`、`dist/`、`.superpowers/` 和测试 cache 为 ignored/generated。
- linked worktrees: 仅上述 main 与 feature worktree。
- stash: 无。早期 `docs: define OpenCode harness architecture` stash 已确认被 `4ce82cd` 与 `1040e63` 的 accepted 设计取代，并按用户明确授权在本轮 docs closeout 后删除。
- remote state: 本轮没有 push；未获用户明确要求前不要 push。

### Current Phase

- phase: `v1.0.0` 正式开发。
- accepted step: `PLAN.md` Step 1 OpenCode Plugin Spike。
- next step: 只执行 Step 2 CaseContextStore 与文件契约；尚未开始。
- forbidden next scope: Step 2 gate 通过前，不进入 Preflight、HMML、Compute/Compile、四阶段编排或 Golden Case。
- worker state: 无活动 worker；实现与两轮 review 均已结束。

### Accepted

- `4ce82cd docs: define canonical core mechanisms` 仍是 Canonical Core 与 Artifact 协议的唯一宿主无关 baseline。
- `1040e63 docs: align OpenCode adapter build plan` 仍是 OpenCode Adapter 设计 baseline。
- `315c319 feat: validate OpenCode plugin harness` 接受 Step 1 实现：
  - ESM package `@mm-agent/opencode@1.0.0`，固定 `@opencode-ai/plugin@1.18.2`。
  - default Plugin、non-overwrite `mm-agent-spike` hidden Agent、只读 `mm_agent_spike_context` Tool 和可选 compaction hint。
  - `mm-agent` Skill discovery/slash bridge。
  - install/update/remove CLI、receipt hash、Plugin 注册所有权、用户修改冲突保护、lexical/realpath/junction 边界和 staged transaction rollback。
  - Windows drive、UNC 与 POSIX path semantics。
  - positive npm files allowlist；临时 `src/tools/spike.ts` 不存在。
- 两轮独立 review 已关闭所有 Critical/Important findings；最终 whole-branch verdict 为 `Ready to accept: Yes`。
- 旧 Python smoke suite 的 6 个 retired Claude-layout 失败仍属于 PLAN Step 7，不是 Step 1 gate。

### Fresh Verification Evidence

Commander 在最终代码上 fresh 执行：

- `npm install`: exit 0，0 vulnerabilities；有 `ini@7.0.0` 对 Node `24.8.0` 的非阻塞 `EBADENGINE` warning。
- `npm test`: 34 passed，0 failed；5 个真实 runtime tests 在未设置 `MM_AGENT_RUNTIME` 时按设计 skip。
- `npm run build`: exit 0，TypeScript 无诊断。
- `npm run test:runtime`: 5 passed，0 failed，0 skipped；真实 OpenCode `1.18.2` 进程覆盖 Plugin/Agent/Skill、模型 Tool、fresh child read/linkage、slash/restart 和 compaction-off disk recovery。
- `npm pack --dry-run`: exit 0，49 files，约 1.9 MB packed / 2.2 MB unpacked；不含 `templates/report-generator.py`。
- `git diff --check`: exit 0；仅本文件旧工作区的 LF/CRLF 提示。
- `git diff --no-index AGENTS.md CLAUDE.md`: exit 0。
- transaction temp/backup artifacts: none；`src/tools/spike.ts`: absent。

完整逐组 RED/GREEN、sanitized runtime 命令和 review-fix 证据保存在 ignored 工作文件 `.superpowers/sdd/task-1-report.md`；持久 accepted 事实以 commit、测试和本文件为准。

### Known Concerns

- transitive `ini@7.0.0` 声明的 Node engine 不包含本机 `24.8.0`；当前 install/build/runtime 全部通过，但 `engine-strict` 环境可能拒绝安装。不要为静默 warning 在 Step 1 内改动已 pin 的 OpenCode API。
- 成功 transaction 提交后的 backup cleanup 是 best effort；极端 cleanup 失败可能留下 `.mm-agent-backup-*` snapshot，但不会破坏 committed Skill/config/receipt。后续若扩展 installer surface，应把 cleanup warning 结构化。
- 继承 partial implementation 的历史 test-first 顺序不可追溯；本轮诚实记录了 retrofit mutation RED/GREEN，未把它伪称为历史 TDD。

### In Flight

- owner: 无。
- task: 无。
- expected output: 无。
- next commander should wait for: 不需要等待任何旧 worker。

### Next Commander Action

1. 按 `AGENTS.md` 必读顺序恢复项目事实，并核对 feature worktree clean、`315c319` 存在、stash list 为空。
2. 只为 `PLAN.md` Step 2 创建明确 task brief 和隔离实现线；以 `docs/architecture/canonical-core.md` 与 `docs/context/artifact-protocol.md` 为固定规范，不重写 accepted schema。
3. 严格 test-first 实现 `src/core/` 与 CaseContextStore；优先完成 path/schema/open/dispatch/gate/inspect 的最小 contract tests。
4. Step 2 未通过独立 spec/code-quality review 前，不进入 Step 3 或 Golden Case。
5. 未获用户明确要求前不要 push；不要修改 main。

## Commit 判断

Step 1 已由独立实现 commit `315c319` 接受。本文件与活跃状态文档使用独立 docs closeout commit；不包含新的 runtime 实现，也不 push。
