# HANDOFF.md

本文件记录当前项目交接状态。它不记录 Case 运行；Case 使用 `runs/<case-id>/state.json` 和 artifact 协议。

## 当前交接状态

### Workspace

- primary worktree: `D:\0_Main\02_Coding\mm-agent`，branch `main`，本轮未修改。
- development worktree: `D:\0_Main\02_Coding\mm-agent\.worktrees\opencode-plugin-spike`，branch `feat/opencode-plugin-spike`。
- accepted baseline: `315c319 feat: validate OpenCode plugin harness`、`ab56d42 docs: record OpenCode plugin spike acceptance`、`cfda6ea feat: implement CaseContextStore contract`。
- Step 3 acceptance: 当前 HEAD 中 subject 为 `feat: implement Step 3 preflight and intake` 的里程碑提交；本文件与该提交共同构成接受事实，不依赖私人聊天。
- generated only: `node_modules/`、`dist/` 和测试临时目录；不进入 commit。
- stash: 无；本轮未 reset、stash、切换分支或修改 main。
- remote state: 未 push；未获用户明确要求前不要 push。

### Current Phase

- phase: `v1.0.0` 正式开发。
- accepted through: `PLAN.md` Step 3 Preflight 与输入整理。
- current boundary: Step 3 已收口，本次立即停止；Step 4 HMML 检索评测与运行时尚未开始。
- process rule: 根 `PLAN.md` 是结果契约；项目不使用 Superpowers，不调用 `tdd` Skill，也不强制 TDD/RED-GREEN 顺序。
- review state: commander 对最终 Step 3 diff 完成协议、安全、失败语义、package 和 runtime 审查，Critical/Important 均已关闭；本轮未使用 subagent。

### Step 3 Accepted Result

- Plugin 当前注册 `mm_agent_check` 与 `mm_agent_prepare` 两项已实现 Tool；临时 `mm_agent_spike_context` 已移除，唯一公开命令仍是 `/mm-agent`。
- `mm_agent_check` 对 Node、OpenCode/Plugin API、uv、Python 3.12、Case 写权限、HMML candidate index/cache 和真实 `templates/cumcmthesis/example.tex` 编译返回 `pass / warn / fail`、直接 evidence 与 `automatic / user / none` repair。
- Python 探测使用 `uv python find --no-project --no-python-downloads`，移除 `.venv`、Conda 与 user-site 环境影响；preflight 不安装 Python、不下载模型、不修改系统环境。
- HMML 在 Step 3 只报告 candidate index 与专用 cache 状态；没有选择 embedding 模型或构建最终索引。
- `mm_agent_prepare` 按显式路径优先、`problems/` 次之发现输入；只通过 `CaseContextStore.open` 固化输入副本、manifest、Policy、四份 Rubric 和初始 state。
- prepare 支持无新 intake 参数的兼容 Case 恢复；冲突输入/Policy、输入发现后变化、linked input、linked/unwritable `runs/`、空输入和无效 Case ID 均返回结构化失败且不发布部分 Case。
- `OpenInput` 的 transient expected size/hash 只用于在 Core copy 后绑定 discovery 事实；persisted schema 未改变，用户绝对源路径不进入 `case.json`、`state.json` 或 manifest。
- `/mm-agent` 先执行完整 preflight；存在 fail 时停止在正文前，环境无 fail 才进入 intake，并在 Step 3 结果后等待用户确认。

### Acceptance Evidence

- focused: `npx tsx --test --test-concurrency=1 tests/tools/check.test.ts tests/tools/prepare.test.ts` -> 13 passed、0 failed、0 skipped。
- full: `npm test` -> 95 passed、0 failed、5 skipped；5 个 skip 只是普通模式下未启用的 runtime tests，不作为 runtime 证据。
- build: `npm run build` -> exit 0，TypeScript 无诊断。
- runtime: `npm run test:runtime` -> 5 passed、0 failed、0 skipped；真实 OpenCode `1.18.3` 覆盖安装/发现、模型调用 Step 3 Tools、真实 CUMCM 模板 PDF、fresh-process Case recovery、built-in task、slash/restart 与 compaction-off recovery。
- package: `npm pack --dry-run --json` -> 81 files，约 1.91 MB packed / 2.51 MB unpacked；包含 `dist/tools/check*`、`dist/tools/prepare*` 与四份 Rubric，不含 tests、runs、cache、配置、凭据或 `templates/report-generator.py`。
- diff/package gates: `git diff --check`、`git diff --no-index AGENTS.md CLAUDE.md`、package forbidden-path 检查和活跃旧入口搜索通过。

### Current Machine Preflight Snapshot

- pass: Node `24.8.0`、OpenCode `1.18.3` 对固定 Plugin API `1.18.2`、uv `0.10.6`、Case write probe、真实 CUMCM XeLaTeX 编译（非空 PDF）。
- fail + automatic: Python 3.12 当前未找到。该结果证明正文会被正确阻止；它不是实现缺陷，也没有触发安装。
- warn + none: bundled HMML candidate index 可读，最终选择有意留给 Step 4，本步骤无修复动作。
- warn + automatic: 专用 cache 目录尚未创建。

### Known Limits

- Step 3 不执行环境修复；用户后续明确要求“完善”时，才可在 MM-Agent 专用 cache 中安装 uv-managed Python 或准备 cache，仍不得修改系统 Python 或用户项目。
- Step 3 不实现 HMML 检索、Compute/Compile Runtime Evidence、完整 Agents/Skills 编排或 Golden Case。
- hidden `mm-agent-spike` Agent 继续承担已接受的 Step 1 fresh-child regression；完整五角色 Agent 面属于 Step 6。
- transitive `ini@7.0.0` 的 Node engine 声明不包含本机 `24.8.0`；当前 install/build/runtime 全部通过，但 `engine-strict` 环境可能拒绝安装。
- Windows `spawnSync` timeout 不能可靠终止复杂子进程树；runtime gate 使用隔离目录和已知 OpenCode binary，若未来超时必须先确认 PID 归属。

### Next Commander Action

1. 不自动执行任何下一步骤；Step 3 已收口。
2. 只有用户明确启动 Step 4 后，才按 `PLAN.md` 的 Step 4 结果契约开展 HMML 离线评测与唯一模型选择。
3. 不重写 accepted Canonical Core，不读取用户项目 `.venv`，不 push 未经授权的分支。

## Commit 判断

Step 3 已达到单一里程碑 acceptance commit 条件。该提交后工作区应 clean；若发现额外 dirty 文件，先分类并保留用户无关改动，不得 reset 或 stash。
