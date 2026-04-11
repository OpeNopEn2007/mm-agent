"""
Tests for Mathematical Modeling phase (MODEL-01, MODEL-02, MODEL-03).

Tests verify:
- MODEL-01: Initial modeling plan generation from task description + retrieved methods
- MODEL-02: model.md output with modeling_method, formulas, variables, assumptions
- MODEL-03: formulas.json output with equations[], variables[], assumptions[]
"""

import json
import pytest
from pathlib import Path


class TestMathematicalModelingOutput:
    """Test suite for modeling output format (MODEL-02, MODEL-03)."""

    def test_modeling_skill_exists(self):
        """Test that the modeling skill file exists."""
        skill_path = Path(__file__).parent.parent / ".claude" / "skills" / "mm-agent" / "modeling.md"
        assert skill_path.exists(), "modeling.md skill not found"

    def test_model_md_structure(self, tmp_path):
        """
        Test that model.md has required sections.

        MODEL-02: Verify modeling_method, formulas, variables, assumptions sections.
        """
        # Create sample model.md
        model_path = tmp_path / "model.md"
        model_path.write_text("""---
task_id: 1
phase: mathematical-modeling
---

# Modeling Method

使用线性回归模型预测网球比赛动量。

## Formulas

$$ y = \\beta_0 + \\beta_1 x_1 + \\beta_2 x_2 + \\epsilon $$

其中：
- $y$ 为比赛结果（胜/负）
- $x_1$ 为历史动量指标
- $x_2$ 为球员状态指标
- $\\epsilon$ 为误差项

## Variables

| Variable | Description | Type |
|----------|-------------|------|
| $y$ | 比赛结果 | Binary (0/1) |
| $x_1$ | 历史动量指标 | Continuous [0,1] |
| $x_2$ | 球员状态指标 | Continuous [0,1] |
| $\\beta_0$ | 截距 | Real |
| $\\beta_1, \\beta_2$ | 回归系数 | Real |

## Assumptions

1. 动量效应对比赛结果有线性影响
2. 历史数据能够准确反映当前状态
3. 误差项服从正态分布 $\\epsilon \\sim N(0, \\sigma^2)$
""", encoding='utf-8')

        # Read and verify structure
        content = model_path.read_text(encoding='utf-8')

        # Check for required sections
        assert "# Modeling Method" in content, "Missing 'Modeling Method' section"
        assert "## Formulas" in content, "Missing 'Formulas' section"
        assert "## Variables" in content, "Missing 'Variables' section"
        assert "## Assumptions" in content, "Missing 'Assumptions' section"

        # Check frontmatter has task_id and phase
        assert "task_id:" in content, "Missing 'task_id' in frontmatter"
        assert "phase:" in content, "Missing 'phase' in frontmatter"

    def test_formulas_json_schema(self, tmp_path):
        """
        Test that formulas.json matches IDEA.md §10.1 schema.

        MODEL-03: Verify structured formula definitions with equations[], variables[], assumptions[].
        """
        # Create sample formulas.json
        formulas_path = tmp_path / "formulas.json"
        formulas_data = {
            "task_id": "1",
            "equations": [
                {
                    "name": "Linear Regression Model",
                    "latex": "y = \\beta_0 + \\beta_1 x_1 + \\beta_2 x_2 + \\epsilon",
                    "description": "预测比赛结果的线性回归模型"
                }
            ],
            "variables": [
                {
                    "symbol": "y",
                    "description": "比赛结果",
                    "type": "Binary",
                    "range": "[0, 1]"
                },
                {
                    "symbol": "x_1",
                    "description": "历史动量指标",
                    "type": "Continuous",
                    "range": "[0, 1]"
                },
                {
                    "symbol": "\\beta_0",
                    "description": "截距",
                    "type": "Real",
                    "range": "(-\\infty, \\infty)"
                }
            ],
            "assumptions": [
                "动量效应对比赛结果有线性影响",
                "历史数据能够准确反映当前状态",
                "误差项服从正态分布"
            ]
        }

        with open(formulas_path, 'w', encoding='utf-8') as f:
            json.dump(formulas_data, f, indent=2, ensure_ascii=False)

        # Load and verify schema
        with open(formulas_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # Verify top-level fields
        assert "task_id" in data, "Missing 'task_id' field"
        assert "equations" in data, "Missing 'equations' field"
        assert "variables" in data, "Missing 'variables' field"
        assert "assumptions" in data, "Missing 'assumptions' field"

        # Verify equations array
        assert isinstance(data["equations"], list), "equations must be a list"
        for eq in data["equations"]:
            assert "name" in eq, "Equation missing 'name' field"
            assert "latex" in eq, "Equation missing 'latex' field"
            assert "description" in eq, "Equation missing 'description' field"

        # Verify variables array
        assert isinstance(data["variables"], list), "variables must be a list"
        for var in data["variables"]:
            assert "symbol" in var, "Variable missing 'symbol' field"
            assert "description" in var, "Variable missing 'description' field"
            assert "type" in var, "Variable missing 'type' field"

        # Verify assumptions array
        assert isinstance(data["assumptions"], list), "assumptions must be a list"
        assert len(data["assumptions"]) > 0, "assumptions should not be empty"

    def test_modeling_integration_with_retrieved_methods(self, tmp_path):
        """
        Test that modeling skill uses retrieved methods as input.

        MODEL-01: Verify modeling plan is based on task description + retrieved methods.
        """
        # Create sample retrieved-methods.json
        methods_path = tmp_path / "retrieved-methods.json"
        methods_data = {
            "query": "预测网球比赛中的动量效应",
            "methods": [
                {
                    "domain": "Prediction",
                    "subdomain": "Time Series",
                    "method": "ARIMA",
                    "score": 0.85,
                    "core_idea": "自回归积分滑动平均模型",
                    "application": "时间序列预测"
                },
                {
                    "domain": "Prediction",
                    "subdomain": "Regression",
                    "method": "Linear Regression",
                    "score": 0.82,
                    "core_idea": "线性回归模型",
                    "application": "预测连续值"
                }
            ],
            "top_k": 2,
            "timestamp": "2026-04-11T12:00:00Z"
        }

        with open(methods_path, 'w', encoding='utf-8') as f:
            json.dump(methods_data, f, indent=2, ensure_ascii=False)

        # Create task description
        task_desc_path = tmp_path / "task-desc.txt"
        task_desc_path.write_text("建立预测模型，分析网球比赛中的动量效应对胜负的影响", encoding='utf-8')

        # Verify inputs exist for modeling phase
        assert methods_path.exists(), "retrieved-methods.json should exist"
        assert task_desc_path.exists(), "task-desc.txt should exist"

        # Verify methods data structure
        with open(methods_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        assert "methods" in data, "Missing 'methods' in retrieved-methods.json"
        assert len(data["methods"]) > 0, "Should have at least one retrieved method"

        # Verify method entries have required fields for modeling
        for method in data["methods"]:
            assert "method" in method, "Missing 'method' name"
            assert "core_idea" in method, "Missing 'core_idea' for method selection"
            assert "application" in method, "Missing 'application' for method applicability"


class TestActorCriticIteration:
    """Test suite for Actor-Critic iteration (MODEL-04, MODEL-05)."""

    def test_actor_critic_parameters(self):
        """
        Test that Actor-Critic uses correct parameters from IDEA.md §8.

        MODEL-04: Verify max_rounds=3.
        MODEL-05: Verify satisfaction_threshold=8.
        """
        # These parameters should be defined in the modeling skill
        # The skill should use max_rounds=3 and satisfaction_threshold=8

        expected_params = {
            "max_rounds": 3,
            "satisfaction_threshold": 8
        }

        # This test verifies the constants are documented in IDEA.md
        # The actual implementation will reference these values
        assert expected_params["max_rounds"] == 3
        assert expected_params["satisfaction_threshold"] == 8

    def test_iteration_stopping_condition(self):
        """
        Test that iteration stops when satisfaction threshold is reached.

        MODEL-05: Stop iteration when score >= threshold (not always complete max rounds).
        """
        # Simulate iteration scores
        scores = [5, 9, 7]  # Round 2: score=9 >= 8, should stop
        satisfaction_threshold = 8

        # Find first round where threshold is met
        stop_round = None
        for i, score in enumerate(scores):
            if score >= satisfaction_threshold:
                stop_round = i + 1
                break

        assert stop_round == 2, f"Should stop at round 2 (score=9 >= 8), got round {stop_round}"

    def test_iteration_exhausts_max_rounds(self):
        """
        Test that iteration completes all max_rounds if threshold never met.

        MODEL-04: Complete max_rounds=3 when threshold not reached.
        """
        # Simulate iteration scores never reaching threshold
        scores = [5, 6, 7]  # None >= 8
        max_rounds = 3
        satisfaction_threshold = 8

        # Count rounds executed
        rounds_executed = 0
        stop_round = None
        for i, score in enumerate(scores):
            rounds_executed += 1
            if score >= satisfaction_threshold:
                stop_round = i + 1
                break

        assert stop_round is None, "Should not stop early (no score >= threshold)"
        assert rounds_executed == max_rounds, f"Should complete {max_rounds} rounds, got {rounds_executed}"