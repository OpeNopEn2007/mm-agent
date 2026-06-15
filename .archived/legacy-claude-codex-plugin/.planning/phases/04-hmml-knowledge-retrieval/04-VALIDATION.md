---
phase: 4
slug: hmml-knowledge-retrieval
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-04-11"
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.4+ (Python standard) |
| **Config file** | tests/conftest.py (existing from Phase 3) |
| **Quick run command** | `pytest tests/test_hmml_retrieval.py -x -v` |
| **Full suite command** | `pytest tests/ -v --cov` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pytest tests/test_hmml_retrieval.py -x -v`
- **After every plan wave:** Run `pytest tests/ -v --cov`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | KNOW-01 | unit | `pytest tests/test_hmml_retrieval.py::test_load_embeddings -x` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 1 | KNOW-02 | integration | `pytest tests/test_hmml_retrieval.py::test_retrieve_methods -x` | ❌ W0 | ⬜ pending |
| 04-03-01 | 03 | 2 | KNOW-03 | unit | `pytest tests/test_hmml_retrieval.py::test_output_format -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_hmml_retrieval.py` — stubs for KNOW-01, KNOW-02, KNOW-03
- [ ] `tests/fixtures/query-sample.txt` — sample task description for testing
- [ ] `tests/fixtures/embeddings-sample.npy` — sample embeddings for fast testing
- [ ] Framework: pytest already installed (Phase 3)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Embedding quality check | KNOW-02 | BGE-m3 model outputs non-deterministic due to FP16 | Run retrieval on known query, verify top methods match expected domain |
| Large-scale retrieval perf | KNOW-02 | Performance varies by hardware | Time retrieval with 97 methods, verify <100ms per query |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending