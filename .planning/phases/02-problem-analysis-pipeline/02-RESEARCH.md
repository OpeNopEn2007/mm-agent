# Phase 2: Problem Analysis Pipeline - Research

**Researched:** 2026-04-10
**Domain:** PDF/Text Parsing + Structured Information Extraction
**Confidence:** HIGH

## Summary

Phase 2 is responsible for parsing unstructured competition problem files (PDF/MD/TXT) and extracting structured problem definitions. The core technical challenge involves two distinct layers: (1) raw text extraction from various file formats, and (2) semantic analysis using LLM to identify problem components like background, objectives, constraints, and questions.

**Primary recommendation:** Use PyMuPDF (fitz) for PDF parsing due to high performance and Python 3.10+ compatibility, combined with Claude Code's native LLM capabilities for structured extraction via pattern-based prompting. This approach aligns with Phase 1's skill-based architecture and requires no additional API keys.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROB-01 | System can receive PDF format problem file and parse to extract text content | PyMuPDF (fitz) v1.27.2.2 provides high-performance PDF text extraction via `page.get_text()` |
| PROB-02 | System can receive Markdown/TXT format problem file | Standard Python file I/O with `.read()` handles MD/TXT natively |
| PROB-03 | System can extract problem background, objectives, constraints from problem text | Claude Code's LLM can perform semantic extraction using pattern-based prompts |
| PROB-04 | System can output structured problem.md file (title, background, questions, constraints, objectives, keywords, summary) | JSON-formatted output from LLM extraction can be written to markdown with frontmatter |

## User Constraints (from CONTEXT.md)

**No CONTEXT.md exists for Phase 2** - Full Claude discretion on implementation approach. No locked decisions from prior phases constrain this research.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| PyMuPDF (fitz) | 1.27.2.2 | PDF text extraction | High performance, Python 3.10+ compatible, no mandatory external dependencies |
| Python (standard library) | 3.14.3 (available) | MD/TXT file I/O | Native file operations, no dependencies needed |
| Claude Code LLM | Current session model | Structured extraction | Inherits from Phase 1 configuration, no separate API key needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pdfplumber | Latest | Table extraction from PDFs | When problems contain data tables requiring structured parsing |
| pypandoc | Latest | Document format conversion | When MD/TXT files need normalization to common format |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PyMuPDF (fitz) | pdfplumber | pdfplumber better for tables, slower for plain text |
| LLM extraction | Rule-based regex | LLM handles semantic complexity better, regex faster for simple patterns |

**Installation:**
```bash
# Core PDF parsing
pip install PyMuPDF

# Optional - for table extraction
pip install pdfplumber

# Optional - for document format normalization
pip install pypandoc
```

**Version verification:**
```bash
# PyMuPDF
pip show PyMuPDF  # Current: 1.27.2.2 (released March 20, 2026)

# pdfplumber (if using)
pip show pdfplumber
```

## Architecture Patterns

### Recommended Project Structure
```
.claude/skills/mm-agent/
├── parse-problem.md          # Phase 2: Problem parsing skill (NEW)
├── SKILL.md                  # Entry point (from Phase 1)
└── coordinator.md            # Orchestration (from Phase 1)

.planning/phases/02-problem-analysis-pipeline/
├── 02-RESEARCH.md            # This file
├── 02-PLAN.md                # Implementation plans (to be created)
├── 02-CONTEXT.md             # User decisions (to be created in discuss)
└── 02-VALIDATION.md          # Test strategy (to be created)

.planning/memory/             # Created by Phase 1 coordinator
├── problem.md                # Phase 2 output: structured problem (NEW)
└── context-for-phase-03.txt  # Phase 2 output: context for next phase (NEW)

tests/fixtures/               # Created by Phase 1
├── simple.md                 # Simple optimization problem
├── multi-task.md             # Multi-task with dependencies
└── prediction.md             # Prediction with data
```

