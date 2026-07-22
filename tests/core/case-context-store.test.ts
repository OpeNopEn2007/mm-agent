import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  lstat,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { FileCaseContextStore } from "../../src/core/case-context-store.js";
import { migrateCase } from "../../src/core/migrations.js";
import {
  exists,
  hashPath,
  readJson,
  resolveInsideCase,
  withCaseLock,
  writeJsonAtomic,
} from "../../src/core/paths.js";
import {
  CaseProtocolError,
  CaseStateSchema,
  ContextManifestSchema,
  ReviewSchema,
  type OpenInput,
  type Review,
} from "../../src/core/schema.js";

function hasCode(code: string): (error: unknown) => boolean {
  return (error) => error instanceof CaseProtocolError && error.code === code;
}

async function temporaryCaseRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-core-"));
  const caseRoot = path.join(root, "runs", "case-alpha");
  await mkdir(path.join(caseRoot, "input"), { recursive: true });
  return caseRoot;
}

const fixtureRoot = path.resolve("tests/fixtures/cases");

function fixtureOpenInput(): OpenInput {
  return {
    sourceKind: "explicit-path",
    files: [
      {
        label: "problem",
        sourcePath: path.join(fixtureRoot, "input", "problem.md"),
      },
    ],
    policy: {
      revisionBudget: {
        analysis: 1,
        modeling: 1,
        solvingPerTask: 1,
        reporting: 1,
      },
      rubrics: {
        analysis: {
          sourcePath: path.join(fixtureRoot, "rubrics", "analysis.md"),
        },
        modeling: {
          sourcePath: path.join(fixtureRoot, "rubrics", "modeling.md"),
        },
        solving: {
          sourcePath: path.join(fixtureRoot, "rubrics", "solving.md"),
        },
        reporting: {
          sourcePath: path.join(fixtureRoot, "rubrics", "reporting.md"),
        },
      },
    },
  };
}

async function temporaryRunsRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-store-"));
  return path.join(root, "runs");
}

test("safe persistence rejects unknown versions and path escapes", async () => {
  const caseRoot = await temporaryCaseRoot();
  assert.throws(
    () => CaseStateSchema.parse({ schema_version: 2 }),
    hasCode("SCHEMA_VERSION_UNSUPPORTED"),
  );
  await assert.rejects(
    resolveInsideCase(caseRoot, "../outside.txt", "candidate"),
    hasCode("PATH_ESCAPE"),
  );
  await assert.rejects(
    resolveInsideCase(caseRoot, "C:\\outside.txt", "candidate"),
    hasCode("PATH_ESCAPE"),
  );
  assert.throws(() =>
    ReviewSchema.parse({
      ...passReview("analysis-001", "../outside.txt"),
    }),
  );
});

test("safe persistence rejects a symlink or junction escape", async () => {
  const caseRoot = await temporaryCaseRoot();
  const outside = await mkdtemp(path.join(os.tmpdir(), "mm-agent-outside-"));
  await symlink(outside, path.join(caseRoot, "escape"), "junction");
  await assert.rejects(
    resolveInsideCase(caseRoot, "escape/file.txt", "candidate"),
    hasCode("PATH_ESCAPE"),
  );
});

test("inspect rejects a junction replacing a fixed Case directory", async () => {
  const runsRoot = await temporaryRunsRoot();
  const store = new FileCaseContextStore({ runsRoot });
  await store.open("case-alpha", fixtureOpenInput());
  const inputRoot = path.join(runsRoot, "case-alpha", "input");
  const outside = await mkdtemp(path.join(os.tmpdir(), "mm-agent-fixed-"));
  const outsideInput = path.join(outside, "input");
  await rename(inputRoot, outsideInput);
  await symlink(outsideInput, inputRoot, "junction");

  await assert.rejects(store.inspect("case-alpha"), hasCode("PATH_ESCAPE"));
});

test("inspect rejects a Case root junction outside runsRoot", async () => {
  const sourceRuns = await temporaryRunsRoot();
  const source = new FileCaseContextStore({ runsRoot: sourceRuns });
  await source.open("case-alpha", fixtureOpenInput());

  const targetRuns = await temporaryRunsRoot();
  await mkdir(targetRuns, { recursive: true });
  await symlink(
    path.join(sourceRuns, "case-alpha"),
    path.join(targetRuns, "case-alpha"),
    "junction",
  );
  const target = new FileCaseContextStore({ runsRoot: targetRuns });
  await assert.rejects(target.inspect("case-alpha"), hasCode("PATH_ESCAPE"));
});

test("migration seam never guesses an unsupported transition", async () => {
  const caseRoot = await temporaryCaseRoot();
  const statePath = path.join(caseRoot, "state.json");
  const originalState = `${JSON.stringify({ schema_version: 0 })}\n`;
  await writeFile(statePath, originalState, "utf8");

  await assert.rejects(
    migrateCase(caseRoot, 0, 1),
    hasCode("MIGRATION_UNSUPPORTED"),
  );
  assert.equal(await readFile(statePath, "utf8"), originalState);
});

test("same-version migration validates persisted Case files", async () => {
  const caseRoot = await temporaryCaseRoot();
  await writeFile(
    path.join(caseRoot, "case.json"),
    `${JSON.stringify({ schema_version: 1 })}\n`,
    "utf8",
  );
  await writeFile(
    path.join(caseRoot, "state.json"),
    `${JSON.stringify({ schema_version: 1 })}\n`,
    "utf8",
  );
  await writeFile(
    path.join(caseRoot, "input", "manifest.json"),
    `${JSON.stringify({ schema_version: 1 })}\n`,
    "utf8",
  );
  await assert.rejects(migrateCase(caseRoot, 1, 1), hasCode("SCHEMA_INVALID"));
});

test("open copies immutable input and inspect recovers persisted facts", async () => {
  const runsRoot = await temporaryRunsRoot();
  const store = new FileCaseContextStore({
    runsRoot,
    now: () => "2026-07-16T00:00:00.000Z",
  });
  const created = await store.open("case-alpha", fixtureOpenInput());

  assert.equal(created.state.revision, 0);
  assert.equal(created.state.stage, "analysis");
  assert.equal(created.state.status, "prepared");
  assert.equal(created.state.current_wave, null);
  assert.deepEqual(created.state.revision_budget, {
    analysis: 1,
    modeling: 1,
    solving: {},
    reporting: 1,
  });
  assert.equal(created.caseFile.input_manifest, "input/manifest.json");
  assert.equal(
    created.inputManifest.files[0]?.path,
    "input/files/001-problem.md",
  );

  const recovered = await new FileCaseContextStore({ runsRoot }).inspect(
    "case-alpha",
  );
  assert.deepEqual(recovered.state, created.state);
  assert.deepEqual(recovered.activeAttempts, []);
});

test("open refuses replacement and inspect refuses unknown schema", async () => {
  const runsRoot = await temporaryRunsRoot();
  const store = new FileCaseContextStore({ runsRoot });
  await store.open("case-alpha", fixtureOpenInput());
  await assert.rejects(
    store.open("case-alpha", fixtureOpenInput()),
    hasCode("CASE_EXISTS"),
  );

  await writeFile(
    path.join(runsRoot, "case-alpha", "case.json"),
    `${JSON.stringify({ schema_version: 99 })}\n`,
    "utf8",
  );
  await assert.rejects(
    store.inspect("case-alpha"),
    hasCode("SCHEMA_VERSION_UNSUPPORTED"),
  );
});

test("open rejects invalid policy before publishing a Case directory", async () => {
  const runsRoot = await temporaryRunsRoot();
  const store = new FileCaseContextStore({ runsRoot });
  const input = fixtureOpenInput();
  input.policy.revisionBudget.analysis = -1;

  await assert.rejects(
    store.open("case-alpha", input),
    hasCode("SCHEMA_INVALID"),
  );
  await assert.rejects(store.inspect("case-alpha"), hasCode("CASE_NOT_FOUND"));
});

test("Case IDs are constrained before resolving a Case path", async () => {
  const store = new FileCaseContextStore({
    runsRoot: await temporaryRunsRoot(),
  });
  for (const caseId of ["../escape", "Case-Alpha", "case alpha", "-case"]) {
    await assert.rejects(store.inspect(caseId), hasCode("INVALID_CASE_ID"));
  }
});

test("dispatch writes one immutable Actor manifest and rejects a second active attempt", async () => {
  const runsRoot = await temporaryRunsRoot();
  const store = new FileCaseContextStore({
    runsRoot,
    now: () => "2026-07-16T00:00:00.000Z",
  });
  await store.open("case-alpha", fixtureOpenInput());

  const first = await store.dispatch({
    caseId: "case-alpha",
    role: "analyst",
    goal: "analyze the problem",
  });
  assert.equal(first.attemptId, "analysis-001");
  assert.equal(first.contextPath, "attempts/analysis/001/context.json");
  assert.equal(first.manifest.base_revision, 0);
  assert.equal(first.manifest.role, "analyst");
  assert.equal((await store.inspect("case-alpha")).state.revision, 0);

  await assert.rejects(
    store.dispatch({
      caseId: "case-alpha",
      role: "analyst",
      goal: "duplicate",
    }),
    hasCode("ACTIVE_ATTEMPT"),
  );
});

