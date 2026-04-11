# Phase 07: Report Generation - Research

**Researched:** 2026-04-11
**Domain:** LaTeX document generation, academic paper formatting, scientific writing automation
**Confidence:** HIGH

## Summary

Phase 7 transforms completed modeling artifacts (problem.md, dag.json, task-*.json, model-*.md, results-*.json) into a final PDF paper report. The key insight from IDEA.md is that the outline is **fixed template + dynamic Task chapters**, not LLM-decided structure. Chapter relevance maps enable fine-grained context passing, and PAPER_CHAPTER_PROMPT enforces scientific writing standards (no Markdown, continuous narrative, academic rigor).

**Primary recommendation:** Adapt the existing `report-generator.py` skeleton (733 lines) into a callable Skill, wire it to the coordinator, and add test scaffolds following the Phase 6 pattern.

## User Constraints (from CONTEXT.md)

> No CONTEXT.md found for Phase 7 — using ROADMAP.md and IDEA.md §11 directives directly.

### Locked Decisions (from ROADMAP.md)

- Phase 7 produces `.planning/output/report.tex` and `.planning/output/report.pdf`
- Templates: mcmthesis (MCM/ICM 美赛) and cumcmthesis (CUMCM 国赛)
- Phase depends on Phase 6 completion

### Claude's Discretion

- Implementation approach for chapter generation loop (sequential vs parallel)
- Error recovery strategy for LaTeX compilation failures
- Metadata generation strategy (regenerate vs reuse from problem.md)

### Deferred Ideas (OUT OF SCOPE)

- Multi-language report support (RPT-ADV-02)
- Advanced template customization beyond mcmthesis/cumcmthesis

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RPT-01 | System generates LaTeX report from modeling artifacts | report-generator.py `LatexDocumentAssembler` class (lines 369-524) provides full LaTeX assembly |
| RPT-02 | System outputs PDF format paper report | report-generator.py `FileManager.generate_pdf()` uses xelatex double-compile (lines 542-555) |
| RPT-03 | Fixed outline + dynamic Task chapters | `OutlineGenerator._create_base_outline()` (lines 122-151) creates task-count-driven structure |
| RPT-04 | mcmthesis/cumcmthesis template switching | `LatexDocumentAssembler._create_preamble()` (lines 447-475) shows template selection via documentclass |
| RPT-05 | Fine-grained chapter relevance context passing | `OutlineGenerator.generate_chapter_relevance_map()` (lines 153-188) + `PaperGenerator._get_relevant_chapters()` (lines 641-657) |
| RPT-06 | Scientific language: no Markdown, continuous narrative, academic style | PAPER_CHAPTER_PROMPT enforces these constraints explicitly (mm-agent-prompts.py lines 918-948) |

---

## Standard Stack

### Core Libraries

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **XeLaTeX** | TeX Live 2026 | LaTeX to PDF compilation | Chinese font support (ctex), mcmthesis/cumcmthesis require xelatex |
| **mcmthesis.cls** | CTAN current | MCM/ICM 美赛 template | Official template from latexstudio |
| **cumcmthesis.cls** | v2.6 | CUMCM 国赛 template | Official template from latexstudio |
| **Jinja2** | Latest | Templating engine | Already in project stack (CLAUDE.md), used in report-generator.py |
| **subprocess** | stdlib | PDF compilation orchestration | No external library needed for xelatex invocation |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **pylatex** | Latest | Programmatic LaTeX generation | Alternative to string concatenation (not used in current skeleton) |
| **pypandoc** | Latest | Pandoc Python bindings | If markdown-to-latex conversion needed |
| **ctex** | Latest | Chinese LaTeX typesetting | cumcmthesis loads this automatically |

