# Solution Reporting Rubric

A passing report must use only accepted artifacts, maintain consistent notation
and units, connect claims to model and computation evidence, and present a clear
mathematical-modeling paper. `report/main.tex`, `report/compile.log`, and a
non-empty `report/report.pdf` are all mandatory; compilation success without
those three accepted outputs is a Critical finding.

## Writer Compile contract

The Writer must call `mm_agent_compile` exactly once for the current reporting
Attempt and only for that Attempt:

- `case_id` is the current Case id copied from `context.json`.
- `work_dir` is the literal Case-relative directory containing this Manifest's
  `context.json` (for example `attempts/reporting/002` when `context.json` is
  `attempts/reporting/002/context.json`). It is never an absolute path, a host
  system path, or the directory of a previous reporting Attempt.
- `main_tex` is the literal string `main.tex` (or omitted; `main.tex` is the
  only accepted value).

The Writer only writes Manifest expected outputs under its current Attempt
directory and only calls `mm_agent_compile` for that Attempt. It never calls
`mm_agent_case`, never calls Gate, never dispatches a new Attempt, never
compiles inside a sibling or earlier reporting Attempt, and never delegates via
`task`.
