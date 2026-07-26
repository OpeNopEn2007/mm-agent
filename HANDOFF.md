# HANDOFF.md

本文件记录当前项目交接状态。它不记录 Case 运行；Case 使用 `runs/<case-id>/state.json` 和 artifact 协议。

## 当前交接状态

### Workspace

- primary worktree: `D:\0_Main\02_Coding\mm-agent`，branch `main`，本轮未修改。
- development worktree: `D:\0_Main\02_Coding\mm-agent\.worktrees\opencode-plugin-spike`，branch `feat/opencode-plugin-spike`。
- current HEAD: `24fa079 feat: complete Step 6 agent orchestration`。
- accepted baseline: `315c319 feat: validate OpenCode plugin harness`、`ab56d42 docs: record OpenCode plugin spike acceptance`、`cfda6ea feat: implement CaseContextStore contract`、`5367dd0 feat: implement Step 3 preflight and intake`、`1998db6 feat: complete Step 4 HMML retrieval runtime`。
- generated only: `node_modules/`、`dist/` 和测试临时目录；不进入 commit。
- Step 7 checkpoint scope: `package.json`、`scripts/run-golden-case.mjs`、`scripts/golden-resume.mjs`、`scripts/mmbench-validate.mjs`、`scripts/prepare-mmbench-2024-c.mjs`、`scripts/validate-config.mjs`、`rubrics/`、`skills/mm-report/SKILL.md`、相关 `src/` 与 `tests/`、`README.md`、`CHANGELOG.md`、本文件。旧 `tests/mmbench_validate.py` 与 `tests/mmbench-validation.yaml` 已由 Step 7 runner 替代并删除。
- `AGENTS.md` 与 `CLAUDE.md` 是进入本轮前已有的其他会话改动，不属于 Step 7 checkpoint；继续保留在工作区，不纳入 commit。
- remote handoff target: `origin/feat/opencode-plugin-spike`。用户已授权为换机恢复创建并 push 当前 checkpoint；它不是 Step 7 acceptance commit。

### Current Phase

- phase: `v1.0.0` 正式开发。
- accepted through: `PLAN.md` Step 6 Skills、Agents 与四阶段编排。
- current boundary: Step 7 Golden Case 实现与本地验证进行中；不进入 Step 8，且不得在独立验收前创建 acceptance commit。
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
- Compile fallback 已覆盖 `latexmk` 存在但失败、超时或无非空 PDF 的路径；同一 manifest 按命令保留 latexmk/xelatex 的 stdout、stderr、exit code 和 timeout。
- Reporting Gate 要求同一 Attempt 的成功 Compile Evidence 与 candidate `compile.log`/`report.pdf` hash 匹配，不能通过手工 PDF 绕过。

### Step 5 Acceptance Evidence

- focused: `npx tsx --test --test-concurrency=1 tests/tools/compute.test.ts tests/tools/compile.test.ts tests/core/case-context-store.test.ts` -> 53 passed、0 failed。
- full: `npm test` -> 106 passed、0 failed、8 skipped；8 个 skip 是未显式启用的 OpenCode model 或真实 Local Runtime gates。
- build: `npm run build` -> exit 0，TypeScript 无诊断。
- real local runtime: `MM_AGENT_REAL_RUNTIME=1 npx tsx --test --test-concurrency=1 tests/tools/runtime-evidence.real.test.ts` -> 2 passed、0 failed；覆盖专用 Python 成功/失败/超时和真实 latexmk 成功/失败。
- fallback regression: `latexmk` 启动失败 fixture 后，真实 xelatex 三遍生成 PDF；完整 manifest 同时保留两种引擎 Evidence。
- OpenCode runtime: `npm run test:runtime` -> isolated install/discovery 1 passed；5 个模型调用因无 `MM_AGENT_MINIMAX_API_KEY` 安全 skipped。它们在提供该变量时使用临时 provider config 与 `minimax/MiniMax-M3 --variant thinking --thinking`，不读取全局凭据。

### Step 6 Accepted Result / Acceptance Evidence

