# HANDOFF.md

本文件记录项目交接状态，不代替 Case 内的 `state.json`、Attempt、Review 或 Runtime Evidence。字段级协议见 `docs/context/artifact-protocol.md`。

## 当前状态

- workspace：`E:\Study\CodingWorkSpace\mm-agent\opencode-plugin-spike`
- branch：`feat/opencode-plugin-spike`；本 checkpoint 的父提交为 `bd30cb7`，当前交接应以 Git HEAD 和工作树为准。
- milestone：Step 1–8、Gate A/B/C 和本机 RC 已留下验收证据；这些证据证明 Core 与 Golden runner 能闭环，不再被解释为正式 `/mm-agent` 用户路径已经稳定。
- 本 checkpoint 归档 Step 7/8、RC1/RC2、文档与旧资产清理；没有 tag、push 或 npm publish。
- 唯一用户入口仍是 `/mm-agent`；五个 hidden Agents、六个 Tools、四个 Skills 和 Canonical Core 公共接口未改变。
- RC1 首次独立 B 题体验在 Analysis 写入边界判定 No-Go；根因已修复并形成隔离 RC2。NKUMMF 2025 C 非 Git 独立现场真实通过 preflight、intake、Analysis Actor/Critic/Gate，但没有完成 Modeling→Reporting，不能作为完整用户体验通过。

## 下一阶段：正式运行面收敛

- 用户真正需要的是：在 OpenCode 注册五个专业 hidden Agents，为每个 Agent 配置对应 Tool；当前 Agent 完成自己的阶段产物和交接文件后，由一个很薄的协调层调用下一 Agent，最终得到代码、图表、LaTeX 和 PDF。
- `scripts/run-golden-case.mjs` 只是开发期验收工具，不是产品 runtime，也不应成为用户流程的第二套编排器。
- 当前最大缺口是正式 `/mm-agent` 仍让主模型根据自然语言临场执行 `dispatch → task → critic → gate`；Golden runner 的确定性控制没有进入发布包，因此 Golden 通过不等于用户路径稳定。
- 下一会话先锁定最小产品架构和迁移边界，再实现：保留 Agents、Tools、磁盘 artifacts、Compute/Compile Evidence 和可恢复交接；把 `schema_version`、`attempt_id`、时间戳等机器字段交给 runtime；减少重复 Manifest/Gate/prompt 约束和非必要并发事务复杂度。
- 不直接继续当前 C 题 Case。其 Policy 中 modeling/solving/reporting budget 为 `0`，且问题二所需外部变量不在 immutable input 中；若继续真实题，应准备完整输入并创建新 Case。
- 已知一致性缺口：Review evidence 当前只验证 Case 内存在，未严格限制为 Manifest 声明集合；C 题 accepted Analysis 使用了未声明的 `tmp/pdfs/` 渲染；`reviewed_at` 可接受未来时间；README/package 声明 `schemas/` 但仓库无该目录。
- 当前没有 in-flight worker 或后台 runner。下一会话不得依赖本聊天，先按 AGENTS 必读顺序恢复仓库事实并核对本节。

## NKUMMF RC2

- tgz：`C:\Users\OpeNopEn\AppData\Local\mm-agent\rc\v1.0.0-rc2-nkummf-20260812\mm-agent-opencode-1.0.0.tgz`
- SHA-256：`5f6ae9e62f32b2eadac176f0f7789b3521706f8c30c63a7eb5d14424da88ebbd`；118 files；2,177,266 bytes packed。
- 修复：`src/agents.ts` 根据 OpenCode Plugin `directory/worktree` 动态生成精确的 project-scoped Attempt edit pattern；`src/index.ts` 将宿主路径传入 Agent config factory。没有放宽为跨项目 `**/runs/...`。
- 主控约束：`skills/mm-agent/SKILL.md` 明确只传 Case-relative `contextPath`，不要求 Actor promotion、不改写 hidden Agent 的 Canonical schema。
- 自动证据：新增非 Git worktree regression；`npm test` 为 172 total / 161 passed / 11 opt-in skipped / 0 failed，`npm run build` 与 `npm run validate-config` 通过。

## 最终本机 RC

