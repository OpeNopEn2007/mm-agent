#!/usr/bin/env node
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, readdir, rename, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { canonicalizeReviewEvidence, hasMmbenchCoachQuality, hasSuccessfulCompileEvidence, hasSuccessfulComputeEvidence, isAttemptComplete, planGoldenResume } from "./golden-resume.mjs"
import { validateMmbench } from "./mmbench-validate.mjs"

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const fixturesRoot = path.join(repositoryRoot, "tests", "fixtures", "golden")
const args = process.argv.slice(2)
const option = (name) => {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}
const resumeTarget = option("--resume")
const requestedCases = args.filter((arg) => ["minimal", "multi-wave", "mmbench"].includes(arg))
const cases = requestedCases.length ? requestedCases : ["minimal", "multi-wave"]
const model = option("--model")
const variant = option("--variant")
const timeoutMs = Number(option("--timeout-ms") ?? "300000")
const validateConfig = args.includes("--validate-config")
const preflight = args.includes("--preflight")
const providedOutputRoot = option("--output")
const providedPluginEntry = option("--plugin-entry")
const mmbenchProblem = option("--mmbench-problem")
const mmbenchDataset = option("--mmbench-dataset")
const mmbenchProvenance = option("--mmbench-provenance")
const pluginEntry = providedPluginEntry
  ? (path.isAbsolute(providedPluginEntry) || !/^[a-z][a-z0-9+.-]*:/iu.test(providedPluginEntry)
      ? pathToFileURL(path.resolve(providedPluginEntry)).href
      : new URL(providedPluginEntry).href)
  : pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href

if (args.includes("--help")) {
  console.log("Usage: node scripts/run-golden-case.mjs [--validate-config] [--preflight] [minimal] [multi-wave] [mmbench] [--model provider/model] [--variant variant] [--timeout-ms milliseconds] [--output directory] [--resume project-or-trace] [--plugin-entry file-or-url] [--mmbench-problem file --mmbench-dataset file --mmbench-provenance file]")
  process.exit(0)
}
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error("--timeout-ms must be a positive integer")
if (!resumeTarget && cases.includes("mmbench") && !(mmbenchProblem && mmbenchDataset && mmbenchProvenance))
  throw new Error("MM-Bench requires --mmbench-problem, --mmbench-dataset, and --mmbench-provenance; no source material is bundled")

const outputRoot = validateConfig
  ? null
  : providedOutputRoot ?? await mkdtemp(path.join(os.tmpdir(), "mm-agent-golden-"))

const trace = { schema_version: 1, model: model ?? "host-default", variant: variant ?? "host-default", timeout_ms: timeoutMs, plugin_entry: pluginEntry, output_root: outputRoot, cases: [] }
const tracePath = outputRoot ? path.join(outputRoot, "golden-runtime.json") : null
let traceWrite = Promise.resolve()
const saveTrace = () => {
  if (!tracePath) return undefined
  const snapshot = `${JSON.stringify(trace, null, 2)}\n`
  traceWrite = traceWrite.then(async () => {
    const temporary = `${tracePath}.tmp`
    await writeFile(temporary, snapshot)
    await rename(temporary, tracePath)
  })
  return traceWrite
}

function runProcess(executable, commandArgs, cwd, timeout = timeoutMs) {
  return spawnSync(executable, commandArgs, { cwd, encoding: "utf8", timeout, maxBuffer: 32 * 1024 * 1024, env: process.env })
}

function command(executable, commandArgs, cwd, timeout = timeoutMs) {
  const result = runProcess(executable, commandArgs, cwd, timeout)
  if (result.status !== 0) throw new Error(`${executable} ${commandArgs.join(" ")} failed: ${(result.stderr || result.stdout).slice(-4000)}`)
  return result.stdout
}

function openCodeBinary() {
  if (process.env.OPENCODE_BIN) return process.env.OPENCODE_BIN
  const located = spawnSync(process.platform === "win32" ? "where.exe" : "sh", process.platform === "win32" ? ["opencode.cmd"] : ["-c", "command -v opencode"], { encoding: "utf8" })
  if (located.status !== 0) throw new Error("OpenCode was not found; set OPENCODE_BIN")
  if (process.platform !== "win32") return located.stdout.trim()
  const wrapper = located.stdout.split(/\r?\n/u).find(Boolean)
  const binary = path.join(path.dirname(wrapper), "node_modules", "opencode-ai", "bin", "opencode.exe")
  return binary
}

function events(stdout) {
  return stdout.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line))
}

function sanitized(value) {
  return String(value ?? "")
    .replace(/([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*)(\s*[:=]\s*)[^\s,}]+/giu, "$1$2[REDACTED]")
    .slice(0, 4000)
}

function completedTool(run, tool) {
  const event = run.events.find((entry) => entry.type === "tool_use" && entry.part?.tool === tool)
  assert.equal(event?.part?.state?.status, "completed", `${run.label}: ${tool} did not complete`)
  return event
}

function finalJson(value) {
  const text = String(value ?? "").trim().replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "")
  const schema = text.lastIndexOf('"schema_version"')
  const start = schema < 0 ? -1 : text.lastIndexOf("{", schema)
  const end = text.lastIndexOf("}")
  if (start < 0 || end < start) throw new Error(`Critic did not return JSON: ${text.slice(0, 500)}`)
  return JSON.parse(text.slice(start, end + 1))
}