test("two Stores concurrently dispatching one scope produce one ACTIVE_ATTEMPT", async () => {
  const runsRoot = await temporaryRunsRoot();
  const first = new FileCaseContextStore({ runsRoot });
  const second = new FileCaseContextStore({ runsRoot });
  await first.open("case-alpha", fixtureOpenInput());
  const results = await Promise.allSettled([
    first.dispatch({ caseId: "case-alpha", role: "analyst", goal: "first" }),
    second.dispatch({
      caseId: "case-alpha",
      role: "analyst",
      goal: "second",
    }),
  ]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  const rejection = results.find((item) => item.status === "rejected");
  assert.equal(
    rejection?.status === "rejected" &&
      rejection.reason instanceof CaseProtocolError &&
      rejection.reason.code,
    "ACTIVE_ATTEMPT",
  );
});

test("inspect rejects a Context Manifest whose identity does not match its directory", async () => {
  const runsRoot = await temporaryRunsRoot();
  const store = new FileCaseContextStore({ runsRoot });
  await store.open("case-alpha", fixtureOpenInput());
  const dispatched = await store.dispatch({
    caseId: "case-alpha",
    role: "analyst",
    goal: "analyze",
  });
  const contextPath = path.join(
    runsRoot,
    "case-alpha",
    ...dispatched.contextPath.split("/"),
  );
  const manifest = await readJson(contextPath, ContextManifestSchema);
  manifest.case_id = "case-beta";
  await writeJsonAtomic(contextPath, manifest);

  await assert.rejects(store.inspect("case-alpha"), hasCode("SCHEMA_INVALID"));
});

async function prepareAnalysisAttempt(runsRoot: string): Promise<{
  store: FileCaseContextStore;
  review: Review;
  contextPath: string;
}> {
  const store = new FileCaseContextStore({
    runsRoot,
    now: () => "2026-07-16T00:00:00.000Z",
  });
  await store.open("case-alpha", fixtureOpenInput());
  const dispatch = await store.dispatch({
    caseId: "case-alpha",
    role: "analyst",
    goal: "analyze",
  });
  const attemptRoot = path.join(
    runsRoot,
    "case-alpha",
    "attempts",
    "analysis",
    "001",
  );
  await writeFile(
    path.join(attemptRoot, "problem-understanding.md"),
    "# Understanding\n",
    "utf8",
  );
  await writeJsonAtomic(path.join(attemptRoot, "tasks.json"), {
    schema_version: 1,
    tasks: [
      { id: "task-01", description: "solve", requires_computation: true },
    ],
  });
  await writeJsonAtomic(path.join(attemptRoot, "task-graph.json"), {
    schema_version: 1,
    tasks: [{ id: "task-01", depends_on: [], wave: 1 }],
  });
  return {
    store,
    contextPath: path.join(attemptRoot, "context.json"),
    review: {
      schema_version: 1,
      attempt_id: dispatch.attemptId,
      verdict: "pass",
      findings: [],
      required_fixes: [],
      evidence: ["attempts/analysis/001/problem-understanding.md"],
      reviewed_at: "2026-07-16T00:00:00.000Z",
    },
  };
}

test("analysis pass gate promotes artifacts and advances to modeling", async () => {
  const runsRoot = await temporaryRunsRoot();
  const { store, review } = await prepareAnalysisAttempt(runsRoot);
  const result = await store.gate({
    caseId: "case-alpha",
    attemptId: "analysis-001",
    review,
    expectedRevision: 0,
  });
  assert.equal(result.outcome, "pass");
  assert.equal(result.snapshot.state.revision, 1);
  assert.equal(result.snapshot.state.stage, "modeling");
  assert.equal(result.snapshot.state.status, "running");
  assert.deepEqual(result.promoted.map((item) => item.path).sort(), [
    "artifacts/problem-understanding.md",
    "artifacts/task-graph.json",
    "artifacts/tasks.json",
  ]);
  assert.equal(result.snapshot.activeAttempts.length, 0);
});

test("modeler reads immutable input and requires task retrieval evidence", async () => {
  const runsRoot = await temporaryRunsRoot();
  const prepared = await prepareAnalysisAttempt(runsRoot);
  await prepared.store.gate({
    caseId: "case-alpha",
    attemptId: "analysis-001",
    review: prepared.review,
    expectedRevision: 0,
  });

  const modeling = await prepared.store.dispatch({
    caseId: "case-alpha",
    role: "modeler",
    goal: "model with evidence",
  });
  assert.deepEqual(
    modeling.manifest.required_reads.map((item) => item.path).sort(),
    [
      "artifacts/problem-understanding.md",
      "artifacts/task-graph.json",
      "artifacts/tasks.json",
      "input/files/001-problem.md",
    ],
  );
  assert.deepEqual(
    modeling.manifest.promotions.map((item) => item.target).sort(),
    ["artifacts/modeling-scheme.md", "tasks/task-01/retrieved-methods.json"],
  );

  const modelingRoot = path.join(
    runsRoot,
    "case-alpha",
    "attempts",
    "modeling",
    "001",
  );
  await writeFile(
    path.join(modelingRoot, "modeling-scheme.md"),
    "# Model\n",
    "utf8",
  );
  await assert.rejects(
    prepared.store.gate({
      caseId: "case-alpha",
      attemptId: modeling.attemptId,
      review: passReview(
        modeling.attemptId,
        "attempts/modeling/001/modeling-scheme.md",
      ),
      expectedRevision: 1,
    }),
    hasCode("CANDIDATE_MISSING"),
  );
  assert.equal(
    (await prepared.store.inspect("case-alpha")).state.stage,
    "modeling",
  );
});

test("gate rejects stale revision and changed required reads before mutation", async () => {
  const staleRoot = await temporaryRunsRoot();
  const stale = await prepareAnalysisAttempt(staleRoot);
  await assert.rejects(
    stale.store.gate({
      caseId: "case-alpha",
      attemptId: "analysis-001",
      review: stale.review,
      expectedRevision: 1,
    }),
    hasCode("STALE_REVISION"),
  );
  assert.equal((await stale.store.inspect("case-alpha")).state.revision, 0);

  const driftRoot = await temporaryRunsRoot();
  const drift = await prepareAnalysisAttempt(driftRoot);
  await writeFile(
    path.join(driftRoot, "case-alpha", "input", "files", "001-problem.md"),
    "changed",
    "utf8",
  );
  await assert.rejects(
    drift.store.gate({
      caseId: "case-alpha",
      attemptId: "analysis-001",
      review: drift.review,
      expectedRevision: 0,
    }),
    hasCode("READ_SET_STALE"),
  );
  assert.equal((await drift.store.inspect("case-alpha")).state.revision, 0);

  const rubricRoot = await temporaryRunsRoot();
  const rubricDrift = await prepareAnalysisAttempt(rubricRoot);
  await writeFile(
    path.join(
      rubricRoot,
      "case-alpha",
      "input",
      "policy",
      "rubrics",
      "analysis.md",
    ),
    "changed rubric",
    "utf8",
  );
  await assert.rejects(
    rubricDrift.store.gate({
      caseId: "case-alpha",
      attemptId: "analysis-001",
      review: rubricDrift.review,
      expectedRevision: 0,
    }),
    hasCode("READ_SET_STALE"),
  );
  assert.equal(
    (await rubricDrift.store.inspect("case-alpha")).state.revision,
    0,
  );
});

test("gate rejects Review evidence that is not a current Case path", async () => {
  const runsRoot = await temporaryRunsRoot();
  const prepared = await prepareAnalysisAttempt(runsRoot);
  await assert.rejects(
    prepared.store.gate({
      caseId: "case-alpha",
      attemptId: "analysis-001",
      review: {
        ...prepared.review,
        evidence: ["attempts/analysis/001/not-created.md"],
      },
      expectedRevision: 0,
    }),
    hasCode("REVIEW_INVALID"),
  );
  assert.equal((await prepared.store.inspect("case-alpha")).state.revision, 0);
});

test("gate rejects a Manifest with a deleted required read or recipe output", async () => {
  const readRoot = await temporaryRunsRoot();
  const readTamper = await prepareAnalysisAttempt(readRoot);
  const readManifest = await readJson(
    readTamper.contextPath,
    ContextManifestSchema,
  );
  readManifest.required_reads = [];
  await writeJsonAtomic(readTamper.contextPath, readManifest);
  await assert.rejects(
    readTamper.store.gate({
      caseId: "case-alpha",
      attemptId: "analysis-001",
      review: readTamper.review,
      expectedRevision: 0,
    }),
    hasCode("READ_SET_STALE"),
  );

  const recipeRoot = await temporaryRunsRoot();
  const recipeTamper = await prepareAnalysisAttempt(recipeRoot);
  const recipeManifest = await readJson(
    recipeTamper.contextPath,
    ContextManifestSchema,
  );
  recipeManifest.promotions = recipeManifest.promotions.slice(0, 1);
  recipeManifest.expected_outputs = recipeManifest.expected_outputs.slice(0, 1);
  await writeJsonAtomic(recipeTamper.contextPath, recipeManifest);
  await assert.rejects(
    recipeTamper.store.gate({
      caseId: "case-alpha",
      attemptId: "analysis-001",
      review: recipeTamper.review,
      expectedRevision: 0,
    }),
    hasCode("SCHEMA_INVALID"),
  );
});

test("gate rejects missing candidates and targets outside the scope whitelist", async () => {
  const missingRoot = await temporaryRunsRoot();
  const missing = await prepareAnalysisAttempt(missingRoot);
  await rm(
    path.join(
      missingRoot,
      "case-alpha",
      "attempts",
      "analysis",
      "001",
      "tasks.json",
    ),
  );
  await assert.rejects(
    missing.store.gate({
      caseId: "case-alpha",
      attemptId: "analysis-001",
      review: missing.review,
      expectedRevision: 0,
    }),
    hasCode("CANDIDATE_MISSING"),
  );

  const deniedRoot = await temporaryRunsRoot();
  const denied = await prepareAnalysisAttempt(deniedRoot);
  const manifest = await readJson(denied.contextPath, ContextManifestSchema);
  manifest.promotions[0]!.target = "report/report.pdf";
  await writeJsonAtomic(denied.contextPath, manifest);
  await assert.rejects(
    denied.store.gate({
      caseId: "case-alpha",
      attemptId: "analysis-001",
      review: denied.review,
      expectedRevision: 0,
    }),
    hasCode("PROMOTION_DENIED"),
  );
});

test("gate rejects a junction introduced after promotion validation", async () => {
  const runsRoot = await temporaryRunsRoot();
  const prepared = await prepareAnalysisAttempt(runsRoot);
  const caseRoot = path.join(runsRoot, "case-alpha");
  const attemptRoot = path.join(caseRoot, "attempts", "analysis", "001");
  await writeFile(
    path.join(attemptRoot, "problem-understanding.md"),
    `# Understanding\n${"x".repeat(16 * 1024 * 1024)}`,
    "utf8",
  );
  const outside = await mkdtemp(path.join(os.tmpdir(), "mm-agent-race-"));

  const gatePromise = prepared.store.gate({
    caseId: "case-alpha",
    attemptId: "analysis-001",
    review: prepared.review,
    expectedRevision: 0,
  });
  const racePromise = (async () => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const entries = await readdir(caseRoot);
      if (entries.some((entry) => entry.startsWith(".gate-txn-"))) {
        const artifacts = path.join(caseRoot, "artifacts");
        if (await exists(artifacts))
          await rename(artifacts, path.join(caseRoot, "artifacts-raced"));
        await symlink(outside, artifacts, "junction");
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    throw new Error("Gate transaction did not start");
  })();
  const [gateResult, raceResult] = await Promise.allSettled([
    gatePromise,
    racePromise,
  ]);

  assert.equal(raceResult.status, "fulfilled");
  assert.equal(gateResult.status, "rejected");
  if (gateResult.status === "rejected")
    assert.equal(
      hasCode("PATH_ESCAPE")(gateResult.reason),
      true,
      String(gateResult.reason),
    );
  assert.deepEqual(await readdir(outside), []);
});

test("gate rejects replacement of its transaction staging directory", async () => {
  const runsRoot = await temporaryRunsRoot();
  const store = new FileCaseContextStore({ runsRoot });
  await store.open("case-alpha", fixtureOpenInput());
  const caseRoot = path.join(runsRoot, "case-alpha");
  const transaction = path.join(caseRoot, ".gate-txn-test-fixture");
  await mkdir(path.join(transaction, "next-artifacts"), { recursive: true });
  const transactionInfo = await lstat(transaction);
  const transactionIdentity = {
    canonical: await realpath(transaction),
    dev: transactionInfo.dev,
    ino: transactionInfo.ino,
  };
  const outside = await mkdtemp(path.join(os.tmpdir(), "mm-agent-txn-race-"));
  await rename(transaction, path.join(caseRoot, ".gate-raced-aside"));
  await symlink(outside, transaction, "junction");

  const internals = store as unknown as {
    installStableRoot(
      root: string,
      transactionPath: string,
      identity: typeof transactionIdentity,
      stableRoot: "artifacts",
      existed: boolean,
      stableIdentity?: typeof transactionIdentity,
    ): Promise<void>;
  };
  await assert.rejects(
    internals.installStableRoot(
      caseRoot,
      transaction,
      transactionIdentity,
      "artifacts",
      false,
      undefined,
    ),
    hasCode("PATH_ESCAPE"),
  );
  assert.deepEqual(await readdir(outside), []);
});

test("gate rejects a candidate parent replaced while staging", async () => {
  const runsRoot = await temporaryRunsRoot();
  const prepared = await prepareAnalysisAttempt(runsRoot);
  const caseRoot = path.join(runsRoot, "case-alpha");
  const attemptRoot = path.join(caseRoot, "attempts", "analysis", "001");
  const candidate = path.join(attemptRoot, "problem-understanding.md");
  const candidateHash = await hashPath(candidate);
  const transaction = path.join(caseRoot, ".gate-prep-test-fixture");
  await mkdir(transaction);
  const transactionInfo = await lstat(transaction);
  const transactionIdentity = {
    canonical: await realpath(transaction),
    dev: transactionInfo.dev,
    ino: transactionInfo.ino,
  };
  const outside = await mkdtemp(
    path.join(os.tmpdir(), "mm-agent-candidate-race-"),
  );
  await writeFile(path.join(outside, "problem-understanding.md"), "outside");
  await rename(attemptRoot, path.join(caseRoot, "attempt-raced-aside"));
  await symlink(outside, attemptRoot, "junction");

  const internals = prepared.store as unknown as {
    stageCandidate(
      root: string,
      transactionPath: string,
      identity: typeof transactionIdentity,
      item: {
        candidate: string;
        target: string;
        candidateAbsolute: string;
        sha256: string;
      },
      index: number,
    ): Promise<void>;
  };
  await assert.rejects(
    internals.stageCandidate(
      caseRoot,
      transaction,
      transactionIdentity,
      {
        candidate: "attempts/analysis/001/problem-understanding.md",
        target: "artifacts/problem-understanding.md",
        candidateAbsolute: candidate,
        sha256: candidateHash,
      },
      0,
    ),
    hasCode("PATH_ESCAPE"),
  );
  assert.deepEqual(await readdir(outside), ["problem-understanding.md"]);
});

test("gate does not install a Review through a replaced Attempt parent", async () => {
  const runsRoot = await temporaryRunsRoot();
  const prepared = await prepareAnalysisAttempt(runsRoot);
  const caseRoot = path.join(runsRoot, "case-alpha");
  const attemptRoot = path.join(caseRoot, "attempts", "analysis", "001");
  const reviewRelative = "attempts/analysis/001/review.json";
  type PreparedReviewFixture = {
    parent: string;
    parentIdentity: { canonical: string; dev: number; ino: number };
    temporary: string;
    target: string;
  };
  const internals = prepared.store as unknown as {
    prepareReview(
      root: string,
      relative: string,
      review: Review,
    ): Promise<PreparedReviewFixture>;
    installPreparedReview(
      root: string,
      review: PreparedReviewFixture,
    ): Promise<void>;
  };
  const stagedReview = await internals.prepareReview(
    caseRoot,
    reviewRelative,
    prepared.review,
  );
  const outside = await mkdtemp(
    path.join(os.tmpdir(), "mm-agent-review-race-"),
  );
  await rename(attemptRoot, path.join(caseRoot, "attempt-raced-aside"));
  await symlink(outside, attemptRoot, "junction");

  await assert.rejects(
    internals.installPreparedReview(caseRoot, stagedReview),
    hasCode("PATH_ESCAPE"),
  );
  assert.deepEqual(await readdir(outside), []);
});

test("gate rejects replacement of its prepared stable root", async () => {
  const runsRoot = await temporaryRunsRoot();
  const store = new FileCaseContextStore({ runsRoot });
  await store.open("case-alpha", fixtureOpenInput());
  const caseRoot = path.join(runsRoot, "case-alpha");
  const transaction = path.join(caseRoot, ".gate-txn-test-fixture");
  const next = path.join(transaction, "next-artifacts");
  await mkdir(next, { recursive: true });
  const transactionInfo = await lstat(transaction);
  const transactionIdentity = {
    canonical: await realpath(transaction),
    dev: transactionInfo.dev,
    ino: transactionInfo.ino,
  };
  const outside = await mkdtemp(path.join(os.tmpdir(), "mm-agent-next-race-"));
  await rename(next, path.join(transaction, "next-artifacts-raced"));
  await symlink(outside, next, "junction");

  const internals = store as unknown as {
    installStableRoot(
      root: string,
      transactionPath: string,
      identity: typeof transactionIdentity,
      stableRoot: "artifacts",
      existed: boolean,
      stableIdentity?: typeof transactionIdentity,
    ): Promise<void>;
  };
  await assert.rejects(
    internals.installStableRoot(
      caseRoot,
      transaction,
      transactionIdentity,
      "artifacts",
      false,
      undefined,
    ),
    hasCode("PATH_ESCAPE"),
  );
  assert.deepEqual(await readdir(outside), []);
});

test("gate rejects replacement of an existing stable root after snapshot", async () => {
  const runsRoot = await temporaryRunsRoot();
  const store = new FileCaseContextStore({ runsRoot });
  await store.open("case-alpha", fixtureOpenInput());
  const caseRoot = path.join(runsRoot, "case-alpha");
  const stable = path.join(caseRoot, "artifacts");
  await mkdir(stable);
  await writeFile(path.join(stable, "accepted.md"), "accepted", "utf8");
  const stableInfo = await lstat(stable);
  const stableIdentity = {
    canonical: await realpath(stable),
    dev: stableInfo.dev,
    ino: stableInfo.ino,
  };
  const transaction = path.join(caseRoot, ".gate-txn-test-fixture");
  await mkdir(path.join(transaction, "next-artifacts"), { recursive: true });
  const transactionInfo = await lstat(transaction);
  const transactionIdentity = {
    canonical: await realpath(transaction),
    dev: transactionInfo.dev,
    ino: transactionInfo.ino,
  };
  await rename(stable, path.join(caseRoot, "artifacts-raced-aside"));
  await mkdir(stable);

  const internals = store as unknown as {
    installStableRoot(
      root: string,
      transactionPath: string,
      identity: typeof transactionIdentity,
      stableRoot: "artifacts",
      existed: boolean,
      expectedStableIdentity?: typeof stableIdentity,
    ): Promise<void>;
  };
  await assert.rejects(
    internals.installStableRoot(
      caseRoot,
      transaction,
      transactionIdentity,
      "artifacts",
      true,
      stableIdentity,
    ),
    hasCode("PATH_ESCAPE"),
  );
  assert.equal(await exists(path.join(stable, "accepted.md")), false);
});

test("revise decrements only the current scope budget", async () => {
  const runsRoot = await temporaryRunsRoot();
  const prepared = await prepareAnalysisAttempt(runsRoot);
  const review = {
    ...prepared.review,
    verdict: "revise" as const,
    required_fixes: ["clarify assumptions"],
  };
  const result = await prepared.store.gate({
    caseId: "case-alpha",
    attemptId: "analysis-001",
    review,
    expectedRevision: 0,
  });
  assert.equal(result.outcome, "revise");
  assert.equal(result.snapshot.state.revision_budget.analysis, 0);
  assert.equal(result.snapshot.state.revision_budget.modeling, 1);
  assert.equal(result.snapshot.state.revision, 1);
  assert.equal(result.snapshot.state.stage, "analysis");
});

test("block appends a blocker while preserving stage and wave", async () => {
  const runsRoot = await temporaryRunsRoot();
  const prepared = await prepareAnalysisAttempt(runsRoot);
  const review = {
    ...prepared.review,
    verdict: "block" as const,
    required_fixes: ["input dataset is missing"],
  };
  const result = await prepared.store.gate({
    caseId: "case-alpha",
    attemptId: "analysis-001",
    review,
    expectedRevision: 0,
  });
  assert.equal(result.outcome, "block");
  assert.equal(result.snapshot.state.status, "blocked");
  assert.equal(result.snapshot.state.stage, "analysis");
  assert.equal(result.snapshot.state.current_wave, null);
  assert.equal(result.snapshot.state.blockers[0]?.scope, "analysis");
  assert.equal(result.snapshot.state.blockers[0]?.resolved_at, null);
});

function passReview(attemptId: string, evidence: string): Review {
  return {
    schema_version: 1,
    attempt_id: attemptId,
    verdict: "pass",
    findings: [],
    required_fixes: [],
    evidence: [evidence],
    reviewed_at: "2026-07-16T00:00:00.000Z",
  };
}

async function writeSuccessfulExecutionEvidence(
  attemptRoot: string,
  taskId: string,
  sequence = 1,
): Promise<void> {
  const codePath = path.join(attemptRoot, "code", "solve.py");
  await writeJsonAtomic(path.join(attemptRoot, "execution-result.json"), {
    schema_version: 1,
    kind: "compute",
    path: `attempts/solving/${taskId}/${String(sequence).padStart(3, "0")}/code/solve.py`,
    sha256: await hashPath(codePath),
    created_at: "2026-07-16T00:00:00.000Z",
    status: "succeeded",
    exit_code: 0,
  });
}

async function writeSolverAttemptOutputs(
  runsRoot: string,
  taskId: string,
  sequence: number,
): Promise<string> {
  const sequenceText = String(sequence).padStart(3, "0");
  const attemptRoot = path.join(
    runsRoot,
    "case-alpha",
    "attempts",
    "solving",
    taskId,
    sequenceText,
  );
  await mkdir(path.join(attemptRoot, "code"), { recursive: true });
  await writeFile(
    path.join(attemptRoot, "code", "solve.py"),
    "print(1)\n",
    "utf8",
  );
  await writeSuccessfulExecutionEvidence(attemptRoot, taskId, sequence);
  await writeJsonAtomic(path.join(attemptRoot, "memory.json"), {
    schema_version: 1,
    task_id: taskId,
    task_description: taskId,
    modeling_method: "direct",
    result_interpretation: "done",
    execution_result: `tasks/${taskId}/execution-result.json`,
    code_outputs: [`tasks/${taskId}/code/solve.py`],
    figures: [],
  });
  return `attempts/solving/${taskId}/${sequenceText}/execution-result.json`;
}

async function writeModelingAttemptOutputs(
  runsRoot: string,
  taskIds: string[],
): Promise<void> {
  const attemptRoot = path.join(
    runsRoot,
    "case-alpha",
    "attempts",
    "modeling",
    "001",
  );
  await writeFile(
    path.join(attemptRoot, "modeling-scheme.md"),
    "# Model\n",
    "utf8",
  );
  await mkdir(path.join(attemptRoot, "retrieved-methods"));
  for (const taskId of taskIds)
    await writeJsonAtomic(
      path.join(attemptRoot, "retrieved-methods", `${taskId}.json`),
      {
        schema_version: 1,
        knowledge_source_id: "fixture",
        knowledge_source_hash: "a".repeat(64),
        query: taskId,
        retrieval_mode: "fixture",
        candidates: [],
      },
    );
}

async function advanceToSingleTaskSolving(runsRoot: string): Promise<{
  store: FileCaseContextStore;
}> {
  const prepared = await prepareAnalysisAttempt(runsRoot);
  await prepared.store.gate({
    caseId: "case-alpha",
    attemptId: "analysis-001",
    review: prepared.review,
    expectedRevision: 0,
  });
  const modeling = await prepared.store.dispatch({
    caseId: "case-alpha",
    role: "modeler",
    goal: "model",
  });
  await writeModelingAttemptOutputs(runsRoot, ["task-01"]);
  await prepared.store.gate({
    caseId: "case-alpha",
    attemptId: modeling.attemptId,
    review: passReview(
      modeling.attemptId,
      "attempts/modeling/001/modeling-scheme.md",
    ),
    expectedRevision: 1,
  });
  return { store: prepared.store };
}

test("accepted artifacts advance modeling solving reporting and completion", async () => {
  const runsRoot = await temporaryRunsRoot();
  const analysis = await prepareAnalysisAttempt(runsRoot);
  let result = await analysis.store.gate({
    caseId: "case-alpha",
    attemptId: "analysis-001",
    review: analysis.review,
    expectedRevision: 0,
  });

  const modeling = await analysis.store.dispatch({
    caseId: "case-alpha",
    role: "modeler",
    goal: "model",
  });
  await writeModelingAttemptOutputs(runsRoot, ["task-01"]);
  result = await analysis.store.gate({
    caseId: "case-alpha",
    attemptId: modeling.attemptId,
    review: passReview(
      modeling.attemptId,
      "attempts/modeling/001/modeling-scheme.md",
    ),
    expectedRevision: 1,
  });
  assert.equal(result.snapshot.state.stage, "solving");
  assert.equal(result.snapshot.state.current_wave, 1);
  assert.deepEqual(result.snapshot.state.revision_budget.solving, {
    "task-01": 1,
  });

  const solving = await analysis.store.dispatch({
    caseId: "case-alpha",
    role: "solver",
    taskId: "task-01",
    goal: "solve",
  });
  const solvingRoot = path.join(
    runsRoot,
    "case-alpha",
    "attempts",
    "solving",
    "task-01",
    "001",
  );
  await mkdir(path.join(solvingRoot, "code"), { recursive: true });
  await writeFile(
    path.join(solvingRoot, "code", "solve.py"),
    "print(1)\n",
    "utf8",
  );
  await writeSuccessfulExecutionEvidence(solvingRoot, "task-01");
  await writeJsonAtomic(path.join(solvingRoot, "memory.json"), {
    schema_version: 1,
    task_id: "task-01",
    task_description: "solve",
    modeling_method: "direct",
    result_interpretation: "one",
    execution_result: "tasks/task-01/execution-result.json",
    code_outputs: ["tasks/task-01/code/solve.py"],
    figures: [],
  });
  result = await analysis.store.gate({
    caseId: "case-alpha",
    attemptId: solving.attemptId,
    review: passReview(
      solving.attemptId,
      "attempts/solving/task-01/001/execution-result.json",
    ),
    expectedRevision: 2,
  });
  assert.equal(result.snapshot.state.stage, "reporting");
  assert.equal(result.snapshot.state.current_wave, null);

  const reporting = await analysis.store.dispatch({
    caseId: "case-alpha",
    role: "writer",
    goal: "report",
  });
  const reportingRoot = path.join(
    runsRoot,
    "case-alpha",
    "attempts",
    "reporting",
    "001",
  );
  await writeFile(
    path.join(reportingRoot, "outline.md"),
    "# Outline\n",
    "utf8",
  );
  await writeFile(
    path.join(reportingRoot, "notation.md"),
    "# Notation\n",
    "utf8",
  );
  await writeFile(
    path.join(reportingRoot, "main.tex"),
    "\\documentclass{article}",
    "utf8",
  );
  await writeFile(path.join(reportingRoot, "compile.log"), "success", "utf8");
  await writeFile(
    path.join(reportingRoot, "report.pdf"),
    Buffer.from("%PDF-1.4\nfixture"),
  );
  await mkdir(path.join(reportingRoot, "evidence"));
  const reportPdfPath = path.join(reportingRoot, "report.pdf");
  const compileLogPath = path.join(reportingRoot, "compile.log");
  const compileManifestPath = path.join(reportingRoot, "evidence", "compile-001-manifest.json");
  await writeJsonAtomic(compileManifestPath, {
    schema_version: 1,
    kind: "compile",
    status: "succeeded",
    exit_code: 0,
    pdf: {
      path: "attempts/reporting/001/report.pdf",
      sha256: await hashPath(reportPdfPath),
    },
    outputs: [
      {
        path: "attempts/reporting/001/compile.log",
        sha256: await hashPath(compileLogPath),
      },
    ],
  });
  const compileReference = {
    schema_version: 1,
    kind: "compile",
    path: "attempts/reporting/001/evidence/compile-001-manifest.json",
    sha256: await hashPath(compileManifestPath),
    created_at: "2026-07-16T00:00:00.000Z",
    status: "succeeded",
    exit_code: 0,
  };
  const compileReferencePath = path.join(reportingRoot, "evidence", "compile-001.json");
  await writeJsonAtomic(compileReferencePath, compileReference);
  await rm(compileReferencePath);
  await assert.rejects(
    analysis.store.gate({
      caseId: "case-alpha",
      attemptId: reporting.attemptId,
      review: passReview(reporting.attemptId, "attempts/reporting/001/report.pdf"),
      expectedRevision: 3,
    }),
    hasCode("SCHEMA_INVALID"),
  );
  await writeJsonAtomic(compileReferencePath, compileReference);
  result = await analysis.store.gate({
    caseId: "case-alpha",
    attemptId: reporting.attemptId,
    review: passReview(
      reporting.attemptId,
      "attempts/reporting/001/report.pdf",
    ),
    expectedRevision: 3,
  });
  assert.equal(result.snapshot.state.status, "completed");
  assert.deepEqual(result.snapshot.completion, { complete: true, missing: [] });

  const statePath = path.join(runsRoot, "case-alpha", "state.json");
  const persistedState = await readFile(statePath, "utf8");
  await writeFile(
    path.join(runsRoot, "case-alpha", "report", "main.tex"),
    "tampered",
    "utf8",
  );
  await rm(
    path.join(runsRoot, "case-alpha", "tasks", "task-01", "memory.json"),
  );
  await rm(
    path.join(
      runsRoot,
      "case-alpha",
      "tasks",
      "task-01",
      "execution-result.json",
    ),
  );
  const liveEvidence = await analysis.store.inspect("case-alpha");
  assert.equal(liveEvidence.completion.complete, false);
  assert.equal(
    liveEvidence.completion.missing.includes("report/main.tex:hash"),
    true,
  );
  assert.equal(
    liveEvidence.completion.missing.includes("tasks/task-01/memory.json"),
    true,
  );
  assert.equal(
    liveEvidence.completion.missing.includes(
      "tasks/task-01/execution-result.json",
    ),
    true,
  );
  assert.equal(await readFile(statePath, "utf8"), persistedState);
});

test("two stores gating the same expected revision yield exactly one success", async () => {
  const runsRoot = await temporaryRunsRoot();
  const prepared = await prepareAnalysisAttempt(runsRoot);
  const other = new FileCaseContextStore({
    runsRoot,
    now: () => "2026-07-16T00:00:00.000Z",
  });
  const results = await Promise.allSettled([
    prepared.store.gate({
      caseId: "case-alpha",
      attemptId: "analysis-001",
      review: prepared.review,
      expectedRevision: 0,
    }),
    other.gate({
      caseId: "case-alpha",
      attemptId: "analysis-001",
      review: prepared.review,
      expectedRevision: 0,
    }),
  ]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(results.filter((item) => item.status === "rejected").length, 1);
  assert.equal((await other.inspect("case-alpha")).state.revision, 1);
});

test("dispatch recovers a Case lock left by a crashed process", async () => {
  const runsRoot = await temporaryRunsRoot();
  const store = new FileCaseContextStore({ runsRoot });
  await store.open("case-alpha", fixtureOpenInput());
  const lockPath = path.join(runsRoot, "case-alpha", "state.lock");
  await writeFile(
    lockPath,
    `${JSON.stringify({
      pid: 2_147_483_647,
      token: "crashed-owner",
      acquired_at: "2026-07-16T00:00:00.000Z",
    })}\n`,
    "utf8",
  );

  const dispatched = await store.dispatch({
    caseId: "case-alpha",
    role: "analyst",
    goal: "recover after crash",
  });

  assert.equal(dispatched.attemptId, "analysis-001");
  assert.equal(await exists(lockPath), false);
});

test("concurrent stale-lock recovery preserves a newly acquired lock", async () => {
  const runsRoot = await temporaryRunsRoot();
  const first = new FileCaseContextStore({ runsRoot });
  const second = new FileCaseContextStore({ runsRoot });
  await first.open("case-alpha", fixtureOpenInput());
  const lockPath = path.join(runsRoot, "case-alpha", "state.lock");
  await writeFile(
    lockPath,
    `${JSON.stringify({
      pid: 2_147_483_647,
      token: "crashed-owner",
      acquired_at: "2026-07-16T00:00:00.000Z",
    })}\n`,
    "utf8",
  );

  const results = await Promise.allSettled([
    first.dispatch({
      caseId: "case-alpha",
      role: "analyst",
      goal: "first stale recovery contender",
    }),
    second.dispatch({
      caseId: "case-alpha",
      role: "analyst",
      goal: "second stale recovery contender",
    }),
  ]);

  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1,
  );
  assert.equal((await first.inspect("case-alpha")).activeAttempts.length, 1);
  assert.equal(await exists(lockPath), false);
});

test("three stale-lock contenders enter the Case critical section serially", async () => {
  const runsRoot = await temporaryRunsRoot();
  const store = new FileCaseContextStore({ runsRoot });
  await store.open("case-alpha", fixtureOpenInput());
  const caseRoot = path.join(runsRoot, "case-alpha");
  const lockPath = path.join(caseRoot, "state.lock");
  await writeFile(
    lockPath,
    `${JSON.stringify({
      pid: 2_147_483_647,
      token: "crashed-owner",
      acquired_at: "2026-07-16T00:00:00.000Z",
    })}\n`,
    "utf8",
  );
  let active = 0;
  let maximumActive = 0;

  await Promise.all(
    Array.from({ length: 3 }, () =>
      withCaseLock(caseRoot, async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        try {
          await new Promise((resolve) => setTimeout(resolve, 25));
        } finally {
          active -= 1;
        }
      }),
    ),
  );

  assert.equal(maximumActive, 1);
  assert.equal(await exists(lockPath), false);
  assert.deepEqual(
    (await readdir(caseRoot)).filter((entry) =>
      entry.startsWith("state.lock."),
    ),
    [],
  );
});

