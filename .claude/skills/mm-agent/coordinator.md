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

  ### Step 4.5.4: HMML Knowledge Retrieval
  # Retrieve relevant modeling methods from HMML knowledge base
  echo "  Retrieving HMML methods..."

  # Write task description to query file
  echo "$TASK_DESC" > .planning/memory/query-task-$TASK_ID.txt

  # Run HMML retrieval
  python3 .claude/scripts/hmml_retrieval.py \
      --query-file .planning/memory/query-task-$TASK_ID.txt \
      --output .planning/memory/retrieved-methods-$TASK_ID.json \
      --top-k 6 \
      --knowledge-dir .planning/knowledge > /dev/null 2>&1

  # Check retrieval succeeded
  if [ $? -ne 0 ]; then
    echo "  ⚠ Warning: HMML retrieval failed for task $TASK_ID"
    echo "  Continuing without retrieved methods..."
  else
    METHOD_COUNT=$(python3 -c "import json; print(len(json.load(open('.planning/memory/retrieved-methods-$TASK_ID.json'))['methods']))")
    echo "  ✓ Retrieved $METHOD_COUNT methods"

    # Display top methods
    python3 -c "
import json
data = json.load(open('.planning/memory/retrieved-methods-$TASK_ID.json'))
for i, m in enumerate(data['methods'][:3], 1):
    print(f'     {i}. {m[\"method\"]} ({m[\"domain\"]}/{m[\"subdomain\"]}) - score: {m[\"score\"]:.3f}')
if len(data['methods']) > 3:
    print(f'     ... and {len(data[\"methods\"]) - 3} more')