async function mainRun(runCase, label, prompt, timeout = timeoutMs) {
  const commandArgs = ["run", "--format", "json", "--auto", ...(model ? ["--model", model] : []), ...(variant ? ["--variant", variant] : []), prompt]
  const processResult = runProcess(openCodeBinary(), commandArgs, runCase.projectRoot, timeout)
  let parsed = []
  try { parsed = events(processResult.stdout ?? "") } catch (error) { runCase.failures.push({ label, parse_error: sanitized(error), stdout: sanitized(processResult.stdout), stderr: sanitized(processResult.stderr) }) }
  const result = { label, events: parsed }
  runCase.sessions.push(...result.events.map((entry) => entry.sessionID).filter((id) => typeof id === "string"))
  runCase.tool_states.push(...result.events
    .filter((entry) => entry.type === "tool_use")
    .map((entry) => ({
      label,
      session_id: entry.sessionID,
      tool: entry.part?.tool,
      status: entry.part?.state?.status,
      output: sanitized(entry.part?.state?.output),
      error: sanitized(entry.part?.state?.error),
    })))
  if (processResult.status !== 0) {
    runCase.failures.push({
      label,
      timed_out: processResult.error?.code === "ETIMEDOUT",
      exit_code: processResult.status,
      stdout: sanitized(processResult.stdout),
      stderr: sanitized(processResult.stderr),
    })
  }
  await saveTrace()
  if (processResult.status !== 0) throw new Error(`OpenCode ${label} failed; inspect ${tracePath}`)
  return result
}

async function childParts(runCase, taskEvent) {
  const child = taskEvent.part?.state?.metadata?.sessionId
  assert.match(child ?? "", /^ses_/u, "task did not create a child session")
  const exported = JSON.parse(command(openCodeBinary(), ["export", child], runCase.projectRoot))
  const parts = exported.messages?.flatMap((message) => message.parts ?? []) ?? []
  runCase.child_sessions.push(child)
  return { child, parts }
}

let runCaseAction
let pluginEntryLoaded
async function runInternalCaseAction(runCase, input) {
  // Golden is development-only: load the selected Plugin entry for parity, then
  // call the Core adapter directly without recreating a public Tool definition.
  pluginEntryLoaded ??= import(pluginEntry)
  await pluginEntryLoaded
  runCaseAction ??= (await import("../dist/tools/case.js")).runCaseAction
  return runCaseAction(runCase.projectRoot, input)
}