test("gate recovers an uncommitted durable transaction before retrying", async () => {
  const runsRoot = await temporaryRunsRoot();
  const prepared = await prepareAnalysisAttempt(runsRoot);
  const caseRoot = path.join(runsRoot, "case-alpha");
  const transaction = path.join(caseRoot, ".gate-txn-crash-fixture");
  await mkdir(transaction);
  const statePath = path.join(caseRoot, "state.json");
  await writeFile(
    path.join(transaction, "state-backup.json"),
    await readFile(statePath, "utf8"),
    "utf8",
  );
  await writeJsonAtomic(path.join(transaction, "journal.json"), {
    review_path: "attempts/analysis/001/review.json",
    review_existed: false,
    roots: [{ name: "artifacts", existed: false }],
  });

  await mkdir(path.join(caseRoot, "artifacts"), { recursive: true });
  await writeFile(
    path.join(caseRoot, "artifacts", "problem-understanding.md"),
    "partial promotion",
    "utf8",
  );
  await writeJsonAtomic(
    path.join(caseRoot, "attempts", "analysis", "001", "review.json"),
    prepared.review,
  );
  const partialState = await readJson(statePath, CaseStateSchema);
  partialState.revision = 1;
  partialState.stage = "modeling";
  partialState.status = "running";
  await writeJsonAtomic(statePath, partialState);

  await assert.rejects(
    prepared.store.inspect("case-alpha"),
    hasCode("LOCK_BUSY"),
  );
  const recovered = await prepared.store.gate({
    caseId: "case-alpha",
    attemptId: "analysis-001",
    review: prepared.review,
    expectedRevision: 0,
  });
  assert.equal(recovered.snapshot.state.revision, 1);
  assert.equal(recovered.snapshot.state.stage, "modeling");
  assert.equal(await exists(transaction), false);
});

