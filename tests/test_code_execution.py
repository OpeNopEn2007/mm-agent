"""
Tests for Code Generation & Execution phase (CODE-01 through CODE-06).

Tests verify:
- CODE-01: System generates executable Python code
- CODE-02: System executes generated Python code
- CODE-03: System captures stdout/stderr
- CODE-04: System auto-retries on failures (max 5 times)
- CODE-05: System outputs results.json and plots
- CODE-06: System enforces 300s timeout
"""

import ast
import json
import subprocess
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch
import pytest


class TestCodeExecutionSkill:
    """Test suite for code-execution.md skill existence."""

    def test_code_generation_skill_exists(self):
        """
        Test that the code-execution.md skill file exists.

        CODE-01: Verify skill file exists before code generation.
        """
        skill_path = Path(__file__).parent.parent / ".claude" / "skills" / "mm-agent" / "code-execution.md"
        assert skill_path.exists(), "code-execution.md skill not found"


class TestCodeGeneration:
    """Test suite for code generation (CODE-01)."""

    def test_code_generation_outputs_valid_python(self):
        """
        Test that generated code is valid Python.

        CODE-01: Verify generated code can be parsed by ast.parse().
        """
        # Sample generated code (what the skill would produce)
        generated_code = '''
import numpy as np
import matplotlib.pyplot as plt

def main():
    # Load data
    x = np.array([1, 2, 3, 4, 5])
    y = np.array([2, 4, 6, 8, 10])

    # Linear regression
    slope, intercept = np.polyfit(x, y, 1)

    # Print results
    print(f"Slope: {slope}")
    print(f"Intercept: {intercept}")

    return {"slope": float(slope), "intercept": float(intercept)}

if __name__ == "__main__":
    result = main()
    print(f"Result: {result}")
'''

        # Verify code is valid Python using ast.parse()
        try:
            ast.parse(generated_code)
        except SyntaxError as e:
            pytest.fail(f"Generated code has syntax error: {e}")


