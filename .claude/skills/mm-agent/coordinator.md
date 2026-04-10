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

## Step 4.5: Execute Phase 3 - Task Decomposition with DAG

### Step 4.5.1: Task Decomposition

Invoke task-decomposition skill to identify subproblems and assign task IDs:

```bash
# Invoke task-decomposition skill
DECOMPOSITION=$(Skill task-decomposition || echo "FAILED")

# Check decomposition succeeded
if [ "$DECOMPOSITION" = "FAILED" ]; then
  echo "❌ Error: Task decomposition failed"
  exit 1
fi

# Verify tasks.json was created
if [ ! -f ".planning/memory/tasks.json" ]; then
  echo "❌ Error: tasks.json not created"
  exit 1
fi

# Count tasks identified
TASK_COUNT=$(python3 -c "import json; print(len(json.load(open('.planning/memory/tasks.json'))['tasks']))")
echo "✓ Identified $TASK_COUNT tasks"
```

The task-decomposition skill:
- Reads problem.md (Phase 2 output)
- Extracts questions field
- Maps each question to a task with unique ID (1, 2, 3...)
- Outputs tasks.json with empty dependencies (filled in next step)

### Step 4.5.2: DAG Construction

Run dag_topological_sort.py to analyze dependencies and build DAG:

```bash
# Analyze dependencies and perform topological sort
python3 .claude/scripts/dag_topological_sort.py \
    --input .planning/memory/tasks.json \
    --output .planning/memory/dag.json

# Check for cycle detection errors
if [ $? -ne 0 ]; then
  echo "❌ Error: DAG construction failed (circular dependency detected)"
  echo "Review the error message above and fix task dependencies"
  exit 1
fi

# Verify dag.json and execution-order.txt were created
if [ ! -f ".planning/memory/dag.json" ]; then
  echo "❌ Error: dag.json not created"
  exit 1
fi

if [ ! -f ".planning/memory/execution-order.txt" ]; then
  echo "❌ Error: execution-order.txt not created"
  exit 1
fi

# Display execution order
echo "✓ DAG constructed with execution order:"
cat .planning/memory/execution-order.txt | nl -w2 -s'. '
```

The dag_topological_sort.py script:
- Reads tasks.json from task decomposition
- Analyzes task dependencies using LLM/heuristic
- Performs topological sort using graphlib.TopologicalSorter
- Detects circular dependencies (Decision D-02)
- Outputs dag.json with execution_order
- Outputs execution-order.txt for human readability

### Step 4.5.3: Context Loading and Task Execution

For each task in execution order, load dependency context and execute:

```bash
# Read execution order
EXECUTION_ORDER=$(cat .planning/memory/execution-order.txt)

# For each task in order
for TASK_ID in $EXECUTION_ORDER; do
  echo "━━━ Processing Task $TASK_ID ━━━"

  # Get task description
  TASK_DESC=$(python3 -c "import json; print(json.load(open('.planning/memory/dag.json'))['tasks']['$TASK_ID']['description'])")
  echo "  Task $TASK_ID: $TASK_DESC"

  # Get dependencies
  DEPS=$(python3 -c "import json; print(json.load(open('.planning/memory/dag.json'))['tasks']['$TASK_ID']['dependencies'])")
  echo "  Dependencies: $DEPS"

  # Load dependency context
  python3 .claude/scripts/load_dependency_memory.py \
      --mode load \
      --task-id $TASK_ID \
      --dag .planning/memory/dag.json \
      --memory-dir .planning/memory \
      --output .planning/memory/context-for-task-$TASK_ID.txt

  # Check context loading
  if [ -f ".planning/memory/context-for-task-$TASK_ID.txt" ]; then
    CONTEXT_SIZE=$(wc -l < .planning/memory/context-for-task-$TASK_ID.txt)
    echo "  Context loaded: $CONTEXT_SIZE lines"
  else
    echo "  ⚠ No dependencies (context file not created)"
  fi

  # Create initial Memory file
  python3 .claude/scripts/load_dependency_memory.py \
      --mode create \
      --task-id $TASK_ID \
      --description "$TASK_DESC" \
      --phase "task-decomposition" \
      --memory-dir .planning/memory > /dev/null

  # Read context if available
  if [ -f ".planning/memory/context-for-task-$TASK_ID.txt" ]; then
    CONTEXT=$(cat .planning/memory/context-for-task-$TASK_ID.txt)
    echo "  Context preview:"
    echo "$CONTEXT" | head -n 10
  fi

  # Handle missing dependency context
  if [ "$DEPS" != "[]" ] && [ ! -f ".planning/memory/context-for-task-$TASK_ID.txt" ]; then
    echo "  ⚠ Warning: Task has dependencies but context file missing"
    echo "  This may indicate dependency tasks have not completed yet"
    echo "  Skipping task execution until dependencies are ready"
    continue
  fi

  # Task execution placeholder
  # Note: In Phase 3, we only set up infrastructure
  # Actual modeling happens in Phase 5 (Mathematical Modeling)
  # For now, we create a placeholder result
  echo "  ✓ Task $TASK_ID setup complete"

  # Update task status to pending (ready for next phase)
  python3 << 'EOF'
import json
import sys
from datetime import datetime

task_id = sys.argv[1]
memory_path = f".planning/memory/task-{task_id}.json"

with open(memory_path) as f:
    memory = json.load(f)

memory['status'] = 'pending'
memory['updated_at'] = datetime.now().isoformat()

with open(memory_path, 'w') as f:
    json.dump(memory, f, indent=2, ensure_ascii=False)

print(f"Updated task-{task_id}.json: status=pending")
EOF
    "$TASK_ID"

  echo ""
done

echo "✓ All tasks initialized with context"
```

