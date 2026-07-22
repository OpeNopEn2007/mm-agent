import { lstat, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertAttemptPath,
  attemptBase,
  defaultCacheRoot,
  directInsideCase,
  environmentEvidence,
  inputHashes,
  nextEvidencePath,
  nonEmptyFile,
  openCaseRoot,
  outputHashes,
  runCommand,
  sanitizedRuntimeEnvironment,
  type CommandRun,
  type CommandRunner,
  type RuntimeEvidence,
  type RuntimeToolError,
  writeEvidence,
} from "./runtime.js";
import { writeJsonAtomic } from "../core/paths.js";

export type ExecutableResolver = (name: string, env: NodeJS.ProcessEnv) => Promise<string | undefined>;
export type CompileOptions = {
  projectRoot: string;
  caseId: string;
  workDir: string;
  mainTex?: string;
  timeoutMs?: number;
  cacheRoot?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  executableResolver?: ExecutableResolver;
  commandRunner?: CommandRunner;
};

export type CompileManifest = {
  schema_version: 1;
  kind: "compile";
  created_at: string;
  status: "succeeded" | "failed";
  engine: "latexmk" | "xelatex" | "unavailable";
  commands: Array<{ executable: string; args: string[]; exit_code: number | null; timed_out: boolean }>;
  environment: Record<string, string>;
  timeout_ms: number;
  stdout: string;
  stderr: string;
  errors: string[];
  inputs: Array<{ path: string; sha256: string }>;
  outputs: Array<{ path: string; sha256: string } | { path: string; missing: true }>;
  pdf: { path: string; sha256: string } | null;
};

export type CompileResult =
  | { ok: true; evidence: RuntimeEvidence; manifest: CompileManifest }
  | { ok: false; error: RuntimeToolError; evidence?: RuntimeEvidence; manifest?: CompileManifest };

function failure(code: RuntimeToolError["code"], message: string, repair: RuntimeToolError["repair"]): CompileResult {
  return { ok: false, error: { code, message, repair } };
}

async function resolveExecutable(name: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
  const pathValue = Object.entries(env).find(([key]) => key.toUpperCase() === "PATH")?.[1] ?? "";
  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const candidate of process.platform === "win32"
      ? [path.join(directory, `${name}.exe`), path.join(directory, `${name}.com`), path.join(directory, name)]
      : [path.join(directory, name)]) {
      try {
        const info = await lstat(candidate);
        if (info.isFile() && !info.isSymbolicLink()) return candidate;
      } catch {
        continue;
      }
    }
  }
  return undefined;
}

function structuredErrors(stdout: string, stderr: string): string[] {
  const lines = `${stdout}\n${stderr}`.split(/\r?\n/u);
  const errors = lines.filter((line) => /^! |^l\.\d+/u.test(line.trim())).map((line) => line.trim());
  if (errors.length > 0) return [...new Set(errors)].slice(0, 20);
  const tail = lines.filter(Boolean).slice(-12).join("\n").trim();
  return tail ? [tail] : ["TeX exited without a structured diagnostic"];
}

function runSummary(run: CommandRun): string {
  return [`$ ${run.executable} ${run.args.join(" ")}`, run.stdout, run.stderr].filter(Boolean).join("\n");
}

