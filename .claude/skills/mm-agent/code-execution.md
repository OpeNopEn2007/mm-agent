---
name: code-execution
description: Code generation and execution for numerical simulation
---

# Code Generation & Execution Sub-Skill

**Purpose:** Generate and execute Python code for numerical simulation.

**Parent:** mm-agent coordinator.md

---

## Parameters

```
max_retries: 5
timeout: 300s (5 minutes)
```

---

## Invocation

Called by coordinator.md as Phase 6 of mm-agent workflow.

## Input

- `task_id`: Task identifier (from coordinator)
- `model_path`: `.planning/memory/model-{task_id}.md` — Modeling plan
- `formulas_path`: `.planning/memory/formulas-{task_id}.json` — Structured formulas
- `dependencies`: List of dependency task IDs

## Output

- `.planning/code/task-{id}.py` — Generated Python code
- `.planning/memory/results-{task_id}.json` — Execution results
- `.planning/output/plots/{task_id}/` — Visualization plots

---

## Process

### Step 1: Load Phase 5 outputs

Read the modeling outputs from Phase 5:

```bash
TASK_ID=$1

# Read model.md
MODEL_PATH=".planning/memory/model-${TASK_ID}.md"
MODEL_CONTENT=$(cat "$MODEL_PATH" 2>/dev/null || echo "")

if [ -z "$MODEL_CONTENT" ]; then
  echo "Error: model-${TASK_ID}.md not found"
  exit 1
fi

# Read formulas.json
FORMULAS_PATH=".planning/memory/formulas-${TASK_ID}.json"
FORMULAS_CONTENT=$(cat "$FORMULAS_PATH" 2>/dev/null || echo "{}")

if [ ! -f "$FORMULAS_PATH" ]; then
  echo "Error: formulas-${TASK_ID}.json not found"
  exit 1
fi

echo "Task $TASK_ID: Model loaded"
```

### Step 2: Select template based on modeling method

Extract the modeling method from model.md and select appropriate template:

```
Template categories:
- Regression: linear_regression, polynomial_regression, logistic_regression
- Time series: arima, exponential_smoothing
- Optimization: linear_program, nonlinear_optimize, integer_program
- ODE: ode_solver
- Clustering: kmeans, hierarchical_clustering
- Interpolation: polynomial_spline, cubic_spline
- Evaluation: ahp, topsis
- Mechanism: physics_simulation, system_dynamics
```

The LLM will identify the modeling method from the model.md content and generate code accordingly.

### Step 3: Generate code using Template + LLM fill

Generate Python code with this prompt structure:

```
You are a Python numerical computing expert. Generate executable Python code for this mathematical model.

Modeling Method: Extracted from model-{task_id}.md

Formulas:
{formulas_from_json}

Variables:
{variables_table}

Assumptions:
{assumptions_list}

Dependency Data Paths:
{dependency_paths_injected}

Generate Python code that:
1. Uses standard libraries (numpy, scipy, pandas if available)
2. Implements the mathematical formulas
3. Reads from dependency result files if specified
4. Outputs numerical results to stdout as JSON
5. Generates visualization plots (save to .planning/output/plots/{task_id}/)
6. Gracefully handles missing matplotlib (check before importing)
```

### Step 4: Inject dependency paths (Decision D-13)

For each dependency task, inject data paths at the top of generated code:

```python
# === Dependency data paths ===
DATA_PATH_1 = ".planning/memory/results-1.json"  # Injected if needed
DATA_PATH_2 = ".planning/memory/results-2.json"  # Injected if needed
```

### Step 5: Validate generated code (AST parsing)

Use AST parsing to validate syntax before execution:

```python
import ast

def validate_syntax(code: str) -> tuple[bool, str | None]:
    """Validate Python code syntax using AST parsing."""
    try:
        ast.parse(code)
        return True, None
    except SyntaxError as e:
        return False, str(e)
```

If invalid, prompt LLM to fix (repair loop).

### Step 6: Write generated code file

Output: `.planning/code/task-{id}.py`

Code structure template:

```python
# Task: {task_id} - {description}
# Generated: {timestamp}
# Dependencies: {dep_ids}

import numpy as np
import pandas as pd
import json
from scipy import stats

# === Dependency data paths ===
# DATA_PATH_1 = ".planning/memory/results-1.json"  # Injected if needed

# === Visualization check ===
try:
    import matplotlib.pyplot as plt
    HAS_MATPLOTLIB = True
except ImportError:
    HAS_MATPLOTLIB = False
    print("Warning: matplotlib not available, skipping plots")

def main():
    # Load data from dependencies or create sample data
    # ...

    # Implement mathematical model
    # ...

    # Output numerical results as JSON
    results = {
        "numerical_solution": {...},
        "fitting_parameters": {...},
        "metrics": {"MSE": ..., "R2": ...}
    }
    print(json.dumps(results, indent=2))

    # Generate plots if matplotlib available
    if HAS_MATPLOTLIB:
        import os
        os.makedirs(".planning/output/plots/{task_id}", exist_ok=True)
        # ... plot generation code
        # plt.savefig(".planning/output/plots/{task_id}/regression-line.png")

if __name__ == "__main__":
    main()
```

### Step 7: Return success/failure

- **Success**: Code file created and validated
- **Failure**: Error logged, continue DAG execution

---

## Step 8: Execute Code with Subprocess (Decision D-07)

After code generation, execute the Python code with timeout protection and output capture.

### Execution Function

