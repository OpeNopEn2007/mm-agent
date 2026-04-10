# Stack Research

**Domain:** Mathematical Modeling Multi-Agent System (Claude Code Integration)
**Researched:** 2026-04-10
**Confidence:** HIGH

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

```bash
# Claude Code Skills (installed in ~/.claude/skills/ or .claude/skills/)
# No npm install needed - skills are markdown files

# Python environment for numerical work
pip install numpy scipy sympy matplotlib pandas jinja2

# Document generation
pip install pandoc
# Or: brew install pandoc (macOS)

# MCP servers (if needed for external tools)
claude mcp add <server-name>
```

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

**If building standalone tool:**
- Use Python CLI (argparse/rich)
- Because may need deployment outside Claude Code

**If deep integration with Claude Code:**
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

---
*Stack research for: Mathematical Modeling Multi-Agent System*
*Researched: 2026-04-10*