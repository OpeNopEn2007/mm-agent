import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rm,
  rmdir,
  stat,
  unlink,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { hashPath } from "../core/paths.js";

export type CheckStatus = "pass" | "warn" | "fail";
export type RepairKind = "automatic" | "user" | "none";
export type CheckScope = "all" | "environment" | "case" | "hmml" | "tex";

export type CheckItem = {
  id: string;
  status: CheckStatus;
  evidence: string;
  repair: RepairKind;
};

export type CheckResult = {
  ok: boolean;
  checks: CheckItem[];
};

export type PreflightOptions = {
  projectRoot: string;
  packageRoot: string;
  scope?: CheckScope;
  caseId?: string;
  cacheRoot?: string;
  env?: NodeJS.ProcessEnv;
  commandTimeoutMs?: number;
  executableResolver?: ExecutableResolver;
  commandRunner?: CommandRunner;
};

export type CommandResult = {
  executable: string;
  args: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  errorCode?: string;
};

export type ExecutableResolver = (
  name: string,
  env: NodeJS.ProcessEnv,
) => Promise<string | undefined>;
export type CommandRunner = (
  executable: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
) => Promise<CommandResult>;

const CASE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const MAX_CAPTURE = 32 * 1024;
const HMML_FILES = [
  "hmml.json",
  "method-index.json",
  "hmml-embeddings.npy",
  "embedding-meta.json",
] as const;

function cleanOutput(value: string): string {
  const normalized = value.replaceAll("\0", "").trim();
  return normalized.length <= 2_000
    ? normalized
    : `${normalized.slice(0, 1_000)} ... ${normalized.slice(-1_000)}`;
}

function commandText(result: CommandResult): string {
  const command = [result.executable, ...result.args].join(" ");
  const output = cleanOutput(result.stdout || result.stderr);
  return `${command}; exit=${String(result.exitCode)}${result.timedOut ? "; timed_out=true" : ""}${output ? `; output=${output}` : ""}`;
}

function sanitizedEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result = { ...source };
  for (const key of [
    "VIRTUAL_ENV",
    "PYTHONHOME",
    "PYTHONPATH",
    "CONDA_PREFIX",
    "PIP_TARGET",
  ])
    delete result[key];
  const pathKey = Object.keys(result).find((key) => key.toUpperCase() === "PATH");
  if (pathKey && result[pathKey]) {
    result[pathKey] = result[pathKey]
      .split(path.delimiter)
      .filter((entry) => !entry.split(/[\\/]+/u).some((part) => part.toLowerCase() === ".venv"))
      .join(path.delimiter);
  }
  result.PYTHONNOUSERSITE = "1";
  result.UV_PYTHON_DOWNLOADS = "never";
  return result;
}

