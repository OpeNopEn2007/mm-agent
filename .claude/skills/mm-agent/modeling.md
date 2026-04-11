# Mathematical Modeling Sub-Skill

**Purpose:** Generate mathematical modeling solutions using Actor-Critic iteration.

**Parent:** mm-agent coordinator.md

---

## Invocation

Called by coordinator.md as Phase 5 of mm-agent workflow.

## Input

- `.planning/memory/task-desc-{task_id}.txt` — Task description
- `.planning/memory/retrieved-methods-{task_id}.json` — HMML retrieval results
- `.planning/memory/task-{dep_id}.json` — Dependency task memories (if applicable)

## Output

- `.planning/memory/model-{task_id}.md` — Modeling method, formulas, variables, assumptions
- `.planning/memory/formulas-{task_id}.json` — Structured formula definitions

## Actor-Critic Iteration

```
max_rounds: 3
satisfaction_threshold: 8

Actor: Generate/improve modeling solution
Critic: Evaluate quality (score 1-10), provide feedback
Stop: score >= threshold OR rounds exhausted
```

---

## Integration

Phase 5 of mm-agent workflow. Called by coordinator after Phase 4 (HMML Retrieval) completes.

Output consumed by Phase 6 (Code Generation) programmer.md agent.