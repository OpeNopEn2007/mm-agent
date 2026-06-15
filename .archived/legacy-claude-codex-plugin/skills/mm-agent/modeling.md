---
name: modeling
description: Mathematical modeling with Actor-Critic iterative improvement using Agent Team
---

# Modeling Skill

Generate mathematical modeling solutions through Actor-Critic iteration using independent Agents.

**Invocation:** The coordinator invokes this skill with `--task-id {id}` after Phase 4 (HMML Retrieval) completes.

## Parameters

- `task_id` — Task identifier (from coordinator via $ARGUMENTS)

## Iteration Settings

- `max_rounds`: 3 (maximum improvement iterations)
- `satisfaction_threshold`: 8 (stop when critic score >= 8)

## Agent Team Architecture

```
┌─────────────────────────────────────────┐
│     modeling Skill (Orchestrator)        │
│  - Coordinates Actor-Critic cycle        │
│  - Uses Agent tool for independent ctx   │
└─────────────────────────────────────────┘
         ↑ Agent tool ↓
    ┌─────┴─────┬─────────────┐
    ↓           ↓             ↓
┌────────┐ ┌────────┐ ┌──────────┐
│ Modeler│ │ Critic │ │ Reporter │
│(Actor) │ │(opus)  │ │(optional)│
└────────┘ └────────┘ └──────────┘
```

## Step 1: HMML Retrieval

Use MCP tool or Bash script to retrieve relevant methods:

**Option A (MCP):**
Use hmml_retrieve MCP tool if available:
- query: Read task description from `.planning/memory/task-desc-{task_id}.txt`
- top_k: 6

**Option B (Bash):**
```bash
python scripts/hmml_retrieval.py \
  --query-file .planning/memory/task-desc-{task_id}.txt \
  --top-k 6 \
  --output .planning/memory/retrieved-methods-{task_id}.json
```

Save results to `.planning/memory/retrieved-methods-{task_id}.json`.

## Step 2: Actor - Generate modeling solution

Use Agent tool to call mm-agent-modeler in independent context:

```yaml
Agent tool call:
  subagent_type: mm-agent-modeler
  description: Generate modeling solution for task {task_id}
  prompt: |
    Generate mathematical modeling solution for task {task_id}.
    
    Inputs:
    - Task description: .planning/memory/task-desc-{task_id}.txt
    - HMML methods: .planning/memory/retrieved-methods-{task_id}.json
    - Dependency context: .planning/memory/context-for-task-{task_id}.txt (if exists)
    
    Output to:
    - .planning/memory/model-{task_id}.md
    - .planning/memory/formulas-{task_id}.json
```

The modeler Agent will:
1. Load task description and HMML methods
2. Generate initial modeling plan
3. Write model.md and formulas.json

## Step 3: Critic - Evaluate solution

Use Agent tool to call mm-agent-critic with opus model:

```yaml
Agent tool call:
  subagent_type: mm-agent-critic
  description: Evaluate modeling solution quality for task {task_id}
  prompt: |
    Evaluate the modeling solution for task {task_id}.
    
    Files to evaluate:
    - .planning/memory/model-{task_id}.md
    - .planning/memory/formulas-{task_id}.json
    - .planning/memory/task-desc-{task_id}.txt (original task)
    
    Output critique to: .planning/memory/critique-{task_id}.json
```

The critic Agent will output structured JSON:
```json
{
  "scores": {
    "assumption_reasonability": <1-10>,
    "formula_correctness": <1-10>,
    "method_fitness": <1-10>,
    "overall": <average>
  },
  "recommendation": "<accept|improve|reject>"
}
```

## Step 4: Check iteration

Read `.planning/memory/critique-{task_id}.json` to check:
- `scores.overall` value
- `recommendation` value

If recommendation is "accept" or overall score >= 8:
- STOP iteration, proceed to Step 6

If recommendation is "improve" and current_round < max_rounds:
- Continue to Step 5

If recommendation is "reject" or max_rounds reached:
- Use best available solution, proceed to Step 6

## Step 5: Actor - Improve solution (Round 2/3)

Use Agent tool again to improve:

```yaml
Agent tool call:
  subagent_type: mm-agent-modeler
  description: Improve modeling solution based on critique (round {round})
  prompt: |
    Improve the modeling solution for task {task_id} based on critic feedback.
    
    Current solution: .planning/memory/model-{task_id}.md
    Critique: .planning/memory/critique-{task_id}.json
    
    Address the specific weaknesses and improvements listed in critique.
    Write updated model.md and formulas.json.
```

After improvement, repeat Step 3 (Critic evaluation).

## Step 6: Write final outputs

After iteration completes (accepted or max_rounds reached):

### model.md
Verify `.planning/memory/model-{task_id}.md` contains:
- Modeling Method description
- Mathematical formulas
- Variable definitions
- Assumptions

### formulas.json
Verify `.planning/memory/formulas-{task_id}.json` contains:
- equations array
- variables array
- assumptions array

## Step 7: Update task memory

Read `.planning/memory/task-{task_id}.json`, update:
- `phase`: `"mathematical-modeling"`
- `status`: `"completed"`
- `mathematical_modeling_process`: best solution text
- `preliminary_formulas`: parsed formulas
- `updated_at`: current ISO timestamp

---

## Quality Checklist

- [ ] HMML retrieval completed (MCP or Bash)
- [ ] modeler Agent called via Agent tool
- [ ] critic Agent called via Agent tool (opus model)
- [ ] Actor-Critic in independent contexts
- [ ] Iteration stops when score >= 8
- [ ] Maximum 3 rounds executed
- [ ] model.md and formulas.json written
- [ ] Task memory updated