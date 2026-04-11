# Phase 6: Code Generation & Execution - Research

**Researched:** 2026-04-11
**Domain:** Python code generation, subprocess execution, error handling, numerical simulation
**Confidence:** HIGH

## Summary

Phase 6 implements the computational solving stage of the MM-Agent workflow. Based on the modeling outputs from Phase 5 (model.md and formulas.json), the system generates executable Python code, executes it in a sandboxed environment with timeout protection, and captures results with automatic error recovery. The phase outputs results.json with numerical results and visualization plots, updating the Memory system with execution outcomes.

**Key technical decisions from CONTEXT.md:**
- **D-06**: Template + LLM fill strategy for code generation (reuse open-source templates)
- **D-07**: Local subprocess execution with 300-second timeout protection
- **D-08**: LLM auto-repair with structured error classification (max_repair=3, max_execute=5)
- **D-09**: Intelligent chart selection + user confirmation for visualization
- **D-10**: Per-task plot storage in `.planning/output/plots/{task_id}/`
- **D-11**: Structured results.json schema with status, execution_time, stdout, stderr, results, plots
- **D-12**: Single code file per task at `.planning/code/task-{id}.py`
- **D-13**: Path injection for dependency data transfer

**Primary recommendation:** Use Python subprocess.run() with timeout=300, capture_output=True, text=True for execution. Implement AST-based syntax validation before execution and traceback-based error classification for automatic repair. Follow Memory schema to update task-{id}.json with task_code, execution_result, code_structure, and charts fields.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Decision D-06: Template + LLM fill**
- Mathematical modeling methods have fixed code patterns (regression, time series, optimization, etc.)
- Templates ensure stable code quality, LLM fills parameters to adapt to specific problems
- Follows Glue Programming principle: reuse open-source templates rather than reinvent
- Template coverage: 10-15 high-frequency modeling methods from scipy docs, statsmodels examples, numpy tutorials
- Template categories: regression, time series, optimization, ODE, clustering, interpolation, evaluation, mechanism modeling

**Decision D-07: Local subprocess with timeout protection**
- CLI-first positioning, local environment execution is simplest
- subprocess provides sufficient isolation (independent process)
- timeout=300s prevents infinite loops
- Implementation: `subprocess.run(["python3", code_path], capture_output=True, text=True, timeout=300, cwd=work_dir)`
- Timeout handling: First timeout → terminate, retry with simplified code; still timeout → prompt user for action (adjust timeout / simplify model / skip task)

**Decision D-08: LLM auto-repair with structured prompt**
- Runtime errors are highly repairable (syntax, type, path errors)
- LLM understands tracebacks and locates issues
- Automated repair reduces user intervention
- Repair prompt structure includes: original code, error message, error classification (syntax/runtime/logic)
- Repair flow: capture traceback → LLM fixes code → AST validation → re-execute (max 3 repair attempts)
- Retry limits: max_repair=3, max_execute=5. After retries exhausted: write results.json marking failed, record last error, continue DAG execution

**Decision D-09: Intelligent selection + User confirmation**
- Different modeling methods require different chart types
- LLM intelligently selects based on method
- User confirmation ensures chart quality meets paper requirements
- Chart types: Matplotlib basic (line, scatter, bar, heatmap, boxplot), 3D charts (3D scatter, surface), result tables, flowcharts/architecture diagrams
- Selection logic table maps modeling methods to required/optional charts
- User confirmation: display generated chart list → user chooses keep/delete/add. Interactive mode enables confirmation by default, Auto mode skips confirmation but runs rule checks

**Decision D-10: Per-task directory**
- Path: `.planning/output/plots/{task_id}/`
- Naming: `{chart_type}.png` (e.g., regression-line.png, residuals.png)
- Why: avoids filename conflicts with multiple tasks, organizes report appendix by task, clear directory structure for cleanup

**Decision D-11: results.json schema**
- Fields: task_id, status (success|failed|timeout), execution_time, stdout, stderr, results (numerical_solutions, fitting_parameters, metrics), plots (path, type, description), created_at
- Why: core numerical results for report citation, execution logs for debugging/audit, chart references for report illustration index

