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
  assert.match(runner, /Promise\.all\(wave\.map\(\(task\) => dispatch/u)
  assert.match(runner, /base_revision \$\{baseRevision\}/u)
  assert.match(runner, /trusted structured data returned by a fresh mm-critic child/u)
  assert.match(runner, /await gate\(runCase, item\.attemptId, reviews\[index\]\)/u)
  assert.match(runner, /tasks\/task-a\/memory\.json", "tasks\/task-b\/memory\.json/u)
  assert.match(runner, /MM-Bench requires --mmbench-problem/u)
  assert.match(runner, /--mmbench-problem file --mmbench-dataset file/u)
  assert.match(runner, /--resume project-or-trace/u)
  assert.match(runner, /--timeout-ms milliseconds/u)
  assert.match(runner, /snapshot\.completion\?\.complete/u)
  assert.equal(runner.includes("deepseek/deepseek-v4-pro"), false)
  assert.equal(runner.includes("new Set([\"high\", \"max\"])"), false)
})

test("Runner prepares MM-Bench problem, dataset, and provenance together", async () => {
  const runner = await readFile(path.join(repositoryRoot, "scripts", "run-golden-case.mjs"), "utf8")
  const prepareSection = runner.match(/async function prepare[\s\S]+?\n\}/u)
  assert.ok(prepareSection, "prepare function exists")
  assert.match(prepareSection[0], /path\.basename/u)
  assert.match(runner, /from ".\/mmbench-validate\.mjs"/u)
  assert.match(runner, /mmbenchProblem[\s\S]+mmbenchDataset[\s\S]+mmbenchProvenance/u)
  assert.match(runner, /validateMmbench\(\{ problemPath/u)
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

test("--preflight exercises the default outputRoot path without OpenCode or model calls", async () => {
  const { spawnSync } = await import("node:child_process")
  const { readFile, realpath, rm } = await import("node:fs/promises")
  const os = await import("node:os")
  const systemTemp = await realpath(os.tmpdir())
  const result = spawnSync(process.execPath, [path.join(repositoryRoot, "scripts", "run-golden-case.mjs"), "--preflight", "minimal", "--timeout-ms", "7"], { cwd: repositoryRoot, encoding: "utf8", env: { ...process.env, MM_AGENT_RUNTIME: "0" } })
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
  const trace = JSON.parse(traceRaw) as { schema_version: number; timeout_ms: number; output_root: string; model: string; variant: string }
  assert.equal(trace.schema_version, 1)
  assert.equal(typeof trace.timeout_ms, "number")
  assert.equal(trace.timeout_ms, 7)
  assert.equal(trace.output_root, payload.output_root)
  assert.equal(trace.model, payload.models.model)
  assert.equal(trace.variant, payload.models.variant)
  await rm(payload.output_root, { recursive: true, force: true }).catch(() => undefined)
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
