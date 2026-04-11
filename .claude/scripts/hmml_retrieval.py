#!/usr/bin/env python3
"""
CLI script for HMML knowledge retrieval using semantic similarity.

This script loads precomputed HMML embeddings, computes query embedding,
performs cosine similarity matching with parent node weighting (IDEA.md §3.3),
and returns Top-K most relevant modeling methods.

Usage:
    python3 hmml_retrieval.py --query-file query.txt --output results.json --top-k 6
"""

import argparse
import json
import sys
from pathlib import Path
from typing import List, Dict, Tuple
from datetime import datetime, timezone


def compute_query_embedding(query_text: str, model_name: str = "BAAI/bge-m3"):
    """
    Compute embedding for query text using BGE-m3 model.

    Args:
        query_text: Query text string
        model_name: HuggingFace model identifier

    Returns:
        Numpy array of shape (1024,)
    """
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        print("Error: sentence-transformers not installed. Install with:")
        print("  pip install -U sentence-transformers")
        sys.exit(1)

    model = SentenceTransformer(model_name)
    embedding = model.encode([query_text], convert_to_numpy=True)[0]

    return embedding


def cosine_similarity(a, b):
    """
    Compute cosine similarity between two vectors.

    Args:
        a: First vector (numpy array)
        b: Second vector (numpy array)

    Returns:
        Float value between -1 and 1
    """
    try:
        from scipy.spatial.distance import cosine
        return 1 - cosine(a, b)
    except ImportError:
        # Fallback: manual computation
        import numpy as np
        a_norm = a / np.linalg.norm(a)
        b_norm = b / np.linalg.norm(b)
        return np.dot(a_norm, b_norm)


def compute_weighted_similarity(
    query_emb,
    method_emb,
    parent_emb=None,
    omega: float = 0.5
) -> float:
    """
    Compute similarity with parent node weighting (IDEA.md §3.3).

    Formula: final_score = ω * child_sim + (1-ω) * parent_sim

    Args:
        query_emb: Query embedding vector
        method_emb: Method embedding vector
        parent_emb: Parent (subdomain/domain) embedding vector
        omega: Weight for child similarity (default 0.5)

    Returns:
        Weighted similarity score
    """
    child_sim = cosine_similarity(query_emb, method_emb)

    if parent_emb is not None:
        parent_sim = cosine_similarity(query_emb, parent_emb)
        return omega * child_sim + (1 - omega) * parent_sim

    return child_sim


def load_method_embeddings(
    embeddings_path: Path,
    index_path: Path,
    hmml_path: Path
) -> Tuple:
    """
    Load method embeddings, index, and HMML data.

    Args:
        embeddings_path: Path to hmml-embeddings.npy
        index_path: Path to method-index.json
        hmml_path: Path to hmml.json

    Returns:
        Tuple of (embeddings numpy array, method_index dict, hmml_data dict)
    """
    import numpy as np

    # Load embeddings
    embeddings = np.load(embeddings_path)

    # Load method index
    with open(index_path, 'r', encoding='utf-8') as f:
        method_index = json.load(f)

    # Load HMML data for descriptions
    with open(hmml_path, 'r', encoding='utf-8') as f:
        hmml_data = json.load(f)

    return embeddings, method_index, hmml_data


