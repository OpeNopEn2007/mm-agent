from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from hmml_common import (
    build_method_index,
    evaluation_content_sha256,
    extract_catalog,
    labels_are_adjudicated,
    rank_hierarchical,
    sha256_file,
    validate_evaluation_labels,
    write_dense_index,
)
from hmml_recalculate import recalculate
from hmml_select import choose_model


PROJECT_ROOT = Path(__file__).resolve().parents[2]
KNOWLEDGE = PROJECT_ROOT / "knowledge" / "hmml" / "hmml.json"
EQUIVALENCE = PROJECT_ROOT / "runtime" / "evaluation" / "hmml-equivalence.json"
SMOKE = PROJECT_ROOT / "runtime" / "evaluation" / "hmml-smoke.json"


def label_for(method) -> dict[str, object]:
    return {
        "concept_id": method.concept_id,
        "primary_method_id": method.primary_method_id,
        "method": method.method,
        "equivalent_method_ids": list(method.equivalent_method_ids),
    }


def model_selection_fixture(catalog, status: str) -> dict[str, object]:
    concepts = [method for method in catalog.methods if method.method_id == method.primary_method_id]
    pairs = []
    for index in range(15):
        relevant = concepts[index * 3:index * 3 + 3]
        negative = concepts[45 + index]
        pairs.append({
            "id": f"pair-{index + 1:02d}",
            "queries": {
                "zh": f"中文配对查询 {index + 1}",
                "en": f"English paired query {index + 1}",
            },
            "relevant_concepts": [
                {**label_for(method), "relevance": "primary" if offset == 0 else "acceptable"}
                for offset, method in enumerate(relevant)
            ],
            "hard_negatives": [{
                "concept_id": negative.concept_id,
                "primary_method_id": negative.primary_method_id,
            }],
        })
    return {
        "schema_version": 2,
        "dataset_id": "fixture-model-selection",
        "purpose": "model-selection",
        "knowledge_source": {
            "sha256": catalog.knowledge_sha256,
            "equivalence_sha256": catalog.equivalence_sha256,
        },
        "query_design": {
            "paired_translations": True,
            "minimum_relevant_concepts_per_query": 2,
            "minimum_multi_relevant_pair_count": 10,
            "hard_negative_required": True,
        },
        "label_status": status,
        "pairs": pairs,
    }


def write_ai_adjudication(tmp_path: Path, catalog, evaluation_path: Path) -> Path:
    evaluation = json.loads(evaluation_path.read_text(encoding="utf-8"))
    content_hash = evaluation_content_sha256(evaluation)
    query_ids = [f"{pair['id']}-{language}" for pair in evaluation["pairs"] for language in ("zh", "en")]
    review_entries = []
    for suffix in ("a", "b"):
        review = {
            "schema_version": 1,
            "review_id": f"review-{suffix}",
            "reviewer": {
                "reviewer_id": f"reviewer-{suffix}",
                "session_id": f"independent-session-{suffix}",
                "model": f"strong-model-{suffix}",
                "reasoning_effort": "high",
                "capability_tier": "strong",
                "independent_context": True,
            },
            "scope": {
                "evaluation_content_sha256": content_hash,
                "knowledge_sha256": catalog.knowledge_sha256,
                "equivalence_sha256": catalog.equivalence_sha256,
            },
            "decision": "approve",
            "query_reviews": [
                {"query_id": query_id, "decision": "approve", "note": "fixture review"}
                for query_id in query_ids
            ],
            "equivalence_reviews": [
                {"concept_id": group["concept_id"], "decision": "approve", "note": "fixture review"}
                for group in catalog.equivalence_groups
            ],
            "findings": [],
        }
        path = tmp_path / "reviews" / f"review-{suffix}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(review, ensure_ascii=False), encoding="utf-8")
        review_entries.append({"path": f"reviews/{path.name}", "sha256": sha256_file(path)})
    manifest = {
        "schema_version": 1,
        "status": "ai-adjudicated",
        "evaluation_file_sha256": sha256_file(evaluation_path),
        "evaluation_content_sha256": content_hash,
        "knowledge_sha256": catalog.knowledge_sha256,
        "equivalence_sha256": catalog.equivalence_sha256,
        "generator": {"session_id": "generator-session"},
        "reviewers": review_entries,
        "disputes": [],
        "tie_breaker": None,
    }
    path = tmp_path / "adjudication.json"
    path.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    return path


