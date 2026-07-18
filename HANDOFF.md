# HANDOFF.md

本文件记录当前项目交接状态。它不记录 Case 运行；Case 使用 `runs/<case-id>/state.json` 和 artifact 协议。

## 当前交接状态

### Workspace

- primary worktree: `D:\0_Main\02_Coding\mm-agent`，branch `main`，仍停在 `cb72307`；本轮未修改 main。
- development worktree: `D:\0_Main\02_Coding\mm-agent\.worktrees\opencode-plugin-spike`，branch `feat/opencode-plugin-spike`。
- latest accepted commits: `315c319 feat: validate OpenCode plugin harness`、`ab56d42 docs: record OpenCode plugin spike acceptance`，以及包含本文件的 `feat: implement CaseContextStore contract` Step 2 里程碑。
- dirty state: 包含本文件的 Step 2 里程碑提交完成后应为 clean；`node_modules/`、`dist/`、`.superpowers/` 和测试 cache 为 ignored/generated。
- linked worktrees: 仅上述 main 与 feature worktree。
- stash: 无。早期 `docs: define OpenCode harness architecture` stash 已确认被 `4ce82cd` 与 `1040e63` 的 accepted 设计取代，并按用户明确授权在本轮 docs closeout 后删除。
- remote state: 本轮没有 push；未获用户明确要求前不要 push。

### Current Phase

- phase: `v1.0.0` 正式开发。
- accepted step: `PLAN.md` Step 2 CaseContextStore 与文件契约。
- next step: Step 3 Preflight 与输入整理，尚未开始；本轮停在 Step 2，不进入 Step 3。
- forbidden next scope: Step 3 gate 通过前，不进入 HMML、Compute/Compile、四阶段编排或 Golden Case。
- worker state: 无活动 worker；Step 2 的独立 Terra/high spec review 与 code-quality/security review 均已通过，所有 Critical/Important 均关闭。

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

### Step 1 Accepted Verification Evidence

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

### Step 2 Accepted Evidence

- 实现位于 `src/core/schema.ts`、`paths.ts`、`migrations.ts`、`context-recipes.ts` 和 `case-context-store.ts`；其唯一公开 contract 是 `open`、`dispatch`、`gate`、`inspect`。
- 已覆盖 schema/migration、Case-relative 路径和 realpath/junction 防逃逸、原子写入、Case lock/CAS、durable Gate transaction、Attempt/Review/Role Recipe、Solver read set、预算/blocker、DAG/wave、Task Memory/Runtime Evidence、阶段推进和 completion evidence。`zod` 已直接固定为 `4.1.8`。
- 前两轮独立 review 的已修问题：required read reconstruction、transaction cleanup ordering、Solver context 最小化与 Runtime Evidence、future-wave DAG、Case-root junction、crash-durable Gate transaction、跨 Store dispatch lock/staging collision。
- 最终 Terra/high 复核另发现并修复：崩溃遗留与多竞争者 stale `state.lock` 回收、terminal Case 仍接受旧 sibling Gate、candidate/Review/promotion 父目录与 transaction staging junction TOCTOU、committed transaction 残留阻断只读恢复、Modeler 遗漏 immutable input 与任务级 retrieval evidence。Case lock 以唯一 choosing/request 文件的 bakery-style ticket 队列排序，每个 contender 只删除自己的文件或 dead-PID 的唯一请求，只有队首能处理 legacy `state.lock` 并 hard-link 完整 owner metadata；candidate 在 staging 前后绑定原 hash，Review 先写入绑定的 Attempt 临时文件；promotion 在未发布 preparation 中构建稳定根快照，发布后验证 transaction、next root 与原 stable root identity 再 atomic swap。
- 当前普通回归：`npm test` 于 2026-07-18 通过，`81 passed`、`0 failed`、`5 skipped`（这 5 个是未设置 `MM_AGENT_RUNTIME` 时按设计跳过的真实 OpenCode tests）。
- runtime 启动问题已做一个 RED/GREEN 切口：隔离 OpenCode 进程会在 `models.dev` 目录抓取超时时挂起；`runtimeEnvironment()` 现固定 `OPENCODE_DISABLE_MODELS_FETCH=1`，其 focused 环境测试先 RED（变量缺失）后 GREEN。该变量是 OpenCode 官方 CLI 环境变量，用于禁用远程模型源抓取。
- 本机 OpenCode 从 `1.18.2` 更新到 `1.18.3` 后，runtime gate 不再把宿主 patch 硬编码为 API patch；它要求宿主与固定的 `@opencode-ai/plugin@1.18.2` 同 major/minor 且宿主 patch 不低于 API patch。
- `npm run test:runtime` 于 2026-07-18 通过，`5 passed`、`0 failed`、`0 skipped`；覆盖隔离安装和 Plugin/Agent/Skill discovery、真实模型 Tool、built-in `task` fresh child、slash/restart 和 compaction-off recovery。这 5 项是 Step 1 Adapter regression，不是 CaseContextStore 的直接 runtime exercise。
- `npm pack --dry-run --json` 为 69 files，其中 20 个 `dist/core/*` 文件；不含 tests、runs、cache、配置或凭据。

### Known Concerns

- transitive `ini@7.0.0` 声明的 Node engine 不包含本机 `24.8.0`；当前 install/build/runtime 全部通过，但 `engine-strict` 环境可能拒绝安装。不要为静默 warning 在 Step 1 内改动已 pin 的 OpenCode API。
- 成功 transaction 提交后的 backup cleanup 是 best effort；极端 cleanup 失败可能留下 `.mm-agent-backup-*` snapshot，但不会破坏 committed Skill/config/receipt。后续若扩展 installer surface，应把 cleanup warning 结构化。
- 继承 partial implementation 的历史 test-first 顺序不可追溯；本轮诚实记录了 retrofit mutation RED/GREEN，未把它伪称为历史 TDD。
- Windows 上 `spawnSync` 的超时时间不能可靠地终止 OpenCode 子进程树；若 runtime command 再次超时，先用命令行和临时目录确认 PID 归属，再只结束该测试产生的树，避免影响用户的 OpenCode 实例。

### In Flight

- owner: 无。
- task: 无。
- expected output: 无。
- next commander should wait for: 不需要等待旧 worker。

### Next Commander Action

1. 在 `D:\0_Main\02_Coding\mm-agent\.worktrees\opencode-plugin-spike`、branch `feat/opencode-plugin-spike` 恢复工作，并确认 Step 2 milestone commit、clean status 和空 stash。
2. 下一轮按 `PLAN.md` 第 3 步为 Preflight 与输入整理制定里程碑计划；不要复用或重写 CaseContextStore 的 accepted schema。
3. Step 3 必须真实检查 Node/OpenCode、uv/Python、Case 可写性、HMML cache 和 TeX 编译能力，并安全复制输入；不得读取用户项目 `.venv`。
4. 继续遵守一个完整里程碑一次 commit、未经用户要求不 push、不修改 main 的约束。

## Commit 判断

Step 1 已由 `315c319` 接受，Step 1 文档收口为 `ab56d42`。包含本文件的唯一 `feat: implement CaseContextStore contract` 里程碑提交接受 Step 2；未 push，Step 3 尚未开始。
