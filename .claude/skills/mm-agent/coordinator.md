---
name: coordinator
description: Workflow orchestrator for mm-agent phases
---

<objective>
Orchestrate the 7-phase mathematical modeling workflow using GSD framework.

Responsibilities:
- Initialize Memory system (.planning/memory/ directory)
- Execute phases sequentially with context isolation
- Manage DAG-based task dependencies
- Track progress and report status
- Handle errors and recovery

This skill is invoked by the main mm-agent SKILL.md after parameter parsing.
</objective>

<execution_context>
@.planning/ROADMAP.md
@IDEA.md
@.claude/skills/mm-agent/SKILL.md
</execution_context>

<process>
## Step 1: Initialize Memory system
Use Bash tool to create .planning/memory/ directory if not exists.
This directory stores:
- dag.json - Task dependency graph
- execution-order.txt - Topological sort result
- task-*.json - Individual task memories
- retrieved-methods.json - HMML search results

Create directory structure:
```bash
mkdir -p .planning/memory
mkdir -p .planning/code
mkdir -p .planning/output
mkdir -p tests/fixtures
```

## Step 2: Report workflow start
Display progress banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 MM-Agent ► Mathematical Modeling Workflow
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Problem file: {parsed_problem_path}
Mode: {interactive/auto}
Phases: 7 total
```

## Step 3: Invoke GSD phases (Phase 1: Foundation)
For Phase 1 (Claude Code Integration), this is the setup phase.

For future phases (2-7), use GSD workflow:
```bash
/gsd:execute-phase 02-problem-analysis
/gsd:execute-phase 03-task-decomposition
/gsd:execute-phase 04-hmml-retrieval
/gsd:execute-phase 05-mathematical-modeling
/gsd:execute-phase 06-code-execution
/gsd:execute-phase 07-report-generation
```

Each phase produces artifacts in .planning/memory/ and passes context to next phase.

## Step 4: Report workflow completion
After all phases complete:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Workflow Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Output: .planning/output/report.pdf
Memory: .planning/memory/task-*.json
```

Note: Phase 1 is the foundation phase. Actual workflow execution happens in Phase 2+.
</process>
