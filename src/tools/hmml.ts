import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { hashPath, writeJsonAtomic } from "../core/paths.js";

type MethodEntry = {
  method_id: string;
  domain: string;
  subdomain: string;
  hierarchy: string[];
  ancestor_node_ids: string[];
  method: string;
  text: string;
  concept_id: string;
  primary_method_id: string;
  equivalent_method_ids: string[];
  embedding_index: number;
};

type MethodIndex = {
  schema_version: 2;
  scoring: {
    strategy: "hierarchical-parent-mean";
    parent_weight: 0.5;
    child_weight: 0.5;
    similarity_scale: 100;
  };
  methods: MethodEntry[];
  hierarchy_nodes: Array<{
    node_id: string;
    name: string;
    parent_node_id: string | null;
    description: string;
    text: string;
    embedding_index: number;
  }>;
  equivalence: { sha256: string; groups: unknown[] };
};

type RuntimeManifest = {
  schema_version: number;
  knowledge_source: {
    path: string;
    sha256: string;
    method_count: number;
    concept_count: number;
    hierarchy_node_count: number;
    equivalence_sha256: string;
    extraction: string;
  };
  selected_model: {
    id: string;
    revision: string;
    files_sha256: string;
    files: Array<{ path: string; size_bytes: number; sha256: string }>;
    snapshot_size_bytes: number;
    embedding_dimension: number;
    cache_subdir: string;
    code?: {
      id: string;
      revision: string;
      files_sha256: string;
      files: Array<{ path: string; size_bytes: number; sha256: string }>;
      snapshot_size_bytes: number;
      cache_subdir: string;
    };
  };
  index: {
    index_sha256: string;
    method_count: number;
    concept_count: number;
    embedding_row_count: number;
    files: Record<string, { path: string; size_bytes: number; sha256: string }>;
  };
  fallback: { mode: "bm25"; requires_model_cache: false };
};

export type HmmlCandidate = {
  rank: number;
  concept_id: string;
  method_id: string;
  method: string;
  domain: string;
  subdomain: string;
  matched_method_id: string;
  equivalent_method_ids: string[];
  parent_score?: number;
  leaf_score?: number;
  score: number;
};

export type HmmlRetrievalResult = {
  schema_version: 1;
  knowledge_source: {
    path: string;
    version: string;
    sha256: string;
  };
  query: string;
  retrieval_mode: "dense" | "bm25";
  model: RuntimeManifest["selected_model"] & { available: boolean };
  index: {
    revision: string;
    hash: string;
    method_count: number;
    concept_count: number;
    embedding_dimension: number;
    scoring: "hierarchical-parent-mean" | "bm25-keyword";
  };
  candidates: HmmlCandidate[];
  degraded_reason: string | null;
  retrieved_at: string;
};

export type HmmlOptions = {
  projectRoot: string;
  packageRoot: string;
  query: string;
  topK: number;
  outputPath: string;
  mode?: "auto" | "bm25";
  cacheRoot?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  denseTimeoutMs?: number;
  denseRunner?: DenseRunner;
};

type DenseRun = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

export type DenseRunner = (
  python: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
) => Promise<DenseRun>;

const MAX_CAPTURE = 64 * 1024;

