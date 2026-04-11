#!/usr/bin/env python3
"""
CLI script for precomputing HMML embeddings using BGE-m3 model.

This script loads HMML knowledge base from hmml.json, extracts all method nodes,
computes embeddings using FlagEmbedding's BGE-m3 model, and saves results as
numpy files for fast runtime retrieval (IDEA.md §5.1).

Usage:
    python3 hmml_precompute_embeddings.py --input hmml.json --output-dir ./knowledge
"""

import argparse
import json
import sys
from pathlib import Path
from typing import List, Tuple


def extract_methods(hmml_data: List[dict]) -> List[Tuple[str, str, str, str]]:
    """
    Extract all methods from HMML hierarchical structure.

    DFS traversal to collect method nodes with their context.

    Args:
        hmml_data: List of top-level domain entries from hmml.json

    Returns:
        List of (domain, subdomain, method_name, text_for_embedding) tuples
    """
    methods = []

    for domain in hmml_data:
        domain_name = domain.get("method_class", "").strip(":")

        for subdomain in domain.get("children", []):
            subdomain_name = subdomain.get("method_class", "").strip(":")

            for method_node in subdomain.get("children", []):
                method_name = method_node.get("method", "")

                if method_name:
                    # Construct text for embedding from method + description
                    method_desc = method_node.get("description", "")

                    # Extract core_idea and application from description if present
                    # Format: <modeling_method>: ... <core_idea>: ... <application>: ...
                    text_parts = [method_name]
                    if method_desc:
                        text_parts.append(method_desc)

                    text_for_embedding = " ".join(text_parts)
                    methods.append((domain_name, subdomain_name, method_name, text_for_embedding))

    return methods


def compute_embeddings(method_texts: List[str], model_name: str = "BAAI/bge-m3") -> Tuple:
    """
    Compute embeddings using BGE-m3 model.

    Args:
        method_texts: List of method text strings
        model_name: HuggingFace model identifier

    Returns:
        Tuple of (embeddings numpy array, embedding_dim)
    """
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        print("Error: sentence-transformers not installed. Install with:")
        print("  pip install -U sentence-transformers")
        sys.exit(1)

    print(f"Loading BGE-m3 model ({model_name})...")
    print("Note: First run will download the model (~2GB) from HuggingFace")

    model = SentenceTransformer(model_name)

    print(f"Computing embeddings for {len(method_texts)} methods...")
    embeddings = model.encode(method_texts, batch_size=12, convert_to_numpy=True)

    embedding_dim = embeddings.shape[1]
    print(f"Embeddings computed: shape={embeddings.shape}, dtype={embeddings.dtype}")

    return embeddings.astype('float32'), embedding_dim


def main() -> int:
    parser = argparse.ArgumentParser(
        description='Precompute HMML embeddings using BGE-m3 model'
    )
    parser.add_argument(
        '--input',
        required=True,
        help='Path to hmml.json file'
    )
    parser.add_argument(
        '--output-dir',
        default='.planning/knowledge',
        help='Output directory for embeddings and meta files'
    )
    parser.add_argument(
        '--model',
        default='BAAI/bge-m3',
        help='HuggingFace model identifier (default: BAAI/bge-m3)'
    )

    args = parser.parse_args()

    # Load HMML data
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: HMML file not found: {input_path}")
        return 1

    print(f"Loading HMML data from {input_path}...")
    with open(input_path, 'r', encoding='utf-8') as f:
        hmml_data = json.load(f)

    # Extract methods
    print("Extracting methods from HMML structure...")
    methods = extract_methods(hmml_data)
    print(f"Found {len(methods)} methods")

    # Prepare texts for embedding
    method_texts = [text for _, _, _, text in methods]
    method_info = [(domain, subdomain, method) for domain, subdomain, method, _ in methods]

    # Compute embeddings
    embeddings, embedding_dim = compute_embeddings(method_texts, args.model)

    # Save embeddings
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    embeddings_path = output_dir / "hmml-embeddings.npy"
    print(f"Saving embeddings to {embeddings_path}...")

    import numpy as np
    np.save(embeddings_path, embeddings)

    # Save embedding meta
    embedding_meta = {
        "method_ids": [f"{i}" for i in range(len(methods))],
        "embedding_dim": embedding_dim,
        "method_count": len(methods),
        "model": args.model
    }

    meta_path = output_dir / "embedding-meta.json"
    print(f"Saving embedding meta to {meta_path}...")

    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(embedding_meta, f, indent=2, ensure_ascii=False)

    # Save method index for retrieval
    method_index = {
        str(i): {
            "domain": domain,
            "subdomain": subdomain,
            "method": method,
            "embedding_index": i
        }
        for i, (domain, subdomain, method) in enumerate(method_info)
    }

    index_path = output_dir / "method-index.json"
    print(f"Saving method index to {index_path}...")

    with open(index_path, 'w', encoding='utf-8') as f:
        json.dump(method_index, f, indent=2, ensure_ascii=False)

    print("\n" + "="*60)
    print("Embedding precomputation complete!")
    print("="*60)
    print(f"Methods processed: {len(methods)}")
    print(f"Embedding dimension: {embedding_dim}")
    print(f"Embeddings file: {embeddings_path}")
    print(f"Meta file: {meta_path}")
    print(f"Index file: {index_path}")

    return 0


if __name__ == '__main__':
    sys.exit(main())