def test_catalog_and_proposed_smoke_labels_match() -> None:
    catalog = extract_catalog(KNOWLEDGE, EQUIVALENCE)
    assert len(catalog.methods) == 97
    assert catalog.methods[0].method == "Linear Programming (Linear Programming, LP)"
    assert catalog.methods[22].method == "Queuing Theory"
    assert catalog.methods[96].method == "Kolmogorov-Smirnov Test (KS Test)"
    assert catalog.methods[0].equivalent_method_ids == ("0", "38")
    assert catalog.methods[89].equivalent_method_ids == ("89", "90")

    smoke = json.loads(SMOKE.read_text(encoding="utf-8"))
    assert smoke["purpose"] == "retrieval-regression-smoke"
    assert smoke["label_status"] == "proposed"
    assert len(smoke["queries"]) == 41
    by_id = {method.method_id: method for method in catalog.methods}
    for query in smoke["queries"]:
        for label in query["relevant_methods"]:
            method = by_id[str(label["method_id"])]
            assert label["method"] == method.method
            if "equivalent_method_ids" in label:
                assert tuple(label["equivalent_method_ids"]) == method.equivalent_method_ids


def test_only_evidence_backed_ai_adjudication_is_valid_ground_truth(tmp_path: Path) -> None:
    catalog = extract_catalog(KNOWLEDGE, EQUIVALENCE)
    assert labels_are_adjudicated("ai-adjudicated")
    assert labels_are_adjudicated("expert-confirmed")
    assert not labels_are_adjudicated("human-confirmed")
    assert not labels_are_adjudicated("proposed")

    evaluation_path = tmp_path / "evaluation.json"
    proposed = model_selection_fixture(catalog, "proposed")
    evaluation_path.write_text(
        json.dumps(proposed, ensure_ascii=False),
        encoding="utf-8",
    )
    proposal = validate_evaluation_labels(evaluation_path, catalog, require_adjudicated=False)
    assert len(proposal["queries"]) == 30
    with pytest.raises(ValueError, match="not independently adjudicated"):
        validate_evaluation_labels(evaluation_path, catalog, require_adjudicated=True)

    adjudicated = model_selection_fixture(catalog, "ai-adjudicated")
    evaluation_path.write_text(json.dumps(adjudicated, ensure_ascii=False), encoding="utf-8")
    with pytest.raises(ValueError, match="requires an adjudication manifest"):
        validate_evaluation_labels(evaluation_path, catalog, require_adjudicated=True)
    adjudication_path = write_ai_adjudication(tmp_path, catalog, evaluation_path)
    evaluation = validate_evaluation_labels(
        evaluation_path,
        catalog,
        require_adjudicated=True,
        adjudication_path=adjudication_path,
    )
    assert evaluation["adjudication"]["review_count"] == 2


def test_index_serialization_is_byte_reproducible(tmp_path: Path) -> None:
    catalog = extract_catalog(KNOWLEDGE, EQUIVALENCE)
    row_count = len(catalog.methods) + len(catalog.hierarchy_nodes)
    matrix = np.arange(row_count * 3, dtype=np.float32).reshape(row_count, 3)
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    matrix = matrix / np.where(norms == 0, 1, norms)
    inventory = {"files_sha256": "a" * 64}
    first = write_dense_index(
        tmp_path / "first",
        KNOWLEDGE,
        catalog,
        matrix,
        model_id="fixture/model",
        model_revision="b" * 40,
        model_inventory=inventory,
    )
    second = write_dense_index(
        tmp_path / "second",
        KNOWLEDGE,
        catalog,
        matrix,
        model_id="fixture/model",
        model_revision="b" * 40,
        model_inventory=inventory,
    )
    assert first["index_sha256"] == second["index_sha256"]
    for name in ["hmml-embeddings.npy", "embedding-meta.json", "method-index.json"]:
        assert sha256_file(tmp_path / "first" / name) == sha256_file(tmp_path / "second" / name)
    metadata = json.loads((tmp_path / "first" / "embedding-meta.json").read_text(encoding="utf-8"))
    loaded = np.load(tmp_path / "first" / "hmml-embeddings.npy", allow_pickle=False)
    assert loaded.shape == (metadata["embedding_row_count"], metadata["embedding_dimension"])
    assert metadata["method_count"] == 97
    assert metadata["embedding_row_count"] == row_count


