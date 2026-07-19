from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from hmml_common import snapshot_inventory, write_json


ALLOW_PATTERNS = [
    "*.json",
    "*.safetensors",
    "*.model",
    "*.txt",
    "*.py",
    "1_Pooling/*",
]

IGNORE_PATTERNS = [
    "onnx/*",
    "images/*",
    "imgs/*",
    "*.bin",
    "*.pt",
    "*.jpg",
    "*.jpeg",
    "*.png",
    "*.pdf",
]


def main() -> int:
    parser = argparse.ArgumentParser(description="Download one pinned HMML embedding model into the MM-Agent cache")
    parser.add_argument("--model", required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--cache-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--max-workers", type=int, default=4)
    args = parser.parse_args()

    cache_root = args.cache_root.resolve()
    hub_cache = cache_root / "huggingface" / "hub"
    hub_cache.mkdir(parents=True, exist_ok=True)
    os.environ["HF_HOME"] = str(cache_root / "huggingface")
    os.environ["HF_HUB_CACHE"] = str(hub_cache)
    from huggingface_hub import snapshot_download

    snapshot = Path(snapshot_download(
        repo_id=args.model,
        revision=args.revision,
        cache_dir=hub_cache,
        allow_patterns=ALLOW_PATTERNS,
        ignore_patterns=IGNORE_PATTERNS,
        max_workers=args.max_workers,
    )).resolve()
    if snapshot.name != args.revision:
        raise RuntimeError(f"resolved snapshot {snapshot.name} does not match pinned revision {args.revision}")
    inventory = snapshot_inventory(snapshot)
    result = {
        "schema_version": 1,
        "model": args.model,
        "revision": args.revision,
        "snapshot": str(snapshot),
        "cache_root": str(cache_root),
        "allow_patterns": ALLOW_PATTERNS,
        "ignore_patterns": IGNORE_PATTERNS,
        "max_workers": args.max_workers,
        **inventory,
    }
    write_json(args.output, result)
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
