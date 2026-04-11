# Report Generation Sub-Skill

**Purpose:** Generate LaTeX/PDF report from modeling workflow artifacts.

**Parent:** mm-agent coordinator.md

---

## Invocation

Called by coordinator.md as Phase 7 of mm-agent workflow.

## Input

- `.planning/memory/problem.md` — Problem analysis (Phase 2)
- `.planning/memory/dag.json` — Task structure (Phase 3)
- `.planning/memory/task-*.json` — All task memories
- `.planning/memory/model-*.md` — Modeling plans
- `.planning/memory/results-*.json` — Execution results
- `.planning/output/plots/*.png` — Visualization plots

## Output

- `.planning/output/report.tex` — LaTeX source
- `.planning/output/report.pdf` — Compiled PDF
- `.planning/output/appendix/` — Code and figure appendix

## Template Support

- **mcmthesis** — MCM/ICM 美赛 template
- **cumcmthesis** — CUMCM 国赛 template

## Chapter Structure (IDEA.md §11.2)

Fixed outline + dynamic Task chapters:
- Problem Restatement
- Problem Analysis
- Model Assumptions
- Task N Analysis (dynamic)
- Task N Solution (dynamic)
- Model Conclusion
- Appendix

---

## Integration

Phase 7 of mm-agent workflow. Final phase, produces output report.

Called by coordinator after Phase 6 (Code Execution) completes.