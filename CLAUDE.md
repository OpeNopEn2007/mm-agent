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

**MM-Agent in Claude Code (mm-agent-in-cc)**

一个将学术界的 MM Agent 数学建模多智能体架构复刻并本地化为 Claude Code 工作流插件的系统。目标是打造一个能全自动接收非结构化赛题、进行数学建模、执行数值仿真并输出报告的端到端工作流。

基于 NeurIPS 2025 收录的 MM Agent 论文，结合 GSD 框架的上下文隔离与状态机特性，让数学建模工作者在熟悉的 Claude Code 环境中使用这个强大的数学建模工具。

**Core Value:** **输入非结构化赛题 → 自动化数学建模全流程 → 输出符合要求的论文报告**

如果其他功能失败，这条核心流水线必须能跑通。

### Constraints

- **Tech Stack**: Claude Code Skills/Hooks/Agents 体系
- **Target Users**: 数学建模竞赛参与者、科研工作者
- **Integration**: 必须能在 Claude Code CLI 环境中运行
- **Reference**: 需参考 LLM-MM-Agent 和 get-shit-done 的实现
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Claude Code Skills | Current | Extension mechanism | Native CLI integration, declarative skill definition, auto-discovery |
| Claude Code Hooks | Current | Event triggers | PreToolUse/PostToolUse for validation, auto-formatting, state tracking |
| Claude Code Agents | Current | Subagent orchestration | Specialized agents for modeling phases, parallel execution support |
| MCP Servers | Current | Tool integration | External tools (web search, code execution, document processing) |
| GSD Framework | Latest | Workflow patterns | Proven phase/plan/execute pattern, context isolation, state management |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Python + NumPy/SciPy | 3.12+ | Numerical computation | Mathematical modeling, simulation execution |
| SymPy | Latest | Symbolic math | Analytical model derivation |
| Matplotlib/Plotly | Latest | Visualization | Result plots, charts for reports |
| LaTeX (pandoc) | Latest | Document generation | Paper report formatting |
| Jinja2 | Latest | Template engine | Report templates, dynamic content |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| claude-cli | Skill development | `claude skill create`, `claude skill test` |
| git | Version control | Planning docs tracked per config |
| pytest | Testing | Agent behavior verification |
| markdown | Documentation | Skill prompts, workflow docs |
## Installation
# Claude Code Skills (installed in ~/.claude/skills/ or .claude/skills/)
# No npm install needed - skills are markdown files
# Python environment for numerical work
# Document generation
# Or: brew install pandoc (macOS)
# MCP servers (if needed for external tools)
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Claude Code Skills | Custom Python scripts | If need standalone app outside CLI |
| GSD Framework patterns | LangGraph/LangChain | If need different agent orchestration approach |
| CLI-first | Web UI (Gradio/Streamlit) | If need visual interface for non-CLI users |
| In-file context | Database state storage | If need persistent multi-session state |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Web framework (Django/Flask) | Not a web app, CLI-native integration | Claude Code Skills |
| Custom agent orchestration | GSD already solves this well | GSD framework patterns |
| Hardcoded prompts in code | Skills are more maintainable | Skill markdown files |
| Global state without isolation | Context pollution between phases | GSD's context isolation patterns |
## Stack Patterns by Variant
- Use Python CLI (argparse/rich)
- Because may need deployment outside Claude Code
- Use Skills + Hooks + Agents
- Because native CLI experience, auto-discovery
## Version Compatibility
| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Claude Code | Skills/Hooks/Agents | All current versions work together |
| Python 3.12+ | NumPy/SciPy/SymPy | Latest versions recommended |
| GSD Framework | Claude Code Agents | Designed for agent-based execution |
## Sources
- MM Agent Paper: https://arxiv.org/abs/2505.14148 — Multi-agent architecture patterns
- LLM-MM-Agent repo: https://github.com/usail-hkust/LLM-MM-Agent — Reference implementation
- GSD Framework: https://github.com/gsd-build/get-shit-done — Workflow patterns
- Claude Code docs: https://claude.ai/code — Skills/Hooks/Agents documentation
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
