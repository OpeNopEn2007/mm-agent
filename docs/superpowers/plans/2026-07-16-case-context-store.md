# CaseContextStore Implementation Plan

> **Execution:** Work directly in the existing `feat/opencode-plugin-spike` worktree without invoking Superpowers. Keep one implementation line, do not create intermediate commits, and use the task checkboxes as RED/GREEN review checkpoints.

**Goal:** Implement PLAN Step 2 as the single deep module that creates, restores, dispatches, gates, and inspects a Case using only persisted Case facts.

**Architecture:** `FileCaseContextStore` presents only the accepted `open / dispatch / gate / inspect` interface. Runtime schema validation, secure Case-relative paths, deterministic hashing, context recipes, promotion policy, file locking, and atomic state writes remain implementation details under `src/core/`; acceptance tests exercise observable behavior through the store interface, while focused tests cover the migration seam and high-risk path primitives before the store exists.

**Tech Stack:** TypeScript 5.8.3, Node.js 24 filesystem APIs, Zod 4.1.8, `node:test` through `tsx`, SHA-256.

## Global Constraints

- Authority is fixed by `4ce82cd` Canonical Core, `1040e63` OpenCode Adapter, `docs/context/artifact-protocol.md`, and PLAN Step 2; do not rewrite accepted schema semantics.
- Implement only Step 2. Do not add `mm_agent_case`, Preflight, HMML, Compute/Compile behavior, workflow Skills, or Golden Case behavior.
- All persisted JSON uses integer `schema_version: 1`; unknown versions fail with `SCHEMA_VERSION_UNSUPPORTED` and require explicit `migrateCase(caseRoot, fromVersion, toVersion)`.
- All persisted paths are Case-root-relative POSIX strings. Reject absolute paths, `..`, Windows drive/UNC roots, and symlink/junction escapes after realpath resolution.
- `state.stage` is `analysis | modeling | solving | reporting`; `state.status` is `prepared | running | blocked | failed | completed`; `current_wave` is a positive integer only during solving and `null` otherwise.
- `open` creates initial state; after creation only `gate` may alter state, accepted artifacts, revision budgets, blockers, stage, wave, or revision.
- All `*_at` values are UTC RFC 3339. Tests inject a clock returning `2026-07-16T00:00:00.000Z`.
- Every production behavior follows focused RED, minimal GREEN, full `npm test`, then review. Do not stage or commit until the complete Step 2 milestone passes independent review.
- Preserve Step 1 runtime gates and package allowlist. Add Zod as a direct pinned dependency (`4.1.8`) rather than relying on the OpenCode Plugin's transitive dependency.

## File Map And Module Seams

| Path | Responsibility |
|------|----------------|
| `src/core/schema.ts` | Runtime schemas, inferred persisted types, stable error codes, and public store input/result types. |
| `src/core/paths.ts` | Case-root containment, lexical/realpath checks, SHA-256 for files/directories, JSON reads, atomic writes, promotion staging, and per-Case gate lock. |
| `src/core/migrations.ts` | The only explicit schema migration seam; v1-to-v1 validates, unsupported transitions reject without mutation. |
| `src/core/context-recipes.ts` | Fixed role-to-read/write/output/promotion mapping; no directory scanning or LLM choice. |
| `src/core/case-context-store.ts` | Deep module implementation of `open / dispatch / gate / inspect`; callers never compose paths or edit state. |
| `tests/core/case-context-store.test.ts` | Contract tests through two independent store instances and real temporary files. |
| `tests/fixtures/cases/input/problem.md` | Immutable source copied by `open`. |
| `tests/fixtures/cases/rubrics/*.md` | Four immutable rubric sources copied and hashed by `open`. |
| `package.json`, `package-lock.json` | Direct Zod dependency and inclusion of the Step 2 test in `npm test`. |

The external seam is:

```ts
export interface CaseContextStore {
  open(caseId: string, input?: OpenInput): Promise<CaseSnapshot>
  dispatch(input: DispatchInput): Promise<DispatchResult>
  gate(input: GateInput): Promise<GateResult>
  inspect(caseId: string): Promise<CaseSnapshot>
}

export class FileCaseContextStore implements CaseContextStore {
  constructor(options: { runsRoot: string; now?: () => string })
}
```

