# CLAUDE.md

## What to Follow

### 1. Plan Node Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)  
- If something goes sideways, STOP and re-plan immediately - don't keep pushing  
- Use plan mode for verification steps, not just building  
- Write detailed specs upfront to reduce ambiguity  

---

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean  
- Offload research, exploration, and parallel analysis to subagents  
- For complex problems, throw more compute at it via subagents  
- One task per subagent for focused execution  

---

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern  
- Write rules for yourself that prevent the same mistake  
- Ruthlessly iterate on these lessons until mistake rate drops  
- Review lessons at session start for relevant project  

---

### 4. Verification Before Done
- Never mark a task complete without proving it works  
- Diff behavior between main and your changes when relevant  
- Ask yourself: "Would a staff engineer approve this?"  
- Run tests, check logs, demonstrate correctness  

---

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"  
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"  
- Skip this for simple, obvious fixes - don't over-engineer  
- Challenge your own work before presenting it  

---

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding  
- Point at logs, errors, failing tests - then resolve them  
- Zero context switching required from the user  
- Go fix failing CI tests without being told how  

---

## Task Management
1. **Plan First**: Write plan to `tasks/todo.md` with checkable items  
2. **Verify Plan**: Check in before starting implementation  
3. **Track Progress**: Mark items complete as you go  
4. **Explain Changes**: High-level summary at each step  
5. **Document Results**: Add review section to `tasks/todo.md`  
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections  

---

## Core Principles
- **Simplicity First**: Make every change as simple as possible. Impact minimal code  
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards

<!-- GSD:project-start source:PROJECT.md -->
## Project

**MM-Agent in Claude Code**

将 NeurIPS 2025 论文 "MM-Agent" 的数学建模多智能体架构，本地化为 Claude Code 工作流插件。用户通过 `/mm-agent --problem <file>` 启动，继承 Claude Code 的模型配置，无需单独配置 API Key。

为数学建模竞赛参与者、科研工作者在熟悉的 Claude Code 环境中提供 MM-Agent 的自动化建模能力。

**Core Value:** **输入非结构化赛题 → 自动化数学建模全流程 → 输出符合要求的论文报告**

如果其他功能失败，这条核心流水线必须能跑通。

### Constraints

