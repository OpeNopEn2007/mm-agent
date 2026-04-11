# Code Generation & Execution Sub-Skill

**Purpose:** Generate and execute Python code for numerical simulation.

**Parent:** mm-agent coordinator.md

---

## Invocation

Called by coordinator.md as Phase 6 of mm-agent workflow.

## Input

- `.planning/memory/model-{task_id}.md` — Modeling plan
- `.planning/memory/formulas-{task_id}.json` — Structured formulas
- `.planning/memory/task-{dep_id}.json` — Dependency task outputs (file references)

## Output

- `.planning/memory/results-{task_id}.json` — Execution results
- `.planning/memory/code-{task_id}.py` — Generated code (archived)
- `.planning/output/plots/*.png` — Visualization plots

## Execution Parameters

```
max_retries: 5
timeout: 300s (5 minutes)
```

## Error Handling

- Syntax error: Auto-fix, retry
- Runtime error: Auto-debug, retry
- Timeout: Terminate, mark failed
- Max retries exceeded: Mark failed, continue DAG

---

## Integration

Phase 6 of mm-agent workflow. Called by coordinator after Phase 5 (Mathematical Modeling) completes.

Output consumed by Phase 7 (Report Generation) reporter.md agent.