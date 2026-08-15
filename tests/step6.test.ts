import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { FileCaseContextStore } from "../src/core/case-context-store.js"
import { runCaseAction } from "../src/tools/case.js"

const repositoryRoot = path.resolve(import.meta.dirname, "..")

test("Core fixture: internal runCaseAction preserves open dispatch gate inspect", async (t) => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "mm-agent-step6-case-"))
  t.after(() => rm(projectRoot, { recursive: true, force: true }))
  const source = path.join(projectRoot, "problem.md")
  await writeFile(source, "fixture problem\n")
  const store = new FileCaseContextStore({ runsRoot: path.join(projectRoot, "runs") })
  await store.open("case-step6", {
    sourceKind: "explicit-path",
    files: [{ label: "problem", sourcePath: source }],
    policy: {
      revisionBudget: { analysis: 1, modeling: 1, solvingPerTask: 1, reporting: 1 },
      rubrics: Object.fromEntries(["analysis", "modeling", "solving", "reporting"].map((name) => [
        name,
        { sourcePath: path.join(repositoryRoot, "rubrics", `${name}.md`) },
      ])) as never,
    },
  })

  const opened = await runCaseAction(projectRoot, { action: "open", caseId: "case-step6" }) as { state: { revision: number } }
  assert.equal(opened.state.revision, 0)
  const dispatched = await runCaseAction(projectRoot, {
    action: "dispatch", caseId: "case-step6", role: "analyst", goal: "analyze",
  }) as { attemptId: string; contextPath: string }
  assert.equal(dispatched.contextPath, "attempts/analysis/001/context.json")
  const attempt = path.join(projectRoot, "runs", "case-step6", "attempts", "analysis", "001")
  await writeFile(path.join(attempt, "problem-understanding.md"), "# Understanding\n")
  await writeFile(path.join(attempt, "tasks.json"), '{"schema_version":1,"tasks":[{"id":"task-01","description":"solve","requires_computation":false}]}\n')
  await writeFile(path.join(attempt, "task-graph.json"), '{"schema_version":1,"tasks":[{"id":"task-01","depends_on":[],"wave":1}]}\n')

  const gated = await runCaseAction(projectRoot, {
    action: "gate",
    caseId: "case-step6",
    attemptId: dispatched.attemptId,
    expectedRevision: 0,
    review: {
      schema_version: 1,
      attempt_id: dispatched.attemptId,
      verdict: "pass",
      findings: [],
      required_fixes: [],
      evidence: ["attempts/analysis/001/problem-understanding.md"],
      reviewed_at: "2026-07-16T00:00:00.000Z",
    },
  }) as { outcome: string; snapshot: { state: { stage: string; revision: number } } }
  assert.equal(gated.outcome, "pass")
  assert.deepEqual(gated.snapshot.state, { ...gated.snapshot.state, stage: "modeling", revision: 1 })
  const inspected = await runCaseAction(projectRoot, { action: "inspect", caseId: "case-step6" }) as { activeAttempts: unknown[] }
  assert.deepEqual(inspected.activeAttempts, [])
})

test("Core fixture: internal runCaseAction passes unknown review versions to Core rejection", async (t) => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), "mm-agent-step6-version-"))
  t.after(() => rm(projectRoot, { recursive: true, force: true }))
  const source = path.join(projectRoot, "problem.md")
  await writeFile(source, "fixture problem\n")
  const store = new FileCaseContextStore({ runsRoot: path.join(projectRoot, "runs") })
  await store.open("case-version", {
    sourceKind: "explicit-path",
    files: [{ label: "problem", sourcePath: source }],
    policy: {
      revisionBudget: { analysis: 1, modeling: 1, solvingPerTask: 1, reporting: 1 },
      rubrics: Object.fromEntries(["analysis", "modeling", "solving", "reporting"].map((name) => [name, { sourcePath: path.join(repositoryRoot, "rubrics", `${name}.md`) }])) as never,
    },
  })
  const dispatched = await runCaseAction(projectRoot, { action: "dispatch", caseId: "case-version", role: "analyst", goal: "analyze" }) as { attemptId: string }
  await assert.rejects(() => runCaseAction(projectRoot, {
    action: "gate", caseId: "case-version", attemptId: dispatched.attemptId, expectedRevision: 0,
    review: { schema_version: 2, attempt_id: dispatched.attemptId, verdict: "pass", findings: [], required_fixes: [], evidence: ["attempts/analysis/001/problem-understanding.md"], reviewed_at: "2026-07-16T00:00:00.000Z" },
  }), /schema_version 2 is unsupported/u)
  assert.equal((await store.inspect("case-version")).state.revision, 0)
})