**Installation verification:**
```bash
# XeLaTeX is part of TeX Live - already available on macOS
which xelatex  # /Library/TeX/texbin/xelatex

# Verify Jinja2 is in project dependencies
pip3 show jinja2 2>/dev/null | grep Version
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| XeLaTeX | pdflatex | pdflatex lacks proper Chinese support; mcmthesis requires xelatex |
| String concatenation | pylatex | Skeleton already uses string concat; pylatex adds dependency for marginal gain |
| Two xelatex passes | One pass | Two passes needed for TOC and cross-references to resolve correctly |

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── skills/
│   └── mm-agent/
│       ├── report-generation.md    # Phase 7 entry skill
│       └── coordinator.md          # Phase orchestration
├── scripts/
│   ├── report_generator.py         # Core generation logic (adapted from skeleton)
│   └── latex_compiler.py           # PDF compilation wrapper
└── tests/
    └── test_report_generation.py   # Test scaffolds
```

### Pattern 1: Fixed Outline + Dynamic Task Chapters

**What:** The paper outline is a template where Task N chapters are dynamically generated based on DAG task count.

**When to use:** Always for MCM/CUMCM papers where task count varies by problem.

**Example from `OutlineGenerator._create_base_outline()`:**
```python
outline = [
    ["Problem Restatement", "Problem Background"],
    ["Problem Restatement", "Problem Statement"],
    ["Model Assumptions"],
    # ...
]
# Task-specific chapters appended dynamically
for i in range(1, task_count + 1):
    outline.append(["Problem Analysis", f"Task {i} Analysis"])
    outline.append(["Solution to the Problem", f"Task {i} Solution", "Model Setup"])
    outline.append(["Solution to the Problem", f"Task {i} Solution", "Model Calculation"])
```

### Pattern 2: Chapter Relevance Map for Context Passing

**What:** Each chapter declares which previous chapters it depends on, preventing context pollution.

**When to use:** When chapters have different context needs (Model Calculation needs Model Setup, but Model Setup does not need Model Calculation).

**Example from `OutlineGenerator.generate_chapter_relevance_map()`:**
```python
chapter_relevance_map = {
    # Model Setup only needs corresponding Task Analysis
    "Solution to the Problem > Task 1 Solution > Model Setup": [
        "Problem Analysis > Task 1 Analysis"
    ],
    # Model Calculation needs both Analysis AND Model Setup
    "Solution to the Problem > Task 1 Solution > Model Calculation": [
        "Problem Analysis > Task 1 Analysis",
        "Solution to the Problem > Task 1 Solution > Model Setup"
    ],
}
```

### Pattern 3: ContextExtractor for Selective JSON Field Access

**What:** Each chapter type has a dedicated method to extract only the JSON fields it needs.

**When to use:** To avoid passing entire task JSON to each chapter generation call.

**Example from `ContextExtractor.get_context_for_chapter()`:**
```python
def get_context_for_chapter(self, chapter: Chapter, data: Dict[str, Any]) -> Dict[str, Any]:
    if self._is_model_calculation(path):
        return {
            "task_1": {
                "mathematical_modeling_process": task_data.get("mathematical_modeling_process", ""),
                "execution_result": task_data.get("execution_result", ""),
                "solution_interpretation": task_data.get("solution_interpretation", "")
            }
        }
```

### Pattern 4: Two-Pass PDF Compilation

**What:** Run xelatex twice to resolve TOC, references, and cross-references.

**When to use:** Any LaTeX document with `\tableofcontents` or `\ref`/`\cite`.

**Source:** `report-generator.py` lines 546-549:
```python
def generate_pdf(latex_path):
    subprocess.run(["pdflatex", f"-output-directory={latex_dir}", "-interaction=nonstopmode", latex_path])
    subprocess.run(["pdflatex", f"-output-directory={latex_dir}", "-interaction=nonstopmode", latex_path])
```

### Anti-Patterns to Avoid