- tgz：`C:\Users\OpeNopEn\AppData\Local\mm-agent\rc\v1.0.0-rc1-accepted-20260801\mm-agent-opencode-1.0.0.tgz`
- SHA-256：`2741e6a5953c2b0360e543d2e6a9a09ccceb0e6546241c5d216bfad056963cad`
- package：118 files；2,177,445 bytes packed；3,232,839 bytes unpacked。
- 安装根：`C:\Users\OpeNopEn\AppData\Local\mm-agent\rc\v1.0.0-rc1-accepted-20260801\install`
- 最终包与用于 Gate A/B/C 的外部 RC 有 60/60 个 `dist/**` 文件 hash 完全一致，四份 Skill 也完全一致；`dist/index.js` SHA-256 均为 `08ed8334b1a8b70f587257993ee2e658b9bd5ae2f1a829564ac63b65dab5cf43`。
- 最终包自身的 install → update → remove lifecycle 通过；receipt 记录四份 Skill，remove 无 conflict。此前独立 conflict fixture 也证明修改过的 owned Skill 会阻止 update，并在 remove 时保留文件和 receipt。
- package 清单无 tests、runs、cache、server、prompt、runtime/evaluation、MM-Bench 输入、模型权重、配置或凭据；LICENSE、README 和第三方 notices 在包内。

## Step 8 Gate 证据

三组 Gate 均使用 OpenCode `1.18.9`、Plugin API `1.18.2` 和 `minimax/MiniMax-M3 --variant thinking`，外层 timeout 为 3,600,000 ms。

### Gate A — minimal

- Case：`golden-minimal-ms9xarxr`
- project：`C:\Users\OpeNopEn\AppData\Local\mm-agent\validation\step8-final-gate-a-20260801-132039\minimal\project`
- completion trace：`C:\Users\OpeNopEn\AppData\Local\mm-agent\validation\step8-final-gate-a-20260801-132039\golden-runtime.json`
- fresh trace：`C:\Users\OpeNopEn\AppData\Local\mm-agent\validation\step8-final-gate-a-fresh-20260801-133900\golden-runtime.json`
- result：`completed`，revision 5，13 accepted artifacts；fresh trace 只有 `resume-inspect` / `fresh-inspect`，0 child、0 failure。
- PDF：23,109 bytes，1 页；已渲染目检，无裁切、重叠或乱码。

### Gate B — multi-wave

- Case：`golden-multi-wave-ms9y2mqp`
- project：`C:\Users\OpeNopEn\AppData\Local\mm-agent\validation\step8-final-gate-b-20260801-134200\multi-wave\project`
- completion trace：`C:\Users\OpeNopEn\AppData\Local\mm-agent\validation\step8-final-gate-b-resume-20260801-141200\golden-runtime.json`
- fresh trace：`C:\Users\OpeNopEn\AppData\Local\mm-agent\validation\step8-final-gate-b-fresh-20260801-141600\golden-runtime.json`
- result：`completed`，revision 6，21 accepted artifacts；6 份 Review 全为 `schema_version: 1 / pass`；`task-total` 只读取 task-a/task-b 的直接依赖 memory；当前 Compute/Compile Evidence 与文件 hash 全匹配。
- PDF：51,035 bytes，SHA-256 `2f5889688d478c25b21dc8bd2a7f4c1bd2e7aa85909576548aac14018b112b40`，4 页 A4；已逐页目检，无裁切、重叠或乱码。
- 第一次 Reporting Critic 返回了含原始 TeX 反斜杠的非法 JSON Unicode escape。runner 收紧 strict Review JSON 契约后从原 reporting-001 Attempt 恢复，只重跑 Critic/Gate；Analysis、Modeling、Solver 和 Writer candidate 均未重派。fresh trace 只有两次 inspect，0 child、0 failure。

### Gate C — MM-Bench 2024_C

- Case：`golden-mmbench-2024-c-ms8x3qbf`
- project：`C:\Users\OpeNopEn\AppData\Local\mm-agent\validation\step8-gate-c-20260731-202724\mmbench-2024-c\project`
- completion trace：`C:\Users\OpeNopEn\AppData\Local\mm-agent\validation\step8-gate-c-resume-20260801-122630\golden-runtime.json`
- fresh trace：`C:\Users\OpeNopEn\AppData\Local\mm-agent\validation\step8-gate-c-fresh-20260801-131546\golden-runtime.json`
- result：`completed`，revision 13，29 accepted artifacts；13 份 Review 均保留 `schema_version: 1`；五个 Solver task、直接依赖 read set、Compute/Compile Evidence、输入快照和固定 upstream provenance 均核对通过。fresh trace 只有两次 inspect，0 child、0 failure。
- PDF：582,561 bytes，SHA-256 `a3a2cc311bb3e1aecb5dbae565be85ebc620cf05da4d49727155c271200f13ce`，7 页 A4；逐页目检可读，包含真实 match-flow figures、coach tests、confusion matrix、balanced accuracy、held-out metrics 和题目要求的结论。