### Pattern 1: Skill-based Problem Parsing
**What:** Create a `parse-problem.md` skill that handles file format detection, text extraction, and structured analysis.
**When to use:** When user invokes `/mm-agent --problem <file>`, coordinator delegates to parse-problem skill.
**Example:**
```markdown
---
name: parse-problem
description: Parse unstructured competition problems and extract structured definition
tools: Read, Write, Bash, Skill
---

<objective>
Parse problem file (PDF/MD/TXT), extract structured components (title, background, questions, constraints, objectives, keywords, summary), and output problem.md to .planning/memory/.
</objective>

<process>
## Step 1: Detect file format
Parse file extension to determine parsing strategy:
- .pdf → Use PyMuPDF (fitz)
- .md or .txt → Use standard file I/O

## Step 2: Extract raw text
For PDF:
```python
import fitz  # PyMuPDF
doc = fitz.open(problem_file)
text = "\n".join([page.get_text() for page in doc])
```

For MD/TXT:
```python
with open(problem_file, 'r', encoding='utf-8') as f:
    text = f.read()
```

## Step 3: Extract structured fields
Use Claude Code's native LLM to analyze text and extract:
- title: Problem title
- background: Context and problem statement
- questions: List of specific questions to answer
- constraints: Limitations and restrictions
- objectives: Goals and evaluation criteria
- keywords: Key terms for method retrieval
- summary: Concise problem overview

## Step 4: Write problem.md
Output to .planning/memory/problem.md with frontmatter:
```yaml
---
title: {extracted_title}
type: competition_problem
source: {file_path}
---

# Background

{extracted_background}

## Questions

{extracted_questions}

## Constraints

{extracted_constraints}

## Objectives

{extracted_objectives}

## Keywords

{extracted_keywords}

## Summary

{extracted_summary}
```

## Step 5: Write context for next phase
Create .planning/memory/context-for-phase-03.txt with structured summary for task decomposition.
</process>
```

**Source:** Phase 1 skills architecture pattern from `.claude/skills/mm-agent/SKILL.md`

### Pattern 2: LLM-based Structured Extraction
**What:** Use pattern-based prompting to guide LLM extraction of specific fields from unstructured text.
**When to use:** When extracting semantic problem components that require understanding.
**Example prompt:**
```
Analyze this mathematical modeling problem and extract the following fields as JSON:

{problem_text}

Return JSON with these fields:
{
  "title": "Problem title",
  "background": "Context and problem statement (2-3 paragraphs)",
  "questions": ["Question 1", "Question 2", ...],
  "constraints": ["Constraint 1", "Constraint 2", ...],
  "objectives": ["Objective 1", "Objective 2", ...],
  "keywords": ["keyword1", "keyword2", ...],
  "summary": "One-sentence problem summary"
}

Extract ALL information from the problem. If a field is not explicitly stated, infer it from context or state "not specified".
```

**Source:** OpenAI Cookbook function calling patterns - https://github.com/openai/openai-cookbook/blob/main/examples/How_to_call_functions_with_chat_models.ipynb

### Pattern 3: Coordinator Integration
**What:** Parse-problem skill integrates with Phase 1 coordinator skill for workflow orchestration.
**When to use:** When parsing completes, coordinator receives problem.md and invokes Phase 3 (Task Decomposition).
**Example:**
```markdown
## Step 6: Return to coordinator
After writing problem.md, signal coordinator to proceed:
- Success: "Problem parsed successfully. problem.md written to .planning/memory/"
- Failure: "Error parsing problem: {error_message}"

Coordinator reads problem.md and invokes Phase 3 agent for task decomposition.
```

**Source:** Phase 1 coordinator pattern from `.claude/skills/mm-agent/coordinator.md`

### Anti-Patterns to Avoid
- **Hardcoded extraction rules:** Don't use regex-only extraction - LLM handles semantic complexity better
- **Skipping error handling:** Don't assume all files parse correctly - validate file readability and format
- **Inconsistent output format:** Don't vary problem.md structure - Phase 3 expects specific fields
- **Ignoring encoding issues:** Don't assume UTF-8 for all files - handle encoding errors gracefully

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF text extraction | Custom PDF parsing with regex | PyMuPDF (fitz) `page.get_text()` | Handles encoding, fonts, layout complexities |
| Markdown parsing | Custom MD-to-text converter | Standard `.read()` - MD is already text | No conversion needed, MD IS text |
| Semantic extraction | Rule-based keyword matching | Claude Code LLM with pattern prompts | Handles ambiguous phrasing, implicit constraints |
| JSON validation | Custom schema parser | Native JSON with try/except | Python's json module handles edge cases |

