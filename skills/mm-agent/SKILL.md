---
name: mm-agent
description: Use when invoking /mm-agent to check the local environment and create or resume an immutable mathematical-modeling Case.
---

# MM-Agent Intake

Before any mathematical-modeling stage:

1. Call `mm_agent_check` with `scope: "all"` and the intended Case ID when one
   is known.
2. Present every `pass`, `warn`, and `fail` item with its evidence and repair
   ownership. Do not infer availability from version text when the Tool reports
   a failed real template compilation.
3. If any check is `fail`, stop before input preparation. Explain which
   `automatic` repairs can be performed after the user asks to完善, which
   `user` repairs require manual action, and which `none` items have no safe
   repair. Do not install packages, download models, or modify Python during
   this invocation.
4. If the environment has no failures, call `mm_agent_prepare`. Explicit paths
   supplied by the user take priority; otherwise omit `explicit_paths` so the
   Tool uses `problems/`.
5. Report whether the Case was created or resumed, its Case-relative manifest,
   immutable Policy, input labels and hashes, and the next confirmation needed
   from the user.

Stop after the environment and intake result. Step 3 does not start Problem
Analysis, choose an embedding model, build an HMML index, execute compute, or
compile the final report. The only public command remains `/mm-agent`; do not
invent `/doctor`, `/setup`, or another slash command.
