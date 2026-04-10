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

## Step 3: Execute Phase 2 - Problem Analysis

Invoke parse-problem skill to parse problem file and extract structured definition:

```bash
# Parse problem file and extract structured components
PROBLEM_PARSED=$(Skill parse-problem --problem-path="$PROBLEM_FILE" || echo "FAILED")

# Check parsing succeeded
if [ "$PROBLEM_PARSED" = "FAILED" ]; then
  echo "❌ Error: Problem parsing failed"
  exit 1
fi

# Verify problem.md was created
if [ ! -f ".planning/memory/problem.md" ]; then
  echo "❌ Error: problem.md not created"
  exit 1
fi

echo "✓ Problem analyzed successfully"
echo "  Problem: $(grep '^title:' .planning/memory/problem.md | sed 's/title: //')"
```

The parse-problem skill:
- Detects file format (PDF/MD/TXT)
- Extracts raw text using PyMuPDF (PDF) or file I/O (MD/TXT)
- Performs LLM-based structured extraction (7 fields)
- Writes problem.md to .planning/memory/

Output files from Phase 2:
- .planning/memory/problem.md - Structured problem definition
- .planning/memory/raw-problem-text.txt - Raw extracted text (debug)

## Step 4: Invoke GSD phases (Phase 3+)
For Phase 3 (Task Decomposition) and beyond, use GSD workflow:
```bash
/gsd:execute-phase 02-problem-analysis
/gsd:execute-phase 03-task-decomposition
/gsd:execute-phase 04-hmml-retrieval
/gsd:execute-phase 05-mathematical-modeling
/gsd:execute-phase 06-code-execution
/gsd:execute-phase 07-report-generation
```

Each phase produces artifacts in .planning/memory/ and passes context to next phase.

Note: Phase 1 (Foundation) establishes the skills and agents. Phase 2 (Problem Analysis) parses the input file. Phases 3-7 are executed via GSD workflow.

## Step 5: Report workflow completion
After all phases complete:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Workflow Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Output: .planning/output/report.pdf
Memory: .planning/memory/task-*.json
```
</process>

<context>
**PROBLEM_FILE variable:**
Passed from SKILL.md after initial validation. Contains path to problem file (PDF/MD/TXT).

**Phase 2 output:**
.planning/memory/problem.md is the canonical output used by Phase 3 (Task Decomposition).

**parse-problem skill:**
Located at .claude/skills/mm-agent/parse-problem.md. Handles all file format detection and text extraction.
</context>
