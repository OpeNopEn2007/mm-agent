import assert from "node:assert/strict"
import test from "node:test"
import { canonicalizeReviewEvidence, hasMmbenchCoachQuality, hasSuccessfulCompileEvidence, hasSuccessfulComputeEvidence, isAttemptComplete, planGoldenResume } from "../scripts/golden-resume.mjs"
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

test("canonicalizeReviewEvidence strips only the current Case disk prefix", () => {
  const review = canonicalizeReviewEvidence({
    schema_version: 1,
    evidence: [
      "runs/case-a/attempts/analysis/001/tasks.json",
      "attempts/analysis/001/task-graph.json",
      "runs/case-b/attempts/analysis/001/tasks.json",
      "C:/outside.txt",
    ],
  }, "case-a")
  assert.deepEqual(review.evidence, [
    "attempts/analysis/001/tasks.json",
    "attempts/analysis/001/task-graph.json",
    "runs/case-b/attempts/analysis/001/tasks.json",
    "C:/outside.txt",
  ])
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

test("hasSuccessfulCompileEvidence requires current successful Compile Evidence", async () => {
  const { mkdtemp, mkdir, rm, writeFile } = await import("node:fs/promises")
  const { createHash } = await import("node:crypto")
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-compile-evidence-"))
  try {
    const attemptRoot = path.join(root, "attempts", "reporting", "002")
    const evidence = path.join(root, "attempts", "reporting", "002", "evidence")
    await mkdir(evidence, { recursive: true })
    const attempt = { expected_outputs: ["attempts/reporting/002/report.pdf"] }
    await writeFile(path.join(evidence, "compile-001.json"), JSON.stringify({ kind: "compile", status: "succeeded" }))
    assert.equal(await hasSuccessfulCompileEvidence(root, attempt), false)
    const hash = (value: string) => createHash("sha256").update(value).digest("hex")
    await writeFile(path.join(attemptRoot, "main.tex"), "main")
    await writeFile(path.join(attemptRoot, "compile.log"), "log")
    await writeFile(path.join(attemptRoot, "report.pdf"), "pdf")
    const payload = JSON.stringify({
      schema_version: 1,
      kind: "compile",
      status: "succeeded",
      exit_code: 0,
      inputs: [{ path: "attempts/reporting/002/main.tex", sha256: hash("main") }],
      outputs: [
        { path: "attempts/reporting/002/compile.log", sha256: hash("log") },
        { path: "attempts/reporting/002/report.pdf", sha256: hash("pdf") },
      ],
      pdf: { path: "attempts/reporting/002/report.pdf", sha256: hash("pdf") },
    })
    await writeFile(path.join(evidence, "compile-002-manifest.json"), payload)
    await writeFile(path.join(evidence, "compile-002.json"), JSON.stringify({
      schema_version: 1,
      kind: "compile",
      path: "attempts/reporting/002/evidence/compile-002-manifest.json",
      sha256: hash(payload),
      status: "succeeded",
      exit_code: 0,
    }))
    assert.equal(await hasSuccessfulCompileEvidence(root, attempt), true)
    await writeFile(path.join(attemptRoot, "main.tex"), "changed")
    assert.equal(await hasSuccessfulCompileEvidence(root, attempt), false)
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
})

test("Golden resume planner dispatches same-wave dependents only after direct memory is accepted", () => {
  const sameWave = { tasks: [
    { id: "task-a", wave: 1, depends_on: [] },
    { id: "task-b", wave: 1, depends_on: ["task-a"] },
  ] }
  assert.deepEqual(planGoldenResume({
    state: state("solving", 1),
    taskGraph: sameWave,
    activeAttempts: [],
  }), {
    action: "solve-wave",
    wave: 1,
    tasks: [{ action: "dispatch", role: "solver", task_id: "task-a" }],
  })
  assert.deepEqual(planGoldenResume({
    state: state("solving", 1, ["tasks/task-a/memory.json"]),
    taskGraph: sameWave,
    activeAttempts: [],
  }), {
    action: "solve-wave",
    wave: 1,
    tasks: [{ action: "dispatch", role: "solver", task_id: "task-b" }],
  })
})

test("hasSuccessfulComputeEvidence requires current hash-matching Compute Evidence", async () => {
  const { mkdir, rm, writeFile } = await import("node:fs/promises")
  const root = path.join(process.env.TEMP ?? ".", `golden-compute-${Date.now().toString(36)}`)
  const result = "attempts/solving/task-a/001/execution-result.json"
  const attempt = { expected_outputs: [result] }
  try {
    await mkdir(path.dirname(path.join(root, ...result.split("/"))), { recursive: true })
    await writeFile(path.join(root, ...result.split("/")), '{"task_id":"task-a"}\n')
    assert.equal(await hasSuccessfulComputeEvidence(root, attempt), false)
    const script = "attempts/solving/task-a/001/code/solve.py"
    const payload = "attempts/solving/task-a/001/evidence/compute-001-manifest.json"
    await mkdir(path.dirname(path.join(root, ...script.split("/"))), { recursive: true })
    await mkdir(path.dirname(path.join(root, ...payload.split("/"))), { recursive: true })
    await writeFile(path.join(root, ...script.split("/")), "print(1)\n")
    const { createHash } = await import("node:crypto")
    const scriptHash = createHash("sha256").update("print(1)\n").digest("hex")
    const payloadText = JSON.stringify({ entry_script: { path: script, sha256: scriptHash }, inputs: [], outputs: [] })
    await writeFile(path.join(root, ...payload.split("/")), payloadText)
    const payloadHash = createHash("sha256").update(payloadText).digest("hex")
    await writeFile(path.join(root, ...result.split("/")), JSON.stringify({
      schema_version: 1,
      kind: "compute",
      path: payload,
      sha256: payloadHash,
      status: "succeeded",
      exit_code: 0,
    }))
    assert.equal(await hasSuccessfulComputeEvidence(root, attempt), true)
    const helper = "attempts/solving/task-a/001/code/helper.py"
    await writeFile(path.join(root, ...helper.split("/")), "VALUE = 1\n")
    assert.equal(await hasSuccessfulComputeEvidence(root, attempt), false)
    await rm(path.join(root, ...helper.split("/")))
    const nonConvergedPayloadText = JSON.stringify({
      entry_script: { path: script, sha256: scriptHash },
      inputs: [],
      outputs: [],
      stdout: "fold-a: converged=False",
    })
    await writeFile(path.join(root, ...payload.split("/")), nonConvergedPayloadText)
    await writeFile(path.join(root, ...result.split("/")), JSON.stringify({
      schema_version: 1,
      kind: "compute",
      path: payload,
      sha256: createHash("sha256").update(nonConvergedPayloadText).digest("hex"),
      status: "succeeded",
      exit_code: 0,
    }))
    assert.equal(await hasSuccessfulComputeEvidence(root, attempt), false)
    await writeFile(path.join(root, ...payload.split("/")), payloadText)
    await writeFile(path.join(root, ...result.split("/")), JSON.stringify({
      schema_version: 1,
      kind: "compute",
      path: payload,
      sha256: payloadHash,
      status: "succeeded",
      exit_code: 0,
    }))
    await writeFile(path.join(root, ...script.split("/")), "print(2)\n")
    assert.equal(await hasSuccessfulComputeEvidence(root, attempt), false)
    await writeFile(path.join(root, ...script.split("/")), "print(1)\n")
    const failedStatusPayloadText = JSON.stringify({
      entry_script: { path: script, sha256: scriptHash },
      inputs: [],
      outputs: [],
      stdout: "overall_status: fail",
    })
    await writeFile(path.join(root, ...payload.split("/")), failedStatusPayloadText)
    await writeFile(path.join(root, ...result.split("/")), JSON.stringify({
      schema_version: 1,
      kind: "compute",
      path: payload,
      sha256: createHash("sha256").update(failedStatusPayloadText).digest("hex"),
      status: "succeeded",
      exit_code: 0,
    }))
    assert.equal(await hasSuccessfulComputeEvidence(root, attempt), false)
    const probe = "attempts/solving/task-a/001/code/probe.py"
    await writeFile(path.join(root, ...probe.split("/")), "print('ok')\n")
    const probeHash = createHash("sha256").update("print('ok')\n").digest("hex")
    const probePayloadText = JSON.stringify({ entry_script: { path: probe, sha256: probeHash }, inputs: [], outputs: [] })
    await writeFile(path.join(root, ...payload.split("/")), probePayloadText)
    await writeFile(path.join(root, ...result.split("/")), JSON.stringify({
      schema_version: 1,
      kind: "compute",
      path: payload,
      sha256: createHash("sha256").update(probePayloadText).digest("hex"),
      status: "succeeded",
      exit_code: 0,
    }))
    assert.equal(await hasSuccessfulComputeEvidence(root, attempt), false)
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
})

test("hasMmbenchCoachQuality rejects fixed-effect values leaked into recovered random effects", async () => {
  const { mkdir, rm, writeFile } = await import("node:fs/promises")
  const root = path.join(process.env.TEMP ?? ".", `golden-coach-${Date.now().toString(36)}`)
  const attempt = {
    scope: "solving/coach-claim-tests",
    contextPath: "attempts/solving/coach-claim-tests/002/context.json",
  }
  const result = path.join(root, "attempts", "solving", "coach-claim-tests", "002", "code", "coach_claim_results.json")
  const fold = {
    beta_0: 0.4,
    beta_1: -1.2,
    sigma_match: 0.8,
    sigma_player: 0.7,
    converged: true,
    u_match_recovered: { match_a: 0.4, match_b: 0 },
  }
  try {
    await mkdir(path.dirname(result), { recursive: true })
    await writeFile(result, JSON.stringify({ mixed_effects: { folds: { a: fold, b: fold, c: fold } } }))
    assert.equal(await hasMmbenchCoachQuality(root, attempt), false)
    const repaired = { ...fold, u_match_recovered: { match_a: 0.2, match_b: -0.1 } }
    await writeFile(result, JSON.stringify({ mixed_effects: { folds: { a: repaired, b: repaired, c: repaired } } }))
    assert.equal(await hasMmbenchCoachQuality(root, attempt), true)
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
})

test("hasMmbenchCoachQuality accepts the active stratified-permutation contract", async () => {
  const { mkdir, rm, writeFile } = await import("node:fs/promises")
  const root = path.join(process.env.TEMP ?? ".", `golden-coach-permutation-${Date.now().toString(36)}`)
  const code = path.join(root, "attempts", "solving", "coach-claim-tests", "001", "code")
  const attempt = { scope: "solving/coach-claim-tests", contextPath: "attempts/solving/coach-claim-tests/001/context.json" }
  const ids = ["match-a", "match-b", "match-c"]
  try {
    await mkdir(code, { recursive: true })
    await writeFile(path.join(code, "config.json"), JSON.stringify({
      P_permutations: 2000,
      logistic_specification: { predictors_strictly_through_t_minus_1: true },
    }))
    await writeFile(path.join(code, "per_match_coach_claim_results.json"), JSON.stringify(Object.fromEntries(ids.map((id) => [id, {
      max_run_length_eval: { effect_size: 0.2, p_perm: 0.4 },
      swing_count_eval: { effect_size: -0.1, p_perm: 0.7 },
    }]))))
    await writeFile(path.join(code, "per_permutation_draws.json"), JSON.stringify(Object.fromEntries(ids.map((id) => [id, {
      P: 2000,
      per_stratum_keys: [[1, 1], [2, 1]],
      null_max_run_lengths: Array(2000).fill(1),
      null_swing_counts: Array(2000).fill(2),
    }]))))
    await writeFile(path.join(code, "logistic_regression_results.json"), JSON.stringify(Object.fromEntries(ids.map((id) => [id, {
      n_used: 10,
      full: { beta_sign: 0.3 },
      lrt_full_vs_serving: { p_value: 0.02 },
    }]))))
    assert.equal(await hasMmbenchCoachQuality(root, attempt), true)
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
})

test("hasMmbenchCoachQuality accepts the equivalent wrapped permutation contract", async () => {
  const { mkdir, rm, writeFile } = await import("node:fs/promises")
  const root = path.join(process.env.TEMP ?? ".", `golden-coach-wrapped-${Date.now().toString(36)}`)
  const code = path.join(root, "attempts", "solving", "coach-claim-tests", "001", "code")
  const attempt = { scope: "solving/coach-claim-tests", contextPath: "attempts/solving/coach-claim-tests/001/context.json" }
  const ids = ["match-a", "match-b", "match-c"]
  try {
    await mkdir(code, { recursive: true })
    await writeFile(path.join(code, "config.json"), JSON.stringify({
      n_draws: 2000,
      logistic: { lag_rule: "features are available only through t-1" },
    }))
    await writeFile(path.join(code, "per_match_coach_claim_results.json"), JSON.stringify({
      per_match_results: ids.map((match_id) => ({
        match_id,
        max_run_length_effect_size: 0.2,
        max_run_length_p_value: 0.4,
        swing_count_effect_size: -0.1,
        swing_count_p_value: 0.7,
      })),
    }))
    await writeFile(path.join(code, "per_permutation_draws.json"), JSON.stringify({
      matches: Object.fromEntries(ids.map((id) => [id, {
        n_draws: 2000,
        stratification_keys: ["server", "set"],
        max_run_length_draws: Array(2000).fill(1),
        swing_count_draws: Array(2000).fill(2),
      }])),
    }))
    await writeFile(path.join(code, "logistic_regression_results.json"), JSON.stringify({
      n_obs: 10,
      full_model: { coefficients: { sign_r_lag1: 0.3 } },
      likelihood_ratio_test: { p_value: 0.02 },
    }))
    assert.equal(await hasMmbenchCoachQuality(root, attempt), true)
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
})

test("hasMmbenchCoachQuality accepts the task-required numeric coach CSV", async () => {
  const { mkdir, rm, writeFile } = await import("node:fs/promises")
  const root = path.join(process.env.TEMP ?? ".", `golden-coach-csv-${Date.now().toString(36)}`)
  const code = path.join(root, "attempts", "solving", "coach-claim-tests", "001", "code")
  const attempt = { scope: "solving/coach-claim-tests", contextPath: "attempts/solving/coach-claim-tests/001/context.json" }
  try {
    await mkdir(code, { recursive: true })
    await writeFile(path.join(code, "coach_claim_tests.csv"), [
      "match_id,test_name,statistic,effect_size,p_value,n_points",
      "match-a,wald-wolfowitz,1.2,0.1,0.2,100",
      "match-b,server-null-streak,2.3,-0.2,0.4,120",
    ].join("\n"))
    assert.equal(await hasMmbenchCoachQuality(root, attempt), true)
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
})

test("resumeAttempt skips Actor only when outputs and Compile Evidence are both ready", async () => {
  const { readFile } = await import("node:fs/promises")
  const runner = await readFile(path.join(repositoryRoot, "scripts", "run-golden-case.mjs"), "utf8")
  assert.match(runner, /hasSuccessfulComputeEvidence, isAttemptComplete, planGoldenResume/u, "runner must import resume evidence checks")
  const block = runner.match(/async function resumeAttempt[\s\S]+?\n\}/u)
  assert.ok(block, "resumeAttempt definition is present")
  const body = block[0]

  // Production wiring: expected outputs and Reporting Compile Evidence are checked before Actor.
  assert.match(body, /isAttemptComplete\([^)]*\)/u, "resumeAttempt must call isAttemptComplete")
  assert.match(body, /hasSuccessfulCompileEvidence\([^)]*\)/u, "resumeAttempt must check Reporting Compile Evidence")
  assert.match(body, /hasSuccessfulComputeEvidence\([^)]*\)/u, "resumeAttempt must check Solver Compute Evidence")
  const isAttemptCompleteIndex = body.search(/isAttemptComplete\(/u)
  const evidenceIndex = body.search(/hasSuccessfulCompileEvidence\(/u)
  const actorIndex = body.search(/await actor\(/u)
  assert.ok(actorIndex > isAttemptCompleteIndex, "isAttemptComplete must be checked before actor()")
  assert.ok(actorIndex > evidenceIndex, "Compile Evidence must be checked before actor()")
  assert.match(body, /if \(!complete \|\| needsCompute \|\| needsCompile\)/u, "incomplete or stale Runtime Evidence must resume Actor")
  assert.match(body, /const review = await critic\(/u, "resume flow must call Critic")
  assert.match(body, /const outcome = await gate\(/u, "resume flow must call Gate")
  assert.match(body, /skippedActor/u, "fully ready Candidate must mark that the Actor was skipped")
  assert.match(body, /await stage\(/u, "Gate revise must continue to flow through stage()")
})

test("Solver resume preserves successful Compute Evidence and completes only missing outputs", async () => {
  const { readFile } = await import("node:fs/promises")
  const runner = await readFile(path.join(repositoryRoot, "scripts", "run-golden-case.mjs"), "utf8")
  const block = runner.match(/async function resumeAttempt[\s\S]+?\n\}/u)?.[0] ?? ""
  assert.match(block, /const computeReady = attempt\.role === "solver" &&\s+await hasSuccessfulComputeEvidence[\s\S]+hasMmbenchCoachQuality/u)
  assert.match(block, /computeReady && !complete \? solverFinalizeInstructions/u)
  assert.match(runner, /Compute Evidence is already deterministically validated/u)
  assert.match(runner, /Do not call mm_agent_compute/u)
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
