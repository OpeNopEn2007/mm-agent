from __future__ import annotations

import argparse
import json
from pathlib import Path

from hmml_common import (
    encode_normalized,
    load_embedding_model,
    rank_hierarchical,
    read_json,
    sha256_file,
    sha256_named_hashes,
    snapshot_inventory,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run pinned dense HMML retrieval from a validated local index")
    parser.add_argument("--query", required=True)
    parser.add_argument("--top-k", required=True, type=int)
    parser.add_argument("--knowledge-dir", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--snapshot", required=True, type=Path)
    parser.add_argument("--code-snapshot", type=Path)
    args = parser.parse_args()
    if args.top_k < 1 or args.top_k > 20:
        raise ValueError("top-k must be between 1 and 20")

    manifest = read_json(args.manifest)
    selected = manifest["selected_model"]
    if args.snapshot.resolve().name != selected["revision"]:
        raise ValueError("model snapshot revision does not match runtime manifest")
    model_inventory = snapshot_inventory(args.snapshot.resolve())
    if model_inventory["files_sha256"] != selected["files_sha256"]:
        raise ValueError("model snapshot hash does not match runtime manifest")
    knowledge_dir = args.knowledge_dir.resolve()
    hmml_path = knowledge_dir / "hmml.json"
    index_path = knowledge_dir / "method-index.json"
    embeddings_path = knowledge_dir / "hmml-embeddings.npy"
    meta_path = knowledge_dir / "embedding-meta.json"
    expected = manifest["index"]["files"]
    for name, path in {
        "hmml-embeddings.npy": embeddings_path,
        "embedding-meta.json": meta_path,
        "method-index.json": index_path,
    }.items():
        if sha256_file(path) != expected[name]["sha256"]:
            raise ValueError(f"runtime index hash mismatch: {name}")
    if sha256_file(hmml_path) != manifest["knowledge_source"]["sha256"]:
        raise ValueError("HMML knowledge source hash mismatch")
    combined = sha256_named_hashes((name, expected[name]["sha256"]) for name in expected)
    if combined != manifest["index"]["index_sha256"]:
        raise ValueError("runtime combined index hash mismatch")

    import numpy as np

    method_index = read_json(index_path)
    embeddings = np.load(embeddings_path, allow_pickle=False)
    meta = read_json(meta_path)
    if meta.get("model", {}).get("id") != selected["id"] or meta.get("model", {}).get("revision") != selected["revision"]:
        raise ValueError("embedding metadata model does not match runtime manifest")
    if meta.get("model", {}).get("files_sha256") != selected["files_sha256"]:
        raise ValueError("embedding metadata model hash does not match runtime manifest")
    if embeddings.shape != (meta["embedding_row_count"], meta["embedding_dimension"]):
        raise ValueError("embedding matrix shape does not match metadata")
    if (
        manifest["index"].get("embedding_row_count") != meta.get("embedding_row_count")
        or manifest["index"].get("method_count") != meta.get("method_count")
        or manifest["index"].get("concept_count") != meta.get("concept_count")
        or manifest["knowledge_source"].get("hierarchy_node_count") != meta.get("hierarchy_node_count")
        or manifest["knowledge_source"].get("equivalence_sha256") != meta.get("knowledge_source", {}).get("equivalence_sha256")
        or meta.get("method_index_sha256") != sha256_file(index_path)
        or method_index.get("equivalence", {}).get("sha256") != manifest["knowledge_source"].get("equivalence_sha256")
        or len(method_index.get("methods", [])) != manifest["index"].get("method_count")
        or len(method_index.get("hierarchy_nodes", [])) != manifest["knowledge_source"].get("hierarchy_node_count")
    ):
        raise ValueError("runtime method index, metadata, and manifest are inconsistent")
    code = selected.get("code")
    if code:
        if args.code_snapshot is None or args.code_snapshot.resolve().name != code["revision"]:
            raise ValueError("model code snapshot does not match runtime manifest")
        code_inventory = snapshot_inventory(args.code_snapshot.resolve())
        if code_inventory["files_sha256"] != code["files_sha256"]:
            raise ValueError("model code snapshot hash does not match runtime manifest")
        if meta.get("model", {}).get("code") != {
            "id": code["id"],
            "revision": code["revision"],
            "files_sha256": code["files_sha256"],
        }:
            raise ValueError("embedding metadata model code does not match runtime manifest")
    elif args.code_snapshot is not None:
        raise ValueError("runtime manifest does not declare a model code snapshot")
    model = load_embedding_model(args.snapshot.resolve(), code_snapshot=args.code_snapshot)
    query_embedding = encode_normalized(model, [args.query], batch_size=1)[0]
    if query_embedding.shape[0] != embeddings.shape[1]:
        raise ValueError("query embedding dimension does not match index")
    candidates = rank_hierarchical(method_index, embeddings, query_embedding)[: args.top_k]
    print(json.dumps({"candidates": candidates}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