test("inspect ignores a committed transaction until mutation cleanup", async () => {
  const runsRoot = await temporaryRunsRoot();
  const store = new FileCaseContextStore({ runsRoot });
  await store.open("case-alpha", fixtureOpenInput());
  const transaction = path.join(
    runsRoot,
    "case-alpha",
    ".gate-txn-committed-fixture",
  );
  await mkdir(transaction);
  await writeJsonAtomic(path.join(transaction, "committed.json"), {
    committed: true,
  });

  const fresh = new FileCaseContextStore({ runsRoot });
  assert.equal((await fresh.inspect("case-alpha")).state.revision, 0);
  assert.equal(await exists(transaction), true);
  assert.equal((await fresh.open("case-alpha")).state.revision, 0);
  assert.equal(await exists(transaction), true);

  const dispatched = await fresh.dispatch({
    caseId: "case-alpha",
    role: "analyst",
    goal: "clean committed transaction",
  });
  assert.equal(dispatched.attemptId, "analysis-001");
  assert.equal(await exists(transaction), false);
});

test("same-scope pass resolves an append-only blocker", async () => {
  const runsRoot = await temporaryRunsRoot();
  const prepared = await prepareAnalysisAttempt(runsRoot);
  const blocked = await prepared.store.gate({
    caseId: "case-alpha",
    attemptId: "analysis-001",
    review: {
      ...prepared.review,
      verdict: "block",
      required_fixes: ["missing input"],
    },
    expectedRevision: 0,
  });
  const retry = await prepared.store.dispatch({
    caseId: "case-alpha",
    role: "analyst",
    goal: "retry",
    resolvesBlocker: blocked.snapshot.state.blockers[0]!.id,
  });
  const retryRoot = path.join(
    runsRoot,
    "case-alpha",
    "attempts",
    "analysis",
    "002",
  );
  await writeFile(
    path.join(retryRoot, "problem-understanding.md"),
    "# Fixed\n",
    "utf8",
  );
  await writeJsonAtomic(path.join(retryRoot, "tasks.json"), {
    schema_version: 1,
    tasks: [
      { id: "task-01", description: "solve", requires_computation: true },
    ],
  });
  await writeJsonAtomic(path.join(retryRoot, "task-graph.json"), {
    schema_version: 1,
    tasks: [{ id: "task-01", depends_on: [], wave: 1 }],
  });
  const resolved = await prepared.store.gate({
    caseId: "case-alpha",
    attemptId: retry.attemptId,
    review: passReview(
      retry.attemptId,
      "attempts/analysis/002/problem-understanding.md",
    ),
    expectedRevision: 1,
  });
  assert.equal(
    resolved.snapshot.state.blockers[0]?.resolved_at,
    "2026-07-16T00:00:00.000Z",
  );
  assert.equal(resolved.snapshot.state.status, "running");
});

