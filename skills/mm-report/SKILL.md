---
name: mm-report
description: Produce and compile a reporting candidate from accepted Case artifacts.
---

# Reporting

Read only accepted artifacts declared by the Writer Manifest. Write outline,
notation, and `main.tex` in the current reporting Attempt. Call
`mm_agent_compile` for that Attempt; retain its generated `compile.log`,
`report.pdf`, and Compile Runtime Evidence unchanged. A PDF without successful,
hash-matching Compile Evidence cannot pass the Reporting Gate.

## Compile contract (mandatory)

`mm_agent_compile` must be called with:

- `case_id` — the current Case id, copied from `context.json`.
- `work_dir` — exactly the current Attempt directory relative to the Case root.
  If `context.json` lives at `attempts/reporting/002/context.json`, then
  `work_dir` is the literal string `attempts/reporting/002`. Do not pass an
  absolute path, a host system path, the directory of a previous reporting
  Attempt, or a path that is not a direct child of `attempts/reporting/`.
- `main_tex` — the literal string `main.tex` (or omit it; `main.tex` is the
  default and the only accepted value).

The Writer only produces candidates under its current Attempt directory and
only calls `mm_agent_compile` for that Attempt. It never calls `mm_agent_case`,
never calls Gate, never dispatches a new Attempt, never compiles inside a
sibling or earlier reporting Attempt, and never delegates via `task`.