import { spawn } from "node:child_process";
import { lstat, mkdir, readdir, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { hashPath, resolveInsideCase, writeJsonAtomic } from "../core/paths.js";
export type RuntimeEvidence = {
  schema_version: 1;
  kind: string;
  path: string;
  sha256: string;
  created_at: string;
  status: "succeeded" | "failed";
  exit_code?: number;
};

export type RuntimeToolError = {
  code: "CASE_NOT_FOUND" | "PATH_ESCAPE" | "RUNTIME_UNAVAILABLE" | "EXECUTION_FAILED" | "INVALID_INPUT";
  message: string;
  repair: "automatic" | "user" | "none";
};

export type CommandRun = {
  executable: string;
  args: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  errorCode?: string;
};

export type CommandRunner = (
  executable: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
) => Promise<CommandRun>;

const CASE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const ATTEMPT_ROOT = /^attempts\/(?:analysis|modeling|reporting|solving\/[a-z0-9][a-z0-9-]{0,63})\/\d{3}(?:\/|$)/u;
const MAX_CAPTURE = 256 * 1024;

export function defaultCacheRoot(env: NodeJS.ProcessEnv): string {
  if (process.platform === "win32")
    return path.join(env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "mm-agent");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Caches", "mm-agent");
  return path.join(env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"), "mm-agent");
}

export function sanitizedRuntimeEnvironment(
  source: NodeJS.ProcessEnv,
  cacheRoot: string,
): NodeJS.ProcessEnv {
  const env = { ...source };
  for (const key of ["VIRTUAL_ENV", "PYTHONHOME", "PYTHONPATH", "CONDA_PREFIX", "PIP_TARGET"])
    delete env[key];
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === "PATH");
  if (pathKey && env[pathKey])
    env[pathKey] = env[pathKey]
      .split(path.delimiter)
      .filter((entry) => !entry.split(/[\\/]+/u).some((part) => part.toLowerCase() === ".venv"))
      .join(path.delimiter);
  env.PYTHONNOUSERSITE = "1";
  env.PYTHONSAFEPATH = "1";
  env.PYTHONUTF8 = "1";
  env.MM_AGENT_CACHE_DIR = cacheRoot;
  env.UV_PROJECT_ENVIRONMENT = path.join(cacheRoot, "python");
  env.UV_PYTHON_INSTALL_DIR = path.join(cacheRoot, "python-installations");
  env.UV_CACHE_DIR = path.join(cacheRoot, "uv");
  return env;
}

export function environmentEvidence(env: NodeJS.ProcessEnv): Record<string, string> {
  const keys = [
    "MM_AGENT_CACHE_DIR",
    "PYTHONNOUSERSITE",
    "PYTHONSAFEPATH",
    "PYTHONUTF8",
    "UV_PROJECT_ENVIRONMENT",
    "UV_PYTHON_INSTALL_DIR",
    "UV_CACHE_DIR",
  ];
  return Object.fromEntries(keys.flatMap((key) => env[key] === undefined ? [] : [[key, env[key]!]]));
}

export async function runCommand(
  executable: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
): Promise<CommandRun> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const child = spawn(executable, args, {
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
    const finish = (result: CommandRun): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    child.once("error", (error: NodeJS.ErrnoException) => finish({
      executable, args, exitCode: null, stdout, stderr: `${stderr}${error.message}`, timedOut,
      ...(error.code ? { errorCode: error.code } : {}),
    }));
    child.once("close", (exitCode) => finish({ executable, args, exitCode, stdout, stderr, timedOut }));
  });
}

