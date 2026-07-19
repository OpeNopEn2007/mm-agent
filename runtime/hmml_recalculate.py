from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path
from typing import Any

from hmml_common import (
    expand_evaluation_queries,
    extract_catalog,
    labels_are_adjudicated,
    read_json,
    sha256_file,
    validate_evaluation_labels,
)


def recalculate(evaluation: dict[str, Any], results: dict[str, Any]) -> dict[str, Any]:
    if not labels_are_adjudicated(evaluation.get("label_status")):
        raise ValueError("evaluation labels are not adjudicated ground truth")
    labels = {query["id"]: query for query in expand_evaluation_queries(evaluation)}
    ranked = {query["query_id"]: query for query in results["queries"]}
    if set(labels) != set(ranked):
        raise ValueError("query results do not cover the evaluation dataset exactly")
    recall_values: list[float] = []
    reciprocal_ranks: list[float] = []
    primary_hits: list[float] = []
    hard_negative_hits: list[float] = []
    for query_id, query in labels.items():
        relevant = {str(label["concept_id"]) for label in query["relevant_concepts"]}
        primary = next(str(label["concept_id"]) for label in query["relevant_concepts"] if label["relevance"] == "primary")
        hard_negatives = {str(item["concept_id"]) for item in query["hard_negatives"]}
        concept_ids = [str(item["concept_id"]) for item in ranked[query_id]["ranking"]]
        top_five = set(concept_ids[:5])
        recall_values.append(len(relevant & top_five) / len(relevant))
        first = next((rank for rank, concept_id in enumerate(concept_ids, 1) if concept_id in relevant), None)
        reciprocal_ranks.append(0.0 if first is None else 1.0 / first)
        primary_hits.append(1.0 if primary in top_five else 0.0)
        hard_negative_hits.append(1.0 if hard_negatives & top_five else 0.0)
    return {
        "query_count": len(labels),
        "recall_at_5": statistics.fmean(recall_values),
        "mrr": statistics.fmean(reciprocal_ranks),
        "primary_hit_at_5": statistics.fmean(primary_hits),
        "hard_negative_hit_at_5_rate": statistics.fmean(hard_negative_hits),
        "metric_unit": "equivalence-aware method concept",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Recalculate Recall@5 and MRR from committed HMML rankings")
    parser.add_argument("--evaluation", required=True, type=Path)
    parser.add_argument("--adjudication", required=True, type=Path)
    parser.add_argument("--knowledge", required=True, type=Path)
    parser.add_argument("--equivalence", required=True, type=Path)
    parser.add_argument("--query-results", required=True, type=Path)
    args = parser.parse_args()
    catalog = extract_catalog(args.knowledge, args.equivalence)
    evaluation = validate_evaluation_labels(
        args.evaluation,
        catalog,
        require_adjudicated=True,
        adjudication_path=args.adjudication,
    )
    results = read_json(args.query_results)
    if results.get("dataset_sha256") != sha256_file(args.evaluation):
        raise ValueError("query results do not match the evaluation file hash")
    print(json.dumps(recalculate(evaluation, results), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
