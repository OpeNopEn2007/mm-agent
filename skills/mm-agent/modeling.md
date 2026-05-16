---
name: modeling
description: Mathematical modeling with Actor-Critic iterative improvement
---

# Modeling Skill

Generate mathematical modeling solutions through Actor-Critic iteration for a single task.

**Invocation:** The coordinator invokes this skill with `--task-id {id}` after Phase 4 (HMML Retrieval) completes.

## Parameters

- `task_id` — Task identifier (from coordinator via $ARGUMENTS)

## Iteration Settings

- `max_rounds`: 3 (maximum improvement iterations)
- `satisfaction_threshold`: 8 (stop when critic score >= 8)

## Step 1: Load inputs

Read these files using the Read tool:

1. `.planning/memory/task-desc-{task_id}.txt` — Task description
2. `.planning/memory/retrieved-methods-{task_id}.json` — HMML retrieval results (may not exist)
3. `.planning/memory/context-for-task-{task_id}.txt` — Dependency context from prior tasks (may not exist)

If the task description file is missing, report an error and stop.

## Step 2: Generate initial modeling solution (Actor)

Ask the LLM to generate a modeling solution. Use this prompt structure:

> You are a mathematical modeling expert. Generate a modeling solution for this task:
>
> Task Description: {task_desc}
> Retrieved Methods (for reference): {retrieved_methods}
> Dependency Context (previous task results): {dependency_context}
>
> Generate a comprehensive modeling solution with these sections:
> 1. **Modeling Method** — Describe the approach, selected method, and rationale
> 2. **Formulas** — Mathematical formulas with LaTeX notation ($$...$$)
> 3. **Variables** — Table of all variables with symbols, descriptions, types, ranges
> 4. **Assumptions** — List of modeling assumptions with justifications

Store the result as `solution`.

## Step 3: Critic evaluation

Ask the LLM to evaluate the solution. Use this prompt structure:

> You are a critical reviewer. Evaluate this mathematical modeling solution:
>
> Task: {task_desc}
> Modeling Solution: {solution}
>
> Evaluate on these dimensions:
> 1. Method Selection — Is the selected method appropriate for the task?
> 2. Formulation — Are the formulas mathematically correct and complete?
> 3. Variables — Are all variables defined with clear meanings and types?
> 4. Assumptions — Are assumptions justified and not contradictory?
>
> Output JSON: {"score": <1-10>, "strengths": [...], "weaknesses": [...], "improvements": [...]}

Parse the `score` from the JSON response.

## Step 4: Iterate if needed

If the score is **>= 8** (satisfaction_threshold), skip to Step 5.

Otherwise, for rounds 1 and 2 (up to `max_rounds` total):

1. **Actor:** Ask the LLM to improve the solution based on the critic's weaknesses and improvements feedback
2. **Critic:** Re-evaluate the improved solution with the same evaluation prompt
3. Track the best score and solution across all rounds
4. If score >= 8, stop iterating early

## Step 5: Extract structured formulas

From the best solution, ask the LLM to extract structured data:

> Extract structured information from this modeling solution:
>
> Modeling Solution: {solution}
>
> Output JSON:
> {
>   "task_id": "{task_id}",
>   "equations": [{"name": "...", "latex": "...", "description": "..."}],
>   "variables": [{"symbol": "...", "description": "...", "type": "...", "range": "..."}],
>   "assumptions": ["Assumption 1 with justification", ...]
> }

## Step 6: Write outputs

### model.md

Write to `.planning/memory/model-{task_id}.md` with this structure:

```markdown
---
task_id: {task_id}
phase: mathematical-modeling
iteration_rounds: {rounds_executed}
final_score: {best_score}
satisfaction_threshold: 8
---

{best_solution}
```

### formulas.json

Write the extracted JSON to `.planning/memory/formulas-{task_id}.json`.

## Step 7: Update task memory

Read `.planning/memory/task-{task_id}.json`, update these fields, and write it back:

- `phase`: `"mathematical-modeling"`
- `status`: `"completed"`
- `mathematical_modeling_process`: the best solution text (without frontmatter)
- `preliminary_formulas`: the parsed formulas JSON object
- `updated_at`: current ISO timestamp

---

## Quality Checklist

- [ ] Task description loaded from task-desc-{id}.txt
- [ ] Retrieved methods loaded (if available)
- [ ] Initial modeling solution generated
- [ ] Critic evaluates solution with 1-10 score
- [ ] Iteration performs at most 3 rounds
- [ ] Iteration stops early if score >= 8
- [ ] model.md written with required sections (Modeling Method, Formulas, Variables, Assumptions)
- [ ] formulas.json written with correct schema (equations[], variables[], assumptions[])
- [ ] Task memory updated with modeling results
