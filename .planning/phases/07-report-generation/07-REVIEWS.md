---
phase: 7
reviewers: [claude]
reviewed_at: 2026-04-11T11:35:00Z
plans_reviewed: [07-01-PLAN.md, 07-02-PLAN.md, 07-03-PLAN.md, 07-04-PLAN.md]
---

# Cross-AI Plan Review — Phase 7

## Claude Review

### Summary

Phase 7 Report Generation is well-scoped with 4 plans covering test scaffolds, core implementation, coordinator integration, and verification. The plans correctly identify critical blockers (xelatex vs pdflatex, template switching) and follow TDD methodology. However, there are significant gaps in error handling, dependency management, and risk mitigation that could cause execution failures.

---

## Plan 07-01: Test Scaffolds (Wave 1)

### Strengths
- TDD approach correctly follows Phase 5-6 pattern
- 6 test classes map directly to RPT-01~06 requirements
- xelatex verification explicitly called out as CRITICAL blocker
- Realistic fixture data with 3-task structure matching production use
- Clear dependency mapping (test → conftest → fixtures)

### Concerns
- **MEDIUM**: Test `test_xelatex_available` may fail on systems without TeLive installed — no graceful degradation specified
- **MEDIUM**: `test_pdf_output_exists` only checks file existence, not content validity — could pass with 0-byte file
- **LOW**: No test for LaTeX syntax errors in generated content (only checks for Markdown absence)
- **LOW**: No test for concurrent compilation safety (if multiple reports generated)

### Suggestions
- Add `@pytest.mark.skipif` for xelatex availability test with clear message
- Add file size check (>0 bytes) to `test_pdf_output_exists`
- Consider adding LaTeX syntax validation test using `latex -interaction=nonstopmode`

---

## Plan 07-02: Report Generation Implementation (Wave 1)

### Strengths
- Skeleton adaptation with explicit fix locations for xelatex and template switching
- Fixed outline structure hardcoded per IDEA.md §11.2 — prevents LLM from deviating
- Chapter relevance map correctly limits context pollution
- markdown stripper as safeguard is good defensive programming
- Clear separation of 5 core classes with single responsibility

### Concerns
- **HIGH**: No error handling specified for LLM failures during chapter generation — if one chapter fails, what happens to the rest?
- **HIGH**: `PaperGenerator(llm=None)` — passing None as LLM will crash at runtime; needs explicit LLM resolution strategy
- **HIGH**: The skeleton adaptation requires reading 4 context files but no validation that skeleton template actually exists before adaptation begins
- **MEDIUM**: `subprocess.run` with `capture_output=True text=True` may deadlock on large LaTeX output — should specify timeout
- **MEDIUM**: No rollback strategy if PDF compilation partially fails (e.g., after first xelatex pass)

### Suggestions
- Add try/catch around chapter generation loop with partial result preservation
- Specify LLM resolution: `llm = llm or get_current_llm_from_context()`
- Add skeleton existence check before adaptation task begins
- Use `subprocess.run(timeout=60)` to prevent indefinite blocking

---

## Plan 07-03: Coordinator Integration (Wave 2)

### Strengths
- Clear 3-step workflow (Prepare → Invoke → Verify)
- Step 7.1 correctly loads all task-*.json files
- Figure and code collection included
- Both Skill tool and direct script invocation documented

### Concerns
- **HIGH**: `metadata` dict in Step 7.1 has hardcoded defaults — if problem.md parsing fails, paper will have wrong/missing metadata
- **HIGH**: Step 7.2 shows `PaperGenerator(llm=None)` which will crash (same issue as Plan 07-02)
- **MEDIUM**: Step 7.3 says "Report any compilation errors to user" — but no error propagation path defined; how does coordinator surface these?
- **MEDIUM**: The python code in Step 7.1 parses problem.md as YAML but the sample uses markdown with YAML frontmatter — inconsistent parsing strategy
- **MEDIUM**: No validation that task-*.json files exist before attempting to load them