async function dispatch(runCase, role, goal, taskId) {
  const label = `dispatch-${role}${taskId ? `-${taskId}` : ""}`
  const inspectOutput = await runInternalCaseAction(runCase, { action: "inspect", caseId: runCase.caseId })
  const baseRevision = inspectOutput.state?.revision
  assert.ok(Number.isSafeInteger(baseRevision), `${label}: inspection must return an integer state revision`)

  const output = await runInternalCaseAction(runCase, {
    action: "dispatch",
    caseId: runCase.caseId,
    role,
    ...(taskId ? { taskId } : {}),
    baseRevision,
    goal,
  })
  runCase.tool_states.push({ label, session_id: "deterministic-runner", tool: "runCaseAction", status: "completed", output: sanitized(JSON.stringify(output)), error: "" })
  await saveTrace()
  assert.match(output.contextPath ?? "", /^attempts\//u)
  return output
}

function writerWorkDir(contextPath) {
  const normalized = String(contextPath ?? "").replaceAll("\\", "/")
  const match = normalized.match(/^(attempts\/reporting\/\d{3})\/context\.json$/u)
  if (!match) throw new Error(`writer context.json must live under attempts/reporting/<NNN>/context.json: ${contextPath}`)
  return match[1]
}

function writerAttemptBase(contextPath) {
  const normalized = String(contextPath ?? "").replaceAll("\\", "/")
  const match = normalized.match(/^(attempts\/(?:analysis|modeling|reporting|solving\/[a-z0-9][a-z0-9-]{0,63})\/\d{3})\/context\.json$/u)
  if (!match) throw new Error(`context.json must live under attempts/<scope>/<NNN>/context.json: ${contextPath}`)
  return match[1]
}

function rebaseAttemptPath(text, fromBase, toBase) {
  if (typeof text !== "string" || !text || !fromBase || !toBase || fromBase === toBase) return text
  const escaped = fromBase.replace(/[\\^$.*+?()|[\]{}]/gu, "\\$&")
  return text.replace(new RegExp(`\\b${escaped}(/[^\\s]*)?`, "gu"), (_match, tail = "") => `${toBase}${tail}`)
}

function rebaseRequiredFixes(fixes, fromBase, toBase) {
  if (!Array.isArray(fixes) || !fromBase || !toBase || fromBase === toBase) return fixes ?? []
  return fixes.map((entry) => rebaseAttemptPath(String(entry), fromBase, toBase))
}

function actorToolAllowlist(role) {
  switch (role) {
    case "analyst": return { allow: [], forbid: "any" }
    case "modeler": return { allow: ["mm_agent_hmml"], forbid: ["mm_agent_compute", "mm_agent_compile", "mm_agent_flow"] }
    case "solver": return { allow: ["mm_agent_compute"], forbid: ["mm_agent_hmml", "mm_agent_compile", "mm_agent_flow"] }
    case "writer": return { allow: ["mm_agent_compile"], forbid: ["mm_agent_hmml", "mm_agent_compute", "mm_agent_flow"] }
    default: throw new Error(`unknown actor role: ${role}`)
  }
}

function actorChildInstructions(role, caseId, contextPath, instructions) {
  const allowlist = actorToolAllowlist(role)
  const diskContextPath = `runs/${caseId}/${contextPath}`
  const caseRoot = `runs/${caseId}/`
  const allowClause = allowlist.forbid === "any"
    ? "The child must not call any mm_agent Tool, including mm_agent_hmml, mm_agent_compute, mm_agent_compile, or mm_agent_flow; ordinary filesystem tools remain available for Manifest work."
    : `Among mm_agent Tools, the child may call only ${allowlist.allow.join(" and ")} and must not call ${allowlist.forbid.join(", ")}; it must not call any other mm_agent Tool. Ordinary filesystem read, write, and shell tools remain available for Manifest work.`
  const roleClause = role === "writer"
    ? ` The child must write only this Manifest's expected outputs and call mm_agent_compile using the Case-root-relative contract below; it may retry while repairing the current Candidate, must preserve every Evidence record, and must finish on successful Compile Evidence.`
    : ` The child must write only this Manifest's expected outputs.`
  const guardClause = ` The child must never call mm_agent_flow, must never call Gate, must never call built-in task, must never nest delegation, and must never call any mm_agent Tool outside its role allowlist.`
  return `${actorDispatchContract(role, diskContextPath)} The Case root is exactly ${caseRoot}; resolve every Manifest path p as ${caseRoot} + p, never relative to the context.json directory or the project root. ${allowClause}${roleClause}${guardClause} ${instructions} Reply exactly ACTOR_DONE.`
}

async function actor(runCase, role, contextPath, instructions) {
  const agent = { analyst: "mm-analyst", modeler: "mm-modeler", solver: "mm-solver", writer: "mm-writer" }[role]
  const run = await mainRun(runCase, `actor-${role}`, actorChildInstructions(role, runCase.caseId, contextPath, instructions))
  const task = completedTool(run, "task")
  assert.equal(task.part.state.input?.subagent_type, agent)
  const child = await childParts(runCase, task)
  return child
}

async function assertAttemptComplete(runCase, attemptId, manifest, contextPath = manifest.contextPath) {
  const caseRoot = path.join(runCase.projectRoot, "runs", runCase.caseId)
  assert.equal(await isAttemptComplete(caseRoot, manifest), true, `${attemptId} Actor returned before every Manifest expected output existed`)
  if (manifest.role === "solver")
    assert.equal(await hasSuccessfulComputeEvidence(caseRoot, manifest), true, `${attemptId} Actor returned without successful Compute Evidence`)
  if (manifest.role === "solver")
    assert.equal(await hasMmbenchCoachQuality(caseRoot, { ...manifest, contextPath }), true, `${attemptId} Actor returned invalid MM-Bench coach statistics`)
  if (manifest.role === "writer")
    assert.equal(await hasSuccessfulCompileEvidence(caseRoot, manifest), true, `${attemptId} Actor returned without successful Compile Evidence`)
}

async function assertMmbenchReportingQuality(runCase, contextPath) {
  if (runCase.kind !== "mmbench-2024-c" || !contextPath.startsWith("attempts/reporting/")) return
  const attemptRoot = path.join(runCase.projectRoot, "runs", runCase.caseId, path.dirname(contextPath))
  const [mainTex, outline, compileLog, evidenceFiles] = await Promise.all([
    readFile(path.join(attemptRoot, "main.tex"), "utf8"),
    readFile(path.join(attemptRoot, "outline.md"), "utf8"),
    readFile(path.join(attemptRoot, "compile.log"), "utf8"),
    readdir(path.join(attemptRoot, "evidence")),
  ])
  const incomplete = /\b(?:placeholder|not rendered|not executed|not run|next compute|future compute)\b/iu
  assert.doesNotMatch(`${outline}\n${mainTex}`, incomplete, "MM-Bench report defers a required deliverable")
  assert.ok((mainTex.match(/\\begin\{figure\}/gu) ?? []).length >= 3, "MM-Bench report must render at least three match-flow figures")
  const severe = [...compileLog.matchAll(/Overfull \\hbox \(([0-9.]+)pt too wide\)/gu)].map((match) => Number(match[1])).filter((value) => value > 20)
  assert.deepEqual(severe, [], `MM-Bench report has severe page overflow: ${severe.join(", ")} pt`)
  const compileRefs = evidenceFiles.filter((name) => /^compile-\d{3}\.json$/u.test(name)).sort()
  assert.ok(compileRefs.length > 0, "Writer must create Compile Evidence")
  const compileResults = await Promise.all(compileRefs.map(async (name) => JSON.parse(await readFile(path.join(attemptRoot, "evidence", name), "utf8"))))
  assert.equal(compileResults.at(-1)?.status, "succeeded", "Writer's final Compile Evidence must succeed")
  assert.equal(compileResults.at(-1)?.exit_code, 0, "Writer's final Compile Evidence must exit zero")
}

async function critic(runCase, contextPath) {
  const diskContextPath = `runs/${runCase.caseId}/${contextPath}`
  const run = await mainRun(runCase, "critic", `Make exactly one built-in task call. Its subagent_type field MUST be literal mm-critic, never general or any other value. Tell that Critic to read ${diskContextPath}, all declared candidates and the declared rubric, then return one bare Review JSON containing every required field: schema_version, attempt_id, verdict, findings, required_fixes, evidence, and reviewed_at. reviewed_at must be a UTC RFC 3339 string. The Review must be strict JSON: use forward slashes in paths, never copy raw TeX commands into JSON strings, and escape every backslash that remains. Paths declared inside context.json are Case-root-relative: prefix runs/${runCase.caseId}/ only when reading them from disk. For large immutable inputs, verify only candidate claims that need a source spot-check; never exhaustively scan or enumerate the dataset. Every Review evidence path must remain Case-root-relative exactly as written in context.json, such as attempts/... or input/...; never prefix runs/${runCase.caseId}/ in Review JSON. Do not call any mm_agent Tool yourself. Reply exactly CRITIC_DONE.`)
  const task = completedTool(run, "task")
  assert.equal(task.part.state.input?.subagent_type, "mm-critic")
  const child = await childParts(runCase, task)
  assert.equal(child.parts.some((part) => part.type === "tool" && ["edit", "mm_agent_flow", "task"].includes(part.tool)), false, "Critic exceeded read-only boundary")
  const review = canonicalizeReviewEvidence(finalJson(task.part.state.output), runCase.caseId)
  if (review.verdict === "pass") await assertMmbenchReportingQuality(runCase, contextPath)
  return review
}

async function gate(runCase, attemptId, review) {
  const inspectOutput = await runInternalCaseAction(runCase, { action: "inspect", caseId: runCase.caseId })
  const expectedRevision = inspectOutput.state?.revision
  assert.ok(Number.isSafeInteger(expectedRevision), "Gate inspection must return an integer state revision")

  const gateOutput = await runInternalCaseAction(runCase, {
    action: "gate",
    caseId: runCase.caseId,
    attemptId,
    review,
    expectedRevision,
  })
  runCase.tool_states.push({ label: "gate-submit", session_id: "deterministic-runner", tool: "runCaseAction", status: "completed", output: sanitized(JSON.stringify(gateOutput)), error: "" })
  await saveTrace()
  return gateOutput.outcome
}

function buildStageActorInstructions(baseInstructions, currentAttemptBase, pendingRevision) {
  if (!pendingRevision) return baseInstructions
  if (pendingRevision && (!pendingRevision.previousAttemptBase || !currentAttemptBase)) {
    throw new Error("revision requires both previousAttemptBase and currentAttemptBase; refusing to assemble a prompt")
  }
  const rebased = rebaseRequiredFixes(pendingRevision.requiredFixes, pendingRevision.previousAttemptBase, currentAttemptBase)
  const hasFixes = Array.isArray(rebased) && rebased.length > 0
  const rewriteClause = ` Rewrite every path from ${pendingRevision.previousAttemptBase} to ${currentAttemptBase}; do not write under ${pendingRevision.previousAttemptBase}.`
  const fixClause = hasFixes
    ? ` Address every Critic required fix rewritten to this Attempt (${currentAttemptBase}): ${JSON.stringify(rebased)}.`
    : ` Address the Critic revision; all required fixes were already satisfied by the new Attempt base.`
  return `${baseInstructions}${fixClause}${rewriteClause}`
}

async function stage(runCase, role, goal, instructions, taskId) {
  // pendingRevision carries the previous Attempt base and the raw Critic required_fixes.
  // We defer the path rewrite until the next dispatch lands, so the rebase targets the
  // current Attempt base rather than the one Gate just inspected.
  let pendingRevision = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const dispatched = await dispatch(runCase, role, goal, taskId)
    const currentAttemptBase = writerAttemptBase(dispatched.contextPath)
    const base = typeof instructions === "function" ? instructions(dispatched.contextPath) : instructions
    const actorInstructions = buildStageActorInstructions(base, currentAttemptBase, pendingRevision)
    const actorSession = await actor(runCase, role, dispatched.contextPath, actorInstructions)
    await assertAttemptComplete(runCase, dispatched.attemptId, dispatched.manifest, dispatched.contextPath)
    const review = await critic(runCase, dispatched.contextPath)
    assert.equal(review.attempt_id, dispatched.attemptId)
    const outcome = await gate(runCase, dispatched.attemptId, review)
    if (outcome === "pass") return { dispatched, actorSession }
    if (outcome !== "revise") throw new Error(`${role} ${dispatched.attemptId} was blocked`)
    pendingRevision = {
      previousAttemptBase: currentAttemptBase,
      requiredFixes: Array.isArray(review.required_fixes) ? review.required_fixes.slice() : [],
    }
  }
  throw new Error(`${role} exhausted its revision budget`)
}

