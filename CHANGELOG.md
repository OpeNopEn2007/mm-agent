# CHANGELOG

本文档记录 mm-agent 项目的历史版本变动。

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)，版本号遵循 [语义版本控制](https://semver.org/spec/v2.0.0.html)。

---

## [Unreleased]

### 包名锁定与版本降级
- 在 npm 上锁定包名 `mm-agent`：已发布占位包 `mm-agent@0.0.1`（空实现，仅占名）。真实实现将以 `1.0.0` 在同一包名下发布，`npm install mm-agent` 将自动取最新版本。
- 仓库包名由 `@mm-agent/opencode` 改为 `mm-agent`，版本由 `1.0.0` 降为 `0.1.0`（pre-1.0 开发版）。`src/install.ts` 的 receipt 严格校验（package/version 精确匹配）与 `tests/plugin-spike.test.ts` 相关断言已同步更新。

### 正式运行面与外部验收
- 新增正式 `mm_agent_flow` Tool，仅提供 `advance` 与 `submit_review`；模型可见 Tool 现在固定为 check、prepare、flow、hmml、compute、compile 六项。`mm_agent_case` 保留给 Flow、Golden runner 和兼容测试的内部 Core seam，不再注册给模型。
- `FormalRuntimeCoordinator` 从 Case 权威文件推导下一 Actor/Critic directive，并写入派生 `handoff.json`；旧持久 `schema_version: 1` Case 可在恢复时懒生成 handoff，不改写既有 Case 文件。
- 固定正式链为 `mm_agent_flow → built-in task → mm_agent_flow`。Plugin hook 在原 Task 调用中校正 Agent、description 和 prompt，并清除 `task_id`、`background`、`command`，以保证 fresh foreground child；Plugin API 本身不直接调用 built-in `task`。
- Critic 只返回 `verdict`、`findings`、`required_fixes`、`evidence`；runtime 生成 Review 的 schema、Attempt、时间和 revision 字段，并在 Gate 前执行严格 Case-relative evidence allowlist 与 Runtime Evidence/hash 校验。
- 首条正式链中的 Solver task 按 DAG 可执行顺序串行运行。`blocked` 不自动回滚已接受阶段；输入或 accepted upstream 问题需要新 Case 或未来显式 reopen/migration 机制。
- Golden runner 继续作为开发期验收工具，不作为用户 runtime，也不进入 npm package；package 清单不声明或打包不存在的 `schemas/` 目录。
- 外部 npm `.tgz` 独立项目验收完成：OpenCode `1.18.9` + `minimax/MiniMax-M3`，用户仅执行 `/mm-agent`；5 个 hidden Agents、4 个 Skills、6 个最小公开 Tool 均成功发现，未使用 Golden runner。
- 正式 Flow 完整跑通 Analyst → Modeler → Solver DAG（按可执行顺序串行，含 revision）→ Writer → Critic；真实 uv/Python 3.12 Compute Evidence 与 XeLaTeX Compile Evidence 均通过。最终 Case 为 `completed`、stage `reporting`、revision `27`，handoff `completed`、blockers 为空。
- 非空 `main.tex`（34989 bytes，SHA-256 前缀 `762877…`）、`compile.log`（29154 bytes，SHA-256 前缀 `ad917d…`）、`report/report.pdf`（1720007 bytes，SHA-256 前缀 `2d6c8e…`）均存在；PDF 为 A4 17 页，逐页渲染目检无裁切、重叠、缺字或黑块，最终 compile/review 通过；三个结果 XLSX 存在。
- 跨真实 run/resume 日志共 59 个 completed built-in task，59 个 fresh child session ID 全唯一（analyst 1、modeler 1、solver 24、writer 2、critic 31），均使用 `minimax/MiniMax-M3`；最终 `main.tex` 无 TODO/TBD/PENDING/placeholder/TO VERIFY 命中。
- 独立受控中断实验：analysis-001 三输出落盘、revision 0 时精确终止 OpenCode；新会话从 mm-critic 接续，仅创建一个 Critic child，Analysis Attempt 仍为 1；pass 后 revision 1 / modeling，在 Modeler 执行前停止。多次进程中断均从同一磁盘 Case/Attempt 接续。
- 修复了正式验收暴露的边界：`revise` 仅在 candidate/runtime 严格验证后创建新 Attempt；`pass` 缺文件返回 `SCHEMA_INVALID`；`requires_computation=false` 支持合法 synthesis evidence；Critic 读取 raw payload 但 evidence 只引用 `execution-result.json` 且拒绝 manifest/context/目录/`runs/` 前缀和自然语言；Analyst DAG 仅包含 Modeling 后的 mm-solver 域任务；existing Case resume 只传 `case_id`，持久 input/policy/budget 为权威事实。
- `npm test` 为 179 total / 168 passed / 0 failed / 11 skipped；build、validate-config 和定向复审通过。`1.0.0` 尚未 npm publish，第三方 notices 再分发授权仍待公开发布前解决。
- 最新 `npm pack --dry-run` 候选为 122 files、packageSize 2,185,700 bytes、unpacked 3,288,455 bytes、SHA-1 `042e284b2d7d6ac6b7b8f1eac4cf546bbc8a00d8`；仅记录最终包清单与大小，不声称长模型链在该候选上重跑。

## [历史 RC 记录]

以下条目记录此前 Core/Golden/RC 工作事实，不能单独证明本轮正式 `/mm-agent` 外部用户路径已验收。

### 实现
- RC1 首次 NKUMMF 独立非 Git 项目体验暴露 Actor `edit` allow pattern 仍按仓库内 `runs/...` 生成，而 OpenCode `1.18.9` 在非 Git 项目以盘符根目录作为 worktree，并向 permission evaluator 提交 worktree-relative path。RC2 现根据 Plugin 的 `directory/worktree` 生成精确项目路径，保留 Attempt、`context.json`/`review.json` 和外部目录边界；新增非 Git worktree 回归测试。
- 收紧 `/mm-agent` 主控委派契约：只向 Actor 传递 Case-relative `contextPath` 并服从 hidden Agent/Manifest，不再临时要求 Actor promotion 或扩展 Canonical Analysis schema。NKUMMF 2025 C 独立现场已真实完成 preflight、intake、Analysis Actor/Critic/Gate，revision 0→1；附件四缺失与附件二/三字节一致均作为输入事实保留，未进入 Modeling。
- Step 8 将 `1.0.0` 收口为 unpublished local RC：新增标准 MIT License 与第三方 notices，补齐 package description/repository/license，并允许 Golden runner 通过 `--plugin-entry` 在 fresh、确定性 Tool 和 resume 路径统一加载外部解包 Plugin。
- Golden trace 保存改为串行临时文件替换，避免 multi-wave 并行 Actor/Critic 截断验收 trace；Python 根目录验收增加 pytest 路径配置，使 `uv run --project runtime pytest` 可直接执行。
- 删除已由 v1 Core/Tools 取代的旧 Python DAG、HMML、memory、report generator、smoke test、server、requirements 与 prompt 迁移入口；npm package 排除候选模型 evaluation 明细，只保留运行时所需的唯一 GTE 索引与两套 TeX 模板。
- Step 8 外部 RC 使用 OpenCode `1.18.9` 与 `minimax/MiniMax-M3 --variant thinking` 完整通过 Gate A/B/C、三次 fresh recovery、PDF 逐页目检、CLI lifecycle、冲突保护和独立项目级 Plugin/Skill discovery；独立初审的 2 个 Important 已关闭并通过定向复审，Step 1–8 已接受，版本仍未 commit/tag/publish。
- Gate B Reporting Critic 曾返回含原始 TeX 反斜杠的非法 JSON Unicode escape；runner 收紧 strict Review JSON 契约后从原 Attempt 恢复，仅重跑 Critic/Gate，未重派已接受阶段或 Writer candidate。
- 增加 Step 7 Golden Case runner、minimal/multi-wave fixtures 与运行期直接依赖断言；runner 通过真实 OpenCode Agent、Tool、Critic、Gate、Compute 和 Compile 路径执行，不用手写 Review 或 stable artifact 复制替代运行期事实。
- Step 7 Gate A minimal、Gate B multi-wave 与新的 MM-Bench `2024_C` Gate C 均已接受；Gate C 完成五任务 DAG、分层置换 coach claim test、held-out swing prediction、实际 match-flow figures、14 页 PDF 视觉检查与无重派 fresh recovery。早期结构完成但内容不合格的 Case 仅保留为失败证据。
- MM-Bench 准备脚本固定 upstream commit 和 provenance，将题目、CSV 与许可证元数据保存在仓库外；删除仅依赖旧 `.planning/` 路径的 MMBench Python validation fixture。
- Golden runtime 修复 Actor Case-root 磁盘路径、Critic evidence 规范化、恢复时复用成功 Runtime Evidence、Agent 普通文件工具 allowlist 歧义，以及 Analysis DAG task id 与后续 recipe 不一致；新增 same-wave ready-task 调度、题目产出完整性、全 code hash 覆盖和 PDF overflow 检查。Core 只接受当前 Solver Attempt 的规范 Compute manifest，resume 仅复用与当前 `main.tex`、compile log 和 PDF hash 一致的 Compile Evidence。确定性的 inspect/dispatch/gate 直接通过真实 Plugin `args.parse -> execute -> Core` 执行，模型只承担 Actor/Critic 判断；公共 Tool API 与 Review schema 保持不变。
- 接受 `315c319 feat: validate OpenCode plugin harness`，完成 `@mm-agent/opencode` 的 ESM Plugin Spike、最小 hidden Agent、只读 context Tool、`mm-agent` Skill 和显式 install/update/remove CLI。
- installer 使用 receipt hash、Plugin 注册所有权、路径/realpath 边界、junction escape 拒绝和带 rollback 的 staged transaction，保护用户修改和非拥有文件。
- 真实 OpenCode `1.18.2` runtime gate 覆盖 Plugin/Agent/Skill、slash command、模型驱动 Tool、built-in `task` fresh child linkage、重启和 compaction-off 磁盘恢复。
- 固定 npm package positive allowlist；`npm pack --dry-run` 排除旧 `templates/report-generator.py`、测试、运行产物、配置、cache 和凭据类文件。
- 实现 CaseContextStore 的 `open / dispatch / gate / inspect` contract、`schema_version: 1` runtime schemas、显式 migration seam、Case-relative secure paths、SHA-256、原子 JSON 和跨 Store lock/CAS。
- 实现固定 Role Recipe、三位 Attempt、Critic 复用 Manifest、Solver 直接依赖 read set、Review/promotion durable transaction、revision budget、blocker、DAG/wave、Task Memory、Runtime Evidence 和派生 completion evidence。
- 增加 CaseContextStore contract tests；普通测试为 81 passed、0 failed，5 个真实 OpenCode Adapter runtime regression gate 在宿主 `1.18.3` 上全部通过。
- 完成 Step 3 `mm_agent_check`：结构化检查 Node/OpenCode、uv/Python、Case 写权限、HMML candidate index/cache，并真实编译 bundled `cumcmthesis` 模板验证非空 PDF；检查过程不读取项目 `.venv`、不下载 Python、不选择 embedding 模型。
- 完成 Step 3 `mm_agent_prepare`：显式路径优先、`problems/` 回退，只委托 `CaseContextStore.open` 固化输入、Policy、四份 Rubric 与初始状态；冲突、输入变化、linked path、无效 ID 和不可写存储均返回结构化失败。
- `/mm-agent` Skill 在正文前执行 preflight 与 intake；存在 `fail` 时停止，未新增 `/doctor`、`/setup` 或其他公开入口。
- Step 3 focused、完整回归、Build、package/diff 与 5 个真实 OpenCode runtime gate 通过；runtime 直接覆盖真实模板 PDF、模型调用两项 Tool 和新进程 Case 恢复。
- 完成 Step 4 HMML：80 条双语 `ai-adjudicated` 查询、等价方法概念、论文对齐的 0.5 父级均值 + 0.5 叶方法评分、逐查询可复算报告和固定模型/index provenance。
- 真实比较 GTE 与 BGE-M3 后选择 GTE（Recall@5 `0.8125` vs `0.6875`；MRR `0.7660` vs `0.6985`），发布唯一 768 维 GTE 索引，不打包模型权重或 BGE 候选索引。
- `mm_agent_hmml` 输出 knowledge/model/index/query/candidate score/degraded reason；真实 OpenCode 隔离空 cache gate 验证 BM25 降级，固定 cache 验证 dense 检索。
- 完成 Step 5 `mm_agent_compute`：仅在当前 Solver Attempt 的 `code/` 目录使用 MM-Agent 专用 Python 执行，保存命令、净化环境、stdout、stderr、exit/timeout、输入输出 hash 与 hash-addressed Runtime Evidence；成功引用写入 `execution-result.json`。
- 完成 Step 5 `mm_agent_compile`：仅在当前 Writer Attempt 编译 `main.tex`，优先 `latexmk -xelatex`，缺失时回退最多三遍 `xelatex`，保留完整 `compile.log`、结构化错误、非空 PDF 与 Evidence。Report Gate 额外校验成功 Compile Evidence 与 PDF/日志 hash 对应。
- 修复 Step 5 Compile fallback：`latexmk` 存在但退出失败、超时或未生成非空 PDF 时同样回退 XeLaTeX；Evidence 的命令记录保留两种引擎各自的 stdout/stderr、exit code 和 timeout。
- 增加 Compute 成功/失败/超时、Compile 成功/失败/无 PDF、路径与 link 拒绝 fixture；真实专用 Python 和 XeLaTeX gate 可由 `MM_AGENT_REAL_RUNTIME=1` 重放。OpenCode 模型 runtime 只在显式测试凭据存在时使用隔离 provider 配置。
- 完成 Step 6：注册五个 hidden stage Agents、安装四份 Skills，并由 `mm_agent_case` Adapter 统一暴露 Case `open / dispatch / gate / inspect`。
- 固化 Canonical Analyst、Review 与 Gate contracts；Actor/Critic 复用同一 Attempt，Gate 负责 promotion 和状态推进。
- 安装器支持 legacy 单 Skill receipt 的事务升级，并保留用户文件冲突保护。
- 真实 OpenCode Actor -> Critic -> Gate host runtime 验证完成。

### 文档
- 将根 README 重构为面向首次使用者的项目首页，解释设计原则、OpenCode 中五个 hidden Agents/六个 Tools/四个 Skills、Quick Start、恢复、项目布局、验证边界、二次开发入口和参考资料；明确鼓励在 MIT 条款下 fork 并改造成自己的 Harness。
- 接受 `4ce82cd` 提交的 Canonical Core（`docs/architecture/canonical-core.md` + `docs/context/artifact-protocol.md`）作为宿主无关机制唯一来源。
- 重写 `README.md` 与 `docs/architecture/opencode-plugin-harness.md`，按 Core 同步 Context Manifest（`attempt_id`、`scope`、`sequence`、`created_at`、`base_revision`、`required_reads`、`expected_outputs`、`promotions`、`review.rubric`、`review.required_reads`、`latest_review`、`resolves_blocker`）、Gate 输入 `expected_revision`、Case Policy、Rubric 快照、per-task solving budget、Blocker、Stage 转换、Runtime Evidence、promotion 白名单和派生 completion evidence。
- 同步 `PLAN.md`、`HANDOFF.md`、`AGENTS.md`、`CLAUDE.md`、`IDEA.md`、`docs/README.md`、`docs/roadmap/v1.0.0.md` 与 `.archived/legacy-claude-codex-plugin/README.md` 到 Canonical Core 与 OpenCode Adapter 决策。
- 必读顺序调整为 `README.md` → `IDEA.md` → `HANDOFF.md` → `PLAN.md` → `docs/context/project-kernel.md` → `docs/architecture/canonical-core.md` → `docs/context/artifact-protocol.md` → `docs/architecture/opencode-plugin-harness.md` → `docs/architecture/paper-alignment.md`。
- `AGENTS.md` 与 `CLAUDE.md` 保持字节内容一致。
- 删除 `docs/architecture/pi-extension-harness.md` 与依赖 `${CLAUDE_PLUGIN_ROOT}` 的过期 `.mcp.json`。
- 将根 `PLAN.md` 重构为结果导向的里程碑契约，只描述预期结果、交付边界和验收证据；取消 Superpowers、强制 TDD/RED-GREEN 和逐微任务全量回归约束。
- 进一步从 `PLAN.md` 移除测试顺序、审查次数和提交方式等执行规则，并明确 Step 3 的 Case 恢复/冲突语义、`prepare -> CaseContextStore.open` 所有权及 HMML 检查边界。
- 删除活跃的 `docs/superpowers/` 过程计划，将 Step 2 压缩为 `.archived/implementation-records/` 下的历史记录，并明确归档不参与当前实施。
- 项目入口明确禁止调用 `tdd` Skill，并按任务风险划分 Terra low/medium、Sol medium 与 Sol high 的 subagent 使用边界。

### 项目结构
- 保留 `runs/.gitkeep` 以记录运行期 Case 输出目录边界。
- 更新 `.gitignore`，忽略 `runs/**` 运行产物但保留 `runs/.gitkeep`。
- 完善 Python/pytest、coverage、Node build 和通用 cache 忽略项；npm 包包含编译后的 `dist/core`，不包含测试、runs、cache、配置或凭据。

### 归档
- 将旧 Claude/Codex 插件资产和 GSD 运行期规划产物移动到 `.archived/legacy-claude-codex-plugin/`。
- 归档旧 `INSPIRATION.md`，因为它的 Claude Code/GSD 插件方向与新 `IDEA.md` 职责重叠。
- 归档 `docs/research/paper-vs-implementation-gap-analysis.md`，因为它绑定旧实现状态，已不再代表 v1 当前项目真相。
- 归档 `docs/research/gsd-plugin-architecture-analysis.md`，保留 `docs/research/gsd-project-analysis.md` 作为 GSD 通用上下文工程参考。

### 架构分析（历史）
- 2026-05-16: 创建 `docs/research/claude-code-architecture-refactor.md` 架构重构方案（历史，已通过归档处理）。
- 2026-05-16: 更新 `docs/research/paper-vs-implementation-gap-analysis.md` 全面差距分析（历史，已通过归档处理）。

### 历史 RC 边界
- Step 1–8 的既有验收和 RC1/RC2 现场记录仍保留为历史证据；RC1 的非 Git 权限问题、主控 prompt 漂移、未来 `reviewed_at` 观察以及 NKUMMF C 题未完成 Modeling→Reporting，均不代表当前正式 Flow 外部验收状态。当前正式 Flow 已在独立项目完成完整四阶段链；上述题目现场的附件和外部变量仍只属于历史输入边界。
- 旧 Pi、Claude/Codex Plugin 方向保持历史归档，不再作为后续架构主线。

---

## [0.2.0] - 2026-06-15

### Legacy Final Snapshot（历史）
- 标记 `0.x` 旧方向最后快照，用于保留 Claude/Codex 插件化探索阶段的可回溯状态。
- 清理 Python `__pycache__` 等生成残留。
- 更新 `.gitignore`，忽略 Python 缓存、系统文件、构建产物、日志和运行期输出目录。
- 移除已跟踪的 `.DS_Store`。
- 明确 `AGENTS.md` 不进入本次旧版本快照。

### 迁移说明（历史）
- 该历史快照曾计划使用 Pi；该计划已在 `Unreleased` 中被 OpenCode Plugin 主线取代，Pi 不再是活跃 runtime 决策。
- 旧方向资产仍保留在 `.archived/legacy-claude-codex-plugin/`，仅供回溯，不进入 v1 主线。

---

## [0.1.0] - 2026-04-11

### Phase 7: Report Generation (完成)
- feat: 实现报告生成核心类（Chapter, OutlineGenerator, ContextExtractor, PromptCreator, LatexDocumentAssembler, FileManager, PaperGenerator）
- feat: 添加 YAML frontmatter 解析替代硬编码 metadata
- feat: 添加 xelatex 预检验证和错误传播
- feat: 添加异常层次结构（ReportGenerationError, LLMFailureError, ChapterGenerationError, PDFCompilationError, MetadataError, TemplateNotFoundError）
- feat: 添加 LLM 自动获取策略
- feat: 添加部分结果保留机制
- docs: 完成 Phase 7 VERIFICATION.md 验证报告
- docs: 完成跨 AI 评审和 gap closure plans

### Phase 6: Code Generation & Execution (完成)
- feat: 实现代码生成 skill（Template + LLM Fill 策略）
- feat: 实现代码执行（错误处理、重试逻辑、timeout=300s）
- feat: 添加 max_repair=3, max_execute=5 配置
- feat: 集成代码执行到 coordinator DAG 循环
- docs: 完成 Phase 6 VERIFICATION.md 验证报告

### Phase 5: Mathematical Modeling (完成)
- feat: 实现 Actor-Critic 迭代（max_rounds=3, satisfaction_threshold=8）
- feat: 添加建模 skill 定义
- feat: 添加 test scaffolds 和 fixtures

### Phase 4: HMML Knowledge Retrieval (完成)
- feat: 实现 HMML embedding 预计算脚本（BGE-m3/sentence-transformers）
- feat: 实现 HMML 检索脚本（余弦相似度 + 父节点加权）
- feat: 生成 hmml-embeddings.npy（59 方法）
- feat: 集成 HMML 检索到 coordinator 任务循环
- docs: 完成 Phase 4 VERIFICATION.md 验证报告

### Phase 3: Task Decomposition (完成)
- feat: 实现 DAG 拓扑排序脚本（循环检测）
- feat: 实现 Memory System I/O（多模式 CLI）
- feat: 添加 task-decomposition.md skill
- feat: 集成 Phase 3 workflow 到 coordinator
- docs: 完成 Phase 3 VERIFICATION.md 验证报告
- fix: 移除 gsd runtime dependency，实现独立运行

### Phase 2: Problem Analysis Pipeline (完成)
- feat: 实现 parse-problem.md skill（PDF/MD/TXT 解析）
- feat: 添加附件识别和搜索逻辑
- feat: 创建 PDF 测试 fixtures
- feat: 集成到 coordinator workflow
- docs: 完成 Phase 2 VERIFICATION.md 验证报告

### Phase 1: Claude Code Integration (完成)
- feat: 创建 SKILL.md 主入口
- feat: 创建 coordinator.md 子 skill
- feat: 创建 4 个 Agent 定义（modeler, programmer, reporter, coordinator）
- feat: 配置 hooks/hooks.json（SessionStart, PostToolUse, PreToolUse）
- feat: 创建 plugin.json 元数据
- feat: 创建 smoke test fixtures
- docs: 完成 Phase 1 VERIFICATION.md 验证报告

---

## [0.0.1] - 2026-04-10

### 项目初始化
- docs: 创建项目结构
- docs: 添加 IDEA.md 设计决策文档
- docs: 添加 ROADMAP.md 7阶段路线图
- docs: 添加 REQUIREMENTS.md 需求定义
- docs: 添加 STATE.md 状态跟踪
- docs: 添加论文分析文档（llm-mm-agent-engineering-analysis.md）
- docs: 添加差距分析文档（paper-vs-implementation-gap-analysis.md）
- docs: 添加 Claude Code 插件开发指南（claude-code-plugin-dev.md）

---

## 版本说明

### 版本号规则

- **MAJOR**: 架构重大变更（如重构为 Agent Team 架构）
- **MINOR**: 完成新的 Phase 或重要功能
- **PATCH**: Bug 修复、文档更新

### 当前状态

| Phase | 状态 | 完成日期 |
|-------|------|---------|
| Phase 1 | ✅ 完成 | 2026-04-10 |
| Phase 2 | ✅ 完成 | 2026-04-10 |
| Phase 3 | ✅ 完成 | 2026-04-11 |
| Phase 4 | ✅ 完成 | 2026-04-11 |
| Phase 5 | ✅ 完成 | 2026-04-11 |
| Phase 6 | ✅ 完成 | 2026-04-11 |
| Phase 7 | ✅ 完成 | 2026-04-11 |

---

*CHANGELOG 创建: 2026-05-16（补记历史）*
