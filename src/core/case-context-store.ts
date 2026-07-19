import { randomUUID } from "node:crypto";
import {
  copyFile,
  cp,
  lstat,
  mkdir,
  readdir,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { resolveRecipe } from "./context-recipes.js";
import {
  exists,
  hashPath,
  readJson,
  resolveInsideCase,
  withCaseLock,
  writeJsonAtomic,
} from "./paths.js";
import {
  CaseFileSchema,
  CaseProtocolError,
  CaseStateSchema,
  ContextManifestSchema,
  InputManifestSchema,
  ReviewSchema,
  RuntimeEvidenceSchema,
  SCHEMA_VERSION,
  TaskGraphSchema,
  TaskListSchema,
  TaskMemorySchema,
  type ArtifactRef,
  type CaseContextStore,
  type CaseFile,
  type CaseSnapshot,
  type CaseState,
  type ContextManifest,
  type DispatchInput,
  type DispatchResult,
  type GateInput,
  type GateResult,
  type InputManifest,
  type OpenInput,
  type Review,
  type Scope,
} from "./schema.js";

const CASE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const RUBRICS = ["analysis", "modeling", "solving", "reporting"] as const;
const GATE_TRANSACTION = /^\.gate-txn-[a-z0-9-]+$/u;
const GATE_PREPARATION = /^\.gate-prep-[a-z0-9-]+$/u;
const GateTransactionJournalSchema = z.object({
  review_path: z.string().min(1),
  review_existed: z.boolean(),
  roots: z.array(
    z.object({
      name: z.enum(["artifacts", "tasks", "report"]),
      existed: z.boolean(),
    }),
  ),
});
type GateTransactionJournal = z.infer<typeof GateTransactionJournalSchema>;
type StableRoot = GateTransactionJournal["roots"][number]["name"];
type PreparedPromotion = {
  candidate: string;
  target: string;
  candidateAbsolute: string;
  sha256: string;
};
type DirectoryIdentity = {
  canonical: string;
  dev: number;
  ino: number;
};
type PreparedStableRoot = GateTransactionJournal["roots"][number] & {
  identity: DirectoryIdentity | undefined;
};
type PreparedReview = {
  parent: string;
  parentIdentity: DirectoryIdentity;
  temporary: string;
  target: string;
};
export class FileCaseContextStore implements CaseContextStore {
  private readonly now: () => string;
  constructor(
    private readonly options: { runsRoot: string; now?: () => string },
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }
  private caseRoot(caseId: string): string {
    if (!CASE_ID.test(caseId))
      throw new CaseProtocolError(
        "INVALID_CASE_ID",
        `invalid Case ID: ${caseId}`,
      );
    return path.join(this.options.runsRoot, caseId);
  }
  private async assertExistingCaseRoot(caseRoot: string): Promise<void> {
    const rootInfo = await lstat(caseRoot);
    const [canonicalRunsRoot, canonicalCaseRoot] = await Promise.all([
      realpath(this.options.runsRoot),
      realpath(caseRoot),
    ]);
    if (
      rootInfo.isSymbolicLink() ||
      path.dirname(canonicalCaseRoot) !== canonicalRunsRoot
    )
      throw new CaseProtocolError(
        "PATH_ESCAPE",
        `Case root is not a direct directory below runsRoot: ${caseRoot}`,
      );
  }
  async open(caseId: string, input?: OpenInput): Promise<CaseSnapshot> {
    const caseRoot = this.caseRoot(caseId);
    if (await exists(caseRoot)) {
      await this.assertExistingCaseRoot(caseRoot);
      if (input)
        throw new CaseProtocolError(
          "CASE_EXISTS",
          `Case ${caseId} already exists`,
        );
      return this.inspect(caseId);
    }
    if (!input)
      throw new CaseProtocolError(
        "CASE_NOT_FOUND",
        `Case ${caseId} does not exist`,
      );
    await mkdir(this.options.runsRoot, { recursive: true });
    const staging = `${caseRoot}.tmp-${process.pid}-${randomUUID()}`;
    try {
      await mkdir(path.join(staging, "input", "files"), { recursive: true });
      await mkdir(path.join(staging, "input", "policy", "rubrics"), {
        recursive: true,
      });
      await mkdir(path.join(staging, "attempts"), { recursive: true });
      const files: InputManifest["files"] = [];
      for (const [index, source] of input.files.entries()) {
        const safeLabel =
          source.label
            .toLowerCase()
            .replace(/[^a-z0-9-]+/gu, "-")
            .replace(/^-|-$/gu, "") || "input";
        const extension = path.extname(source.sourcePath);
        const relative = `input/files/${String(index + 1).padStart(3, "0")}-${safeLabel}${extension}`;
        const target = path.join(staging, ...relative.split("/"));
        await copyFile(source.sourcePath, target);
        const copiedSize = (await stat(target)).size;
        const copiedHash = await hashPath(target);
        if (
          (source.expectedSize !== undefined &&
            copiedSize !== source.expectedSize) ||
          (source.expectedSha256 !== undefined &&
            copiedHash !== source.expectedSha256)
        )
          throw new CaseProtocolError(
            "READ_SET_STALE",
            `input changed while Case ${caseId} was being created: ${source.label}`,
          );
        files.push({
          source_label: source.label,
          path: relative,
          size: copiedSize,
          sha256: copiedHash,
        });
      }
      const rubrics = {} as CaseFile["policy"]["rubrics"];
      for (const role of RUBRICS) {
        const relative = `input/policy/rubrics/${role}.md`;
        const target = path.join(staging, ...relative.split("/"));
        const rubricSource = input.policy.rubrics[role];
        await copyFile(rubricSource.sourcePath, target);
        const rubricSize = (await stat(target)).size;
        const rubricHash = await hashPath(target);
        if (
          (rubricSource.expectedSize !== undefined &&
            rubricSize !== rubricSource.expectedSize) ||
          (rubricSource.expectedSha256 !== undefined &&
            rubricHash !== rubricSource.expectedSha256)
        )
          throw new CaseProtocolError(
            "READ_SET_STALE",
            `Rubric changed while Case ${caseId} was being created: ${role}`,
          );
        rubrics[role] = { path: relative, sha256: rubricHash };
      }
      const manifest: InputManifest = { schema_version: SCHEMA_VERSION, files };
      const caseFile: CaseFile = {
        schema_version: SCHEMA_VERSION,
        case_id: caseId,
        created_at: this.now(),
        input_manifest: "input/manifest.json",
        source_kind: input.sourceKind,
        policy: {
          revision_budget: {
            analysis: input.policy.revisionBudget.analysis,
            modeling: input.policy.revisionBudget.modeling,
            solving_per_task: input.policy.revisionBudget.solvingPerTask,
            reporting: input.policy.revisionBudget.reporting,
          },
          rubrics,
        },
      };
      const state: CaseState = {
        schema_version: SCHEMA_VERSION,
        case_id: caseId,
        revision: 0,
        stage: "analysis",
        status: "prepared",
        current_wave: null,
        accepted_artifacts: [],
        revision_budget: {
          analysis: input.policy.revisionBudget.analysis,
          modeling: input.policy.revisionBudget.modeling,
          solving: {},
          reporting: input.policy.revisionBudget.reporting,
        },
        blockers: [],
      };
      try {
        InputManifestSchema.parse(manifest);
        CaseFileSchema.parse(caseFile);
        CaseStateSchema.parse(state);
      } catch (error) {
        if (error instanceof CaseProtocolError) throw error;
        throw new CaseProtocolError(
          "SCHEMA_INVALID",
          "invalid Case creation input",
          error,
        );
      }
      await writeJsonAtomic(
        path.join(staging, "input", "manifest.json"),
        manifest,
      );
      await writeJsonAtomic(path.join(staging, "case.json"), caseFile);
      await writeJsonAtomic(path.join(staging, "state.json"), state);
      await rename(staging, caseRoot);
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      throw error;
    }
    return this.inspect(caseId);
  }
  async inspect(caseId: string): Promise<CaseSnapshot> {
    const root = this.caseRoot(caseId);
    if (!(await exists(root)))
      throw new CaseProtocolError(
        "CASE_NOT_FOUND",
        `Case ${caseId} does not exist`,
      );
    await this.assertExistingCaseRoot(root);
    const unfinishedTransactions = [];
    for (const transaction of await this.gateTransactionDirectories(root))
      if (!(await this.isCommittedGateTransaction(transaction)))
        unfinishedTransactions.push(transaction);
    if (unfinishedTransactions.length > 0)
      throw new CaseProtocolError(
        "LOCK_BUSY",
        `Case ${caseId} has an unfinished Gate transaction`,
      );
    const caseFile = await readJson(
      await resolveInsideCase(root, "case.json", "existing"),
      CaseFileSchema,
    );
    const state = await readJson(
      await resolveInsideCase(root, "state.json", "existing"),
      CaseStateSchema,
    );
    const inputManifest = await readJson(
      await resolveInsideCase(root, "input/manifest.json", "existing"),
      InputManifestSchema,
    );
    if (caseFile.case_id !== caseId || state.case_id !== caseId)
      throw new CaseProtocolError("SCHEMA_INVALID", "Case identity mismatch");
    const activeAttempts: ContextManifest[] = [];
    const attemptsRoot = await resolveInsideCase(root, "attempts", "existing");
    async function scan(dir: string): Promise<void> {
      if (!(await exists(dir))) return;
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const child = path.join(dir, entry.name);
        const context = path.join(child, "context.json");
        if (await exists(context)) {
          const contextRelative = path
            .relative(root, context)
            .split(path.sep)
            .join("/");
          const manifest = await readJson(
            await resolveInsideCase(root, contextRelative, "existing"),
            ContextManifestSchema,
          );
          const location = path.relative(attemptsRoot, child).split(path.sep);
          const sequenceText = location.at(-1) ?? "";
          const expectedScope =
            location.length === 2 &&
            ["analysis", "modeling", "reporting"].includes(location[0] ?? "")
              ? location[0]
              : location.length === 3 && location[0] === "solving"
                ? `solving/${location[1]}`
                : null;
          const expectedRole = {
            analysis: "analyst",
            modeling: "modeler",
            solving: "solver",
            reporting: "writer",
          }[expectedScope?.split("/")[0] ?? ""];
          if (
            manifest.case_id !== caseId ||
            expectedScope === null ||
            !/^\d{3}$/u.test(sequenceText) ||
            manifest.scope !== expectedScope ||
            manifest.sequence !== Number(sequenceText) ||
            manifest.attempt_id !==
              `${expectedScope.replaceAll("/", "-")}-${sequenceText}` ||
            manifest.role !== expectedRole
          )
            throw new CaseProtocolError(
              "SCHEMA_INVALID",
              `Context Manifest identity does not match ${path.relative(root, child)}`,
            );
          const reviewPath = path.join(child, "review.json");
          let validReview = false;
          if (await exists(reviewPath)) {
            try {
              const reviewRelative = path
                .relative(root, reviewPath)
                .split(path.sep)
                .join("/");
              validReview =
                (
                  await readJson(
                    await resolveInsideCase(root, reviewRelative, "existing"),
                    ReviewSchema,
                  )
                ).attempt_id === manifest.attempt_id;
            } catch (error) {
              if (
                error instanceof CaseProtocolError &&
                error.code === "PATH_ESCAPE"
              )
                throw error;
              validReview = false;
            }
          }
          if (!validReview) activeAttempts.push(manifest);
          continue;
        }
        await scan(child);
      }
    }
    await scan(attemptsRoot);
    return {
      caseFile,
      inputManifest,
      state,
      activeAttempts,
      completion: await this.deriveCompletion(root, state),
    };
  }
  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    const root = this.caseRoot(input.caseId);
    if (!(await exists(root)))
      throw new CaseProtocolError(
        "CASE_NOT_FOUND",
        `Case ${input.caseId} does not exist`,
      );
    await this.assertExistingCaseRoot(root);
    return withCaseLock(root, () => this.dispatchLocked(input));
  }
  private async dispatchLocked(input: DispatchInput): Promise<DispatchResult> {
    await this.recoverGateTransactions(this.caseRoot(input.caseId));
    const snapshot = await this.inspect(input.caseId);
    if (
      snapshot.state.status === "failed" ||
      snapshot.state.status === "completed"
    )
      throw new CaseProtocolError(
        "INVALID_SCOPE",
        `cannot dispatch a ${snapshot.state.status} Case`,
      );
    const roleStage = {
      analyst: "analysis",
      modeler: "modeling",
      solver: "solving",
      writer: "reporting",
    } as const;
    if (snapshot.state.stage !== roleStage[input.role])
      throw new CaseProtocolError(
        "INVALID_SCOPE",
        `${input.role} cannot run during ${snapshot.state.stage}`,
      );
    if (
      input.baseRevision !== undefined &&
      input.baseRevision !== snapshot.state.revision
    )
      throw new CaseProtocolError(
        "STALE_REVISION",
        "dispatch baseRevision is stale",
      );
    const root = this.caseRoot(input.caseId);
    const scope =
      input.role === "solver"
        ? `solving/${input.taskId ?? ""}`
        : roleStage[input.role];
    let modelingTaskIds: string[] = [];
    let solverDependencies = new Set<string>();
    let currentTask: ContextManifest["current_task"] = null;
    if (input.role === "modeler") {
      const taskList = await readJson(
        await resolveInsideCase(root, "artifacts/tasks.json", "existing"),
        TaskListSchema,
      );
      modelingTaskIds = taskList.tasks.map((task) => task.id);
    }
    if (input.role === "solver") {
      const graph = await readJson(
        await resolveInsideCase(root, "artifacts/task-graph.json", "existing"),
        TaskGraphSchema,
      );
      const task = graph.tasks.find((item) => item.id === input.taskId);
      if (!task || task.wave !== snapshot.state.current_wave)
        throw new CaseProtocolError(
          "INVALID_SCOPE",
          `task ${input.taskId ?? ""} is not in current wave`,
        );
      const taskList = await readJson(
        await resolveInsideCase(root, "artifacts/tasks.json", "existing"),
        TaskListSchema,
      );
      currentTask =
        taskList.tasks.find((item) => item.id === input.taskId) ?? null;
      if (!currentTask)
        throw new CaseProtocolError(
          "DAG_INVALID",
          `task ${input.taskId ?? ""} is absent from the accepted task list`,
        );
      solverDependencies = new Set(
        task.depends_on.map((dependency) => `tasks/${dependency}/memory.json`),
      );
      const acceptedPaths = new Set(
        snapshot.state.accepted_artifacts.map((artifact) => artifact.path),
      );
      if (
        [...solverDependencies].some(
          (dependency) => !acceptedPaths.has(dependency),
        )
      )
        throw new CaseProtocolError(
          "INVALID_SCOPE",
          "task dependencies are not accepted",
        );
    }
    if (input.resolvesBlocker) {
      const blocker = snapshot.state.blockers.find(
        (item) =>
          item.id === input.resolvesBlocker && item.resolved_at === null,
      );
      if (!blocker || blocker.scope !== scope)
        throw new CaseProtocolError(
          "BLOCKER_INVALID",
          `blocker cannot be resolved by scope ${scope}`,
        );
    }
    if (snapshot.activeAttempts.some((attempt) => attempt.scope === scope))
      throw new CaseProtocolError(
        "ACTIVE_ATTEMPT",
        `scope ${scope} already has an active Attempt`,
      );
    const scopeRelative = `attempts/${scope}`;
    const lexicalScopeDir = path.join(root, ...scopeRelative.split("/"));
    const scopeDir = await resolveInsideCase(
      root,
      scopeRelative,
      (await exists(lexicalScopeDir)) ? "existing" : "candidate",
    );
    await mkdir(scopeDir, { recursive: true });
    const entries = await readdir(scopeDir, { withFileTypes: true });
    const sequence =
      Math.max(
        0,
        ...entries
          .filter((entry) => entry.isDirectory() && /^\d{3}$/u.test(entry.name))
          .map((entry) => Number(entry.name)),
      ) + 1;
    const sequenceText = String(sequence).padStart(3, "0");
    const contextPath = `attempts/${scope}/${sequenceText}/context.json`;
    const attemptBase = `attempts/${scope}/${sequenceText}`;
    const recipe = resolveRecipe(
      input.role,
      attemptBase,
      input.taskId,
      modelingTaskIds,
    );
    const attemptId = `${scope.replaceAll("/", "-")}-${sequenceText}`;
    const inputReads = snapshot.inputManifest.files.map((file) => ({
      kind: "input",
      path: file.path,
      sha256: file.sha256,
    }));
    const requiredReads =
      input.role === "analyst"
        ? inputReads
        : input.role === "modeler"
          ? [
              ...inputReads,
              ...snapshot.state.accepted_artifacts.filter((artifact) =>
                [
                  "artifacts/problem-understanding.md",
                  "artifacts/tasks.json",
                  "artifacts/task-graph.json",
                ].includes(artifact.path),
              ),
            ]
          : snapshot.state.accepted_artifacts.filter(
              (artifact) =>
                input.role !== "solver" ||
                artifact.kind === "modeling-scheme" ||
                solverDependencies.has(artifact.path),
            );
    const rubricRole =
      input.role === "solver"
        ? "solving"
        : input.role === "writer"
          ? "reporting"
          : input.role === "modeler"
            ? "modeling"
            : "analysis";
    let latestReview: string | null = null;
    for (const prior of entries
      .filter((entry) => entry.isDirectory() && /^\d{3}$/u.test(entry.name))
      .sort((a, b) => b.name.localeCompare(a.name))) {
      const relative = `attempts/${scope}/${prior.name}/review.json`;
      const reviewPath = path.join(root, ...relative.split("/"));
      if (await exists(reviewPath)) {
        try {
          await readJson(
            await resolveInsideCase(root, relative, "existing"),
            ReviewSchema,
          );
          latestReview = relative;
          break;
        } catch {
          continue;
        }
      }
    }
    const manifest: ContextManifest = {
      schema_version: SCHEMA_VERSION,
      case_id: input.caseId,
      attempt_id: attemptId,
      scope: recipe.scope,
      sequence,
      created_at: this.now(),
      base_revision: snapshot.state.revision,
      role: input.role,
      current_task: currentTask,
      goal: input.goal,
      required_reads: requiredReads,
      constraints: input.constraints ?? [],
      allowed_writes: recipe.allowedWrites,
      expected_outputs: recipe.expectedOutputs,
      promotions: recipe.promotions,
      acceptance: recipe.acceptance,
      review: {
        rubric: snapshot.caseFile.policy.rubrics[rubricRole],
        required_reads: recipe.expectedOutputs,
      },
      latest_review: latestReview,
      resolves_blocker: input.resolvesBlocker ?? null,
    };
    const attemptDir = await resolveInsideCase(
      root,
      path.posix.dirname(contextPath),
      "candidate",
    );
    await mkdir(attemptDir, { recursive: false });
    await writeJsonAtomic(path.join(attemptDir, "context.json"), manifest);
    return { attemptId, contextPath, manifest };
  }
  async gate(input: GateInput): Promise<GateResult> {
    const root = this.caseRoot(input.caseId);
    if (!(await exists(root)))
      throw new CaseProtocolError(
        "CASE_NOT_FOUND",
        `Case ${input.caseId} does not exist`,
      );
    await this.assertExistingCaseRoot(root);
    return withCaseLock(root, async () => {
      await this.recoverGateTransactions(root);
      const snapshot = await this.inspect(input.caseId);
      if (snapshot.state.revision !== input.expectedRevision)
        throw new CaseProtocolError(
          "STALE_REVISION",
          `expected revision ${input.expectedRevision}, found ${snapshot.state.revision}`,
        );
      if (
        snapshot.state.status === "failed" ||
        snapshot.state.status === "completed"
      )
        throw new CaseProtocolError(
          "INVALID_SCOPE",
          `cannot gate a ${snapshot.state.status} Case`,
        );
      const manifest = snapshot.activeAttempts.find(
        (attempt) => attempt.attempt_id === input.attemptId,
      );
      if (!manifest)
        throw new CaseProtocolError(
          "REVIEW_INVALID",
          `active Attempt not found: ${input.attemptId}`,
        );
      let review;
      try {
        review = ReviewSchema.parse(input.review);
      } catch (error) {
        if (error instanceof CaseProtocolError) throw error;
        throw new CaseProtocolError("REVIEW_INVALID", "invalid Review", error);
      }
      if (review.attempt_id !== manifest.attempt_id)
        throw new CaseProtocolError(
          "REVIEW_INVALID",
          "Review attempt_id mismatch",
        );
      await this.validateManifestContract(root, snapshot, manifest);
      for (const evidencePath of review.evidence) {
        try {
          await resolveInsideCase(root, evidencePath, "existing");
        } catch (error) {
          throw new CaseProtocolError(
            "REVIEW_INVALID",
            `Review evidence is unavailable: ${evidencePath}`,
            error,
          );
        }
      }
      try {
        const rubric = await resolveInsideCase(
          root,
          manifest.review.rubric.path,
          "existing",
        );
        if ((await hashPath(rubric)) !== manifest.review.rubric.sha256)
          throw new CaseProtocolError(
            "READ_SET_STALE",
            `review rubric changed: ${manifest.review.rubric.path}`,
          );
      } catch (error) {
        if (
          error instanceof CaseProtocolError &&
          error.code === "READ_SET_STALE"
        )
          throw error;
        throw new CaseProtocolError(
          "READ_SET_STALE",
          `review rubric is unavailable: ${manifest.review.rubric.path}`,
          error,
        );
      }
      for (const required of manifest.required_reads) {
        const absolute = await resolveInsideCase(
          root,
          required.path,
          "existing",
        );
        if ((await hashPath(absolute)) !== required.sha256)
          throw new CaseProtocolError(
            "READ_SET_STALE",
            `required read changed: ${required.path}`,
          );
      }
      const scope = manifest.scope as Scope;
      const allowedTarget = (target: string): boolean => {
        if (scope === "analysis")
          return [
            "artifacts/problem-understanding.md",
            "artifacts/tasks.json",
            "artifacts/task-graph.json",
          ].includes(target);
        if (scope === "modeling")
          return (
            target === "artifacts/modeling-scheme.md" ||
            /^tasks\/[^/]+\/retrieved-methods\.json$/u.test(target)
          );
        if (scope === "reporting")
          return [
            "report/outline.md",
            "report/notation.md",
            "report/main.tex",
            "report/compile.log",
            "report/report.pdf",
          ].includes(target);
        if (scope.startsWith("solving/")) {
          const taskId = scope.slice("solving/".length);
          return (
            target === `tasks/${taskId}/execution-result.json` ||
            target === `tasks/${taskId}/memory.json` ||
            target === `tasks/${taskId}/code/` ||
            target === `tasks/${taskId}/figures/`
          );
        }
        return false;
      };
      for (const promotion of manifest.promotions) {
        if (!allowedTarget(promotion.target))
          throw new CaseProtocolError(
            "PROMOTION_DENIED",
            `target is not allowed for ${scope}: ${promotion.target}`,
          );
        const covered = manifest.allowed_writes.some((allowed) =>
          allowed.endsWith("/")
            ? promotion.candidate.startsWith(allowed)
            : promotion.candidate === allowed,
        );
        if (!covered)
          throw new CaseProtocolError(
            "PROMOTION_DENIED",
            `candidate is outside allowed_writes: ${promotion.candidate}`,
          );
      }
      const missingExpected: string[] = [];
      for (const expected of manifest.expected_outputs) {
        try {
          await resolveInsideCase(root, expected, "existing");
        } catch (error) {
          if (
            (error as NodeJS.ErrnoException).code === "ENOENT" ||
            (error as NodeJS.ErrnoException).code === "ENOTDIR"
          ) {
            missingExpected.push(expected);
            continue;
          }
          throw error;
        }
      }
      if (review.verdict === "block" && missingExpected.length > 0) {
        await this.validateBlockRuntimeEvidence(root, manifest, review);
        return this.applyNonPass(root, snapshot.state, manifest, review);
      }
      const candidates: PreparedPromotion[] = [];
      for (const promotion of manifest.promotions) {
        let candidateAbsolute: string;
        try {
          candidateAbsolute = await resolveInsideCase(
            root,
            promotion.candidate,
            "existing",
          );
        } catch (error) {
          if (
            !promotion.required &&
            (error as NodeJS.ErrnoException).code === "ENOENT"
          )
            continue;
          if (
            promotion.required &&
            ((error as NodeJS.ErrnoException).code === "ENOENT" ||
              (error as NodeJS.ErrnoException).code === "ENOTDIR")
          )
            throw new CaseProtocolError(
              "CANDIDATE_MISSING",
              `required candidate missing: ${promotion.candidate}`,
            );
          throw error;
        }
        await resolveInsideCase(root, promotion.target, "candidate");
        candidates.push({
          candidate: promotion.candidate,
          target: promotion.target,
          candidateAbsolute,
          sha256: await hashPath(candidateAbsolute),
        });
      }
      if (missingExpected.length > 0)
        throw new CaseProtocolError(
          "CANDIDATE_MISSING",
          `expected output missing: ${missingExpected[0]}`,
        );
      const taskCandidate = candidates.find(
        (item) => item.target === "artifacts/tasks.json",
      );
      const graphCandidate = candidates.find(
        (item) => item.target === "artifacts/task-graph.json",
      );
      const taskList = taskCandidate
        ? await readJson(taskCandidate.candidateAbsolute, TaskListSchema)
        : undefined;
      if (graphCandidate)
        this.validateDag(
          await readJson(graphCandidate.candidateAbsolute, TaskGraphSchema),
          taskList?.tasks,
        );
      const memoryCandidate = candidates.find((item) =>
        /\/memory\.json$/u.test(item.target),
      );
      if (memoryCandidate) {
        const memory = await readJson(
          memoryCandidate.candidateAbsolute,
          TaskMemorySchema,
        );
        if (memory.task_id !== manifest.scope.slice("solving/".length))
          throw new CaseProtocolError(
            "SCHEMA_INVALID",
            "Task Memory task_id does not match its solving scope",
          );
      }
      const executionCandidate = candidates.find((item) =>
        /\/execution-result\.json$/u.test(item.target),
      );
      if (executionCandidate) {
        const evidence = await readJson(
          executionCandidate.candidateAbsolute,
          RuntimeEvidenceSchema,
        );
        const attemptPrefix = `attempts/${manifest.scope}/${String(manifest.sequence).padStart(3, "0")}/`;
        if (
          evidence.kind !== "compute" ||
          evidence.status !== "succeeded" ||
          evidence.exit_code !== 0 ||
          !evidence.path.startsWith(attemptPrefix)
        )
          throw new CaseProtocolError(
            "SCHEMA_INVALID",
            "solver execution evidence is not a successful scoped computation",
          );
        const evidencePayload = await resolveInsideCase(
          root,
          evidence.path,
          "existing",
        );
        if ((await hashPath(evidencePayload)) !== evidence.sha256)
          throw new CaseProtocolError(
            "SCHEMA_INVALID",
            "solver execution evidence payload hash does not match",
          );
      }
      if (review.verdict !== "pass")
        return this.applyNonPass(root, snapshot.state, manifest, review);
      const transactionId = randomUUID();
      const preparation = await resolveInsideCase(
        root,
        `.gate-prep-${transactionId}`,
        "candidate",
      );
      const publishedTransaction = await resolveInsideCase(
        root,
        `.gate-txn-${transactionId}`,
        "candidate",
      );
      await mkdir(preparation);
      let transaction = preparation;
      let transactionIdentity = await this.captureDirectoryIdentity(
        root,
        transaction,
        "Gate preparation",
      );
      const reviewRelative = `attempts/${manifest.scope}/${String(manifest.sequence).padStart(3, "0")}/review.json`;
      let prepared = false;
      let committed = false;
      let preparedReview: PreparedReview | undefined;
      try {
        preparedReview = await this.prepareReview(root, reviewRelative, review);
        for (const [index, item] of candidates.entries())
          await this.stageCandidate(
            root,
            transaction,
            transactionIdentity,
            item,
            index,
          );
        const stableRoots = [
          ...new Set(candidates.map((item) => this.stableRoot(item.target))),
        ];
        const journal = await this.prepareGateTransaction(
          root,
          transaction,
          transactionIdentity,
          reviewRelative,
          stableRoots,
        );
        const preparedStableRoots: PreparedStableRoot[] = [];
        for (const stableRoot of journal.roots)
          preparedStableRoots.push({
            ...stableRoot,
            identity: await this.prepareStableRootSnapshot(
              root,
              transaction,
              transactionIdentity,
              stableRoot.name,
              stableRoot.existed,
              candidates,
            ),
          });
        await rename(transaction, publishedTransaction);
        transaction = publishedTransaction;
        transactionIdentity = await this.captureDirectoryIdentity(
          root,
          transaction,
          "Gate transaction",
        );
        prepared = true;
        for (const stableRoot of preparedStableRoots)
          await this.installStableRoot(
            root,
            transaction,
            transactionIdentity,
            stableRoot.name,
            stableRoot.existed,
            stableRoot.identity,
          );
        await this.installPreparedReview(root, preparedReview);
        const acceptedAt = this.now();
        const promoted: ArtifactRef[] = candidates.map((item) => ({
          kind: this.artifactKind(item.target),
          path: item.target,
          sha256: item.sha256,
          accepted_at: acceptedAt,
        }));
        const next: CaseState = structuredClone(snapshot.state);
        for (const artifact of promoted) {
          const index = next.accepted_artifacts.findIndex(
            (existing) => existing.path === artifact.path,
          );
          if (index >= 0) next.accepted_artifacts[index] = artifact;
          else next.accepted_artifacts.push(artifact);
        }
        if (manifest.resolves_blocker) this.resolveBlocker(next, manifest);
        await this.advanceState(root, next);
        next.revision += 1;
        if (next.status === "prepared") next.status = "running";
        await writeJsonAtomic(
          await resolveInsideCase(root, "state.json", "candidate"),
          next,
        );
        await this.markGateTransactionCommitted(
          root,
          transaction,
          transactionIdentity,
        );
        committed = true;
        await rm(transaction, { recursive: true, force: true }).catch(
          () => undefined,
        );
        return {
          outcome: "pass",
          promoted,
          snapshot: await this.inspect(input.caseId),
        };
      } catch (error) {
        if (prepared && !committed)
          await this.rollbackGateTransaction(
            root,
            transaction,
            transactionIdentity,
          );
        await rm(transaction, { recursive: true, force: true }).catch(
          () => undefined,
        );
        await rm(preparation, { recursive: true, force: true }).catch(
          () => undefined,
        );
        if (preparedReview)
          await this.removePreparedReview(root, preparedReview);
        throw error;
      }
    });
  }
  private async gateTransactionDirectories(root: string): Promise<string[]> {
    return (await readdir(root, { withFileTypes: true }))
      .filter(
        (entry) => entry.isDirectory() && GATE_TRANSACTION.test(entry.name),
      )
      .map((entry) => path.join(root, entry.name));
  }
  private async gatePreparationDirectories(root: string): Promise<string[]> {
    return (await readdir(root, { withFileTypes: true }))
      .filter(
        (entry) => entry.isDirectory() && GATE_PREPARATION.test(entry.name),
      )
      .map((entry) => path.join(root, entry.name));
  }
  private async prepareGateTransaction(
    root: string,
    transaction: string,
    transactionIdentity: DirectoryIdentity,
    reviewRelative: string,
    stableRoots: StableRoot[],
  ): Promise<GateTransactionJournal> {
    await this.assertDirectoryIdentity(
      root,
      transaction,
      transactionIdentity,
      "Gate transaction",
    );
    await cp(
      await resolveInsideCase(root, "state.json", "existing"),
      path.join(transaction, "state-backup.json"),
    );
    const lexicalReview = path.join(root, ...reviewRelative.split("/"));
    const reviewExisted = await exists(lexicalReview);
    if (reviewExisted)
      await cp(
        await resolveInsideCase(root, reviewRelative, "existing"),
        path.join(transaction, "review-backup.json"),
      );
    await this.assertDirectoryIdentity(
      root,
      transaction,
      transactionIdentity,
      "Gate transaction",
    );
    const journal: GateTransactionJournal = {
      review_path: reviewRelative,
      review_existed: reviewExisted,
      roots: [],
    };
    for (const name of stableRoots)
      journal.roots.push({
        name,
        existed: await this.lexicalExists(path.join(root, name)),
      });
    await writeJsonAtomic(path.join(transaction, "journal.json"), journal);
    await this.assertDirectoryIdentity(
      root,
      transaction,
      transactionIdentity,
      "Gate transaction",
    );
    return journal;
  }
  private stableRoot(target: string): StableRoot {
    const name = target.split("/")[0];
    if (name === "artifacts" || name === "tasks" || name === "report")
      return name;
    throw new CaseProtocolError(
      "PROMOTION_DENIED",
      `promotion target has no stable Case root: ${target}`,
    );
  }
  private async lexicalExists(target: string): Promise<boolean> {
    try {
      await lstat(target);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }
  private async captureDirectoryIdentity(
    root: string,
    directory: string,
    label: string,
  ): Promise<DirectoryIdentity> {
    try {
      const [rootCanonical, canonical, info] = await Promise.all([
        realpath(root),
        realpath(directory),
        lstat(directory),
      ]);
      if (
        info.isSymbolicLink() ||
        !info.isDirectory() ||
        (canonical !== rootCanonical &&
          !canonical.startsWith(`${rootCanonical}${path.sep}`))
      )
        throw new CaseProtocolError(
          "PATH_ESCAPE",
          `${label} is not a plain directory inside the Case`,
        );
      return { canonical, dev: info.dev, ino: info.ino };
    } catch (error) {
      if (error instanceof CaseProtocolError) throw error;
      throw new CaseProtocolError(
        "PATH_ESCAPE",
        `${label} was removed or replaced`,
        error,
      );
    }
  }
  private async assertDirectoryIdentity(
    root: string,
    directory: string,
    expected: DirectoryIdentity,
    label: string,
  ): Promise<void> {
    const actual = await this.captureDirectoryIdentity(root, directory, label);
    if (
      actual.canonical !== expected.canonical ||
      actual.dev !== expected.dev ||
      actual.ino !== expected.ino
    )
      throw new CaseProtocolError(
        "PATH_ESCAPE",
        `${label} identity changed during Gate`,
      );
  }
  private async isCommittedGateTransaction(
    transaction: string,
  ): Promise<boolean> {
    try {
      const marker = await lstat(path.join(transaction, "committed.json"));
      return marker.isFile() && !marker.isSymbolicLink();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }
  private async prepareReview(
    root: string,
    reviewRelative: string,
    review: Review,
  ): Promise<PreparedReview> {
    const parentRelative = reviewRelative.split("/").slice(0, -1).join("/");
    const parent = await resolveInsideCase(root, parentRelative, "existing");
    const parentIdentity = await this.captureDirectoryIdentity(
      root,
      parent,
      "Attempt review directory",
    );
    const temporary = await resolveInsideCase(
      root,
      `${parentRelative}/.review-${randomUUID()}.json`,
      "candidate",
    );
    await writeJsonAtomic(temporary, review);
    await this.assertDirectoryIdentity(
      root,
      parent,
      parentIdentity,
      "Attempt review directory",
    );
    return {
      parent,
      parentIdentity,
      temporary,
      target: path.join(root, ...reviewRelative.split("/")),
    };
  }
  private async installPreparedReview(
    root: string,
    prepared: PreparedReview,
  ): Promise<void> {
    await this.assertDirectoryIdentity(
      root,
      prepared.parent,
      prepared.parentIdentity,
      "Attempt review directory",
    );
    await resolveInsideCase(
      root,
      path.relative(root, prepared.target).split(path.sep).join("/"),
      "candidate",
    );
    await rename(prepared.temporary, prepared.target);
    await this.assertDirectoryIdentity(
      root,
      prepared.parent,
      prepared.parentIdentity,
      "Attempt review directory",
    );
  }
  private async removePreparedReview(
    root: string,
    prepared: PreparedReview,
  ): Promise<void> {
    try {
      await this.assertDirectoryIdentity(
        root,
        prepared.parent,
        prepared.parentIdentity,
        "Attempt review directory",
      );
      await rm(prepared.temporary, { force: true });
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "ENOENT" &&
        !(error instanceof CaseProtocolError && error.code === "PATH_ESCAPE")
      )
        throw error;
    }
  }
  private async stageCandidate(
    root: string,
    transaction: string,
    transactionIdentity: DirectoryIdentity,
    item: PreparedPromotion,
    index: number,
  ): Promise<void> {
    await this.assertDirectoryIdentity(
      root,
      transaction,
      transactionIdentity,
      "Gate preparation",
    );
    const staged = path.join(transaction, `staged-${index}`);
    await cp(item.candidateAbsolute, staged, { recursive: true });
    await this.assertDirectoryIdentity(
      root,
      transaction,
      transactionIdentity,
      "Gate preparation",
    );
    const currentCandidate = await resolveInsideCase(
      root,
      item.candidate,
      "existing",
    );
    if (
      (await hashPath(staged)) !== item.sha256 ||
      (await hashPath(currentCandidate)) !== item.sha256
    )
      throw new CaseProtocolError(
        "READ_SET_STALE",
        `candidate changed while staging: ${item.candidate}`,
      );
  }
  private async prepareStableRootSnapshot(
    root: string,
    transaction: string,
    transactionIdentity: DirectoryIdentity,
    stableRoot: StableRoot,
    existed: boolean,
    candidates: PreparedPromotion[],
  ): Promise<DirectoryIdentity | undefined> {
    const stable = path.join(root, stableRoot);
    const next = path.join(transaction, `next-${stableRoot}`);
    const stableExists = await this.lexicalExists(stable);
    if (stableExists !== existed)
      throw new CaseProtocolError(
        "PATH_ESCAPE",
        `stable Case root changed while preparing Gate: ${stableRoot}`,
      );
    let stableIdentity: DirectoryIdentity | undefined;
    if (existed) {
      stableIdentity = await this.captureDirectoryIdentity(
        root,
        stable,
        `stable ${stableRoot} root`,
      );
      const stableHash = await hashPath(stable);
      await cp(stable, next, { recursive: true });
      await this.assertDirectoryIdentity(
        root,
        stable,
        stableIdentity,
        `stable ${stableRoot} root`,
      );
      if ((await hashPath(stable)) !== stableHash)
        throw new CaseProtocolError(
          "PATH_ESCAPE",
          `stable Case root changed while snapshotting: ${stableRoot}`,
        );
    } else {
      await mkdir(next);
    }
    const nextIdentity = await this.captureDirectoryIdentity(
      root,
      next,
      `next ${stableRoot} root`,
    );
    for (const [index, item] of candidates.entries()) {
      if (this.stableRoot(item.target) !== stableRoot) continue;
      await this.assertDirectoryIdentity(
        root,
        transaction,
        transactionIdentity,
        "Gate preparation",
      );
      await this.assertDirectoryIdentity(
        root,
        next,
        nextIdentity,
        `next ${stableRoot} root`,
      );
      const relative = item.target.slice(stableRoot.length + 1);
      const target = await resolveInsideCase(next, relative, "candidate");
      await rm(target, { recursive: true, force: true });
      await mkdir(path.dirname(target), { recursive: true });
      await cp(path.join(transaction, `staged-${index}`), target, {
        recursive: true,
      });
      if ((await hashPath(target)) !== item.sha256)
        throw new CaseProtocolError(
          "PATH_ESCAPE",
          `promoted candidate changed while preparing ${item.target}`,
        );
    }
    return stableIdentity;
  }
  private async installStableRoot(
    root: string,
    transaction: string,
    transactionIdentity: DirectoryIdentity,
    stableRoot: StableRoot,
    existed: boolean,
    stableIdentity?: DirectoryIdentity,
  ): Promise<void> {
    const stable = path.join(root, stableRoot);
    const original = path.join(transaction, `original-${stableRoot}`);
    const next = path.join(transaction, `next-${stableRoot}`);
    await this.assertDirectoryIdentity(
      root,
      transaction,
      transactionIdentity,
      "Gate transaction",
    );
    const nextIdentity = await this.captureDirectoryIdentity(
      root,
      next,
      `next ${stableRoot} root`,
    );
    const stableExists = await this.lexicalExists(stable);
    if (stableExists !== existed)
      throw new CaseProtocolError(
        "PATH_ESCAPE",
        `stable Case root changed during Gate: ${stableRoot}`,
      );
    if (existed) {
      if (!stableIdentity)
        throw new CaseProtocolError(
          "PATH_ESCAPE",
          `stable Case root identity is missing: ${stableRoot}`,
        );
      await this.assertDirectoryIdentity(
        root,
        stable,
        stableIdentity,
        `stable ${stableRoot} root`,
      );
      const stableInfo = await lstat(stable);
      if (stableInfo.isSymbolicLink() || !stableInfo.isDirectory())
        throw new CaseProtocolError(
          "PATH_ESCAPE",
          `stable Case root was replaced: ${stableRoot}`,
        );
      await rename(stable, original);
      await this.assertDirectoryIdentity(
        root,
        transaction,
        transactionIdentity,
        "Gate transaction",
      );
      await this.assertDirectoryIdentity(
        root,
        next,
        nextIdentity,
        `next ${stableRoot} root`,
      );
    }
    await this.assertDirectoryIdentity(
      root,
      transaction,
      transactionIdentity,
      "Gate transaction",
    );
    await this.assertDirectoryIdentity(
      root,
      next,
      nextIdentity,
      `next ${stableRoot} root`,
    );
    await rename(next, stable);
    await this.assertDirectoryIdentity(
      root,
      stable,
      { ...nextIdentity, canonical: await realpath(stable) },
      `installed ${stableRoot} root`,
    );
  }
  private async rollbackGateTransaction(
    root: string,
    transaction: string,
    transactionIdentity?: DirectoryIdentity,
  ): Promise<void> {
    if (transactionIdentity)
      await this.assertDirectoryIdentity(
        root,
        transaction,
        transactionIdentity,
        "Gate transaction",
      );
    const journal = await readJson(
      path.join(transaction, "journal.json"),
      GateTransactionJournalSchema,
    );
    for (const stableRoot of [...journal.roots].reverse()) {
      const stable = path.join(root, stableRoot.name);
      const original = path.join(transaction, `original-${stableRoot.name}`);
      if (await this.lexicalExists(original)) {
        await rm(stable, { recursive: true, force: true });
        await rename(original, stable);
      } else if (!stableRoot.existed) {
        await rm(stable, { recursive: true, force: true });
      }
    }
    const previousState = await readJson(
      path.join(transaction, "state-backup.json"),
      CaseStateSchema,
    );
    await writeJsonAtomic(
      await resolveInsideCase(root, "state.json", "candidate"),
      previousState,
    );
    const reviewPath = await resolveInsideCase(
      root,
      journal.review_path,
      "candidate",
    );
    await rm(reviewPath, { force: true });
    if (journal.review_existed)
      await cp(path.join(transaction, "review-backup.json"), reviewPath);
  }
  private async recoverGateTransactions(root: string): Promise<void> {
    for (const preparation of await this.gatePreparationDirectories(root))
      await rm(preparation, { recursive: true, force: true });
    for (const transaction of await this.gateTransactionDirectories(root)) {
      if (await this.isCommittedGateTransaction(transaction)) {
        await rm(transaction, { recursive: true, force: true });
        continue;
      }
      const transactionIdentity = await this.captureDirectoryIdentity(
        root,
        transaction,
        "Gate transaction",
      );
      if (await exists(path.join(transaction, "journal.json")))
        await this.rollbackGateTransaction(
          root,
          transaction,
          transactionIdentity,
        );
      await rm(transaction, { recursive: true, force: true });
    }
  }
  private async markGateTransactionCommitted(
    root: string,
    transaction: string,
    transactionIdentity: DirectoryIdentity,
  ): Promise<void> {
    await this.assertDirectoryIdentity(
      root,
      transaction,
      transactionIdentity,
      "Gate transaction",
    );
    await writeJsonAtomic(path.join(transaction, "committed.json"), {
      committed: true,
    });
    await this.assertDirectoryIdentity(
      root,
      transaction,
      transactionIdentity,
      "Gate transaction",
    );
  }
  private artifactKind(target: string): string {
    if (target === "artifacts/problem-understanding.md")
      return "problem-understanding";
    if (target === "artifacts/tasks.json") return "tasks";
    if (target === "artifacts/task-graph.json") return "task-graph";
    if (target === "artifacts/modeling-scheme.md") return "modeling-scheme";
    if (/\/memory\.json$/u.test(target)) return "task-memory";
    return path.basename(target.replace(/\/$/u, ""));
  }
  private async validateManifestContract(
    root: string,
    snapshot: CaseSnapshot,
    manifest: ContextManifest,
  ): Promise<void> {
    const taskId = manifest.scope.startsWith("solving/")
      ? manifest.scope.slice("solving/".length)
      : undefined;
    const modelingTaskIds =
      manifest.role === "modeler"
        ? (
            await readJson(
              await resolveInsideCase(root, "artifacts/tasks.json", "existing"),
              TaskListSchema,
            )
          ).tasks.map((task) => task.id)
        : [];
    const attemptBase = `attempts/${manifest.scope}/${String(manifest.sequence).padStart(3, "0")}`;
    const recipe = resolveRecipe(
      manifest.role,
      attemptBase,
      taskId,
      modelingTaskIds,
    );
    const same = (left: unknown, right: unknown): boolean =>
      JSON.stringify(left) === JSON.stringify(right);
    const recipeTargets = new Set(
      recipe.promotions.map((promotion) => promotion.target),
    );
    const deniedPromotion = manifest.promotions.find(
      (promotion) => !recipeTargets.has(promotion.target),
    );
    if (deniedPromotion)
      throw new CaseProtocolError(
        "PROMOTION_DENIED",
        `target is not allowed for ${manifest.scope}: ${deniedPromotion.target}`,
      );
    if (
      manifest.scope !== recipe.scope ||
      !same(manifest.allowed_writes, recipe.allowedWrites) ||
      !same(manifest.expected_outputs, recipe.expectedOutputs) ||
      !same(manifest.promotions, recipe.promotions) ||
      !same(manifest.acceptance, recipe.acceptance) ||
      !same(manifest.review.required_reads, recipe.expectedOutputs)
    )
      throw new CaseProtocolError(
        "SCHEMA_INVALID",
        "Context Manifest no longer matches its fixed Role Recipe",
      );

    const rubricRole =
      manifest.role === "solver"
        ? "solving"
        : manifest.role === "writer"
          ? "reporting"
          : manifest.role === "modeler"
            ? "modeling"
            : "analysis";
    if (
      !same(
        manifest.review.rubric,
        snapshot.caseFile.policy.rubrics[rubricRole],
      )
    )
      throw new CaseProtocolError(
        "SCHEMA_INVALID",
        "Context Manifest rubric does not match immutable Case policy",
      );

    let expectedReads: ArtifactRef[];
    let expectedTask: ContextManifest["current_task"] = null;
    if (manifest.role === "analyst") {
      expectedReads = snapshot.inputManifest.files.map((file) => ({
        kind: "input",
        path: file.path,
        sha256: file.sha256,
      }));
    } else if (manifest.role === "modeler") {
      expectedReads = [
        ...snapshot.inputManifest.files.map((file) => ({
          kind: "input",
          path: file.path,
          sha256: file.sha256,
        })),
        ...snapshot.state.accepted_artifacts.filter((artifact) =>
          [
            "artifacts/problem-understanding.md",
            "artifacts/tasks.json",
            "artifacts/task-graph.json",
          ].includes(artifact.path),
        ),
      ];
    } else if (manifest.role === "solver") {
      const graph = await readJson(
        await resolveInsideCase(root, "artifacts/task-graph.json", "existing"),
        TaskGraphSchema,
      );
      const taskList = await readJson(
        await resolveInsideCase(root, "artifacts/tasks.json", "existing"),
        TaskListSchema,
      );
      const graphTask = graph.tasks.find((item) => item.id === taskId);
      expectedTask = taskList.tasks.find((item) => item.id === taskId) ?? null;
      if (!graphTask || !expectedTask)
        throw new CaseProtocolError(
          "DAG_INVALID",
          `solver task ${taskId ?? ""} is absent from accepted task artifacts`,
        );
      const dependencyPaths = new Set(
        graphTask.depends_on.map(
          (dependency) => `tasks/${dependency}/memory.json`,
        ),
      );
      expectedReads = snapshot.state.accepted_artifacts.filter(
        (artifact) =>
          artifact.kind === "modeling-scheme" ||
          dependencyPaths.has(artifact.path),
      );
    } else {
      expectedReads = snapshot.state.accepted_artifacts;
    }
    const sortRefs = (items: ArtifactRef[]): ArtifactRef[] =>
      [...items].sort((left, right) => left.path.localeCompare(right.path));
    if (!same(sortRefs(manifest.required_reads), sortRefs(expectedReads)))
      throw new CaseProtocolError(
        "READ_SET_STALE",
        "Context Manifest required reads differ from current persisted sources",
      );
    if (!same(manifest.current_task, expectedTask))
      throw new CaseProtocolError(
        "SCHEMA_INVALID",
        "Context Manifest current task does not match accepted task artifacts",
      );
  }
  private async deriveCompletion(
    root: string,
    state: CaseState,
  ): Promise<{ complete: boolean; missing: string[] }> {
    const accepted = new Map(
      state.accepted_artifacts.map((artifact) => [artifact.path, artifact]),
    );
    const required = [
      "artifacts/problem-understanding.md",
      "artifacts/tasks.json",
      "artifacts/task-graph.json",
      "artifacts/modeling-scheme.md",
      "report/outline.md",
      "report/notation.md",
      "report/main.tex",
      "report/compile.log",
      "report/report.pdf",
    ];
    if (
      accepted.has("artifacts/task-graph.json") &&
      accepted.has("artifacts/tasks.json")
    ) {
      try {
        const graph = await readJson(
          await resolveInsideCase(
            root,
            "artifacts/task-graph.json",
            "existing",
          ),
          TaskGraphSchema,
        );
        const taskList = await readJson(
          await resolveInsideCase(root, "artifacts/tasks.json", "existing"),
          TaskListSchema,
        );
        required.push(
          ...graph.tasks.map((task) => `tasks/${task.id}/memory.json`),
          ...taskList.tasks
            .filter((task) => task.requires_computation)
            .map((task) => `tasks/${task.id}/execution-result.json`),
        );
      } catch {
        required.push("artifacts/task-dag:schema");
      }
    }
    const missing: string[] = [];
    for (const requiredPath of required) {
      if (requiredPath.endsWith(":schema")) {
        missing.push(requiredPath);
        continue;
      }
      const artifact = accepted.get(requiredPath);
      if (!artifact) {
        missing.push(requiredPath);
        continue;
      }
      try {
        const absolute = await resolveInsideCase(
          root,
          requiredPath,
          "existing",
        );
        if ((await hashPath(absolute)) !== artifact.sha256)
          missing.push(`${requiredPath}:hash`);
        else if (
          requiredPath === "report/report.pdf" &&
          (await stat(absolute)).size === 0
        )
          missing.push("report/report.pdf:non-empty");
      } catch {
        missing.push(requiredPath);
      }
    }
    return {
      complete: missing.length === 0 && state.status === "completed",
      missing: [...new Set(missing)],
    };
  }
  private validateDag(
    graph: { tasks: Array<{ id: string; depends_on: string[]; wave: number }> },
    tasks?: Array<{ id: string }>,
  ): void {
    if (graph.tasks.length === 0)
      throw new CaseProtocolError(
        "DAG_INVALID",
        "task graph must contain at least one task",
      );
    if (!graph.tasks.some((task) => task.wave === 1))
      throw new CaseProtocolError(
        "DAG_INVALID",
        "task graph must start at wave 1",
      );
    const ids = new Set<string>();
    for (const task of graph.tasks) {
      if (ids.has(task.id))
        throw new CaseProtocolError(
          "DAG_INVALID",
          `duplicate task: ${task.id}`,
        );
      ids.add(task.id);
    }
    if (tasks) {
      const listed = new Set(tasks.map((task) => task.id));
      if (
        listed.size !== tasks.length ||
        listed.size !== ids.size ||
        [...listed].some((id) => !ids.has(id))
      )
        throw new CaseProtocolError(
          "DAG_INVALID",
          "task list and task graph IDs differ",
        );
    }
    const byId = new Map(graph.tasks.map((task) => [task.id, task]));
    for (const task of graph.tasks)
      for (const dependency of task.depends_on) {
        const dependencyTask = byId.get(dependency);
        if (!dependencyTask)
          throw new CaseProtocolError(
            "DAG_INVALID",
            `missing dependency: ${dependency}`,
          );
        if (dependencyTask.wave > task.wave)
          throw new CaseProtocolError(
            "DAG_INVALID",
            `dependency ${dependency} cannot be in a later wave`,
          );
      }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string): void => {
      if (visiting.has(id))
        throw new CaseProtocolError(
          "DAG_INVALID",
          "task graph contains a cycle",
        );
      if (visited.has(id)) return;
      visiting.add(id);
      for (const dependency of byId.get(id)?.depends_on ?? [])
        visit(dependency);
      visiting.delete(id);
      visited.add(id);
    };
    for (const id of ids) visit(id);
  }
  private async validateBlockRuntimeEvidence(
    root: string,
    manifest: ContextManifest,
    review: Review,
  ): Promise<void> {
    const attemptPrefix = `attempts/${manifest.scope}/${String(manifest.sequence).padStart(3, "0")}/evidence/`;
    for (const evidencePath of review.evidence.filter((item) =>
      item.startsWith(attemptPrefix),
    )) {
      try {
        const evidence = await readJson(
          await resolveInsideCase(root, evidencePath, "existing"),
          RuntimeEvidenceSchema,
        );
        if (evidence.status !== "failed") continue;
        if (!evidence.path.startsWith(attemptPrefix)) continue;
        const payload = await resolveInsideCase(
          root,
          evidence.path,
          "existing",
        );
        if ((await hashPath(payload)) === evidence.sha256) return;
      } catch {
        continue;
      }
    }
    throw new CaseProtocolError(
      "REVIEW_INVALID",
      "block Review for missing candidates requires valid failed Runtime Evidence",
    );
  }
  private async advanceState(root: string, state: CaseState): Promise<void> {
    const accepted = new Set(
      state.accepted_artifacts.map((artifact) => artifact.path),
    );
    if (
      state.stage === "analysis" &&
      [
        "artifacts/problem-understanding.md",
        "artifacts/tasks.json",
        "artifacts/task-graph.json",
      ].every((item) => accepted.has(item))
    ) {
      state.stage = "modeling";
      return;
    }
    if (
      state.stage === "modeling" &&
      accepted.has("artifacts/modeling-scheme.md")
    ) {
      const graph = await readJson(
        await resolveInsideCase(root, "artifacts/task-graph.json", "existing"),
        TaskGraphSchema,
      );
      this.validateDag(graph);
      if (
        !graph.tasks.every((task) =>
          accepted.has(`tasks/${task.id}/retrieved-methods.json`),
        )
      )
        return;
      const caseFile = await readJson(
        await resolveInsideCase(root, "case.json", "existing"),
        CaseFileSchema,
      );
      state.revision_budget.solving = Object.fromEntries(
        graph.tasks.map((task) => [
          task.id,
          caseFile.policy.revision_budget.solving_per_task,
        ]),
      );
      state.stage = "solving";
      state.current_wave = 1;
      return;
    }
    if (state.stage === "solving") {
      if (state.blockers.some((blocker) => blocker.resolved_at === null))
        return;
      const graph = await readJson(
        await resolveInsideCase(root, "artifacts/task-graph.json", "existing"),
        TaskGraphSchema,
      );
      const current = state.current_wave!;
      const waveTasks = graph.tasks.filter((task) => task.wave === current);
      if (
        !waveTasks.every((task) => accepted.has(`tasks/${task.id}/memory.json`))
      )
        return;
      const remainingWaves = [...new Set(graph.tasks.map((task) => task.wave))]
        .filter((wave) => wave > current)
        .sort((a, b) => a - b);
      if (remainingWaves.length > 0) state.current_wave = remainingWaves[0]!;
      else {
        state.stage = "reporting";
        state.current_wave = null;
      }
      return;
    }
    if (state.stage === "reporting") {
      const required = [
        "report/outline.md",
        "report/notation.md",
        "report/main.tex",
        "report/compile.log",
        "report/report.pdf",
      ];
      if (
        required.every((item) => accepted.has(item)) &&
        (
          await stat(
            await resolveInsideCase(root, "report/report.pdf", "existing"),
          )
        ).size > 0
      )
        state.status = "completed";
    }
  }
  private async applyNonPass(
    root: string,
    state: CaseState,
    manifest: ContextManifest,
    review: ReturnType<typeof ReviewSchema.parse>,
  ): Promise<GateResult> {
    const reviewRelative = `attempts/${manifest.scope}/${String(manifest.sequence).padStart(3, "0")}/review.json`;
    const next: CaseState = structuredClone(state);
    if (review.verdict === "revise") {
      let remaining: number;
      if (
        manifest.scope === "analysis" ||
        manifest.scope === "modeling" ||
        manifest.scope === "reporting"
      ) {
        remaining = next.revision_budget[manifest.scope];
        if (remaining > 0) next.revision_budget[manifest.scope] = remaining - 1;
      } else {
        const taskId = manifest.scope.slice("solving/".length);
        remaining = next.revision_budget.solving[taskId] ?? 0;
        if (remaining > 0) next.revision_budget.solving[taskId] = remaining - 1;
      }
      next.status =
        remaining === 0
          ? "failed"
          : next.blockers.some((blocker) => blocker.resolved_at === null)
            ? "blocked"
            : "running";
    } else {
      const reason = review.required_fixes[0] ?? review.findings[0];
      if (!reason)
        throw new CaseProtocolError(
          "REVIEW_INVALID",
          "block Review requires a reason",
        );
      next.blockers.push({
        id: `blocker-${String(next.blockers.length + 1).padStart(3, "0")}`,
        scope: manifest.scope,
        attempt_id: manifest.attempt_id,
        reason,
        created_at: this.now(),
        resolved_at: null,
      });
      next.status = "blocked";
    }
    next.revision += 1;
    const transactionId = randomUUID();
    const preparation = await resolveInsideCase(
      root,
      `.gate-prep-${transactionId}`,
      "candidate",
    );
    const publishedTransaction = await resolveInsideCase(
      root,
      `.gate-txn-${transactionId}`,
      "candidate",
    );
    await mkdir(preparation);
    let transaction = preparation;
    let transactionIdentity = await this.captureDirectoryIdentity(
      root,
      transaction,
      "Gate preparation",
    );
    let prepared = false;
    let committed = false;
    let preparedReview: PreparedReview | undefined;
    try {
      preparedReview = await this.prepareReview(root, reviewRelative, review);
      await this.prepareGateTransaction(
        root,
        transaction,
        transactionIdentity,
        reviewRelative,
        [],
      );
      await rename(transaction, publishedTransaction);
      transaction = publishedTransaction;
      transactionIdentity = await this.captureDirectoryIdentity(
        root,
        transaction,
        "Gate transaction",
      );
      prepared = true;
      await this.installPreparedReview(root, preparedReview);
      await writeJsonAtomic(
        await resolveInsideCase(root, "state.json", "candidate"),
        next,
      );
      await this.markGateTransactionCommitted(
        root,
        transaction,
        transactionIdentity,
      );
      committed = true;
    } catch (error) {
      if (prepared && !committed)
        await this.rollbackGateTransaction(
          root,
          transaction,
          transactionIdentity,
        );
      await rm(transaction, { recursive: true, force: true }).catch(
        () => undefined,
      );
      await rm(preparation, { recursive: true, force: true }).catch(
        () => undefined,
      );
      if (preparedReview) await this.removePreparedReview(root, preparedReview);
      throw error;
    }
    await rm(transaction, { recursive: true, force: true }).catch(
      () => undefined,
    );
    return {
      outcome: review.verdict,
      promoted: [],
      snapshot: await this.inspect(manifest.case_id),
    };
  }
  private resolveBlocker(state: CaseState, manifest: ContextManifest): void {
    const blocker = state.blockers.find(
      (item) =>
        item.id === manifest.resolves_blocker && item.resolved_at === null,
    );
    if (!blocker || blocker.scope !== manifest.scope)
      throw new CaseProtocolError(
        "BLOCKER_INVALID",
        "blocker is missing, resolved, or belongs to another scope",
      );
    blocker.resolved_at = this.now();
    if (!state.blockers.some((item) => item.resolved_at === null))
      state.status = "running";
  }
}