function defaultCacheRoot(env: NodeJS.ProcessEnv): string {
  if (process.platform === "win32")
    return path.join(env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "mm-agent");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Caches", "mm-agent");
  return path.join(env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"), "mm-agent");
}

function sanitizedDenseEnvironment(source: NodeJS.ProcessEnv, cacheRoot: string): NodeJS.ProcessEnv {
  const env = { ...source };
  for (const key of ["VIRTUAL_ENV", "PYTHONHOME", "PYTHONPATH", "CONDA_PREFIX", "PIP_TARGET"])
    delete env[key];
  env.PYTHONNOUSERSITE = "1";
  env.HF_HOME = path.join(cacheRoot, "huggingface");
  env.HF_HUB_CACHE = path.join(cacheRoot, "huggingface", "hub");
  env.HF_HUB_OFFLINE = "1";
  env.TRANSFORMERS_OFFLINE = "1";
  env.TOKENIZERS_PARALLELISM = "false";
  return env;
}

async function isRegularFile(target: string): Promise<boolean> {
  try {
    const info = await lstat(target);
    return info.isFile() && !info.isSymbolicLink();
  } catch {
    return false;
  }
}

async function isDirectDirectory(target: string): Promise<boolean> {
  try {
    const info = await lstat(target);
    return info.isDirectory() && !info.isSymbolicLink();
  } catch {
    return false;
  }
}

async function nearestExistingAncestor(target: string): Promise<string> {
  let cursor = target;
  for (;;) {
    try {
      return await realpath(cursor);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      cursor = parent;
    }
  }
}

function assertInside(root: string, target: string, label: string): void {
  if (target !== root && !target.startsWith(`${root}${path.sep}`))
    throw new Error(`${label} escapes the project root`);
}

async function resolveOutput(projectRoot: string, relative: string): Promise<string> {
  const segments = relative.split("/");
  if (
    !relative ||
    path.posix.isAbsolute(relative) ||
    path.win32.isAbsolute(relative) ||
    relative.includes("\\") ||
    relative.includes("\0") ||
    relative.includes(":") ||
    segments.some((segment) => !segment || segment === "." || segment === "..") ||
    path.posix.basename(relative) !== "retrieved-methods.json"
  )
    throw new Error("output_path must be a project-relative retrieved-methods.json path");
  const root = await realpath(projectRoot);
  const absolute = path.resolve(root, ...segments);
  assertInside(root, absolute, "output_path");
  const ancestor = await nearestExistingAncestor(path.dirname(absolute));
  assertInside(root, ancestor, "output_path ancestor");
  await mkdir(path.dirname(absolute), { recursive: true });
  const parent = await realpath(path.dirname(absolute));
  assertInside(root, parent, "output_path parent");
  try {
    const info = await lstat(absolute);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("output_path is not a direct regular file");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return absolute;
}

async function runDense(
  python: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
): Promise<DenseRun> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const child = spawn(python, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const capture = (current: string, chunk: unknown): string => `${current}${String(chunk)}`.slice(-MAX_CAPTURE);
    child.stdout.on("data", (chunk) => { stdout = capture(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = capture(stderr, chunk); });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs);
    const finish = (result: DenseRun): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    child.once("error", (error) => finish({ exitCode: null, stdout, stderr: `${stderr}${error.message}`, timedOut }));
    child.once("close", (exitCode) => finish({ exitCode, stdout, stderr, timedOut }));
  });
}

function combinedIndexHash(files: Record<string, { sha256: string }>): string {
  const digest = createHash("sha256");
  for (const [name, info] of Object.entries(files).sort(([left], [right]) => left.localeCompare(right)))
    digest.update(name).update("\0").update(info.sha256).update("\n");
  return digest.digest("hex");
}

