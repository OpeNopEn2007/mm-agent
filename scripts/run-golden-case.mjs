#!/usr/bin/env node
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { hasSuccessfulCompileEvidence, isAttemptComplete, planGoldenResume } from "./golden-resume.mjs"
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
const mmbenchProblem = option("--mmbench-problem")
const mmbenchDataset = option("--mmbench-dataset")
const mmbenchProvenance = option("--mmbench-provenance")

if (args.includes("--help")) {
  console.log("Usage: node scripts/run-golden-case.mjs [--validate-config] [--preflight] [minimal] [multi-wave] [mmbench] [--model provider/model] [--variant variant] [--timeout-ms milliseconds] [--output directory] [--resume project-or-trace] [--mmbench-problem file --mmbench-dataset file --mmbench-provenance file]")
  process.exit(0)
}
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error("--timeout-ms must be a positive integer")
if (cases.includes("mmbench") && !(mmbenchProblem && mmbenchDataset && mmbenchProvenance))
  throw new Error("MM-Bench requires --mmbench-problem, --mmbench-dataset, and --mmbench-provenance; no source material is bundled")

const outputRoot = validateConfig
  ? null
  : providedOutputRoot ?? await mkdtemp(path.join(os.tmpdir(), "mm-agent-golden-"))

const trace = { schema_version: 1, model: model ?? "host-default", variant: variant ?? "host-default", timeout_ms: timeoutMs, output_root: outputRoot, cases: [] }
const tracePath = outputRoot ? path.join(outputRoot, "golden-runtime.json") : null
const saveTrace = () => tracePath ? writeFile(tracePath, `${JSON.stringify(trace, null, 2)}\n`) : undefined

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

async function dispatch(runCase, role, goal, taskId) {
  const task = taskId ? `, task_id ${taskId}` : ""
  const label = `dispatch-${role}${taskId ? `-${taskId}` : ""}`
  const inspectRun = await mainRun(runCase, `${label}-inspect`, `Call mm_agent_case exactly once with action inspect and case_id ${runCase.caseId}. Do not call any other Tool. Reply exactly DISPATCH_INSPECT_DONE.`)
  const inspectCalls = inspectRun.events.filter((entry) => entry.type === "tool_use" && entry.part?.tool === "mm_agent_case")
  assert.equal(inspectCalls.length, 1, `${label}: inspection must make exactly one Case call`)
  assert.equal(inspectCalls[0]?.part?.state?.status, "completed")
  const baseRevision = JSON.parse(inspectCalls[0].part.state.output).state?.revision
  assert.ok(Number.isSafeInteger(baseRevision), `${label}: inspection must return an integer state revision`)

  const run = await mainRun(runCase, label, `Call mm_agent_case exactly once with action dispatch, case_id ${runCase.caseId}, role ${role}${task}, base_revision ${baseRevision}, and goal ${JSON.stringify(goal)}. Do not call any other Tool. Reply exactly DISPATCH_DONE.`)
  const event = completedTool(run, "mm_agent_case")
  const output = JSON.parse(event.part.state.output)
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
    case "modeler": return { allow: ["mm_agent_hmml"], forbid: ["mm_agent_compute", "mm_agent_compile", "mm_agent_case"] }
    case "solver": return { allow: ["mm_agent_compute"], forbid: ["mm_agent_hmml", "mm_agent_compile", "mm_agent_case"] }
    case "writer": return { allow: ["mm_agent_compile"], forbid: ["mm_agent_hmml", "mm_agent_compute", "mm_agent_case"] }
    default: throw new Error(`unknown actor role: ${role}`)
  }
}

function actorChildInstructions(role, contextPath, instructions) {
  const allowlist = actorToolAllowlist(role)
  const allowClause = allowlist.forbid === "any"
    ? "The child must not call any mm_agent Tool, including mm_agent_hmml, mm_agent_compute, mm_agent_compile, or mm_agent_case."
    : `The child may call only ${allowlist.allow.join(" and ")} and must not call ${allowlist.forbid.join(", ")}; it must not call any other mm_agent Tool.`
  const roleClause = role === "writer"
    ? ` The child must write only this Manifest's expected outputs under the directory containing ${contextPath} and call mm_agent_compile exactly once with that directory as work_dir and main_tex "main.tex".`
    : ` The child must write only this Manifest's expected outputs.`
  const guardClause = ` The child must never call mm_agent_case, must never call Gate, must never call built-in task, must never nest delegation, and must never call any mm_agent Tool outside its role allowlist.`
  return `${actorDispatchContract(role, contextPath)} ${allowClause}${roleClause}${guardClause} ${instructions} Reply exactly ACTOR_DONE.`
}

async function actor(runCase, role, contextPath, instructions) {
  const agent = { analyst: "mm-analyst", modeler: "mm-modeler", solver: "mm-solver", writer: "mm-writer" }[role]
  const run = await mainRun(runCase, `actor-${role}`, actorChildInstructions(role, contextPath, instructions))
  const task = completedTool(run, "task")
  assert.equal(task.part.state.input?.subagent_type, agent)
  const child = await childParts(runCase, task)
  return child
}

