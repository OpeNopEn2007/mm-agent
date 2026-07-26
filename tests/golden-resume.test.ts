import assert from "node:assert/strict"
import test from "node:test"
import { hasSuccessfulCompileEvidence, isAttemptComplete, planGoldenResume } from "../scripts/golden-resume.mjs"
import path from "node:path"
import os from "node:os"

const repositoryRoot = path.resolve(import.meta.dirname, "..")

const graph = { tasks: [
  { id: "task-a", wave: 1 },
  { id: "task-b", wave: 1 },
  { id: "task-total", wave: 2 },
] }
const state = (stage: string, currentWave: number | null, accepted: string[] = []) => ({
  status: "running",
  stage,
  current_wave: currentWave,
  accepted_artifacts: accepted.map((path) => ({ path })),
})

test("Golden resume planner preserves accepted stages and resumes only the active solver attempt", () => {
  const plan = planGoldenResume({
    state: state("solving", 1, ["artifacts/problem-understanding.md", "artifacts/modeling-scheme.md", "tasks/task-a/memory.json"]),
    taskGraph: graph,
    activeAttempts: [{ scope: "solving/task-b", attempt_id: "solving-task-b-002" }],
  })
  assert.deepEqual(plan, {
    action: "solve-wave",
    wave: 1,
    tasks: [{ action: "resume-attempt", role: "solver", task_id: "task-b", attempt: { scope: "solving/task-b", attempt_id: "solving-task-b-002" } }],
  })
})

test("Golden resume planner advances from later waves, reporting, and completed evidence without dispatching accepted work", () => {
  assert.deepEqual(planGoldenResume({
    state: state("solving", 2, ["tasks/task-a/memory.json", "tasks/task-b/memory.json"]), taskGraph: graph, activeAttempts: [],
  }), { action: "solve-wave", wave: 2, tasks: [{ action: "dispatch", role: "solver", task_id: "task-total" }] })
  assert.deepEqual(planGoldenResume({ state: state("reporting", null), taskGraph: graph, activeAttempts: [] }), { action: "dispatch", role: "writer", task_id: undefined })
  assert.deepEqual(planGoldenResume({ state: { ...state("reporting", null), status: "completed" }, taskGraph: graph, activeAttempts: [] }), { action: "inspect-completion" })
})

test("Golden resume planner recognizes an active reporting Attempt without re-running Solver", () => {
  const plan = planGoldenResume({
    state: state("reporting", null, [
      "artifacts/problem-understanding.md",
      "artifacts/tasks.json",
      "artifacts/task-graph.json",
      "artifacts/modeling-scheme.md",
      "tasks/task-01/memory.json",
    ]),
    taskGraph: graph,
    activeAttempts: [{ scope: "reporting", role: "writer", attempt_id: "reporting-002", contextPath: "attempts/reporting/002/context.json" }],
  })
  assert.deepEqual(plan, {
    action: "resume-attempt",
    role: "writer",
    task_id: undefined,
    attempt: { scope: "reporting", role: "writer", attempt_id: "reporting-002", contextPath: "attempts/reporting/002/context.json" },
  })
})