- Plugin config hook 注册五个 hidden Agent：`mm-analyst`、`mm-modeler`、`mm-solver`、`mm-writer`、`mm-critic`。所有角色在顶层 `*` deny 后只显式放开必要 read/glob/grep、edit、角色 Runtime Tool 与对应 Skill；未列出的 Tool、webfetch/websearch/lsp/external_directory/question 保持 deny。Actor 的 edit 仅放开对应角色的 `attempts/**` candidate 路径，再明确拒绝 `context.json` 与 `review.json`；Critic 完全只读。
- `mm_agent_case` 直接调用 `FileCaseContextStore.open / dispatch / gate / inspect`，不创建状态、路径或 schema 副本；未知 Review schema version 原样交由 Core 拒绝。
- `mm_agent_hmml` 的 `case_id` 路径会读取唯一 active Modeling Manifest，并只允许 promotion target 为 `tasks/<task-id>/retrieved-methods.json` 的 candidate；stable task 路径、`modeling-scheme.md`、其他 Attempt、其他 Case、绝对路径、`..` 和链接 escape 均被拒绝。Step 4 provenance、dense/BM25 语义不变。
- 安装器受 receipt/hash 保护地安装四份 Skill：`mm-agent`、`mm-hmml`、`mm-compute`、`mm-report`。它接受已验 hash 的旧单 Skill receipt；升级前仍检查旧拥有文件和三个未拥有的新 Skill 冲突，随后通过既有事务更新四 Skill receipt。`mm-agent` 指挥 Actor/Critic 复用同一 Attempt Manifest、按 DAG wave dispatch Solver，并要求 Writer 以 Compile Evidence 进入 Reporting Gate。
- OpenCode 当前没有按动态 Manifest read set 或单 Attempt ID 授权的证据：Role prompt 指导 read set，Core Gate 校验 required reads、allowed writes 和 promotion；不把这一层称为宿主 read 强制。
- focused regression: `npx tsx --test --test-concurrency=1 tests/tools/hmml.test.ts tests/plugin-spike.test.ts` -> 44 passed、0 failed、6 skipped；覆盖权限 pattern 顺序/角色 Attempt 白名单、真实 `mm_agent_hmml` Modeling candidate 写入、旧 receipt 成功升级、冲突保留和事务回滚。
- full local regression: `npm test` -> 113 passed、0 failed、8 skipped。skipped 为未启用的 OpenCode model 或 opt-in Local Runtime tests，不是 runtime 通过。
- build: `npm run build` -> exit 0。
- real OpenCode runtime: `npm run test:runtime` -> 1 passed、0 failed、5 skipped。通过安装后的真实 OpenCode `debug agent` 发现五个 hidden Agent、`debug skill` 发现四份已安装 Skill；五个模型执行项因未提供 `MM_AGENT_MINIMAX_API_KEY` 安全 skipped，未读取全局凭据。安装/发现不是完整四阶段 runtime。
- DeepSeek V4 Pro host runtime 使用已配置的 `deepseek/deepseek-v4-pro`，未显式传递 variant。真实 Actor -> Critic -> Gate production flow 通过：Main sessions `ses_07196331bffeZkzEzsnTNfh5qX`、`ses_07195e081ffeyYr876C6Ig3PgI`、`ses_07194ef6effezItKVh7LyWWMta`；Actor `ses_071958d0dffeYffS4Cx1Qf2ggm` 与 Critic `ses_071945395ffe4u4nJby9rUpc0b` 复用 `analysis-001`。Gate `outcome: pass`，写入 `review.json`，提升三份 analysis artifacts，state 为 revision `1`、stage `modeling`；Critic 无写入且未创建第二 Attempt。
- 该 runtime 的自动测试最初只因 Session 1 输出 marker 带末尾 `.` 而产生 false negative；生产 flow 已通过。测试现严格规范化 marker 的首尾空白、单层 inline/fenced code 和单个 `.`/`。`/`!` 终止符，拒绝任何额外文字或相似 marker。修复后仅执行无模型回归，未重复任何付费模型调用。
- 最新收口验证：marker/Step 6 focused 4 passed；`npm test` 114 passed、0 failed、9 skipped；`npm run build` 通过；`npm pack --dry-run --json` 130 files；`git diff --check` 与 `git diff --no-index AGENTS.md CLAUDE.md` 通过。

### Step 7 In-Progress Result / Runtime Evidence