The exact public data shapes are defined once in `schema.ts`:

```ts
export type ActorRole = "analyst" | "modeler" | "solver" | "writer"
export type Role = ActorRole | "critic"
export type Scope = "analysis" | "modeling" | `solving/${string}` | "reporting"

export type OpenInput = {
  sourceKind: "explicit-path" | "problems-directory"
  files: Array<{ label: string; sourcePath: string }>
  policy: {
    revisionBudget: { analysis: number; modeling: number; solvingPerTask: number; reporting: number }
    rubrics: Record<"analysis" | "modeling" | "solving" | "reporting", { sourcePath: string }>
  }
}

export type DispatchInput = {
  caseId: string
  role: ActorRole
  taskId?: string
  baseRevision?: number
  goal: string
  constraints?: string[]
  resolvesBlocker?: string
}

export type GateInput = {
  caseId: string
  attemptId: string
  review: Review
  expectedRevision: number
}

export type CaseSnapshot = {
  caseFile: CaseFile
  inputManifest: InputManifest
  state: CaseState
  activeAttempts: ContextManifest[]
  completion: { complete: boolean; missing: string[] }
}

export type DispatchResult = { attemptId: string; contextPath: string; manifest: ContextManifest }
export type GateResult = { outcome: "pass" | "revise" | "block"; promoted: ArtifactRef[]; snapshot: CaseSnapshot }
```

Use `CaseProtocolError` with stable codes: `INVALID_CASE_ID`, `CASE_NOT_FOUND`, `CASE_EXISTS`, `SCHEMA_INVALID`, `SCHEMA_VERSION_UNSUPPORTED`, `PATH_ESCAPE`, `MIGRATION_UNSUPPORTED`, `INVALID_SCOPE`, `ACTIVE_ATTEMPT`, `STALE_REVISION`, `READ_SET_STALE`, `REVIEW_INVALID`, `CANDIDATE_MISSING`, `PROMOTION_DENIED`, `DAG_INVALID`, `BLOCKER_INVALID`, and `LOCK_BUSY`.

---

### Task 1: Runtime Schemas And Safe Persistence

**Files:**
- Create: `src/core/schema.ts`
- Create: `src/core/paths.ts`
- Create: `src/core/migrations.ts`
- Create: `tests/core/case-context-store.test.ts`
- Create: `tests/fixtures/cases/input/problem.md`
- Create: `tests/fixtures/cases/rubrics/analysis.md`
- Create: `tests/fixtures/cases/rubrics/modeling.md`
- Create: `tests/fixtures/cases/rubrics/solving.md`
- Create: `tests/fixtures/cases/rubrics/reporting.md`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `CaseProtocolError`, all persisted/public types, `readJson(path, schema)`, `resolveInsideCase(caseRoot, relativePath, mode)`, `hashPath(path)`, `writeJsonAtomic(path, value)`, `withCaseLock(caseRoot, work)`, and `migrateCase(...)`.
- Consumes: Node filesystem only; no OpenCode hook or user config.

- [x] **Step 1: Add the focused RED contract**

```ts
test("safe persistence rejects unknown versions and path escapes", async () => {
  assert.throws(() => CaseStateSchema.parse({ schema_version: 2 }), hasCode("SCHEMA_VERSION_UNSUPPORTED"))
  await assert.rejects(resolveInsideCase(caseRoot, "../outside.txt", "existing"), hasCode("PATH_ESCAPE"))
  await assert.rejects(resolveInsideCase(caseRoot, "C:\\outside.txt", "candidate"), hasCode("PATH_ESCAPE"))
})

test("migration seam never guesses an unsupported transition", async () => {
  await assert.rejects(migrateCase(caseRoot, 0, 1), hasCode("MIGRATION_UNSUPPORTED"))
  assert.deepEqual(await readFile(statePath), originalState)
})
```

- [x] **Step 2: Run RED**

Run: `npx tsx --test --test-name-pattern="safe persistence|migration seam" tests/core/case-context-store.test.ts`