async function prepare(runCase, sourcePath) {
  const files = sourcePath.map((item) => JSON.stringify(path.basename(item))).join(", ")
  const run = await mainRun(runCase, "prepare", `Call mm_agent_prepare exactly once with case_id ${runCase.caseId} and explicit_paths [${files}]. Do not call any other Tool. Reply exactly PREPARE_DONE.`)
  const output = JSON.parse(completedTool(run, "mm_agent_prepare").part.state.output)
  assert.equal(output.ok, true)
}

async function inspectCompletion(runCase) {
  const snapshot = await runInternalCaseAction(runCase, { action: "inspect", caseId: runCase.caseId })
  assert.equal(snapshot.state.status, "completed")
  assert.equal(snapshot.completion?.complete, true)
  return snapshot
}

async function runGolden(kind, source, taskSpec) {
  const projectRoot = path.join(outputRoot, kind, "project")
  await mkdir(projectRoot, { recursive: true })
  const sourcePaths = []
  for (const item of source) {
    const target = path.join(projectRoot, path.basename(item))
    await cp(item, target)
    sourcePaths.push(target)
  }
  await writeFile(path.join(projectRoot, "opencode.json"), `${JSON.stringify({ plugin: [pluginEntry] }, null, 2)}\n`)
  command("git", ["init"], projectRoot)
  const runCase = { kind, caseId: `golden-${kind}-${Date.now().toString(36)}`, projectRoot, sessions: [], child_sessions: [], tool_states: [], failures: [] }
  trace.cases.push(runCase)
  await saveTrace()
  await prepare(runCase, sourcePaths)
  await stage(runCase, "analyst", "Analyze the supplied Golden Case.", taskSpec.analysis)
  await stage(runCase, "modeler", "Create the modeling scheme and retrieve method evidence.", taskSpec.modeling)

  const waveAttempts = []
  const caseRoot = path.join(projectRoot, "runs", runCase.caseId)
  const derivedWaves = taskSpec.waves ?? Object.values(JSON.parse(await readFile(path.join(caseRoot, "artifacts", "task-graph.json"))).tasks
    .reduce((waves, task) => {
      waves[task.wave] ??= []
      waves[task.wave].push({
        id: task.id,
        wave: task.wave,
        depends_on: task.depends_on,
        goal: `Solve ${task.id} from the accepted task description.`,
        instructions: (contextPath) => `Read only the Manifest declared task, model, and direct dependency memory. Fully execute the current task description now: do not leave requested calculations, tests, metrics, figures, or tables as designs, placeholders, or future work. Write reproducible solve.py and result files; call mm_agent_compute as needed to repair the current Candidate while preserving every Evidence record, and finish with execution-result.json referencing the final successful run; then write a complete Task Memory. ${canonicalTaskMemoryFields} ${solverComputeContract(contextPath)}`,
      })
      return waves
    }, {})).sort((left, right) => left[0].wave - right[0].wave)
  for (const wave of derivedWaves) {
    let pending = wave.slice()
    while (pending.length > 0) {
      const state = JSON.parse(await readFile(path.join(caseRoot, "state.json"), "utf8"))
      const accepted = new Set(state.accepted_artifacts.map((artifact) => artifact.path))
      const ready = pending.filter((task) => (task.depends_on ?? []).every((dependency) => accepted.has(`tasks/${dependency}/memory.json`)))
      assert.ok(ready.length > 0, `wave ${state.current_wave} has no dispatchable task; dependencies must be accepted first`)
      const dispatched = await Promise.all(ready.map((task) => dispatch(runCase, "solver", task.goal, task.id)))
      const actors = await Promise.all(dispatched.map((item, index) => actor(runCase, "solver", item.contextPath, resolveInstructionsForAttempt(ready[index].instructions, item.contextPath))))
      await Promise.all(dispatched.map((item) => assertAttemptComplete(runCase, item.attemptId, item.manifest, item.contextPath)))
      const reviews = await Promise.all(dispatched.map((item) => critic(runCase, item.contextPath)))
      const acceptedActors = []
      for (const [index, item] of dispatched.entries()) {
        assert.equal(reviews[index].attempt_id, item.attemptId)
        const outcome = await gate(runCase, item.attemptId, reviews[index])
        if (outcome === "pass") acceptedActors.push(actors[index])
        else if (outcome === "revise") acceptedActors.push((await stage(runCase, "solver", ready[index].goal, ready[index].instructions, ready[index].id)).actorSession)
        else throw new Error(`solver ${item.attemptId} was blocked`)
      }
      waveAttempts.push({ dispatched, actors: acceptedActors })
      const completed = new Set(ready.map((task) => task.id))
      pending = pending.filter((task) => !completed.has(task.id))
    }
  }

  for (const actorResult of waveAttempts.flatMap((wave) => wave.actors)) {
    const parts = actorResult.parts
    assert.equal(parts.some((part) => part.type === "tool" && part.tool === "mm_agent_compute"), true, "Solver did not invoke real Compute")
  }
  const reportStage = await stage(runCase, "writer", "Write and compile the final report.", taskSpec.reporting)
  const reportActor = reportStage.actorSession.child
  const reportExport = JSON.parse(command(openCodeBinary(), ["export", reportActor], projectRoot))
  const reportParts = reportExport.messages?.flatMap((message) => message.parts ?? []) ?? []
  assert.equal(reportParts.some((part) => part.type === "tool" && part.tool === "mm_agent_compile"), true, "Writer did not invoke real Compile")
  const snapshot = await inspectCompletion(runCase)
  const report = path.join(projectRoot, "runs", runCase.caseId, "report")
  for (const name of ["main.tex", "compile.log", "report.pdf"]) await readFile(path.join(report, name))
  assert.ok((await readFile(path.join(report, "report.pdf"))).byteLength > 0)
  return { runCase, snapshot }
}