```python
import subprocess
import ast
import json
import os
import time
from datetime import datetime
from typing import Dict, Any, List, Tuple, Optional

def execute_code_with_retry(
    code_path: str,
    task_id: str,
    max_execute: int = 5,
    max_repair: int = 3,
    timeout: int = 300
) -> dict:
    """
    Execute generated Python code with timeout and error repair.

    Per Decision D-07: Local subprocess with timeout protection (300s).
    Per Decision D-08: LLM auto-repair with max_repair=3, max_execute=5.

    Args:
        code_path: Path to generated Python code file
        task_id: Task identifier for results tracking
        max_execute: Maximum total execution attempts (default: 5)
        max_repair: Maximum repair attempts before giving up (default: 3)
        timeout: Execution timeout in seconds (default: 300)

    Returns:
        dict: Execution results following D-11 schema
    """
    result = {
        "task_id": task_id,
        "status": "failed",
        "execution_time": 0.0,
        "stdout": "",
        "stderr": "",
        "results": {},
        "plots": [],
        "created_at": datetime.now().isoformat()
    }

    execute_attempts = 0
    repair_attempts = 0

    while execute_attempts < max_execute:
        execute_attempts += 1

        try:
            start_time = time.time()

            # Execute code with timeout (Decision D-07)
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
                # Parse stdout for results JSON
                result["results"] = _parse_results_from_stdout(process.stdout)

                # Check for generated plots (Decision D-10)
                result["plots"] = _discover_plots(task_id)

                return result  # Success - exit retry loop
            else:
                # Non-zero exit code - error occurred
                error_msg = process.stderr or f"Exit code {process.returncode}"
                raise RuntimeError(error_msg)

        except subprocess.TimeoutExpired as e:
            # Timeout handling (Decision D-07)
            e.kill()  # Terminate process
            e.wait()  # Reap zombie process
            result["status"] = "timeout"
            result["stderr"] = f"Execution exceeded {timeout}s timeout"

            # First timeout: try simplifying code
            if execute_attempts == 1:
                # LLM repair for timeout: simplify computation
                with open(code_path, 'r') as f:
                    original_code = f.read()

                repair_code = llm_repair_timeout(original_code, timeout)
                if repair_code:
                    # Validate repaired code with AST
                    try:
                        ast.parse(repair_code)
                        with open(code_path, 'w') as f:
                            f.write(repair_code)
                        repair_attempts += 1
                        continue  # Retry with simplified code
                    except SyntaxError:
                        pass  # Repair failed validation, return timeout result

            return result  # Timeout after failed repair or on retry

        except Exception as e:
            # Other errors - LLM repair (Decision D-08)
            result["stderr"] = str(e)
            error_class = classify_error(str(e))

            # Only attempt repair for fixable error types
            if repair_attempts < max_repair and error_class in ["syntax", "runtime", "import", "value"]:
                # Read current code
                with open(code_path, 'r') as f:
                    original_code = f.read()

                # Attempt LLM repair
                repaired_code = llm_repair_code(
                    original_code=original_code,
                    traceback=str(e),
                    error_class=error_class
                )

                if repaired_code:
                    # Validate repaired code with AST
                    try:
                        ast.parse(repaired_code)
                        with open(code_path, 'w') as f:
                            f.write(repaired_code)
                        repair_attempts += 1
                        continue  # Retry with repaired code
                    except SyntaxError:
                        pass  # Repair failed validation

            # Max retries exhausted or unfixable error - return failure
            return result

    # All execution attempts exhausted
    result["status"] = "failed"
    result["stderr"] = f"Max execution attempts ({max_execute}) exhausted"
    return result


def classify_error(error_message: str) -> str:
    """
    Classify error type for targeted repair (Decision D-08).

    Based on traceback keywords to determine error category.
    """
    error_lower = error_message.lower()

    if "syntaxerror" in error_lower or "indentationerror" in error_lower:
        return "syntax"
    elif "nameerror" in error_lower or "name '" in error_lower:
        return "name"
    elif "typeerror" in error_lower or "type '" in error_lower:
        return "type"
    elif "attributeerror" in error_lower:
        return "attribute"
    elif "valueerror" in error_lower or "value '" in error_lower:
        return "value"
    elif "importerror" in error_lower or "modulenotfound" in error_lower or "no module named" in error_lower:
        return "import"
    elif "filenotfound" in error_lower or "file not found" in error_lower:
        return "file"
    else:
        return "logic"  # Unhandled or semantic errors


def _parse_results_from_stdout(stdout: str) -> dict:
    """
    Parse numerical results from stdout JSON output.

    Looks for JSON in stdout lines and extracts results.
    """
    if not stdout:
        return {}

    stdout_lines = stdout.strip().split('\n')
    for line in stdout_lines:
        line = line.strip()
        if not line:
            continue
        try:
            parsed = json.loads(line)
            # Check if this looks like results JSON
            if isinstance(parsed, dict) and any(
                key in parsed for key in ["numerical_solution", "fitting_parameters",
                                         "metrics", "results", "status"]
            ):
                return parsed
        except json.JSONDecodeError:
            continue

    # No structured JSON found - return empty with raw output
    return {"raw_output": stdout[:1000]}  # Truncate long output


def _discover_plots(task_id: str) -> List[Dict[str, str]]:
    """
    Discover generated plots in task output directory (Decision D-10).

    Per-task directory: .planning/output/plots/{task_id}/
    """
    plots = []
    plot_dir = f".planning/output/plots/{task_id}"

    if not os.path.exists(plot_dir):
        return plots

    for plot_file in os.listdir(plot_dir):
        if plot_file.endswith('.png') or plot_file.endswith('.pdf'):
            plot_path = os.path.join(plot_dir, plot_file)
            plot_type = plot_file.split('.')[0]

            # Map file name to description
            description = _get_plot_description(plot_type, task_id)

            plots.append({
                "path": plot_path,
                "type": plot_type,
                "description": description
            })

    return plots


def _get_plot_description(plot_type: str, task_id: str) -> str:
    """
    Get human-readable description for plot type (Decision D-09).
    """
    descriptions = {
        "regression-line": "回归拟合效果图",
        "residuals": "残差分析图",
        "prediction": "预测结果图",
        "scatter": "散点图",
        "time-series": "时间序列图",
        "acf": "自相关函数图",
        "pacf": "偏自相关函数图",
        "convergence": "优化收敛图",
        "objective-surface": "目标函数曲面图",
        "cluster": "聚类结果图",
        "cluster-centers": "聚类中心热力图",
        "weights": "权重分布图",
        "ranking": "排名雷达图",
        "trajectory": "轨迹演化图",
        "heatmap": "热力图",
        "bar": "柱状图",
        "box": "箱线图",
    }

    return descriptions.get(plot_type, f"图表: {plot_type}")


def llm_repair_code(original_code: str, traceback: str, error_class: str) -> Optional[str]:
    """
    Use LLM to repair code based on error traceback (Decision D-08).

    Structured repair prompt with:
    - Original code
    - Error traceback
    - Error classification

    Returns repaired code string or None if repair failed.
    """
    # This function is called by the coordinator/agent that has LLM access
    # The actual implementation uses Claude API for code repair
    #
    # Repair prompt structure:
    # """
    # 代码执行失败，请修复：
    #
    # 原代码：
    # {original_code}
    #
    # 错误信息：
    # {traceback}
    #
    # 错误分类：{error_class}
    #
    # 请分析错误原因并输出修复后的完整代码。
    # """
    #
    # Returns: Repaired code or None if repair not possible
    pass  # Implementation via Claude API


def llm_repair_timeout(original_code: str, timeout: int) -> Optional[str]:
    """
    Use LLM to simplify code for timeout situations (Decision D-07).

    When code times out, attempt to simplify computation:
    - Reduce iteration count
    - Simplify algorithm
    - Use smaller sample size

    Returns simplified code or None if simplification not possible.
    """
    # This function is called by the coordinator/agent that has LLM access
    #
    # Simplified repair prompt:
    # """
    # 代码执行超时（{timeout}s），请简化计算步骤：
    #
    # 原代码：
    # {original_code}
    #
    # 请输出简化后的完整代码，确保结果正确性不受显著影响。
    # """
    #
    # Returns: Simplified code or None if simplification not possible
    pass  # Implementation via Claude API
```

