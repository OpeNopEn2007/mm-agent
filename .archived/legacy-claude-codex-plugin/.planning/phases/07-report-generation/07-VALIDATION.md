---
phase: 7
slug: report-generation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-11
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest |
| **Config file** | pytest.ini or pyproject.toml (reuse from Phase 6) |
| **Quick run command** | `pytest tests/test_report_generation.py -x -v` |
| **Full suite command** | `pytest tests/test_report_generation.py -v` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pytest tests/test_report_generation.py -x -v`
- **After every plan wave:** Run `pytest tests/test_report_generation.py -v`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | RPT-01, RPT-03 | unit | `pytest tests/test_report_generation.py::TestOutlineStructure -x` | ✅ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | RPT-05 | unit | `pytest tests/test_report_generation.py::TestChapterRelevance -x` | ✅ W0 | ⬜ pending |
| 07-02-01 | 02 | 1 | RPT-01 | unit | `pytest tests/test_report_generation.py::TestLatexGeneration -x` | ✅ W0 | ⬜ pending |
| 07-02-02 | 02 | 1 | RPT-04 | unit | `pytest tests/test_report_generation.py::TestTemplateSelection -x` | ✅ W0 | ⬜ pending |
| 07-02-03 | 02 | 1 | RPT-06 | unit | `pytest tests/test_report_generation.py::TestScientificWriting -x` | ✅ W0 | ⬜ pending |
| 07-03-01 | 03 | 2 | RPT-02 | integration | `pytest tests/test_report_generation.py::TestPDFCompilation -x` | ✅ W0 | ⬜ pending |
| 07-04-01 | 04 | 3 | ALL | e2e | `pytest tests/test_report_generation.py -v` | ✅ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_report_generation.py` — stubs covering RPT-01 through RPT-06
- [ ] `tests/conftest.py` — shared fixtures (memory JSON structure, template paths)
- [ ] `tests/fixtures/` — sample memory JSON files for testing

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PDF visual formatting quality | RPT-02 | Requires human review of typeset output | Open generated PDF and verify sections render correctly |
| Scientific writing narrative flow | RPT-06 | Subjective assessment of academic prose quality | Read chapter output and verify continuous narrative without Markdown artifacts |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
