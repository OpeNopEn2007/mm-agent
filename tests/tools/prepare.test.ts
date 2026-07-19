import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { FileCaseContextStore } from "../../src/core/case-context-store.js";
import {
  FileCasePreparer,
  PrepareError,
  prepareCase,
} from "../../src/tools/prepare.js";

const fixtureRubrics = path.resolve("tests/fixtures/cases/rubrics");

async function workspace(): Promise<{
  root: string;
  runsRoot: string;
  problemsRoot: string;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-prepare-"));
  const runsRoot = path.join(root, "runs");
  const problemsRoot = path.join(root, "problems");
  await mkdir(problemsRoot, { recursive: true });
  return { root, runsRoot, problemsRoot };
}

function preparer(root: string, runsRoot: string): FileCasePreparer {
  return new FileCasePreparer({
    projectRoot: root,
    runsRoot,
    rubricRoot: fixtureRubrics,
    now: () => "2026-07-19T00:00:00Z",
  });
}

test("prepare gives explicit input precedence and snapshots it without source paths", async () => {
  const { root, runsRoot, problemsRoot } = await workspace();
  const explicit = path.join(root, "selected.md");
  const ignored = path.join(problemsRoot, "ignored.md");
  await writeFile(explicit, "selected source", "utf8");
  await writeFile(ignored, "fallback source", "utf8");

  const result = await preparer(root, runsRoot).prepare({
    caseId: "case-explicit",
    explicitPaths: [explicit],
  });

  assert.equal(result.mode, "created");
  assert.equal(result.sourceKind, "explicit-path");
  assert.deepEqual(result.discovered.map((item) => item.label), [
    "selected.md",
  ]);
  assert.equal(await readFile(explicit, "utf8"), "selected source");
  assert.equal(await readFile(ignored, "utf8"), "fallback source");
  assert.equal(result.snapshot.inputManifest.files.length, 1);
  const persisted = JSON.stringify({
    caseFile: result.snapshot.caseFile,
    manifest: result.snapshot.inputManifest,
  });
  assert.equal(persisted.includes(root), false);
  assert.equal(
    await readFile(
      path.join(runsRoot, "case-explicit", "input", "files", "001-selected-md.md"),
      "utf8",
    ),
    "selected source",
  );
  assert.deepEqual(result.snapshot.caseFile.policy.revision_budget, {
    analysis: 2,
    modeling: 2,
    solving_per_task: 2,
    reporting: 2,
  });
});

test("prepare discovers problems recursively and resumes only without new input", async () => {
  const { root, runsRoot, problemsRoot } = await workspace();
  await mkdir(path.join(problemsRoot, "data"));
  await writeFile(path.join(problemsRoot, ".gitkeep"), "", "utf8");
  await writeFile(path.join(problemsRoot, "problem.md"), "problem", "utf8");
  await writeFile(path.join(problemsRoot, "data", "values.csv"), "x\n1\n", "utf8");
  const intake = preparer(root, runsRoot);

  const created = await intake.prepare({ caseId: "case-problems" });
  assert.equal(created.sourceKind, "problems-directory");
  assert.deepEqual(
    created.discovered.map((item) => item.label),
    ["data/values.csv", "problem.md"],
  );

  const resumed = await intake.prepare({ caseId: "case-problems" });
  assert.equal(resumed.mode, "resumed");
  assert.equal(resumed.snapshot.state.revision, 0);

  await assert.rejects(
    intake.prepare({
      caseId: "case-problems",
      explicitPaths: [path.join(problemsRoot, "problem.md")],
    }),
    (error: unknown) =>
      error instanceof PrepareError && error.code === "CASE_CONFLICT",
  );
});

test("prepare returns an actionable input-required error for an empty source", async () => {
  const { root, runsRoot } = await workspace();
  await assert.rejects(
    preparer(root, runsRoot).prepare({ caseId: "case-empty" }),
    (error: unknown) => {
      assert.ok(error instanceof PrepareError);
      assert.equal(error.code, "INPUT_REQUIRED");
      assert.equal(error.needsUserInput, true);
      assert.match(error.message, /explicit path|problems/u);
      return true;
    },
  );
});

