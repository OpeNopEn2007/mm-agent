# Solution Reporting Rubric

A passing report must use only accepted artifacts, maintain consistent notation and units, connect claims to model and computation evidence, and present a clear mathematical-modeling paper. `report/main.tex`, `report/compile.log`, and a non-empty `report/report.pdf` are all mandatory; compilation success without those three accepted outputs is a Critical finding.

A passing report must include every figure, numerical test, metric, and table required by the problem and claimed by accepted task deliverables. Placeholder captions, unrendered figures, unexecuted tests, or language deferring a required result to future compute are Critical findings. The Critic must inspect `compile.log`; overfull boxes wider than 20 pt, clipped content, unresolved references in the final pass, or other evidence that content exceeds the page are required fixes rather than cosmetic warnings. Recommendations explicitly requested by the problem are deliverables, not future-compute deferrals, unless they replace a result required now.

## Writer Compile contract

The Writer must call `mm_agent_compile` only for the current reporting Attempt. It may retry while repairing that Candidate, but every Evidence record must be preserved and the final reference must identify successful Compile Evidence:

- `case_id` is the current Case id copied from `context.json`.
- `work_dir` is the literal Case-relative directory containing this Manifest's `context.json` (for example `attempts/reporting/002` when `context.json` is `attempts/reporting/002/context.json`). It is never an absolute path, a host system path, or the directory of a previous reporting Attempt.
- `main_tex` is the literal string `main.tex` (or omitted; `main.tex` is the only accepted value).

The Writer only writes Manifest expected outputs under its current Attempt directory and only calls `mm_agent_compile` for that Attempt. It never calls `mm_agent_case`, never calls Gate, never dispatches a new Attempt, never compiles inside a sibling or earlier reporting Attempt, and never delegates via `task`.