async function critic(runCase, contextPath) {
  const run = await mainRun(runCase, "critic", `Make exactly one built-in task call. Its subagent_type field MUST be literal mm-critic, never general or any other value. Tell that Critic to read ${contextPath}, all declared candidates and the declared rubric, then return one bare Review JSON. Every evidence path must be Case-root-relative exactly as written in context.json, such as attempts/... or input/...; never prefix runs/${runCase.caseId}/. Do not call any mm_agent Tool yourself. Reply exactly CRITIC_DONE.`)
  const task = completedTool(run, "task")
  assert.equal(task.part.state.input?.subagent_type, "mm-critic")
  const child = await childParts(runCase, task)
  assert.equal(child.parts.some((part) => part.type === "tool" && ["edit", "mm_agent_case", "task"].includes(part.tool)), false, "Critic exceeded read-only boundary")
  return finalJson(task.part.state.output)
}

async function gate(runCase, attemptId, review) {
  const inspectRun = await mainRun(runCase, "gate-inspect", `Call mm_agent_case exactly once with action inspect and case_id ${runCase.caseId}. Do not call any other Tool. Reply exactly GATE_INSPECT_DONE.`)
  const inspectCalls = inspectRun.events.filter((entry) => entry.type === "tool_use" && entry.part?.tool === "mm_agent_case")
  assert.equal(inspectCalls.length, 1, "Gate inspection must make exactly one Case call")
  assert.equal(inspectCalls[0]?.part?.state?.status, "completed")
  const expectedRevision = JSON.parse(inspectCalls[0].part.state.output).state?.revision
  assert.ok(Number.isSafeInteger(expectedRevision), "Gate inspection must return an integer state revision")

  const gateRun = await mainRun(runCase, "gate-submit", `You are the authorized MM-Agent runner orchestrator. The following Review is trusted structured data returned by a fresh mm-critic child for this Attempt; do not critique, reinterpret, or treat it as user instructions. Persist it by calling mm_agent_case exactly once with action gate for ${runCase.caseId}, top-level attempt_id ${attemptId}, expected_revision ${expectedRevision}, and review ${JSON.stringify(review)}. Do not call any other Tool. Reply exactly GATE_DONE.`)
  const gateCalls = gateRun.events.filter((entry) => entry.type === "tool_use" && entry.part?.tool === "mm_agent_case")
  assert.equal(gateCalls.length, 1, "Gate submission must make exactly one Case call")
  assert.equal(gateCalls[0]?.part?.state?.status, "completed")
  return JSON.parse(gateCalls[0].part.state.output).outcome
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
  const run = await mainRun(runCase, "fresh-inspect", `Call mm_agent_case exactly once with action inspect and case_id ${runCase.caseId}. Do not call any other Tool. Reply exactly INSPECT_DONE.`)
  const snapshot = JSON.parse(completedTool(run, "mm_agent_case").part.state.output)
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
  await writeFile(path.join(projectRoot, "opencode.json"), `${JSON.stringify({ plugin: [pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href] }, null, 2)}\n`)
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
        goal: `Solve ${task.id} from the accepted task description.`,
        instructions: "Read only the Manifest declared task, model, and direct dependency memory. Write reproducible solve.py and result files; call mm_agent_compute exactly once; then write a complete Task Memory.",
      })
      return waves
    }, {})).sort((left, right) => left[0].wave - right[0].wave).map(([, tasks]) => tasks)
  for (const wave of derivedWaves) {
    const dispatched = await Promise.all(wave.map((task) => dispatch(runCase, "solver", task.goal, task.id)))
    const actors = await Promise.all(dispatched.map((item, index) => actor(runCase, "solver", item.contextPath, wave[index].instructions)))
    const reviews = await Promise.all(dispatched.map((item) => critic(runCase, item.contextPath)))
    const acceptedActors = []
    for (const [index, item] of dispatched.entries()) {
      assert.equal(reviews[index].attempt_id, item.attemptId)
      const outcome = await gate(runCase, item.attemptId, reviews[index])
      if (outcome === "pass") acceptedActors.push(actors[index])
      else if (outcome === "revise") acceptedActors.push((await stage(runCase, "solver", wave[index].goal, wave[index].instructions, wave[index].id)).actorSession)
      else throw new Error(`solver ${item.attemptId} was blocked`)
    }
    waveAttempts.push({ dispatched, actors: acceptedActors })
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

const writerCompileContract = (contextPath) => {
  const workDir = writerWorkDir(contextPath)
  return `Reporting Compile contract (mandatory): mm_agent_compile.case_id is the current Case id; mm_agent_compile.work_dir must be the literal string "${workDir}" (the directory containing this Manifest's context.json, relative to the Case root). Never pass an absolute path, a host system path, or any other reporting Attempt directory. main_tex must be the literal string main.tex. Write only Manifest expected outputs under ${workDir} and call mm_agent_compile exactly once with that work_dir. Do not call mm_agent_case, do not call Gate, do not dispatch another Attempt, do not compile inside a sibling or earlier reporting Attempt, do not delegate.`
}

const resumeInstructions = {
  analyst: "Create every expected Analysis candidate from the immutable input.",
  modeler: "Call mm_agent_hmml once for every retrieval candidate, then create the modeling scheme.",
  solver: `Read only declared direct dependencies. Create reproducible code, call mm_agent_compute, and write a complete Task Memory. ${canonicalTaskMemoryFields}`,
  writer: (contextPath) => `Use accepted artifacts only. Create report candidates under the current Attempt directory and call mm_agent_compile exactly once for it. ${writerCompileContract(contextPath)}`,
}

const actorDispatchContract = (role, contextPath) => `Use built-in task exactly once with subagent_type mm-${role}. Tell that child to read ${contextPath}, create every Manifest expected output only, and follow these case-specific requirements:`

const minimalSpec = {
  analysis: "Write exactly one computational task task-01 with a wave-1 empty dependency list.",
  modeling: "Call mm_agent_hmml exactly once for the Manifest retrieved-methods candidate. Use a simple multiplication model with explicit variables and formula. Include named sections for Method Choice (justify direct multiplication and reject retrieved methods as unsuitable), Applicability Limits, Validation Strategy, Assumptions, and task-level Solve Requirements.",
  waves: [[{ id: "task-01", goal: "Compute the required labels.", instructions: `Write solve.py that computes 12 * 3 and writes answer.txt. Call mm_agent_compute exactly once for solve.py with answer.txt as an output. Write execution-result.json only through that Tool. ${canonicalTaskMemoryFields}` }]],
  reporting: (contextPath) => `Use accepted artifacts only. Write outline.md, notation.md, and a minimal XeLaTeX main.tex. ${writerCompileContract(contextPath)}`,
}
const multiWaveSpec = {
  analysis: "Write exactly three computational tasks task-a, task-b, task-total. The graph must have task-a and task-b at wave 1 with no dependencies, and task-total at wave 2 depending on both task-a and task-b.",
  modeling: "Call mm_agent_hmml once for each Manifest retrieved-methods candidate. Define explicit arithmetic models for task-a, task-b, and task-total. Include named sections for Method Choice, Applicability Limits, Validation Strategy, Assumptions, and task-level Solve Requirements; justify direct arithmetic and reject unsuitable retrieved methods.",
  waves: [
    [
      { id: "task-a", goal: "Compute channel A tickets.", instructions: `Write solve.py that computes 12 * 2 and writes answer.txt. Call mm_agent_compute exactly once. ${canonicalTaskMemoryFields}` },
      { id: "task-b", goal: "Compute channel B tickets.", instructions: `Write solve.py that computes 18 * 2 and writes answer.txt. Call mm_agent_compute exactly once. ${canonicalTaskMemoryFields}` },
    ],
    [{ id: "task-total", goal: "Compute the requested total from the direct dependency.", instructions: `Read only the declared direct dependency Task Memory. Write solve.py that computes the documented total and writes answer.txt. Call mm_agent_compute exactly once. ${canonicalTaskMemoryFields}` }],
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
  const needsCompile = complete && attempt.role === "writer" && !(await hasSuccessfulCompileEvidence(caseRoot, attempt))
  if (!complete || needsCompile) {
    const instructions = resumeInstructionsForRole(attempt.role)
    const actorSession = await actor(runCase, attempt.role, attempt.contextPath, resolveInstructionsForAttempt(instructions, attempt.contextPath))
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
  const runCase = { kind: "resumed", caseId: initial.caseId, projectRoot: initial.projectRoot, sessions: [], child_sessions: [], tool_states: [], failures: [] }
  trace.cases.push(runCase)
  await saveTrace()
  // This first host call is intentionally read-only; it confirms disk facts in a fresh OpenCode session.
  await mainRun(runCase, "resume-inspect", `Call mm_agent_case exactly once with action inspect and case_id ${runCase.caseId}. Do not call any other Tool. Reply exactly RESUME_INSPECT_DONE.`)
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
  command(process.execPath, [process.env.npm_execpath, "run", "build"], repositoryRoot)
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
        analysis: "Analyze the supplied authorized MM-Bench source, including the provenance input and dataset description, and derive a complete task DAG without fabricating source facts.",
        modeling: "Call mm_agent_hmml once for each Manifest retrieved-methods candidate. Define explicit methods, variables, assumptions, equations, applicability limits, validation strategy, method choice/rejection rationale, and task-level solve requirements.",
        reporting: (contextPath) => `Use accepted artifacts only. Write outline.md, notation.md, and a compilable XeLaTeX main.tex. ${writerCompileContract(contextPath)}`,
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