"
  fi

  ### Step 4.5.5: Mathematical Modeling with Actor-Critic
  # Generate mathematical modeling solution using Actor-Critic iteration
  echo "  Generating mathematical model..."

  # Invoke modeling skill
  # The skill will:
  # - Load task description and retrieved methods
  # - Perform Actor-Critic iteration (max_rounds=3, satisfaction_threshold=8)
  # - Output model.md and formulas.json
  MODELING=$(Skill modeling --task-id $TASK_ID || echo "FAILED")

  # Check modeling succeeded
  if [ "$MODELING" = "FAILED" ]; then
    echo "  ⚠ Warning: Mathematical modeling failed for task $TASK_ID"
    echo "  Continuing with basic solution..."
    # Create placeholder files for Phase 6
    echo "Modeling failed - basic placeholder" > .planning/memory/model-$TASK_ID.md
    echo '{"task_id":"'"$TASK_ID"'","equations":[],"variables":[],"assumptions":[]}' > .planning/memory/formulas-$TASK_ID.json
  else
    echo "  ✓ Mathematical modeling complete"

    # Verify model.md was created
    if [ -f ".planning/memory/model-$TASK_ID.md" ]; then
      MODEL_METHOD=$(grep "^# Modeling Method" .planning/memory/model-$TASK_ID.md -A 5 | tail -4 | head -1 | sed 's/^[[:space:]]*//')
      echo "     Method: ${MODEL_METHOD:0:60}..."
    else
      echo "  ⚠ Warning: model-$TASK_ID.md not created"
    fi

    # Verify formulas.json was created
    if [ -f ".planning/memory/formulas-$TASK_ID.json" ]; then
      FORMULA_COUNT=$(python3 -c "import json; print(len(json.load(open('.planning/memory/formulas-$TASK_ID.json'))['equations']))" 2>/dev/null || echo "0")
      echo "     Formulas: $FORMULA_COUNT equations"
    else
      echo "  ⚠ Warning: formulas-$TASK_ID.json not created"
    fi

    # Display iteration info (from frontmatter if available)
    FINAL_SCORE=$(python3 -c "
import yaml, sys
try:
    with open('.planning/memory/model-$TASK_ID.md') as f:
        # Parse frontmatter (between --- markers)
        lines = f.readlines()
        if lines[0].strip() == '---':
            i = 1
            fm_lines = []
            while i < len(lines) and lines[i].strip() != '---':
                fm_lines.append(lines[i])
                i += 1
            fm = yaml.safe_load(''.join(fm_lines))
            print(fm.get('final_score', 'N/A'))
            print(fm.get('iteration_rounds', 'N/A'))
except:
    print('N/A')
    print('N/A')
" 2>/dev/null || echo "N/A")
    echo "     Score: $(echo "$FINAL_SCORE" | head -1)"
    echo "     Rounds: $(echo "$FINAL_SCORE" | tail -1)"
  fi

  # Update task memory with modeling results
  python3 << EOF
import json
import sys
from datetime import datetime

task_id = sys.argv[1]
memory_path = f".planning/memory/task-{task_id}.json"

try:
    with open(memory_path) as f:
        memory = json.load(f)

    # Update status and phase
    memory['status'] = 'completed'
    memory['phase'] = 'mathematical-modeling'
    memory['updated_at'] = datetime.now().isoformat()

    # Read model.md if exists
    try:
        with open(f".planning/memory/model-{task_id}.md", 'r', encoding='utf-8') as f:
            model_content = f.read()
            # Extract just the content (skip frontmatter)
            lines = model_content.split('\n')
            if lines[0].strip() == '---':
                idx = lines.index('---', 1) + 1
                memory['mathematical_modeling_process'] = '\n'.join(lines[idx:])
            else:
                memory['mathematical_modeling_process'] = model_content
    except FileNotFoundError:
        memory['mathematical_modeling_process'] = "Modeling failed"

    # Read formulas.json if exists
    try:
        with open(f".planning/memory/formulas-{task_id}.json", 'r', encoding='utf-8') as f:
            memory['preliminary_formulas'] = json.load(f)
    except FileNotFoundError:
        memory['preliminary_formulas'] = {"equations": [], "variables": [], "assumptions": []}

    with open(memory_path, 'w', encoding='utf-8') as f:
        json.dump(memory, f, indent=2, ensure_ascii=False)

    print(f"Updated task-{task_id}.json with modeling results")
except Exception as e:
    print(f"Error updating memory: {e}")
EOF
    "$TASK_ID"

  ### Step 4.5.6: Code Generation & Execution
  # Generate and execute Python code for numerical simulation
  echo "  Generating and executing code..."

  # Invoke code-execution skill
  # The skill will:
  # - Generate Python code based on model.md and formulas.json
  # - Execute code with timeout=300s
  # - Capture output (stdout/stderr)
  # - Handle errors with auto-retry (max_repair=3, max_execute=5)
  # - Output results.json and plots
  CODE_EXECUTION=$(Skill code-execution --task-id $TASK_ID || echo "FAILED")

  # Check code execution succeeded
  if [ "$CODE_EXECUTION" = "FAILED" ]; then
    echo "  ⚠ Warning: Code generation/execution failed for task $TASK_ID"
    echo "  Continuing DAG execution (Phase 6 is non-blocking)..."
  else
    echo "  ✓ Code execution complete"

    # Verify results.json was created
    if [ -f ".planning/memory/results-$TASK_ID.json" ]; then
      STATUS=$(python3 -c "import json; print(json.load(open('.planning/memory/results-$TASK_ID.json'))['status'])" 2>/dev/null || echo "unknown")
      EXEC_TIME=$(python3 -c "import json; print(json.load(open('.planning/memory/results-$TASK_ID.json')).get('execution_time', 0))" 2>/dev/null || echo "0")
      echo "     Status: $STATUS (${EXEC_TIME}s)"

      # Check for plots
      if [ -d ".planning/output/plots/$TASK_ID" ]; then
        PLOT_COUNT=$(ls .planning/output/plots/$TASK_ID/*.{png,pdf} 2>/dev/null | wc -l)
        echo "     Plots: $PLOT_COUNT generated"
      fi
    else
      echo "  ⚠ Warning: results-$TASK_ID.json not created"
    fi
  fi

  # Update task memory with execution results
  python3 << EOF
import json
import sys
from datetime import datetime

task_id = sys.argv[1]
memory_path = f".planning/memory/task-{task_id}.json"

try:
    with open(memory_path) as f:
        memory = json.load(f)

    # Update status and phase
    memory['status'] = 'completed' if memory.get('status') != 'failed' else 'failed'
    memory['phase'] = 'code-execution'
    memory['updated_at'] = datetime.now().isoformat()

    # Read results.json if exists
    try:
        with open(f".planning/memory/results-{task_id}.json", 'r', encoding='utf-8') as f:
            execution_result = json.load(f)
            memory['execution_result'] = {
                'status': execution_result.get('status'),
                'stdout': execution_result.get('stdout', ''),
                'stderr': execution_result.get('stderr', ''),
                'execution_time': execution_result.get('execution_time', 0),
                'results': execution_result.get('results', {})
            }
            memory['code_structure'] = {
                'file_outputs': [
                    {'path': f".planning/memory/results-{task_id}.json", 'description': 'Execution results'}
                ]
            }
            memory['charts'] = execution_result.get('plots', [])
    except FileNotFoundError:
        # No results.json (execution failed)
        memory['execution_result'] = {'status': 'failed', 'error': 'No results file created'}
        memory['code_structure'] = {}
        memory['charts'] = []

    # Read generated code if exists
    try:
        with open(f".planning/code/task-{task_id}.py", 'r', encoding='utf-8') as f:
            memory['task_code'] = f.read()
    except FileNotFoundError:
        memory['task_code'] = ""

    with open(memory_path, 'w', encoding='utf-8') as f:
        json.dump(memory, f, indent=2, ensure_ascii=False)

    print(f"Updated task-{task_id}.json with code execution results")
except Exception as e:
    print(f"Error updating memory: {e}")
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

## Step 4.5.7: Verify Phase 6 Completion

After all tasks complete, verify Phase 6 artifacts were created successfully:

```bash
echo ""
echo "━━━ Verifying Phase 6 Completion ━━━"

# Check results.json for each task
for TASK_ID in $(cat .planning/memory/execution-order.txt); do
    if [ -f ".planning/memory/results-$TASK_ID.json" ]; then
        STATUS=$(python3 -c "import json; print(json.load(open('.planning/memory/results-$TASK_ID.json'))['status'])")
        echo "✓ Task $TASK_ID: $STATUS"
    else
        echo "⚠ Task $TASK_ID: No results file"
    fi
done

# Check plots directory
if [ -d ".planning/output/plots" ]; then
    TOTAL_PLOTS=$(find .planning/output/plots -name "*.png" -o -name "*.pdf" 2>/dev/null | wc -l)
    echo "✓ Total plots generated: $TOTAL_PLOTS"
else
    echo "⚠ No plots directory found"
fi

# Verify task memory updated
for TASK_ID in $(cat .planning/memory/execution-order.txt); do
    MEMORY_FILE=".planning/memory/task-$TASK_ID.json"
    if [ -f "$MEMORY_FILE" ]; then
        # Check for execution_result field
        HAS_EXEC=$(python3 -c "import json; print('yes' if 'execution_result' in json.load(open('$MEMORY_FILE')) else 'no')" 2>/dev/null || echo "no")
        if [ "$HAS_EXEC" = "yes" ]; then
            echo "✓ Task $TASK_ID: memory updated with execution results"
        else
            echo "⚠ Task $TASK_ID: memory missing execution_result field"
        fi
    fi
done

echo "━━━ Phase 6 Verification Complete ━━━"
```

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

## Step 4.7: Execute Phase 4-7 (mm-agent internal mechanism)
Execute subsequent phases using mm-agent internal phase sub-skills:

```bash
# Phase 4: HMML Knowledge Retrieval
# Uses hmml-retrieval.md sub-skill (already integrated in Step 4.5.4)
python3 .claude/scripts/hmml_retrieval.py \
  --query-file .planning/memory/task-desc-{task_id}.txt \
  --output .planning/memory/retrieved-methods-{task_id}.json \
  --top-k 6

# Phase 5: Mathematical Modeling
# Uses modeling.md skill (integrated in Step 4.5.5)
# Input: task-desc, retrieved-methods.json
# Output: model.md, formulas.json

# Phase 6: Code Generation & Execution
# Uses code-execution.md agent
# Input: model.md, formulas.json
# Output: results.json, plots/

# Phase 7: Report Generation
# Uses report-generation.md agent
# Input: all memory artifacts
# Output: report.pdf (LaTeX compiled)
```

Each phase produces artifacts in `.planning/memory/` and passes context to next phase.

**Phase sub-skills location:**
- `.claude/skills/mm-agent/parse-problem.md` — Phase 2 problem parsing
- `.claude/skills/mm-agent/task-decomposition.md` — Phase 3 task decomposition
- `.claude/skills/mm-agent/modeling.md` — Phase 5 Actor-Critic modeling
- `.claude/skills/mm-agent/code-execution.md` — Phase 6 code generation
- `.claude/skills/mm-agent/report-generation.md` — Phase 7 report compilation

**Runtime independence:** mm-agent workflow executes phases internally via skill invocations and script calls, not via `/gsd:*` commands. GSD framework is used for development workflow (planning, verification), not runtime execution.

Note: Phase 1 (Foundation) establishes the skills and agents. Phase 2 (Problem Analysis) parses the input file. Phase 3 (Task Decomposition) sets up DAG and context. Phase 4 (HMML Retrieval) retrieves relevant methods. Phase 5 (Mathematical Modeling) generates modeling solutions. Phases 6-7 execute in sequence using internal mechanism.

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

**Phase 4 integration:**
- HMML retrieval (hmml_retrieval.py script)
- Method candidates for each task
- Top-K retrieval with cosine similarity
- retrieved-methods-{task_id}.json per task

**Phase 4 output:**
- .planning/memory/query-task-{id}.txt - Query text per task
- .planning/memory/retrieved-methods-{id}.json - Retrieval results per task

**Phase 5 integration:**
- Mathematical modeling (modeling.md skill)
- Actor-Critic iteration with max_rounds=3, satisfaction_threshold=8
- model.md (Modeling Method, Formulas, Variables, Assumptions)
- formulas.json (equations[], variables[], assumptions[])

**Phase 5 output:**
- .planning/memory/model-{id}.md - Modeling method document
- .planning/memory/formulas-{id}.json - Structured formula definitions

**Phase 6 integration:**
- Code generation and execution (code-execution.md skill)
- Invoked per-task in DAG execution loop (Step 4.5.6)
- Template + LLM fill strategy for code generation (Decision D-06)
- Subprocess execution with timeout=300s (Decision D-07)
- LLM auto-repair with max_repair=3, max_execute=5 (Decision D-08)
- Graceful error handling: failed tasks don't block DAG execution

**Phase 6 output:**
- .planning/code/task-{id}.py - Generated Python code
- .planning/memory/results-{id}.json - Execution results (status, stdout, stderr, execution_time, results, plots)
- .planning/output/plots/{id}/ - Visualization plots per task
- .planning/memory/task-{id}.json - Updated memory with task_code, execution_result, code_structure, charts fields

**Phase 6 parameters:**
- max_retries (max_execute): 5 total execution attempts
- max_repair: 3 repair attempts per execution
- timeout: 300s (5 minutes) per execution
</context>