### Suggestions
- Add validation: `if not task_files: raise ValueError("No task memories found in .planning/memory/")`
- Use proper YAML frontmatter parsing with `python-frontmatter` or similar
- Define error return path: coordinator should catch exceptions and surface to user
- Add Step 7.0: Validate prerequisites (problem.md exists, at least one task memory exists)

---

## Plan 07-04: Phase Verification (Wave 3)

### Strengths
- Checkpoint-based verification with human verification step
- Table format for requirement tracking is clear
- Sign-off checklist ensures accountability
- Automated verification commands provided

### Concerns
- **HIGH**: `autonomous: false` but tasks are labeled `checkpoint:human-verify` — this is correct but Task 2 (visual PDF inspection) cannot be automated, yet plan is Wave 3 with no contingency
- **MEDIUM**: If PDF compilation fails in CI, human verification cannot run — no path to mark phase as failed without manual intervention
- **MEDIUM**: The verification file template has placeholder `[pytest output]` but no actual capture mechanism
- **LOW**: Success criteria says ">80% pass rate" but RPT-02 (PDF compilation) may be environment-dependent

### Suggestions
- Add conditional: if xelatex unavailable, mark RPT-02 as SKIP with reason, don't fail entire phase
- Pre-capture pytest output to file before creating verification.md
- Consider adding automated PDF content smoke test (e.g., pdfplumber to extract text and verify title exists)

---

## Risk Assessment

| Plan | Risk Level | Primary Concerns |
|------|------------|------------------|
| 07-01 | LOW | xelatex availability on CI |
| 07-02 | **HIGH** | LLM=None crashes, no error handling |
| 07-03 | **HIGH** | Metadata hardcoding, error propagation missing |
| 07-04 | MEDIUM | Human verification dependency in autonomous phase |

**Overall Phase Risk: MEDIUM-HIGH**

**Justification**: Plan 07-02 and 07-03 both have high-severity issues (LLM=None, hardcoded metadata, missing error handling). The xelatex vs pdflatex issue is correctly identified but the LLM initialization strategy is completely missing. If the PaperGenerator cannot obtain an LLM, the entire phase fails regardless of other implementations.

---

## Cross-Cutting Recommendations

1. **LLM Resolution**: Add explicit LLM acquisition strategy to PaperGenerator initialization
   ```python
   def __init__(self, llm=None):
       self.llm = llm or self._acquire_llm()

   def _acquire_llm(self):
       # Detect Claude Code environment and use Skill's LLM
       # Fall back to anthropic SDK if needed
   ```

2. **Error Handling Strategy**: Define exception hierarchy:
   - `ReportGenerationError` (base)
   - `LLMFailureError` (recoverable — retry?)
   - `TemplateNotFoundError` (fatal)
   - `PDFCompilationError` (recoverable — try with reduced content)

3. **Partial Failure Policy**: Decide what "good enough" means — if 2 of 3 tasks generate correctly, should phase be marked complete?

4. **Environment Validation**: Add pre-flight check for xelatex availability and TeLive installation before Phase 7 begins.

---

## Gemini Review

*Gemini CLI failed: API key not configured. No review generated.*

---

## Consensus Summary

Since only Claude CLI review succeeded, consensus analysis is limited.

### Agreed Strengths
- TDD approach (07-01) is well-designed
- Critical blockers (xelatex, template switching) correctly identified
- Fixed outline structure prevents LLM deviation

### Agreed Concerns
- **LLM initialization strategy missing** across 07-02 and 07-03
- **No error handling** for chapter generation failures
- **Environment dependency** on xelatex without graceful fallback

### Divergent Views
- N/A (only one reviewer succeeded)

---

## Next Steps

To incorporate feedback into planning:
```
/gsd:plan-phase 7 --reviews
```

Key issues to address:
1. Add LLM resolution strategy to PaperGenerator
2. Add error handling with partial result preservation
3. Add environment validation (xelatex availability check)
4. Fix metadata parsing (YAML frontmatter vs markdown)