Expected: FAIL because `src/core/schema.ts`, `paths.ts`, and `migrations.ts` do not exist.

- [x] **Step 3: Add direct Zod dependency and the schema/error foundation**

Run: `npm install --save-exact zod@4.1.8`

Set the complete ordinary test script immediately so every later `npm test` includes both suites:

```json
"test": "tsx --test --test-concurrency=1 tests/plugin-spike.test.ts tests/core/case-context-store.test.ts"
```

Implement discriminated runtime schemas with a shared version preprocessor:

```ts
export const SCHEMA_VERSION = 1 as const

export class CaseProtocolError extends Error {
  constructor(readonly code: CaseErrorCode, message: string, readonly details?: unknown) {
    super(message)
    this.name = "CaseProtocolError"
  }
}

export function requireVersion(value: unknown): void {
  const version = (value as { schema_version?: unknown } | null)?.schema_version
  if (version !== SCHEMA_VERSION) {
    throw new CaseProtocolError("SCHEMA_VERSION_UNSUPPORTED", `schema_version ${String(version)} is unsupported`)
  }
}
```

Define Zod schemas for `case.json`, persisted input manifest, state, blocker, artifact ref, context manifest, review, task list, task graph, task memory, Runtime Evidence, and their nested objects. Convert every `ZodError` at file-read seams to `CaseProtocolError("SCHEMA_INVALID", ...)`.

- [x] **Step 4: Implement safe paths, deterministic hashing, atomic JSON, and lock**

```ts
export async function resolveInsideCase(root: string, relative: string, mode: "existing" | "candidate"): Promise<string> {
  if (relative.includes("\\") || path.posix.isAbsolute(relative) || path.win32.isAbsolute(relative) || relative.split("/").includes("..")) {
    throw new CaseProtocolError("PATH_ESCAPE", `path is not Case-relative: ${relative}`)
  }
  const realRoot = await realpath(root)
  const absolute = path.resolve(realRoot, ...relative.split("/"))
  const probe = mode === "existing" ? await realpath(absolute) : await realpathNearestExistingAncestor(path.dirname(absolute))
  if (probe !== realRoot && !probe.startsWith(`${realRoot}${path.sep}`)) {
    throw new CaseProtocolError("PATH_ESCAPE", `path escapes Case root: ${relative}`)
  }
  return absolute
}

async function realpathNearestExistingAncestor(start: string): Promise<string> {
  let cursor = start
  for (;;) {
    try {
      return await realpath(cursor)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      const parent = path.dirname(cursor)
      if (parent === cursor) throw error
      cursor = parent
    }
  }
}
```

`hashPath` hashes a file's bytes; for a directory it sorts descendant POSIX-relative names and hashes repeated `name + NUL + fileSha256 + LF`. `writeJsonAtomic` writes `<name>.tmp-<pid>-<randomUUID()>`, fsyncs the file, renames over the target, and removes the temporary file in `finally`. `withCaseLock` acquires `state.lock` with `open(..., "wx")`, retries every 10 ms for at most 2 seconds, runs one callback, closes and unlinks in `finally`, and reports `LOCK_BUSY` only after timeout. Gate rereads state after acquiring the lock, so a normal concurrent loser reports `STALE_REVISION` rather than bypassing CAS.

- [x] **Step 5: Implement the explicit migration seam**

```ts
export async function migrateCase(caseRoot: string, fromVersion: number, toVersion: number): Promise<void> {
  if (fromVersion === 1 && toVersion === 1) {
    await Promise.all([
      readJson(path.join(caseRoot, "case.json"), CaseFileSchema),
      readJson(path.join(caseRoot, "state.json"), CaseStateSchema),
      readJson(path.join(caseRoot, "input/manifest.json"), InputManifestSchema),
    ])
    return
  }
  throw new CaseProtocolError("MIGRATION_UNSUPPORTED", `no migration ${fromVersion} -> ${toVersion}`)
}
```

- [x] **Step 6: Run GREEN and regression suite**

Run: `npx tsx --test --test-name-pattern="safe persistence|migration seam" tests/core/case-context-store.test.ts`