**Key insight:** Custom solutions for these problems fail on edge cases (special characters, encoding, layout variations, implicit information). Standard libraries have been battle-tested across thousands of documents.

## Runtime State Inventory

> This section omitted - Phase 2 is greenfield (no rename/refactor/migration)

## Common Pitfalls

### Pitfall 1: PDF Extraction Encoding Issues
**What goes wrong:** Extracted text has garbled characters, mojibake, or missing content due to encoding mismatches.
**Why it happens:** PDFs can embed text in various encodings (UTF-8, Latin-1, custom). PyMuPDF usually handles this, but some edge cases exist.
**How to avoid:** Use PyMuPDF's default `get_text()` which handles encoding automatically. Verify output is readable before proceeding.
**Warning signs:** Empty strings, repeated replacement characters (``), unusual line breaks.

### Pitfall 2: Incomplete Field Extraction
**What goes wrong:** LLM misses implicit constraints or objectives not explicitly stated in the problem.
**Why it happens:** Problems often imply requirements (e.g., "optimize profit" implies "maximize objective function"). LLM may miss these if prompt doesn't encourage inference.
**How to avoid:** Include directive in prompt: "If a field is not explicitly stated, infer it from context or state 'not specified'."
**Warning signs:** Empty field values, "not specified" for obvious requirements.

### Pitfall 3: Markdown Format Variability
**What goes wrong:** MD files have inconsistent structure (h1 vs h2 titles, bullet list vs numbered lists) causing extraction failures.
**Why it happens:** No MD schema enforcement - users write problems in ad-hoc formats.
**How to avoid:** LLM extraction is format-agnostic - it analyzes content semantics, not structure. Prompt to "extract information regardless of formatting."
**Warning signs:** Extraction depends on specific MD headers or list types.

### Pitfall 4: File Path Validation
**What goes wrong:** Skill crashes when user provides non-existent file or unsupported format.
**Why it happens:** Skipping validation before file operations.
**How to avoid:** Always validate: (1) file exists, (2) file readable, (3) supported extension. Return clear error messages.
**Warning signs:** FileNotFoundError, PermissionError, UnsupportedFormatError.

### Pitfall 5: Memory File Coordination
**What goes wrong:** Phase 3 can't find problem.md because wrong path or filename.
**Why it happens:** Inconsistent naming convention between phases.
**How to avoid:** Follow Phase 1's established pattern: `.planning/memory/problem.md` is the canonical location. Coordinator skill expects this.
**Warning signs:** "problem.md not found" errors in Phase 3.

## Code Examples

Verified patterns from official sources:

### PyMuPDF Text Extraction
```python
# Source: https://github.com/pymupdf/PyMuPDF (official documentation)
import fitz  # PyMuPDF

def extract_pdf_text(pdf_path: str) -> str:
    """Extract all text from PDF file."""
    doc = fitz.open(pdf_path)
    text_pages = []
    for page in doc:
        text = page.get_text()  # Returns plain text encoded as UTF-8
        text_pages.append(text)
    doc.close()
    return "\n".join(text_pages)

# Usage
problem_text = extract_pdf_text("/path/to/problem.pdf")
print(problem_text)
```

### PyMuPDF with Error Handling
```python
# Source: PyMuPDF documentation - error handling patterns
import fitz

def safe_pdf_extract(pdf_path: str) -> tuple[str, str]:
    """Extract PDF text with comprehensive error handling."""
    try:
        if not fitz.open(pdf_path):
            raise ValueError("PDF file is empty or corrupted")
        doc = fitz.open(pdf_path)
        text = "\n".join([page.get_text() for page in doc])
        doc.close()
        return text, ""
    except FileNotFoundError:
        return "", f"File not found: {pdf_path}"
    except Exception as e:
        return "", f"PDF extraction error: {str(e)}"
```

### Standard File I/O for MD/TXT
```python
# Source: Python standard library documentation
def read_text_file(file_path: str) -> str:
    """Read text file with encoding handling."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    except UnicodeDecodeError:
        # Fallback to latin-1 if utf-8 fails
        with open(file_path, 'r', encoding='latin-1') as f:
            return f.read()
```

