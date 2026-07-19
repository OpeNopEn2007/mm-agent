from __future__ import annotations

import argparse
import json
import platform
import statistics
import sys
import time
from pathlib import Path
from typing import Any

from hmml_common import (
    build_method_index,
    catalog_embedding_texts,
    encode_normalized,
    extract_catalog,
    load_embedding_model,
    rank_hierarchical,
    read_json,
    sha256_file,
    snapshot_inventory,
    validate_evaluation_labels,
    write_dense_index,
    write_json,
)


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    if not ordered:
        raise ValueError("cannot compute percentile of empty values")
    position = (len(ordered) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a reproducible HMML dense retrieval benchmark")
    parser.add_argument("--model", required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--code-revision")
    parser.add_argument("--code-snapshot", type=Path)
    parser.add_argument("--knowledge", type=Path, required=True)
    parser.add_argument("--equivalence", type=Path, required=True)
    parser.add_argument("--evaluation", type=Path, required=True)
    parser.add_argument("--adjudication", type=Path, required=True)
    parser.add_argument("--candidate-index-dir", type=Path, required=True)
    parser.add_argument("--evidence-dir", type=Path, required=True)
    parser.add_argument("--batch-size", type=int, default=16)
    args = parser.parse_args()

    snapshot = args.snapshot.resolve()
    if snapshot.name != args.revision:
        raise ValueError("model snapshot does not match pinned revision")
    if bool(args.code_revision) != bool(args.code_snapshot):
        raise ValueError("code revision and snapshot must be supplied together")
    if args.code_snapshot and args.code_snapshot.resolve().name != args.code_revision:
        raise ValueError("model code snapshot does not match pinned revision")
    catalog = extract_catalog(args.knowledge, args.equivalence)
    evaluation = validate_evaluation_labels(
        args.evaluation,
        catalog,
        require_adjudicated=True,
        adjudication_path=args.adjudication,
    )
    queries: list[dict[str, Any]] = evaluation["queries"]
    inventory = snapshot_inventory(snapshot)
    code_inventory = snapshot_inventory(args.code_snapshot.resolve()) if args.code_snapshot else None

    cold_start_begin = time.perf_counter_ns()
    model = load_embedding_model(snapshot, code_snapshot=args.code_snapshot)
    encode_normalized(model, [queries[0]["query"]], batch_size=1)
    cold_start_ms = (time.perf_counter_ns() - cold_start_begin) / 1_000_000

    index_embeddings = encode_normalized(model, catalog_embedding_texts(catalog), batch_size=args.batch_size)
    index_data = build_method_index(catalog)
    index_dir = args.candidate_index_dir.resolve()
    evidence_dir = args.evidence_dir.resolve()
    if index_dir == evidence_dir or index_dir in evidence_dir.parents or evidence_dir in index_dir.parents:
        raise ValueError("candidate index and committed evidence directories must not overlap")
    index_info = write_dense_index(
        index_dir,
        args.knowledge,
        catalog,
        index_embeddings,
        model_id=args.model,
        model_revision=args.revision,
        model_inventory=inventory,
        code_revision=args.code_revision,
        code_inventory=code_inventory,
    )

    import numpy as np
    import torch
    import transformers

    per_query: list[dict[str, Any]] = []
    latencies: list[float] = []
    recall_values: list[float] = []
    reciprocal_ranks: list[float] = []
    primary_hits: list[float] = []
    hard_negative_hits: list[float] = []
    for index, query in enumerate(queries):
        started = time.perf_counter_ns()
        query_embedding = encode_normalized(model, [query["query"]], batch_size=1)[0]
        ranking = rank_hierarchical(index_data, index_embeddings, query_embedding)
        latency_ms = (time.perf_counter_ns() - started) / 1_000_000
        latencies.append(latency_ms)
        relevant = {str(label["concept_id"]) for label in query["relevant_concepts"]}
        primary = next(str(label["concept_id"]) for label in query["relevant_concepts"] if label["relevance"] == "primary")
        hard_negatives = {str(item["concept_id"]) for item in query["hard_negatives"]}
        top_five = {item["concept_id"] for item in ranking[:5]}
        recall = len(relevant & top_five) / len(relevant)
        first_rank = next((rank for rank, item in enumerate(ranking, 1) if item["concept_id"] in relevant), None)
        reciprocal_rank = 0.0 if first_rank is None else 1.0 / first_rank
        primary_hit = 1.0 if primary in top_five else 0.0
        negative_hit = 1.0 if hard_negatives & top_five else 0.0
        recall_values.append(recall)
        reciprocal_ranks.append(reciprocal_rank)
        primary_hits.append(primary_hit)
        hard_negative_hits.append(negative_hit)
        per_query.append({
            "query_id": query["id"],
            "pair_id": query["pair_id"],
            "language": query["language"],
            "query": query["query"],
            "relevant_concept_ids": sorted(relevant),
            "primary_concept_id": primary,
            "hard_negative_concept_ids": sorted(hard_negatives),
            "recall_at_5": recall,
            "reciprocal_rank": reciprocal_rank,
            "first_relevant_rank": first_rank,
            "primary_hit_at_5": bool(primary_hit),
            "hard_negative_hit_at_5": bool(negative_hit),
            "latency_ms": latency_ms,
            "ranking": ranking,
        })

    query_results = {
        "schema_version": 1,
        "dataset_id": evaluation["dataset_id"],
        "dataset_sha256": sha256_file(args.evaluation),
        "evaluation_content_sha256": evaluation["content_sha256"],
        "adjudication_sha256": sha256_file(args.adjudication),
        "label_status": evaluation["label_status"],
        "model": {"id": args.model, "revision": args.revision, "files_sha256": inventory["files_sha256"]},
        "index_sha256": index_info["index_sha256"],
        "queries": per_query,
    }
    evidence_dir.mkdir(parents=True, exist_ok=True)
    query_results_path = evidence_dir / "query-results.json"
    report_index = {
        **index_info,
        "files": {
            name: {**info, "path": f"candidate-index/{name}"}
            for name, info in index_info["files"].items()
        },
    }
    report = {
        "schema_version": 1,
        "model": {
            "id": args.model,
            "revision": args.revision,
            "embedding_dimension": index_info["embedding_dimension"],
            "snapshot_file_count": inventory["file_count"],
            "snapshot_size_bytes": inventory["size_bytes"],
            "snapshot_files_sha256": inventory["files_sha256"],
            "snapshot_files": inventory["files"],
            "disk_size_bytes": inventory["size_bytes"] + (code_inventory["size_bytes"] if code_inventory else 0),
        },
        "knowledge_source": {
            "path": "knowledge/hmml/hmml.json",
            "sha256": sha256_file(args.knowledge),
            "method_count": len(catalog.methods),
            "concept_count": len({method.concept_id for method in catalog.methods}),
            "hierarchy_node_count": len(catalog.hierarchy_nodes),
            "equivalence_sha256": catalog.equivalence_sha256,
            "extraction": "recursive-depth-first",
        },
        "evaluation": {
            "dataset_id": evaluation["dataset_id"],
            "dataset_sha256": sha256_file(args.evaluation),
            "content_sha256": evaluation["content_sha256"],
            "adjudication_sha256": sha256_file(args.adjudication),
            "adjudication_review_count": evaluation["adjudication"]["review_count"],
            "query_count": len(queries),
            "pair_count": len({query["pair_id"] for query in queries}),
            "covered_concept_count": len({label["concept_id"] for query in queries for label in query["relevant_concepts"]}),
            "label_status": evaluation["label_status"],
            "recall_at_5": statistics.fmean(recall_values),
            "mrr": statistics.fmean(reciprocal_ranks),
            "primary_hit_at_5": statistics.fmean(primary_hits),
            "hard_negative_hit_at_5_rate": statistics.fmean(hard_negative_hits),
            "metric_unit": "equivalence-aware method concept",
        },
        "performance": {
            "cold_start_ms": cold_start_ms,
            "query_latency_ms": {
                "mean": statistics.fmean(latencies),
                "median": statistics.median(latencies),
                "p95": percentile(latencies, 0.95),
                "minimum": min(latencies),
                "maximum": max(latencies),
            },
        },
        "index": report_index,
        "raw_query_results": "query-results.json",
        "environment": {
            "python": sys.version,
            "platform": platform.platform(),
            "numpy": np.__version__,
            "torch": torch.__version__,
            "transformers": transformers.__version__,
            "device": "cpu",
        },
    }
    if args.code_revision and code_inventory:
        code = {
            "id": "Alibaba-NLP/new-impl",
            "revision": args.code_revision,
            "snapshot_file_count": code_inventory["file_count"],
            "snapshot_size_bytes": code_inventory["size_bytes"],
            "snapshot_files_sha256": code_inventory["files_sha256"],
            "snapshot_files": code_inventory["files"],
        }
        query_results["model"]["code"] = code
        report["model"]["code"] = code
    write_json(query_results_path, query_results)
    report_path = evidence_dir / "model-report.json"
    write_json(report_path, report)
    print(json.dumps({
        "model": args.model,
        "revision": args.revision,
        "recall_at_5": report["evaluation"]["recall_at_5"],
        "mrr": report["evaluation"]["mrr"],
        "cold_start_ms": cold_start_ms,
        "snapshot_size_bytes": inventory["size_bytes"],
        "query_latency_mean_ms": report["performance"]["query_latency_ms"]["mean"],
        "index_sha256": index_info["index_sha256"],
        "report": str(report_path),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
