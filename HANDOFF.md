# HANDOFF.md

本文件记录当前项目交接状态。它不记录 Case 运行；Case 使用 `runs/<case-id>/state.json` 和 artifact 协议。

## 当前交接状态

### Workspace

- primary worktree: `D:\0_Main\02_Coding\mm-agent`，branch `main`，本轮未修改。
- development worktree: `D:\0_Main\02_Coding\mm-agent\.worktrees\opencode-plugin-spike`，branch `feat/opencode-plugin-spike`。
- accepted baseline: `315c319 feat: validate OpenCode plugin harness`、`ab56d42 docs: record OpenCode plugin spike acceptance`、`cfda6ea feat: implement CaseContextStore contract`、`5367dd0 feat: implement Step 3 preflight and intake`、`1998db6 feat: complete Step 4 HMML retrieval runtime`。
- generated only: `node_modules/`、`dist/` 和测试临时目录；不进入 commit。
- stash: 无；本轮未 reset、stash、切换分支或修改 main。
- remote state: 未 push；未获用户明确要求前不要 push。

### Current Phase

- phase: `v1.0.0` 正式开发。
- accepted through: `PLAN.md` Step 5 Compute/Compile Runtime Evidence。
- current boundary: Step 5 Compute/Compile Runtime Evidence 已收口；立即停止，不进入 Step 6 Agents/Skills 编排或 Golden Case。
- process rule: 根 `PLAN.md` 是结果契约；项目不使用 Superpowers，不调用 `tdd` Skill，也不强制 TDD/RED-GREEN 顺序。
- collaboration guidance: 开发期用提示词引导 Build 与 General 分工，不将模型或思考档位写成项目固定依赖。Build 倾向负责范围、决策、验收和核心构建；General 倾向协助边界明确、可验证的高工作量任务。
- review state: Step 5 以结果契约、路径安全、失败语义、package 和真实 Local Runtime gate 收口；OpenCode 模型 runtime 使用隔离 MiniMax M3 Thinking 配置，未提供显式测试凭据时安全跳过模型调用。

### Step 3 Accepted Result

- Plugin 当前注册 `mm_agent_check` 与 `mm_agent_prepare` 两项已实现 Tool；临时 `mm_agent_spike_context` 已移除，唯一公开命令仍是 `/mm-agent`。
- `mm_agent_check` 对 Node、OpenCode/Plugin API、uv、Python 3.12、Case 写权限、HMML candidate index/cache 和真实 `templates/cumcmthesis/example.tex` 编译返回 `pass / warn / fail`、直接 evidence 与 `automatic / user / none` repair。
- Python 探测使用 `uv python find --no-project --no-python-downloads`，移除 `.venv`、Conda 与 user-site 环境影响；preflight 不安装 Python、不下载模型、不修改系统环境。
- HMML 在 Step 3 只报告 candidate index 与专用 cache 状态；没有选择 embedding 模型或构建最终索引。
- `mm_agent_prepare` 按显式路径优先、`problems/` 次之发现输入；只通过 `CaseContextStore.open` 固化输入副本、manifest、Policy、四份 Rubric 和初始 state。
- prepare 支持无新 intake 参数的兼容 Case 恢复；冲突输入/Policy、输入发现后变化、linked input、linked/unwritable `runs/`、空输入和无效 Case ID 均返回结构化失败且不发布部分 Case。
- `OpenInput` 的 transient expected size/hash 只用于在 Core copy 后绑定 discovery 事实；persisted schema 未改变，用户绝对源路径不进入 `case.json`、`state.json` 或 manifest。
- `/mm-agent` 先执行完整 preflight；存在 fail 时停止在正文前，环境无 fail 才进入 intake，并在 Step 3 结果后等待用户确认。

### Step 3 Acceptance Evidence

- focused: `npx tsx --test --test-concurrency=1 tests/tools/check.test.ts tests/tools/prepare.test.ts` -> 13 passed、0 failed、0 skipped。
- full: `npm test` -> 95 passed、0 failed、5 skipped；5 个 skip 只是普通模式下未启用的 runtime tests，不作为 runtime 证据。
- build: `npm run build` -> exit 0，TypeScript 无诊断。
- runtime: `npm run test:runtime` -> 5 passed、0 failed、0 skipped；真实 OpenCode `1.18.3` 覆盖安装/发现、模型调用 Step 3 Tools、真实 CUMCM 模板 PDF、fresh-process Case recovery、built-in task、slash/restart 与 compaction-off recovery。
- package: `npm pack --dry-run --json` -> 81 files，约 1.91 MB packed / 2.51 MB unpacked；包含 `dist/tools/check*`、`dist/tools/prepare*` 与四份 Rubric，不含 tests、runs、cache、配置、凭据或 `templates/report-generator.py`。
- diff/package gates: `git diff --check`、`git diff --no-index AGENTS.md CLAUDE.md`、package forbidden-path 检查和活跃旧入口搜索通过。

### Step 5 Accepted Result

- Plugin 注册 `mm_agent_compute` 与 `mm_agent_compile`；两者只接受当前 Case 的 solving/reporting Attempt 路径，拒绝 Case 外、入口/输出 escape 和 link。
- Compute 固定使用 MM-Agent 专用 Python 3.12，净化 `.venv`、Conda 与 user-site 环境；每次写入命令、环境、stdout、stderr、exit、timeout、输入/输出 hash 的 Evidence manifest，并更新 Attempt `execution-result.json` Runtime Evidence 引用。
- Compile 优先 `latexmk -xelatex`，缺失时最多三遍 `xelatex`；每次删除旧 PDF，只将新非空 `main.pdf` 改名为 `report.pdf`，写入完整 `compile.log`、结构化错误和 Evidence manifest。
- Reporting Gate 要求同一 Attempt 的成功 Compile Evidence 与 candidate `compile.log`/`report.pdf` hash 匹配，不能通过手工 PDF 绕过。