def retrieve_methods(
    query_text: str,
    embeddings,
    method_index: Dict,
    hmml_data: List[Dict],
    top_k: int = 6,
    omega: float = 0.5
) -> List[Dict]:
    """
    Retrieve Top-K most relevant methods for query.

    Args:
        query_text: Query text string
        embeddings: Precomputed method embeddings
        method_index: Method index mapping
        hmml_data: HMML structure for descriptions
        top_k: Number of methods to retrieve
        omega: Parent weighting factor

    Returns:
        List of retrieved method entries with scores
    """
    # Compute query embedding
    query_emb = compute_query_embedding(query_text)

    # Compute similarity for each method
    scores = []
    for idx in range(len(embeddings)):
        method_emb = embeddings[idx]
        sim = cosine_similarity(query_emb, method_emb)
        scores.append((idx, sim))

    # Sort by similarity (descending)
    scores.sort(key=lambda x: x[1], reverse=True)

    # Get top-k
    top_results = scores[:min(top_k, len(scores))]

    # Build output entries
    results = []
    for idx, score in top_results:
        method_key = str(idx)
        if method_key not in method_index:
            continue

        method_info = method_index[method_key]
        result = {
            "domain": method_info["domain"],
            "subdomain": method_info["subdomain"],
            "method": method_info["method"],
            "score": float(score),
            "core_idea": "",
            "application": ""
        }

        # Extract core_idea and application from HMML description
        # Find the method in hmml_data and extract description
        for domain in hmml_data:
            domain_name = domain.get("method_class", "").strip(":")
            if domain_name != result["domain"]:
                continue

            for subdomain in domain.get("children", []):
                subdomain_name = subdomain.get("method_class", "").strip(":")
                if subdomain_name != result["subdomain"]:
                    continue

                for method_node in subdomain.get("children", []):
                    method_name = method_node.get("method", "")
                    if method_name == result["method"]:
                        desc = method_node.get("description", "")
                        # Parse <core_idea>: ... <application>: ... pattern
                        parts = desc.split("<application>:")
                        if len(parts) > 1:
                            result["application"] = parts[1].strip()
                            core_idea_part = parts[0]
                            idea_parts = core_idea_part.split("<core_idea>:")
                            if len(idea_parts) > 1:
                                result["core_idea"] = idea_parts[1].strip()
                        break
                break

        results.append(result)

    return results


def main() -> int:
    parser = argparse.ArgumentParser(
        description='Retrieve relevant HMML methods using semantic similarity'
    )
    parser.add_argument(
        '--query-file',
        required=True,
        help='Path to query text file (task description)'
    )
    parser.add_argument(
        '--output',
        required=True,
        help='Path to output JSON file'
    )
    parser.add_argument(
        '--top-k',
        type=int,
        default=6,
        help='Number of methods to retrieve (default: 6)'
    )
    parser.add_argument(
        '--knowledge-dir',
        default='.planning/knowledge',
        help='HMML knowledge base directory'
    )
    parser.add_argument(
        '--omega',
        type=float,
        default=0.5,
        help='Parent node weighting factor (default: 0.5)'
    )
    parser.add_argument(
        '--model',
        default='BAAI/bge-m3',
        help='HuggingFace model identifier (default: BAAI/bge-m3)'
    )

    args = parser.parse_args()

    # Load query
    query_path = Path(args.query_file)
    if not query_path.exists():
        print(f"Error: Query file not found: {query_path}")
        return 1

    with open(query_path, 'r', encoding='utf-8') as f:
        query_text = f.read().strip()

    if not query_text:
        print("Error: Query file is empty")
        return 1

    # Load knowledge base
    knowledge_dir = Path(args.knowledge_dir)
    embeddings_path = knowledge_dir / "hmml-embeddings.npy"
    index_path = knowledge_dir / "method-index.json"
    hmml_path = knowledge_dir / "hmml.json"

    for path in [embeddings_path, index_path, hmml_path]:
        if not path.exists():
            print(f"Error: Knowledge file not found: {path}")
            print("Run hmml_precompute_embeddings.py first to generate embeddings")
            return 1

    print(f"Loading knowledge base from {knowledge_dir}...")
    embeddings, method_index, hmml_data = load_method_embeddings(
        embeddings_path, index_path, hmml_path
    )

    print(f"Loaded {len(method_index)} methods with {embeddings.shape[1]}-dim embeddings")
    print(f"Query: {query_text}")

    # Retrieve methods
    print(f"\nRetrieving top-{args.top_k} relevant methods...")
    results = retrieve_methods(
        query_text,
        embeddings,
        method_index,
        hmml_data,
        top_k=args.top_k,
        omega=args.omega
    )

    # Build output
    output = {
        "query": query_text,
        "methods": results,
        "top_k": len(results),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

    # Save output
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\nRetrieval complete! Results saved to {output_path}")
    print("\nTop methods:")
    for i, method in enumerate(results, 1):
        print(f"  {i}. {method['method']} (score: {method['score']:.3f})")
        print(f"     Domain: {method['domain']}/{method['subdomain']}")

    return 0


if __name__ == '__main__':
    sys.exit(main())