async function loadRuntime(packageRoot: string): Promise<{
  manifest: RuntimeManifest;
  methods: MethodEntry[];
  manifestPath: string;
  knowledgeRoot: string;
}> {
  const manifestPath = path.join(packageRoot, "runtime", "hmml-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as RuntimeManifest;
  if (manifest.schema_version !== 1 || manifest.fallback?.mode !== "bm25")
    throw new Error("invalid HMML runtime manifest");
  const knowledgeRoot = path.join(packageRoot, "knowledge", "hmml");
  const knowledgePath = path.join(knowledgeRoot, "hmml.json");
  if ((await hashPath(knowledgePath)) !== manifest.knowledge_source.sha256)
    throw new Error("HMML knowledge source hash does not match runtime manifest");
  for (const [name, expected] of Object.entries(manifest.index.files)) {
    const target = path.join(knowledgeRoot, name);
    const info = await stat(target);
    if (!info.isFile() || info.size !== expected.size_bytes || (await hashPath(target)) !== expected.sha256)
      throw new Error(`HMML index asset does not match runtime manifest: ${name}`);
  }
  if (combinedIndexHash(manifest.index.files) !== manifest.index.index_sha256)
    throw new Error("HMML combined index hash does not match runtime manifest");
  const rawIndex = JSON.parse(await readFile(path.join(knowledgeRoot, "method-index.json"), "utf8")) as MethodIndex;
  if (rawIndex.schema_version !== 2 || rawIndex.scoring?.strategy !== "hierarchical-parent-mean")
    throw new Error("unsupported HMML method index schema");
  const methods = rawIndex.methods.map((entry, index) => {
      const methodId = String(index);
      if (
        entry.method_id !== methodId ||
        entry.embedding_index !== index ||
        typeof entry.method !== "string" ||
        typeof entry.text !== "string" ||
        typeof entry.concept_id !== "string" ||
        !Array.isArray(entry.equivalent_method_ids)
      )
        throw new Error(`invalid HMML method index entry: ${methodId}`);
      return entry;
    });
  if (rawIndex.hierarchy_nodes.some((node, index) => node.embedding_index !== methods.length + index))
    throw new Error("invalid HMML hierarchy embedding order");
  if (methods.length !== manifest.index.method_count || methods.length !== manifest.knowledge_source.method_count)
    throw new Error("HMML method count does not match runtime manifest");
  if (new Set(methods.map((method) => method.concept_id)).size !== manifest.index.concept_count)
    throw new Error("HMML concept count does not match runtime manifest");
  if (rawIndex.hierarchy_nodes.length !== manifest.knowledge_source.hierarchy_node_count)
    throw new Error("HMML hierarchy count does not match runtime manifest");
  if (rawIndex.equivalence.sha256 !== manifest.knowledge_source.equivalence_sha256)
    throw new Error("HMML equivalence catalog does not match runtime manifest");
  return { manifest, methods, manifestPath, knowledgeRoot };
}

const TERM_EXPANSIONS: Array<[string, string[]]> = [
  ["排队", ["queue", "waiting"]], ["库存", ["inventory", "stock"]],
  ["线性规划", ["linear", "programming"]], ["整数", ["integer"]],
  ["路径", ["path", "route"]], ["聚类", ["clustering"]],
  ["回归", ["regression"]], ["分类", ["classification"]],
  ["预测", ["forecasting", "prediction"]], ["评价", ["evaluation"]],
  ["模糊", ["fuzzy"]], ["层次", ["hierarchy", "analytic"]],
  ["熵权", ["entropy", "weight"]], ["方差", ["variance"]],
  ["决策", ["decision"]], ["网络", ["network"]], ["最短", ["shortest"]],
  ["神经网络", ["neural", "network"]], ["时间序列", ["time", "series"]],
];

function tokens(value: string): string[] {
  const lower = value.toLowerCase();
  const result: string[] = lower.match(/[\p{L}\p{N}]+/gu) ?? [];
  for (const [needle, expansion] of TERM_EXPANSIONS)
    if (lower.includes(needle)) result.push(...expansion);
  return result;
}

function bm25(query: string, methods: MethodEntry[], topK: number): HmmlCandidate[] {
  const documents = methods.map((method) => tokens(method.text));
  const lengths = documents.map((document) => document.length);
  const averageLength = lengths.reduce((sum, value) => sum + value, 0) / Math.max(1, lengths.length);
  const queryTokens = [...new Set(tokens(query))];
  const documentFrequency = new Map<string, number>();
  for (const document of documents)
    for (const term of new Set(document)) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  const scores = documents.map((document, index) => {
    const frequency = new Map<string, number>();
    for (const term of document) frequency.set(term, (frequency.get(term) ?? 0) + 1);
    let score = 0;
    for (const term of queryTokens) {
      const tf = frequency.get(term) ?? 0;
      if (tf === 0) continue;
      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
      const denominator = tf + 1.5 * (1 - 0.75 + 0.75 * lengths[index]! / Math.max(1, averageLength));
      score += idf * (tf * 2.5) / denominator;
    }
    return score;
  });
  const primary = new Map(methods.map((method) => [method.method_id, method]));
  const concepts = new Map<string, { score: number; method: MethodEntry }>();
  scores.forEach((score, index) => {
    const method = methods[index]!;
    const current = concepts.get(method.concept_id);
    if (!current || score > current.score || (score === current.score && Number(method.method_id) < Number(current.method.method_id)))
      concepts.set(method.concept_id, { score, method });
  });
  return [...concepts.entries()]
    .map(([conceptId, value]) => ({ conceptId, ...value }))
    .sort((left, right) => right.score - left.score || Number(left.method.primary_method_id) - Number(right.method.primary_method_id))
    .slice(0, Math.min(topK, concepts.size))
    .map(({ conceptId, score, method }, rank) => {
      const canonical = primary.get(method.primary_method_id)!;
      return {
        rank: rank + 1,
        concept_id: conceptId,
        method_id: canonical.method_id,
        method: canonical.method,
        domain: canonical.domain,
        subdomain: canonical.subdomain,
        matched_method_id: method.method_id,
        equivalent_method_ids: canonical.equivalent_method_ids,
        score,
      };
    });
}

function conciseFailure(run: DenseRun): string {
  const output = (run.stderr || run.stdout).replaceAll("\0", "").trim().replaceAll(/\s+/gu, " ");
  const excerpt = output.length > 500 ? `${output.slice(0, 250)} ... ${output.slice(-250)}` : output;
  return `dense retrieval failed: exit=${String(run.exitCode)}${run.timedOut ? "; timed_out=true" : ""}${excerpt ? `; ${excerpt}` : ""}`;
}

function validateDenseCandidates(value: unknown, expectedCount: number, methods: MethodEntry[]): HmmlCandidate[] {
  if (!Array.isArray(value) || value.length !== expectedCount)
    throw new Error("dense runtime returned an invalid candidate count");
  const byId = new Map(methods.map((method) => [method.method_id, method]));
  const primaryByConcept = new Map(
    methods.filter((method) => method.method_id === method.primary_method_id).map((method) => [method.concept_id, method]),
  );
  const seen = new Set<string>();
  return value.map((raw, index) => {
    const candidate = raw as Partial<HmmlCandidate>;
    const canonical = typeof candidate.concept_id === "string" ? primaryByConcept.get(candidate.concept_id) : undefined;
    const matched = typeof candidate.matched_method_id === "string" ? byId.get(candidate.matched_method_id) : undefined;
    if (
      !canonical || !matched || matched.concept_id !== canonical.concept_id || seen.has(canonical.concept_id) ||
      candidate.rank !== index + 1 || candidate.method_id !== canonical.method_id || candidate.method !== canonical.method ||
      candidate.domain !== canonical.domain || candidate.subdomain !== canonical.subdomain ||
      JSON.stringify(candidate.equivalent_method_ids) !== JSON.stringify(canonical.equivalent_method_ids) ||
      typeof candidate.score !== "number" || !Number.isFinite(candidate.score) ||
      typeof candidate.parent_score !== "number" || !Number.isFinite(candidate.parent_score) ||
      typeof candidate.leaf_score !== "number" || !Number.isFinite(candidate.leaf_score)
    )
      throw new Error(`dense runtime returned an invalid candidate at rank ${index + 1}`);
    seen.add(canonical.concept_id);
    return candidate as HmmlCandidate;
  });
}

export async function retrieveHmml(options: HmmlOptions): Promise<HmmlRetrievalResult> {
  const query = options.query.trim();
  if (!query) throw new Error("query must not be empty");
  if (!Number.isSafeInteger(options.topK) || options.topK < 1 || options.topK > 20)
    throw new Error("top_k must be an integer between 1 and 20");
  const output = await resolveOutput(options.projectRoot, options.outputPath);
  const { manifest, methods, manifestPath, knowledgeRoot } = await loadRuntime(options.packageRoot);
  const sourceEnv = options.env ?? process.env;
  const cacheRoot = path.resolve(options.cacheRoot ?? sourceEnv.MM_AGENT_CACHE_DIR ?? defaultCacheRoot(sourceEnv));
  const python = process.platform === "win32"
    ? path.join(cacheRoot, "python", "Scripts", "python.exe")
    : path.join(cacheRoot, "python", "bin", "python");
  const snapshot = path.join(cacheRoot, ...manifest.selected_model.cache_subdir.split("/"));
  const codeSnapshot = manifest.selected_model.code
    ? path.join(cacheRoot, ...manifest.selected_model.code.cache_subdir.split("/"))
    : undefined;
  let retrievalMode: "dense" | "bm25" = "bm25";
  let candidates: HmmlCandidate[];
  let degradedReason: string | null = null;
  const denseAvailable = await isRegularFile(python) && await isDirectDirectory(snapshot) &&
    (!codeSnapshot || await isDirectDirectory(codeSnapshot));
  if ((options.mode ?? "auto") === "auto" && denseAvailable) {
    const runner = options.denseRunner ?? runDense;
    const run = await runner(
      python,
      [
        path.join(options.packageRoot, "runtime", "hmml_retrieve.py"),
        "--query", query,
        "--top-k", String(options.topK),
        "--knowledge-dir", knowledgeRoot,
        "--manifest", manifestPath,
        "--snapshot", snapshot,
        ...(codeSnapshot ? ["--code-snapshot", codeSnapshot] : []),
      ],
      {
        cwd: options.packageRoot,
        env: sanitizedDenseEnvironment(sourceEnv, cacheRoot),
        timeoutMs: options.denseTimeoutMs ?? 300_000,
      },
    );
    if (run.exitCode === 0 && !run.timedOut) {
      try {
        const parsed = JSON.parse(run.stdout) as { candidates?: unknown };
        candidates = validateDenseCandidates(
          parsed.candidates,
          Math.min(options.topK, manifest.index.concept_count),
          methods,
        );
        retrievalMode = "dense";
      } catch (error) {
        degradedReason = `dense retrieval returned invalid JSON: ${(error as Error).message}`;
        candidates = bm25(query, methods, options.topK);
      }
    } else {
      degradedReason = conciseFailure(run);
      candidates = bm25(query, methods, options.topK);
    }
  } else {
    degradedReason = options.mode === "bm25"
      ? "BM25 mode was explicitly requested"
      : `model cache or dedicated Python runtime is unavailable under ${cacheRoot}`;
    candidates = bm25(query, methods, options.topK);
  }
  const result: HmmlRetrievalResult = {
    schema_version: 1,
    knowledge_source: {
      path: manifest.knowledge_source.path,
      version: `sha256:${manifest.knowledge_source.sha256}`,
      sha256: manifest.knowledge_source.sha256,
    },
    query,
    retrieval_mode: retrievalMode,
    model: { ...manifest.selected_model, available: retrievalMode === "dense" },
    index: {
      revision: manifest.index.index_sha256,
      hash: manifest.index.index_sha256,
      method_count: manifest.index.method_count,
      concept_count: manifest.index.concept_count,
      embedding_dimension: manifest.selected_model.embedding_dimension,
      scoring: retrievalMode === "dense" ? "hierarchical-parent-mean" : "bm25-keyword",
    },
    candidates,
    degraded_reason: degradedReason,
    retrieved_at: (options.now ?? (() => new Date().toISOString()))(),
  };
  await writeJsonAtomic(output, result);
  return result;
}