## 体验项目

- path：`E:\Study\CodingWorkSpace\mm-agent\mm-agent-v1-trial`
- 空白 Git 工作区，无 commit、题目、Case、runs 或 provider 凭据。
- `.opencode/plugins/mm-agent.js` re-export 最终外部 RC；四份 Skill 来自该 RC，不读取源码仓库。
- `opencode debug agent <name>` 已重新发现五个 `hidden: true / mode: subagent` 角色；`opencode debug skill` 的四个 mm-* location 均来自体验目录。
- 直接无模型加载最终 Plugin 得到六个 `mm_agent_*` Tools，directory/worktree 指向体验项目；用户全局 OpenCode Plugin、Skills 和 receipt 未被安装或修改。
- 用户下一步：把题目和附件放入 `problems/`，在该目录启动 OpenCode，执行 `/mm-agent`，最终查看 `runs/<case-id>/report/report.pdf`。

## NKUMMF 2025 C RC2 真实体验结果（2026-08-12）

- project：`E:\Study\CodingWorkSpace\mm-agent\nkummf_2025_c_testing`；保持非 Git，以复现 RC1 的实际 worktree 语义；从上述 RC2 tgz 安装，不读取源码仓库内部 Plugin。
- 输入：题面 PDF、附件一高校就业率、附件二单变量预测模板、附件三多变量预测模板，共 4 文件。压缩包没有题面要求的附件四；附件二和附件三 SHA-256 均为 `6550c400df545ab1270e18eeebbf394c6e91470ca468f3fc454d7e01fddf18de`，是字节一致的模板。两项均作为输入事实记录，未伪造附件四。
- `opencode debug agent mm-analyst` 在盘符根 worktree 下给出精确 allow pattern：`Study/CodingWorkSpace/mm-agent/nkummf_2025_c_testing/runs/*/attempts/analysis/*/**`，而非 RC1 的 `runs/*/...`；仍显式 deny `context.json`、`review.json` 和外部目录。
- 真实 `/mm-agent` 使用 OpenCode `1.18.9`、`minimax/MiniMax-M3 --variant thinking`。preflight 为 6 pass / 1 automatic warn / 0 fail；Case `nkummf-2025-c` 固化 4 个输入快照。
- Analysis Actor 在 `analysis-001` 真实写出 `problem-understanding.md`、Canonical `tasks.json` 和 `task-graph.json`；Critic Review 为 `schema_version: 1 / pass`，无 findings/required fixes；Gate 将 3 份 artifact 提升并把 revision 0→1。
- 新观察：Critic 提交 `reviewed_at: 2026-08-12T13:15:00Z`，但 review/state 文件实际在约 `12:49:39Z` 写入，未来约 25 分钟的 RFC 3339 时间仍被 Gate 接受。它不影响本轮 Actor permission 回归结论，但在 RC2 最终接受前应决定由 runtime 生成 Review 时间，或增加合理的 future-skew 校验。
- 当前 `state.json` 为 revision 1、stage `modeling`、status `running`；没有派发 Modeling。Policy 中 modeling/solving/reporting budget 均为 0，这是本轮刻意的停止边界，不是运行失败。
- 结论：RC1 的非 Git Actor 写权限回归与主控 prompt 漂移均已由真实现场关闭；RC2 的 C 题 Analysis 功能路径为 Go，但未来 Review 时间戳是接受前待决的证据完整性缺口。完整 C 题仍需明确问题二外部变量数据来源，并决定如何生成缺失的附件四结果模板后再提高后续 revision budget。

## NKUMMF 2025 B 真实体验结果（2026-08-12）