---

## Step 9: Write Results.json (Decision D-11)

After execution completes (success or failure), write results to `.planning/memory/results-{task_id}.json`.

### Results Schema (D-11)

```json
{
  "task_id": "1",
  "status": "success|failed|timeout",
  "execution_time": 12.5,
  "stdout": "Complete output text",
  "stderr": "Error message (if any)",
  "results": {
    "numerical_solution": {...},
    "fitting_parameters": {...},
    "metrics": {"MSE": 0.05, "R2": 0.95}
  },
  "plots": [
    {
      "path": ".planning/output/plots/1/regression-line.png",
      "type": "scatter",
      "description": "回归拟合效果图"
    }
  ],
  "created_at": "2026-04-11T..."
}
```

### Writing Results

```python
def write_results(results: dict, task_id: str) -> str:
    """
    Write execution results to results-{task_id}.json.

    Args:
        results: Execution results dict from execute_code_with_retry
        task_id: Task identifier

    Returns:
        str: Path to written results file
    """
    results_path = f".planning/memory/results-{task_id}.json"

    # Ensure directory exists
    os.makedirs(os.path.dirname(results_path), exist_ok=True)

    with open(results_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    return results_path
```

---

## Step 10: Intelligent Chart Selection (Decision D-09)

After successful execution, handle visualization output with intelligent selection.

### Chart Type Mapping Table

| Modeling Method | Required Charts | Optional Charts |
|----------------|----------------|-----------------|
| Regression | Scatter + regression line | Residuals, prediction interval |
| Time series | Time series plot | ACF/PACF, forecast comparison |
| Optimization | Convergence plot | 3D objective function surface |
| Clustering | Scatter + cluster labels | Cluster center heatmap |
| Evaluation | Weight bar chart | TOPSIS ranking radar |
| ODE | Trajectory plot | Phase portrait |
| Interpolation | Curve fitting plot | Error distribution |

### Chart Selection Logic

```python
def select_charts_for_modeling_method(modeling_method: str) -> list:
    """
    Select required and optional charts based on modeling method (D-09).

    Args:
        modeling_method: String describing the modeling method

    Returns:
        list of tuples: [(chart_type, required_or_optional), ...]
    """
    method_lower = modeling_method.lower()

    if "regression" in method_lower or "linear" in method_lower:
        return [
            ("regression-line", "required"),
            ("residuals", "optional"),
            ("prediction", "optional")
        ]
    elif "time" in method_lower or "arima" in method_lower or "forecast" in method_lower:
        return [
            ("time-series", "required"),
            ("acf", "optional"),
            ("pacf", "optional")
        ]
    elif "optim" in method_lower or "linear program" in method_lower:
        return [
            ("convergence", "required"),
            ("objective-surface", "optional")
        ]
    elif "cluster" in method_lower or "kmeans" in method_lower:
        return [
            ("cluster", "required"),
            ("cluster-centers", "optional")
        ]
    elif "evaluation" in method_lower or "ahp" in method_lower or "topsis" in method_lower:
        return [
            ("weights", "required"),
            ("ranking", "optional")
        ]
    elif "ode" in method_lower or "differential" in method_lower:
        return [
            ("trajectory", "required"),
            ("phase", "optional")
        ]
    elif "interpol" in method_lower or "spline" in method_lower:
        return [
            ("curve-fitting", "required"),
            ("error-dist", "optional")
        ]
    else:
        # Default: scatter plot for unknown methods
        return [("scatter", "required")]
```

