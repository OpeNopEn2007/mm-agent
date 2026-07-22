import { lstat } from "node:fs/promises";
import path from "node:path";
import { writeJsonAtomic } from "../core/paths.js";
import {
  assertAttemptPath,
  attemptBase,
  defaultCacheRoot,
  directInsideCase,
  environmentEvidence,
  inputHashes,
  nextEvidencePath,
  openCaseRoot,
  outputHashes,
  runCommand,
  sanitizedRuntimeEnvironment,
  type CommandRunner,
  type RuntimeEvidence,
  type RuntimeToolError,
  writeEvidence,
} from "./runtime.js";

export type ComputeOptions = {
  projectRoot: string;
  caseId: string;
  workDir: string;
  entryScript: string;
  args?: string[];
  inputPaths?: string[];
  outputPaths?: string[];
  timeoutMs?: number;
  cacheRoot?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  commandRunner?: CommandRunner;
};

export type ComputeManifest = {
  schema_version: 1;
  kind: "compute";
  created_at: string;
  status: "succeeded" | "failed";
  command: { executable: string; args: string[]; cwd: string };
  environment: Record<string, string>;
  timeout_ms: number;
  timed_out: boolean;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  inputs: Array<{ path: string; sha256: string }>;
  outputs: Array<{ path: string; sha256: string } | { path: string; missing: true }>;
  entry_script: { path: string; sha256: string };
};

export type ComputeResult =
  | { ok: true; evidence: RuntimeEvidence; manifest: ComputeManifest }
  | { ok: false; error: RuntimeToolError; evidence?: RuntimeEvidence; manifest?: ComputeManifest };

function failure(code: RuntimeToolError["code"], message: string, repair: RuntimeToolError["repair"]): ComputeResult {
  return { ok: false, error: { code, message, repair } };
}

function pythonPath(cacheRoot: string): string {
  return process.platform === "win32"
    ? path.join(cacheRoot, "python", "Scripts", "python.exe")
    : path.join(cacheRoot, "python", "bin", "python");
}

export async function runCompute(options: ComputeOptions): Promise<ComputeResult> {
  const timeoutMs = options.timeoutMs ?? 300_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3_600_000)
    return failure("INVALID_INPUT", "timeout_ms must be an integer between 1 and 3600000", "user");
  if (!Array.isArray(options.args ?? []) || !(options.args ?? []).every((item) => typeof item === "string"))
    return failure("INVALID_INPUT", "args must be an array of strings", "user");
  try {
    assertAttemptPath(options.workDir);
    if (!/^attempts\/solving\/[a-z0-9][a-z0-9-]{0,63}\/\d{3}\/code(?:\/|$)/u.test(options.workDir))
      return failure("INVALID_INPUT", "work_dir must be the current solving Attempt code directory", "user");
    const root = await openCaseRoot(options.projectRoot, options.caseId);
    const workingDirectory = await directInsideCase(root, options.workDir, "existing");
    const workInfo = await lstat(workingDirectory);
    if (!workInfo.isDirectory()) return failure("INVALID_INPUT", "work_dir must be a direct directory", "user");
    const scriptPath = `${options.workDir.replace(/\/$/u, "")}/${options.entryScript}`;
    const entry = await directInsideCase(root, scriptPath, "existing");
    const entryInfo = await lstat(entry);
    if (!entryInfo.isFile()) return failure("INVALID_INPUT", "entry_script must be a direct regular file inside work_dir", "user");
    if (path.dirname(entry) !== workingDirectory && !path.dirname(entry).startsWith(`${workingDirectory}${path.sep}`))
      return failure("PATH_ESCAPE", "entry_script must be inside work_dir", "user");

    const sourceEnv = options.env ?? process.env;
    const cacheRoot = path.resolve(options.cacheRoot ?? sourceEnv.MM_AGENT_CACHE_DIR ?? defaultCacheRoot(sourceEnv));
    const python = pythonPath(cacheRoot);
    const pythonInfo = await lstat(python).catch(() => undefined);
    if (!pythonInfo?.isFile() || pythonInfo.isSymbolicLink())
      return failure("RUNTIME_UNAVAILABLE", `MM-Agent Python 3.12 runtime is unavailable: ${python}`, "automatic");

    const inputs = await inputHashes(root, [scriptPath, ...(options.inputPaths ?? [])]);
    for (const output of options.outputPaths ?? []) {
      const absolute = await directInsideCase(root, output, "candidate");
      if (absolute !== workingDirectory && !absolute.startsWith(`${workingDirectory}${path.sep}`))
        return failure("PATH_ESCAPE", `output path is outside work_dir: ${output}`, "user");
    }
    const env = sanitizedRuntimeEnvironment(sourceEnv, cacheRoot);
    const relativeEntry = path.relative(workingDirectory, entry);
    const command = await (options.commandRunner ?? runCommand)(
      python,
      ["-I", relativeEntry, ...(options.args ?? [])],
      { cwd: workingDirectory, env, timeoutMs },
    );
    const status = command.exitCode === 0 && !command.timedOut ? "succeeded" : "failed";
    const evidencePath = await nextEvidencePath(root, attemptBase(options.workDir), "compute");
    const manifest: ComputeManifest = {
      schema_version: 1,
      kind: "compute",
      created_at: (options.now ?? (() => new Date().toISOString()))(),
      status,
      command: { executable: python, args: ["-I", relativeEntry, ...(options.args ?? [])], cwd: options.workDir },
      environment: environmentEvidence(env),
      timeout_ms: timeoutMs,
      timed_out: command.timedOut,
      exit_code: command.exitCode,
      stdout: command.stdout,
      stderr: command.stderr,
      inputs,
      outputs: await outputHashes(root, options.outputPaths ?? [], workingDirectory),
      entry_script: { path: scriptPath, sha256: inputs[0]!.sha256 },
    };
    const evidence = await writeEvidence(root, evidencePath, manifest);
    const executionResult = `${attemptBase(options.workDir)}/execution-result.json`;
    await writeJsonAtomic(await directInsideCase(root, executionResult, "candidate"), evidence);
    return status === "succeeded"
      ? { ok: true, evidence, manifest }
      : {
          ok: false,
          error: {
            code: "EXECUTION_FAILED",
            message: `Python exited with ${String(command.exitCode)}${command.timedOut ? " after timeout" : ""}; see ${evidencePath}`,
            repair: "none",
          },
          evidence,
          manifest,
        };
  } catch (error) {
    const message = (error as Error).message;
    return failure(message.includes("does not exist") ? "CASE_NOT_FOUND" : "PATH_ESCAPE", message, "user");
  }
}
