---
phase: 3
slug: task-decomposition-with-dag
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-11
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.2 |
| **Config file** | None - use default pytest discovery |
| **Quick run command** | `pytest tests/test_dag_operations.py tests/test_memory_system.py -v -x` |
| **Full suite command** | `pytest tests/ -v` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pytest tests/test_dag_operations.py tests/test_memory_system.py -v -x`
- **After every plan wave:** Run `pytest tests/ -v`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | TASK-01 | unit | `pytest tests/test_task_decomposition.py::test_identify_subproblems -x` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | TASK-02 | unit | `pytest tests/test_dag_operations.py::test_build_dag -x` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | TASK-03 | unit | `pytest tests/test_dag_operations.py::test_topological_sort -x` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 1 | TASK-04 | unit | `pytest tests/test_dag_operations.py::test_cycle_detection -x` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 2 | TASK-05 | integration | `pytest tests/test_dag_operations.py::test_dag_output -x` | ❌ W0 | ⬜ pending |
| 03-04-01 | 04 | 2 | MEM-01 | unit | `pytest tests/test_memory_system.py::test_load_dependencies -x` | ❌ W0 | ⬜ pending |
| 03-04-02 | 04 | 2 | MEM-02 | unit | `pytest tests/test_memory_system.py::test_write_memory -x` | ❌ W0 | ⬜ pending |
| 03-05-01 | 05 | 2 | MEM-03 | integration | `pytest tests/test_memory_system.py::test_context_passing -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_dag_operations.py` — DAG construction, topological sort, cycle detection tests
- [ ] `tests/test_memory_system.py` — Memory I/O, context passing tests
- [ ] `tests/test_task_decomposition.py` — LLM-based task decomposition tests
- [ ] `tests/conftest.py` — Shared fixtures for test data (sample DAGs, Memory files)
- [ ] `.claude/scripts/dag_topological_sort.py` — Topological sort CLI script
- [ ] `.claude/scripts/load_dependency_memory.py` — Memory loading CLI script

*Existing infrastructure: pytest 9.0.2 already installed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| LLM dependency analysis accuracy | TASK-02 | LLM output unpredictable, requires semantic review | Run decomposition on sample problem.md, review dependency logic manually |
| Cycle error user guidance | TASK-04 | Error message formatting, user choice handling | Trigger cycle error, verify message clarity and options presented |

*All other phase behaviors have automated verification.*

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

*Phase: 03-task-decomposition-with-dag*
*Validation strategy created: 2026-04-11*