### User Confirmation (Interactive Mode)

```python
def confirm_chart_selection(plots: list, interactive: bool = True) -> list:
    """
    Confirm chart selection with user (Decision D-09).

    Interactive mode: Use AskUserQuestion to confirm chart list.
    Auto mode: Skip confirmation, use rule-based defaults.

    Args:
        plots: List of plot dicts from execution results
        interactive: Whether to prompt user for confirmation

    Returns:
        list: Confirmed list of plots to include in report
    """
    if not interactive:
        # Auto mode: return all plots
        return plots

    # Interactive mode: prompt user
    # Chart confirmation prompt:
    # """
    # 已生成以下图表：
    # {plot_list}
    #
    # 请选择要保留的图表（保留/删除/添加）：
    # """
    #
    # Returns: User-confirmed list of plots
    pass  # Implementation via user interaction
```

---

## Step 11: Update Task Memory (IDEA.md Section 7.2)

After execution completes, update task-{task_id}.json Memory file with execution results.

### Memory Update Schema (IDEA.md Section 7.2)

```python
def update_task_memory_with_execution(
    task_id: str,
    code_path: str,
    execution_result: dict
) -> None:
    """
    Update task-{task_id}.json with code execution results.

    Updates the following Memory schema fields (IDEA.md §7.2):
    - task_code: Generated code content
    - execution_result: Execution results dict
    - code_structure: File outputs array
    - charts: Plots array
    - status: "completed" or "failed"
    - phase: "code-execution"
    - updated_at: Current timestamp

    Args:
        task_id: Task identifier
        code_path: Path to generated code file
        execution_result: Results from execute_code_with_retry
    """
    memory_path = f".planning/memory/task-{task_id}.json"

    # Load existing memory
    if os.path.exists(memory_path):
        with open(memory_path, 'r', encoding='utf-8') as f:
            memory = json.load(f)
    else:
        # Create new memory if doesn't exist
        memory = {
            "task_id": task_id,
            "phase": "code-execution",
            "created_at": datetime.now().isoformat()
        }

    # Read generated code
    with open(code_path, 'r') as f:
        code_content = f.read()

    # Update Memory schema fields
    memory["task_code"] = code_content
    memory["execution_result"] = {
        "status": execution_result.get("status"),
        "stdout": execution_result.get("stdout", ""),
        "stderr": execution_result.get("stderr", ""),
        "execution_time": execution_result.get("execution_time", 0),
        "results": execution_result.get("results", {})
    }
    memory["code_structure"] = {
        "file_outputs": [
            {
                "path": f".planning/memory/results-{task_id}.json",
                "description": "Execution results",
                "type": "json"
            },
            {
                "path": code_path,
                "description": "Generated Python code",
                "type": "python"
            }
        ]
    }
    memory["charts"] = execution_result.get("plots", [])
    memory["status"] = "completed" if execution_result.get("status") == "success" else "failed"
    memory["phase"] = "code-execution"
    memory["updated_at"] = datetime.now().isoformat()

    # Write updated memory
    with open(memory_path, 'w', encoding='utf-8') as f:
        json.dump(memory, f, indent=2, ensure_ascii=False)
```

---

## Integration with Coordinator

### Execution Flow

```
Coordinator calls code-execution skill with task_id
    |
    v
Step 1-7: Generate code (from 06-02 plan)
    |
    v
Step 8: Execute code with retry
    |--> success --> Step 9: Write results.json
    |               Step 10: Chart selection
    |               Step 11: Update memory
    |                   |
    |                   v
    |               Return success to coordinator
    |
    +--> failure/timeout --> Step 9: Write results.json (failed status)
                             Step 11: Update memory (failed status)
                                 |
                                 v
                             Return failure to coordinator
                                 |
                                 v
                             Coordinator continues DAG execution
```

### Input Parameters

| Parameter | Source | Description |
|-----------|--------|-------------|
| task_id | coordinator | Task identifier |
| model_path | Phase 5 output | `.planning/memory/model-{task_id}.md` |
| formulas_path | Phase 5 output | `.planning/memory/formulas-{task_id}.json` |
| dependencies | DAG | List of dependency task IDs |

### Output Files

| File | Purpose | Consumer |
|------|---------|----------|
| `.planning/code/task-{id}.py` | Generated Python code | Execution |
| `.planning/memory/results-{id}.json` | Execution results | Phase 7 (Report) |
| `.planning/output/plots/{id}/` | Visualization plots | Phase 7 (Report) |
| `.planning/memory/task-{id}.json` | Updated memory | Coordinator, Phase 7 |

### Graceful Failure

- Failed tasks do NOT block DAG execution
- Results marked with status: "failed" or "timeout"
- Error information preserved in results.json
- Coordinator continues to next task in topological order

---

## Template Library (Phase 6 v1 - Core Methods)

### 1. Linear Regression Template

```python
import numpy as np
import pandas as pd
import json
from scipy import stats

def main():
    # Load or generate sample data
    x = np.array([...])  # Independent variables
    y = np.array([...])  # Dependent variable

    # Fit linear regression
    slope, intercept, r_value, p_value, std_err = stats.linregress(x, y)

    # Calculate predictions and residuals
    y_pred = slope * x + intercept
    residuals = y - y_pred
    mse = np.mean(residuals**2)
    r_squared = r_value**2

    # Output results
    results = {
        "numerical_solution": {
            "slope": float(slope),
            "intercept": float(intercept)
        },
        "fitting_parameters": {
            "MSE": float(mse),
            "R2": float(r_squared),
            "p_value": float(p_value)
        }
    }
    print(json.dumps(results, indent=2))

    # Generate plots
    if HAS_MATPLOTLIB:
        import os
        os.makedirs(".planning/output/plots/{task_id}", exist_ok=True)
        # Scatter plot with regression line
        # Residuals plot

if __name__ == "__main__":
    main()
```

### 2. Logistic Regression Template

```python
import numpy as np
import json
from scipy.optimize import minimize

def sigmoid(z):
    return 1 / (1 + np.exp(-z))

def cost_function(theta, X, y):
    h = sigmoid(X @ theta)
    epsilon = 1e-10  # Prevent log(0)
    return -np.mean(y * np.log(h + epsilon) + (1 - y) * np.log(1 - h + epsilon))

def main():
    # Load data
    X = np.array([...])  # Features (n_samples, n_features)
    y = np.array([...])  # Binary labels (0 or 1)

    # Add intercept term
    X = np.column_stack([np.ones(len(X)), X])

    # Initialize parameters
    theta = np.zeros(X.shape[1])

    # Optimize
    result = minimize(cost_function, theta, args=(X, y))
    theta_opt = result.x

    # Calculate accuracy
    predictions = sigmoid(X @ theta_opt) >= 0.5
    accuracy = np.mean(predictions == y)

    # Output results
    results = {
        "numerical_solution": theta_opt.tolist(),
        "fitting_parameters": {
            "accuracy": float(accuracy),
            "cost": float(result.fun)
        }
    }
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    main()
```

### 3. Linear Programming Template

```python
import numpy as np
import json
from scipy.optimize import linprog

def main():
    # Define problem: minimize c @ x subject to Ax <= b, x >= 0

    c = np.array([...])  # Cost coefficients
    A_ub = np.array([...])  # Inequality constraint matrix
    b_ub = np.array([...])  # Inequality constraint RHS

    # Solve
    result = linprog(c, A_ub=A_ub, b_ub=b_ub, method='highs')

    if result.success:
        results = {
            "numerical_solution": {
                "x": result.x.tolist(),
                "optimal_value": float(result.fun)
            },
            "status": "optimal"
        }
    else:
        results = {
            "status": "failed",
            "message": result.message
        }

    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    main()
```

### 4. ARIMA Template (time series)

