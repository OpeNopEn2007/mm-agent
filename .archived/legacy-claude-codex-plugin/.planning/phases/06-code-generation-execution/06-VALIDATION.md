---
phase: 6
slug: code-generation-execution
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-11
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.2 |
| **Config file** | pytest.ini (using defaults) |
| **Quick run command** | `pytest tests/test_code_execution.py -x -v` |
| **Full suite command** | `pytest tests/ -v --tb=short` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pytest tests/test_code_execution.py -x -v`
- **After every plan wave:** Run `pytest tests/ -v --tb=short`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | CODE-01 | integration | `pytest tests/test_code_execution.py::test_code_generation -x` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 1 | CODE-02 | integration | `pytest tests/test_code_execution.py::test_code_execution -x` | ❌ W0 | ⬜ pending |
| 06-03-01 | 03 | 2 | CODE-03 | unit | `pytest tests/test_code_execution.py::test_output_capture -x` | ❌ W0 | ⬜ pending |
| 06-03-02 | 03 | 2 | CODE-04 | integration | `pytest tests/test_code_execution.py::test_retry_logic -x` | ❌ W0 | ⬜ pending |
| 06-03-03 | 03 | 2 | CODE-06 | unit | `pytest tests/test_code_execution.py::test_timeout_protection -x` | ❌ W0 | ⬜ pending |
| 06-04-01 | 04 | 3 | CODE-05 | integration | `pytest tests/test_code_execution.py::test_results_format -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_code_execution.py` — covers CODE-01 through CODE-06
- [ ] `tests/fixtures/sample-model.md` — sample modeling document for testing
- [ ] `tests/fixtures/sample-formulas.json` — sample formulas schema for testing
- [ ] Framework install: Already installed (pytest 9.0.2)

*Framework already available. Wave 0 creates test file and fixtures.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Generated plot visual quality | CODE-05 | Requires human judgment | Run sample execution, inspect `.planning/output/plots/` PNG files |
| LLM repair prompt effectiveness | CODE-04 | Non-deterministic behavior | Run code with intentional errors, observe repair success rate |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending