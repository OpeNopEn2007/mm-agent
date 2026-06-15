---
phase: 02
slug: problem-analysis-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Smoke tests + file validation (no automated test framework) |
| **Config file** | `tests/fixtures/` contains problem files |
| **Quick run command** | `/mm-agent --problem tests/fixtures/simple.md` |
| **Full suite command** | Run all 3 fixtures: `simple.md`, `multi-task.md`, `prediction.md` |
| **Estimated runtime** | ~30 seconds per fixture |

---

## Sampling Rate

- **After every task commit:** Verify skill files exist and parse-problem.md has correct frontmatter
- **After every plan wave:** Run smoke test with simple.md fixture
- **Before `/gsd:verify-work`:** Full suite green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | PROB-01 | smoke | `/mm-agent --problem tests/fixtures/simple.pdf` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | PROB-02 | smoke | `/mm-agent --problem tests/fixtures/simple.md` | ✅ Phase 1 | ⬜ pending |
| 02-02-01 | 02 | 1 | PROB-03 | file | Verify problem.md has 7 fields | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | PROB-04 | file | `test -f .planning/memory/problem.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/fixtures/simple.pdf` — PDF version of simple fixture (for PROB-01 testing)
- [ ] `tests/fixtures/multi-task.pdf` — PDF version of multi-task fixture
- [ ] PyMuPDF installation: `pip install PyMuPDF` — required for PDF parsing
- [ ] `.planning/memory/` directory — created by Phase 1 coordinator
- [ ] Field validation logic — Verify all 7 fields extracted

*Note: Infrastructure from Phase 1 covers MD/TXT parsing. Phase 2 adds PDF support.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Semantic extraction quality | PROB-03 | LLM output varies | Read problem.md, verify fields contain correct problem information |
| Encoding handling | PROB-01 | Edge case | Test with non-UTF-8 PDF if available |

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

---

*Phase: 02-problem-analysis-pipeline*
*Validation created: 2026-04-10*