- **LLM-decided outline structure:** IDEA.md §11.2 explicitly forbids this. Use fixed template + dynamic extension.
- **Passing full task JSON to every chapter:** Causes context pollution. Use ContextExtractor per chapter type.
- **Single xelatex pass:** TOC and references will not resolve correctly.
- **Using pdflatex instead of xelatex:** mcmthesis and cumcmthesis require xelatex for Chinese font support.
- **Markdown syntax in LaTeX output:** PAPER_CHAPTER_PROMPT explicitly forbids `*`, `#`, bullet points.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF compilation | Custom PDF library | subprocess + xelatex | XeLaTeX is the standard tool; reinventing adds complexity without benefit |
| Template selection | Custom template engine | mcmthesis/cumcmthesis cls files | Official templates handle all formatting edge cases |
| Scientific writing prompts | Ad-hoc prompts | PAPER_CHAPTER_PROMPT from mm-agent-prompts.py | Explicitly encodes academic writing requirements |
| Chapter context routing | Pass-everything approach | Chapter relevance map pattern | Prevents context window pollution, already designed for this |
| Figure/code appendix assembly | Custom lstlisting code | Template provided in `LatexDocumentAssembler._add_code()` | Handles escape characters and formatting |

**Key insight:** The skeleton `report-generator.py` (733 lines) already implements all five patterns. Adaptation is cheaper than recreation.

---

## Runtime State Inventory

> Not applicable — Phase 7 is a report generation phase, not a rename/refactor/migration phase. No runtime state (databases, services, OS registrations) is affected.

**Stored data:** None — Phase 7 reads from memory files and writes output files only.
**Live service config:** None
**OS-registered state:** None
**Secrets/env vars:** None
**Build artifacts:** None

---

## Common Pitfalls

### Pitfall 1: LaTeX Compilation Errors (XeLaTeX Failures)

**What goes wrong:** `xelatex` fails with cryptic errors like "Font ... not loadable" or "Unicode character ... not supported".

**Why it happens:** Missing fonts, package conflicts between mcmthesis and cumcmthesis, or malformed LaTeX from LLM-generated content.

**How to avoid:**
1. Use `-interaction=nonstopmode` to capture all errors
2. Parse the `.log` file for error patterns
3. Provide fallback: if compilation fails after 2 attempts, output `.tex` file for manual review

**Warning signs:**
- `! Font \csname ...` errors in log
- `! LaTeX Error: Environment ... undefined`
- Exit code != 0 from subprocess

### Pitfall 2: LLM Generates Markdown Instead of LaTeX

**What goes wrong:** Model outputs `*bold*`, `# heading`, or `- bullet list` in chapter content.

**Why it happens:** Models trained on Markdown may default to it; PAPER_CHAPTER_PROMPT exists to prevent this but may not be 100% effective.

**How to avoid:**
1. Prompt explicitly includes "avoid all Markdown syntax"
2. Post-process with regex to strip common Markdown patterns before inserting into LaTeX document
3. Validate output format before compilation

**Warning signs:** Compilation errors mentioning `*` or `#` in unexpected places.

### Pitfall 3: Context Window Overflow from Large Task JSON

**What goes wrong:** Multiple tasks with long `solution_interpretation` or `execution_result` fields cause prompt to exceed context limit.

**Why it happens:** Each chapter receives context from relevant chapters via relevance map, but worst-case total context can still be large.

**How to avoid:**
1. Truncate long fields with `[:2000]` character limit in ContextExtractor
2. Generate chapters in strict topological order (Model Setup before Model Calculation)
3. If still too large, generate metadata (title/summary/keywords) first, then chapters in batches

### Pitfall 4: Template Mismatch (mcmthesis vs cumcmthesis)

**What goes wrong:** Wrong template loaded, causing compilation failures or formatting issues.

**Why it happens:** Coordinator may not pass template selection correctly, or user specifies wrong competition type.

**How to avoid:**
1. Validate `problem_type` field matches expected values (A, B, C for CUMCM; MCM/ICM for MCM)
2. Pass template selection explicitly to report generator
3. Default to mcmthesis if unspecified

### Pitfall 5: Missing Figures or Code Files

**What goes wrong:** `\includegraphics` or `\lstinputlisting` references non-existent files.

**Why it happens:** Phase 6 may not have generated expected outputs, or paths are relative when they should be absolute.

**How to avoid:**
1. Verify all expected files exist before compilation
2. Use absolute paths in `\includegraphics[width=...]{/absolute/path/to/file.png}`
3. Gracefully skip missing files with a warning

---

## Code Examples