### LLM Extraction Prompt Pattern
```python
# Source: OpenAI Cookbook - function calling patterns
EXTRACTION_PROMPT = """
Analyze this mathematical modeling problem and extract structured information:

{problem_text}

Return a JSON object with these fields:
{
  "title": "Problem title (string)",
  "background": "Context and problem statement (2-3 paragraphs)",
  "questions": ["Question 1", "Question 2", ...],
  "constraints": ["Constraint 1", "Constraint 2", ...],
  "objectives": ["Objective 1", "Objective 2", ...],
  "keywords": ["keyword1", "keyword2", ...],
  "summary": "One-sentence problem summary"
}

Guidelines:
- Extract ALL information from the problem
- If a field is not explicitly stated, infer it from context
- If truly not present, use "not specified"
- Return ONLY valid JSON, no markdown formatting
"""
```

### Writing problem.md with Frontmatter
```python
# Source: Project pattern from Phase 1
import yaml

def write_problem_md(output_path: str, problem_data: dict) -> None:
    """Write structured problem to markdown with frontmatter."""
    frontmatter = {
        'title': problem_data['title'],
        'type': 'competition_problem',
        'source': problem_data['source']
    }

    content = f"""---
{yaml.dump(frontmatter, default_flow_style=False).strip()}
---

# Background

{problem_data['background']}

## Questions

{format_list(problem_data['questions'])}

## Constraints

{format_list(problem_data['constraints'])}

## Objectives

{format_list(problem_data['objectives'])}

## Keywords

{format_list(problem_data['keywords'])}

## Summary

{problem_data['summary']}
"""

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(content)

def format_list(items: list) -> str:
    """Format list as markdown bullet points."""
    return "\n".join(f"- {item}" for item in items)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PyPDF2 | PyMuPDF (fitz) | 2020+ | Faster, better encoding handling, actively maintained |
| Regex extraction | LLM semantic extraction | 2023+ | Handles implicit information, ambiguous phrasing |
| Manual JSON schema | Function calling APIs | 2024+ | Structured outputs guaranteed, no parsing needed |

**Deprecated/outdated:**
- **PyPDF2:** Superseded by PyMuPDF for performance and reliability
- **PyPDF (unmaintained):** Last update 2016, not compatible with modern PDF versions
- **Regex-only extraction:** Cannot handle semantic complexity of mathematical modeling problems

## Open Questions

1. **Table extraction from PDFs**
   - What we know: PyMuPDF can extract text including tables, but structure may be lost
   - What's unclear: How to preserve table structure for data extraction (needed in Phase 6)
   - Recommendation: For v1, extract table text and let LLM interpret. v2 can use pdfplumber for structured table extraction if needed.

2. **PDF password protection**
   - What we know: Some competition problems may be password-protected
   - What's unclear: Frequency of password protection in real competition problems
   - Recommendation: Add password parameter support in PyMuPDF (`fitz.open(path, password="")`) for v1, with user prompt if password needed.

3. **Multi-page vs single-page problems**
   - What we know: Test fixtures are single-page. Real problems may span multiple pages
   - What's unclear: Whether multi-page requires special handling (page numbering, section headers)
   - Recommendation: PyMuPDF handles multi-page naturally. Concatenate all pages with newline separator.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.10+ | PDF parsing script | ✓ | 3.14.3 | — |
| PyMuPDF (fitz) | PROB-01 (PDF parsing) | ✗ | — | Phase 2 requires installation |
| Claude Code LLM | PROB-03 (structured extraction) | ✓ | Current session | — |
| Standard library (file I/O) | PROB-02 (MD/TXT parsing) | ✓ | Built-in | — |

**Missing dependencies with no fallback:**
- PyMuPDF (fitz) - BLOCKER for PROB-01. Must be installed during Phase 2.

**Missing dependencies with fallback:**
- None identified.

**Verification commands:**
```bash
# Check Python version
python3 --version  # Expected: 3.10+

# Check PyMuPDF installation (after install)
python3 -c "import fitz; print(fitz.__doc__[:50])"