async function isRegularFile(filePath: string): Promise<boolean> {
  try {
    return (await lstat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function isDirectDirectory(directoryPath: string): Promise<boolean> {
  try {
    const info = await lstat(directoryPath);
    return info.isDirectory() && !info.isSymbolicLink();
  } catch {
    return false;
  }
}

async function resolveExecutable(
  name: string,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  if (path.isAbsolute(name)) return (await isRegularFile(name)) ? name : undefined;
  const pathValue =
    Object.entries(env).find(([key]) => key.toUpperCase() === "PATH")?.[1] ?? "";
  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    const candidates =
      process.platform === "win32"
        ? [
            path.join(directory, `${name}.exe`),
            ...(name === "opencode"
              ? [
                  path.join(
                    directory,
                    "node_modules",
                    "opencode-ai",
                    "bin",
                    "opencode.exe",
                  ),
                ]
              : []),
            path.join(directory, `${name}.com`),
            path.join(directory, name),
          ]
        : [path.join(directory, name)];
    for (const candidate of candidates)
      if (await isRegularFile(candidate)) return candidate;
  }
  return undefined;
}

async function runCommand(
  executable: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeoutMs: number;
  },
): Promise<CommandResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const capture = (current: string, chunk: unknown): string =>
      `${current}${String(chunk)}`.slice(-MAX_CAPTURE);
    child.stdout.on("data", (chunk) => {
      stdout = capture(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = capture(stderr, chunk);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs);
    const finish = (result: CommandResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    child.once("error", (error: NodeJS.ErrnoException) =>
      finish({
        executable,
        args,
        exitCode: null,
        stdout,
        stderr: `${stderr}${error.message}`,
        timedOut,
        ...(error.code ? { errorCode: error.code } : {}),
      }),
    );
    child.once("close", (exitCode) =>
      finish({ executable, args, exitCode, stdout, stderr, timedOut }),
    );
  });
}

function parseVersion(value: string): [number, number, number] | undefined {
  const match = /(?:^|\s)v?(\d+)\.(\d+)\.(\d+)(?:\s|$)/u.exec(value.trim());
  return match?.[1] && match[2] && match[3]
    ? [Number(match[1]), Number(match[2]), Number(match[3])]
    : undefined;
}

function defaultCacheRoot(env: NodeJS.ProcessEnv): string {
  if (process.platform === "win32")
    return path.join(env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "mm-agent");
  if (process.platform === "darwin")
    return path.join(os.homedir(), "Library", "Caches", "mm-agent");
  return path.join(env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"), "mm-agent");
}

async function nodeCheck(): Promise<CheckItem> {
  const version = process.version;
  const major = Number(/^v(\d+)/u.exec(version)?.[1]);
  return Number.isInteger(major) && major >= 20
    ? {
        id: "node",
        status: "pass",
        evidence: `${process.execPath} --version; exit=0; output=${version}`,
        repair: "none",
      }
    : {
        id: "node",
        status: "fail",
        evidence: `${process.execPath} reports ${version}; Node 20 or newer is required`,
        repair: "user",
      };
}

async function opencodeCheck(
  packageRoot: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
  resolve: ExecutableResolver,
  runner: CommandRunner,
): Promise<CheckItem> {
  const executable = await resolve("opencode", env);
  if (!executable)
    return {
      id: "opencode",
      status: "fail",
      evidence: "OpenCode executable was not found on the sanitized PATH",
      repair: "user",
    };
  const result = await runner(executable, ["--version"], {
    cwd: packageRoot,
    env,
    timeoutMs,
  });
  if (result.exitCode !== 0)
    return {
      id: "opencode",
      status: "fail",
      evidence: commandText(result),
      repair: "user",
    };
  let apiVersion: string | undefined;
  try {
    const packageJson = JSON.parse(
      await readFile(path.join(packageRoot, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    apiVersion = packageJson.dependencies?.["@opencode-ai/plugin"];
  } catch {
    apiVersion = undefined;
  }
  const host = parseVersion(result.stdout);
  const api = apiVersion ? parseVersion(apiVersion) : undefined;
  if (!host || !api)
    return {
      id: "opencode",
      status: "fail",
      evidence: `${commandText(result)}; unable to compare installed host with Plugin API ${String(apiVersion)}`,
      repair: "automatic",
    };
  const compatible =
    host[0] === api[0] && host[1] === api[1] && host[2] >= api[2];
  return compatible
    ? {
        id: "opencode",
        status: "pass",
        evidence: `${commandText(result)}; Plugin API=${apiVersion}`,
        repair: "none",
      }
    : {
        id: "opencode",
        status: "fail",
        evidence: `${commandText(result)}; incompatible Plugin API=${apiVersion}`,
        repair: "user",
      };
}

async function uvChecks(
  projectRoot: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
  resolve: ExecutableResolver,
  runner: CommandRunner,
): Promise<CheckItem[]> {
  const executable = await resolve("uv", env);
  if (!executable)
    return [
      {
        id: "uv",
        status: "fail",
        evidence: "uv executable was not found on the sanitized PATH",
        repair: "automatic",
      },
      {
        id: "python-3.12",
        status: "fail",
        evidence: "Python 3.12 availability was not probed because uv is missing",
        repair: "automatic",
      },
    ];
  const uv = await runner(executable, ["--version"], {
    cwd: projectRoot,
    env,
    timeoutMs,
  });
  const uvItem: CheckItem =
    uv.exitCode === 0
      ? {
          id: "uv",
          status: "pass",
          evidence: commandText(uv),
          repair: "none",
        }
      : {
          id: "uv",
          status: "fail",
          evidence: commandText(uv),
          repair: "automatic",
        };
  const python = await runner(
    executable,
    [
      "python",
      "find",
      "--no-project",
      "--no-python-downloads",
      "--show-version",
      "3.12",
    ],
    { cwd: projectRoot, env, timeoutMs },
  );
  const pythonItem: CheckItem =
    python.exitCode === 0 && /^3\.12(?:\.|$)/u.test(python.stdout.trim())
      ? {
          id: "python-3.12",
          status: "pass",
          evidence: `${commandText(python)}; project discovery disabled; downloads disabled`,
          repair: "none",
        }
      : {
          id: "python-3.12",
          status: "fail",
          evidence: `${commandText(python)}; project discovery disabled; downloads disabled; no user .venv was read`,
          repair: "automatic",
        };
  return [uvItem, pythonItem];
}

async function caseWriteCheck(
  projectRoot: string,
  caseId: string | undefined,
): Promise<CheckItem> {
  if (caseId && !CASE_ID.test(caseId))
    return {
      id: "case-write",
      status: "fail",
      evidence: `invalid Case ID: ${caseId}`,
      repair: "user",
    };
  const runsRoot = path.join(projectRoot, "runs");
  let createdRunsRoot = false;
  let probe: string | undefined;
  try {
    const canonicalProject = await realpath(projectRoot);
    try {
      const info = await lstat(runsRoot);
      if (!info.isDirectory() || info.isSymbolicLink())
        throw new Error("runs path is not a direct directory");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await mkdir(runsRoot);
      createdRunsRoot = true;
    }
    const canonicalRuns = await realpath(runsRoot);
    if (path.dirname(canonicalRuns) !== canonicalProject)
      throw new Error("runs directory resolves outside the project root");
    probe = path.join(
      runsRoot,
      `.mm-agent-write-probe-${process.pid}-${randomUUID()}`,
    );
    const handle = await open(probe, "wx");
    await handle.writeFile("mm-agent preflight\n", "utf8");
    await handle.close();
    await unlink(probe);
    probe = undefined;
    if (createdRunsRoot) await rmdir(runsRoot);
    return {
      id: "case-write",
      status: "pass",
      evidence: `exclusive write/delete probe passed at ${runsRoot}${caseId ? ` for Case ${caseId}` : ""}`,
      repair: "none",
    };
  } catch (error) {
    if (probe) await unlink(probe).catch(() => undefined);
    if (createdRunsRoot) await rmdir(runsRoot).catch(() => undefined);
    return {
      id: "case-write",
      status: "fail",
      evidence: `write probe failed at ${runsRoot}: ${(error as Error).message}`,
      repair: "user",
    };
  }
}

async function hmmlChecks(
  packageRoot: string,
  cacheRoot: string,
): Promise<CheckItem[]> {
  const indexRoot = path.join(packageRoot, "knowledge", "hmml");
  const manifestPath = path.join(packageRoot, "runtime", "hmml-manifest.json");
  const present: Array<{ name: string; size: number; sha256: string }> = [];
  const missing: string[] = [];
  for (const name of HMML_FILES) {
    const filePath = path.join(indexRoot, name);
    try {
      const info = await stat(filePath);
      if (!info.isFile() || info.size === 0) throw new Error("not a non-empty file");
      if (name.endsWith(".json")) JSON.parse(await readFile(filePath, "utf8"));
      present.push({ name, size: info.size, sha256: await hashPath(filePath) });
    } catch {
      missing.push(name);
    }
  }
  let selectedCacheSubdir: string | undefined;
  let selectedCodeCacheSubdir: string | undefined;
  let index: CheckItem;
  try {
    if (missing.length > 0) throw new Error(`missing or invalid files: ${missing.join(", ")}`);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      schema_version?: unknown;
      knowledge_source?: {
        sha256?: unknown;
        method_count?: unknown;
        concept_count?: unknown;
        hierarchy_node_count?: unknown;
        equivalence_sha256?: unknown;
      };
      selected_model?: {
        id?: unknown;
        revision?: unknown;
        embedding_dimension?: unknown;
        cache_subdir?: unknown;
        code?: { id?: unknown; revision?: unknown; files_sha256?: unknown; cache_subdir?: unknown };
      };
      index?: {
        index_sha256?: unknown;
        method_count?: unknown;
        concept_count?: unknown;
        embedding_row_count?: unknown;
        files?: Record<string, { sha256?: unknown; size_bytes?: unknown }>;
      };
    };
    if (manifest.schema_version !== 1 || typeof manifest.index?.index_sha256 !== "string")
      throw new Error("invalid runtime manifest schema");
    if (typeof manifest.selected_model?.cache_subdir !== "string")
      throw new Error("runtime manifest has no selected model cache path");
    selectedCacheSubdir = manifest.selected_model.cache_subdir;
    if (manifest.selected_model.code) {
      if (typeof manifest.selected_model.code.cache_subdir !== "string")
        throw new Error("runtime manifest has no selected model code cache path");
      selectedCodeCacheSubdir = manifest.selected_model.code.cache_subdir;
    }
    const knowledgeHash = await hashPath(path.join(indexRoot, "hmml.json"));
    if (knowledgeHash !== manifest.knowledge_source?.sha256)
      throw new Error("knowledge source hash mismatch");
    const digest = createHash("sha256");
    for (const name of ["embedding-meta.json", "hmml-embeddings.npy", "method-index.json"].sort()) {
      const actual = present.find((item) => item.name === name);
      const expected = manifest.index.files?.[name];
      if (!actual || actual.sha256 !== expected?.sha256 || actual.size !== expected.size_bytes)
        throw new Error(`${name} does not match runtime manifest`);
      digest.update(name).update("\0").update(actual.sha256).update("\n");
    }
    if (digest.digest("hex") !== manifest.index.index_sha256)
      throw new Error("combined index hash mismatch");
    const meta = JSON.parse(await readFile(path.join(indexRoot, "embedding-meta.json"), "utf8")) as {
      model?: { id?: unknown; revision?: unknown; code?: { id?: unknown; revision?: unknown; files_sha256?: unknown } };
      embedding_dimension?: unknown;
      method_count?: unknown;
      concept_count?: unknown;
      hierarchy_node_count?: unknown;
      embedding_row_count?: unknown;
      knowledge_source?: { equivalence_sha256?: unknown };
      scoring?: { strategy?: unknown; parent_weight?: unknown; child_weight?: unknown };
    };
    if (
      meta.model?.id !== manifest.selected_model.id ||
      meta.model?.revision !== manifest.selected_model.revision ||
      meta.embedding_dimension !== manifest.selected_model.embedding_dimension ||
      meta.method_count !== manifest.index.method_count ||
      meta.concept_count !== manifest.index.concept_count ||
      meta.hierarchy_node_count !== manifest.knowledge_source?.hierarchy_node_count ||
      meta.embedding_row_count !== manifest.index.embedding_row_count ||
      meta.embedding_row_count !== Number(meta.method_count) + Number(meta.hierarchy_node_count) ||
      manifest.index.method_count !== manifest.knowledge_source?.method_count ||
      manifest.index.concept_count !== manifest.knowledge_source?.concept_count ||
      meta.knowledge_source?.equivalence_sha256 !== manifest.knowledge_source?.equivalence_sha256 ||
      meta.scoring?.strategy !== "hierarchical-parent-mean" ||
      meta.scoring.parent_weight !== 0.5 || meta.scoring.child_weight !== 0.5
    )
      throw new Error("embedding metadata does not match selected model or method count");
    const methodIndex = JSON.parse(await readFile(path.join(indexRoot, "method-index.json"), "utf8")) as {
      schema_version?: unknown;
      scoring?: { strategy?: unknown };
      methods?: unknown[];
      hierarchy_nodes?: unknown[];
      equivalence?: { sha256?: unknown };
    };
    if (
      methodIndex.schema_version !== 2 || methodIndex.scoring?.strategy !== "hierarchical-parent-mean" ||
      methodIndex.methods?.length !== manifest.index.method_count ||
      methodIndex.hierarchy_nodes?.length !== manifest.knowledge_source?.hierarchy_node_count ||
      methodIndex.equivalence?.sha256 !== manifest.knowledge_source?.equivalence_sha256
    )
      throw new Error("method index hierarchy does not match runtime manifest");
    if (JSON.stringify(meta.model?.code ?? null) !== JSON.stringify(manifest.selected_model.code
      ? {
          id: manifest.selected_model.code.id,
          revision: manifest.selected_model.code.revision,
          files_sha256: manifest.selected_model.code.files_sha256,
        }
      : null))
      throw new Error("embedding metadata does not match selected model code");
    index = {
      id: "hmml-index",
      status: "pass",
      evidence: `selected HMML runtime is consistent: model=${String(manifest.selected_model.id)}@${String(manifest.selected_model.revision)}; methods=${String(manifest.index.method_count)}; dim=${String(manifest.selected_model.embedding_dimension)}; index_sha256=${manifest.index.index_sha256}`,
      repair: "none",
    };
  } catch (error) {
    index = {
      id: "hmml-index",
      status: "warn",
      evidence: `HMML runtime is not finalized or inconsistent: ${(error as Error).message}; readable candidates=${present.map((item) => `${item.name}:${item.size}:${item.sha256.slice(0, 12)}`).join(", ") || "none"}`,
      repair: "automatic",
    };
  }
  let cache: CheckItem;
  try {
    const info = await lstat(cacheRoot);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error("cache path is not a direct directory");
    await access(cacheRoot, constants.R_OK | constants.W_OK);
    const snapshot = selectedCacheSubdir
      ? path.join(cacheRoot, ...selectedCacheSubdir.split("/"))
      : undefined;
    const codeSnapshot = selectedCodeCacheSubdir
      ? path.join(cacheRoot, ...selectedCodeCacheSubdir.split("/"))
      : undefined;
    if ((snapshot && !(await isDirectDirectory(snapshot))) || (codeSnapshot && !(await isDirectDirectory(codeSnapshot))))
      cache = {
        id: "hmml-cache",
        status: "warn",
        evidence: `dedicated cache is readable and writable but a selected model snapshot is unavailable: model=${snapshot ?? "none"}; code=${codeSnapshot ?? "none"}; BM25 fallback remains usable`,
        repair: "automatic",
      };
    else
      cache = {
        id: "hmml-cache",
        status: "pass",
        evidence: `dedicated cache directory is readable and writable: ${cacheRoot}${snapshot ? `; selected model snapshot=${snapshot}` : ""}${codeSnapshot ? `; selected model code snapshot=${codeSnapshot}` : ""}`,
        repair: "none",
      };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    cache = {
      id: "hmml-cache",
      status: "warn",
      evidence:
        code === "ENOENT"
          ? `dedicated cache directory does not exist yet: ${cacheRoot}`
          : `dedicated cache is unavailable: ${cacheRoot}; ${(error as Error).message}`,
      repair: code === "ENOENT" ? "automatic" : "user",
    };
  }
  return [index, cache];
}

async function texCheck(
  packageRoot: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
  resolve: ExecutableResolver,
  runner: CommandRunner,
): Promise<CheckItem> {
  const executable = await resolve("xelatex", env);
  if (!executable)
    return {
      id: "tex-template",
      status: "fail",
      evidence: "xelatex executable was not found on the sanitized PATH; no version-only fallback was used",
      repair: "user",
    };
  const templateRoot = path.join(packageRoot, "templates", "cumcmthesis");
  const template = path.join(templateRoot, "example.tex");
  if (!(await isRegularFile(template)))
    return {
      id: "tex-template",
      status: "fail",
      evidence: `bundled TeX template is missing: ${template}`,
      repair: "automatic",
    };
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "mm-agent-tex-check-"));
  try {
    const result = await runner(
      executable,
      [
        "-interaction=nonstopmode",
        "-halt-on-error",
        "-no-shell-escape",
        `-output-directory=${outputRoot}`,
        "example.tex",
      ],
      { cwd: templateRoot, env, timeoutMs: Math.max(timeoutMs, 120_000) },
    );
    const pdfPath = path.join(outputRoot, "example.pdf");
    let pdfSize = 0;
    try {
      pdfSize = (await stat(pdfPath)).size;
    } catch {
      pdfSize = 0;
    }
    return result.exitCode === 0 && pdfSize > 0
      ? {
          id: "tex-template",
          status: "pass",
          evidence: `${commandText(result)}; template=templates/cumcmthesis/example.tex; pdf_bytes=${pdfSize}`,
          repair: "none",
        }
      : {
          id: "tex-template",
          status: "fail",
          evidence: `${commandText(result)}; template=templates/cumcmthesis/example.tex; pdf_bytes=${pdfSize}`,
          repair: "user",
        };
  } finally {
    await rm(outputRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function runPreflight(
  options: PreflightOptions,
): Promise<CheckResult> {
  const scope = options.scope ?? "all";
  const env = sanitizedEnvironment(options.env ?? process.env);
  const cacheRoot = options.cacheRoot ?? env.MM_AGENT_CACHE_DIR ?? defaultCacheRoot(env);
  env.UV_PYTHON_INSTALL_DIR = path.join(cacheRoot, "python-installations");
  env.UV_CACHE_DIR = path.join(cacheRoot, "uv");
  const timeoutMs = options.commandTimeoutMs ?? 30_000;
  const resolve = options.executableResolver ?? resolveExecutable;
  const runner = options.commandRunner ?? runCommand;
  const checks: CheckItem[] = [];
  if (scope === "all" || scope === "environment") {
    checks.push(await nodeCheck());
    checks.push(
      await opencodeCheck(
        options.packageRoot,
        env,
        timeoutMs,
        resolve,
        runner,
      ),
    );
    checks.push(
      ...(await uvChecks(
        options.projectRoot,
        env,
        timeoutMs,
        resolve,
        runner,
      )),
    );
  }
  if (scope === "all" || scope === "case")
    checks.push(await caseWriteCheck(options.projectRoot, options.caseId));
  if (scope === "all" || scope === "hmml")
    checks.push(
      ...(await hmmlChecks(
        options.packageRoot,
        cacheRoot,
      )),
    );
  if (scope === "all" || scope === "tex")
    checks.push(
      await texCheck(
        options.packageRoot,
        env,
        timeoutMs,
        resolve,
        runner,
      ),
    );
  return { ok: checks.every((check) => check.status !== "fail"), checks };
}