- `scripts/run-golden-case.mjs` 以真实 OpenCode `task`、五个角色、HMML、Compute、Compile 和 `mm_agent_case` Gate 驱动 minimal 与 multi-wave fixture；仅 Agent 写 candidate，Critic 返回 Review，Gate 提升 stable artifact。`--model`、`--variant` 和 `--timeout-ms` 都是可选的；缺省时 runner 不传模型相关参数，trace 只记 `host-default`。失败运行保留脱敏 Tool state、session IDs、stdout/stderr、timeout 和临时项目。
- `--resume <project-or-trace>` 先在 fresh OpenCode session 调用 `inspect`，随后从 `state.json`、accepted artifact、active Attempt 与 DAG 恢复：accepted scope 永不重派；active scope 复用既有 Attempt；Solving 只处理 current wave 未接受 task；completed Case 只执行 completion inspect。resume planner 的无模型回归覆盖 Solver revision、后续 wave、Reporting 和 completed evidence。
- multi-wave runner 并行 dispatch/Actor/Critic，并在每个 wave 内串行 Gate；它读取 `task-total` Manifest，断言只包含直接依赖 `tasks/task-a/memory.json`。
- 旧 `tests/mmbench_validate.py` 和 `tests/mmbench-validation.yaml` 已删除：它们仅服务旧 `.planning/`/Claude 假设，已由 Step 7 runner 替代。
- 先前真实 minimal run 使用过当时的显式 DeepSeek 配置，证明 prepare、Analysis、Modeling、HMML dense retrieval、fresh Critic 和 Gate；初次 Critic 路径前缀错误与 modeling rubric revise 均由真实 Critic 暴露，runner 已修正并以 Gate-first revision 处理。当前 runner 不绑定该 provider 或 variant。
- 最新真实 minimal run 在 Solver revision 的 fresh Critic 调用收到 provider HTTP 402 `Insufficient Balance`，因此没有完成、没有非空 PDF，也不算 runtime 通过。未重试；临时运行证据保留在本机运行目录，未写入项目文档。
- 官方 MM-Bench `2024_C` 输入由 `scripts/prepare-mmbench-2024-c.mjs` 准备到 OS cache 或 `MM_AGENT_MMBENCH_CACHE_DIR`，不进入仓库或 npm 包。provenance 固定官方 repository、problem/dataset URLs、upstream commit、retrieval date；README 的 CC BY-NC 4.0 声明与 root LICENSE 的 GPL-3.0 文本并列记录，`redistribution: false`，不作法律结论。
- MM-Bench runner 显式接收 `--mmbench-problem`、`--mmbench-dataset`、`--mmbench-provenance` 三个文件，在 `scripts/mmbench-validate.mjs` 中校验三者是普通文件、provenance 字段齐全且 `redistribution === false`、题目 JSON 的 `dataset_path` 严格包含所提供 CSV 的文件名；runner 将三者一起复制到临时 Golden project 并交付给 `mm_agent_prepare`，因此 Solver 与 Reporter 都通过 Canonical input facts 访问题目与数据集。
- `canonicalTaskMemoryFields` 在 minimal、multi-wave 与 resume 三条 Solver 路径共享同一文本；rubrics/solving.md 明确 Canonical TaskMemory schema 必填字段、Critical/required fixes 与 Gate 最终权威；`npm run validate-config` 通过最小解析+字段断言无模型校验该契约并在 exit 0；其结果是 contract 字段数组 + 来源数组。无运行期 OpenCode 调用。
- Gate A 已由真实 MiniMax M3 Thinking runtime 接受：`reporting-002` 的 Compile Evidence 为 `exit_code: 0`，fresh Critic verdict 为 `pass`，Gate 提升 reporting artifacts，minimal Case 达到 revision `5`、status `completed`。这项结果替代此前 Gate A 未验证/失败的旧状态；不要重跑或重建 minimal Case。
- Gate B 已通过真实 runtime 接受 Analysis 与 Modeling，并推进到 multi-wave Solver `task-a`。当前阻塞属于确定性的 Review 传递边界：导出的 Gate Tool input 可见 `review.schema_version: 1`，但 Core 在处理 `revise` Review 时报告 `schema_version undefined is unsupported`。现有证据排除 Critic 输出内容和 provider 调用失败，但尚未定位字段是在 Runner、OpenCode Tool schema、Adapter mapping 还是 Core 调用前丢失。没有修改 Canonical schema，也没有执行破坏性操作。
- Gate B 的下一项修复必须先用无模型回归穿过真实 Plugin Tool `execute -> runCaseAction -> Core Gate`，逐层记录同一 Review，并只修复被证据证明丢失字段的边界；不得以默认补 `schema_version: 1`、放宽 Core 或仅加 assertion 作为修复。无模型验证通过后再恢复同一 multi-wave Case；Gate B 通过后继续材料齐备的 Gate C MM-Bench。
- 2026-07-26 换机 checkpoint 的 fresh 无模型验证：`npm test` 为 144 passed、0 failed、9 opt-in runtime skipped；`npm run build`、`npm run validate-config`、`npm pack --dry-run --json`（130 entries）与 `git diff --check` 均通过。skipped 不计为 Gate B 或 Gate C runtime 证据。
- Step 7 当前仅 Gate A 被接受；Gate B 与 Gate C 未接受，因此这个换机 checkpoint 不代表 Step 7 完成，也不得进入 Step 8。