def test_hierarchical_scoring_groups_equivalent_aliases_once() -> None:
    catalog = extract_catalog(KNOWLEDGE, EQUIVALENCE)
    index = build_method_index(catalog)
    matrix = np.zeros((len(catalog.methods) + len(catalog.hierarchy_nodes), 2), dtype=np.float32)
    primary = index["methods"][0]
    alias = index["methods"][38]
    matrix[primary["embedding_index"], 0] = 0.2
    matrix[alias["embedding_index"], 0] = 0.8
    node_by_id = {node["node_id"]: node for node in index["hierarchy_nodes"]}
    for node_id in primary["ancestor_node_ids"]:
        matrix[node_by_id[node_id]["embedding_index"], 0] = 0.2
    for node_id in alias["ancestor_node_ids"]:
        matrix[node_by_id[node_id]["embedding_index"], 0] = 0.6
    ranking = rank_hierarchical(index, matrix, np.array([1.0, 0.0], dtype=np.float32))
    linear = [candidate for candidate in ranking if candidate["concept_id"] == "linear-programming"]
    assert len(linear) == 1
    assert linear[0]["method_id"] == "0"
    assert linear[0]["matched_method_id"] == "38"
    assert linear[0]["equivalent_method_ids"] == ["0", "38"]
    assert linear[0]["parent_score"] == pytest.approx(60.0)
    assert linear[0]["leaf_score"] == pytest.approx(80.0)
    assert linear[0]["score"] == pytest.approx(70.0)


def test_model_selection_uses_gte_threshold_inclusively() -> None:
    gte = {"evaluation": {"recall_at_5": 0.80}}
    bge = {"evaluation": {"recall_at_5": 0.83}}
    selected, reason, gap = choose_model(gte, bge, 0.03)
    assert selected is gte
    assert gap <= 0.03
    assert "within" in reason

    bge["evaluation"]["recall_at_5"] = 0.831
    selected, reason, gap = choose_model(gte, bge, 0.03)
    assert selected is bge
    assert gap > 0.03
    assert "exceeds" in reason


def test_metrics_recalculate_from_complete_concept_rankings() -> None:
    evaluation = {
        "label_status": "ai-adjudicated",
        "pairs": [{
            "id": "paired-01",
            "queries": {"zh": "中文", "en": "English"},
            "relevant_concepts": [
                {"concept_id": "primary", "relevance": "primary"},
                {"concept_id": "acceptable", "relevance": "acceptable"},
            ],
            "hard_negatives": [{"concept_id": "negative"}],
        }],
    }
    ranking = [
        {"concept_id": "primary"},
        {"concept_id": "acceptable"},
        {"concept_id": "other"},
        {"concept_id": "other-2"},
        {"concept_id": "other-3"},
        {"concept_id": "negative"},
    ]
    results = {
        "queries": [
            {"query_id": "paired-01-zh", "ranking": ranking},
            {"query_id": "paired-01-en", "ranking": ranking},
        ]
    }
    assert recalculate(evaluation, results) == {
        "query_count": 2,
        "recall_at_5": 1.0,
        "mrr": 1.0,
        "primary_hit_at_5": 1.0,
        "hard_negative_hit_at_5_rate": 0.0,
        "metric_unit": "equivalence-aware method concept",
    }
