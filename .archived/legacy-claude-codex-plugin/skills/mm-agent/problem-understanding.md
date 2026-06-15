---
name: problem-understanding
description: Problem understanding with Actor-Critic iterative analysis (Phase 1 of paper)
---

# Problem Understanding Skill

Deep problem analysis through Actor-Critic iteration before task decomposition.

**Paper Phase 1 (Figure 16-18):** Problem Understanding → Problem Analysis → Problem Analysis Critique → Analysis Improvement

**Invocation:** The coordinator invokes this skill after problem parsing, before task decomposition.

## Parameters

- `$ARGUMENTS` — Problem file path (from coordinator)

## Actor-Critic Cycle

```
┌─────────────────────────────────────────┐
│  problem-understanding Skill             │
│  - Orchestrates 3-round analysis         │
└─────────────────────────────────────────┘
         ↓ Agent tool
    ┌─────────┬──────────┐
    │ Analyst │  Critic  │
    │(sonnet) │  (opus)  │
    └─────────┴──────────┘
```

## Step 1: Load problem

Read the problem file using Read tool:
- Input: `$ARGUMENTS` (problem file path)
- Output: problem_text

If problem file missing, report error and stop.

## Step 2: Actor - Initial Problem Analysis

Use Agent tool to call problem-analyst Agent:

```yaml
Agent tool call:
  subagent_type: mm-agent-analyst  # or use modeler with analysis mode
  description: Deep analysis of mathematical modeling problem
  prompt: |
    Analyze this mathematical modeling problem deeply:
    
    Problem: {problem_text}
    
    Use PROBLEM_ANALYSIS_PROMPT structure:
    - Primary objectives and model goals
    - Implicit assumptions and constraints
    - Hidden complexities and interdependencies
    - Alternative perspectives and approaches
    - Potential risks and uncertainties
    
    Output to: .planning/memory/problem-analysis.md
```

The Analyst will:
1. Identify core objectives
2. Uncover hidden assumptions
3. Analyze interdependencies
4. Consider alternative approaches
5. Document uncertainties

## Step 3: Critic - 5-Dimension Evaluation

Use Agent tool to call mm-agent-critic:

```yaml
Agent tool call:
  subagent_type: mm-agent-critic
  description: Critique problem analysis quality
  prompt: |
    Critique the problem analysis at .planning/memory/problem-analysis.md
    
    Evaluate using PROBLEM_ANALYSIS_CRITIQUE_PROMPT dimensions:
    1. Depth of Thinking — Goes beyond surface observations?
    2. Novelty of Perspective — Original insights vs. established methods?
    3. Critical Evaluation — Well-supported conclusions?
    4. Rigor and Precision — Logically consistent and mathematically sound?
    5. Contextual Awareness — Situated in broader modeling landscape?
    
    Output to: .planning/memory/analysis-critique.json
    
    Output JSON format:
    {
      "scores": {
        "depth": <1-10>,
        "novelty": <1-10>,
        "critical_evaluation": <1-10>,
        "rigor": <1-10>,
        "contextual_awareness": <1-10>,
        "overall": <average>
      },
      "recommendation": "<accept|improve|reject>",
      "critique_points": [...]
    }
```

## Step 4: Check iteration

Read `.planning/memory/analysis-critique.json`:
- If `recommendation` is "accept" or overall >= 8: STOP
- If `recommendation` is "improve" and round < 3: Continue to Step 5

## Step 5: Actor - Improve Analysis

Use Agent tool for improvement:

```yaml
Agent tool call:
  subagent_type: mm-agent-analyst
  description: Improve problem analysis based on critique (round {round})
  prompt: |
    Improve the problem analysis based on critique feedback.
    
    Current analysis: .planning/memory/problem-analysis.md
    Critique: .planning/memory/analysis-critique.json
    
    Use PROBLEM_ANALYSIS_IMPROVEMENT_PROMPT approach:
    - Address each critique point directly
    - Deepen reasoning where flagged shallow
    - Add novel perspectives where conventional
    - Strengthen logical connections
    - Expand contextual references
    
    Write improved analysis to: .planning/memory/problem-analysis.md
```

After improvement, repeat Step 3 (Critic evaluation).

## Step 6: Output final analysis

After Actor-Critic cycle completes:

### problem-analysis.md
Verify contains:
- Problem objectives
- Assumptions (explicit and implicit)
- Interdependency analysis
- Alternative perspectives
- Uncertainties and risks

### problem.json
Update `.planning/memory/problem.json`:
- `problem_analysis`: best analysis text
- `analysis_rounds`: iterations executed
- `analysis_score`: final overall score
- `updated_at`: current timestamp

---

## Quality Checklist

- [ ] Problem file loaded successfully
- [ ] Initial analysis generated via Agent tool
- [ ] Critic evaluation via Agent tool (opus)
- [ ] Actor-Critic in independent contexts
- [ ] Iteration stops when score >= 8
- [ ] Maximum 3 rounds
- [ ] problem-analysis.md written
- [ ] problem.json updated