Expected: 2 passed, 0 failed.

Run: `npm test`

Expected: Step 1 tests remain green and the new focused tests pass.

- [x] **Step 7: Review checkpoint; do not stage or commit**

Record the focused RED/GREEN commands and inspect `git diff --check`; continue with the same uncommitted worktree.

---

### Task 2: Create And Restore Cases Through `open` And `inspect`

**Files:**
- Create: `src/core/case-context-store.ts`
- Modify: `tests/core/case-context-store.test.ts`

**Interfaces:**
- Consumes: schemas and safe persistence from Task 1.
- Produces: `FileCaseContextStore.open()` and `.inspect()` plus the stable external interface.

- [x] **Step 1: Write RED tests for immutable creation and recovery**

```ts
test("open copies input and rubrics then inspect recovers persisted facts", async () => {
  const created = await store.open("case-alpha", fixtureOpenInput)
  assert.equal(created.state.revision, 0)
  assert.equal(created.state.stage, "analysis")
  assert.equal(created.state.status, "prepared")
  assert.equal(created.state.current_wave, null)
  assert.deepEqual(created.state.revision_budget, { analysis: 2, modeling: 2, solving: {}, reporting: 2 })
  assert.equal(created.caseFile.input_manifest, "input/manifest.json")
  assert.equal(created.inputManifest.files[0]?.path, "input/files/001-problem.md")
  assert.equal((await secondStore.inspect("case-alpha")).state, created.state)
})

test("open refuses replacement and inspect refuses unknown schema", async () => {
  await store.open("case-alpha", fixtureOpenInput)
  await assert.rejects(store.open("case-alpha", fixtureOpenInput), hasCode("CASE_EXISTS"))
  await writeFile(caseJsonPath, JSON.stringify({ schema_version: 99 }))
  await assert.rejects(store.inspect("case-alpha"), hasCode("SCHEMA_VERSION_UNSUPPORTED"))
})
```

- [x] **Step 2: Run RED**

Run: `npx tsx --test --test-name-pattern="open copies|open refuses" tests/core/case-context-store.test.ts`

Expected: FAIL because `FileCaseContextStore` does not exist.

- [x] **Step 3: Implement minimal `open` and read-only `inspect`**

`open` validates `caseId` against `^[a-z0-9][a-z0-9-]{0,63}$`, requires input for a new Case, creates a staging directory beside the final Case directory, copies input/rubric sources, hashes copied bytes, writes `input/manifest.json`, immutable `case.json`, and initial `state.json`, then atomically renames the staging directory. Existing Cases accept no replacement input and route to `inspect` only when input is omitted.

```ts
async open(caseId: string, input?: OpenInput): Promise<CaseSnapshot> {
  const caseRoot = this.caseRoot(caseId)
  if (await exists(caseRoot)) {
    if (input) throw new CaseProtocolError("CASE_EXISTS", `Case ${caseId} already exists`)
    return this.inspect(caseId)
  }
  if (!input) throw new CaseProtocolError("CASE_NOT_FOUND", `Case ${caseId} does not exist`)
  await this.createCaseAtomically(caseId, input)
  return this.inspect(caseId)
}
```

`inspect` validates all three top-level persisted files, scans only `attempts/<valid-scope>/<NNN>/`, treats an attempt as active only when `context.json` is valid and `review.json` is absent, and derives completion evidence without writing.

- [x] **Step 4: Run GREEN, full tests, and build**

Run: `npx tsx --test --test-name-pattern="open copies|open refuses" tests/core/case-context-store.test.ts`

Expected: 2 passed, 0 failed.

Run: `npm test && npm run build`

Expected: exit 0.

- [x] **Step 5: Review checkpoint; do not stage or commit**

Run `git diff --check` and inspect the Task 2 diff; continue without staging.

---

### Task 3: Fixed Context Recipes And Unique Actor Dispatch

**Files:**
- Create: `src/core/context-recipes.ts`
- Modify: `src/core/case-context-store.ts`
- Modify: `tests/core/case-context-store.test.ts`

