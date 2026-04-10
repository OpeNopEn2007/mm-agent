---
name: mm-agent
description: Mathematical modeling workflow - parse problems, build models, execute simulations, generate reports
---

<objective>
Execute end-to-end mathematical modeling workflow from problem input to paper report output.

Users invoke via `/mm-agent --problem <file>` to start the 7-phase pipeline.
The skill parses arguments, validates the problem file, and delegates orchestration
to the coordinator skill which manages GSD phase execution.

The workflow inherits Claude Code's model configuration automatically - no separate
API keys or model configuration needed.

**Phase overview:**
1. **Problem Analysis** - Parse and structure competition problems from PDF/MD/TXT
2. **Task Decomposition** - Build DAG with dependencies and execution order
3. **HMML Knowledge Retrieval** - Find relevant modeling methods using embedding search
4. **Mathematical Modeling** - Generate models via Actor-Critic iteration (max 3 rounds)
5. **Code Generation & Execution** - Run Python numerical simulations with debugging
6. **Report Generation** - Produce LaTeX/PDF paper reports

**Core value (from PROJECT.md):**
输入非结构化赛题 → 自动化数学建模全流程 → 输出符合要求的论文报告
</objective>

<execution_context>
@.claude/skills/mm-agent/coordinator.md
@.planning/ROADMAP.md
@IDEA.md
</execution_context>

<context>
**Arguments passed via $ARGUMENTS:**

**Flags:**
- `--problem <file>` — Problem file path (PDF/MD/TXT, required)
- `--interactive` — Step-by-step confirmation mode
- `--skip-verify` — YOLO mode, skip verification gates
- `--phase N` — Resume from phase N (1-7)

**Mode routing:**
- No flags → Full auto workflow (YOLO mode)
- `--interactive` → Manual confirmation at each phase
- `--phase N` → Continue from specific phase (assumes prior work done)
</context>

<process>

## Step 1: Parse command arguments

Parse $ARGUMENTS to extract parameters:

```bash
# Extract problem file path
PROBLEM_FILE=$(echo "$ARGUMENTS" | grep -oE '\-\-problem [^ ]+' | sed 's/--problem //')

# Extract optional flags
INTERACTIVE=$(echo "$ARGUMENTS" | grep -q '\-\-interactive' && echo "true" || echo "false")
SKIP_VERIFY=$(echo "$ARGUMENTS" | grep -q '\-\-skip-verify' && echo "true" || echo "false")
START_PHASE=$(echo "$ARGUMENTS" | grep -oE '\-\-phase [0-9]+' | sed 's/--phase //' || echo "1")
```

## Step 2: Validate problem file

```bash
# Check file exists
if [ ! -f "$PROBLEM_FILE" ]; then
  echo "❌ Error: Problem file not found: $PROBLEM_FILE"
  echo "Supported formats: .pdf, .md, .txt"
  exit 1
fi

# Check file extension
EXT=$(echo "$PROBLEM_FILE" | grep -oE '\.[a-z]+$')
if [[ "$EXT" != ".pdf" && "$EXT" != ".md" && "$EXT" != ".txt" ]]; then
  echo "❌ Error: Unsupported file format: $EXT"
  echo "Supported formats: .pdf, .md, .txt"
  exit 1
fi

# Check file readable
if [ ! -r "$PROBLEM_FILE" ]; then
  echo "❌ Error: Cannot read file: $PROBLEM_FILE"
  exit 1
fi
```

## Step 3: Display workflow start banner

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 MM-Agent ► Mathematical Modeling Workflow
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Problem file: {PROBLEM_FILE}
Mode: {interactive/auto}
Start phase: {START_PHASE}
Phases: 7 total
```

## Step 4: Invoke coordinator skill

Use Skill tool to load coordinator for workflow orchestration:

The coordinator handles:
- Memory system initialization (.planning/memory/)
- GSD phase execution in sequence
- Agent invocation per phase (Modeler, Programmer, Reporter)
- Progress tracking and status updates
- Error handling and recovery

Pass context to coordinator:
- PROBLEM_FILE: validated path
- INTERACTIVE: mode flag
- SKIP_VERIFY: verification mode
- START_PHASE: resume point

## Step 5: Report workflow completion

After all phases complete (handled by coordinator):

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Workflow Complete ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Output: .planning/output/report.pdf
Memory: .planning/memory/task-*.json (N tasks)
Duration: {execution_time}
```

</process>

<notes>

**Skill auto-discovery:**
Claude Code automatically discovers this skill from `.claude/skills/mm-agent/SKILL.md`.
No manual registration needed.

**Model inheritance:**
This skill uses Claude Code's configured model. Users set model via:
- `/model` command in Claude Code
- Environment variables in settings.json
- No separate API key configuration

**Error handling:**
Each phase has its own error recovery. Coordinator aggregates all failures
for final report.

</notes>