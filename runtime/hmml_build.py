from __future__ import annotations

import argparse
import json
from pathlib import Path

from hmml_common import (
    encode_normalized,
    catalog_embedding_texts,
    extract_catalog,
    load_embedding_model,
    sha256_file,
    snapshot_inventory,
    write_dense_index,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build one pinned HMML dense index")
    parser.add_argument("--model", required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--code-revision")
    parser.add_argument("--code-snapshot", type=Path)
    parser.add_argument("--knowledge", type=Path, required=True)
    parser.add_argument("--equivalence", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
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
    inventory = snapshot_inventory(snapshot)
    code_inventory = snapshot_inventory(args.code_snapshot.resolve()) if args.code_snapshot else None
    model = load_embedding_model(snapshot, code_snapshot=args.code_snapshot)
    embeddings = encode_normalized(model, catalog_embedding_texts(catalog), batch_size=args.batch_size)
    result = write_dense_index(
        args.output_dir.resolve(),
        args.knowledge,
        catalog,
        embeddings,
        model_id=args.model,
        model_revision=args.revision,
        model_inventory=inventory,
        code_revision=args.code_revision,
        code_inventory=code_inventory,
    )
    print(json.dumps({
        "model": args.model,
        "revision": args.revision,
        "knowledge_sha256": sha256_file(args.knowledge),
        "model_files_sha256": inventory["files_sha256"],
        **result,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
