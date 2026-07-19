import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { hashPath } from "../../src/core/paths.js";
import { retrieveHmml } from "../../src/tools/hmml.js";

function combined(files: Record<string, { sha256: string }>): string {
  const digest = createHash("sha256");
  for (const [name, info] of Object.entries(files).sort(([left], [right]) => left.localeCompare(right)))
    digest.update(name).update("\0").update(info.sha256).update("\n");
  return digest.digest("hex");
}

async function fixture(): Promise<{ packageRoot: string; projectRoot: string; cacheRoot: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-hmml-"));
  const packageRoot = path.join(root, "package");
  const projectRoot = path.join(root, "project");
  const cacheRoot = path.join(root, "cache");
  const knowledgeRoot = path.join(packageRoot, "knowledge", "hmml");
  await mkdir(path.join(packageRoot, "runtime"), { recursive: true });
  await mkdir(knowledgeRoot, { recursive: true });
  await mkdir(projectRoot, { recursive: true });
  const hmml = "[{\"method_class\":\"OR\",\"children\":[]}]\n";
  const methods = [
    {
      method_id: "0",
      domain: "Operations Research",
      subdomain: "Stochastic",
      hierarchy: ["Operations Research", "Stochastic"],
      ancestor_node_ids: [],
      method: "Queuing Theory",
      text: "Method: Queuing Theory waiting queue service arrival congestion",
      concept_id: "method-0",
      primary_method_id: "0",
      equivalent_method_ids: ["0"],
      embedding_index: 0,
    },
    {
      method_id: "1",
      domain: "Machine Learning",
      subdomain: "Clustering",
      hierarchy: ["Machine Learning", "Clustering"],
      ancestor_node_ids: [],
      method: "K-Means",
      text: "Method: K-Means centroid clustering unlabeled observations",
      concept_id: "method-1",
      primary_method_id: "1",
      equivalent_method_ids: ["1"],
      embedding_index: 1,
    },
  ];
  const equivalenceHash = "e".repeat(64);
  const methodIndex = {
    schema_version: 2,
    scoring: { strategy: "hierarchical-parent-mean", parent_weight: 0.5, child_weight: 0.5, similarity_scale: 100 },
    methods,
    hierarchy_nodes: [],
    equivalence: { sha256: equivalenceHash, groups: [] },
  };
  await writeFile(path.join(knowledgeRoot, "hmml.json"), hmml, "utf8");
  await writeFile(path.join(knowledgeRoot, "method-index.json"), `${JSON.stringify(methodIndex, null, 2)}\n`, "utf8");
  await writeFile(path.join(knowledgeRoot, "embedding-meta.json"), "{\"embedding_dimension\":2,\"method_count\":2}\n", "utf8");
  await writeFile(path.join(knowledgeRoot, "hmml-embeddings.npy"), "fixture-npy\n", "utf8");
  await writeFile(path.join(packageRoot, "runtime", "hmml_retrieve.py"), "print('{}')\n", "utf8");
  const files: Record<string, { path: string; size_bytes: number; sha256: string }> = {};
  for (const name of ["hmml-embeddings.npy", "embedding-meta.json", "method-index.json"]) {
    const target = path.join(knowledgeRoot, name);
    files[name] = {
      path: `knowledge/hmml/${name}`,
      size_bytes: (await readFile(target)).length,
      sha256: await hashPath(target),
    };
  }
  const revision = "a".repeat(40);
  const manifest = {
    schema_version: 1,
    knowledge_source: {
      path: "knowledge/hmml/hmml.json",
      sha256: await hashPath(path.join(knowledgeRoot, "hmml.json")),
      method_count: 2,
      concept_count: 2,
      hierarchy_node_count: 0,
      equivalence_sha256: equivalenceHash,
      extraction: "recursive-depth-first",
    },
    selected_model: {
      id: "example/model",
      revision,
      files_sha256: "b".repeat(64),
      snapshot_size_bytes: 123,
      embedding_dimension: 2,
      cache_subdir: `huggingface/hub/models--example--model/snapshots/${revision}`,
    },
    index: { index_sha256: combined(files), method_count: 2, concept_count: 2, embedding_row_count: 2, files },
    fallback: { mode: "bm25", requires_model_cache: false },
  };
  await writeFile(path.join(packageRoot, "runtime", "hmml-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { packageRoot, projectRoot, cacheRoot };
}

test("HMML falls back to real BM25 without a model cache and writes full provenance", async () => {
  const { packageRoot, projectRoot, cacheRoot } = await fixture();
  try {
    const outputPath = "runs/case-a/tasks/task-01/retrieved-methods.json";
    const result = await retrieveHmml({
      packageRoot,
      projectRoot,
      env: { MM_AGENT_CACHE_DIR: cacheRoot },
      query: "customer waiting queue and service congestion",
      topK: 2,
      outputPath,
      now: () => "2026-07-19T00:00:00.000Z",
    });
    assert.equal(result.retrieval_mode, "bm25");
    assert.equal(result.model.available, false);
    assert.match(result.degraded_reason ?? "", /model cache|Python runtime/u);
    assert.equal(result.candidates[0]?.method, "Queuing Theory");
    assert.ok((result.candidates[0]?.score ?? 0) > 0);
    assert.match(result.knowledge_source.sha256, /^[a-f0-9]{64}$/u);
    assert.match(result.index.hash, /^[a-f0-9]{64}$/u);
    assert.equal(result.index.concept_count, 2);
    assert.equal(result.index.scoring, "bm25-keyword");
    assert.deepEqual(JSON.parse(await readFile(path.join(projectRoot, ...outputPath.split("/")), "utf8")), result);
  } finally {
    await rm(path.dirname(packageRoot), { recursive: true, force: true });
  }
});

test("HMML degrades to BM25 when the dense runtime fails", async () => {
  const { packageRoot, projectRoot, cacheRoot } = await fixture();
  try {
    const manifest = JSON.parse(await readFile(path.join(packageRoot, "runtime", "hmml-manifest.json"), "utf8"));
    const python = process.platform === "win32"
      ? path.join(cacheRoot, "python", "Scripts", "python.exe")
      : path.join(cacheRoot, "python", "bin", "python");
    await mkdir(path.dirname(python), { recursive: true });
    await writeFile(python, "fixture", "utf8");
    await mkdir(path.join(cacheRoot, ...manifest.selected_model.cache_subdir.split("/")), { recursive: true });
    const result = await retrieveHmml({
      packageRoot,
      projectRoot,
      cacheRoot,
      query: "centroid clustering",
      topK: 1,
      outputPath: "runs/case-b/tasks/task-02/retrieved-methods.json",
      denseRunner: async () => ({ exitCode: 7, stdout: "", stderr: "model load failed", timedOut: false }),
    });
    assert.equal(result.retrieval_mode, "bm25");
    assert.match(result.degraded_reason ?? "", /exit=7.*model load failed/u);
    assert.equal(result.candidates[0]?.method, "K-Means");
  } finally {
    await rm(path.dirname(packageRoot), { recursive: true, force: true });
  }
});

test("HMML accepts dense candidates only from a successful validated runtime response", async () => {
  const { packageRoot, projectRoot, cacheRoot } = await fixture();
  try {
    const manifest = JSON.parse(await readFile(path.join(packageRoot, "runtime", "hmml-manifest.json"), "utf8"));
    const python = process.platform === "win32"
      ? path.join(cacheRoot, "python", "Scripts", "python.exe")
      : path.join(cacheRoot, "python", "bin", "python");
    await mkdir(path.dirname(python), { recursive: true });
    await writeFile(python, "fixture", "utf8");
    await mkdir(path.join(cacheRoot, ...manifest.selected_model.cache_subdir.split("/")), { recursive: true });
    const dense = [{
      rank: 1,
      concept_id: "method-1",
      method_id: "1",
      method: "K-Means",
      domain: "Machine Learning",
      subdomain: "Clustering",
      matched_method_id: "1",
      equivalent_method_ids: ["1"],
      parent_score: 0.88,
      leaf_score: 0.94,
      score: 0.91,
    }];
    const result = await retrieveHmml({
      packageRoot,
      projectRoot,
      cacheRoot,
      query: "cluster samples",
      topK: 1,
      outputPath: "runs/case-c/tasks/task-03/retrieved-methods.json",
      denseRunner: async () => ({ exitCode: 0, stdout: JSON.stringify({ candidates: dense }), stderr: "", timedOut: false }),
    });
    assert.equal(result.retrieval_mode, "dense");
    assert.equal(result.degraded_reason, null);
    assert.equal(result.model.available, true);
    assert.deepEqual(result.candidates, dense);
  } finally {
    await rm(path.dirname(packageRoot), { recursive: true, force: true });
  }
});

test("HMML passes a pinned external code snapshot to the dense runtime", async () => {
  const { packageRoot, projectRoot, cacheRoot } = await fixture();
  try {
    const manifestPath = path.join(packageRoot, "runtime", "hmml-manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const codeRevision = "c".repeat(40);
    manifest.selected_model.code = {
      id: "example/model-code",
      revision: codeRevision,
      files_sha256: "d".repeat(64),
      snapshot_size_bytes: 42,
      files: [],
      cache_subdir: `huggingface/hub/models--example--model-code/snapshots/${codeRevision}`,
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const python = process.platform === "win32"
      ? path.join(cacheRoot, "python", "Scripts", "python.exe")
      : path.join(cacheRoot, "python", "bin", "python");
    await mkdir(path.dirname(python), { recursive: true });
    await writeFile(python, "fixture", "utf8");
    await mkdir(path.join(cacheRoot, ...manifest.selected_model.cache_subdir.split("/")), { recursive: true });
    const expectedCode = path.join(cacheRoot, ...manifest.selected_model.code.cache_subdir.split("/"));
    await mkdir(expectedCode, { recursive: true });
    let denseArgs: string[] = [];
    await retrieveHmml({
      packageRoot,
      projectRoot,
      cacheRoot,
      query: "cluster samples",
      topK: 1,
      outputPath: "runs/case-code/tasks/task-01/retrieved-methods.json",
      denseRunner: async (_python, args) => {
        denseArgs = args;
        return {
          exitCode: 0,
          stdout: JSON.stringify({ candidates: [{
            rank: 1,
            concept_id: "method-1",
            method_id: "1",
            method: "K-Means",
            domain: "Machine Learning",
            subdomain: "Clustering",
            matched_method_id: "1",
            equivalent_method_ids: ["1"],
            parent_score: 0.85,
            leaf_score: 0.95,
            score: 0.9,
          }] }),
          stderr: "",
          timedOut: false,
        };
      },
    });
    const flag = denseArgs.indexOf("--code-snapshot");
    assert.ok(flag >= 0);
    assert.equal(denseArgs[flag + 1], expectedCode);
  } finally {
    await rm(path.dirname(packageRoot), { recursive: true, force: true });
  }
});

test("HMML rejects path escapes and index tampering before retrieval", async () => {
  const first = await fixture();
  try {
    await assert.rejects(
      retrieveHmml({
        ...first,
        query: "queue",
        topK: 1,
        outputPath: "../retrieved-methods.json",
      }),
      /project-relative/u,
    );
  } finally {
    await rm(path.dirname(first.packageRoot), { recursive: true, force: true });
  }

  const second = await fixture();
  try {
    await writeFile(path.join(second.packageRoot, "knowledge", "hmml", "method-index.json"), "{}\n", "utf8");
    await assert.rejects(
      retrieveHmml({
        ...second,
        query: "queue",
        topK: 1,
        outputPath: "runs/case-d/retrieved-methods.json",
      }),
      /does not match runtime manifest/u,
    );
  } finally {
    await rm(path.dirname(second.packageRoot), { recursive: true, force: true });
  }
});