export async function openCaseRoot(projectRoot: string, caseId: string): Promise<string> {
  if (!CASE_ID.test(caseId)) throw new Error(`invalid Case ID: ${caseId}`);
  const project = await realpath(projectRoot);
  const runs = path.join(project, "runs");
  const runsInfo = await lstat(runs).catch(() => undefined);
  if (!runsInfo?.isDirectory() || runsInfo.isSymbolicLink()) throw new Error("runs directory is unavailable or linked");
  const root = path.join(runs, caseId);
  const info = await lstat(root).catch(() => undefined);
  if (!info?.isDirectory() || info.isSymbolicLink()) throw new Error(`Case ${caseId} does not exist or is linked`);
  const canonicalRuns = await realpath(runs);
  const canonicalRoot = await realpath(root);
  if (path.dirname(canonicalRoot) !== canonicalRuns) throw new Error(`Case ${caseId} escapes runs directory`);
  return canonicalRoot;
}

export async function directInsideCase(
  root: string,
  relative: string,
  mode: "existing" | "candidate",
): Promise<string> {
  const absolute = await resolveInsideCase(root, relative, mode);
  if (mode === "existing") {
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw new Error(`linked path is not allowed: ${relative}`);
  }
  return absolute;
}

export function assertAttemptPath(relative: string): void {
  if (!ATTEMPT_ROOT.test(relative)) throw new Error(`work_dir must be inside one Attempt: ${relative}`);
}

export function attemptBase(relative: string): string {
  const match = /^(attempts\/(?:analysis|modeling|reporting|solving\/[a-z0-9][a-z0-9-]{0,63})\/\d{3})/u.exec(relative);
  if (!match?.[1]) throw new Error(`work_dir must be inside one Attempt: ${relative}`);
  return match[1];
}

export async function inputHashes(root: string, paths: string[]): Promise<Array<{ path: string; sha256: string }>> {
  const seen = new Set<string>();
  const result: Array<{ path: string; sha256: string }> = [];
  for (const relative of paths) {
    if (seen.has(relative)) continue;
    seen.add(relative);
    const absolute = await directInsideCase(root, relative, "existing");
    result.push({ path: relative, sha256: await hashPath(absolute) });
  }
  return result;
}

export async function outputHashes(
  root: string,
  paths: string[],
  workingDirectory: string,
): Promise<Array<{ path: string; sha256: string } | { path: string; missing: true }>> {
  const result: Array<{ path: string; sha256: string } | { path: string; missing: true }> = [];
  for (const relative of [...new Set(paths)]) {
    const absolute = await directInsideCase(root, relative, "candidate");
    if (absolute !== workingDirectory && !absolute.startsWith(`${workingDirectory}${path.sep}`))
      throw new Error(`output path is outside work_dir: ${relative}`);
    try {
      const existing = await directInsideCase(root, relative, "existing");
      result.push({ path: relative, sha256: await hashPath(existing) });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") result.push({ path: relative, missing: true });
      else throw error;
    }
  }
  return result;
}

export async function nextEvidencePath(root: string, base: string, kind: "compute" | "compile"): Promise<string> {
  const evidence = await directInsideCase(root, `${base}/evidence/`, "candidate");
  await mkdir(evidence, { recursive: true });
  const entries = await readdir(evidence, { withFileTypes: true });
  const sequence = Math.max(0, ...entries
    .filter((entry) => entry.isFile() && new RegExp(`^${kind}-\\d{3}-manifest\\.json$`, "u").test(entry.name))
    .map((entry) => Number(entry.name.slice(kind.length + 1, kind.length + 4)))) + 1;
  return `${base}/evidence/${kind}-${String(sequence).padStart(3, "0")}-manifest.json`;
}

export async function writeEvidence(
  root: string,
  evidencePath: string,
  value: Record<string, unknown>,
): Promise<RuntimeEvidence> {
  const absolute = await directInsideCase(root, evidencePath, "candidate");
  await writeJsonAtomic(absolute, value);
  return {
    schema_version: 1,
    kind: String(value.kind),
    path: evidencePath,
    sha256: await hashPath(absolute),
    created_at: String(value.created_at),
    status: value.status === "succeeded" ? "succeeded" : "failed",
    ...(typeof value.exit_code === "number" ? { exit_code: value.exit_code } : {}),
  };
}

export async function nonEmptyFile(target: string): Promise<boolean> {
  try {
    const info = await stat(target);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}
