import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { FileCaseContextStore } from "../core/case-context-store.js";
import { hashPath } from "../core/paths.js";
import {
  CaseProtocolError,
  type CaseSnapshot,
  type OpenInput,
} from "../core/schema.js";

export type PrepareErrorCode =
  | "INPUT_REQUIRED"
  | "INPUT_INVALID"
  | "INPUT_DENIED"
  | "INPUT_CHANGED"
  | "POLICY_INVALID"
  | "CASE_CONFLICT"
  | "CASE_STORAGE_UNAVAILABLE"
  | "RUBRIC_INVALID";

export class PrepareError extends Error {
  constructor(
    readonly code: PrepareErrorCode,
    message: string,
    readonly needsUserInput = false,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "PrepareError";
  }
}

export type RevisionBudgetInput = {
  analysis: number;
  modeling: number;
  solvingPerTask: number;
  reporting: number;
};

export type PrepareCaseInput = {
  caseId: string;
  explicitPaths?: string[];
  revisionBudget?: RevisionBudgetInput;
};

export type PreparedInput = {
  label: string;
  size: number;
  sha256: string;
};

export type PrepareCaseResult = {
  mode: "created" | "resumed";
  sourceKind: "explicit-path" | "problems-directory";
  discovered: PreparedInput[];
  snapshot: CaseSnapshot;
};

export type PrepareToolResult =
  | { ok: true; result: PrepareCaseResult }
  | {
      ok: false;
      error: {
        code: PrepareErrorCode | string;
        message: string;
        repair: "automatic" | "user" | "none";
        needs_user_input: boolean;
        details?: unknown;
      };
    };

type SourceFile = PreparedInput & { sourcePath: string };

const DEFAULT_BUDGET: RevisionBudgetInput = {
  analysis: 2,
  modeling: 2,
  solvingPerTask: 2,
  reporting: 2,
};
const RUBRIC_ROLES = [
  "analysis",
  "modeling",
  "solving",
  "reporting",
] as const;

function containsVenv(target: string): boolean {
  return path
    .resolve(target)
    .split(/[\\/]+/u)
    .some((segment) => segment.toLowerCase() === ".venv");
}

async function regularFile(
  sourcePath: string,
  code: "INPUT_INVALID" | "INPUT_DENIED" | "RUBRIC_INVALID",
): Promise<{ size: number; canonical: string }> {
  let info;
  try {
    info = await lstat(sourcePath);
  } catch (error) {
    throw new PrepareError(code, `input is unavailable: ${sourcePath}`, false, error);
  }
  if (info.isSymbolicLink())
    throw new PrepareError(code === "RUBRIC_INVALID" ? code : "INPUT_DENIED", `linked input is not allowed: ${sourcePath}`);
  if (!info.isFile())
    throw new PrepareError(code, `input is not a regular file: ${sourcePath}`);
  return { size: info.size, canonical: await realpath(sourcePath) };
}

async function collectDirectory(
  directory: string,
  labelRoot: string,
  output: SourceFile[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    throw new PrepareError(
      "INPUT_INVALID",
      `input directory is unavailable: ${directory}`,
      false,
      error,
    );
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (entry.name === ".gitkeep") continue;
    const absolute = path.join(directory, entry.name);
    if (entry.name.toLowerCase() === ".venv")
      throw new PrepareError(
        "INPUT_DENIED",
        `user .venv is never an input source: ${absolute}`,
      );
    if (entry.isSymbolicLink())
      throw new PrepareError(
        "INPUT_DENIED",
        `linked input is not allowed: ${absolute}`,
      );
    const label = labelRoot
      ? path.posix.join(labelRoot, entry.name)
      : entry.name;
    if (entry.isDirectory()) {
      await collectDirectory(absolute, label, output);
      continue;
    }
    if (!entry.isFile())
      throw new PrepareError(
        "INPUT_DENIED",
        `special input is not allowed: ${absolute}`,
      );
    const checked = await regularFile(absolute, "INPUT_INVALID");
    output.push({
      label,
      sourcePath: checked.canonical,
      size: checked.size,
      sha256: await hashPath(checked.canonical),
    });
  }
}