const canonicalTaskMemoryFields = "memory.json must match the Canonical TaskMemory schema: { schema_version: 1, task_id (string), task_description (string), modeling_method (string), result_interpretation (string), execution_result (relative path string under the Attempt), code_outputs (array of relative paths), figures (array of relative paths) }. Use these exact field names."

function solverAttemptBase(contextPath) {
  const normalized = String(contextPath ?? "").replaceAll("\\", "/")
  const match = normalized.match(/^(attempts\/solving\/[^/]+\/\d{3})\/context\.json$/u)
  if (!match) throw new Error("Solver contextPath must be attempts/solving/<task-id>/<NNN>/context.json")
  return match[1]
}

const solverComputeContract = (contextPath) => {
  const attemptBase = solverAttemptBase(contextPath)
  const workDir = `${attemptBase}/code`
  return `Compute contract (mandatory): mm_agent_compute.case_id is the current Case id from context.json; work_dir must be the literal string "${workDir}"; entry_script must be the literal string "solve.py"; input_paths must use only Case-root-relative required_reads[].path values from context.json; output_paths must include every regular Candidate file under "${workDir}" needed to reproduce the result (entry script, imported source modules, result files, and generated figure mirrors; exclude __pycache__ and .pyc). Never pass an absolute path. execution-result.json must be written only by mm_agent_compute; never create or overwrite it directly. memory.json execution_result must be "${attemptBase}/execution-result.json", and every code_outputs entry must start with "${workDir}/".`
}