### Step 3 Machine Preflight Snapshot

- pass: Node `24.8.0`、OpenCode `1.18.3` 对固定 Plugin API `1.18.2`、uv `0.10.6`、Case write probe、真实 CUMCM XeLaTeX 编译（非空 PDF）。
- fail + automatic: Python 3.12 当前未找到。该结果证明正文会被正确阻止；它不是实现缺陷，也没有触发安装。
- warn + none: bundled HMML candidate index 可读，最终选择有意留给 Step 4，本步骤无修复动作。
- warn + automatic: 专用 cache 目录尚未创建。

### Known Limits

- Preflight 的 `uv python find` 仍只探测已登记的解释器；本机的 Step 5 专用 Python 已存在于 MM-Agent cache，但不改变 Step 3 的无下载、无 project discovery 语义。
- Step 6 尚未执行 Golden Case；该工作只属于 Step 7。
- transitive `ini@7.0.0` 的 Node engine 声明不包含本机 `24.8.0`；当前 install/build/runtime 全部通过，但 `engine-strict` 环境可能拒绝安装。
- Windows `spawnSync` timeout 不能可靠终止复杂子进程树；runtime gate 使用隔离目录和已知 OpenCode binary，若未来超时必须先确认 PID 归属。
- Step 4 的 41 条典型方法查询保留为 `label_status: proposed` 的 `hmml-smoke.json`；它只用于回归烟雾测试，不能用于 GTE/BGE-M3 模型选型。
- 方法目录中的 Linear Programming `0/38` 与 Entropy Weight `89/90` 已作为两个 `proposed` 等价概念组记录，并纳入正式独立模型复核范围，没有冒充人工确认。
- 正式模型选型提案 `hmml-eval.json` 已落盘：40 组配对中英场景、80 条 query、29 组多相关场景和 11 组单一严格 relevant 场景，覆盖 56/95 个等价方法概念；修订后固定内容 hash 为 `9d25ae6d71547473bb9cf1ef3726d9154293672cbe93401318a68fbf6a52a02f`。
- DeepSeek V4 Pro 初审全部批准，GPT-5.6-Sol high 提出 15 项 Important；全部保守落实后，两者对新 hash 的 80 条 query 和两个等价组均最终批准，状态为 `ai-adjudicated`。
- GTE Recall@5 `0.8125`、MRR `0.7660268`；BGE-M3 Recall@5 `0.6875`、MRR `0.6984718`。最终选择 GTE；固定 revision `f48be033386d222715f74de68ba1d31b51f19f3a`、768 维、132 embedding rows、index hash `e2aa5a2b1883a1cdef6a0518fd3d1fd574d3315c2f278cd25648fd0b10896d16`，独立重建一致。
- `mm_agent_hmml` 已在真实固定 cache 上通过 dense 检索，并在隔离空 cache 的真实 OpenCode gate 中通过明确标记的 BM25 降级；最终 package 只发布 GTE 三件套，不包含权重或 BGE 候选索引。

### Next Commander Action