async function collectSource(sourcePath: string): Promise<SourceFile[]> {
  const absolute = path.resolve(sourcePath);
  if (containsVenv(absolute))
    throw new PrepareError(
      "INPUT_DENIED",
      `user .venv is never an input source: ${absolute}`,
    );
  let info;
  try {
    info = await lstat(absolute);
  } catch (error) {
    throw new PrepareError(
      "INPUT_INVALID",
      `input path is unavailable: ${absolute}`,
      false,
      error,
    );
  }
  if (info.isSymbolicLink())
    throw new PrepareError(
      "INPUT_DENIED",
      `linked input is not allowed: ${absolute}`,
    );
  if (info.isFile()) {
    const checked = await regularFile(absolute, "INPUT_INVALID");
    return [
      {
        label: path.basename(absolute),
        sourcePath: checked.canonical,
        size: checked.size,
        sha256: await hashPath(checked.canonical),
      },
    ];
  }
  if (!info.isDirectory())
    throw new PrepareError(
      "INPUT_DENIED",
      `input is neither a regular file nor directory: ${absolute}`,
    );
  const output: SourceFile[] = [];
  await collectDirectory(await realpath(absolute), "", output);
  return output;
}

function validateBudget(budget: RevisionBudgetInput): void {
  for (const [name, value] of Object.entries(budget))
    if (!Number.isInteger(value) || value < 0)
      throw new PrepareError(
        "POLICY_INVALID",
        `revision budget ${name} must be a non-negative integer`,
        true,
      );
}

function persistedBudget(snapshot: CaseSnapshot): RevisionBudgetInput {
  const budget = snapshot.caseFile.policy.revision_budget;
  return {
    analysis: budget.analysis,
    modeling: budget.modeling,
    solvingPerTask: budget.solving_per_task,
    reporting: budget.reporting,
  };
}

function budgetsEqual(
  left: RevisionBudgetInput,
  right: RevisionBudgetInput,
): boolean {
  return (
    left.analysis === right.analysis &&
    left.modeling === right.modeling &&
    left.solvingPerTask === right.solvingPerTask &&
    left.reporting === right.reporting
  );
}

export class FileCasePreparer {
  private readonly store: FileCaseContextStore;

  constructor(
    private readonly options: {
      projectRoot: string;
      runsRoot: string;
      rubricRoot: string;
      now?: () => string;
    },
  ) {
    this.store = new FileCaseContextStore({
      runsRoot: options.runsRoot,
      ...(options.now ? { now: options.now } : {}),
    });
  }

  private async existing(caseId: string): Promise<CaseSnapshot | undefined> {
    try {
      return await this.store.open(caseId);
    } catch (error) {
      if (error instanceof CaseProtocolError && error.code === "CASE_NOT_FOUND")
        return undefined;
      throw error;
    }
  }

