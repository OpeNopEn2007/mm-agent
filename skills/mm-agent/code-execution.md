---
name: code-execution
description: Code generation and execution for numerical simulation
---

# Code Execution Skill

Generate and execute Python code for numerical simulation of a single task.

**Invocation:** The coordinator invokes this skill with `--task-id {id}` after Phase 5 (Mathematical Modeling) completes.

## Parameters

- `task_id` — Task identifier (from coordinator via $ARGUMENTS)
- `max_retries` — Maximum total execution attempts (default: 5)
- `max_repair` — Maximum LLM repair attempts per execution (default: 3)
- `timeout` — Execution timeout in seconds (default: 300)

## Step 1: Load modeling outputs

Read these files using the Read tool:

1. `.planning/memory/model-{task_id}.md` — Modeling method, formulas, variables, assumptions
2. `.planning/memory/formulas-{task_id}.json` — Structured formula definitions
3. `.planning/memory/context-for-task-{task_id}.txt` — Dependency context (may not exist)

If model.md or formulas.json is missing, report an error and stop.

## Step 2: Generate Python code

Ask the LLM to generate executable Python code. Use this prompt structure:

> You are a Python numerical computing expert. Generate executable Python code for this mathematical model.
>
> Modeling Method: {extracted_from_model_md}
> Formulas: {from_formulas_json}
> Variables: {variables_table}
> Assumptions: {assumptions_list}
> Dependency Data Paths: {paths_to_results_of_dependency_tasks}
>
> Requirements:
> 1. Use standard libraries (numpy, scipy, pandas)
> 2. Implement the mathematical formulas
> 3. Read from dependency result files if specified
> 4. Output numerical results to stdout as JSON
> 5. Generate visualization plots (save to .planning/output/plots/{task_id}/)
> 6. Handle missing matplotlib gracefully (check before importing)
> 7. Use `if __name__ == "__main__": main()` entry point

For each dependency task, inject data path constants at the top of the generated code:
```python
DATA_PATH_1 = ".planning/memory/results-1.json"
```

## Step 3: Validate generated code

Parse the generated code with Python's `ast.parse()` to check for syntax errors. If invalid, ask the LLM to fix the syntax error and regenerate.

## Step 4: Write code file

Write the validated code to `.planning/code/task-{task_id}.py`.

## Step 5: Execute code

Run the generated code as a subprocess:

```bash
python3 .planning/code/task-{task_id}.py
```

Execution settings:
- **Timeout:** 300 seconds (5 minutes)
- **Capture:** stdout and stderr
- **Working directory:** project root

Use `subprocess.run()` with `capture_output=True`, `text=True`, `timeout=300`.

## Step 6: Handle execution errors

If execution fails (non-zero exit code or timeout), attempt repair:

### 6a: Classify the error

Categorize the error from stderr:
- `syntax` — SyntaxError, IndentationError
- `runtime` — NameError, TypeError, AttributeError, ValueError
- `import` — ImportError, ModuleNotFoundError
- `file` — FileNotFoundError
- `timeout` — Execution exceeded 300s
- `logic` — Other errors

### 6b: Repair via LLM

Ask the LLM to fix the code:

> 代码执行失败，请修复：
>
> 原代码：{original_code}
> 错误信息：{stderr}
> 错误分类：{error_class}
>
> 请分析错误原因并输出修复后的完整代码。

Validate the repaired code with `ast.parse()` before retrying.

### 6c: Retry logic

- Total execution attempts: up to `max_retries` (5)
- Repair attempts: up to `max_repair` (3) per error class
- On timeout: ask LLM to simplify computation (reduce iterations, smaller sample)
- If all retries exhausted, write failure results and continue

## Step 7: Collect results

### Parse stdout

Look for JSON output in stdout. Expected structure:
```json
{
  "numerical_solution": {...},
  "fitting_parameters": {...},
  "metrics": {"MSE": 0.05, "R2": 0.95}
}
```

If no structured JSON found, store raw stdout (truncated to 1000 chars).

### Discover plots

Scan `.planning/output/plots/{task_id}/` for `.png` and `.pdf` files.

### Write results.json

Write to `.planning/memory/results-{task_id}.json`:

```json
{
  "task_id": "{task_id}",
  "status": "success|failed|timeout",
  "execution_time": 12.5,
  "stdout": "...",
  "stderr": "...",
  "results": {...},
  "plots": [{"path": "...", "type": "...", "description": "..."}],
  "created_at": "ISO timestamp"
}
```

## Step 8: Update task memory

Read `.planning/memory/task-{task_id}.json`, update these fields, and write it back:

- `phase`: `"code-execution"`
- `status`: `"completed"` if execution succeeded, `"failed"` otherwise
- `task_code`: contents of `.planning/code/task-{task_id}.py`
- `execution_result`: `{status, stdout, stderr, execution_time, results}`
- `code_structure`: `{"file_outputs": [{"path": "results-{id}.json"}, {"path": "task-{id}.py"}]}`
- `charts`: list of discovered plot files
- `updated_at`: current ISO timestamp

## Graceful Failure

- Failed tasks do NOT block the coordinator's DAG execution
- Results are always written (even on failure) so Phase 7 can include partial results
- Error information is preserved in results.json for debugging

---

## Chart Selection Reference

| Modeling Method | Required Charts | Optional Charts |
|----------------|----------------|-----------------|
| Regression | Scatter + regression line | Residuals, prediction interval |
| Time series | Time series plot | ACF/PACF, forecast comparison |
| Optimization | Convergence plot | 3D objective function surface |
| Clustering | Scatter + cluster labels | Cluster center heatmap |
| Evaluation | Weight bar chart | TOPSIS ranking radar |
| ODE | Trajectory plot | Phase portrait |
| Interpolation | Curve fitting plot | Error distribution |

## Quality Checklist

- [ ] model.md and formulas.json loaded
- [ ] Python code generated with proper imports and structure
- [ ] Code validates with ast.parse()
- [ ] Code executes within 300s timeout
- [ ] Execution errors trigger LLM repair (up to 3 attempts)
- [ ] results.json written with correct schema
- [ ] Plots discovered and catalogued
- [ ] Task memory updated with execution results
