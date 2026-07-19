from __future__ import annotations

import argparse
import json
import os
import shutil
from pathlib import Path
from typing import Any

from hmml_common import (
    extract_catalog,
    expand_evaluation_queries,
    read_json,
    sha256_file,
    sha256_named_hashes,
    validate_evaluation_labels,
    write_json,
)


GTE_ID = "Alibaba-NLP/gte-multilingual-base"
BGE_ID = "BAAI/bge-m3"


def choose_model(gte: dict[str, Any], bge: dict[str, Any], threshold: float) -> tuple[dict[str, Any], str, float]:
    best_recall = max(gte["evaluation"]["recall_at_5"], bge["evaluation"]["recall_at_5"])
    gte_gap = best_recall - gte["evaluation"]["recall_at_5"]
    selected = gte if gte_gap <= threshold else bge
    reason = (
        f"GTE Recall@5 gap {gte_gap:.6f} is within the {threshold:.6f} threshold"
        if selected is gte
        else f"GTE Recall@5 gap {gte_gap:.6f} exceeds the {threshold:.6f} threshold"
    )
    return selected, reason, gte_gap


def copy_atomic(source: Path, target: Path) -> None:
    temporary = target.with_name(f".{target.name}.tmp-{os.getpid()}")
    try:
        shutil.copyfile(source, temporary)
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def report_map(report: dict[str, Any]) -> dict[str, Any]:
    return {
        "model": report["model"]["id"],
        "revision": report["model"]["revision"],
        "recall_at_5": report["evaluation"]["recall_at_5"],
        "mrr": report["evaluation"]["mrr"],
        "cold_start_ms": report["performance"]["cold_start_ms"],
        "disk_size_bytes": report["model"]["disk_size_bytes"],
        "query_latency_ms": report["performance"]["query_latency_ms"],
        "embedding_dimension": report["model"]["embedding_dimension"],
        "index_sha256": report["index"]["index_sha256"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Select and publish the single HMML embedding runtime")
    parser.add_argument("--gte-report", type=Path, required=True)
    parser.add_argument("--bge-report", type=Path, required=True)
    parser.add_argument("--gte-index-dir", type=Path, required=True)
    parser.add_argument("--bge-index-dir", type=Path, required=True)
    parser.add_argument("--evaluation", type=Path, required=True)
    parser.add_argument("--adjudication", type=Path, required=True)
    parser.add_argument("--knowledge", type=Path, required=True)
    parser.add_argument("--equivalence", type=Path, required=True)
    parser.add_argument("--knowledge-dir", type=Path, required=True)
    parser.add_argument("--summary", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args()

    gte = read_json(args.gte_report)
    bge = read_json(args.bge_report)
    if gte["model"]["id"] != GTE_ID or bge["model"]["id"] != BGE_ID:
        raise ValueError("selection reports do not match the required model pair")
    if gte["evaluation"]["dataset_sha256"] != bge["evaluation"]["dataset_sha256"]:
        raise ValueError("model reports use different evaluation datasets")
    if (
        gte["evaluation"].get("content_sha256") != bge["evaluation"].get("content_sha256")
        or gte["evaluation"].get("adjudication_sha256") != bge["evaluation"].get("adjudication_sha256")
        or gte.get("knowledge_source") != bge.get("knowledge_source")
    ):
        raise ValueError("model reports use different knowledge or adjudication evidence")
    catalog = extract_catalog(args.knowledge, args.equivalence)
    evaluation = validate_evaluation_labels(
        args.evaluation,
        catalog,
        require_adjudicated=True,
        adjudication_path=args.adjudication,
    )
    if sha256_file(args.evaluation) != gte["evaluation"]["dataset_sha256"]:
        raise ValueError("evaluation dataset changed after benchmarking")
    if (
        evaluation["content_sha256"] != gte["evaluation"].get("content_sha256")
        or sha256_file(args.adjudication) != gte["evaluation"].get("adjudication_sha256")
    ):
        raise ValueError("adjudication evidence changed after benchmarking")
    expanded_queries = expand_evaluation_queries(evaluation)

    threshold = 0.03
    selected, reason, gte_gap = choose_model(gte, bge, threshold)
    source_index = args.gte_index_dir if selected is gte else args.bge_index_dir
    knowledge_dir = args.knowledge_dir.resolve()
    knowledge_dir.mkdir(parents=True, exist_ok=True)
    for name in ["hmml-embeddings.npy", "embedding-meta.json", "method-index.json"]:
        source = source_index / name
        expected = selected["index"]["files"][name]["sha256"]
        if sha256_file(source) != expected:
            raise ValueError(f"selected candidate index changed: {name}")
        copy_atomic(source, knowledge_dir / name)

    published_files = {
        name: {
            "path": f"knowledge/hmml/{name}",
            "size_bytes": (knowledge_dir / name).stat().st_size,
            "sha256": sha256_file(knowledge_dir / name),
        }
        for name in ["hmml-embeddings.npy", "embedding-meta.json", "method-index.json"]
    }
    published_hash = sha256_named_hashes((name, info["sha256"]) for name, info in published_files.items())
    if published_hash != selected["index"]["index_sha256"]:
        raise ValueError("published index tuple does not match selected candidate")

    summary = {
        "schema_version": 1,
        "dataset": {
            "path": "runtime/evaluation/hmml-eval.json",
            "sha256": sha256_file(args.evaluation),
            "label_status": evaluation["label_status"],
            "content_sha256": evaluation["content_sha256"],
            "adjudication_sha256": sha256_file(args.adjudication),
            "query_count": len(expanded_queries),
            "pair_count": len(evaluation["pairs"]),
        },
        "selection_policy": {
            "primary_metric": "recall_at_5",
            "gte_max_gap": threshold,
            "rule": "choose GTE when its Recall@5 is within 3 percentage points of the best result; otherwise choose BGE-M3",
        },
        "models": [report_map(gte), report_map(bge)],
        "selected_model": selected["model"]["id"],
        "reason": reason,
    }
    write_json(args.summary, summary)
    model_id = selected["model"]["id"]
    revision = selected["model"]["revision"]
    manifest = {
        "schema_version": 1,
        "knowledge_source": selected["knowledge_source"],
        "selected_model": {
            "id": model_id,
            "revision": revision,
            "files_sha256": selected["model"]["snapshot_files_sha256"],
            "files": selected["model"]["snapshot_files"],
            "snapshot_size_bytes": selected["model"]["snapshot_size_bytes"],
            "embedding_dimension": selected["model"]["embedding_dimension"],
            "cache_subdir": f"huggingface/hub/models--{model_id.replace('/', '--')}/snapshots/{revision}",
        },
        "index": {
            "index_sha256": published_hash,
            "method_count": selected["knowledge_source"]["method_count"],
            "concept_count": selected["knowledge_source"]["concept_count"],
            "embedding_row_count": selected["index"]["embedding_row_count"],
            "files": published_files,
        },
        "evaluation": {
            "dataset_path": "runtime/evaluation/hmml-eval.json",
            "dataset_sha256": sha256_file(args.evaluation),
            "content_sha256": evaluation["content_sha256"],
            "adjudication_path": "runtime/evaluation/hmml-adjudication.json",
            "adjudication_sha256": sha256_file(args.adjudication),
            "summary_path": "runtime/evaluation/summary.json",
            "summary_sha256": sha256_file(args.summary),
            "gte_report_path": "runtime/evaluation/results/gte-multilingual-base/model-report.json",
            "gte_report_sha256": sha256_file(args.gte_report),
            "bge_report_path": "runtime/evaluation/results/bge-m3/model-report.json",
            "bge_report_sha256": sha256_file(args.bge_report),
        },
        "fallback": {
            "mode": "bm25",
            "requires_model_cache": False,
        },
    }
    code = selected["model"].get("code")
    if code:
        manifest["selected_model"]["code"] = {
            "id": code["id"],
            "revision": code["revision"],
            "files_sha256": code["snapshot_files_sha256"],
            "files": code["snapshot_files"],
            "snapshot_size_bytes": code["snapshot_size_bytes"],
            "cache_subdir": f"huggingface/hub/models--{code['id'].replace('/', '--')}/snapshots/{code['revision']}",
        }
    write_json(args.manifest, manifest)
    print(json.dumps({"selected_model": model_id, "reason": reason, "index_sha256": published_hash}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