1. 在新电脑 checkout `origin/feat/opencode-plugin-spike`，读取本文件并确认 Step 7 checkpoint、Golden Case 外部输入与模型配置；本机 `%TEMP%` Case/trace 不随 Git 迁移，不能把它们当作跨机恢复事实。
2. 为 Gate B 增加无模型 Plugin Tool 边界回归，定位 `review.schema_version` 从可见 Tool input 到 Core 之间的实际丢失点；只修复该层并运行 focused tests、`npm test`、`npm run build`、`npm run validate-config` 与 `git diff --check`。
3. 无模型证据通过后，以 Runtime General 使用 `minimax/MiniMax-M3 --variant thinking` 执行新的 multi-wave Gate B；它不是对旧临时 Case 的跨机 resume。Gate B 通过后准备并执行 Gate C MM-Bench。
4. 不重写 accepted Canonical Core，不读取用户项目 `.venv`，不进入 Step 8。

### Cross-Machine Recovery Brief

- Git 是换机后的唯一同步事实源。新电脑执行 `git fetch origin`，然后 checkout/track `origin/feat/opencode-plugin-spike`；不要从 `main` 重新做 Step 7，也不要创建另一个实现分支。开始前确认 `git branch --show-current`、`git status --short` 和本文件。
- 当前 checkpoint 是 work in progress，不是 Step 7 acceptance。已经接受的 runtime 事实只有 Gate A minimal completed；Gate B 的 Analysis/Modeling 已跑通但 Solver revise Review 在 Tool/Adapter/Core 边界丢失 `schema_version`；Gate C 未执行。不得把无模型测试、skipped runtime 或配置检查称作 Gate B/C 通过。
- 原电脑的 Golden Case、trace、OpenCode Session、MM-Bench cache 和 provider 配置都在机器本地，不在 Git 中。不要把文档中的摘要误当作可恢复的 Case 文件；新电脑需要重新安装依赖、确认 OpenCode/TeX/uv/Python，并建立新的 multi-wave runtime 证据。
- MM-Bench 官方题目、CSV 与 provenance 因 redistribution 约束不进入仓库。先运行 `node scripts/prepare-mmbench-2024-c.mjs --help`，在新电脑重新准备外部材料；Gate C 只接受显式的 `--mmbench-problem`、`--mmbench-dataset`、`--mmbench-provenance`。
- 开发主会话使用 GPT-5.6-Terra medium 负责架构、关键代码、派发与审计；它可以直接修改高耦合或一次写准更省成本的代码。边界清楚、机械、长时间或真实 runtime 工作优先派给 OpenCode `General`；General 使用本机配置的 `minimax/MiniMax-M3` Thinking，不得嵌套 `task`，不得自行宣布里程碑接受。
- 允许“诊断 -> 确定性修复 -> 无模型验证 -> 新 runtime 验证”的循环。禁止的是没有新证据和新修复的盲目相同重跑；一次 runtime 失败不是自动停止条件。真正外部阻塞（认证/余额/服务、缺少 MM-Bench 外部输入、需要 Canonical schema migration 或破坏性操作授权）才交回用户。
- 项目不使用 Superpowers，也不调用 `tdd` Skill；不强制 RED/GREEN 流程。结果标准仍是 `PLAN.md` 的可观察交付和 Gate 证据。
- `AGENTS.md` 与 `CLAUDE.md` 的本机其他会话改动没有进入本 checkpoint。新电脑以远端文件为准；需要保留的协作事实已经写在本节，不依赖那两份未提交改动。
- 新开发会话的首要任务不是再次运行付费模型，而是构造一个无模型回归，真实穿过 Plugin Tool `execute -> runCaseAction -> Core Gate`，用 `verdict: revise` 且 `schema_version: 1` 的 Review 找到字段丢失位置。只有这个回归定位并修复后，才由 General 运行新的 Gate B。

## Commit 判断

本次按用户明确授权创建一个 Step 7 work-in-progress checkpoint 并 push 到 `origin/feat/opencode-plugin-spike`，用于换机继续。该 commit 不得标记为 Step 7 accepted；`AGENTS.md` 与 `CLAUDE.md` 的其他会话改动保留在本机工作区且不纳入 checkpoint。
