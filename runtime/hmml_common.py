from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import sys
import types
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


FINAL_LABEL_STATUSES = {"ai-adjudicated", "expert-confirmed"}


def labels_are_adjudicated(status: Any) -> bool:
    return status in FINAL_LABEL_STATUSES


@dataclass(frozen=True)
class Method:
    method_id: str
    method: str
    hierarchy: tuple[str, ...]
    ancestor_node_ids: tuple[str, ...]
    description: str
    embedding_text: str
    concept_id: str
    primary_method_id: str
    equivalent_method_ids: tuple[str, ...]


@dataclass(frozen=True)
class HierarchyNode:
    node_id: str
    name: str
    parent_node_id: str | None
    description: str
    embedding_text: str


@dataclass(frozen=True)
class Catalog:
    methods: tuple[Method, ...]
    hierarchy_nodes: tuple[HierarchyNode, ...]
    knowledge_sha256: str
    equivalence_sha256: str
    equivalence_groups: tuple[dict[str, Any], ...]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_named_hashes(items: Iterable[tuple[str, str]]) -> str:
    digest = hashlib.sha256()
    for name, value in sorted(items):
        digest.update(name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(value.encode("ascii"))
        digest.update(b"\n")
    return digest.hexdigest()


def snapshot_inventory(snapshot: Path) -> dict[str, Any]:
    files: list[dict[str, Any]] = []
    for path in sorted(
        (
            item for item in snapshot.rglob("*")
            if item.is_file() and "__pycache__" not in item.parts and item.suffix != ".pyc"
        ),
        key=lambda item: item.as_posix(),
    ):
        relative = path.relative_to(snapshot).as_posix()
        files.append({
            "path": relative,
            "size_bytes": path.stat().st_size,
            "sha256": sha256_file(path),
        })
    return {
        "file_count": len(files),
        "size_bytes": sum(item["size_bytes"] for item in files),
        "files_sha256": sha256_named_hashes((item["path"], item["sha256"]) for item in files),
        "files": files,
    }


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp-{os.getpid()}")
    try:
        temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def _clean_class(value: str) -> str:
    return value.strip().rstrip(":：").strip()


def extract_catalog(hmml_path: Path, equivalence_path: Path) -> Catalog:
    data = read_json(hmml_path)
    equivalence = read_json(equivalence_path)
    if equivalence.get("schema_version") != 1 or equivalence.get("review_status") not in {"proposed", *FINAL_LABEL_STATUSES}:
        raise ValueError("unsupported HMML equivalence catalog governance")
    if equivalence.get("knowledge_source", {}).get("sha256") != sha256_file(hmml_path):
        raise ValueError("HMML equivalence catalog does not match the knowledge source")
    raw: list[tuple[str, tuple[str, ...], tuple[str, ...], str]] = []
    hierarchy_nodes: list[HierarchyNode] = []

    def walk(node: Any, hierarchy: tuple[str, ...], ancestor_ids: tuple[str, ...]) -> None:
        if isinstance(node, list):
            for child in node:
                walk(child, hierarchy, ancestor_ids)
            return
        if not isinstance(node, dict):
            return
        current = hierarchy
        current_ids = ancestor_ids
        method_class = node.get("method_class")
        if isinstance(method_class, str) and _clean_class(method_class):
            name = _clean_class(method_class)
            node_id = f"h{len(hierarchy_nodes)}"
            description = node.get("description")
            clean_description = description.strip() if isinstance(description, str) else ""
            hierarchy_nodes.append(HierarchyNode(
                node_id=node_id,
                name=name,
                parent_node_id=ancestor_ids[-1] if ancestor_ids else None,
                description=clean_description,
                embedding_text=f"{name}: {clean_description}".strip(),
            ))
            current = (*hierarchy, name)
            current_ids = (*ancestor_ids, node_id)
        method = node.get("method")
        if isinstance(method, str) and method.strip():
            description = node.get("description")
            clean_description = description.strip() if isinstance(description, str) else ""
            raw.append((method.strip(), current, current_ids, clean_description))
        walk(node.get("children", []), current, current_ids)

    walk(data, (), ())
    catalog_ids = {str(index) for index in range(len(raw))}
    group_by_method: dict[str, dict[str, Any]] = {}
    groups: list[dict[str, Any]] = []
    for group in equivalence.get("groups", []):
        identifiers = tuple(str(value) for value in group.get("equivalent_method_ids", []))
        primary = str(group.get("primary_method_id"))
        concept_id = str(group.get("concept_id"))
        if len(identifiers) < 2 or primary not in identifiers or not set(identifiers).issubset(catalog_ids):
            raise ValueError(f"invalid HMML equivalence group: {concept_id}")
        if any(method_id in group_by_method for method_id in identifiers):
            raise ValueError(f"overlapping HMML equivalence group: {concept_id}")
        normalized = {
            "concept_id": concept_id,
            "primary_method_id": primary,
            "equivalent_method_ids": list(identifiers),
            "rationale": str(group.get("rationale", "")),
        }
        groups.append(normalized)
        for method_id in identifiers:
            group_by_method[method_id] = normalized
    seen: set[str] = set()
    result: list[Method] = []
    for index, (name, hierarchy, ancestor_ids, description) in enumerate(raw):
        if name in seen:
            raise ValueError(f"duplicate HMML method name: {name}")
        seen.add(name)
        method_id = str(index)
        group = group_by_method.get(method_id)
        concept_id = str(group["concept_id"]) if group else f"method-{method_id}"
        primary_method_id = str(group["primary_method_id"]) if group else method_id
        equivalent_ids = tuple(str(value) for value in group["equivalent_method_ids"]) if group else (method_id,)
        text = f"{name}: {description}".strip()
        result.append(Method(
            method_id,
            name,
            hierarchy,
            ancestor_ids,
            description,
            text,
            concept_id,
            primary_method_id,
            equivalent_ids,
        ))
    if not result:
        raise ValueError("HMML knowledge source contains no method nodes")
    return Catalog(tuple(result), tuple(hierarchy_nodes), sha256_file(hmml_path), sha256_file(equivalence_path), tuple(groups))


def extract_methods(hmml_path: Path, equivalence_path: Path | None = None) -> list[Method]:
    if equivalence_path is None:
        equivalence_path = Path(__file__).resolve().parent / "evaluation" / "hmml-equivalence.json"
    return list(extract_catalog(hmml_path, equivalence_path).methods)


def build_method_index(catalog: Catalog) -> dict[str, Any]:
    method_count = len(catalog.methods)
    return {
        "schema_version": 2,
        "scoring": {
            "strategy": "hierarchical-parent-mean",
            "parent_weight": 0.5,
            "child_weight": 0.5,
            "similarity_scale": 100.0,
        },
        "methods": [
          {
            "method_id": method.method_id,
            "domain": method.hierarchy[0] if method.hierarchy else "",
            "subdomain": " > ".join(method.hierarchy[1:]),
            "hierarchy": list(method.hierarchy),
            "ancestor_node_ids": list(method.ancestor_node_ids),
            "method": method.method,
            "text": method.embedding_text,
            "concept_id": method.concept_id,
            "primary_method_id": method.primary_method_id,
            "equivalent_method_ids": list(method.equivalent_method_ids),
            "embedding_index": index,
          }
          for index, method in enumerate(catalog.methods)
        ],
        "hierarchy_nodes": [
          {
            "node_id": node.node_id,
            "name": node.name,
            "parent_node_id": node.parent_node_id,
            "description": node.description,
            "text": node.embedding_text,
            "embedding_index": method_count + index,
          }
          for index, node in enumerate(catalog.hierarchy_nodes)
        ],
        "equivalence": {
            "sha256": catalog.equivalence_sha256,
            "groups": list(catalog.equivalence_groups),
        },
    }


def expand_evaluation_queries(evaluation: dict[str, Any]) -> list[dict[str, Any]]:
    queries: list[dict[str, Any]] = []
    for pair in evaluation.get("pairs", []):
        for language in ("zh", "en"):
            queries.append({
                "id": f"{pair['id']}-{language}",
                "pair_id": pair["id"],
                "language": language,
                "query": pair["queries"][language],
                "relevant_concepts": pair["relevant_concepts"],
                "hard_negatives": pair["hard_negatives"],
            })
    return queries


def evaluation_content_sha256(evaluation: dict[str, Any]) -> str:
    content = {
        key: evaluation[key]
        for key in ("schema_version", "dataset_id", "purpose", "knowledge_source", "query_design", "pairs")
    }
    canonical = json.dumps(content, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _audit_review_artifact(
    review_path: Path,
    expected_sha256: str,
    content_sha256: str,
    catalog: Catalog,
    query_ids: set[str],
) -> dict[str, Any]:
    if sha256_file(review_path) != expected_sha256:
        raise ValueError(f"review artifact hash changed: {review_path}")
    review = read_json(review_path)
    if review.get("schema_version") != 1 or review.get("decision") not in {"approve", "changes-required"}:
        raise ValueError(f"review artifact has an invalid decision: {review_path}")
    reviewer = review.get("reviewer", {})
    required_identity = ("reviewer_id", "session_id", "model", "reasoning_effort")
    if (
        not all(isinstance(reviewer.get(key), str) and reviewer[key].strip() for key in required_identity)
        or reviewer.get("independent_context") is not True
        or reviewer.get("capability_tier") != "strong"
    ):
        raise ValueError(f"reviewer identity or independence is incomplete: {review_path}")
    scope = review.get("scope", {})
    if (
        scope.get("evaluation_content_sha256") != content_sha256
        or scope.get("knowledge_sha256") != catalog.knowledge_sha256
        or scope.get("equivalence_sha256") != catalog.equivalence_sha256
    ):
        raise ValueError(f"review artifact scope does not match the evaluation: {review_path}")
    query_reviews = review.get("query_reviews")
    if not isinstance(query_reviews, list):
        raise ValueError(f"review artifact has no per-query decisions: {review_path}")
    reviewed_ids = [item.get("query_id") for item in query_reviews if isinstance(item, dict)]
    if set(reviewed_ids) != query_ids or len(reviewed_ids) != len(query_ids):
        raise ValueError(f"review artifact does not cover every query exactly once: {review_path}")
    if any(item.get("decision") not in {"approve", "change-required"} for item in query_reviews):
        raise ValueError(f"review artifact contains invalid query decisions: {review_path}")
    expected_groups = {str(group["concept_id"]) for group in catalog.equivalence_groups}
    group_reviews = review.get("equivalence_reviews")
    if not isinstance(group_reviews, list):
        raise ValueError(f"review artifact has no equivalence decisions: {review_path}")
    reviewed_groups = [item.get("concept_id") for item in group_reviews if isinstance(item, dict)]
    if set(reviewed_groups) != expected_groups or len(reviewed_groups) != len(expected_groups):
        raise ValueError(f"review artifact does not cover equivalence groups exactly once: {review_path}")
    if any(item.get("decision") not in {"approve", "change-required"} for item in group_reviews):
        raise ValueError(f"review artifact contains invalid equivalence decisions: {review_path}")
    changed = [item for item in [*query_reviews, *group_reviews] if item.get("decision") == "change-required"]
    findings = review.get("findings")
    if not isinstance(findings, list):
        raise ValueError(f"review artifact findings must be an explicit list: {review_path}")
    if review["decision"] == "approve" and (changed or findings):
        raise ValueError(f"approved review artifact contains findings: {review_path}")
    if review["decision"] == "changes-required" and (not changed or not findings):
        raise ValueError(f"changes-required review artifact has no actionable findings: {review_path}")
    return review


def _validate_review_artifact(
    review_path: Path,
    expected_sha256: str,
    content_sha256: str,
    catalog: Catalog,
    query_ids: set[str],
) -> dict[str, Any]:
    review = _audit_review_artifact(review_path, expected_sha256, content_sha256, catalog, query_ids)
    if review["decision"] != "approve":
        raise ValueError(f"review artifact is not a final approval: {review_path}")
    return review


def audit_initial_reviews(
    adjudication_path: Path,
    evaluation: dict[str, Any],
    catalog: Catalog,
) -> dict[str, Any]:
    adjudication = read_json(adjudication_path)
    entries = adjudication.get("initial_reviews")
    if not isinstance(entries, list) or len(entries) < 2:
        raise ValueError("initial adjudication requires at least two independent reviews")
    content_sha256 = evaluation_content_sha256(evaluation)
    query_ids = {query["id"] for query in expand_evaluation_queries(evaluation)}
    root = adjudication_path.parent.resolve()
    reviews = []
    for entry in entries:
        path = (root / str(entry.get("path"))).resolve()
        try:
            path.relative_to(root)
        except ValueError as error:
            raise ValueError("initial review artifact escapes the evaluation directory") from error
        source_content_sha256 = str(entry.get("evaluation_content_sha256", content_sha256))
        review = _audit_review_artifact(path, str(entry.get("sha256")), source_content_sha256, catalog, query_ids)
        if entry.get("decision") != review["decision"]:
            raise ValueError("initial review manifest decision does not match its artifact")
        reviews.append(review)
    reviewer_ids = [review["reviewer"]["reviewer_id"] for review in reviews]
    session_ids = [review["reviewer"]["session_id"] for review in reviews]
    generator_session = adjudication.get("generator", {}).get("session_id")
    if len(set(reviewer_ids)) != len(reviewer_ids) or len(set(session_ids)) != len(session_ids):
        raise ValueError("initial reviewers must have distinct identities and sessions")
    if generator_session in session_ids:
        raise ValueError("the dataset generator cannot count as an initial reviewer")
    finding_ids = {
        finding.get("finding_id")
        for review in reviews
        for finding in review["findings"]
        if isinstance(finding, dict)
    }
    dispute_ids = {item.get("dispute_id") for item in adjudication.get("disputes", []) if isinstance(item, dict)}
    if finding_ids != dispute_ids:
        raise ValueError("recorded disputes do not exactly match initial review findings")
    return {
        "review_count": len(reviews),
        "decisions": [review["decision"] for review in reviews],
        "dispute_count": len(dispute_ids),
    }


def validate_ai_adjudication(
    evaluation_path: Path,
    evaluation: dict[str, Any],
    catalog: Catalog,
    adjudication_path: Path,
) -> dict[str, Any]:
    adjudication = read_json(adjudication_path)
    content_sha256 = evaluation_content_sha256(evaluation)
    if (
        adjudication.get("schema_version") != 1
        or adjudication.get("status") != "ai-adjudicated"
        or evaluation.get("label_status") != "ai-adjudicated"
        or adjudication.get("evaluation_content_sha256") != content_sha256
        or adjudication.get("evaluation_file_sha256") != sha256_file(evaluation_path)
        or adjudication.get("knowledge_sha256") != catalog.knowledge_sha256
        or adjudication.get("equivalence_sha256") != catalog.equivalence_sha256
    ):
        raise ValueError("AI adjudication manifest does not match the final evaluation")
    queries = expand_evaluation_queries(evaluation)
    query_ids = {query["id"] for query in queries}
    generator = adjudication.get("generator", {})
    generator_session = generator.get("session_id")
    entries = adjudication.get("reviewers")
    if not isinstance(entries, list) or len(entries) < 2:
        raise ValueError("AI adjudication requires at least two independent reviewers")
    review_root = adjudication_path.parent
    reviews: list[dict[str, Any]] = []
    for entry in entries:
        if not isinstance(entry, dict) or not isinstance(entry.get("path"), str) or not isinstance(entry.get("sha256"), str):
            raise ValueError("invalid AI reviewer artifact reference")
        path = (review_root / entry["path"]).resolve()
        try:
            path.relative_to(review_root.resolve())
        except ValueError as error:
            raise ValueError("AI reviewer artifact escapes the evaluation directory") from error
        reviews.append(_validate_review_artifact(path, entry["sha256"], content_sha256, catalog, query_ids))
    reviewer_ids = [review["reviewer"]["reviewer_id"] for review in reviews]
    session_ids = [review["reviewer"]["session_id"] for review in reviews]
    if len(set(reviewer_ids)) != len(reviewer_ids) or len(set(session_ids)) != len(session_ids):
        raise ValueError("AI adjudication reviewers must have distinct identities and sessions")
    if generator_session and generator_session in session_ids:
        raise ValueError("the dataset generator cannot count as an independent reviewer")
    disputes = adjudication.get("disputes")
    if not isinstance(disputes, list):
        raise ValueError("AI adjudication disputes must be an explicit list")
    unresolved = [item for item in disputes if not isinstance(item, dict) or item.get("status") != "resolved"]
    if unresolved:
        raise ValueError("AI adjudication contains unresolved disputes")
    if disputes:
        dispute_ids = [item.get("dispute_id") for item in disputes]
        if any(not isinstance(value, str) or not value for value in dispute_ids) or len(set(dispute_ids)) != len(dispute_ids):
            raise ValueError("AI adjudication disputes require unique IDs")
        resolution_policy = adjudication.get("resolution_policy")
        if resolution_policy == "conservative-revise-all":
            if set(adjudication.get("applied_finding_ids", [])) != set(dispute_ids):
                raise ValueError("conservative adjudication must apply every recorded finding")
            if adjudication.get("tie_breaker") is not None:
                raise ValueError("conservative adjudication must not claim a third reviewer")
            result = dict(adjudication)
            result["review_count"] = len(reviews)
            return result
        if resolution_policy != "third-model-adjudication":
            raise ValueError("unsupported AI dispute resolution policy")
        tie_breaker = adjudication.get("tie_breaker")
        if not isinstance(tie_breaker, dict) or not isinstance(tie_breaker.get("path"), str) or not isinstance(tie_breaker.get("sha256"), str):
            raise ValueError("AI adjudication disputes require a third-reviewer artifact")
        tie_path = (review_root / tie_breaker["path"]).resolve()
        if sha256_file(tie_path) != tie_breaker["sha256"]:
            raise ValueError("AI tie-breaker artifact hash changed")
        tie_review = read_json(tie_path)
        tie_identity = tie_review.get("reviewer", {})
        source_hashes = {item.get("source_evaluation_content_sha256") for item in disputes}
        resolutions = tie_review.get("resolutions")
        if (
            tie_review.get("schema_version") != 1
            or tie_review.get("decision") != "adjudicate"
            or not all(isinstance(tie_identity.get(key), str) and tie_identity[key].strip() for key in ("reviewer_id", "session_id", "model", "reasoning_effort"))
            or tie_identity.get("independent_context") is not True
            or tie_identity.get("capability_tier") != "strong"
            or tie_review.get("scope", {}).get("evaluation_content_sha256") not in source_hashes
            or tie_review.get("scope", {}).get("knowledge_sha256") != catalog.knowledge_sha256
            or tie_review.get("scope", {}).get("equivalence_sha256") != catalog.equivalence_sha256
            or not isinstance(resolutions, list)
        ):
            raise ValueError("AI tie-breaker artifact is invalid")
        resolved_ids = [item.get("dispute_id") for item in resolutions if isinstance(item, dict)]
        if set(resolved_ids) != set(dispute_ids) or len(resolved_ids) != len(dispute_ids):
            raise ValueError("AI tie-breaker does not resolve every recorded dispute exactly")
        if any(
            item.get("decision") not in {"accept-change", "reject-change", "modify-change"}
            or not isinstance(item.get("rationale"), str)
            or not item["rationale"].strip()
            for item in resolutions
        ):
            raise ValueError("AI tie-breaker contains an invalid resolution")
        if (
            tie_identity["session_id"] in set(session_ids) | ({generator_session} if generator_session else set())
            or tie_identity["reviewer_id"] in set(reviewer_ids)
        ):
            raise ValueError("AI tie-breaker must be independent of generator and primary reviewers")
    result = dict(adjudication)
    result["review_count"] = len(reviews)
    return result


def validate_evaluation_labels(
    evaluation_path: Path,
    catalog: Catalog,
    *,
    require_adjudicated: bool,
    adjudication_path: Path | None = None,
) -> dict[str, Any]:
    evaluation = read_json(evaluation_path)
    if evaluation.get("schema_version") != 2 or evaluation.get("purpose") != "model-selection":
        raise ValueError("unsupported HMML evaluation schema")
    source = evaluation.get("knowledge_source", {})
    if source.get("sha256") != catalog.knowledge_sha256:
        raise ValueError("evaluation knowledge source hash does not match")
    if source.get("equivalence_sha256") != catalog.equivalence_sha256:
        raise ValueError("evaluation equivalence catalog hash does not match")
    pairs = evaluation.get("pairs")
    if not isinstance(pairs, list) or len(pairs) < 15:
        raise ValueError("HMML evaluation requires at least 30 queries")
    concepts: dict[str, Method] = {}
    for method in catalog.methods:
        if method.method_id == method.primary_method_id:
            concepts[method.concept_id] = method
    identifiers: set[str] = set()
    covered: set[str] = set()
    multi_relevant_pairs = 0
    for pair in pairs:
        if (
            not isinstance(pair, dict)
            or not isinstance(pair.get("id"), str)
            or not isinstance(pair.get("queries"), dict)
            or not all(isinstance(pair["queries"].get(language), str) and pair["queries"][language].strip() for language in ("zh", "en"))
        ):
            raise ValueError("invalid evaluation query pair")
        if pair["id"] in identifiers:
            raise ValueError(f"duplicate evaluation pair id: {pair['id']}")
        identifiers.add(pair["id"])
        labels = pair.get("relevant_concepts")
        if not isinstance(labels, list) or not labels:
            raise ValueError(f"pair {pair['id']} requires at least one relevance concept")
        if len(labels) > 1:
            multi_relevant_pairs += 1
        if sum(label.get("relevance") == "primary" for label in labels) != 1:
            raise ValueError(f"pair {pair['id']} must have exactly one primary concept")
        relevant_ids: set[str] = set()
        for label in labels:
            concept_id = str(label.get("concept_id"))
            method = concepts.get(concept_id)
            if (
                method is None
                or str(label.get("primary_method_id")) != method.primary_method_id
                or label.get("method") != method.method
                or tuple(str(value) for value in label.get("equivalent_method_ids", [])) != method.equivalent_method_ids
                or label.get("relevance") not in {"primary", "acceptable"}
            ):
                raise ValueError(f"pair {pair['id']} label does not match concept catalog: {concept_id}")
            if concept_id in relevant_ids:
                raise ValueError(f"pair {pair['id']} repeats concept: {concept_id}")
            relevant_ids.add(concept_id)
            covered.add(concept_id)
        negatives = pair.get("hard_negatives")
        if not isinstance(negatives, list) or not negatives:
            raise ValueError(f"pair {pair['id']} requires hard negatives")
        for negative in negatives:
            concept_id = str(negative.get("concept_id"))
            method = concepts.get(concept_id)
            if method is None or concept_id in relevant_ids or str(negative.get("primary_method_id")) != method.primary_method_id:
                raise ValueError(f"pair {pair['id']} has an invalid hard negative: {concept_id}")
    if len(covered) < 45:
        raise ValueError("HMML evaluation covers too few distinct method concepts")
    required_multi = int(evaluation.get("query_design", {}).get("minimum_multi_relevant_pair_count", 20))
    if multi_relevant_pairs < required_multi:
        raise ValueError("HMML evaluation contains too few multi-relevant query pairs")
    result = dict(evaluation)
    result["queries"] = expand_evaluation_queries(evaluation)
    result["content_sha256"] = evaluation_content_sha256(evaluation)
    if require_adjudicated:
        if not labels_are_adjudicated(evaluation.get("label_status")):
            raise ValueError("evaluation labels are not independently adjudicated ground truth")
        if evaluation.get("label_status") == "ai-adjudicated":
            if adjudication_path is None:
                raise ValueError("AI-adjudicated evaluation requires an adjudication manifest")
            result["adjudication"] = validate_ai_adjudication(evaluation_path, evaluation, catalog, adjudication_path)
        else:
            raise ValueError("expert-confirmed governance is not implemented without explicit expert evidence")
    return result


class TransformerClsEncoder:
    def __init__(self, tokenizer: Any, model: Any, *, max_length: int = 8192):
        self.tokenizer = tokenizer
        self.model = model
        self.max_length = max_length
        self.model.eval()

    def encode(self, texts: list[str], *, batch_size: int = 16):
        import numpy as np
        import torch

        batches = []
        with torch.inference_mode():
            for offset in range(0, len(texts), batch_size):
                encoded = self.tokenizer(
                    texts[offset:offset + batch_size],
                    max_length=self.max_length,
                    padding=True,
                    truncation=True,
                    return_tensors="pt",
                )
                output = self.model(**encoded)
                vectors = torch.nn.functional.normalize(output.last_hidden_state[:, 0], p=2, dim=1)
                batches.append(vectors.cpu().numpy().astype(np.float32, copy=False))
        return np.concatenate(batches, axis=0)


def _load_pinned_remote_classes(code_snapshot: Path):
    required = [code_snapshot / "configuration.py", code_snapshot / "modeling.py"]
    if not all(path.is_file() for path in required):
        raise ValueError("pinned model code snapshot is incomplete")
    package_name = f"_mm_agent_model_code_{sha256_file(required[0])[:16]}"
    package = types.ModuleType(package_name)
    package.__path__ = [str(code_snapshot)]
    sys.modules[package_name] = package
    loaded = []
    previous_bytecode_policy = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        for module_name, path in [("configuration", required[0]), ("modeling", required[1])]:
            qualified = f"{package_name}.{module_name}"
            spec = importlib.util.spec_from_file_location(qualified, path)
            if spec is None or spec.loader is None:
                raise ValueError(f"cannot load pinned model code: {path}")
            module = importlib.util.module_from_spec(spec)
            sys.modules[qualified] = module
            spec.loader.exec_module(module)
            loaded.append(module)
    finally:
        sys.dont_write_bytecode = previous_bytecode_policy
    return loaded[0].NewConfig, loaded[1].NewModel


def load_embedding_model(snapshot: Path, *, code_snapshot: Path | None = None):
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
    from transformers import AutoModel, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(str(snapshot), local_files_only=True)
    if code_snapshot is None:
        model = AutoModel.from_pretrained(str(snapshot), local_files_only=True, trust_remote_code=False)
    else:
        config_class, model_class = _load_pinned_remote_classes(code_snapshot.resolve())
        config = config_class.from_pretrained(str(snapshot), local_files_only=True)
        model = model_class.from_pretrained(str(snapshot), config=config, local_files_only=True)
    return TransformerClsEncoder(tokenizer, model)


def encode_normalized(model: Any, texts: list[str], *, batch_size: int = 16):
    import numpy as np

    embeddings = model.encode(texts, batch_size=batch_size)
    result = np.asarray(embeddings, dtype=np.float32)
    if result.ndim != 2 or result.shape[0] != len(texts):
        raise ValueError(f"unexpected embedding shape: {result.shape}")
    return result


def catalog_embedding_texts(catalog: Catalog) -> list[str]:
    return [method.embedding_text for method in catalog.methods] + [node.embedding_text for node in catalog.hierarchy_nodes]


def rank_hierarchical(index_data: dict[str, Any], embeddings: Any, query_embedding: Any) -> list[dict[str, Any]]:
    import numpy as np

    if index_data.get("schema_version") != 2:
        raise ValueError("unsupported HMML method index schema")
    methods = index_data.get("methods")
    nodes = index_data.get("hierarchy_nodes")
    scoring = index_data.get("scoring")
    if not isinstance(methods, list) or not isinstance(nodes, list):
        raise ValueError("invalid hierarchical HMML index")
    if scoring != {
        "strategy": "hierarchical-parent-mean",
        "parent_weight": 0.5,
        "child_weight": 0.5,
        "similarity_scale": 100.0,
    }:
        raise ValueError("unsupported hierarchical HMML scoring policy")
    matrix = np.asarray(embeddings, dtype=np.float32)
    query = np.asarray(query_embedding, dtype=np.float32)
    if (
        matrix.ndim != 2
        or matrix.shape[0] != len(methods) + len(nodes)
        or query.ndim != 1
        or matrix.shape[1] != query.shape[0]
        or not np.isfinite(matrix).all()
        or not np.isfinite(query).all()
    ):
        raise ValueError("embedding matrix and query dimension do not match")
    raw_scores = np.matmul(matrix, query) * float(scoring["similarity_scale"])
    node_scores = {str(node["node_id"]): float(raw_scores[int(node["embedding_index"])]) for node in nodes}
    primary_by_id = {str(method["method_id"]): method for method in methods}
    grouped: dict[str, list[dict[str, Any]]] = {}
    for method in methods:
        ancestors = [node_scores[str(node_id)] for node_id in method["ancestor_node_ids"]]
        parent_score = sum(ancestors) / len(ancestors) if ancestors else 0.0
        leaf_score = float(raw_scores[int(method["embedding_index"])])
        final_score = parent_score * float(scoring["parent_weight"]) + leaf_score * float(scoring["child_weight"])
        grouped.setdefault(str(method["concept_id"]), []).append({
            "entry": method,
            "parent_score": parent_score,
            "leaf_score": leaf_score,
            "score": final_score,
        })
    ranking: list[dict[str, Any]] = []
    for concept_id, members in grouped.items():
        winner = min(members, key=lambda item: (-item["score"], int(item["entry"]["method_id"])))
        primary_id = str(winner["entry"]["primary_method_id"])
        primary = primary_by_id[primary_id]
        ranking.append({
            "concept_id": concept_id,
            "method_id": primary_id,
            "method": primary["method"],
            "domain": primary["domain"],
            "subdomain": primary["subdomain"],
            "matched_method_id": str(winner["entry"]["method_id"]),
            "equivalent_method_ids": list(primary["equivalent_method_ids"]),
            "parent_score": winner["parent_score"],
            "leaf_score": winner["leaf_score"],
            "score": winner["score"],
        })
    ranking.sort(key=lambda item: (-item["score"], int(item["method_id"])))
    for rank, item in enumerate(ranking, 1):
        item["rank"] = rank
    return ranking


def index_hash(paths: dict[str, Path]) -> str:
    return sha256_named_hashes((name, sha256_file(path)) for name, path in paths.items())


def write_dense_index(
    output_dir: Path,
    hmml_path: Path,
    catalog: Catalog,
    embeddings: Any,
    *,
    model_id: str,
    model_revision: str,
    model_inventory: dict[str, Any],
    code_revision: str | None = None,
    code_inventory: dict[str, Any] | None = None,
) -> dict[str, Any]:
    import numpy as np

    output_dir.mkdir(parents=True, exist_ok=True)
    matrix = np.asarray(embeddings, dtype=np.float32)
    expected_rows = len(catalog.methods) + len(catalog.hierarchy_nodes)
    if matrix.ndim != 2 or matrix.shape[0] != expected_rows:
        raise ValueError(f"embedding matrix does not match method catalog: {matrix.shape}")
    if not np.isfinite(matrix).all() or not np.allclose(np.linalg.norm(matrix, axis=1), 1.0, atol=1e-5):
        raise ValueError("embedding matrix must contain finite L2-normalized rows")
    method_index_path = output_dir / "method-index.json"
    embeddings_path = output_dir / "hmml-embeddings.npy"
    meta_path = output_dir / "embedding-meta.json"
    write_json(method_index_path, build_method_index(catalog))
    temporary = embeddings_path.with_name(f".{embeddings_path.name}.tmp-{os.getpid()}")
    try:
        with temporary.open("wb") as stream:
            np.save(stream, matrix, allow_pickle=False)
        os.replace(temporary, embeddings_path)
    finally:
        temporary.unlink(missing_ok=True)
    meta = {
        "schema_version": 2,
        "knowledge_source": {
            "path": "knowledge/hmml/hmml.json",
            "sha256": sha256_file(hmml_path),
            "extraction": "recursive-depth-first",
            "equivalence_sha256": catalog.equivalence_sha256,
        },
        "model": {
            "id": model_id,
            "revision": model_revision,
            "files_sha256": model_inventory["files_sha256"],
        },
        "embedding_dimension": int(matrix.shape[1]),
        "method_count": len(catalog.methods),
        "concept_count": len({method.concept_id for method in catalog.methods}),
        "hierarchy_node_count": len(catalog.hierarchy_nodes),
        "embedding_row_count": int(matrix.shape[0]),
        "dtype": "float32",
        "normalized": True,
        "scoring": {
            "strategy": "hierarchical-parent-mean",
            "parent_weight": 0.5,
            "child_weight": 0.5,
            "similarity_scale": 100.0,
        },
        "method_index_sha256": sha256_file(method_index_path),
    }
    if code_revision and code_inventory:
        meta["model"]["code"] = {
            "id": "Alibaba-NLP/new-impl",
            "revision": code_revision,
            "files_sha256": code_inventory["files_sha256"],
        }
    write_json(meta_path, meta)
    paths = {
        "hmml-embeddings.npy": embeddings_path,
        "embedding-meta.json": meta_path,
        "method-index.json": method_index_path,
    }
    return {
        "embedding_dimension": int(matrix.shape[1]),
        "method_count": len(catalog.methods),
        "concept_count": len({method.concept_id for method in catalog.methods}),
        "hierarchy_node_count": len(catalog.hierarchy_nodes),
        "embedding_row_count": int(matrix.shape[0]),
        "files": {
            name: {"path": path.as_posix(), "size_bytes": path.stat().st_size, "sha256": sha256_file(path)}
            for name, path in paths.items()
        },
        "index_sha256": index_hash(paths),
    }
