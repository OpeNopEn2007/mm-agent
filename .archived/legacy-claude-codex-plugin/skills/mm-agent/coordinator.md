---
name: mm-agent-coordinator
description: Workflow orchestrator for mm-agent 7-phase mathematical modeling pipeline
---

# Coordinator Skill

Orchestrate the 7-phase mathematical modeling workflow. This skill is invoked by the main mm-agent SKILL.md after parameter parsing.

## Step 1: Initialize Memory System

Use Bash tool to create the working directories:

```bash
mkdir -p .planning/memory .planning/code .planning/output tests/fixtures
```

Display the workflow banner:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 MM-Agent ► Mathematical Modeling Workflow
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Problem file: {problem_file}
Mode: {interactive/auto}
Phases: 7 total
```

## Step 2: Problem Analysis (Phase 2)

1. Use the **Skill tool** to invoke `parse-problem` with the problem file path
2. Verify `.planning/memory/problem.md` was created
3. If the skill fails, report the error and stop — problem analysis is a hard dependency for all later phases

## Step 3: Task Decomposition (Phase 3)

### 3a: Decompose into tasks

1. Use the **Skill tool** to invoke `task-decomposition`
2. Verify `.planning/memory/tasks.json` was created
3. If the skill fails, report the error and stop

### 3b: Build DAG and execution order

Run the topological sort script:

```bash
python3 scripts/dag_topological_sort.py \
    --input .planning/memory/tasks.json \
    --output .planning/memory/dag.json
```

If the script detects a circular dependency, report the cycle details and stop.

Verify that both `dag.json` and `execution-order.txt` exist in `.planning/memory/`.

## Step 4: Per-Task Execution Loop (Phases 4–6)

Read the execution order from `.planning/memory/execution-order.txt`. For **each task ID** in that file, execute the following sequence:

### 4a: Load dependency context

```bash
python3 scripts/load_dependency_memory.py \
    --mode load \
    --task-id {task_id} \
    --dag .planning/memory/dag.json \
    --memory-dir .planning/memory \
    --output .planning/memory/context-for-task-{task_id}.txt
```

Then create the initial task memory file:

```bash
python3 scripts/load_dependency_memory.py \
    --mode create \
    --task-id {task_id} \
    --description "{task_description}" \
    --phase "task-decomposition" \
    --memory-dir .planning/memory
```

If a task has dependencies but no context file was created, skip it and log a warning — the dependency may not have completed yet.

### 4b: HMML Knowledge Retrieval (Phase 4)

Write the task description to a query file, then run retrieval:

```bash
echo "{task_description}" > .planning/memory/task-desc-{task_id}.txt

python3 scripts/hmml_retrieval.py \
    --query-file .planning/memory/task-desc-{task_id}.txt \
    --output .planning/memory/retrieved-methods-{task_id}.json \
    --top-k 6
```

If retrieval fails, log a warning and continue without retrieved methods.

### 4c: Mathematical Modeling (Phase 5)

Use the **Skill tool** to invoke `modeling` with `--task-id {task_id}`.

Verify that `.planning/memory/model-{task_id}.md` and `.planning/memory/formulas-{task_id}.json` were created. If modeling fails, create placeholder files so downstream phases can still run.

Update the task memory file (`.planning/memory/task-{task_id}.json`) with:
- `phase`: `"mathematical-modeling"`
- `status`: `"completed"`
- `mathematical_modeling_process`: content of model-{task_id}.md (without frontmatter)
- `preliminary_formulas`: contents of formulas-{task_id}.json

### 4d: Code Generation & Execution (Phase 6)

Use the **Skill tool** to invoke `code-execution` with `--task-id {task_id}`.

Verify that `.planning/memory/results-{task_id}.json` was created. If execution fails, log a warning — Phase 6 is non-blocking and should not halt the DAG.

Update the task memory file with:
- `phase`: `"code-execution"`
- `execution_result`: contents of results-{task_id}.json
- `task_code`: contents of `.planning/code/task-{task_id}.py` (if it exists)
- `charts`: list of plot files (if any)

### 4e: Task memory persistence

After each task completes, use a Python script or inline code to read the existing task memory JSON, update the fields listed above, and write it back. Use `json.load()` / `json.dump()` with `ensure_ascii=False`.

## Step 5: Report Generation (Phase 7)

### 5a: Prepare metadata

1. Read `.planning/memory/problem.md` and parse YAML frontmatter for title, team, year, template
2. Read all `.planning/memory/task-*.json` files
3. Build `report-memory.json` with problem context and per-task results
4. Build `report-metadata.json` with title, team, year, template, figures list, codes list
5. Save both to `.planning/memory/`

### 5b: Check xelatex availability

```bash
which xelatex
```

If xelatex is not available, warn the user that PDF compilation will be skipped but LaTeX source will still be generated.

### 5c: Invoke report generation

Use the **Skill tool** to invoke `report-generation`.

Verify that `.planning/output/report.tex` was created. If PDF compilation succeeded, verify `.planning/output/report.pdf` exists and is non-empty.

## Step 6: Final Verification

After all phases complete, verify the key artifacts:

1. `.planning/memory/problem.md` — structured problem definition
2. `.planning/memory/dag.json` — task dependency graph
3. `.planning/memory/execution-order.txt` — topological sort order
4. `.planning/memory/task-{id}.json` — per-task memory (one per task)
5. `.planning/memory/model-{id}.md` — modeling output per task
6. `.planning/memory/results-{id}.json` — execution results per task
7. `.planning/output/report.tex` — LaTeX source
8. `.planning/output/report.pdf` — compiled PDF (if xelatex available)

Display the completion banner:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Workflow Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Output: .planning/output/report.pdf
Memory: .planning/memory/task-*.json
```

---

## Error Handling

- **Phase 2 failure (problem parsing):** Hard stop. Cannot proceed without structured problem.
- **Phase 3 failure (task decomposition):** Hard stop. Cannot build DAG without tasks.
- **Phase 3 failure (circular dependency):** Hard stop. Report the cycle and ask user to fix task dependencies.
- **Phase 4 failure (HMML retrieval):** Soft warning. Continue without retrieved methods.
- **Phase 5 failure (modeling):** Soft warning. Create placeholder model/formulas files.
- **Phase 6 failure (code execution):** Soft warning. Phase 6 is non-blocking.
- **Phase 7 failure (report):** Soft warning. LaTeX source may still be usable.

## Script Locations

- `scripts/dag_topological_sort.py` — DAG construction with topological sort and cycle detection
- `scripts/load_dependency_memory.py` — Memory file I/O (load context, create/update task memory)
- `scripts/hmml_retrieval.py` — HMML knowledge base retrieval with cosine similarity
