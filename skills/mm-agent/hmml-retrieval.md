---
name: hmml-retrieval
description: Retrieve relevant mathematical modeling methods from HMML knowledge base
---

# HMML Retrieval Sub-Skill

**Purpose:** Retrieve relevant mathematical modeling methods from HMML knowledge base.

**Parent:** mm-agent coordinator.md

---

## Invocation

```bash
python3 scripts/hmml_retrieval.py \
  --query-file .planning/memory/task-desc-{task_id}.txt \
  --output .planning/memory/retrieved-methods-{task_id}.json \
  --top-k 6
```

## Input

- `.planning/memory/task-desc-{task_id}.txt` — Task description from Phase 3
- `knowledge/hmml/hmml-embeddings.npy` — Precomputed embeddings
- `knowledge/hmml/hmml.json` — HMML knowledge base

## Output

- `.planning/memory/retrieved-methods-{task_id}.json` — Top-K methods with similarity scores

## Output Format

```json
{
  "query": "建立网球比赛动量预测模型",
  "methods": [
    {
      "domain": "Prediction",
      "subdomain": "Time Series",
      "method": "ARIMA",
      "score": 0.85,
      "core_idea": "...",
      "application": "..."
    }
  ],
  "top_k": 6,
  "timestamp": "..."
}
```

---

## Integration

Phase 4 of mm-agent workflow. Called by coordinator after Phase 3 (Task Decomposition) completes.

Output consumed by Phase 5 (Mathematical Modeling) modeler.md agent.