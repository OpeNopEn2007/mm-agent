"""
Tests for HMML knowledge retrieval module (KNOW-02, KNOW-03).

Tests verify:
- KNOW-02: HMML retrieval functionality with semantic similarity
- KNOW-03: Output format compliance with IDEA.md §5.3
"""

import json
import pytest
from pathlib import Path


class TestHMMLRetrieval:
    """Test suite for HMML retrieval functionality (KNOW-02)."""

    def test_retrieval_script_exists(self, monkeypatch):
        """Test that the retrieval script exists and is executable."""
        import os
        script_path = Path(__file__).parent.parent / ".claude" / "scripts" / "hmml_retrieval.py"
        assert script_path.exists(), "hmml_retrieval.py script not found"
        assert os.access(script_path, os.X_OK), "hmml_retrieval.py not executable"

    def test_retrieve_methods(self, tmp_path):
        """
        Test that retrieval script computes query embedding and returns top-k methods.

        KNOW-02: Verify semantic similarity computation and Top-K retrieval.
        """
        import subprocess

        # Create test query file
        query_file = tmp_path / "query.txt"
        query_file.write_text("预测网球比赛中的动量效应和胜负趋势", encoding='utf-8')

        # Create output file path
        output_file = tmp_path / "results.json"

        # Run retrieval script
        result = subprocess.run(
            [
                "python3",
                str(Path(__file__).parent.parent / ".claude" / "scripts" / "hmml_retrieval.py"),
                "--query-file", str(query_file),
                "--output", str(output_file),
                "--top-k", "6",
                "--knowledge-dir", str(Path(__file__).parent.parent / ".planning" / "knowledge")
            ],
            capture_output=True,
            text=True,
            timeout=120
        )

        assert result.returncode == 0, f"Retrieval failed: {result.stderr}"
        assert output_file.exists(), "Output file not created"

        # Load and verify results
        with open(output_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        assert "query" in data, "Missing 'query' field"
        assert "methods" in data, "Missing 'methods' field"
        assert "top_k" in data, "Missing 'top_k' field"
        assert "timestamp" in data, "Missing 'timestamp' field"

        assert data["query"] == "预测网球比赛中的动量效应和胜负趋势"
        assert len(data["methods"]) == 6, f"Expected 6 methods, got {len(data['methods'])}"
        assert data["top_k"] == 6

        # Verify method entries have required fields
        for method in data["methods"]:
            assert "domain" in method, "Missing 'domain' field"
            assert "subdomain" in method, "Missing 'subdomain' field"
            assert "method" in method, "Missing 'method' field"
            assert "score" in method, "Missing 'score' field"
            assert "core_idea" in method, "Missing 'core_idea' field"
            assert "application" in method, "Missing 'application' field"

            # Verify score is a float between 0 and 1
            assert isinstance(method["score"], float), "Score must be float"
            assert 0 <= method["score"] <= 1, f"Score out of range: {method['score']}"

        # Verify methods are sorted by score (descending)
        scores = [m["score"] for m in data["methods"]]
        assert scores == sorted(scores, reverse=True), "Methods not sorted by score"

    def test_output_format(self, tmp_path):
        """
        Test that retrieval output matches IDEA.md §5.3 format specification.

        KNOW-03: Verify JSON schema compliance.
        """
        import subprocess

        # Create test query file
        query_file = tmp_path / "query.txt"
        query_file.write_text("时间序列预测分析", encoding='utf-8')

        # Create output file path
        output_file = tmp_path / "results.json"

        # Run retrieval script
        subprocess.run(
            [
                "python3",
                str(Path(__file__).parent.parent / ".claude" / "scripts" / "hmml_retrieval.py"),
                "--query-file", str(query_file),
                "--output", str(output_file),
                "--top-k", "3"
            ],
            capture_output=True,
            text=True,
            timeout=120
        )

        # Load and verify JSON schema
        with open(output_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # Schema per IDEA.md §5.3
        required_top_level = {"query", "methods", "top_k", "timestamp"}
        assert set(data.keys()) == required_top_level, f"Missing required fields: {required_top_level - set(data.keys())}"

        # Verify timestamp is ISO format
        assert "T" in data["timestamp"], "Timestamp should be ISO format"

        # Verify method entry schema
        required_method_fields = {"domain", "subdomain", "method", "score", "core_idea", "application"}
        for method in data["methods"]:
            assert set(method.keys()) == required_method_fields, \
                f"Missing method fields: {required_method_fields - set(method.keys())}"

    def test_cosine_similarity_computation(self):
        """
        Test that cosine similarity is computed correctly.

        Validates the similarity computation function.
        """
        import numpy as np
        import sys
        sys.path.insert(0, str(Path(__file__).parent.parent / ".claude" / "scripts"))

        from hmml_retrieval import cosine_similarity

        # Test identical vectors
        a = np.array([1.0, 2.0, 3.0])
        sim = cosine_similarity(a, a)
        assert abs(sim - 1.0) < 1e-6, f"Identical vectors should have similarity 1.0, got {sim}"

        # Test orthogonal vectors
        b = np.array([0.0, 0.0, 1.0])
        c = np.array([1.0, 0.0, 0.0])
        sim = cosine_similarity(b, c)
        assert abs(sim - 0.0) < 1e-6, f"Orthogonal vectors should have similarity 0.0, got {sim}"

        # Test opposite vectors
        d = np.array([1.0, 0.0, 0.0])
        e = np.array([-1.0, 0.0, 0.0])
        sim = cosine_similarity(d, e)
        assert abs(sim - (-1.0)) < 1e-6, f"Opposite vectors should have similarity -1.0, got {sim}"

    def test_parent_weighting_formula(self):
        """
        Test that parent weighting formula matches IDEA.md §3.3.

        Formula: final_score = ω · child_sim + (1-ω) · parent_sim
        """
        import numpy as np
        import sys
        sys.path.insert(0, str(Path(__file__).parent.parent / ".claude" / "scripts"))

        from hmml_retrieval import compute_weighted_similarity, cosine_similarity

        query = np.array([1.0, 0.0, 0.0])
        method = np.array([0.8, 0.2, 0.0])
        parent = np.array([0.6, 0.4, 0.0])

        # Test with default omega = 0.5
        omega = 0.5
        child_sim = cosine_similarity(query, method)
        parent_sim = cosine_similarity(query, parent)

        weighted_score = compute_weighted_similarity(query, method, parent, omega)

        expected_score = omega * child_sim + (1 - omega) * parent_sim
        assert abs(weighted_score - expected_score) < 1e-6, \
            f"Parent weighting formula incorrect: {weighted_score} vs {expected_score}"

        # Test without parent (should return child_sim)
        score_no_parent = compute_weighted_similarity(query, method, None, omega)
        assert abs(score_no_parent - child_sim) < 1e-6, \
            "Without parent, score should equal child similarity"

    def test_custom_top_k(self, tmp_path):
        """Test that custom top-k parameter works correctly."""
        import subprocess

        query_file = tmp_path / "query.txt"
        query_file.write_text("分类问题", encoding='utf-8')

        output_file = tmp_path / "results.json"

        # Test top_k = 3
        result = subprocess.run(
            [
                "python3",
                str(Path(__file__).parent.parent / ".claude" / "scripts" / "hmml_retrieval.py"),
                "--query-file", str(query_file),
                "--output", str(output_file),
                "--top-k", "3"
            ],
            capture_output=True,
            text=True,
            timeout=120
        )

        with open(output_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        assert len(data["methods"]) == 3, f"Expected 3 methods with --top-k=3, got {len(data['methods'])}"
        assert data["top_k"] == 3

    def test_custom_omega(self, tmp_path):
        """Test that custom omega parameter works correctly."""
        import subprocess

        query_file = tmp_path / "query.txt"
        query_file.write_text("优化问题", encoding='utf-8')

        output_file = tmp_path / "results.json"

        # Test with omega = 0.7 (higher weight on child similarity)
        subprocess.run(
            [
                "python3",
                str(Path(__file__).parent.parent / ".claude" / "scripts" / "hmml_retrieval.py"),
                "--query-file", str(query_file),
                "--output", str(output_file),
                "--top-k", "1",
                "--omega", "0.7"
            ],
            capture_output=True,
            text=True,
            timeout=120
        )

        assert output_file.exists(), "Output file not created with custom omega"

        # Just verify the command runs successfully
        # Note: Actual weighted similarity testing is covered in test_parent_weighting_formula