export async function runCompile(options: CompileOptions): Promise<CompileResult> {
  const timeoutMs = options.timeoutMs ?? 300_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3_600_000)
    return failure("INVALID_INPUT", "timeout_ms must be an integer between 1 and 3600000", "user");
  try {
    assertAttemptPath(options.workDir);
    if (!/^attempts\/reporting\/\d{3}\/?$/u.test(options.workDir))
      return failure("INVALID_INPUT", "work_dir must be the current reporting Attempt directory", "user");
    const root = await openCaseRoot(options.projectRoot, options.caseId);
    const workDir = options.workDir.replace(/\/$/u, "");
    const workingDirectory = await directInsideCase(root, workDir, "existing");
    const workInfo = await lstat(workingDirectory);
    if (!workInfo.isDirectory()) return failure("INVALID_INPUT", "work_dir must be a direct directory", "user");
    const mainTex = options.mainTex ?? "main.tex";
    if (mainTex !== "main.tex") return failure("INVALID_INPUT", "main_tex must be main.tex in work_dir", "user");
    const mainPath = await directInsideCase(root, `${workDir}/main.tex`, "existing");
    const mainInfo = await lstat(mainPath);
    if (!mainInfo.isFile()) return failure("INVALID_INPUT", "main.tex must be a direct regular file", "user");

    const sourceEnv = options.env ?? process.env;
    const cacheRoot = path.resolve(options.cacheRoot ?? sourceEnv.MM_AGENT_CACHE_DIR ?? defaultCacheRoot(sourceEnv));
    const env = sanitizedRuntimeEnvironment(sourceEnv, cacheRoot);
    const resolver = options.executableResolver ?? resolveExecutable;
    const runner = options.commandRunner ?? runCommand;
    const latexmk = await resolver("latexmk", env);
    const xelatex = await resolver("xelatex", env);
    const logPath = `${workDir}/compile.log`;
    const pdfPath = `${workDir}/report.pdf`;
    const pdfAbsolute = await directInsideCase(root, pdfPath, "candidate");
    const sourcePdfAbsolute = await directInsideCase(root, `${workDir}/main.pdf`, "candidate");
    await rm(pdfAbsolute, { force: true });
    await rm(sourcePdfAbsolute, { force: true });
    const commands: CompileManifest["commands"] = [];
    const logs: string[] = [];
    let engine: CompileManifest["engine"] = "unavailable";
    let finalRun: CommandRun | undefined;

    if (latexmk) {
      engine = "latexmk";
      finalRun = await runner(latexmk, ["-xelatex", "-interaction=nonstopmode", "-halt-on-error", "-no-shell-escape", "-outdir=.", "main.tex"], {
        cwd: workingDirectory, env, timeoutMs,
      });
      commands.push({ executable: latexmk, args: finalRun.args, exit_code: finalRun.exitCode, timed_out: finalRun.timedOut });
      logs.push(runSummary(finalRun));
    } else if (xelatex) {
      engine = "xelatex";
      for (let pass = 0; pass < 3; pass += 1) {
        const run = await runner(xelatex, ["-interaction=nonstopmode", "-halt-on-error", "-no-shell-escape", "-output-directory=.", "main.tex"], {
          cwd: workingDirectory, env, timeoutMs,
        });
        finalRun = run;
        commands.push({ executable: xelatex, args: run.args, exit_code: run.exitCode, timed_out: run.timedOut });
        logs.push(`pass ${pass + 1}\n${runSummary(run)}`);
        if (run.exitCode !== 0 || run.timedOut) break;
      }
    }
    if (!finalRun) logs.push("Neither latexmk nor xelatex is available on the sanitized PATH.");
    if (await nonEmptyFile(sourcePdfAbsolute)) await rename(sourcePdfAbsolute, pdfAbsolute);
    await writeFile(await directInsideCase(root, logPath, "candidate"), `${logs.join("\n\n")}\n`, "utf8");
    const pdfPresent = await nonEmptyFile(pdfAbsolute);
    const succeeded = finalRun?.exitCode === 0 && !finalRun.timedOut && pdfPresent;
    const evidencePath = await nextEvidencePath(root, attemptBase(workDir), "compile");
    const inputs = await inputHashes(root, [`${workDir}/main.tex`]);
    const outputs = await outputHashes(root, [logPath, pdfPath], workingDirectory);
    const pdf = pdfPresent ? { path: pdfPath, sha256: (outputs.find((output) => output.path === pdfPath) as { path: string; sha256: string }).sha256 } : null;
    const manifest: CompileManifest = {
      schema_version: 1,
      kind: "compile",
      created_at: (options.now ?? (() => new Date().toISOString()))(),
      status: succeeded ? "succeeded" : "failed",
      engine,
      commands,
      environment: environmentEvidence(env),
      timeout_ms: timeoutMs,
      stdout: finalRun?.stdout ?? "",
      stderr: finalRun?.stderr ?? "",
      errors: succeeded ? [] : structuredErrors(finalRun?.stdout ?? "", finalRun?.stderr ?? logs.join("\n")),
      inputs,
      outputs,
      pdf,
    };
    const evidence = await writeEvidence(root, evidencePath, manifest);
    const referencePath = evidencePath.replace(/-manifest\.json$/u, ".json");
    await writeJsonAtomic(await directInsideCase(root, referencePath, "candidate"), evidence);
    if (succeeded) return { ok: true, evidence, manifest };
    return {
      ok: false,
      error: engine === "unavailable"
        ? { code: "RUNTIME_UNAVAILABLE", message: "latexmk and xelatex are unavailable; install a XeLaTeX distribution", repair: "user" }
        : { code: "EXECUTION_FAILED", message: `TeX did not produce a non-empty PDF; see ${evidencePath}`, repair: "none" },
      evidence,
      manifest,
    };
  } catch (error) {
    const message = (error as Error).message;
    return failure(message.includes("does not exist") ? "CASE_NOT_FOUND" : "PATH_ESCAPE", message, "user");
  }
}
