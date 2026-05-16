---
name: task-decomposition
description: Identify subproblems from problem.md and assign task IDs
---

# Task Decomposition Skill

Parse problem.md questions field and map each question to a task with unique ID.

**Invocation:** The coordinator invokes this skill during Phase 3 (Task Decomposition).

## Decision D-01

1:1 mapping — each question becomes one task. Complex subdivision is handled later by Phase 5 Actor-Critic iteration.

## Step 1: Read problem.md

Load `.planning/memory/problem.md` and extract the questions list from the `## Questions` section. Each line starting with `- ` is a question.

If problem.md doesn't exist, report an error and stop.

## Step 2: Map questions to tasks

Create a task for each question with sequential string IDs:

```json
{
  "tasks": {
    "1": {
      "description": "Question 1 text",
      "dependencies": [],
      "status": "pending"
    },
    "2": {
      "description": "Question 2 text",
      "dependencies": [],
      "status": "pending"
    }
  }
}
```

- `dependencies` is empty at this stage — filled during DAG construction
- `status` is `"pending"` for all tasks
- Task IDs are sequential strings ("1", "2", "3"...) for consistency with graphlib

## Step 3: Write tasks.json

Write the tasks data to `.planning/memory/tasks.json`.

## Step 4: Validate output

Verify `.planning/memory/tasks.json`:
- File exists and is valid JSON
- All tasks have required fields: `description`, `dependencies`, `status`
- All statuses are `"pending"`
- All dependency lists are empty
- At least one task was identified

---

## Quality Checklist

- [ ] problem.md read and questions extracted
- [ ] Each question mapped to a task with sequential ID
- [ ] tasks.json written with correct schema
- [ ] All tasks have empty dependencies
- [ ] All statuses are "pending"
- [ ] At least one task identified