**Interfaces:**
- Consumes: validated `CaseSnapshot`, accepted artifacts, input manifest, task graph, direct-dependency memories, and rubric hashes.
- Produces: `ContextRecipe` table and `dispatch()` returning a persisted manifest path.

- [x] **Step 1: Write RED tests for scopes, sequencing, and read selection**

```ts
test("dispatch writes one immutable Actor manifest and rejects a second active attempt", async () => {
  const first = await store.dispatch({ caseId: "case-alpha", role: "analyst", goal: "analyze" })
  assert.equal(first.attemptId, "analysis-001")
  assert.equal(first.contextPath, "attempts/analysis/001/context.json")
  assert.equal(first.manifest.base_revision, 0)
  await assert.rejects(
    store.dispatch({ caseId: "case-alpha", role: "analyst", goal: "again" }),
    hasCode("ACTIVE_ATTEMPT"),
  )
})

test("solver recipe reads only modeling scheme and direct dependency memories", async () => {
  const dispatched = await solvingStore.dispatch({ caseId: "case-alpha", role: "solver", taskId: "task-03", goal: "solve" })
  assert.deepEqual(dispatched.manifest.required_reads.map((r) => r.path), [
    "artifacts/modeling-scheme.md",
    "tasks/task-01/memory.json",
    "tasks/task-02/memory.json",
  ])
})
```

- [x] **Step 2: Run RED**

Run: `npx tsx --test --test-name-pattern="dispatch writes|solver recipe" tests/core/case-context-store.test.ts`

Expected: FAIL because recipes and `dispatch` are absent.

- [x] **Step 3: Implement the recipe table and dispatch algorithm**

```ts
export type ContextRecipe = {
  role: ActorRole
  scope(snapshot: CaseSnapshot, taskId?: string): Scope
  resolveReads(snapshot: CaseSnapshot, taskId?: string): Promise<ArtifactRef[]>
  resolveWrites(attemptPath: string): string[]
  expectedOutputs(attemptPath: string): string[]
  promotions(attemptPath: string, taskId?: string): Promotion[]
  acceptance: string[]
}
```

Map analyst to input manifest/files and analysis outputs; modeler to input plus accepted analysis artifacts; solver to current task, accepted modeling scheme, and direct dependency memory only; writer to accepted index, all accepted task memories, and reporting outputs. `critic` has no dispatch recipe because it reuses the same manifest's `review` section.

`dispatch` validates role/stage/task compatibility, verifies `baseRevision` equals the current revision when supplied, derives the next sequence from valid numeric directories, refuses an active attempt, creates the attempt directory exclusively, computes every required-read hash from an allowed persisted fact, writes `context.json` once, and never writes state.

- [x] **Step 4: Run GREEN and full tests**

Run: `npx tsx --test --test-name-pattern="dispatch writes|solver recipe" tests/core/case-context-store.test.ts`

Expected: 2 passed, 0 failed.

Run: `npm test`

Expected: 0 failed.

- [x] **Step 5: Review checkpoint; do not stage or commit**

Run `git diff --check` and inspect the Task 3 diff; continue without staging.

---

### Task 4: Gate Validation, CAS, And Promotion Policy

**Files:**
- Modify: `src/core/paths.ts`
- Modify: `src/core/schema.ts`
- Modify: `src/core/case-context-store.ts`
- Modify: `tests/core/case-context-store.test.ts`

**Interfaces:**
- Consumes: one active manifest, structured review, candidate files, current state, and `expectedRevision`.
- Produces: validated `pass` promotions and one atomic state revision.

- [x] **Step 1: Write RED tests for stale writes, read-set drift, missing candidates, and every scope whitelist**

```ts
test("gate rejects stale revision and changed required reads without writing review", async () => {
  await assert.rejects(store.gate({ ...passGate, expectedRevision: 99 }), hasCode("STALE_REVISION"))
  await writeFile(requiredReadAbsolute, "changed")
  await assert.rejects(store.gate(passGate), hasCode("READ_SET_STALE"))
  assert.equal(await exists(reviewPath), false)
})

test("gate rejects a promotion outside the scope whitelist", async () => {
  await mutateManifest((manifest) => manifest.promotions[0]!.target = "report/report.pdf")
  await assert.rejects(store.gate(passGate), hasCode("PROMOTION_DENIED"))
})
```

