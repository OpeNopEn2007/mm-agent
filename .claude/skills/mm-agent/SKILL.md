---
name: mm-agent
description: Mathematical modeling workflow - parse problems, build models, execute simulations, generate reports
---

<objective>
Execute end-to-end mathematical modeling workflow from problem input to paper report output.
Users invoke via /mm-agent --problem <file> to start the 7-phase pipeline.

Phases:
1. Problem Analysis - Parse and structure competition problems
2. Task Decomposition - Build DAG with dependencies
3. HMML Knowledge Retrieval - Find relevant modeling methods
4. Mathematical Modeling - Generate models via Actor-Critic iteration
5. Code Generation & Execution - Run Python numerical simulations
6. Report Generation - Produce LaTeX/PDF paper reports

The workflow inherits Claude Code's model configuration automatically.
</objective>

<process>
## Step 1: Parse command arguments
Use Bash tool to extract $ARGUMENTS and parse parameters:
- --problem <file> (required) - Path to problem file (PDF/MD/TXT)
- --interactive (optional) - Step-by-step confirmation mode
- --skip-verify (optional) - Disable verification gates
- --phase N (optional) - Resume from phase N

Store parsed values in variables for downstream use.

## Step 2: Validate problem file exists
Use Bash tool to check:
- File exists at specified path
- File extension is supported (.pdf, .md, .txt)
- File is readable

If validation fails, report error with supported format list and exit.

## Step 3: Invoke coordinator skill
Use Skill tool to load coordinator.md for workflow orchestration.
Pass parsed arguments as context.

Coordinator skill handles:
- GSD phase orchestration
- Memory system initialization
- Agent invocation per phase
- Progress tracking and reporting
</process>

<notes>
This skill is the primary entry point for the MM-Agent workflow.
All phase-specific logic is delegated to the coordinator skill and GSD framework.
</notes>