### Converting Memory JSON to Report Input Format

**Source:** Derived from `report-generator.py` lines 581-590 and context extraction patterns.

```python
def load_memory_for_report(memory_dir: str, task_ids: List[str]) -> Dict[str, Any]:
    """Load all task memories and combine into report-ready JSON structure."""
    json_data = {"tasks": []}
    for task_id in task_ids:
        task_file = Path(memory_dir) / f"task-{task_id}.json"
        if task_file.exists():
            with open(task_file) as f:
                task_data = json.load(f)
                json_data["tasks"].append(task_data)
    return json_data
```

### Chapter Generation Loop

**Source:** `report-generator.py` lines 596-601, adapted for Skill.

```python
def generate_report_chapters(json_data: Dict, llm, chapter_relevance_map: Dict) -> List[Chapter]:
    """Generate content for each chapter requiring content."""
    task_count = len(json_data.get("tasks", []))
    outline_gen = OutlineGenerator()
    chapters = outline_gen.create_outline(task_count)
    
    completed_chapters = []
    for chapter in chapters:
        if chapter.needs_content:
            context = ContextExtractor().get_context_for_chapter(chapter, json_data)
            relevant_chapters = _get_relevant_chapters(chapter, completed_chapters, chapter_relevance_map)
            prompt = PromptCreator().create_prompt(chapter, context, relevant_chapters)
            response = llm.generate(prompt)  # Returns LaTeX string
            chapter.content = _strip_markdown(response)
            chapter.is_generated = True
            completed_chapters.append(chapter)
    return chapters
```

### Template Selection in Preamble

**Source:** `report-generator.py` lines 447-475, simplified.

