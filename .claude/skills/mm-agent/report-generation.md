---
name: report-generation
description: Generate LaTeX/PDF report from modeling workflow artifacts
---

# Report Generation Sub-Skill

**Purpose:** Generate LaTeX/PDF report from modeling workflow artifacts.

**Parent:** mm-agent coordinator.md

---

## Invocation

Called by coordinator.md as Phase 7 of mm-agent workflow.

## Input

Memory files from previous phases:
- `.planning/memory/problem.md` — Problem analysis (Phase 2)
- `.planning/memory/dag.json` — Task structure (Phase 3)
- `.planning/memory/task-*.json` — All task memories (Phase 3-6)
- `.planning/memory/model-*.md` — Modeling plans (Phase 5)
- `.planning/memory/results-*.json` — Execution results (Phase 6)
- `.planning/output/plots/*.png` — Visualization plots (Phase 6)

## Output

- `.planning/output/report.tex` — LaTeX source
- `.planning/output/report.pdf` — Compiled PDF
- `.planning/output/appendix/` — Code and figure appendix

## Template Support

- **mcmthesis** — MCM/ICM 美赛 template (default)
- **cumcmthesis** — CUMCM 国赛 template

Specify via metadata['template'] = 'mcm' or 'cumcm'

## Chapter Structure (IDEA.md §11.2)

Fixed outline + dynamic Task chapters:
1. Problem Restatement > Problem Background
2. Problem Restatement > Problem Statement
3. Model Assumptions
4. Explanation of Assumptions
5. Problem Analysis
6. Problem Analysis > Task N Analysis (dynamic, 1 per task)
7. Solution to the Problem
8. Solution to the Problem > Task N Solution > Model Setup (dynamic)
9. Solution to the Problem > Task N Solution > Model Calculation (dynamic)
10. Model Conclusion > Model Advantages
11. Model Conclusion > Model Limitations
12. Notation and Explanations
13. Appendix (code + figures)

## Chapter Relevance Map (IDEA.md §11.3)

Context passing is controlled by chapter relevance:
- Model Setup only receives its corresponding Task Analysis context
- Model Calculation receives Task Analysis + Model Setup context
- Conclusion receives all Task Solution context

This prevents context pollution from passing irrelevant data.

## Scientific Language (IDEA.md §11.5)

Generated content MUST follow academic writing standards:
- No Markdown syntax (*, #, -, etc.)
- Continuous narrative paragraphs (no bullet points)
- Integration with preceding chapters
- High-quality, rigorous content

## Usage

```python
from src.scripts.report_generator import PaperGenerator, FileManager
import json

# Load memory data
with open('.planning/memory/report-memory.json') as f:
    json_data = json.load(f)

# Configure metadata
metadata = {
    'title': 'Paper Title',
    'team': '2500001',
    'year': '2025',
    'problem_type': 'A',
    'template': 'mcm',  # or 'cumcm'
    'summary': '...',
    'keywords': '...',
    'figures': ['.planning/output/plots/result.png'],
    'codes': ['.planning/output/code/solution.py']
}

# Pre-flight check: verify xelatex availability
if not FileManager.check_xelatex_availability():
    print("Warning: xelatex not found, PDF may not compile")

# Generate report - LLM is auto-acquired if not provided
generator = PaperGenerator(llm=None)  # or pass explicit LLM
results = generator.generate_paper(json_data, metadata, '.planning/output', 'report')

# Check results
print(f"Success: {results['success']}")
print(f"Chapters: {results['chapters_generated']}/{results['chapters_generated']+results['chapters_failed']}")
if results['partial_chapters']:
    print(f"Partial: {results['partial_chapters']}")
if results['error']:
    print(f"Error: {results['error']}")

# PDF is generated at .planning/output/report.pdf (may be missing if xelatex unavailable)
```

## Error Handling

The report generator provides granular error handling:

- **LLM Auto-Acquisition**: If no LLM is provided, PaperGenerator attempts to acquire from environment (Anthropic SDK). Falls back to placeholder mode gracefully.

- **Partial Result Preservation**: If chapter generation fails, partial results are preserved and generation continues. Check `results['partial_chapters']` for chapters with incomplete content.

- **PDF Compilation Errors**: If PDF compilation fails, LaTeX source is still saved. Check `.planning/output/report.log` for errors.

- **Exception Hierarchy**:
  - `ReportGenerationError` - base exception
  - `LLMFailureError` - LLM generation failed
  - `ChapterGenerationError` - single chapter failed
  - `PDFCompilationError` - PDF compilation failed (includes log content)

## Core Classes

| Class | Purpose |
|-------|---------|
| `Chapter` | Dataclass representing a chapter with path, content, title |
| `OutlineGenerator` | Creates fixed outline structure with dynamic Task N chapters |
| `ContextExtractor` | Extracts only relevant JSON fields per chapter type |
| `PromptCreator` | Creates LLM prompts using PAPER_CHAPTER_PROMPT templates |
| `LatexDocumentAssembler` | Assembles complete .tex document with template switching |
| `FileManager` | Saves .tex and compiles to PDF via xelatex |
| `PaperGenerator` | Orchestrates the full generation workflow |

## Integration

Phase 7 of mm-agent workflow. Final phase, produces output report.

Called by coordinator after Phase 6 (Code Execution) completes.

Prerequisites:
- `.planning/memory/task-*.json` files must exist
- `.planning/memory/problem.md` with YAML frontmatter for metadata
- xelatex must be available in PATH for PDF compilation