Generate one table-driven case for each allowed target and one denied sibling target for `analysis`, `modeling`, `solving/<task-id>`, and `reporting`.

- [x] **Step 2: Run RED**

Run: `npx tsx --test --test-name-pattern="gate rejects|scope whitelist" tests/core/case-context-store.test.ts`

Expected: FAIL because `gate` is absent.

- [x] **Step 3: Implement gate validation in canonical order**

Inside `withCaseLock`, load and validate state/manifest/review, compare `expectedRevision`, recompute every required-read hash, ensure review attempt ID matches, ensure candidate paths are covered by `allowed_writes`, require every required candidate, and validate target policy:

```ts
const allowedTargets: Record<Exclude<Scope, `solving/${string}`>, readonly RegExp[]> = {
  analysis: [/^artifacts\/(problem-understanding\.md|tasks\.json|task-graph\.json)$/u],
  modeling: [/^artifacts\/modeling-scheme\.md$/u, /^tasks\/[^/]+\/retrieved-methods\.json$/u],
  reporting: [/^report\/(outline\.md|notation\.md|main\.tex|compile\.log|report\.pdf)$/u],
}
function isSolvingTarget(taskId: string, target: string): boolean {
  const prefix = `tasks/${taskId}/`
  return target === `${prefix}execution-result.json`
    || target === `${prefix}memory.json`
    || target === `${prefix}code/`
    || target === `${prefix}figures/`
}
```

Stage the review and candidates in Case-local temporary paths, validate artifact JSON where a schema exists, prepare the next accepted index/state in memory, then install `review.json`, stable targets, and the atomic `state.json` replacement as one rollback-capable transaction. On a caught failure after replacement begins, restore the absent/previous review and target backups and remove temporary files before releasing the lock.

- [x] **Step 4: Run GREEN and full tests**

Run: `npx tsx --test --test-name-pattern="gate rejects|scope whitelist" tests/core/case-context-store.test.ts`

Expected: all selected tests pass.

Run: `npm test && npm run build`

Expected: exit 0.

- [x] **Step 5: Review checkpoint; do not stage or commit**

Run `git diff --check` and inspect the Task 4 diff; continue without staging.

---

### Task 5: Review Outcomes, Revision Budgets, And Blockers

**Files:**
- Modify: `src/core/case-context-store.ts`
- Modify: `tests/core/case-context-store.test.ts`

**Interfaces:**
- Consumes: `pass | revise | block` Review and scope-specific revision budget.
- Produces: closed attempts, failed-on-exhaustion behavior, append-only blockers, and explicit blocker resolution.

- [x] **Step 1: Write RED tests for all verdicts and budgets**

```ts
test("revise decrements only its scope budget and exhaustion fails the Case", async () => {
  const first = await store.gate(reviseGate)
  assert.equal(first.snapshot.state.revision_budget.analysis, 0)
  await createNextAnalysisAttempt()
  const exhausted = await store.gate(reviseGateForSecondAttempt)
  assert.equal(exhausted.snapshot.state.status, "failed")
})

test("block preserves stage and wave and only same-scope pass resolves it", async () => {
  const blocked = await store.gate(blockGate)
  assert.equal(blocked.snapshot.state.status, "blocked")
  assert.equal(blocked.snapshot.state.current_wave, 2)
  await assert.rejects(dispatchWrongScopeWithBlocker(), hasCode("BLOCKER_INVALID"))
  const resolved = await gateSameScopePassWithBlocker()
  assert.equal(resolved.snapshot.state.blockers[0]?.resolved_at, fixedNow)
})
```

- [x] **Step 2: Run RED**

Run: `npx tsx --test --test-name-pattern="revise decrements|block preserves" tests/core/case-context-store.test.ts`

Expected: FAIL on missing outcome transitions.

- [x] **Step 3: Implement exact outcome transitions**

