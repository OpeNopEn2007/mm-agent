from __future__ import annotations

import argparse
import json
from pathlib import Path

from hmml_common import (
    audit_initial_reviews,
    evaluation_content_sha256,
    extract_catalog,
    read_json,
    sha256_file,
    validate_evaluation_labels,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare or validate HMML independent label adjudication")
    parser.add_argument("action", choices=("prepare", "audit", "validate"))
    parser.add_argument("--knowledge", type=Path, required=True)
    parser.add_argument("--equivalence", type=Path, required=True)
    parser.add_argument("--evaluation", type=Path, required=True)
    parser.add_argument("--adjudication", type=Path, required=True)
    args = parser.parse_args()

    catalog = extract_catalog(args.knowledge, args.equivalence)
    evaluation = validate_evaluation_labels(
        args.evaluation,
        catalog,
        require_adjudicated=args.action == "validate",
        adjudication_path=args.adjudication if args.action == "validate" else None,
    )
    if args.action == "prepare":
        print(json.dumps({
            "status": evaluation["label_status"],
            "evaluation_file_sha256": sha256_file(args.evaluation),
            "evaluation_content_sha256": evaluation_content_sha256(evaluation),
            "knowledge_sha256": catalog.knowledge_sha256,
            "equivalence_sha256": catalog.equivalence_sha256,
            "pair_count": len(evaluation["pairs"]),
            "query_count": len(evaluation["queries"]),
            "query_ids": [query["id"] for query in evaluation["queries"]],
            "equivalence_concept_ids": [group["concept_id"] for group in catalog.equivalence_groups],
        }, ensure_ascii=False, indent=2))
        return 0
    if args.action == "audit":
        print(json.dumps(audit_initial_reviews(args.adjudication, evaluation, catalog), ensure_ascii=False))
        return 0
    print(json.dumps({
        "status": evaluation["label_status"],
        "evaluation_content_sha256": evaluation["content_sha256"],
        "review_count": evaluation["adjudication"]["review_count"],
        "dispute_count": len(evaluation["adjudication"]["disputes"]),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