test("revise cannot clear an unresolved blocker", async () => {
  const runsRoot = await temporaryRunsRoot();
  const prepared = await prepareAnalysisAttempt(runsRoot);
  await prepared.store.gate({
    caseId: "case-alpha",
    attemptId: "analysis-001",
    review: {
      ...prepared.review,
      verdict: "block",
      required_fixes: ["missing input"],
    },
    expectedRevision: 0,
  });
  const retry = await prepared.store.dispatch({
    caseId: "case-alpha",
    role: "analyst",
    goal: "retry",
  });
  const retryRoot = path.join(
    runsRoot,
    "case-alpha",
    "attempts",
    "analysis",
    "002",
  );
  await writeFile(
    path.join(retryRoot, "problem-understanding.md"),
    "# Retry\n",
    "utf8",
  );
  await writeJsonAtomic(path.join(retryRoot, "tasks.json"), {
    schema_version: 1,
    tasks: [
      { id: "task-01", description: "solve", requires_computation: true },
    ],
  });
  await writeJsonAtomic(path.join(retryRoot, "task-graph.json"), {
    schema_version: 1,
    tasks: [{ id: "task-01", depends_on: [], wave: 1 }],
  });
  const revised = await prepared.store.gate({
    caseId: "case-alpha",
    attemptId: retry.attemptId,
    review: {
      ...passReview(
        retry.attemptId,
        "attempts/analysis/002/problem-understanding.md",
      ),
      verdict: "revise",
      required_fixes: ["still incomplete"],
    },
    expectedRevision: 1,
  });
  assert.equal(revised.snapshot.state.status, "blocked");
  assert.equal(revised.snapshot.state.blockers[0]?.resolved_at, null);
});