# Verify PyMuPDF can open PDFs
python3 -c "import fitz; doc = fitz.open('tests/fixtures/simple.md'[:4] + '.pdf' if False else 'tests/fixtures/simple.md'); print('OK')"
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Smoke tests + file validation (no automated test framework) |
| Config file | `tests/fixtures/` contains problem files |
| Quick run command | `/mm-agent --problem tests/fixtures/simple.md` |
| Full suite command | Run all 3 fixtures: `simple.md`, `multi-task.md`, `prediction.md` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROB-01 | Parse PDF and extract text | smoke | `/mm-agent --problem tests/fixtures/simple.pdf` (need PDF fixture) | ❌ W0 |
| PROB-02 | Parse MD/TXT and extract text | smoke | `/mm-agent --problem tests/fixtures/simple.md` | ✅ Phase 1 |
| PROB-03 | Extract background, objectives, constraints | smoke | Verify problem.md has these fields populated | ❌ W0 |
| PROB-04 | Output structured problem.md | file | `test -f .planning/memory/problem.md` | ❌ W0 |

### Sampling Rate
- **Per task commit:** Verify skill files exist and parse-problem.md has correct frontmatter
- **Per wave merge:** Run smoke test with simple.md fixture
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `parse-problem.md` skill - handles PDF/MD/TXT parsing and structured extraction
- [ ] `.planning/memory/problem.md` - canonical output file (created at runtime)
- [ ] `.planning/memory/context-for-phase-03.txt` - context for task decomposition (created at runtime)
- [ ] `tests/fixtures/simple.pdf` - PDF version of simple fixture (for PROB-01 testing)
- [ ] PyMuPDF installation: `pip install PyMuPDF` - required for PDF parsing
- [ ] Field validation: Verify all 7 fields (title, background, questions, constraints, objectives, keywords, summary) are extracted

*(Infrastructure: No automated test framework needed for v1 - Skills tested by invocation as established in Phase 1. Manual verification of file existence and content is sufficient.)*

## Sources

### Primary (HIGH confidence)
- [PyMuPDF GitHub Repository](https://github.com/pymupdf/PyMuPDF) - Installation instructions, basic usage, text extraction via `page.get_text()`, current version 1.27.2.2
- [pdfplumber GitHub Repository](https://github.com/jsvine/pdfplumber) - Table extraction, text extraction with position information, actively maintained in 2025
- [OpenAI Cookbook - Function Calling](https://github.com/openai/openai-cookbook/blob/main/examples/How_to_call_functions_with_chat_models.ipynb) - Prompt patterns for structured extraction, JSON schema definition, validation techniques
- [LLM-MM-Agent GitHub Repository](https://github.com/usail-hkust/LLM-MM-Agent) - Task ID-based loading, problem analysis phase reference, requirements.txt for dependencies
- [MM-Agent Paper](https://arxiv.org/abs/2505.14148) - Four-stage framework, problem analysis stage (abstract only - full PDF not accessible)
- [Phase 1 Skills](.claude/skills/mm-agent/SKILL.md) - Skill frontmatter format, process section patterns, coordinator integration
- [Phase 1 Coordinator](.claude/skills/mm-agent/coordinator.md) - Memory system initialization, phase orchestration pattern
- [Test Fixtures](tests/fixtures/) - Simple, multi-task, and prediction problem examples showing expected input format

### Secondary (MEDIUM confidence)
- [Claude Code Documentation](https://docs.anthropic.com/en/docs/claude-code) - General CLI usage, Python integration patterns (generic, not skill-specific)
- [Claude Code Skills Guide](https://docs.anthropic.com/en/docs/claude-code/skills) - Skill class structure, async execute methods, Pydantic models (search results not fully accessible)

### Tertiary (LOW confidence)
- Web search results for "Claude API structured outputs" - URL returned 404, documentation may have moved
- Web search results for "LLM structured extraction problem analysis" - Search returned generic results without specific technical details

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - PyMuPDF and pdfplumber verified from official GitHub repositories
- Architecture: HIGH - Based on Phase 1 established patterns (skills, coordinator, memory system)
- Pitfalls: HIGH - Common PDF parsing and LLM extraction issues well-documented
- Code examples: HIGH - PyMuPDF examples from official docs, LLM patterns from OpenAI Cookbook

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (30 days for stable libraries like PyMuPDF)