---
name: mm-agent
description: Use /mm-agent to create or resume an immutable mathematical-modeling Case and drive its four gated stages.
---

# MM-Agent Workflow

Before any mathematical-modeling stage:

1. Call `mm_agent_check` with `scope: "all"` and the intended Case ID when one is known.
2. Present every `pass`, `warn`, and `fail` item with its evidence and repair ownership. Do not infer availability from version text when the Tool reports a failed real template compilation.
3. If any check is `fail`, stop before input preparation. Explain which `automatic` repairs can be performed after the user asks to完善, which `user` repairs require manual action, and which `none` items have no safe repair. Do not install packages, download models, or modify Python during this invocation.
4. If the environment has no failures, call `mm_agent_prepare`. Explicit paths supplied by the user take priority; otherwise omit `explicit_paths` so the Tool uses `problems/`.
5. Report whether the Case was created or resumed, its Case-relative manifest, immutable Policy, input labels and hashes, and the next confirmation needed from the user.

After the user confirms the prepared Case, drive each stage with the same loop:

1. Call `mm_agent_case` `dispatch` for the Actor role and save the returned `contextPath` and Attempt ID.
2. Use OpenCode built-in `task` once for the matching hidden Agent. Give it the Case-relative `contextPath` and tell it to follow its hidden Agent prompt and that Manifest exactly; it must not delegate. Do not tell the Actor to promote candidates, write stable artifacts, call Gate, or perform any responsibility outside its Attempt. Do not redefine or extend the Actor output schema in the task prompt. For Analysis, use the `mm-analyst` Agent's Canonical Analysis output contract unchanged; do not substitute an alternate task-graph shape.
3. Check only the Manifest `expected_outputs`, then use a fresh `mm-critic` task with the same `contextPath`. Critic returns one bare Review JSON with `schema_version: 1`, its `attempt_id` copied exactly from the Manifest, string-array findings and required fixes, UTC RFC 3339 `reviewed_at`, and Case-relative existing-path evidence limited to Manifest candidates, required reads, the Rubric, or legal Runtime Evidence. Critic creates no Attempt or file, and never calls Gate.
4. Inspect the Case immediately before Gate. Submit the Critic Review through `mm_agent_case` `gate` with `action: "gate"`, `case_id`, a top-level `attempt_id` copied exactly from the active Manifest, `expected_revision` from that latest inspect state revision, and the complete fresh `review`. Do not assume `review.attempt_id` supplies the top-level `attempt_id`. On the first Gate error, stop and report it; do not alter the Review or retry. Only a `pass` advances state. On `revise` dispatch a new Actor Attempt; on `block` report the blocker and stop or resolve it in the same scope.

Run stages in this order: Analyst, Modeler, Solver by current DAG wave, then Writer. Solver dispatches only the current wave tasks. Writer calls `mm_agent_compile` before Critic and Gate. Do not use stable artifacts or chat as a substitute for accepted facts. The only public command remains `/mm-agent`; do not invent `/doctor`, `/setup`, or another slash command.