test("inspect treats an invalid review as active and revision dispatch records the latest valid review", async () => {
  const invalidRoot = await temporaryRunsRoot();
  const invalidStore = new FileCaseContextStore({ runsRoot: invalidRoot });
  await invalidStore.open("case-alpha", fixtureOpenInput());
  await invalidStore.dispatch({
    caseId: "case-alpha",
    role: "analyst",
    goal: "analyze",
  });
  await writeFile(
    path.join(
      invalidRoot,
      "case-alpha",
      "attempts",
      "analysis",
      "001",
      "review.json",
    ),
    "{}",
    "utf8",
  );
  assert.deepEqual(
    (await invalidStore.inspect("case-alpha")).activeAttempts.map(
      (item) => item.attempt_id,
    ),
    ["analysis-001"],
  );

  const reviseRoot = await temporaryRunsRoot();
  const prepared = await prepareAnalysisAttempt(reviseRoot);
  await prepared.store.gate({
    caseId: "case-alpha",
    attemptId: "analysis-001",
    review: { ...prepared.review, verdict: "revise", required_fixes: ["fix"] },
    expectedRevision: 0,
  });
  const retry = await prepared.store.dispatch({
    caseId: "case-alpha",
    role: "analyst",
    goal: "retry",
  });
  assert.equal(
    retry.manifest.latest_review,
    "attempts/analysis/001/review.json",
  );
});

test("analysis gate rejects a task graph that does not match the task list", async () => {
  const runsRoot = await temporaryRunsRoot();
  const prepared = await prepareAnalysisAttempt(runsRoot);
  await writeJsonAtomic(
    path.join(
      runsRoot,
      "case-alpha",
      "attempts",
      "analysis",
      "001",
      "task-graph.json",
    ),
    {
      schema_version: 1,
      tasks: [{ id: "task-02", depends_on: [], wave: 1 }],
    },
  );
  await assert.rejects(
    prepared.store.gate({
      caseId: "case-alpha",
      attemptId: "analysis-001",
      review: prepared.review,
      expectedRevision: 0,
    }),
    hasCode("DAG_INVALID"),
  );
});

test("analysis gate rejects an empty task DAG", async () => {
  const runsRoot = await temporaryRunsRoot();
  const prepared = await prepareAnalysisAttempt(runsRoot);
  const attemptRoot = path.join(
    runsRoot,
    "case-alpha",
    "attempts",
    "analysis",
    "001",
  );
  await writeJsonAtomic(path.join(attemptRoot, "tasks.json"), {
    schema_version: 1,
    tasks: [],
  });
  await writeJsonAtomic(path.join(attemptRoot, "task-graph.json"), {
    schema_version: 1,
    tasks: [],
  });

  await assert.rejects(
    prepared.store.gate({
      caseId: "case-alpha",
      attemptId: "analysis-001",
      review: prepared.review,
      expectedRevision: 0,
    }),
    hasCode("DAG_INVALID"),
  );
});

