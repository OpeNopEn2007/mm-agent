# CHANGELOG

本文档记录 mm-agent 项目的历史版本变动。

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)，
版本号遵循 [语义版本控制](https://semver.org/spec/v2.0.0.html)。

---

## [Unreleased]

### 实现
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
- 增加 Compute 成功/失败/超时、Compile 成功/失败/无 PDF、路径与 link 拒绝 fixture；真实专用 Python 和 XeLaTeX gate 可由 `MM_AGENT_REAL_RUNTIME=1` 重放。OpenCode 模型 runtime 调用固定 `minimax/MiniMax-M3` Thinking，且仅在显式 `MM_AGENT_MINIMAX_API_KEY` 存在时使用隔离 provider 配置。

### 文档
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

### 开发方向
- OpenCode Plugin Spike、CaseContextStore、Step 3 Preflight/输入整理、Step 4 HMML 检索评测/运行时与 Step 5 Compute/Compile Runtime Evidence 均已通过各自 gate；当前停止在 Step 5，不自动进入 Agents/Skills 编排或 Golden Case。
- Spike 只验证 Adapter 宿主假设，不代表四阶段、HMML、Compute/Compile 或 Golden Case 已实现。
- 旧 Pi、Claude/Codex Plugin 方向进入历史维护/归档状态，不再作为后续架构主线。

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