const writerCompileContract = (contextPath) => {
  const workDir = writerWorkDir(contextPath)
  return `Reporting Compile contract (mandatory): mm_agent_compile.case_id is the current Case id; mm_agent_compile.work_dir must be the literal string "${workDir}" (the directory containing this Manifest's context.json, relative to the Case root). Never pass an absolute path, a host system path, or any other reporting Attempt directory. main_tex must be the literal string main.tex. Write only Manifest expected outputs under ${workDir}; mm_agent_compile retries may repair only the current Candidate, must preserve every Evidence record, and must finish on successful Compile Evidence. Do not call mm_agent_flow, do not call Gate, do not dispatch another Attempt, do not compile inside a sibling or earlier reporting Attempt, do not delegate.`
}

const resumeInstructions = {
  analyst: "Create every expected Analysis candidate from the immutable input.",
  modeler: "Call mm_agent_hmml once for every retrieval candidate, then create the modeling scheme.",
  solver: (contextPath) => `Read only declared direct dependencies and inspect the current Attempt's existing expected outputs first. Treat NaN requested statistics, non-converged requested models, blank requested figures, unavailable-dependency fallbacks, or Compute Evidence for any entry script other than solve.py as incomplete: repair with the available runtime, validate parameter packing and reported diagnostics, then call mm_agent_compute for solve.py. Otherwise preserve valid existing Compute Evidence and only create missing expected outputs. Preserve every Evidence record and finish with execution-result.json referencing the final successful solve.py run. Write a complete Task Memory. ${canonicalTaskMemoryFields} ${solverComputeContract(contextPath)}`,
  writer: (contextPath) => `Use accepted artifacts only. Create report candidates under the current Attempt directory and call mm_agent_compile as needed to repair the current Candidate, preserving all Evidence and finishing on a successful run. ${writerCompileContract(contextPath)}`,
}

const solverFinalizeInstructions = (contextPath) => `Compute Evidence is already deterministically validated for this Attempt. Do not call mm_agent_compute and do not modify code, figures, execution-result.json, or Evidence. Read the existing outputs only as needed, then write the missing memory.json and stop. ${canonicalTaskMemoryFields} ${solverComputeContract(contextPath)}`

const actorDispatchContract = (role, contextPath) => `Use built-in task exactly once with subagent_type mm-${role}. Tell that child to read ${contextPath}, create every Manifest expected output only, and follow these case-specific requirements:`

const minimalSpec = {
  analysis: "Write exactly one computational task task-01 with a wave-1 empty dependency list.",
  modeling: "Call mm_agent_hmml exactly once for the Manifest retrieved-methods candidate. Use a simple multiplication model with explicit variables and formula. Include named sections for Method Choice (justify direct multiplication and reject retrieved methods as unsuitable), Applicability Limits, Validation Strategy, Assumptions, and task-level Solve Requirements.",
  waves: [[{ id: "task-01", goal: "Compute the required labels.", instructions: (contextPath) => `Write solve.py that computes 12 * 3 and writes answer.txt. Call mm_agent_compute exactly once for solve.py with answer.txt as an output. ${canonicalTaskMemoryFields} ${solverComputeContract(contextPath)}` }]],
  reporting: (contextPath) => `Use accepted artifacts only. Write outline.md, notation.md, and a minimal XeLaTeX main.tex. ${writerCompileContract(contextPath)}`,
}
const multiWaveSpec = {
  analysis: "Write exactly three computational tasks task-a, task-b, task-total. The graph must have task-a and task-b at wave 1 with no dependencies, and task-total at wave 2 depending on both task-a and task-b.",
  modeling: "Call mm_agent_hmml once for each Manifest retrieved-methods candidate. Define explicit arithmetic models for task-a, task-b, and task-total. Include named sections for Method Choice, Applicability Limits, Validation Strategy, Assumptions, and task-level Solve Requirements; justify direct arithmetic and reject unsuitable retrieved methods.",
  waves: [
    [
      { id: "task-a", goal: "Compute channel A tickets.", instructions: (contextPath) => `Write solve.py that computes 12 * 2 and writes answer.txt. Call mm_agent_compute exactly once. ${canonicalTaskMemoryFields} ${solverComputeContract(contextPath)}` },
      { id: "task-b", goal: "Compute channel B tickets.", instructions: (contextPath) => `Write solve.py that computes 18 * 2 and writes answer.txt. Call mm_agent_compute exactly once. ${canonicalTaskMemoryFields} ${solverComputeContract(contextPath)}` },
    ],
    [{ id: "task-total", goal: "Compute the requested total from the direct dependency.", instructions: (contextPath) => `Read only the declared direct dependency Task Memory. Write solve.py that computes the documented total and writes answer.txt. Call mm_agent_compute exactly once. ${canonicalTaskMemoryFields} ${solverComputeContract(contextPath)}` }],
  ],
  reporting: (contextPath) => `Use accepted artifacts only. Write outline.md, notation.md, and a minimal XeLaTeX main.tex. ${writerCompileContract(contextPath)}`,
}

if (args.includes("--validate-config")) {
  console.log(JSON.stringify({
    ok: true,
    mode: "validate-config",
    canonical_task_memory_fields: ["schema_version", "task_id", "task_description", "modeling_method", "result_interpretation", "execution_result", "code_outputs", "figures"],
    canonical_contract: canonicalTaskMemoryFields,
    resume_instructions: Object.keys(resumeInstructions),
    specs: { minimal: minimalSpec.waves.length, "multi-wave": multiWaveSpec.waves.length },
    tasks: {
      minimal: minimalSpec.waves.flat().map((task) => task.id),
      "multi-wave": multiWaveSpec.waves.flat().map((task) => task.id),
    },
  }, null, 2))
  process.exit(0)
}

if (preflight) {
  await saveTrace()
  console.log(JSON.stringify({
    ok: true,
    mode: "preflight",
    timeout_ms: timeoutMs,
    output_root: outputRoot,
    trace_path: tracePath,
    case_root_template: "runs/<case-id>/state.json",
    models: { model: model ?? "host-default", variant: variant ?? "host-default" },
  }, null, 2))
  process.exit(0)
}

