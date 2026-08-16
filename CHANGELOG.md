# CHANGELOG

本文档记录 mm-agent 项目的历史版本变动。

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)，
版本号遵循 [语义版本控制](https://semver.org/spec/v2.0.0.html)。

---

## [Unreleased]

### 文档
- 新增 `docs/reference/mm-agent-paper-deep-dive.md`，中文深度解读 MM-Agent 论文，并梳理本项目基于 Pi CLI 要实现的 v1 workflow 目标。
- 新增 `docs/research/pi-cli-extension-analysis.md`，记录 Pi CLI 安装验证、Extension/Package 机制和 v1 Harness 建议。
- 更新 `docs/architecture/pi-extension-harness.md`，纳入已验证 Pi 事实和 v1 最小 Pi package 形态。
- 更新 `docs/README.md`，补充当前关键调研文档索引。
- 将活跃项目文档重置为 `1.x` Pi CLI Extension + MM-Agent Harness 方向。
- 将 `IDEA.md` 重写为项目具象哲学和动机文档。
- 围绕 v1 项目结构重写 `README.md`、`PLAN.md`、`docs/README.md`、`CLAUDE.md` 和 `AGENTS.md`。
- 新增 `docs/context/`、`docs/architecture/` 和 `docs/roadmap/` 作为活跃文档层。
- 同步 `CLAUDE.md` 和 `AGENTS.md`，作为跨智能体 Handoff 入口。
- 新增 `HANDOFF.md` 和 `docs/context/handoff-protocol.md`，将跨智能体交接状态与交接协议分离。
- 将本轮新增/重写的项目文档统一改为中文。
- 将 `README.md` 调整为克制的项目入口：状态、目标、文档入口、文件树和参考资料。
- 将 `README.md` 文件树与当前根目录结构对齐。

### 项目结构
- 保留 `runs/.gitkeep` 以记录运行期 Case 输出目录边界。
- 更新 `.gitignore`，忽略 `runs/**` 运行产物但保留 `runs/.gitkeep`。

### 工具验证
- 在本机用户级 npm prefix 安装并验证 `@earendil-works/pi-coding-agent@0.79.4`。
- 验证 `pi --version`、`pi --help`、`pi list` 可运行，且未在项目目录生成 `.pi/`。

### 归档
- 将旧 Claude/Codex 插件资产和 GSD 运行期规划产物移动到 `.archived/legacy-claude-codex-plugin/`。
- 归档旧 `INSPIRATION.md`，因为它的 Claude Code/GSD 插件方向与新 `IDEA.md` 职责重叠。
- 归档 `docs/research/paper-vs-implementation-gap-analysis.md`，因为它绑定旧实现状态，已不再代表 v1 当前项目真相。
- 归档 `docs/research/gsd-plugin-architecture-analysis.md`，保留 `docs/research/gsd-project-analysis.md` 作为 GSD 通用上下文工程参考。

### 架构分析
- 2026-05-16: 创建 `docs/research/claude-code-architecture-refactor.md` 架构重构方案
- 2026-05-16: 更新 `docs/research/paper-vs-implementation-gap-analysis.md` 全面差距分析

### 开发方向
- 下一阶段从 `1.0.0` 开始，主线转向 Pi CLI Extension + Lean MM-Agent Harness。
- 旧 Claude/Codex 插件方向进入 legacy 维护/归档状态，不再作为后续架构主线。

---

## [0.2.0] - 2026-06-15

### Legacy Final Snapshot
- 标记 `0.x` 旧方向最后快照，用于保留 Claude/Codex 插件化探索阶段的可回溯状态。
- 清理 Python `__pycache__` 等生成残留。
- 更新 `.gitignore`，忽略 Python 缓存、系统文件、构建产物、日志和运行期输出目录。
- 移除已跟踪的 `.DS_Store`。
- 明确 `AGENTS.md` 不进入本次旧版本快照。

### 迁移说明
- 后续主线以 `1.0.0` 开始，目标是基于 Pi CLI Extension 搭建论文 MM-Agent 的轻量 Harness。
- 旧方向资产仍保留在仓库中，后续将按归档/迁移策略逐步处理。

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