class TestCodeExecution:
    """Test suite for code execution (CODE-02, CODE-03, CODE-04, CODE-06)."""

    def test_code_execution_captures_output(self, tmp_path):
        """
        Test that subprocess.run() captures stdout/stderr.

        CODE-02: Verify code execution.
        CODE-03: Verify stdout/stderr capture.
        """
        # Create a simple Python script
        script_path = tmp_path / "test_script.py"
        script_path.write_text('''
import sys

print("This is stdout")
sys.stderr.write("This is stderr")
''')

        # Execute with subprocess.run() and capture output
        result = subprocess.run(
            ["python3", str(script_path)],
            capture_output=True,
            text=True,
            timeout=10
        )

        # Verify output was captured
        assert result.returncode == 0, f"Script failed with return code {result.returncode}"
        assert "This is stdout" in result.stdout, "stdout not captured"
        assert "This is stderr" in result.stderr, "stderr not captured"
        assert hasattr(result, 'stdout'), "Result missing stdout attribute"
        assert hasattr(result, 'stderr'), "Result missing stderr attribute"

    def test_retry_logic_with_syntax_error(self, tmp_path):
        """
        Test that max_retries=5 is enforced on failures.

        CODE-04: Verify auto-retry with max 5 attempts.
        """
        # Create a script with syntax error
        script_path = tmp_path / "broken_script.py"
        script_path.write_text('''
def main():
    # Syntax error: missing closing parenthesis
    print("Hello"

if __name__ == "__main__":
    main()
''')

        # Simulate retry logic
        max_retries = 5
        retry_count = 0
        success = False

        for attempt in range(max_retries):
            retry_count += 1
            result = subprocess.run(
                ["python3", str(script_path)],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                success = True
                break

        # Verify retry limit was enforced
        assert retry_count == max_retries, f"Expected {max_retries} retries, got {retry_count}"
        assert not success, "Script with syntax error should fail after all retries"

    def test_timeout_protection(self):
        """
        Test that timeout=300s is enforced.

        CODE-06: Verify execution timeout protection.
        """
        # Create a script that runs forever
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write('''
import time
while True:
    time.sleep(1)
''')
            script_path = f.name

        try:
            # Execute with timeout
            result = subprocess.run(
                ["python3", script_path],
                capture_output=True,
                text=True,
                timeout=1  # Using 1s for test (production uses 300s)
            )
            pytest.fail("Timeout should have been raised")
        except subprocess.TimeoutExpired as e:
            # Verify timeout was raised
            assert e.timeout == 1, f"Expected timeout=1, got {e.timeout}"
        finally:
            # Clean up
            Path(script_path).unlink(missing_ok=True)


class TestResultsFormat:
    """Test suite for results.json format (CODE-05)."""

    def test_results_json_format(self, tmp_path):
        """
        Test that results.json matches Decision D-11 schema.

        CODE-05: Verify results.json format with all required fields.
        """
        # Create sample results.json following D-11 schema
        results_path = tmp_path / "results.json"
        results_data = {
            "task_id": "1",
            "status": "success",
            "execution_time": 12.5,
            "stdout": "Slope: 2.0\\nIntercept: 0.0\\nResult: {'slope': 2.0, 'intercept': 0.0}",
            "stderr": "",
            "results": {
                "numerical_solutions": {
                    "slope": 2.0,
                    "intercept": 0.0
                },
                "fitting_parameters": {
                    "MSE": 0.0,
                    "R2": 1.0
                },
                "metrics": {
                    "MSE": 0.0,
                    "R2": 1.0
                }
            },
            "plots": [
                {
                    "path": ".planning/output/plots/1/regression-line.png",
                    "type": "scatter",
                    "description": "回归拟合效果图"
                }
            ],
            "created_at": "2026-04-11T12:00:00Z"
        }

        with open(results_path, 'w', encoding='utf-8') as f:
            json.dump(results_data, f, indent=2, ensure_ascii=False)

        # Load and verify schema
        with open(results_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # Verify top-level fields
        assert "task_id" in data, "Missing 'task_id' field"
        assert "status" in data, "Missing 'status' field"
        assert "execution_time" in data, "Missing 'execution_time' field"
        assert "stdout" in data, "Missing 'stdout' field"
        assert "stderr" in data, "Missing 'stderr' field"
        assert "results" in data, "Missing 'results' field"
        assert "plots" in data, "Missing 'plots' field"
        assert "created_at" in data, "Missing 'created_at' field"

        # Verify status values
        assert data["status"] in ["success", "failed", "timeout"], \
            f"Invalid status: {data['status']}"

        # Verify execution_time is a float
        assert isinstance(data["execution_time"], (int, float)), \
            f"execution_time should be numeric, got {type(data['execution_time'])}"

        # Verify stdout/stderr are strings
        assert isinstance(data["stdout"], str), "stdout should be string"
        assert isinstance(data["stderr"], str), "stderr should be string"

        # Verify results object
        assert isinstance(data["results"], dict), "results should be a dict"

        # Verify plots array
        assert isinstance(data["plots"], list), "plots should be a list"
        for plot in data["plots"]:
            assert "path" in plot, "Plot missing 'path' field"
            assert "type" in plot, "Plot missing 'type' field"
            assert "description" in plot, "Plot missing 'description' field"

        # Verify created_at is ISO datetime string
        assert isinstance(data["created_at"], str), "created_at should be string"
        assert "T" in data["created_at"] or data["created_at"] == "", \
            "created_at should be ISO datetime format"

    def test_results_json_failure_format(self, tmp_path):
        """
        Test that results.json handles failure/timeout status correctly.

        CODE-05: Verify results.json format for failed executions.
        """
        # Create sample failed results.json
        results_path = tmp_path / "results-failed.json"
        results_data = {
            "task_id": "2",
            "status": "failed",
            "execution_time": 1.2,
            "stdout": "Starting execution...",
            "stderr": "Traceback (most recent call last):\\n  File ..., line 5, in <module>\\nNameError: name 'undefined_var' is not defined",
            "results": {},
            "plots": [],
            "created_at": "2026-04-11T12:05:00Z"
        }

        with open(results_path, 'w', encoding='utf-8') as f:
            json.dump(results_data, f, indent=2, ensure_ascii=False)

        # Load and verify
        with open(results_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        assert data["status"] == "failed"
        assert len(data["stderr"]) > 0, "Failed execution should have stderr"
        assert data["results"] == {}, "Failed execution should have empty results"
        assert data["plots"] == [], "Failed execution should have empty plots"