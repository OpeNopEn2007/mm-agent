---
name: task-decomposition
description: Identify subproblems from problem.md and assign task IDs
---

<objective>
Parse problem.md questions field and map each question to a task with unique ID.

Following Decision D-01: 1:1 mapping (each question → one task). Complex subdivision
is handled by Phase 5 Actor-Critic iteration.

Output: tasks.json with task descriptions. Dependencies are empty initially,
filled in later during DAG construction (Plan 03-03).
</objective>

<context>
**Input format (from Phase 2 parse-problem.md):**

problem.md has YAML frontmatter and questions field:
```yaml
---
title: Problem title
type: competition_problem
source: path/to/problem.pdf
---

# Background
{background text}

## Questions
- Question 1 text
- Question 2 text
- Question 3 text
...
```

**Output format (per Decision D-01):**

tasks.json:
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

**Note:** Dependencies field is empty at this stage - filled in Plan 03-03
(DAG construction). Task IDs use sequential strings for consistency with
graphlib topological sort.
</context>

<process>

## Step 1: Read problem.md

Load the problem.md file and extract the questions list:

```python
import yaml
from pathlib import Path

problem_path = Path('.planning/memory/problem.md')

if not problem_path.exists():
    raise FileNotFoundError(f"problem.md not found: {problem_path}")

with open(problem_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Parse YAML frontmatter
if content.startswith('---'):
    _, frontmatter, body = content.split('---', 2)
    metadata = yaml.safe_load(frontmatter)
else:
    metadata = {}
    body = content

# Extract questions from body
questions = []
in_questions_section = False
for line in body.split('\n'):
    if '## Questions' in line:
        in_questions_section = True
        continue
    elif line.startswith('## ') and in_questions_section:
        # Entered a new section
        break
    elif in_questions_section and line.strip().startswith('- '):
        questions.append(line.strip()[2:])
```

## Step 2: Map questions to tasks

Iterate through questions list and assign sequential task IDs:

```python
tasks = {}
for i, question in enumerate(questions, start=1):
    task_id = str(i)
    tasks[task_id] = {
        "description": question,
        "dependencies": [],  # Empty initially, filled in Plan 03-03
        "status": "pending"
    }
```

## Step 3: Write tasks.json

Create the output JSON file:

```python
import json

tasks_data = {"tasks": tasks}

output_path = Path('.planning/memory/tasks.json')
output_path.parent.mkdir(parents=True, exist_ok=True)

with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(tasks_data, f, indent=2, ensure_ascii=False)

print(f"✓ Wrote {len(tasks)} tasks to {output_path}")
```

## Step 4: Validate output

Verify the output file is valid and complete:

```bash
# Verify file exists
test -f .planning/memory/tasks.json || exit 1

# Verify JSON is valid
python3 -c "import json; json.load(open('.planning/memory/tasks.json'))" || exit 1

# Verify all tasks have required fields
python3 << 'EOF'
import json
with open('.planning/memory/tasks.json') as f:
    data = json.load(f)

for task_id, task in data['tasks'].items():
    assert 'description' in task, f"Task {task_id} missing description"
    assert 'dependencies' in task, f"Task {task_id} missing dependencies"
    assert 'status' in task, f"Task {task_id} missing status"
    assert task['status'] == 'pending', f"Task {task_id} status not pending"
    assert task['dependencies'] == [], f"Task {task_id} dependencies not empty"

print("✓ All tasks validated")
EOF
```

</process>

<quality_gate>
- [ ] All questions from problem.md mapped to tasks
- [ ] Task IDs are sequential strings starting from "1"
- [ ] All tasks have empty dependencies (filled in Plan 03-03)
- [ ] All tasks have status "pending"
- [ ] tasks.json is valid JSON and parseable
</quality_gate>

<notes>
**Skill auto-discovery:**
This skill is automatically discovered by Claude Code from
`.claude/skills/mm-agent/task-decomposition.md`.

**Coordinator integration:**
The coordinator skill invokes task-decomposition after parse-problem
completes. The output (tasks.json) serves as input for DAG construction
in Plan 03-03.

**Progressive decomposition:**
Following Decision D-01, this plan implements Wave 1 decomposition:
1:1 mapping from questions to tasks. Complex subdivision is handled
by Phase 5 Actor-Critic iteration where needed.

**Requirements addressed:**
- TASK-01: Identify multiple subproblems from structured problem.md
- TASK-01: Assign unique task IDs (1, 2, 3...) to each subproblem
- TASK-01: Map each task description from problem.md questions field
</notes>