test("analysis gate rejects missing dependencies cycles and a DAG without wave one", async () => {
  const invalidGraphs = [
    [{ id: "task-01", depends_on: ["missing"], wave: 1 }],
    [
      { id: "task-01", depends_on: ["task-02"], wave: 1 },
      { id: "task-02", depends_on: ["task-01"], wave: 1 },
    ],
    [{ id: "task-01", depends_on: [], wave: 2 }],
    [
      { id: "task-01", depends_on: ["task-02"], wave: 1 },
      { id: "task-02", depends_on: [], wave: 2 },
    ],
  ];
  for (const graph of invalidGraphs) {
    const runsRoot = await temporaryRunsRoot();
    const prepared = await prepareAnalysisAttempt(runsRoot);
    const attemptRoot = path.join(
      runsRoot,
      "case-alpha",
      "attempts",
      "analysis",
      "001",
    );
    await writeJsonAtomic(path.join(attemptRoot, "tasks.json"), {
      schema_version: 1,
      tasks: graph.map((task) => ({
        id: task.id,
        description: task.id,
        requires_computation: true,
      })),
    });
    await writeJsonAtomic(path.join(attemptRoot, "task-graph.json"), {
      schema_version: 1,
      tasks: graph,
    });
    await assert.rejects(
      prepared.store.gate({
        caseId: "case-alpha",
        attemptId: "analysis-001",
        review: prepared.review,
        expectedRevision: 0,
      }),
      hasCode("DAG_INVALID"),
    );
  }
});

test("a revise with an exhausted scope budget fails the Case", async () => {
  const runsRoot = await temporaryRunsRoot();
  const prepared = await prepareAnalysisAttempt(runsRoot);
  await prepared.store.gate({
    caseId: "case-alpha",
    attemptId: "analysis-001",
    review: {
      ...prepared.review,
      verdict: "revise",
      required_fixes: ["first revision"],
    },
    expectedRevision: 0,
  });

  const retry = await prepared.store.dispatch({
    caseId: "case-alpha",
    role: "analyst",
    goal: "retry",
  });
  const retryRoot = path.join(
    runsRoot,
    "case-alpha",
    "attempts",
    "analysis",
    "002",
  );
  await writeFile(
    path.join(retryRoot, "problem-understanding.md"),
    "# Retry\n",
    "utf8",
  );
  await writeJsonAtomic(path.join(retryRoot, "tasks.json"), {
    schema_version: 1,
    tasks: [
      { id: "task-01", description: "solve", requires_computation: true },
    ],
  });
  await writeJsonAtomic(path.join(retryRoot, "task-graph.json"), {
    schema_version: 1,
    tasks: [{ id: "task-01", depends_on: [], wave: 1 }],
  });
  const exhausted = await prepared.store.gate({
    caseId: "case-alpha",
    attemptId: retry.attemptId,
    review: {
      ...passReview(
        retry.attemptId,
        "attempts/analysis/002/problem-understanding.md",
      ),
      verdict: "revise",
      required_fixes: ["second revision"],
    },
    expectedRevision: 1,
  });

  assert.equal(exhausted.snapshot.state.revision_budget.analysis, 0);
  assert.equal(exhausted.snapshot.state.status, "failed");
});

test("a failed Case rejects a Gate from an already dispatched sibling", async () => {
  const runsRoot = await temporaryRunsRoot();
  const prepared = await prepareAnalysisAttempt(runsRoot);
  const analysisRoot = path.join(
    runsRoot,
    "case-alpha",
    "attempts",
    "analysis",
    "001",
  );
  await writeJsonAtomic(path.join(analysisRoot, "tasks.json"), {
    schema_version: 1,
    tasks: [
      { id: "task-01", description: "first", requires_computation: true },
      { id: "task-02", description: "sibling", requires_computation: true },
    ],
  });
  await writeJsonAtomic(path.join(analysisRoot, "task-graph.json"), {
    schema_version: 1,
    tasks: [
      { id: "task-01", depends_on: [], wave: 1 },
      { id: "task-02", depends_on: [], wave: 1 },
    ],
  });
  await prepared.store.gate({
    caseId: "case-alpha",
    attemptId: "analysis-001",
    review: prepared.review,
    expectedRevision: 0,
  });
  const modeling = await prepared.store.dispatch({
    caseId: "case-alpha",
    role: "modeler",
    goal: "model",
  });
  await writeModelingAttemptOutputs(runsRoot, ["task-01", "task-02"]);
  await prepared.store.gate({
    caseId: "case-alpha",
    attemptId: modeling.attemptId,
    review: passReview(
      modeling.attemptId,
      "attempts/modeling/001/modeling-scheme.md",
    ),
    expectedRevision: 1,
  });

  const sibling = await prepared.store.dispatch({
    caseId: "case-alpha",
    role: "solver",
    taskId: "task-02",
    goal: "sibling",
  });
  const siblingEvidence = await writeSolverAttemptOutputs(
    runsRoot,
    "task-02",
    1,
  );
  const first = await prepared.store.dispatch({
    caseId: "case-alpha",
    role: "solver",
    taskId: "task-01",
    goal: "first",
  });
  const firstEvidence = await writeSolverAttemptOutputs(runsRoot, "task-01", 1);
  await prepared.store.gate({
    caseId: "case-alpha",
    attemptId: first.attemptId,
    review: {
      ...passReview(first.attemptId, firstEvidence),
      verdict: "revise",
      required_fixes: ["revise once"],
    },
    expectedRevision: 2,
  });
  const retry = await prepared.store.dispatch({
    caseId: "case-alpha",
    role: "solver",
    taskId: "task-01",
    goal: "retry",
  });
  const retryEvidence = await writeSolverAttemptOutputs(runsRoot, "task-01", 2);
  const failed = await prepared.store.gate({
    caseId: "case-alpha",
    attemptId: retry.attemptId,
    review: {
      ...passReview(retry.attemptId, retryEvidence),
      verdict: "revise",
      required_fixes: ["budget exhausted"],
    },
    expectedRevision: 3,
  });
  assert.equal(failed.snapshot.state.status, "failed");

  await assert.rejects(
    prepared.store.gate({
      caseId: "case-alpha",
      attemptId: sibling.attemptId,
      review: passReview(sibling.attemptId, siblingEvidence),
      expectedRevision: 4,
    }),
    hasCode("INVALID_SCOPE"),
  );
  const after = await prepared.store.inspect("case-alpha");
  assert.equal(after.state.revision, 4);
  assert.equal(
    after.state.accepted_artifacts.some(
      (artifact) => artifact.path === "tasks/task-02/memory.json",
    ),
    false,
  );
});

test("a crashed Attempt can be blocked only with valid Runtime Evidence", async () => {
  const runsRoot = await temporaryRunsRoot();
  const store = new FileCaseContextStore({
    runsRoot,
    now: () => "2026-07-16T00:00:00.000Z",
  });
  await store.open("case-alpha", fixtureOpenInput());
  const dispatched = await store.dispatch({
    caseId: "case-alpha",
    role: "analyst",
    goal: "analyze",
  });
  const attemptRoot = path.join(
    runsRoot,
    "case-alpha",
    "attempts",
    "analysis",
    "001",
  );

  await assert.rejects(
    store.gate({
      caseId: "case-alpha",
      attemptId: dispatched.attemptId,
      review: {
        ...passReview(
          dispatched.attemptId,
          "attempts/analysis/001/missing-evidence.json",
        ),
        verdict: "block",
        required_fixes: ["actor crashed"],
      },
      expectedRevision: 0,
    }),
    hasCode("REVIEW_INVALID"),
  );

  await mkdir(path.join(attemptRoot, "evidence"), { recursive: true });
  const logPath = path.join(attemptRoot, "evidence", "actor-error.log");
  await writeFile(logPath, "actor process exited unexpectedly\n", "utf8");
  const evidencePath = path.join(attemptRoot, "evidence", "runtime.json");
  await writeJsonAtomic(evidencePath, {
    schema_version: 1,
    kind: "actor-session",
    path: "attempts/analysis/001/evidence/actor-error.log",
    sha256: await hashPath(logPath),
    created_at: "2026-07-16T00:00:00.000Z",
    status: "failed",
  });
  const blocked = await store.gate({
    caseId: "case-alpha",
    attemptId: dispatched.attemptId,
    review: {
      ...passReview(
        dispatched.attemptId,
        "attempts/analysis/001/evidence/runtime.json",
      ),
      verdict: "block",
      required_fixes: ["actor crashed"],
    },
    expectedRevision: 0,
  });
  assert.equal(blocked.snapshot.state.status, "blocked");
});

test("solving gate validates the Task Memory candidate schema", async () => {
  const runsRoot = await temporaryRunsRoot();
  const { store } = await advanceToSingleTaskSolving(runsRoot);
  const solving = await store.dispatch({
    caseId: "case-alpha",
    role: "solver",
    taskId: "task-01",
    goal: "solve",
  });
  const attemptRoot = path.join(
    runsRoot,
    "case-alpha",
    "attempts",
    "solving",
    "task-01",
    "001",
  );
  await mkdir(path.join(attemptRoot, "code"), { recursive: true });
  await writeFile(
    path.join(attemptRoot, "code", "solve.py"),
    "print(1)\n",
    "utf8",
  );
  await writeSuccessfulExecutionEvidence(attemptRoot, "task-01");
  await writeJsonAtomic(path.join(attemptRoot, "memory.json"), {
    schema_version: 1,
    task_id: "wrong-task",
  });

  await assert.rejects(
    store.gate({
      caseId: "case-alpha",
      attemptId: solving.attemptId,
      review: passReview(
        solving.attemptId,
        "attempts/solving/task-01/001/execution-result.json",
      ),
      expectedRevision: 2,
    }),
    hasCode("SCHEMA_INVALID"),
  );
});