async function isFile(target) {
  return stat(target).then((info) => info.isFile()).catch(() => false)
}

async function loadResume(target) {
  const targetInfo = await stat(target)
  let projectRoot = target
  let caseId
  if (targetInfo.isFile()) {
    const previous = JSON.parse(await readFile(target, "utf8"))
    const last = previous.cases?.at(-1)
    if (!last?.projectRoot || !last?.caseId) throw new Error("resume trace has no Case project")
    projectRoot = last.projectRoot
    caseId = last.caseId
  }
  const runs = path.join(projectRoot, "runs")
  if (!caseId) {
    const cases = (await readdir(runs, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    if (cases.length !== 1) throw new Error("resume project must contain exactly one Case")
    caseId = cases[0]
  }
  const caseRoot = path.join(runs, caseId)
  const state = JSON.parse(await readFile(path.join(caseRoot, "state.json"), "utf8"))
  const taskGraph = JSON.parse(await readFile(path.join(caseRoot, "artifacts", "task-graph.json"), "utf8").catch(() => '{"tasks":[]}'))
  const contexts = (await readdir(path.join(caseRoot, "attempts"), { recursive: true })).filter((entry) => entry.replaceAll("\\", "/").endsWith("context.json"))
  const activeAttempts = []
  for (const relative of contexts) {
    const contextPath = path.join(caseRoot, "attempts", relative)
    if (await isFile(path.join(path.dirname(contextPath), "review.json"))) continue
    const manifest = JSON.parse(await readFile(contextPath, "utf8"))
    activeAttempts.push({ ...manifest, contextPath: path.relative(caseRoot, contextPath).replaceAll("\\", "/") })
  }
  return { projectRoot, caseId, caseRoot, state, taskGraph, activeAttempts }
}

async function resumeAttempt(runCase, attempt) {
  const caseRoot = path.join(runCase.projectRoot, "runs", runCase.caseId)
  const complete = await isAttemptComplete(caseRoot, attempt)
  const computeReady = attempt.role === "solver" &&
    await hasSuccessfulComputeEvidence(caseRoot, attempt) &&
    await hasMmbenchCoachQuality(caseRoot, attempt)
  const needsCompute = complete && attempt.role === "solver" && !computeReady
  const needsCompile = complete && attempt.role === "writer" && !(await hasSuccessfulCompileEvidence(caseRoot, attempt))
  if (!complete || needsCompute || needsCompile) {
    let instructions = resolveInstructionsForAttempt(
      computeReady && !complete ? solverFinalizeInstructions : resumeInstructionsForRole(attempt.role),
      attempt.contextPath,
    )
    if (attempt.current_task?.id === "synthesize-results" && !computeReady) {
      const workDir = `${solverAttemptBase(attempt.contextPath)}/code`
      instructions = `${instructions} The latest Compute Evidence is incomplete. Call mm_agent_compute with case_id "${runCase.caseId}", work_dir "${workDir}", entry_script "solve.py", input_paths exactly ["artifacts/modeling-scheme.md","tasks/momentum-flow/memory.json","tasks/coach-claim-tests/memory.json","tasks/swing-prediction/memory.json"], and output_paths exactly ["${workDir}/__init__.py","${workDir}/solve.py","${workDir}/verify_and_summarize.py","${workDir}/synthesis_verification.json","${workDir}/evidence_table.json","${workDir}/coaching_advisory.json","${workDir}/reporting_summary.md","${workDir}/synthesis_status.json"]. Only entry_script is relative to work_dir; every input_paths and output_paths item is relative to the Case root and must retain the shown prefix. Do not return until execution-result.json references that successful complete Evidence.`
    }
    if (attempt.current_task?.id === "coach-claim-tests" && !computeReady)
      instructions = `${instructions} Read latest_review from context.json when present and implement every required fix. The task requires coach_claim_tests.csv with the exact header match_id,test_name,statistic,effect_size,p_value,n_points, at least two matches, and finite numeric values. Execute the requested residual runs tests, consecutive point_victor=1 streak test against a server-only null, lag-1 autocorrelation, game-block sensitivity, and adjusted p-values; do not replace them with a logistic-only shortcut. Before the final mm_agent_compute call, include every regular file that remains in the current code directory in output_paths so the latest Evidence hashes the complete Candidate.`
    const actorSession = await actor(runCase, attempt.role, attempt.contextPath, instructions)
    await assertAttemptComplete(runCase, attempt.attempt_id, attempt)
    const review = await critic(runCase, attempt.contextPath)
    const outcome = await gate(runCase, attempt.attempt_id, review)
    if (outcome === "pass") return actorSession
    if (outcome !== "revise") throw new Error(`${attempt.attempt_id} was blocked`)
    return (await stage(runCase, attempt.role, attempt.goal, instructions, attempt.current_task?.id)).actorSession
  }
  const review = await critic(runCase, attempt.contextPath)
  const outcome = await gate(runCase, attempt.attempt_id, review)
  if (outcome === "pass") return { skippedActor: true, attemptId: attempt.attempt_id, contextPath: attempt.contextPath }
  if (outcome !== "revise") throw new Error(`${attempt.attempt_id} was blocked`)
  const instructions = resumeInstructionsForRole(attempt.role)
  return (await stage(runCase, attempt.role, attempt.goal, instructions, attempt.current_task?.id)).actorSession
}

function resumeInstructionsForRole(role) {
  return resumeInstructions[role]
}

function resolveInstructionsForAttempt(instructions, contextPath) {
  return typeof instructions === "function" ? instructions(contextPath) : instructions
}

async function resumeGolden(target) {
  const initial = await loadResume(target)
  if (providedPluginEntry)
    await writeFile(path.join(initial.projectRoot, "opencode.json"), `${JSON.stringify({ plugin: [pluginEntry] }, null, 2)}\n`)
  const runCase = { kind: "resumed", caseId: initial.caseId, projectRoot: initial.projectRoot, sessions: [], child_sessions: [], tool_states: [], failures: [] }
  trace.cases.push(runCase)
  await saveTrace()
  // Re-read disk facts through the development-only Core adapter before planning recovery.
  await runInternalCaseAction(runCase, { action: "inspect", caseId: runCase.caseId })
  for (;;) {
    const current = await loadResume(runCase.projectRoot)
    const plan = planGoldenResume(current)
    if (plan.action === "inspect-completion") return inspectCompletion(runCase)
    if (plan.action === "resume-attempt") await resumeAttempt(runCase, plan.attempt)
    else if (plan.action === "dispatch") await stage(runCase, plan.role, `Resume ${plan.role}.`, resumeInstructionsForRole(plan.role), plan.task_id)
    else {
      for (const task of plan.tasks) {
        if (task.action === "resume-attempt") await resumeAttempt(runCase, task.attempt)
        else await stage(runCase, "solver", `Resume ${task.task_id}.`, resumeInstructionsForRole("solver"), task.task_id)
      }
    }
  }
}

try {
  if (!process.env.npm_execpath) throw new Error("run through npm so npm_execpath is available")
  if (!providedPluginEntry) command(process.execPath, [process.env.npm_execpath, "run", "build"], repositoryRoot)
  if (resumeTarget) await resumeGolden(resumeTarget)
  else {
    if (cases.includes("minimal")) await runGolden("minimal", [path.join(fixturesRoot, "minimal", "problem.md")], minimalSpec)
    if (cases.includes("multi-wave")) {
      const completed = await runGolden("multi-wave", [path.join(fixturesRoot, "multi-wave", "problem.md")], multiWaveSpec)
      const caseRoot = path.join(completed.runCase.projectRoot, "runs", completed.runCase.caseId)
      const totalManifest = JSON.parse(await readFile(path.join(caseRoot, "attempts", "solving", "task-total", "001", "context.json")))
      assert.deepEqual(totalManifest.required_reads.filter((item) => item.kind === "dependency").map((item) => item.path), ["tasks/task-a/memory.json", "tasks/task-b/memory.json"])
    }
    if (cases.includes("mmbench")) {
      const mmbench = await validateMmbench({ problemPath: mmbenchProblem, datasetPath: mmbenchDataset, provenancePath: mmbenchProvenance })
      await runGolden("mmbench-2024-c", mmbench, {
        analysis: "Analyze the supplied authorized MM-Bench source, including provenance and the dataset description, without fabricating source facts. Write exactly five requires_computation:true tasks and this exact dependency/wave structure: ingest-audit wave 1 with no dependencies; momentum-flow wave 2 depending on ingest-audit; coach-claim-tests wave 3 depending on momentum-flow; swing-prediction wave 3 depending on momentum-flow; synthesize-results wave 4 depending on momentum-flow, coach-claim-tests, and swing-prediction. Task descriptions must require executable results now: ingest-audit performs all data checks and calculates the match count; momentum-flow computes the focal-match momentum curve and renders at least three non-empty match-flow figures; coach-claim-tests executes all coach-claim tests requested by the problem with numeric statistics/effect sizes/p-values; swing-prediction trains and evaluates the predictor on held-out matches with numeric metrics; synthesize-results verifies and summarizes these actual outputs for Reporting. Designs, placeholders, and future-work promises are forbidden. The CSV has 7,284 data records plus one header and 46 columns; distinguish those counts. Do not calculate or state a match count during Analysis; ingest-audit must calculate it. For swing prediction, use one explicit row-index cutoff: features through row t predict an outcome beginning at row t+1, never use target-row serve_no or other in-point information, and keep the same cutoff in every task. In regular tennis games the server stays fixed for the game and alternates between games; tiebreak service follows its separate one-point-then-two-point sequence. Require data-quality checks for row order, one-row-per-point, player orientation, and those server rules. Any predictive serving baseline must be trained only on training matches in each validation fold or use an expanding estimate through row t; reserve full-match baselines for retrospective visualization only.",
        modeling: "Call mm_agent_hmml once for each Manifest retrieved-methods candidate. Define explicit methods, variables, assumptions, equations, applicability limits, validation strategy, method choice/rejection rationale, and task-level solve requirements.",
        reporting: (contextPath) => `Use accepted artifacts only. Include the actual match-flow figures, coach-claim statistics/p-values, and held-out prediction metrics required by the problem; placeholders, unrendered figures, unexecuted tests, and future-compute deferrals are forbidden. Verify every per-fold comparison against the accepted per-fold table: distinguish aggregate means from fold-level wins, ties, and exceptions, and never infer per-fold dominance from aggregate dominance. Before the single Compile call, wrap or split long equations and inspect main.tex so compile.log has no overfull box wider than 20 pt and the final pass has no unresolved references. Write outline.md, notation.md, and a compilable XeLaTeX main.tex. ${writerCompileContract(contextPath)}`,
      })
    }
  }
  await saveTrace()
  console.log(JSON.stringify({ ok: true, output_root: outputRoot, trace: tracePath }, null, 2))
} catch (error) {
  trace.error = String(error.stack ?? error)
  await saveTrace()
  console.error(JSON.stringify({ ok: false, output_root: outputRoot, trace: tracePath, error: String(error.message ?? error) }, null, 2))
  process.exitCode = 1
}