- **Tech Stack**: 必须在 Claude Code CLI 环境中运行，使用 Skills/Hooks/Agents 体系
- **Integration**: 继承 Claude Code 的模型配置，无需单独配置 API Key
- **Scope**: 聚焦核心流水线，其他功能失败不影响主流程
- **Reference**: 需参考 LLM-MM-Agent 和 get-shit-done 的实现模式
- **CLI-first**: v1 不做 Web UI，命令行交互为主
- **User Requirements**: 用户已有 Claude Code 环境，可提供赛题文件（PDF/MD/TXT）
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Framework
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Claude Code Skills | Current | Extension mechanism | Native CLI integration, declarative skill definition, auto-discovery |
| Claude Code Hooks | Current | Event triggers | PreToolUse/PostToolUse for validation, auto-formatting, state tracking |
| Claude Code Agents | Current | Subagent orchestration | Specialized agents for modeling phases, parallel execution support |
| GSD Framework | Latest | Workflow patterns | Proven phase/plan/execute pattern, context isolation, state management |
### Python Runtime
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Python | 3.10+ (3.12 recommended) | Runtime environment | Required for numerical computation, matches LLM-MM-Agent |
| NumPy | Latest | Numerical array operations | Foundation for scientific computing |
| SciPy | Latest | Scientific computing | Optimization, statistics, linear algebra |
| Pandas | Latest | Data manipulation | Data preprocessing, result handling |
| Matplotlib | Latest | Visualization | Plot generation for reports |
| SymPy | Latest | Symbolic mathematics | Analytical derivations |
| statsmodels | Latest | Statistical modeling | Regression, time series |
| scikit-image | Latest | Image processing | If needed for visual problems |
### Embedding & Knowledge Retrieval
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Alibaba-NLP/gte-multilingual-base | Latest | Embedding computation | 768-dim, 8192 token context, 多语言支持（论文实际使用） |
| sentence-transformers | Latest | Model wrapper | 模型加载与推理 |
### Report Generation
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Jinja2 | Latest | Template engine | Dynamic content rendering |
| Pandoc | Latest | Document conversion | Markdown/LaTeX to PDF |
| pypandoc | Latest | Python Pandoc bindings | Programmatic conversion |
| pylatex | Latest | LaTeX generation | Programmatic LaTeX creation |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| PyMuPDF (fitz) | Latest | PDF text extraction | Problem parsing from PDF files |
| python-dotenv | Latest | Environment loading | API key management |
| pyyaml | Latest | Config parsing | YAML configuration files |
| anthropic | Latest | Claude API | Direct API calls if needed |
| openai | Latest | OpenAI API | For potential model selection |
## Alternatives Considered
| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Framework | GSD Framework | LangGraph/LangChain | GSD provides better phase orchestration for Claude Code |
| Embedding | gte-multilingual-base | BGE-m3 | 论文工程仓库实际使用 gte-multilingual-base，768维，推理更快 |
| Report | Jinja2 + Pandoc | WeasyPrint | Pandoc is standard for academic papers |
| State | JSON files | Database | File system simpler for v1, avoids deployment complexity |
| Python | 3.12 | 3.11/3.10 | Latest stable, better performance |
## Installation
### Core Python Environment
# Create environment
# Core dependencies (from LLM-MM-Agent requirements.txt)
# Report generation
# PDF parsing
# Configuration
### Claude Code Plugin Setup
# 本项目是 Claude Code 插件，结构遵循 docs/reference/claude-code-plugin-dev.md
# 插件结构：
# .claude-plugin/plugin.json  ← 插件元数据
# skills/mm-agent/SKILL.md    ← 唯一 skill 入口
# agents/*.md                 ← subagent 定义
# hooks/hooks.json            ← hook 配置
# 安装方式：claude --plugin-dir ./mm-agent-in-cc
### Embedding Model Download
# gte-multilingual-base (Alibaba-NLP, 论文实际使用)
# Automatically downloaded on first use via transformers
## Configuration Files
### Project Structure
### Environment Variables
# .env (do not commit)
# Claude Code inherits user configuration - no additional API key needed
# For direct API calls if needed:
## Sources
- [MM-Agent Paper (arXiv 2505.14148)](https://arxiv.org/abs/2505.14148) — NeurIPS 2025, four-stage mathematical modeling framework, HIGH confidence
- [LLM-MM-Agent Repository](https://github.com/usail-hkust/LLM-MM-Agent) — Python dependencies, HMML structure, MEDIUM confidence
- [GSD Framework GitHub](https://github.com/gsd-build/get-shit-done) — Phase orchestration patterns, HIGH confidence
- [FlagEmbedding GitHub](https://github.com/FlagOpen/FlagEmbedding) — BGE-m3 installation and usage, HIGH confidence
## Confidence Assessment
| Area | Confidence | Reason |
|------|------------|--------|
| Core Framework | HIGH | Claude Code native + GSD verified patterns |
| Python Stack | HIGH | Based on LLM-MM-Agent requirements.txt |
| Embedding | HIGH | 论文工程仓库代码确认使用 gte-multilingual-base |
| Report Generation | MEDIUM | Standard tools, less math-specific validation |
| Installation | MEDIUM | Based on package docs, not fully tested in this project |
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

- **插件入口**: `.claude-plugin/plugin.json`（name, version, description）
- **Skill 定义**: `skills/mm-agent/SKILL.md`（唯一入口，自然语言指令）
- **Skill 支撑文件**: `skills/mm-agent/*.md`（coordinator.md 等，不是独立 skill）
- **Agent 定义**: `agents/*.md`（frontmatter: name, description）
- **Hook 配置**: `hooks/hooks.json` + `hooks/session-start`
- **脚本**: `scripts/*.py`（独立 CLI 工具）
- **知识库**: `knowledge/`（写作指南、HMML 方法库）
- **模板**: `templates/`（LaTeX 论文模板）
- **完整规范**: `docs/reference/claude-code-plugin-dev.md`
<!-- GSD:conventions-end -->

## Plugin Development Standards (CRITICAL)

**完整规范**: `docs/reference/claude-code-plugin-dev.md`
**参考实现**: [superpowers](https://github.com/obra/superpowers) — 最成熟的 Claude Code 插件

### 结构规范

```
mm-agent-in-cc/
├── .claude-plugin/
│   └── plugin.json              ← 插件元数据（name, version, description）
├── skills/
│   └── mm-agent/
│       ├── SKILL.md             ← 唯一入口，自然语言指令
│       ├── coordinator.md       ← 支撑文件，不是独立 skill
│       └── ...
├── agents/
│   └── mm-agent-*.md            ← subagent 定义
├── hooks/
│   ├── hooks.json               ← hook 配置
│   └── session-start            ← 启动 hook 脚本
└── scripts/
    └── *.py                     ← 可执行脚本
```

### Skill 编写规则（最常违反）

1. **SKILL.md 是给 Claude 看的自然语言指令**，不是 bash 脚本
2. **禁止伪代码**：不要写 `$(Skill parse-problem ...)` 或 `if [ "$X" = "FAILED" ]`
3. **Skill 间引用用自然语言**："使用 /parse-problem 解析问题文件"
4. **`@path` 语法不存在**：用 `!`cat path`` 动态注入或 markdown 链接
5. **`$ARGUMENTS` 直接可用**：不需要 bash grep 解析
6. **支撑文件放 skill 目录下**：如 `skills/mm-agent/coordinator.md`
7. **只有 SKILL.md 会被注册为 skill**：其他 .md 文件只是参考文档

### Agent 编写规则

1. **Agent ≠ Skill**：Agent 是 subagent，Skill 是指令，两者独立
2. **Agent 通过 Agent tool 调用**：`subagent_type: "mm-agent-modeler"`
3. **Skill 里调用 Agent**：写 "使用 Agent 工具，subagent_type 设为 mm-agent-modeler"
4. **frontmatter 必需**：`name` 和 `description` 是唯一必需字段

### Hook 规范

1. **hooks.json 放在 `hooks/` 目录**，不是 `.claude/settings.json`
2. **用 `${CLAUDE_PLUGIN_ROOT}`** 引用插件内文件
3. **SessionStart hook** 用于注入引导上下文

### 反模式检查清单

在修改任何 skill/agent 文件前，检查：
- [ ] 没有 bash 伪代码（`$()`, `if []`, `exit 1`）
- [ ] 没有 `@path` 引用语法
- [ ] 没有 `Skill name --flag` 调用语法
- [ ] SKILL.md 是自然语言步骤，不是程序逻辑
- [ ] Agent 被正确引用（通过 Agent tool，不是 Skill tool）

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

**四阶段流水线**（基于论文 §3.3 + 工程仓库分析）：
1. **Problem Analysis** — 问题理解(Actor-Critic×3) → 任务分解 → DAG 构建
2. **Mathematical Modeling** — HMML 检索(top-6) → 公式 Actor-Critic
3. **Computational Solving** — 代码生成 → 执行 → 调试循环(3轮×5次)
4. **Solution Reporting** — 章节生成 → LaTeX 组装 → PDF 编译

**核心模式**: 三层次 Actor-Critic（问题理解、建模方案、公式），Coordinator Memory 跨任务传递。

详见 `docs/research/llm-mm-agent-engineering-analysis.md`。
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

---

## Project Info (2026-05-16 更新)

### 当前状态

**版本**: v0.1.0（Phase 1-7 文档完成，但核心流水线有断裂）

**关键发现**（详见 `docs/research/paper-vs-implementation-gap-analysis.md`）：
- Prompt 模板 100% 完整（28/28）
- Scripts 100% 完整（4/4 可执行）
- Skill 定义 100% 正确（7/7）
- HMML 知识库 100% 完整
- **核心问题**: `templates/report-generator.py` 导入路径断裂
- **架构问题**: Actor-Critic 不独立（同一 Skill 执行）、HMML 检索脱离 Claude 生态、Agent 未被实际调用

### 关键文档

| 文档 | 职责 | 何时阅读 |
|------|------|---------|
| `PLAN.md` | 重构计划与任务跟踪 | **必读**（当前工作上下文） |
| `CHANGELOG.md` | 版本变动记录 | 了解历史 |
| `docs/research/paper-vs-implementation-gap-analysis.md` | 详细差距分析 | 理解问题根源 |
| `docs/research/claude-code-architecture-refactor.md` | 架构重构方案 | 理解解决方案 |
| `docs/reference/claude-code-plugin-dev.md` | Claude Code 插件开发规范 | **必读**（开发前） |
| `IDEA.md` | 设计决策文档 | 理解原始设计 |
| `ROADMAP.md` | 原始路线图 | 了解 Phase 规划 |

### 下一步行动

**当前阶段**: Phase A — 最小可行修复

**首要任务**: 修复 `templates/report-generator.py` 导入路径

**目标**: 让核心流水线能跑通（Smoke Test 验证）

### Claude Code 机制要点

1. **Skill ≠ Python 代码**: Skill 是自然语言指令，由 Claude 执行
2. **Agent 需通过 Agent tool 调用**: 写了 Agent .md 文件不代表 Agent 被使用
3. **MCP 是工具集成正确方式**: HMML 检索应该用 MCP，不是 Python 脚本
4. **Actor-Critic 需独立 Agent**: Actor 和 Critic 应该在独立 context 中执行

---

*Project Info 更新: 2026-05-16*