test("isAttemptComplete returns true when every Manifest expected_output exists as a regular file", async () => {
  const { mkdtemp, writeFile, mkdir, rm } = await import("node:fs/promises")
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-complete-"))
  try {
    const attemptDir = path.join(root, "attempts", "reporting", "002")
    await mkdir(attemptDir, { recursive: true })
    for (const name of ["outline.md", "notation.md", "main.tex", "compile.log", "report.pdf"]) {
      await writeFile(path.join(attemptDir, name), "content")
    }
    assert.equal(await isAttemptComplete(root, {
      expected_outputs: [
        "attempts/reporting/002/outline.md",
        "attempts/reporting/002/notation.md",
        "attempts/reporting/002/main.tex",
        "attempts/reporting/002/compile.log",
        "attempts/reporting/002/report.pdf",
      ],
    }), true)
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
})

test("isAttemptComplete returns false when any Manifest expected_output is missing on disk", async () => {
  const { mkdtemp, writeFile, mkdir, rm } = await import("node:fs/promises")
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-complete-"))
  try {
    const attemptDir = path.join(root, "attempts", "reporting", "002")
    await mkdir(attemptDir, { recursive: true })
    for (const name of ["outline.md", "notation.md", "main.tex", "compile.log"]) {
      await writeFile(path.join(attemptDir, name), "content")
    }
    assert.equal(await isAttemptComplete(root, {
      expected_outputs: [
        "attempts/reporting/002/outline.md",
        "attempts/reporting/002/notation.md",
        "attempts/reporting/002/main.tex",
        "attempts/reporting/002/compile.log",
        "attempts/reporting/002/report.pdf",
      ],
    }), false)
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
})

test("isAttemptComplete requires directory candidates to end with / and exist as a directory", async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises")
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-complete-"))
  try {
    const dirCandidate = path.join(root, "attempts", "solving", "task-01", "code")
    await mkdir(dirCandidate, { recursive: true })
    const fileCandidate = path.join(root, "attempts", "solving", "task-01", "answer.txt")
    await writeFile(fileCandidate, "x")

    // Trailing slash + actual directory → true
    assert.equal(await isAttemptComplete(root, {
      expected_outputs: ["attempts/solving/task-01/code/"],
    }), true)
    // No trailing slash but the path exists as directory → false (must be file)
    assert.equal(await isAttemptComplete(root, {
      expected_outputs: ["attempts/solving/task-01/code"],
    }), false)
    // Trailing slash but path exists as file → false (must be directory)
    assert.equal(await isAttemptComplete(root, {
      expected_outputs: ["attempts/solving/task-01/answer.txt/"],
    }), false)
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
})

test("isAttemptComplete rejects absolute paths, traversal, and resolved escape", async () => {
  const { mkdtemp, mkdir, writeFile, rm, symlink } = await import("node:fs/promises")
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-complete-"))
  const outside = await mkdtemp(path.join(os.tmpdir(), "mm-agent-outside-"))
  try {
    const attemptDir = path.join(root, "attempts", "reporting", "002")
    await mkdir(attemptDir, { recursive: true })
    await writeFile(path.join(attemptDir, "outline.md"), "content")
    const outsideFile = path.join(outside, "stolen.txt")
    await writeFile(outsideFile, "outside")

    // Absolute path → false
    assert.equal(await isAttemptComplete(root, {
      expected_outputs: [`${path.sep}abs${path.sep}path${path.sep}stolen.txt`],
    }), false)

    // Traversal via ".." segment → false
    assert.equal(await isAttemptComplete(root, {
      expected_outputs: [`attempts${path.sep}reporting${path.sep}002${path.sep}..${path.sep}..${path.sep}..${path.sep}${path.basename(outside)}${path.sep}stolen.txt`],
    }), false)

    // Resolved escape via symlink that survives realpath → false.
    const escapeLink = path.join(root, "attempts", "reporting", "002", "escape")
    try {
      await symlink(outside, escapeLink, "junction")
      assert.equal(await isAttemptComplete(root, {
        expected_outputs: ["attempts/reporting/002/escape/stolen.txt"],
      }), false)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      assert.ok(["EPERM", "EACCES", "ENOTSUP"].includes(code ?? ""), `unexpected symlink failure: ${code}`)
    }
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
    await rm(outside, { recursive: true, force: true }).catch(() => undefined)
  }
})

test("isAttemptComplete is presence-only; hashes, semantics, and non-empty PDF are not consulted", async () => {
  const { mkdtemp, writeFile, mkdir, rm } = await import("node:fs/promises")
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-complete-"))
  try {
    const attemptDir = path.join(root, "attempts", "reporting", "002")
    await mkdir(attemptDir, { recursive: true })
    // Empty files are still "complete": isAttemptComplete does not read content.
    await writeFile(path.join(attemptDir, "outline.md"), "")
    await writeFile(path.join(attemptDir, "notation.md"), "")
    await writeFile(path.join(attemptDir, "main.tex"), "")
    await writeFile(path.join(attemptDir, "compile.log"), "")
    await writeFile(path.join(attemptDir, "report.pdf"), "")
    assert.equal(await isAttemptComplete(root, {
      expected_outputs: [
        "attempts/reporting/002/outline.md",
        "attempts/reporting/002/notation.md",
        "attempts/reporting/002/main.tex",
        "attempts/reporting/002/compile.log",
        "attempts/reporting/002/report.pdf",
      ],
    }), true)
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
})

test("isAttemptComplete returns false when expected_outputs is empty, missing, or the Case root does not exist", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises")
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-complete-"))
  try {
    assert.equal(await isAttemptComplete(root, { expected_outputs: [] }), false)
    assert.equal(await isAttemptComplete(root, {} as { expected_outputs?: string[] }), false)
    assert.equal(await isAttemptComplete(root, { expected_outputs: ["not/absolute/file.md"] }), false)
    assert.equal(await isAttemptComplete(path.join(root, "does", "not", "exist"), { expected_outputs: ["attempts/reporting/002/outline.md"] }), false)
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
})

test("hasSuccessfulCompileEvidence requires a successful reference with exit_code zero", async () => {
  const { mkdtemp, mkdir, rm, writeFile } = await import("node:fs/promises")
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-compile-evidence-"))
  try {
    const evidence = path.join(root, "attempts", "reporting", "002", "evidence")
    await mkdir(evidence, { recursive: true })
    const attempt = { expected_outputs: ["attempts/reporting/002/report.pdf"] }
    await writeFile(path.join(evidence, "compile-001.json"), JSON.stringify({ kind: "compile", status: "succeeded" }))
    assert.equal(await hasSuccessfulCompileEvidence(root, attempt), false)
    await writeFile(path.join(evidence, "compile-002.json"), JSON.stringify({ kind: "compile", status: "succeeded", exit_code: 0 }))
    assert.equal(await hasSuccessfulCompileEvidence(root, attempt), true)
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
})

test("resumeAttempt skips Actor only when outputs and Compile Evidence are both ready", async () => {
  const { readFile } = await import("node:fs/promises")
  const runner = await readFile(path.join(repositoryRoot, "scripts", "run-golden-case.mjs"), "utf8")
  assert.match(runner, /isAttemptComplete, planGoldenResume/u, "runner must import isAttemptComplete from golden-resume")
  const block = runner.match(/async function resumeAttempt[\s\S]+?\n\}/u)
  assert.ok(block, "resumeAttempt definition is present")
  const body = block[0]

  // Production wiring: expected outputs and Reporting Compile Evidence are checked before Actor.
  assert.match(body, /isAttemptComplete\([^)]*\)/u, "resumeAttempt must call isAttemptComplete")
  assert.match(body, /hasSuccessfulCompileEvidence\([^)]*\)/u, "resumeAttempt must check Reporting Compile Evidence")
  const isAttemptCompleteIndex = body.search(/isAttemptComplete\(/u)
  const evidenceIndex = body.search(/hasSuccessfulCompileEvidence\(/u)
  const actorIndex = body.search(/await actor\(/u)
  assert.ok(actorIndex > isAttemptCompleteIndex, "isAttemptComplete must be checked before actor()")
  assert.ok(actorIndex > evidenceIndex, "Compile Evidence must be checked before actor()")
  assert.match(body, /if \(!complete \|\| needsCompile\)/u, "incomplete or stale Compile Evidence must resume Actor")
  assert.match(body, /const review = await critic\(/u, "resume flow must call Critic")
  assert.match(body, /const outcome = await gate\(/u, "resume flow must call Gate")
  assert.match(body, /skippedActor/u, "fully ready Candidate must mark that the Actor was skipped")
  assert.match(body, /await stage\(/u, "Gate revise must continue to flow through stage()")
})

test("resumeAttempt does not fabricate a Review, alter state directly, or dispatch outside stage() revise", async () => {
  const { readFile } = await import("node:fs/promises")
  const runner = await readFile(path.join(repositoryRoot, "scripts", "run-golden-case.mjs"), "utf8")
  const block = runner.match(/async function resumeAttempt[\s\S]+?\n\}/u)
  assert.ok(block, "resumeAttempt definition is present")
  const body = block[0]
  assert.doesNotMatch(body, /writeFile\([^)]*state\.json/u, "resumeAttempt must not write state.json directly")
  assert.doesNotMatch(body, /review\s*=\s*\{/u, "resumeAttempt must not fabricate a Review object")
  // Only one place may dispatch a new Attempt, and only via stage() (the revise fallback).
  assert.equal((body.match(/await dispatch\(/gu) ?? []).length, 0, "resumeAttempt must not call dispatch() directly")
  assert.equal((body.match(/await stage\(/gu) ?? []).length >= 1, true, "Gate revise must continue to flow through stage()")
})