The context loading process:
- Reads DAG to identify task dependencies
- Loads task-{dep_id}.json for each dependency
- Formats context following IDEA.md §7.3
- Writes context-for-task-{id}.txt for task execution
- Creates initial Memory file with status=in_progress

## Step 4.6: Verify Phase 3 Completion

Verify all Phase 3 artifacts were created successfully:

```bash
echo "━━━ Verifying Phase 3 Completion ━━━"

# Check required files
REQUIRED_FILES=(
  ".planning/memory/tasks.json"
  ".planning/memory/dag.json"
  ".planning/memory/execution-order.txt"
)

for file in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "❌ Error: Required file missing: $file"
    exit 1
  fi
  echo "✓ $file exists"
done

# Verify task count matches
TASK_COUNT=$(python3 -c "import json; print(len(json.load(open('.planning/memory/dag.json'))['tasks']))")
ORDER_COUNT=$(wc -l < .planning/memory/execution-order.txt)

if [ "$TASK_COUNT" -ne "$ORDER_COUNT" ]; then
  echo "❌ Error: Task count mismatch"
  echo "  DAG tasks: $TASK_COUNT"
  echo "  Execution order: $ORDER_COUNT"
  exit 1
fi

echo "✓ $TASK_COUNT tasks identified and ordered"

# Verify no circular dependencies
CYCLE_ERROR=$(python3 .claude/scripts/dag_topological_sort.py \
    --input .planning/memory/dag.json \
    --output /dev/null 2>&1)

if [ $? -ne 0 ]; then
  echo "❌ Error: Circular dependency detected"
  echo "$CYCLE_ERROR"
  exit 1
fi

echo "✓ No circular dependencies detected"

# Verify Memory files for each task
for i in $(seq 1 $TASK_COUNT); do
  TASK_ID=$(printf "%d" $i)  # Ensure no leading zero
  MEMORY_FILE=".planning/memory/task-$TASK_ID.json"

  if [ ! -f "$MEMORY_FILE" ]; then
    echo "❌ Error: Memory file missing: $MEMORY_FILE"
    exit 1
  fi

  # Validate required fields
  python3 << EOF
import json
import sys

with open('$MEMORY_FILE') as f:
    memory = json.load(f)

required = ['task_id', 'phase', 'status', 'task_description']
for field in required:
    if field not in memory:
        print(f"❌ Error: Memory file $MEMORY_FILE missing field: {field}")
        sys.exit(1)

print(f"✓ $MEMORY_FILE: all required fields present")
EOF
done

echo "━━━ Phase 3 Verification Complete ━━━"

# Display Phase 3 summary
echo ""
echo "━━━ Phase 3 Summary ━━━"
echo "Tasks identified: $TASK_COUNT"
echo "DAG constructed: .planning/memory/dag.json"
echo "Execution order: .planning/memory/execution-order.txt"
echo "Memory files: .planning/memory/task-{1..$TASK_COUNT}.json"
echo "Context files: .planning/memory/context-for-task-{1..$TASK_COUNT}.txt"
echo ""
```

## Step 4.7: Invoke GSD phases (Phase 4+)
For Phase 4 (HMML Retrieval) and beyond, use GSD workflow:
```bash
/gsd:execute-phase 04-hmml-retrieval
/gsd:execute-phase 05-mathematical-modeling
/gsd:execute-phase 06-code-execution
/gsd:execute-phase 07-report-generation
```

Each phase produces artifacts in .planning/memory/ and passes context to next phase.

Note: Phase 1 (Foundation) establishes the skills and agents. Phase 2 (Problem Analysis) parses the input file. Phase 3 (Task Decomposition) sets up DAG and context. Phases 4-7 are executed via GSD workflow.

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

**Phase 3 integration:**
- Task decomposition (task-decomposition.md skill)
- DAG construction (dag_topological_sort.py script)
- Context loading (load_dependency_memory.py script)
- Dependency resolution via topological sort
- Cycle detection with user-friendly error messages (Decision D-02)

**Memory system:**
- tasks.json: Task list with IDs and descriptions
- dag.json: DAG structure with dependencies and execution order
- execution-order.txt: Human-readable task order
- task-{id}.json: Individual task Memory files
- context-for-task-{id}.txt: Dependency context for task execution

**Phase 3 output:**
- .planning/memory/tasks.json - Task list from decomposition
- .planning/memory/dag.json - DAG with execution order
- .planning/memory/execution-order.txt - Task order
- .planning/memory/task-{id}.json - Task Memory files
- .planning/memory/context-for-task-{id}.txt - Context files
</context>
