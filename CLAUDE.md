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
| FlagEmbedding (BGE-m3) | Latest | Embedding computation | Multi-lingual (100+), multi-function retrieval, 8192 token context |
| sentence-transformers | Latest | Model wrapper | Simplified BGE-m3 loading and usage |
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
| Embedding | BGE-m3 | mGTE | BGE-m3 has more established community, better documentation |
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
### Claude Code Skills Setup
# Skills are markdown files in ~/.claude/skills/ or project .claude/skills/
# No npm install needed - native Claude Code mechanism
# Example skill structure:
# .claude/skills/mm-agent/
#   SKILL.md          # Entry point definition
#   parse-problem.md  # Problem parsing hook
#   model-task.md     # Task modeling agent
#   execute-code.md   # Code execution hook
#   generate-report.md # Report generation hook
### Embedding Model Download
# BGE-m3 model (recommended)
# Automatically downloaded on first use via FlagEmbedding
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
| Embedding | HIGH | Official FlagEmbedding docs verified |
| Report Generation | MEDIUM | Standard tools, less math-specific validation |
| Installation | MEDIUM | Based on package docs, not fully tested in this project |
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
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