  private async assertSafeRunsRoot(): Promise<void> {
    const projectRoot = path.resolve(this.options.projectRoot);
    const runsRoot = path.resolve(this.options.runsRoot);
    if (path.dirname(runsRoot) !== projectRoot)
      throw new PrepareError(
        "CASE_STORAGE_UNAVAILABLE",
        "runsRoot must be a direct directory below the project root",
        true,
      );
    const canonicalProject = await realpath(projectRoot);
    try {
      const info = await lstat(runsRoot);
      if (!info.isDirectory() || info.isSymbolicLink())
        throw new PrepareError(
          "CASE_STORAGE_UNAVAILABLE",
          "runsRoot must be a real directory, not a file or link",
          true,
        );
      if (path.dirname(await realpath(runsRoot)) !== canonicalProject)
        throw new PrepareError(
          "CASE_STORAGE_UNAVAILABLE",
          "runsRoot resolves outside the project root",
          true,
        );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  private async rubricSources(): Promise<OpenInput["policy"]["rubrics"]> {
    const rubrics = {} as OpenInput["policy"]["rubrics"];
    for (const role of RUBRIC_ROLES) {
      const sourcePath = path.join(this.options.rubricRoot, `${role}.md`);
      if (containsVenv(sourcePath))
        throw new PrepareError(
          "RUBRIC_INVALID",
          `rubric cannot be loaded from .venv: ${role}`,
        );
      const checked = await regularFile(sourcePath, "RUBRIC_INVALID");
      rubrics[role] = {
        sourcePath: checked.canonical,
        expectedSize: checked.size,
        expectedSha256: await hashPath(checked.canonical),
      };
    }
    return rubrics;
  }

  async prepare(input: PrepareCaseInput): Promise<PrepareCaseResult> {
    await this.assertSafeRunsRoot();
    const budget = input.revisionBudget ?? DEFAULT_BUDGET;
    validateBudget(budget);
    const providedPaths = input.explicitPaths ?? [];
    if (providedPaths.some((value) => value.trim().length === 0))
      throw new PrepareError(
        "INPUT_INVALID",
        "explicit input paths cannot be empty or whitespace",
        true,
      );
    const explicit = providedPaths.map((value) =>
      path.isAbsolute(value)
        ? path.normalize(value)
        : path.resolve(this.options.projectRoot, value),
    );
    const existing = await this.existing(input.caseId);
    if (existing) {
      if (explicit.length > 0)
        throw new PrepareError(
          "CASE_CONFLICT",
          `Case ${input.caseId} already exists and cannot be replaced`,
          true,
        );
      if (
        input.revisionBudget &&
        !budgetsEqual(input.revisionBudget, persistedBudget(existing))
      )
        throw new PrepareError(
          "CASE_CONFLICT",
          `Case ${input.caseId} already exists with a different immutable Policy`,
          true,
        );
      return {
        mode: "resumed",
        sourceKind: existing.caseFile.source_kind,
        discovered: existing.inputManifest.files.map((file) => ({
          label: file.source_label,
          size: file.size,
          sha256: file.sha256,
        })),
        snapshot: existing,
      };
    }

    const sourceKind =
      explicit.length > 0 ? "explicit-path" : "problems-directory";
    let sources: SourceFile[];
    try {
      sources =
        explicit.length > 0
          ? (
              await Promise.all(
                explicit.map((sourcePath) => collectSource(sourcePath)),
              )
            ).flat()
          : await collectSource(path.join(this.options.projectRoot, "problems"));
    } catch (error) {
      if (
        explicit.length === 0 &&
        error instanceof PrepareError &&
        error.code === "INPUT_INVALID" &&
        (error.details as NodeJS.ErrnoException | undefined)?.code === "ENOENT"
      )
        throw new PrepareError(
          "INPUT_REQUIRED",
          "No input was found. Provide an explicit path or add files under problems/.",
          true,
        );
      throw error;
    }
    sources.sort((left, right) => left.label.localeCompare(right.label));
    if (sources.length === 0)
      throw new PrepareError(
        "INPUT_REQUIRED",
        "No input was found. Provide an explicit path or add files under problems/.",
        true,
      );
    const labels = new Set<string>();
    for (const source of sources) {
      if (labels.has(source.label))
        throw new PrepareError(
          "INPUT_INVALID",
          `input label is ambiguous across selected paths: ${source.label}`,
          true,
        );
      labels.add(source.label);
    }

    const snapshot = await this.store.open(input.caseId, {
      sourceKind,
      files: sources.map((source) => ({
        label: source.label,
        sourcePath: source.sourcePath,
        expectedSize: source.size,
        expectedSha256: source.sha256,
      })),
      policy: {
        revisionBudget: budget,
        rubrics: await this.rubricSources(),
      },
    });
    return {
      mode: "created",
      sourceKind,
      discovered: sources.map(({ label, size, sha256 }) => ({
        label,
        size,
        sha256,
      })),
      snapshot,
    };
  }
}

function errorDetails(value: unknown): unknown {
  if (!(value instanceof Error)) return value;
  const code = (value as NodeJS.ErrnoException).code;
  return {
    name: value.name,
    message: value.message,
    ...(code ? { code } : {}),
  };
}

export async function prepareCase(
  options: ConstructorParameters<typeof FileCasePreparer>[0],
  input: PrepareCaseInput,
): Promise<PrepareToolResult> {
  try {
    return {
      ok: true,
      result: await new FileCasePreparer(options).prepare(input),
    };
  } catch (error) {
    if (error instanceof PrepareError)
      return {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          repair:
            error.code === "RUBRIC_INVALID" ? "automatic" : "user",
          needs_user_input: error.needsUserInput,
          ...(error.details === undefined
            ? {}
            : { details: errorDetails(error.details) }),
        },
      };
    if (error instanceof CaseProtocolError) {
      const code =
        error.code === "CASE_EXISTS"
          ? "CASE_CONFLICT"
          : error.code === "READ_SET_STALE"
            ? "INPUT_CHANGED"
            : error.code;
      return {
        ok: false,
        error: {
          code,
          message: error.message,
          repair: "user",
          needs_user_input: true,
          ...(error.details === undefined
            ? {}
            : { details: errorDetails(error.details) }),
        },
      };
    }
    const systemCode = (error as NodeJS.ErrnoException).code;
    if (
      systemCode &&
      ["EACCES", "EPERM", "EROFS", "ENOTDIR", "EEXIST", "ENOSPC"].includes(
        systemCode,
      )
    )
      return {
        ok: false,
        error: {
          code: "CASE_STORAGE_UNAVAILABLE",
          message: `Case storage is unavailable: ${(error as Error).message}`,
          repair: "user",
          needs_user_input: true,
          details: errorDetails(error),
        },
      };
    return {
      ok: false,
      error: {
        code: "INPUT_INVALID",
        message: `Case preparation failed: ${(error as Error).message}`,
        repair: "none",
        needs_user_input: false,
        details: errorDetails(error),
      },
    };
  }
}