For `revise`, write the valid review, promote nothing, decrement only analysis/modeling/reporting or `solving[taskId]`, set failed when already zero, and increment revision. For `block`, require a non-empty reason derived from `required_fixes` or findings, append `{id: blocker-NNN, scope, attempt_id, reason, created_at, resolved_at: null}`, preserve stage/wave, set blocked, and increment revision. A manifest may set `resolves_blocker` only for an unresolved blocker with identical scope; only a successful Actor pass sets `resolved_at`, and status returns to running only when no unresolved blocker remains.

- [x] **Step 4: Run GREEN and full tests**

Run: `npx tsx --test --test-name-pattern="revise decrements|block preserves" tests/core/case-context-store.test.ts`

Expected: selected tests pass.

Run: `npm test`

Expected: 0 failed.

- [x] **Step 5: Review checkpoint; do not stage or commit**

Run `git diff --check` and inspect the Task 5 diff; continue without staging.

---

### Task 6: DAG Validation, Stage Progression, And Completion Evidence

**Files:**
- Modify: `src/core/schema.ts`
- Modify: `src/core/case-context-store.ts`
- Modify: `tests/core/case-context-store.test.ts`

**Interfaces:**
- Consumes: accepted `tasks.json`, `task-graph.json`, modeling artifacts, per-task outputs, and report outputs.
- Produces: deterministic stage/wave transitions and derived completion evidence.

- [x] **Step 1: Write RED DAG and progression matrix**

```ts
for (const invalid of [duplicateTaskIds, missingDependency, cyclicGraph, unmetCurrentWaveDependency]) {
  test(`modeling gate rejects invalid DAG: ${invalid.name}`, async () => {
    await installGraphCandidate(invalid.value)
    await assert.rejects(store.gate(modelingPass), hasCode("DAG_INVALID"))
  })
}

test("passes advance all four stages and completion is derived from files", async () => {
  assert.equal((await passAnalysis()).snapshot.state.stage, "modeling")
  assert.equal((await passModeling()).snapshot.state.current_wave, 1)
  assert.equal((await passWave(1)).snapshot.state.current_wave, 2)
  assert.equal((await passFinalWave()).snapshot.state.stage, "reporting")
  const finished = await passReportingWithNonEmptyPdf()
  assert.equal(finished.snapshot.state.status, "completed")
  assert.deepEqual(finished.snapshot.completion, { complete: true, missing: [] })
})
```

- [x] **Step 2: Run RED**

Run: `npx tsx --test --test-name-pattern="invalid DAG|passes advance" tests/core/case-context-store.test.ts`

Expected: FAIL because DAG/progression checks are absent.

- [x] **Step 3: Implement DAG and stage functions as private implementation**

Validate unique task IDs, existing dependency IDs, acyclicity with Kahn's algorithm, positive waves, and all dependencies of the current wave already represented by accepted task memories. On accepted modeling DAG, initialize `revision_budget.solving[taskId]` from immutable `caseFile.policy.revision_budget.solving_per_task`.

After each pass, compute required stable targets for the current stage. Move analysis to modeling after all three analysis targets; modeling to solving wave 1 after modeling scheme plus valid DAG/task modeling artifacts; solving to the next wave only when all current-wave tasks are accepted and no unresolved blocker prevents progression; solving to reporting after all tasks; reporting to completed only when accepted index includes required report artifacts and `report.pdf` is non-empty.

- [x] **Step 4: Run GREEN and full tests**

Run: `npx tsx --test --test-name-pattern="invalid DAG|passes advance" tests/core/case-context-store.test.ts`

Expected: selected tests pass.

Run: `npm test && npm run build`

Expected: exit 0.

- [x] **Step 5: Review checkpoint; do not stage or commit**

Run `git diff --check` and inspect the Task 6 diff; continue without staging.

---

### Task 7: Concurrency, Fresh Recovery, Package Gate, And Status Closeout