```python
import numpy as np
import pandas as pd
import json

def main():
    # Load time series data
    data = np.array([...])

    # Simple moving average forecast (ARIMA-like)
    window = min(5, len(data) // 2)
    forecast = np.mean(data[-window:])

    # Calculate metrics
    residuals = data - np.mean(data)
    mse = np.mean(residuals**2)

    results = {
        "numerical_solution": {
            "forecast": float(forecast)
        },
        "fitting_parameters": {
            "MSE": float(mse)
        }
    }
    print(json.dumps(results, indent=2))

    if HAS_MATPLOTLIB:
        import os
        os.makedirs(".planning/output/plots/{task_id}", exist_ok=True)
        # Time series plot with forecast

if __name__ == "__main__":
    main()
```

### 5. K-Means Clustering Template

```python
import numpy as np
import json

def euclidean_distance(a, b):
    return np.sqrt(np.sum((a - b)**2))

def kmeans(X, k, max_iter=100):
    # Initialize centroids randomly
    centroids = X[np.random.choice(len(X), k, replace=False)]

    for _ in range(max_iter):
        # Assign points to nearest centroid
        labels = np.array([np.argmin([euclidean_distance(x, c) for c in centroids]) for x in X])

        # Update centroids
        new_centroids = np.array([X[labels == i].mean(axis=0) for i in range(k)])

        # Check convergence
        if np.allclose(centroids, new_centroids):
            break

        centroids = new_centroids

    return labels, centroids

def main():
    # Load data
    X = np.array([...])  # Data points
    k = 3  # Number of clusters

    # Perform clustering
    labels, centroids = kmeans(X, k)

    # Calculate inertia (within-cluster sum of squares)
    inertia = sum(euclidean_distance(X[i], centroids[labels[i]])**2 for i in range(len(X)))

    results = {
        "numerical_solution": {
            "centroids": centroids.tolist(),
            "labels": labels.tolist()
        },
        "fitting_parameters": {
            "inertia": float(inertia)
        }
    }
    print(json.dumps(results, indent=2))

    if HAS_MATPLOTLIB:
        import os
        os.makedirs(".planning/output/plots/{task_id}", exist_ok=True)
        # Cluster scatter plot

if __name__ == "__main__":
    main()
```

### 6. ODE Solver Template

```python
import numpy as np
import json
from scipy.integrate import odeint

def ode_system(y, t, params):
    """
    Define the ODE system here.
    y: state variables
    t: time
    params: parameters
    """
    dydt = [...]  # Define your ODE system
    return dydt

def main():
    # Define parameters
    params = [...]

    # Initial conditions
    y0 = [...]

    # Time points
    t = np.linspace(0, 10, 100)

    # Solve ODE
    solution = odeint(ode_system, y0, t, args=(params,))

    # Extract final solution
    results = {
        "numerical_solution": {
            "final_state": solution[-1].tolist(),
            "trajectory": solution.tolist()
        }
    }
    print(json.dumps(results, indent=2))

    if HAS_MATPLOTLIB:
        import os
        os.makedirs(".planning/output/plots/{task_id}", exist_ok=True)
        # Trajectory plot

if __name__ == "__main__":
    main()
```

---

## Error Handling

- **Syntax error**: Auto-fix with LLM, retry (max 5 times)
- **Runtime error**: Auto-debug with LLM, retry (max 5 times)
- **Timeout**: Terminate after 300s, mark failed
- **Max retries exceeded**: Mark failed, continue DAG execution

---

## Results Format (Decision D-11)

```json
{
  "task_id": "1",
  "status": "success|failed|timeout",
  "execution_time": 12.5,
  "stdout": "Complete output text",
  "stderr": "Error message (if any)",
  "results": {
    "numerical_solution": {...},
    "fitting_parameters": {...},
    "metrics": {"MSE": 0.05, "R2": 0.95}
  },
  "plots": [
    {
      "path": ".planning/output/plots/1/regression-line.png",
      "type": "scatter",
      "description": "Regression plot"
    }
  ],
  "created_at": "2026-04-11T..."
}
```

---

## Integration

Phase 6 of mm-agent workflow. Called by coordinator after Phase 5 (Mathematical Modeling) completes.

Output consumed by Phase 7 (Report Generation).