### Step 5 Acceptance Evidence

- focused: `npx tsx --test --test-concurrency=1 tests/tools/compute.test.ts tests/tools/compile.test.ts tests/core/case-context-store.test.ts` -> 53 passed、0 failed。
- full: `npm test` -> 106 passed、0 failed、8 skipped；8 个 skip 是未显式启用的 OpenCode model 或真实 Local Runtime gates。
- build: `npm run build` -> exit 0，TypeScript 无诊断。
- real local runtime: `MM_AGENT_REAL_RUNTIME=1 npx tsx --test --test-concurrency=1 tests/tools/runtime-evidence.real.test.ts` -> 2 passed、0 failed；覆盖专用 Python 成功/失败/超时和真实 latexmk 成功/失败。
- OpenCode runtime: `npm run test:runtime` -> isolated install/discovery 1 passed；5 个模型调用因无 `MM_AGENT_MINIMAX_API_KEY` 安全 skipped。它们在提供该变量时使用临时 provider config 与 `minimax/MiniMax-M3 --variant thinking --thinking`，不读取全局凭据。

### Step 3 Machine Preflight Snapshot

- pass: Node `24.8.0`、OpenCode `1.18.3` 对固定 Plugin API `1.18.2`、uv `0.10.6`、Case write probe、真实 CUMCM XeLaTeX 编译（非空 PDF）。
- fail + automatic: Python 3.12 当前未找到。该结果证明正文会被正确阻止；它不是实现缺陷，也没有触发安装。
- warn + none: bundled HMML candidate index 可读，最终选择有意留给 Step 4，本步骤无修复动作。
- warn + automatic: 专用 cache 目录尚未创建。

### Known Limits

- Preflight 的 `uv python find` 仍只探测已登记的解释器；本机的 Step 5 专用 Python 已存在于 MM-Agent cache，但不改变 Step 3 的无下载、无 project discovery 语义。
- Step 5 不实现完整 Agents/Skills 编排或 Golden Case。
- `tests/mmbench-validation.yaml` 仍保存旧 `.planning/` fixture 路径，且不被 `npm test` 或 Step 5 gate 调用；按 `PLAN.md` Step 7 的旧 v0 fixture 清理边界处理，未在本里程碑扩展范围。
- hidden `mm-agent-spike` Agent 继续承担已接受的 Step 1 fresh-child regression；完整五角色 Agent 面属于 Step 6。
- transitive `ini@7.0.0` 的 Node engine 声明不包含本机 `24.8.0`；当前 install/build/runtime 全部通过，但 `engine-strict` 环境可能拒绝安装。
- Windows `spawnSync` timeout 不能可靠终止复杂子进程树；runtime gate 使用隔离目录和已知 OpenCode binary，若未来超时必须先确认 PID 归属。
- Step 4 的 41 条典型方法查询保留为 `label_status: proposed` 的 `hmml-smoke.json`；它只用于回归烟雾测试，不能用于 GTE/BGE-M3 模型选型。
- 方法目录中的 Linear Programming `0/38` 与 Entropy Weight `89/90` 已作为两个 `proposed` 等价概念组记录，并纳入正式独立模型复核范围，没有冒充人工确认。
- 正式模型选型提案 `hmml-eval.json` 已落盘：40 组配对中英场景、80 条 query、29 组多相关场景和 11 组单一严格 relevant 场景，覆盖 56/95 个等价方法概念；修订后固定内容 hash 为 `9d25ae6d71547473bb9cf1ef3726d9154293672cbe93401318a68fbf6a52a02f`。
- DeepSeek V4 Pro 初审全部批准，GPT-5.6-Sol high 提出 15 项 Important；全部保守落实后，两者对新 hash 的 80 条 query 和两个等价组均最终批准，状态为 `ai-adjudicated`。
- GTE Recall@5 `0.8125`、MRR `0.7660268`；BGE-M3 Recall@5 `0.6875`、MRR `0.6984718`。最终选择 GTE；固定 revision `f48be033386d222715f74de68ba1d31b51f19f3a`、768 维、132 embedding rows、index hash `e2aa5a2b1883a1cdef6a0518fd3d1fd574d3315c2f278cd25648fd0b10896d16`，独立重建一致。
- `mm_agent_hmml` 已在真实固定 cache 上通过 dense 检索，并在隔离空 cache 的真实 OpenCode gate 中通过明确标记的 BM25 降级；最终 package 只发布 GTE 三件套，不包含权重或 BGE 候选索引。

### Next Commander Action

1. 不自动进入 Step 6；等待用户明确启动 Agents/Skills 编排。
2. 后续使用 `runtime/hmml-manifest.json` 与 `runtime/evaluation/summary.json` 恢复 Step 4 的固定模型、索引和评测事实。
3. 不重写 accepted Canonical Core，不读取用户项目 `.venv`，不 push 未经授权的分支。

## Commit 判断

Step 5 已达到单一里程碑 acceptance commit 条件；全部最终 gate 通过后只创建一个 acceptance commit，不 push。