**Files:**
- Modify: `tests/core/case-context-store.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify after acceptance: `README.md`, `PLAN.md`, `HANDOFF.md`, `CHANGELOG.md`, and both `AGENTS.md`/`CLAUDE.md` only if their current-status sentence changes.

**Interfaces:**
- Consumes: the complete Step 2 module.
- Produces: evidence that two store instances cannot overwrite state, new instances recover only from disk, npm contains compiled Core files, and active status docs point to Step 3.

- [x] **Step 1: Write final RED concurrency and recovery tests**

```ts
test("two stores gating the same expected revision yield exactly one success", async () => {
  const results = await Promise.allSettled([
    firstStore.gate({ ...firstGate, expectedRevision: 4 }),
    secondStore.gate({ ...secondGate, expectedRevision: 4 }),
  ])
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1)
  assert.equal(results.filter((result) => result.status === "rejected").length, 1)
  assert.equal((await thirdStore.inspect("case-alpha")).state.revision, 5)
})

test("fresh store derives active attempts and completion without compaction or memory", async () => {
  const snapshot = await new FileCaseContextStore({ runsRoot }).inspect("case-alpha")
  assert.deepEqual(snapshot.activeAttempts.map((attempt) => attempt.attempt_id), ["solving-task-03-002"])
  assert.equal(snapshot.completion.complete, false)
})
```

- [x] **Step 2: Run RED**

Run: `npx tsx --test --test-name-pattern="two stores gating|fresh store derives" tests/core/case-context-store.test.ts`

Expected: any remaining lock/recovery defect fails deterministically; if both pass immediately, perform mutation verification by temporarily bypassing `expectedRevision` comparison and observe the concurrency test fail before restoring the check.

- [x] **Step 3: Close only the observed concurrency/recovery gaps**

Keep the lock inside `gate`, reread state after lock acquisition, compare `expectedRevision` there, and map the losing call to `STALE_REVISION` after lock release/retry. Do not cache Case snapshots, attempts, hashes, or completion evidence across calls.

- [x] **Step 4: Verify the complete npm test command still includes both suites**

Confirm Task 1 left the script exactly as:

```json
"test": "tsx --test --test-concurrency=1 tests/plugin-spike.test.ts tests/core/case-context-store.test.ts"
```

Do not change `test:runtime` or `golden`.

- [x] **Step 5: Run all acceptance gates fresh**

Run, in order:

```bash
npm install
npm test
npm run build
npm run test:runtime
npm pack --dry-run
git diff --check
git diff --no-index AGENTS.md CLAUDE.md
git status --short
```

Expected: install/build exit 0; all ordinary and five real runtime tests pass; pack contains `dist/core/*.js` and declarations but no tests/runs/cache/config/secrets; diff checks exit 0; only intended Step 2/status files appear.

- [x] **Step 6: Independent acceptance review**

Review against PLAN lines 93-116, Canonical Core lines 63-105 and 150-248, Artifact Protocol lines 7-348, and Adapter lines 57-138. Reject acceptance for any missing schema, path escape, active-attempt rule, CAS/read-set check, promotion whitelist, budget, blocker, DAG, stage transition, completion, recovery, or real Step 1 runtime regression.

- [x] **Step 7: Create the single Step 2 milestone commit**

After independent acceptance, update current-status documents without changing canonical mechanisms. Stage the complete Step 2 implementation, tests, plan, `.gitignore`, and status documents together, inspect the cached file list and diff, then create exactly one commit:

```bash
git add .gitignore package.json package-lock.json src/core tests/core tests/fixtures/cases docs/superpowers/plans/2026-07-16-case-context-store.md docs/README.md README.md PLAN.md HANDOFF.md CHANGELOG.md AGENTS.md CLAUDE.md
git diff --cached --check
git commit -m "feat: implement CaseContextStore contract"
```

Do not push unless the user explicitly requests it.

## Self-Review Checklist

- Every PLAN Step 2 requirement maps to Tasks 1-7.
- The store interface has four methods; schema/path/recipe/lock details stay behind the seam.
- Critic never creates an Attempt; it reuses the Actor Manifest review section.
- `dispatch` never writes state; `inspect` never writes anything; only successful `gate` changes state after creation.
- `base_revision` remains audit data; `expectedRevision` is the gate CAS value.
- Same-wave independent Solver gates may serialize while required-read hashes detect meaningful upstream drift.
- Unknown schema versions and unsupported migrations fail without modifying Case files.
- No task introduces Step 3 or later runtime behavior.