```python
def create_preamble(template_type: str, metadata: Dict) -> str:
    """Generate LaTeX preamble based on template type."""
    if template_type == "mcm":
        return f"""\\documentclass{{mcmthesis}}
\\mcmsetup{{CTeX=false, tcn={metadata['team']}, problem={metadata['problem']}, year={metadata['year']}}}"""
    else:  # cumcm
        return f"""\\documentclass{{cumcmthesis}}
\\赛题类型{{{metadata['problem']}}}
\\队号{{{metadata['team']}}}
\\年份{{{metadata['year']}}}"""
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| LLM decides outline | Fixed template + dynamic Task chapters | IDEA.md §11.2 | Predictable structure, no LLM hallucination on format |
| Pass full task JSON | Chapter relevance map + ContextExtractor | IDEA.md §11.3 | Reduced context pollution, better generation quality |
| Bullet points in output | PAPER_CHAPTER_PROMPT enforces narrative | IDEA.md §11.5 | Academic rigor, ready for submission |
| Single LaTeX pass | Two xelatex passes | report-generator.py skeleton | Correct TOC and reference resolution |
| Hardcoded template | Template selection via documentclass | IDEA.md §11.6 | Single codebase supports both 美赛 and 国赛 |

**Deprecated/outdated:**
- `lualatex` for Chinese: Replaced by `xelatex` which has better ctex compatibility
- `\input{}` for chapter files: Modern templates prefer single-document compilation

---

## Open Questions

1. **Metadata regeneration vs reuse**
   - What we know: `report-generator.py` can regenerate title/summary/keywords via `PAPER_INFO_PROMPT`
   - What's unclear: Should we reuse metadata from `problem.md` (Phase 2) or regenerate based on final content?
   - Recommendation: Regenerate if `problem.md` summary is too generic; reuse if specific enough

2. **Graceful LaTeX failure handling**
   - What we know: `FileManager.generate_pdf()` runs with `nonstopmode`
   - What's unclear: Should we output `.tex` for manual editing if PDF fails, or attempt repair?
   - Recommendation: Output `.tex` + error log, notify user for manual intervention

3. **Figure placement in dynamic Task chapters**
   - What we know: `LatexDocumentAssembler._add_figure()` adds figures before "Model Advantages"
   - What's unclear: Should each Task's results include figures inline or aggregated at conclusion?
   - Recommendation: Aggregate at conclusion per current skeleton; inline placement adds complexity

4. **Code appendix organization**
   - What we know: `LatexDocumentAssembler._add_code()` adds all Python files to appendix
   - What's unclear: Should code be task-organized or flat?
   - Recommendation: Flat alphabetical order is simpler; task organization adds marginal value

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| **XeLaTeX** | PDF compilation | Yes | TeX Live 2026 | None — required for mcmthesis/cumcmthesis |
| **pdflatex** | Alternative compilation | Yes | TeX Live 2026 | Use xelatex instead |
| **Jinja2** | Templating | Yes (project dep) | Latest | String concatenation fallback |
| **subprocess** | Process orchestration | Yes (stdlib) | N/A | None needed |
| **Python 3.10+** | Report generator | Yes | 3.12+ | None |

**Missing dependencies with no fallback:**
- None identified — all required tools are available

**Missing dependencies with fallback:**
- None identified

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest |
| Config file | `pytest.ini` or `pyproject.toml` (see existing tests) |
| Quick run command | `pytest tests/test_report_generation.py -x -v` |
| Full suite command | `pytest tests/test_report_generation.py -v` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RPT-01 | Generates valid LaTeX from memory JSON | unit | `pytest tests/test_report_generation.py::TestLatexGeneration -x` | Need Wave 0 |
| RPT-02 | Compiles LaTeX to PDF via xelatex | integration | `pytest tests/test_report_generation.py::TestPDFCompilation -x` | Need Wave 0 |
| RPT-03 | Fixed outline structure with dynamic Task chapters | unit | `pytest tests/test_report_generation.py::TestOutlineStructure -x` | Need Wave 0 |
| RPT-04 | mcmthesis/cumcmthesis template selection | unit | `pytest tests/test_report_generation.py::TestTemplateSelection -x` | Need Wave 0 |
| RPT-05 | Chapter relevance map filters context correctly | unit | `pytest tests/test_report_generation.py::TestChapterRelevance -x` | Need Wave 0 |
| RPT-06 | LLM output contains no Markdown, only LaTeX | unit | `pytest tests/test_report_generation.py::TestScientificWriting -x` | Need Wave 0 |

### Sampling Rate

- **Per task commit:** `pytest tests/test_report_generation.py -x -v`
- **Per wave merge:** `pytest tests/test_report_generation.py -v`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/test_report_generation.py` — covers RPT-01 through RPT-06
- [ ] `tests/conftest.py` — shared fixtures (memory JSON structure, template paths)
- Framework install: `pip3 install pytest` if not present

*(If no gaps: "None — existing test infrastructure covers all phase requirements")*

---

## Sources

### Primary (HIGH confidence)

- `.planning/templates/report-generator.py` — Complete 733-line skeleton implementing all 5 core classes (OutlineGenerator, ContextExtractor, PromptCreator, LatexDocumentAssembler, FileManager)
- `IDEA.md` §11 (lines 814-1053) — Report Generation implementation details including fixed outline (§11.2), chapter relevance map (§11.3), scientific language prompt (§11.5), template selection (§11.6)
- `.claude/skills/mm-agent/report-generation.md` — Existing skill definition (47 lines) with input/output specs
- `.planning/prompts/mm-agent-prompts.py` — PAPER_CHAPTER_PROMPT, PAPER_CHAPTER_WITH_PRECEDING_PROMPT, PAPER_NOTATION_PROMPT, PAPER_INFO_PROMPT

### Secondary (MEDIUM confidence)

- mcmthesis CTAN page (https://ctan.org/pkg/mcmthesis) — Template documentation
- cumcmthesis GitHub (https://github.com/latexstudio/CUMCMThesis) — Template documentation and examples

### Tertiary (LOW confidence)

- None required for this phase — all authoritative sources are in primary/secondary

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — LaTeX toolchain verified with `which xelatex`, template files exist in `.planning/templates/`
- Architecture: HIGH — All 5 classes from skeleton verified, chapter relevance map pattern documented
- Pitfalls: MEDIUM — Based on LaTeX compilation experience, some pitfalls may be template-specific

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (30 days — LaTeX template ecosystem is stable)