test("prepare never reads .venv and rejects linked input", async (t) => {
  const { root, runsRoot, problemsRoot } = await workspace();
  const venv = path.join(root, ".venv");
  await mkdir(venv);
  await writeFile(path.join(venv, "secret.txt"), "do not read", "utf8");
  await assert.rejects(
    preparer(root, runsRoot).prepare({
      caseId: "case-venv",
      explicitPaths: [venv],
    }),
    (error: unknown) =>
      error instanceof PrepareError && error.code === "INPUT_DENIED",
  );

  const outside = path.join(root, "outside.md");
  const linked = path.join(problemsRoot, "linked.md");
  await writeFile(outside, "linked", "utf8");
  try {
    await symlink(outside, linked, "file");
  } catch (error) {
    if (["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) {
      t.skip("symlink creation is unavailable");
      return;
    }
    throw error;
  }
  await assert.rejects(
    preparer(root, runsRoot).prepare({ caseId: "case-link" }),
    (error: unknown) =>
      error instanceof PrepareError && error.code === "INPUT_DENIED",
  );
});

test("prepare creates a Case that a new Store can recover after sources disappear", async () => {
  const { root, runsRoot } = await workspace();
  const explicit = path.join(root, "source", "problem.md");
  await mkdir(path.dirname(explicit));
  await writeFile(explicit, "immutable problem\n", "utf8");
  const created = await preparer(root, runsRoot).prepare({
    caseId: "case-recovery",
    explicitPaths: [explicit],
    revisionBudget: {
      analysis: 1,
      modeling: 2,
      solvingPerTask: 3,
      reporting: 4,
    },
  });
  await rm(path.dirname(explicit), { recursive: true, force: true });

  const freshStore = new FileCaseContextStore({ runsRoot });
  const recovered = await freshStore.open("case-recovery");
  assert.deepEqual(recovered.caseFile, created.snapshot.caseFile);
  assert.deepEqual(recovered.inputManifest, created.snapshot.inputManifest);
  assert.deepEqual(recovered.state, created.snapshot.state);
  assert.equal(recovered.state.revision, 0);
  assert.equal(recovered.state.status, "prepared");
  assert.deepEqual(recovered.caseFile.policy.revision_budget, {
    analysis: 1,
    modeling: 2,
    solving_per_task: 3,
    reporting: 4,
  });
  for (const rubric of Object.values(recovered.caseFile.policy.rubrics)) {
    assert.match(rubric.path, /^input\/policy\/rubrics\//u);
    assert.match(rubric.sha256, /^[a-f0-9]{64}$/u);
    assert.ok((await stat(path.join(runsRoot, "case-recovery", ...rubric.path.split("/")))).size > 0);
  }
});

test("prepare reports conflicting Policy without changing immutable Case facts", async () => {
  const { root, runsRoot, problemsRoot } = await workspace();
  const source = path.join(problemsRoot, "problem.md");
  await writeFile(source, "source remains unchanged\n", "utf8");
  const options = {
    projectRoot: root,
    runsRoot,
    rubricRoot: fixtureRubrics,
    now: () => "2026-07-19T00:00:00Z",
  };
  const first = await prepareCase(options, { caseId: "case-policy" });
  assert.equal(first.ok, true);
  const beforeCase = await readFile(
    path.join(runsRoot, "case-policy", "case.json"),
    "utf8",
  );
  const beforeState = await readFile(
    path.join(runsRoot, "case-policy", "state.json"),
    "utf8",
  );

  const conflict = await prepareCase(options, {
    caseId: "case-policy",
    revisionBudget: {
      analysis: 9,
      modeling: 2,
      solvingPerTask: 2,
      reporting: 2,
    },
  });
  assert.deepEqual(conflict, {
    ok: false,
    error: {
      code: "CASE_CONFLICT",
      message:
        "Case case-policy already exists with a different immutable Policy",
      repair: "user",
      needs_user_input: true,
    },
  });
  assert.equal(
    await readFile(path.join(runsRoot, "case-policy", "case.json"), "utf8"),
    beforeCase,
  );
  assert.equal(
    await readFile(path.join(runsRoot, "case-policy", "state.json"), "utf8"),
    beforeState,
  );
  assert.equal(await readFile(source, "utf8"), "source remains unchanged\n");
});

test("prepare returns structured errors for invalid IDs, empty input, and unavailable storage", async () => {
  const invalidWorkspace = await workspace();
  const invalid = await prepareCase(
    {
      projectRoot: invalidWorkspace.root,
      runsRoot: invalidWorkspace.runsRoot,
      rubricRoot: fixtureRubrics,
    },
    { caseId: "../invalid" },
  );
  assert.equal(invalid.ok, false);
  if (invalid.ok) assert.fail("invalid Case ID unexpectedly succeeded");
  assert.equal(invalid.error.code, "INVALID_CASE_ID");
  assert.equal(invalid.error.repair, "user");

  const emptyWorkspace = await workspace();
  const empty = await prepareCase(
    {
      projectRoot: emptyWorkspace.root,
      runsRoot: emptyWorkspace.runsRoot,
      rubricRoot: fixtureRubrics,
    },
    { caseId: "case-empty-structured" },
  );
  assert.equal(empty.ok, false);
  if (empty.ok) assert.fail("empty input unexpectedly succeeded");
  assert.equal(empty.error.code, "INPUT_REQUIRED");
  assert.equal(empty.error.needs_user_input, true);

  const missingRoot = await mkdtemp(path.join(os.tmpdir(), "mm-agent-missing-problems-"));
  const missing = await prepareCase(
    {
      projectRoot: missingRoot,
      runsRoot: path.join(missingRoot, "runs"),
      rubricRoot: fixtureRubrics,
    },
    { caseId: "case-missing-problems" },
  );
  assert.equal(missing.ok, false);
  if (missing.ok) assert.fail("missing problems directory unexpectedly succeeded");
  assert.equal(missing.error.code, "INPUT_REQUIRED");

  const storageWorkspace = await workspace();
  await writeFile(storageWorkspace.runsRoot, "not a directory\n");
  await writeFile(
    path.join(storageWorkspace.problemsRoot, "problem.md"),
    "problem\n",
  );
  const unavailable = await prepareCase(
    {
      projectRoot: storageWorkspace.root,
      runsRoot: storageWorkspace.runsRoot,
      rubricRoot: fixtureRubrics,
    },
    { caseId: "case-storage" },
  );
  assert.equal(unavailable.ok, false);
  if (unavailable.ok) assert.fail("unavailable storage unexpectedly succeeded");
  assert.equal(unavailable.error.code, "CASE_STORAGE_UNAVAILABLE");
  assert.equal(unavailable.error.repair, "user");
});

test("prepare refuses a linked runs root before writing outside the project", async (t) => {
  const { root, runsRoot, problemsRoot } = await workspace();
  const outside = await mkdtemp(path.join(os.tmpdir(), "mm-agent-runs-outside-"));
  await writeFile(path.join(problemsRoot, "problem.md"), "problem\n");
  try {
    await symlink(outside, runsRoot, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) {
      t.skip("directory link creation is unavailable");
      return;
    }
    throw error;
  }
  const result = await prepareCase(
    {
      projectRoot: root,
      runsRoot,
      rubricRoot: fixtureRubrics,
    },
    { caseId: "case-linked-runs" },
  );
  assert.equal(result.ok, false);
  if (result.ok) assert.fail("linked runs root unexpectedly succeeded");
  assert.equal(result.error.code, "CASE_STORAGE_UNAVAILABLE");
  assert.deepEqual(await readdir(outside), []);
});

test("CaseContextStore rejects a source that changed after discovery", async () => {
  const { root, runsRoot } = await workspace();
  const source = path.join(root, "problem.md");
  await writeFile(source, "new content\n", "utf8");
  const store = new FileCaseContextStore({ runsRoot });
  await assert.rejects(
    store.open("case-stale-input", {
      sourceKind: "explicit-path",
      files: [
        {
          label: "problem.md",
          sourcePath: source,
          expectedSize: 12,
          expectedSha256: "0".repeat(64),
        },
      ],
      policy: {
        revisionBudget: {
          analysis: 2,
          modeling: 2,
          solvingPerTask: 2,
          reporting: 2,
        },
        rubrics: Object.fromEntries(
          ["analysis", "modeling", "solving", "reporting"].map((role) => [
            role,
            { sourcePath: path.join(fixtureRubrics, `${role}.md`) },
          ]),
        ) as never,
      },
    }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "READ_SET_STALE",
  );
  assert.equal(await readFile(source, "utf8"), "new content\n");
  await assert.rejects(stat(path.join(runsRoot, "case-stale-input")));
});