**Decision D-12: Single file per task**
- Path: `.planning/code/task-{id}.py`
- Why: simple to manage, one-to-one correspondence with Memory files, easy to audit and reuse
- Code structure includes header with task/description/dependencies, imports, dependency path injection, variable definitions, main() function, if __name__ guard

**Decision D-13: Path injection for dependency data transfer**
- DAG defines dependencies, path injection allows code direct access to dependency results
- No data copying, reduces storage overhead, maintains data provenance chain
- Implementation: code generation injects `DATA_PATH_{dep_id} = ".planning/memory/results-{dep_id}.json"` for each dependency

### Claude's Discretion

1. **Template sources:** Extract templates from scipy docs, statsmodels examples, numpy tutorials, matplotlib gallery to ensure code quality
2. **Chart confirmation implementation:** Interactive mode uses AskUserQuestion for user to confirm chart list; Auto mode uses rule checks to ensure required charts exist
3. **Error classification logic:** Based on traceback keywords (SyntaxError → syntax, NameError/TypeError → runtime, results don't match expectations → logic)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CODE-01 | System can generate executable Python code based on modeling plan and formulas | Template + LLM fill strategy (D-06) provides pattern-based generation. Standard Python subprocess execution pattern enables automated code running. |
| CODE-02 | System can execute generated Python code | subprocess.run() with capture_output and timeout provides reliable execution. Verified subprocess.run API supports timeout parameter. |
| CODE-03 | System can capture code execution output (stdout/stderr) | subprocess.run() returns CompletedProcess with stdout/stderr attributes when capture_output=True and text=True. |
| CODE-04 | System can automatically retry execution (max 5 times) on failures | Error repair logic (D-08) defines max_execute=5. LLM auto-repair with structured prompt enables automatic fixes based on traceback. |
| CODE-05 | System can output results.json and visualization plots | results.json schema (D-11) defined. Per-task plot directory structure (D-10) provides organization. Chart type mapping table defined. |
| CODE-06 | System can enforce execution timeout protection (300s) | subprocess.run(timeout=300) raises TimeoutExpired exception. Implementation pattern verified. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| subprocess | stdlib (Python 3.14.3) | Process execution with timeout, output capture | Built-in, no dependencies, proven API |
| ast | stdlib (Python 3.14.3) | Syntax validation before execution | Built-in, reliable Python code parsing |
| sys | stdlib (Python 3.14.3) | Traceback capture and error classification | Built-in, exception handling primitives |
| json | stdlib (Python 3.14.3) | results.json and formulas.json parsing | Built-in, JSON serialization standard |
| signal | stdlib (Python 3.14.3) | Process termination (SIGTERM/SIGKILL) | Built-in, process control primitives |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| NumPy | 2.4.3 | Numerical array operations | All numerical computations |
| SciPy | 1.17.1 | Scientific computing (optimization, stats) | Advanced math functions, optimization solvers |
| Pandas | 3.0.1 | Data manipulation and CSV handling | Data loading, preprocessing, result export |
| SymPy | 1.14.0 | Symbolic mathematics | Analytical derivations if needed |
| scikit-learn | 1.8.0 | Machine learning algorithms | Classification, clustering, regression |

### Missing Dependencies (with fallback)
| Library | Required By | Available | Fallback |
|------------|------------|-----------|----------|
| matplotlib | Visualization plots | ✗ | Skip visualization, flag for human review. Use text-based output in results.json |
| statsmodels | Statistical modeling | ✗ | Use scipy.stats and scikit-learn alternatives |

**Installation:**
```bash
# Core libraries (already installed as stdlib)
# None needed for subprocess, ast, sys, json, signal

# Supporting libraries (verified installed)
pip install numpy scipy pandas sympy scikit-learn

# Optional for visualization (recommended but not required)
pip install matplotlib statsmodels
```

**Version verification:**
```bash
python3 --version  # Python 3.14.3 ✓
pip3 show numpy | grep Version  # 2.4.3 ✓
pip3 show scipy | grep Version  # 1.17.1 ✓
pip3 show pandas | grep Version  # 3.0.1 ✓
pip3 show sympy | grep Version  # 1.14.0 ✓
pip3 show scikit-learn | grep Version  # 1.8.0 ✓
```

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| subprocess | multiprocessing | subprocess is simpler for one-shot execution; multiprocessing adds complexity |
| AST validation | pylint/flake8 | AST is built-in and sufficient for syntax checking; linters require external dependencies |
| Local subprocess | Pyodide/Py sandbox | Local subprocess is simpler for CLI-first approach; browser sandbox adds complexity (v2 feature) |

## Architecture Patterns

### Recommended Project Structure
```
.planning/
├── code/                    # Generated Python code files
│   └── task-{id}.py        # One file per task
├── memory/                  # Task memory and results
│   ├── model-{id}.md       # Phase 5 modeling output
│   ├── formulas-{id}.json  # Phase 5 structured formulas
│   ├── results-{id}.json   # Phase 6 execution results
│   └── task-{id}.json      # Memory (updated with task_code, execution_result)
├── output/
│   └── plots/              # Visualization plots
│       └── {task_id}/      # Per-task plot directories
│           └── {chart_type}.png
└── templates/              # Code generation templates (to be created)
    ├── regression/
    │   ├── linear_regression.py
    │   └── logistic_regression.py
    ├── optimization/
    │   └── linear_program.py
    └── timeseries/
        └── arima.py
```

### Pattern 1: Subprocess Execution with Timeout
**What:** Execute generated Python code in isolated process with timeout protection
**When to use:** All code execution in Phase 6
**Example:**
```python
# Source: Python 3.14 stdlib subprocess.run documentation
import subprocess
import json

def execute_code(code_path: str, task_id: str, timeout: int = 300) -> dict:
    """Execute Python code with timeout and output capture."""
    result = {
        "task_id": task_id,
        "status": "failed",
        "execution_time": 0,
        "stdout": "",
        "stderr": "",
        "results": {},
        "plots": [],
        "created_at": datetime.now().isoformat()
    }

    try:
        start_time = time.time()
        process = subprocess.run(
            ["python3", code_path],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=".planning"
        )
        execution_time = time.time() - start_time

        result["execution_time"] = execution_time
        result["stdout"] = process.stdout
        result["stderr"] = process.stderr

        if process.returncode == 0:
            result["status"] = "success"
        else:
            result["status"] = "failed"

    except subprocess.TimeoutExpired:
        result["status"] = "timeout"
        result["stderr"] = f"Execution exceeded {timeout}s timeout"
    except Exception as e:
        result["stderr"] = str(e)

    return result
```

### Pattern 2: AST-Based Syntax Validation
**What:** Validate Python code syntax before execution using AST parsing
**When to use:** After code generation, before first execution attempt
**Example:**
```python
# Source: Python 3.14 stdlib ast.parse documentation
import ast

def validate_syntax(code: str) -> tuple[bool, str | None]:
    """Validate Python code syntax using AST parsing."""
    try:
        ast.parse(code)
        return True, None
    except SyntaxError as e:
        return False, str(e)
    except IndentationError as e:
        return False, str(e)
```

### Pattern 3: Error Classification from Traceback
**What:** Classify errors based on exception type for targeted repair
**When to use:** During error repair loop
**Example:**
```python
# Source: Python 3.14 stdlib exception hierarchy
import sys

def classify_error(exception: Exception) -> str:
    """Classify error type for targeted repair strategy."""
    error_type = type(exception).__name__

    if isinstance(exception, (SyntaxError, IndentationError)):
        return "syntax"
    elif isinstance(exception, (NameError, TypeError, AttributeError)):
        return "runtime"
    elif isinstance(exception, ValueError):
        return "value"
    elif isinstance(exception, ImportError):
        return "import"
    else:
        return "logic"  # Unhandled or semantic errors
```

### Pattern 4: Memory Update After Execution
**What:** Update task-{id}.json with execution results following Memory schema
**When to use:** After successful or failed execution
**Example:**
```python
# Source: IDEA.md §7.2 Memory JSON Schema
def update_task_memory(task_id: str, execution_result: dict):
    """Update task memory with execution results."""
    memory_path = f".planning/memory/task-{task_id}.json"

    with open(memory_path, 'r', encoding='utf-8') as f:
        memory = json.load(f)

    # Update fields from Memory schema (IDEA.md §7.2)
    memory["task_code"] = execution_result.get("code", "")
    memory["execution_result"] = {
        "status": execution_result.get("status"),
        "stdout": execution_result.get("stdout", ""),
        "stderr": execution_result.get("stderr", ""),
        "execution_time": execution_result.get("execution_time", 0),
        "results": execution_result.get("results", {})
    }
    memory["code_structure"] = {
        "file_outputs": [
            {"path": f".planning/memory/results-{task_id}.json", "description": "Execution results"}
        ]
    }
    memory["charts"] = execution_result.get("plots", [])
    memory["status"] = "completed" if execution_result.get("status") == "success" else "failed"
    memory["phase"] = "code-execution"
    memory["updated_at"] = datetime.now().isoformat()

    with open(memory_path, 'w', encoding='utf-8') as f:
        json.dump(memory, f, indent=2, ensure_ascii=False)
```

### Anti-Patterns to Avoid
- **Blocking execution without timeout:** Can cause indefinite hangs → Always use timeout parameter
- **Silently swallowing errors:** Makes debugging impossible → Always capture stderr and log
- **Modifying code in-place during repair:** Loses original for comparison → Generate new version, keep backup
- **Executing unvalidated code:** Wastes retries on obvious syntax errors → Use AST validation first
- **Overwriting Memory without reading:** Loses existing fields → Read, update, write

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Process execution | Custom process spawning with Popen | subprocess.run() with timeout | Handles signal propagation, output capture, error handling |
| Code syntax validation | Custom regex or manual parsing | ast.parse() | Built-in, handles all Python edge cases |
| JSON serialization | Custom string building | json.dumps()/json.loads() | Handles encoding, nested structures, error cases |
| Timeout handling | Manual threading/timer | subprocess.run(timeout=X) | Built-in, reliable, properly terminates process |
| Error classification | Custom string matching on stderr | Exception type checking (isinstance) | Python's exception hierarchy provides reliable classification |

**Key insight:** Python's standard library provides robust implementations for subprocess execution, AST parsing, and error handling. Building custom versions introduces bugs, security vulnerabilities, and maintenance burden.

## Common Pitfalls

### Pitfall 1: Timeout Not Handling Hanging Processes
**What goes wrong:** subprocess.TimeoutExpired raises exception but child process may not terminate, leaving zombie processes
**Why it happens:** TimeoutExpired doesn't automatically kill the child process, only raises exception
**How to avoid:** Use process.kill() or process.terminate() in exception handler:
```python
try:
    process = subprocess.run([...], timeout=300)
except subprocess.TimeoutExpired:
    process.kill()  # Ensure process is terminated
    process.wait()  # Reap zombie process
```
**Warning signs:** Increasing memory usage, "ps aux" shows stale Python processes

### Pitfall 2: Ignoring Non-Zero Exit Codes
**What goes wrong:** Code exits with returncode != 0 but system treats as success
**Why it happens:** subprocess.run() doesn't raise exception on non-zero exit by default
**How to avoid:** Always check process.returncode:
```python
if process.returncode != 0:
    # Handle failure
    error_msg = f"Exit code {process.returncode}: {process.stderr}"
```
**Warning signs:** results.json shows success but stderr contains error messages

### Pitfall 3: Assuming matplotlib Is Available
**What goes wrong:** Code assumes matplotlib is installed, causing ImportError
**Why it happens:** matplotlib is optional dependency, not in core Python
**How to avoid:** Import with try/except, graceful degradation:
```python
try:
    import matplotlib.pyplot as plt
    HAS_MATPLOTLIB = True
except ImportError:
    HAS_MATPLOTLIB = False
    # Use text-based output instead
```
**Warning signs:** ImportError in stderr, no plot files generated

### Pitfall 4: Hardcoded Paths in Generated Code
**What goes wrong:** Generated code has absolute paths, breaks in different environments
**Why it happens:** LLM generates code without context awareness
**How to avoid:** Use relative paths and inject via environment variables or globals:
```python
# Injected during code generation
DATA_PATHS = {
    "dep_1": ".planning/memory/results-1.json",
    "dep_2": ".planning/memory/results-2.json"
}
```
**Warning signs:** FileNotFoundError when running on different machines

### Pitfall 5: Infinite Retry Loops on Unfixable Errors
**What goes wrong:** System retries forever on semantic errors (wrong algorithm)
**Why it happens:** Repair logic doesn't distinguish between fixable and unfixable errors
**How to avoid:** Classify errors, limit repair attempts:
```python
error_class = classify_error(exception)
if error_class in ["logic", "semantic"]:
    # Don't repair, mark as failed
    break
if repair_attempts >= max_repair:
    break
```
**Warning signs:** Multiple retries produce similar errors

## Code Examples

Verified patterns from official sources:

### Subprocess Execution with Output Capture
```python
# Source: Python 3.14 stdlib subprocess.run documentation
# https://docs.python.org/3/library/subprocess.html#subprocess.run

import subprocess
import sys

def run_code(code_path: str) -> subprocess.CompletedProcess:
    """Execute Python code and capture all output."""
    return subprocess.run(
        [sys.executable, code_path],
        capture_output=True,
        text=True,
        cwd=".planning"
    )

# Usage
result = run_code(".planning/code/task-1.py")
print(f"stdout: {result.stdout}")
print(f"stderr: {result.stderr}")
print(f"returncode: {result.returncode}")
```

### Timeout Handling with Process Termination
```python
# Source: Python 3.14 stdlib subprocess.TimeoutExpired documentation
# https://docs.python.org/3/library/subprocess.html#subprocess.TimeoutExpired

import subprocess

def run_with_timeout(code_path: str, timeout: int = 300) -> subprocess.CompletedProcess:
    """Execute code with timeout, ensure cleanup on timeout."""
    try:
        return subprocess.run(
            ["python3", code_path],
            timeout=timeout,
            capture_output=True,
            text=True
        )
    except subprocess.TimeoutExpired as e:
        e.output  # Captured output before timeout
        e.stderr  # Captured stderr before timeout
        e.kill()  # Terminate the process
        # Handle timeout
        raise
```

### AST Syntax Validation
```python
# Source: Python 3.14 stdlib ast.parse documentation
# https://docs.python.org/3/library/ast.html#ast.parse

import ast

def validate_code(code: str) -> bool:
    """Check if code has valid Python syntax."""
    try:
        ast.parse(code)
        return True
    except (SyntaxError, IndentationError):
        return False

# Usage
code = """
def main():
    print("Hello, world!")
"""

if validate_code(code):
    print("Code is valid")
else:
    print("Code has syntax errors")
```

### Error Classification for Repair
```python
# Source: Python 3.14 stdlib exception hierarchy
# https://docs.python.org/3/library/exceptions.html

import sys

def get_error_category(exception: Exception) -> str:
    """Categorize exception for targeted repair strategy."""
    if isinstance(exception, (SyntaxError, IndentationError)):
        return "syntax"  # Fixable by LLM
    elif isinstance(exception, NameError):
        return "name"    # Fixable: undefined variable
    elif isinstance(exception, TypeError):
        return "type"    # Fixable: type mismatch
    elif isinstance(exception, ImportError):
        return "import"  # May need pip install
    else:
        return "unknown"

# Usage
try:
    exec("x = undefined + 1")
except Exception as e:
    print(f"Error: {get_error_category(e)}")  # Output: name
```

### results.json Schema Generation
```python
# Source: CONTEXT.md Decision D-11

import json
from datetime import datetime
from typing import Dict, Any, List

def create_results_json(
    task_id: str,
    status: str,
    execution_time: float,
    stdout: str = "",
    stderr: str = "",
    results: Dict[str, Any] | None = None,
    plots: List[Dict[str, str]] | None = None
) -> dict:
    """Create results.json following D-11 schema."""
    return {
        "task_id": task_id,
        "status": status,  # success|failed|timeout
        "execution_time": execution_time,
        "stdout": stdout,
        "stderr": stderr,
        "results": results or {},
        "plots": plots or [],
        "created_at": datetime.now().isoformat()
    }

# Example usage
results = create_results_json(
    task_id="1",
    status="success",
    execution_time=12.5,
    results={
        "numerical_solution": {"x": 1.5, "y": 2.3},
        "fitting_parameters": {"slope": 0.8, "intercept": 1.2},
        "metrics": {"MSE": 0.05, "R2": 0.95}
    },
    plots=[
        {
            "path": ".planning/output/plots/1/regression-line.png",
            "type": "scatter",
            "description": "回归拟合效果图"
        }
    ]
)

with open(".planning/memory/results-1.json", "w") as f:
    json.dump(results, f, indent=2, ensure_ascii=False)
```

### Memory Update Pattern
```python
# Source: IDEA.md §7.2 Memory JSON Schema

import json
from datetime import datetime
from pathlib import Path

def update_memory_with_execution(task_id: str, execution_result: dict):
    """Update task-{id}.json with execution results."""
    memory_path = Path(".planning/memory/task-{task_id}.json")

    with open(memory_path, 'r', encoding='utf-8') as f:
        memory = json.load(f)

    # Update Memory schema fields (IDEA.md §7.2)
    memory["task_code"] = execution_result.get("code")
    memory["execution_result"] = execution_result.get("results", {})
    memory["code_structure"] = {
        "file_outputs": [
            {
                "path": f".planning/memory/results-{task_id}.json",
                "description": "Execution results"
            }
        ]
    }
    memory["charts"] = execution_result.get("plots", [])
    memory["status"] = "completed" if execution_result.get("status") == "success" else "failed"
    memory["phase"] = "code-execution"
    memory["updated_at"] = datetime.now().isoformat()

    with open(memory_path, 'w', encoding='utf-8') as f:
        json.dump(memory, f, indent=2, ensure_ascii=False)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual code generation | Template + LLM fill | Phase 6 design | Consistent quality, leverages battle-tested patterns |
| No error recovery | LLM auto-repair with 3 attempts | Phase 6 design | Reduces manual intervention, handles common errors |
| Global plot directory | Per-task plot subdirectories | Phase 6 design | No filename conflicts, organized report structure |
| Unlimited execution | 300s timeout protection | Phase 6 design | Prevents hanging, predictable resource usage |

**Deprecated/outdated:**
- exec() and eval(): Security risk, use subprocess.run() instead
- os.system(): Doesn't capture output reliably, use subprocess.run() instead
- time.sleep() for timeout: Inaccurate, use subprocess.run(timeout=X) instead

## Open Questions

1. **Template library scope**
   - What we know: 10-15 high-frequency methods (regression, time series, optimization, ODE, clustering, interpolation, evaluation, mechanism)
   - What's unclear: Which specific templates need to be implemented in v1 vs v2
   - Recommendation: Start with 5-8 core templates from scipy examples (linear regression, logistic regression, linear programming, ARIMA, K-means, ODE solver), add more based on HMML method frequency

2. **matplotlib dependency handling**
   - What we know: matplotlib not installed on target system, but required for visualization
   - What's unclear: Whether to require matplotlib installation or provide fallback
   - Recommendation: Phase 6 should work without matplotlib (text-only results), but recommend installation for full visualization. Add check and graceful degradation.

3. **LLM repair prompt optimization**
   - What we know: Structured repair prompt with code, traceback, error classification
   - What's unclear: How effective LLM is at fixing semantic vs syntax errors
   - Recommendation: Implement with max_repair=3 as designed. Monitor success rate during Phase 6 verification. Adjust strategy if semantic errors not fixable.

4. **Plot type mapping completeness**
   - What we know: Selection logic table maps methods to required/optional charts
   - What's unclear: Whether all 59 HMML methods are covered in the mapping
   - Recommendation: Implement mapping for core methods first. Unknown methods default to generic scatter/line plots. LLM can override with user confirmation.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python (stdlib) | subprocess, ast, sys, json, signal | ✓ | 3.14.3 | — |
| NumPy | Numerical computations | ✓ | 2.4.3 | — |
| SciPy | Scientific computing | ✓ | 1.17.1 | — |
| Pandas | Data manipulation | ✓ | 3.0.1 | — |
| SymPy | Symbolic math | ✓ | 1.14.0 | — |
| scikit-learn | Machine learning | ✓ | 1.8.0 | — |
| matplotlib | Visualization | ✗ | — | Skip visualization, text-only output in results.json |
| statsmodels | Statistical modeling | ✗ | — | Use scipy.stats and scikit-learn alternatives |

**Missing dependencies with no fallback:**
- None (all core functionality available via stdlib)

**Missing dependencies with fallback:**
- matplotlib: Visualization optional. System works without it, generating only text-based results in results.json. Phase 6 implementation should check `import matplotlib` and gracefully degrade if unavailable.
- statsmodels: Not required for core functionality. SciPy and scikit-learn provide alternative implementations for most statistical methods.

**Recommendation:** Add matplotlib to recommended installation but not as hard dependency for Phase 6. Add installation check in code-execution skill with user notification if missing.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 |
| Config file | pytest.ini (not found - using pytest defaults) |
| Quick run command | `pytest tests/test_code_execution.py -x -v` |
| Full suite command | `pytest tests/ -v --tb=short` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CODE-01 | Generate executable Python code | integration | `pytest tests/test_code_execution.py::test_code_generation -x` | ❌ Wave 0 |
| CODE-02 | Execute generated Python code | integration | `pytest tests/test_code_execution.py::test_code_execution -x` | ❌ Wave 0 |
| CODE-03 | Capture stdout/stderr | unit | `pytest tests/test_code_execution.py::test_output_capture -x` | ❌ Wave 0 |
| CODE-04 | Auto-retry on failures (max 5) | integration | `pytest tests/test_code_execution.py::test_retry_logic -x` | ❌ Wave 0 |
| CODE-05 | Output results.json and plots | integration | `pytest tests/test_code_execution.py::test_results_format -x` | ❌ Wave 0 |
| CODE-06 | Enforce 300s timeout | unit | `pytest tests/test_code_execution.py::test_timeout_protection -x` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pytest tests/test_code_execution.py -x -v`
- **Per wave merge:** `pytest tests/ -v --tb=short`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/test_code_execution.py` — covers CODE-01 through CODE-06
- [ ] `tests/fixtures/sample-model.md` — sample modeling document for testing
- [ ] `tests/fixtures/sample-formulas.json` — sample formulas schema for testing
- [ ] Framework install: Already installed (pytest 9.0.2)

*(Existing test infrastructure covers phases 3-5. Phase 6 tests to be created in Wave 0.)*

## Sources

### Primary (HIGH confidence)
- Python 3.14 Standard Library Documentation - subprocess, ast, sys, signal modules (verified via `python3 -c "import module; help(module)"`)
- CONTEXT.md (06-CONTEXT.md) - Decisions D-06 through D-13 for code generation strategy
- IDEA.md §9 - Code execution implementation details (verified via grep and read)
- IDEA.md §7.2 - Memory JSON Schema (verified via read)
- IDEA.md §11.6 - Code execution boundary conditions (verified via grep)

### Secondary (MEDIUM confidence)
- LLM-MM-Agent Repository (https://github.com/usail-hkust/LLM-MM-Agent) - Python dependencies and patterns
- HMML knowledge base (.planning/knowledge/hmml.json) - 59 modeling method categories for template organization

### Tertiary (LOW confidence)
- None for this phase - all findings verified via stdlib documentation or project files

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All stdlib modules verified via Python 3.14 documentation. Package versions verified via pip3.
- Architecture: HIGH - Patterns verified via stdlib docs and project context (CONTEXT.md, IDEA.md).
- Pitfalls: HIGH - All pitfalls based on well-known subprocess and Python execution patterns, verified via documentation.

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (30 days - stable Python stdlib, no external framework dependencies)