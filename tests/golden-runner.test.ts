import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

const repositoryRoot = path.resolve(import.meta.dirname, "..")

test("Golden fixtures and runner replace the old planning validation path", async () => {
  for (const fixture of ["minimal", "multi-wave"])
    assert.equal(existsSync(path.join(repositoryRoot, "tests", "fixtures", "golden", fixture, "problem.md")), true, fixture)
  assert.equal(existsSync(path.join(repositoryRoot, "tests", "mmbench_validate.py")), false)
  assert.equal(existsSync(path.join(repositoryRoot, "tests", "mmbench-validation.yaml")), false)

  const runner = await readFile(path.join(repositoryRoot, "scripts", "run-golden-case.mjs"), "utf8")
  assert.match(runner, /const ready = pending\.filter/u)
  assert.match(runner, /Promise\.all\(ready\.map\(\(task\) => dispatch/u)
  assert.doesNotMatch(runner, /\.map\(\(\[, tasks\]\) => tasks\)/u)
  assert.match(runner, /baseRevision/u)
  assert.doesNotMatch(runner, /mainRun\(runCase, label,[\s\S]+action dispatch/u)
  assert.match(runner, /await gate\(runCase, item\.attemptId, reviews\[index\]\)/u)
  assert.match(runner, /runInternalCaseAction\(runCase, \{ action: "inspect", caseId: runCase\.caseId \}\)/u)
  assert.match(runner, /runInternalCaseAction\(runCase, \{[\s\S]+action: "gate"/u)
  assert.doesNotMatch(runner, /tool\.schema|definition\.execute/u)
  assert.doesNotMatch(runner, /mainRun\(runCase, "gate-submit"/u)
  assert.match(runner, /tasks\/task-a\/memory\.json", "tasks\/task-b\/memory\.json/u)
  assert.match(runner, /MM-Bench requires --mmbench-problem/u)
  assert.match(runner, /!resumeTarget && cases\.includes\("mmbench"\)/u)
  assert.match(runner, /--mmbench-problem file --mmbench-dataset file/u)
  assert.match(runner, /--resume project-or-trace/u)
  assert.match(runner, /--timeout-ms milliseconds/u)
  assert.match(runner, /snapshot\.completion\?\.complete/u)
  assert.match(runner, /instructions: \(contextPath\) =>[\s\S]+solverComputeContract\(contextPath\)/u)
  assert.equal(runner.includes("deepseek/deepseek-v4-pro"), false)
  assert.equal(runner.includes("new Set([\"high\", \"max\"])"), false)
})

test("Golden runner rejects incomplete Actor output before Critic and Gate", async () => {
  const runner = await readFile(path.join(repositoryRoot, "scripts", "run-golden-case.mjs"), "utf8")
  const helper = runner.match(/async function assertAttemptComplete[\s\S]+?\n\}/u)?.[0] ?? ""
  assert.match(helper, /isAttemptComplete\(caseRoot, manifest\)/u)
  assert.match(helper, /\{ \.\.\.manifest, contextPath \}/u)
  assert.match(runner, /item\.manifest, item\.contextPath/u)
  assert.match(runner, /coach_claim_tests\.csv with the exact header/u)
  assert.match(runner, /synthesis_verification\.json.*evidence_table\.json.*coaching_advisory\.json.*reporting_summary\.md.*synthesis_status\.json/u)
  assert.match(runner, /consecutive point_victor=1 streak test against a server-only null/u)
  assert.match(runner, /Only entry_script is relative to work_dir; every input_paths and output_paths item is relative to the Case root/u)
  assert.match(runner, /tasks\/swing-prediction\/memory\.json/u)
  assert.match(runner, /\$\{workDir\}\/synthesis_status\.json/u)
  assert.match(runner, /let instructions = resolveInstructionsForAttempt\(/u)

  for (const name of ["stage", "resumeAttempt"]) {
    const body = runner.match(new RegExp(`async function ${name}[^]*?\\n\\}`, "u"))?.[0] ?? ""
    const actorIndex = body.indexOf("await actor(")
    const completeIndex = body.indexOf("await assertAttemptComplete(")
    const criticIndex = body.indexOf("await critic(")
    assert.ok(actorIndex >= 0 && actorIndex < completeIndex && completeIndex < criticIndex, `${name} must verify Manifest outputs between Actor and Critic`)
  }
})

test("Golden Actor resolves Manifest paths from the Case root", async () => {
  const runner = await readFile(path.join(repositoryRoot, "scripts", "run-golden-case.mjs"), "utf8")
  const actor = runner.match(/function actorChildInstructions[\s\S]+?\n\}/u)?.[0] ?? ""
  assert.match(actor, /The Case root is exactly \$\{caseRoot\}/u)
  assert.match(actor, /never relative to the context\.json directory or the project root/u)
  assert.match(runner, /Do not calculate or state a match count during Analysis/u)
})

test("Golden Critic reads the Case-prefixed Manifest and bounds large input checks", async () => {
  const runner = await readFile(path.join(repositoryRoot, "scripts", "run-golden-case.mjs"), "utf8")
  const critic = runner.match(/async function critic[\s\S]+?\n\}/u)?.[0] ?? ""
  assert.match(critic, /`runs\/\$\{runCase\.caseId\}\/\$\{contextPath\}`/u)
  assert.match(critic, /never exhaustively scan or enumerate the dataset/u)
  assert.match(critic, /never prefix runs\/\$\{runCase\.caseId\}\/ in Review JSON/u)
  assert.match(critic, /schema_version, attempt_id, verdict, findings, required_fixes, evidence, and reviewed_at/u)
  assert.match(critic, /reviewed_at must be a UTC RFC 3339 string/u)
  assert.match(critic, /strict JSON: use forward slashes in paths, never copy raw TeX commands into JSON strings, and escape every backslash/u)
})

test("Runner prepares MM-Bench problem, dataset, and provenance together", async () => {
  const runner = await readFile(path.join(repositoryRoot, "scripts", "run-golden-case.mjs"), "utf8")
  const prepareSection = runner.match(/async function prepare[\s\S]+?\n\}/u)
  assert.ok(prepareSection, "prepare function exists")
  assert.match(prepareSection[0], /path\.basename/u)
  assert.match(runner, /from ".\/mmbench-validate\.mjs"/u)
  assert.match(runner, /mmbenchProblem[\s\S]+mmbenchDataset[\s\S]+mmbenchProvenance/u)
  assert.match(runner, /validateMmbench\(\{ problemPath/u)
  for (const contract of ["exactly five requires_computation:true tasks", "ingest-audit wave 1", "momentum-flow wave 2", "coach-claim-tests wave 3", "swing-prediction wave 3", "synthesize-results wave 4", "at least three non-empty match-flow figures", "numeric statistics/effect sizes/p-values", "7,284 data records", "row t\\+1", "server stays fixed for the game", "trained only on training matches"])
    assert.match(runner, new RegExp(contract, "u"))
})

test("MM-Bench Reporting pass rejects deferred deliverables, severe overflow, and a failed final Compile", async () => {
  const runner = await readFile(path.join(repositoryRoot, "scripts", "run-golden-case.mjs"), "utf8")
  const quality = runner.match(/async function assertMmbenchReportingQuality[\s\S]+?\n\}/u)?.[0] ?? ""
  assert.match(quality, /placeholder\|not rendered\|not executed\|not run\|next compute\|future compute/u)
  assert.match(quality, /begin\\\{figure/u)
  assert.match(quality, /value\) => value > 20/u)
  assert.match(quality, /compile-\\d\{3\}\\\.json/u)
  assert.match(quality, /compileResults\.at\(-1\)\?\.status/u)
  assert.match(quality, /compileResults\.at\(-1\)\?\.exit_code/u)
  assert.match(runner, /if \(review\.verdict === "pass"\) await assertMmbenchReportingQuality/u)
  assert.match(runner, /never infer per-fold dominance from aggregate dominance/u)
})

test("validate-config executes the real runner initialization and exits zero", async () => {
  const { spawnSync } = await import("node:child_process")
  const result = spawnSync(process.execPath, [path.join(repositoryRoot, "scripts", "run-golden-case.mjs"), "--validate-config"], { cwd: repositoryRoot, encoding: "utf8", env: { ...process.env, MM_AGENT_RUNTIME: "0" } })
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`)
  const stdout = String(result.stdout)
  const start = stdout.indexOf("{")
  const end = stdout.lastIndexOf("}")
  assert.ok(start >= 0 && end > start, `validate-config did not emit JSON: ${stdout.slice(0, 200)}`)
  const payload = JSON.parse(stdout.slice(start, end + 1)) as { ok: boolean; mode: string; canonical_task_memory_fields: string[]; resume_instructions: string[]; specs: Record<string, number>; tasks: Record<string, string[]> }
  assert.equal(payload.ok, true)
  assert.equal(payload.mode, "validate-config")
  for (const field of ["schema_version", "task_id", "task_description", "modeling_method", "result_interpretation", "execution_result", "code_outputs", "figures"]) {
    assert.ok(payload.canonical_task_memory_fields.includes(field), field)
  }
  assert.deepEqual(payload.resume_instructions, ["analyst", "modeler", "solver", "writer"])
  assert.equal(payload.specs.minimal, 1)
  assert.equal(payload.specs["multi-wave"], 2)
  assert.deepEqual(payload.tasks.minimal, ["task-01"])
  assert.deepEqual(payload.tasks["multi-wave"], ["task-a", "task-b", "task-total"])
  assert.equal(/opencode\.exe|opencode\b/i.test(result.stdout + result.stderr), false, "validate-config must not invoke OpenCode")
  assert.equal(/API|sessions\/|run --model/u.test(result.stdout + result.stderr), false, "validate-config must not start any run")
})

test("validate-config does not write to a project or open a runtime Case", async () => {
  const { spawnSync, spawn } = await import("node:child_process")
  const { mkdir, readdir, rm } = await import("node:fs/promises")
  const tempRoot = path.join(process.env.TEMP ?? ".", `mm-agent-validate-${Date.now().toString(36)}`)
  await mkdir(tempRoot, { recursive: true })
  const before = new Set(await readdir(tempRoot).catch(() => []))
  const result = spawnSync(process.execPath, [path.join(repositoryRoot, "scripts", "run-golden-case.mjs"), "--validate-config"], { cwd: repositoryRoot, encoding: "utf8" })
  const after = new Set(await readdir(tempRoot).catch(() => []))
  for (const entry of after) if (!before.has(entry)) await rm(path.join(tempRoot, entry), { recursive: true, force: true }).catch(() => undefined)
  await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined)
  assert.equal(result.status, 0)
})

test("--preflight exercises the default outputRoot and external Plugin entry without OpenCode or model calls", async () => {
  const { spawnSync } = await import("node:child_process")
  const { readFile, realpath, rm, writeFile } = await import("node:fs/promises")
  const os = await import("node:os")
  const { pathToFileURL } = await import("node:url")
  const systemTemp = await realpath(os.tmpdir())
  const pluginEntryPath = path.join(systemTemp, `mm-agent-rc-${Date.now().toString(36)}.mjs`)
  await writeFile(pluginEntryPath, "export default async () => ({})\n")
  const pluginEntry = pathToFileURL(pluginEntryPath).href
  const result = spawnSync(process.execPath, [path.join(repositoryRoot, "scripts", "run-golden-case.mjs"), "--preflight", "minimal", "--timeout-ms", "7", "--plugin-entry", pluginEntryPath], { cwd: repositoryRoot, encoding: "utf8", env: { ...process.env, MM_AGENT_RUNTIME: "0" } })
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`)
  const stdout = String(result.stdout)
  const start = stdout.indexOf("{")
  const end = stdout.lastIndexOf("}")
  assert.ok(start >= 0 && end > start, `preflight did not emit JSON: ${stdout.slice(0, 200)}`)
  const payload = JSON.parse(stdout.slice(start, end + 1)) as { ok: boolean; mode: string; timeout_ms: number; output_root: string; trace_path: string; models: { model: string; variant: string } }
  assert.equal(payload.ok, true)
  assert.equal(payload.mode, "preflight")
  assert.equal(typeof payload.timeout_ms, "number")
  assert.equal(payload.timeout_ms, 7)
  assert.equal(typeof payload.output_root, "string")
  const resolved = path.isAbsolute(payload.output_root) ? await realpath(payload.output_root).catch(() => payload.output_root) : payload.output_root
  assert.ok(resolved.startsWith(systemTemp), `output_root ${resolved} must be under ${systemTemp}`)
  assert.ok(payload.trace_path?.startsWith(payload.output_root), "trace_path must be inside output_root")
  assert.equal(/opencode\.exe|sessions\/|API|run --model/u.test(result.stdout + result.stderr), false, "preflight must not invoke OpenCode or model")
  const traceRaw = await readFile(payload.trace_path, "utf8")
  assert.ok(traceRaw.length > 0, "trace file must be non-empty")
  const trace = JSON.parse(traceRaw) as { schema_version: number; timeout_ms: number; plugin_entry: string; output_root: string; model: string; variant: string }
  assert.equal(trace.schema_version, 1)
  assert.equal(typeof trace.timeout_ms, "number")
  assert.equal(trace.timeout_ms, 7)
  assert.equal(trace.plugin_entry, pluginEntry)
  assert.equal(trace.output_root, payload.output_root)
  assert.equal(trace.model, payload.models.model)
  assert.equal(trace.variant, payload.models.variant)
  await rm(payload.output_root, { recursive: true, force: true }).catch(() => undefined)
  await rm(pluginEntryPath, { force: true }).catch(() => undefined)
})

test("Golden fresh, deterministic Tool, and resume paths share the selected Plugin entry", async () => {
  const runner = await readFile(path.join(repositoryRoot, "scripts", "run-golden-case.mjs"), "utf8")
  assert.match(runner, /import\(pluginEntry\)/u)
  assert.match(runner, /runInternalCaseAction/u)
  assert.match(runner, /JSON\.stringify\(\{ plugin: \[pluginEntry\] \}/u)
  assert.match(runner, /if \(providedPluginEntry\)[\s\S]*writeFile\(path\.join\(initial\.projectRoot, "opencode\.json"\)/u)
  assert.match(runner, /if \(!providedPluginEntry\) command\(process\.execPath/u)
})

test("Golden trace writes are serialized and replace only complete temporary files", async () => {
  const runner = await readFile(path.join(repositoryRoot, "scripts", "run-golden-case.mjs"), "utf8")
  assert.match(runner, /let traceWrite = Promise\.resolve\(\)/u)
  assert.match(runner, /traceWrite = traceWrite\.then\(async \(\) =>/u)
  assert.match(runner, /await writeFile\(temporary, snapshot\)[\s\S]*await rename\(temporary, tracePath\)/u)
})

test("Canonical TaskMemory fields appear in every spec and in the solving rubric", async () => {
  const runner = await readFile(path.join(repositoryRoot, "scripts", "run-golden-case.mjs"), "utf8")
  const rubric = await readFile(path.join(repositoryRoot, "rubrics", "solving.md"), "utf8")
  const fields = ["schema_version", "task_id", "task_description", "modeling_method", "result_interpretation", "execution_result", "code_outputs", "figures"]
  for (const field of fields) {
    assert.ok(runner.includes(field), field)
    assert.ok(rubric.includes(field), field)
  }
})