test("solving gate rejects unsuccessful Runtime Evidence", async () => {
  const runsRoot = await temporaryRunsRoot();
  const { store } = await advanceToSingleTaskSolving(runsRoot);
  const solving = await store.dispatch({
    caseId: "case-alpha",
    role: "solver",
    taskId: "task-01",
    goal: "solve",
  });
  const attemptRoot = path.join(
    runsRoot,
    "case-alpha",
    "attempts",
    "solving",
    "task-01",
    "001",
  );
  await mkdir(path.join(attemptRoot, "code"), { recursive: true });
  const codePath = path.join(attemptRoot, "code", "solve.py");
  await writeFile(codePath, "raise RuntimeError()\n", "utf8");
  await writeJsonAtomic(path.join(attemptRoot, "execution-result.json"), {
    schema_version: 1,
    kind: "compute",
    path: "attempts/solving/task-01/001/code/solve.py",
    sha256: await hashPath(codePath),
    created_at: "2026-07-16T00:00:00.000Z",
    status: "failed",
    exit_code: 1,
  });
  await writeJsonAtomic(path.join(attemptRoot, "memory.json"), {
    schema_version: 1,
    task_id: "task-01",
    task_description: "solve",
    modeling_method: "direct",
    result_interpretation: "failed",
    execution_result: "tasks/task-01/execution-result.json",
    code_outputs: ["tasks/task-01/code/solve.py"],
    figures: [],
  });

  await assert.rejects(
    store.gate({
      caseId: "case-alpha",
      attemptId: solving.attemptId,
      review: passReview(
        solving.attemptId,
        "attempts/solving/task-01/001/execution-result.json",
      ),
      expectedRevision: 2,
    }),
    hasCode("SCHEMA_INVALID"),
  );
});

test("solver dispatch enforces the current wave and reads only direct dependency memory", async () => {
  const runsRoot = await temporaryRunsRoot();
  const prepared = await prepareAnalysisAttempt(runsRoot);
  const analysisRoot = path.join(
    runsRoot,
    "case-alpha",
    "attempts",
    "analysis",
    "001",
  );
  await writeJsonAtomic(path.join(analysisRoot, "tasks.json"), {
    schema_version: 1,
    tasks: [
      { id: "task-01", description: "first", requires_computation: true },
      { id: "task-03", description: "sibling", requires_computation: true },
      { id: "task-02", description: "dependent", requires_computation: true },
    ],
  });
  await writeJsonAtomic(path.join(analysisRoot, "task-graph.json"), {
    schema_version: 1,
    tasks: [
      { id: "task-01", depends_on: [], wave: 1 },
      { id: "task-03", depends_on: [], wave: 1 },
      { id: "task-02", depends_on: ["task-01"], wave: 2 },
    ],
  });
  await prepared.store.gate({
    caseId: "case-alpha",
    attemptId: "analysis-001",
    review: prepared.review,
    expectedRevision: 0,
  });
  const modeling = await prepared.store.dispatch({
    caseId: "case-alpha",
    role: "modeler",
    goal: "model",
  });
  await writeModelingAttemptOutputs(runsRoot, [
    "task-01",
    "task-03",
    "task-02",
  ]);
  await prepared.store.gate({
    caseId: "case-alpha",
    attemptId: modeling.attemptId,
    review: passReview(
      modeling.attemptId,
      "attempts/modeling/001/modeling-scheme.md",
    ),
    expectedRevision: 1,
  });
  await assert.rejects(
    prepared.store.dispatch({
      caseId: "case-alpha",
      role: "solver",
      taskId: "task-02",
      goal: "too early",
    }),
    hasCode("INVALID_SCOPE"),
  );

  async function solve(taskId: string, revision: number): Promise<void> {
    const dispatched = await prepared.store.dispatch({
      caseId: "case-alpha",
      role: "solver",
      taskId,
      goal: `solve ${taskId}`,
    });
    const attemptRoot = path.join(
      runsRoot,
      "case-alpha",
      "attempts",
      "solving",
      taskId,
      "001",
    );
    await mkdir(path.join(attemptRoot, "code"), { recursive: true });
    await writeFile(
      path.join(attemptRoot, "code", "solve.py"),
      "print(1)\n",
      "utf8",
    );
    await writeSuccessfulExecutionEvidence(attemptRoot, taskId);
    await writeJsonAtomic(path.join(attemptRoot, "memory.json"), {
      schema_version: 1,
      task_id: taskId,
      task_description: taskId,
      modeling_method: "direct",
      result_interpretation: "done",
      execution_result: `tasks/${taskId}/execution-result.json`,
      code_outputs: [`tasks/${taskId}/code/solve.py`],
      figures: [],
    });
    await prepared.store.gate({
      caseId: "case-alpha",
      attemptId: dispatched.attemptId,
      review: passReview(
        dispatched.attemptId,
        `attempts/solving/${taskId}/001/execution-result.json`,
      ),
      expectedRevision: revision,
    });
  }
  await solve("task-01", 2);
  await solve("task-03", 3);
  const dependent = await prepared.store.dispatch({
    caseId: "case-alpha",
    role: "solver",
    taskId: "task-02",
    goal: "dependent",
  });
  assert.equal(
    dependent.manifest.required_reads.some(
      (item) => item.path === "tasks/task-01/memory.json",
    ),
    true,
  );
  assert.equal(
    dependent.manifest.required_reads.some(
      (item) => item.path === "tasks/task-03/memory.json",
    ),
    false,
  );
  assert.deepEqual(
    dependent.manifest.required_reads.map((item) => item.path).sort(),
    ["artifacts/modeling-scheme.md", "tasks/task-01/memory.json"],
  );
  assert.deepEqual(dependent.manifest.current_task, {
    id: "task-02",
    description: "dependent",
    requires_computation: true,
  });
});

test("same-wave dependencies are dispatched only after their direct dependency is accepted", async () => {
  const runsRoot = await temporaryRunsRoot();
  const prepared = await prepareAnalysisAttempt(runsRoot);
  const analysisRoot = path.join(
    runsRoot,
    "case-alpha",
    "attempts",
    "analysis",
    "001",
  );
  await writeJsonAtomic(path.join(analysisRoot, "tasks.json"), {
    schema_version: 1,
    tasks: [
      { id: "task-01", description: "first", requires_computation: true },
      { id: "task-02", description: "dependent", requires_computation: true },
    ],
  });
  await writeJsonAtomic(path.join(analysisRoot, "task-graph.json"), {
    schema_version: 1,
    tasks: [
      { id: "task-01", depends_on: [], wave: 1 },
      { id: "task-02", depends_on: ["task-01"], wave: 1 },
    ],
  });
  await prepared.store.gate({
    caseId: "case-alpha",
    attemptId: "analysis-001",
    review: prepared.review,
    expectedRevision: 0,
  });
  const modeling = await prepared.store.dispatch({
    caseId: "case-alpha",
    role: "modeler",
    goal: "model",
  });
  await writeModelingAttemptOutputs(runsRoot, ["task-01", "task-02"]);
  await prepared.store.gate({
    caseId: "case-alpha",
    attemptId: modeling.attemptId,
    review: passReview(
      modeling.attemptId,
      "attempts/modeling/001/modeling-scheme.md",
    ),
    expectedRevision: 1,
  });
  await assert.rejects(
    prepared.store.dispatch({
      caseId: "case-alpha",
      role: "solver",
      taskId: "task-02",
      goal: "too early",
    }),
    hasCode("INVALID_SCOPE"),
  );

  const first = await prepared.store.dispatch({
    caseId: "case-alpha",
    role: "solver",
    taskId: "task-01",
    goal: "first",
  });
  const firstRoot = path.join(
    runsRoot,
    "case-alpha",
    "attempts",
    "solving",
    "task-01",
    "001",
  );
  await mkdir(path.join(firstRoot, "code"), { recursive: true });
  await writeFile(
    path.join(firstRoot, "code", "solve.py"),
    "print(1)\n",
    "utf8",
  );
  await writeSuccessfulExecutionEvidence(firstRoot, "task-01");
  await writeJsonAtomic(path.join(firstRoot, "memory.json"), {
    schema_version: 1,
    task_id: "task-01",
    task_description: "first",
    modeling_method: "direct",
    result_interpretation: "done",
    execution_result: "tasks/task-01/execution-result.json",
    code_outputs: ["tasks/task-01/code/solve.py"],
    figures: [],
  });
  await prepared.store.gate({
    caseId: "case-alpha",
    attemptId: first.attemptId,
    review: passReview(
      first.attemptId,
      "attempts/solving/task-01/001/execution-result.json",
    ),
    expectedRevision: 2,
  });
  const dependent = await prepared.store.dispatch({
    caseId: "case-alpha",
    role: "solver",
    taskId: "task-02",
    goal: "dependent",
  });
  assert.equal(
    dependent.manifest.required_reads.some(
      (item) => item.path === "tasks/task-01/memory.json",
    ),
    true,
  );
});
