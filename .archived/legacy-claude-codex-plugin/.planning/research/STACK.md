# Technology Stack

**Project:** MM-Agent in Claude Code
**Researched:** 2026-04-10
**Confidence:** MEDIUM

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

```bash
# Create environment
conda create --name mm-agent python=3.12
conda activate mm-agent

# Core dependencies (from LLM-MM-Agent requirements.txt)
pip install numpy pandas matplotlib scipy pandas scipy
pip install torch>=2.6.0 torchvision>=0.21.0
pip install transformers>=4.45.2 sentence_transformers
pip install sympy statsmodels scikit-image

# Report generation
pip install jinja2 pypandoc pylatex

# PDF parsing
pip install PyMuPDF

# Configuration
pip install pyyaml python-dotenv
```

### Claude Code Skills Setup

```bash
# Skills are markdown files in ~/.claude/skills/ or project .claude/skills/
# No npm install needed - native Claude Code mechanism

# Example skill structure:
# .claude/skills/mm-agent/
#   SKILL.md          # Entry point definition
#   parse-problem.md  # Problem parsing hook
#   model-task.md     # Task modeling agent
#   execute-code.md   # Code execution hook
#   generate-report.md # Report generation hook
```

### Embedding Model Download

```bash
# BGE-m3 model (recommended)
# Automatically downloaded on first use via FlagEmbedding
from FlagEmbedding import FlagModel
model = FlagModel("BAAI/bge-m3", use_fp16=True)
```

## Configuration Files

### Project Structure

```
mm-agent-in-cc/
├── .claude/
│   └── skills/
│       └── mm-agent/
│           ├── SKILL.md           # Main skill entry
│           ├── hooks/             # PreToolUse/PostToolUse hooks
│           ├── agents/            # Agent definitions
│           └── prompts/           # Shared prompts
├── .planning/
│   ├── PROJECT.md
│   ├── STATE.md
│   └── phases/                    # GSD phase artifacts
├── src/
│   ├── python/                    # Python utilities
│   └── templates/                 # Report templates
└── pyproject.toml
```

### Environment Variables

```bash
# .env (do not commit)
# Claude Code inherits user configuration - no additional API key needed
# For direct API calls if needed:
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

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