- project：`E:\Study\CodingWorkSpace\mm-agent\nkummf_2025_testing`；使用已接受 RC1 tgz、OpenCode `1.18.9`、`minimax/MiniMax-M3 --variant thinking`，不读取源码仓库内部 Plugin。
- 唯一输入为 `problem/NKUMMF_2025_B.pdf`，1,819,764 bytes，SHA-256 `d278097c89dddccf148bdf98baa3375ef916ff621a20f7a03b176afd32f747a1`。题面引用的附件一（音乐文件）、附件二/三（xlsx 模板）和附件四（攻击实验音频）均缺失，因此只能合法测试 preflight、intake 与 Analysis，不能完成真实检测、评分、鲁棒性实验或最终论文。
- 首轮 `/mm-agent` 将文件名 `NKUMMF_2025_B` 用作 Case ID，`case-write` 因大写和下划线返回 `INVALID_CASE_ID`；Skill 正确在首次 fail 后停止且未创建半成品。改用 `nkummf-2025-b` 后，完整 preflight 仅有 HMML cache warn，XeLaTeX 模板真实编译通过，Case 成功固化。
- 保留现场：`runs/nkummf-2025-b/state.json` 仍为 revision `0`、stage `analysis`、status `prepared`；active Attempt 为 `analysis-001`，只有 `context.json`，没有 candidate、Review 或 accepted artifact。
- 阻塞发生在真实 built-in `task` 的 `mm-analyst` 写入边界。根因不是斜杠归一化或 rule precedence，而是 B 项目非 Git 时 OpenCode worktree 为盘符根目录：Tool 请求使用 worktree-relative `Study/.../runs/...`，RC1 allow pattern 却只有 `runs/...`，因此不匹配。该根因已由 RC2 动态 project-scoped pattern 修复并在 C 题现场验证。
- 主会话生成的 Actor prompt 还有两处独立契约漂移：要求 Actor 自行 promote 到 `artifacts/`，违反 Gate-only promotion；要求 `tasks.json` 携带 `title/depends_on/inputs/outputs/acceptance`，违反 hidden Agent 的 Canonical Analysis schema。即使写权限恢复，这个 prompt 也应被 Critic 判 `revise`。需要收紧 `/mm-agent` 主控提示，使其只传递 `contextPath` 和 Canonical contract，不临时重定义 schema 或 promotion 职责。
- 原 `opencode run` PID `245648` 在子会话无法产出文件后持续悬挂，已核对完整命令行仅终止该试跑进程；Case 文件全部保留，可在修复后从 active Attempt 恢复，不得并发创建新 runner。
- 结论：RC1 对 B 实例仍为 No-Go 历史证据；对应权限和主控 prompt 缺陷已在 RC2 关闭。B 题本身仍缺附件一至四，不适合继续 Modeling → Solver → Reporting；优先使用更完整的 C 题。

## 最终确定性验收

- `npm ci`：通过，0 vulnerabilities；transitive `ini@7.0.0` 对本机 Node `24.8.0` 给出非阻塞 engine warning，README 已建议使用其声明支持的 Node 范围。
- focused 四文件：74 passed、7 opt-in skipped、0 failed。
- `npm test`：161 passed、11 opt-in skipped、0 failed（172 total）。
- `npm run build`、`npm run validate-config`：通过。
- `npm run test:runtime`：项目级真实 OpenCode install/discovery 1 passed；6 个需要显式隔离测试凭据的模型项 skipped，真实 A/B/C 已另行覆盖 MiniMax 模型路径。
- `uv run --project runtime pytest`：6 passed。
- `npm pack --dry-run --json`、package forbidden-path scan、`git diff --check` 和 `git diff --no-index AGENTS.md CLAUDE.md`：通过。
- 独立只读审查：Codex `gpt-5.6-terra medium` 初审无 Critical、2 个 Important；已撤回抢跑的“已接受”状态，并把 README 的 MIT 授权对象限定为原创资产，明确第三方模板仍受 notices 约束。定向复审无 Critical/Important，Step 8 随后接受。

## 已知边界

- 本机 RC 不等于公开发布。`templates/cumcmthesis/` 与 HMML catalog 的公开再分发授权仍需解决；详情见 `THIRD_PARTY_NOTICES.md`。
- MM-Bench 题目、CSV、provenance、Case、trace、PDF、模型 cache、Python 环境和 provider 配置均在仓库外，不是可移植 Git 资产。
- Windows 外层 timeout 后必须先查原 runner/OpenCode PID 和 `state.json`；若进程仍活跃就继续等待，不得并发 resume。
- 项目不使用 Superpowers，也不调用 `tdd` Skill；测试与真实 Gate 是结果证据。

## Commit 判断

用户已要求创建一次 checkpoint commit 归档当前基础；不 tag、push 或 npm publish。后续运行面收敛应在该 checkpoint 之上进行，避免重写 Steps 1–8 的历史。
