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