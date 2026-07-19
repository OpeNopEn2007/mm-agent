# HMML Label Adjudication

`hmml-eval.json` and `hmml-equivalence.json` are AI-generated proposals, not human-confirmed ground truth. A formal benchmark may run only after `hmml-adjudication.json` and its referenced review artifacts pass the runtime validator.

## Independent review rule

- Two strong-model reviewers independently inspect the fixed evaluation content, all 80 query labels, both equivalence groups, and the pinned 97-method knowledge catalog.
- Neither reviewer may be the dataset-generator session. Reviewer IDs and session IDs must be distinct, and each artifact must declare `independent_context: true`.
- Every query and equivalence group receives an explicit per-item decision. A final approval artifact may contain only `approve` decisions for the exact fixed content hash.
- Any `important` initial finding is preserved in `hmml-adjudication.json` and conservatively applied. Both independent reviewers must then approve the revised fixed content; no third reviewer is claimed.
- `hmml_review.py audit` verifies the two initial artifacts, their hashes, full coverage, independent identities, and exact correspondence between findings and recorded disputes.
- The resulting status is `ai-adjudicated`, never `human-confirmed`. Unresolved specialist questions may instead be escalated to a named mathematical-modeling expert under a future explicit expert-evidence schema.

## Review artifact schema

Each `reviews/*.json` file has this shape:

```json
{
  "schema_version": 1,
  "review_id": "reviewer-a-final",
  "reviewer": {
    "reviewer_id": "reviewer-a",
    "session_id": "independent-session-a",
    "model": "strong-model-id",
    "reasoning_effort": "high",
    "capability_tier": "strong",
    "independent_context": true
  },
  "scope": {
    "evaluation_content_sha256": "<printed by hmml_review.py prepare>",
    "knowledge_sha256": "013f90cd8e50c3aac5cc4ce497a9530852d9c18e655a9b7f545d47d3c9b86080",
    "equivalence_sha256": "<current file sha256>"
  },
  "decision": "approve",
  "query_reviews": [
    {"query_id": "p01-zh", "decision": "approve", "note": "..."}
  ],
  "equivalence_reviews": [
    {"concept_id": "linear-programming", "decision": "approve", "note": "..."}
  ],
  "findings": []
}
```

The arrays must cover every query and equivalence group exactly once. The manifest stores every artifact path and SHA-256, so replacing a review after benchmark execution invalidates the evidence.

Historical findings remain pinned to the content hash they reviewed. Under `resolution_policy: "conservative-revise-all"`, every recorded Important finding must appear in `applied_finding_ids`; after the dataset changes, two final approval artifacts must independently review the new content hash.

## Status transition

The repository proposal remains blocked while `hmml-adjudication.json` has `status: "pending"`. After two final approvals and conservative application of every recorded Important finding:

1. apply every recorded Important finding, obtain two final approvals for the revised content hash, then change `hmml-eval.json.label_status` to `ai-adjudicated` and record the date;
2. set the manifest to `status: "ai-adjudicated"`, its final evaluation file hash, fixed content hash, review artifact paths/hashes, explicit disputes, and optional tie-breaker;
3. run `hmml_review.py validate`; then and only then run the two real-model benchmarks.
