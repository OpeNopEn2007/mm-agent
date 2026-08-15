import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { tool, type Config, type PluginInput } from "@opencode-ai/plugin"
import { FormalRuntimeCoordinator } from "../src/runtime/formal-runtime-coordinator.js"
import { FileCaseContextStore } from "../src/core/case-context-store.js"
import { hashPath, writeJsonAtomic } from "../src/core/paths.js"
import type { OpenInput } from "../src/core/schema.js"
import { createAgentConfigs } from "../src/agents.js"
import mmAgentPlugin from "../src/index.js"

const repositoryRoot = path.resolve(import.meta.dirname, "..")

async function fixtureRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "mm-agent-formal-flow-"))
}

function openInput(problemPath: string): OpenInput {
  const rubric = (name: string) => ({ sourcePath: path.join(repositoryRoot, "rubrics", `${name}.md`) })
  return {
    sourceKind: "explicit-path",
    files: [{ label: "problem", sourcePath: problemPath }],
    policy: {
      revisionBudget: { analysis: 2, modeling: 2, solvingPerTask: 2, reporting: 2 },
      rubrics: {
        analysis: rubric("analysis"),
        modeling: rubric("modeling"),
        solving: rubric("solving"),
        reporting: rubric("reporting"),
      },
    },
  }
}

async function preparedCase(): Promise<{ root: string; runsRoot: string; flow: FormalRuntimeCoordinator }> {
  const root = await fixtureRoot()
  const runsRoot = path.join(root, "runs")
  const problem = path.join(root, "problem.md")
  await writeFile(problem, "A bounded fixture problem.\n")
  const store = new FileCaseContextStore({ runsRoot })
  await store.open("case-alpha", openInput(problem))
  return { root, runsRoot, flow: new FormalRuntimeCoordinator({ runsRoot, now: () => "2026-08-12T00:00:00.000Z" }) }
}

async function readJson<T>(target: string): Promise<T> {
  return JSON.parse(await readFile(target, "utf8")) as T
}

test("advance dispatches one Actor, resumes the same Attempt, then routes a complete candidate to Critic", async () => {
  const fixture = await preparedCase()
  const first = await fixture.flow.execute({ action: "advance", caseId: "case-alpha" })
  assert.equal(first.status, "task")
  assert.equal(first.agent, "mm-analyst")
  assert.equal(first.attempt_id, "analysis-001")
  assert.equal(first.context_path, "attempts/analysis/001/context.json")

  const resumed = await fixture.flow.execute({ action: "advance", caseId: "case-alpha" })
  assert.equal(resumed.status, "task")
  assert.equal(resumed.agent, "mm-analyst")
  assert.equal(resumed.attempt_id, first.attempt_id)

  const attemptRoot = path.join(fixture.runsRoot, "case-alpha", "attempts", "analysis", "001")
  await writeFile(path.join(attemptRoot, "problem-understanding.md"), "Understanding.\n")
  await writeFile(path.join(attemptRoot, "tasks.json"), JSON.stringify({
    schema_version: 1,
    tasks: [{ id: "task-01", description: "Compute the fixture result", requires_computation: false }],
  }))
  await writeFile(path.join(attemptRoot, "task-graph.json"), JSON.stringify({
    schema_version: 1,
    tasks: [{ id: "task-01", depends_on: [], wave: 1 }],
  }))

  const critic = await fixture.flow.execute({ action: "advance", caseId: "case-alpha" })
  assert.equal(critic.status, "task")
  assert.equal(critic.agent, "mm-critic")
  assert.equal(critic.attempt_id, first.attempt_id)
  assert.match(critic.prompt, /solver Attempt.*execution-result\.json.*entry_script.*inputs.*outputs.*sha256/su)
  assert.match(critic.prompt, /If kind is direct synthesis.*ordinary file.*without parsing it as a Runtime Evidence payload/su)
  assert.match(critic.prompt, /missing or stale.*verdict must be revise.*required_fixes/su)
  assert.match(critic.prompt, /context\.review\.required_reads.*context\.required_reads.*rubric.*Runtime Evidence JSON.*never use a directory.*context\.json.*manifest\.json.*runs\/<case-id>/su)
  const handoff = await readJson<{ status: string; current_agent: string; next_agent: string | null; attempt_id: string }>(
    path.join(fixture.runsRoot, "case-alpha", "handoff.json"),
  )
  assert.equal(handoff.status, "awaiting_critic")
  assert.equal(handoff.current_agent, "mm-critic")
  assert.equal(handoff.next_agent, null)
  assert.equal(handoff.attempt_id, "analysis-001")
})

test("submit_review supplies runtime-owned machine fields and routes immediately", async () => {
  const fixture = await preparedCase()
  const actor = await fixture.flow.execute({ action: "advance", caseId: "case-alpha" })
  const attemptRoot = path.join(fixture.runsRoot, "case-alpha", "attempts", "analysis", "001")
  await writeFile(path.join(attemptRoot, "problem-understanding.md"), "Understanding.\n")
  await writeFile(path.join(attemptRoot, "tasks.json"), JSON.stringify({ schema_version: 1, tasks: [{ id: "task-01", description: "Compute", requires_computation: false }] }))
  await writeFile(path.join(attemptRoot, "task-graph.json"), JSON.stringify({ schema_version: 1, tasks: [{ id: "task-01", depends_on: [], wave: 1 }] }))
  const next = await fixture.flow.execute({
    action: "submit_review",
    caseId: "case-alpha",
    verdict: "pass",
    findings: [],
    requiredFixes: [],
    evidence: ["attempts/analysis/001/problem-understanding.md"],
  })
  assert.equal(next.status, "task")
  assert.equal(next.agent, "mm-modeler")
  const review = await readJson<Record<string, unknown>>(path.join(attemptRoot, "review.json"))
  assert.equal(review.schema_version, 1)
  assert.equal(review.attempt_id, actor.attempt_id)
  assert.equal(review.reviewed_at, "2026-08-12T00:00:00.000Z")
  assert.equal("reviewed_at" in ({} as Record<string, unknown>), false)
})

test("submit_review enforces strict Case-relative evidence and candidate requirement", async () => {
  const fixture = await preparedCase()
  await fixture.flow.execute({ action: "advance", caseId: "case-alpha" })
  const attemptRoot = path.join(fixture.runsRoot, "case-alpha", "attempts", "analysis", "001")
  await writeFile(path.join(attemptRoot, "problem-understanding.md"), "Understanding.\n")
  await writeFile(path.join(attemptRoot, "tasks.json"), JSON.stringify({ schema_version: 1, tasks: [{ id: "task-01", description: "Compute", requires_computation: false }] }))
  await writeFile(path.join(attemptRoot, "task-graph.json"), JSON.stringify({ schema_version: 1, tasks: [{ id: "task-01", depends_on: [], wave: 1 }] }))
  const badPaths = [
    "/absolute.txt",
    "attempts/analysis/001/../001/tasks.json",
    "tmp/secret.txt",
    "runs/case-alpha/attempts/analysis/001/problem-understanding.md",
    "attempts/analysis/001/context.json",
    "attempts/analysis/001",
  ]
  for (const evidence of badPaths) {
    const result = await fixture.flow.execute({ action: "submit_review", caseId: "case-alpha", verdict: "pass", findings: [], requiredFixes: [], evidence: [evidence] })
    assert.equal(result.status, "failed", evidence)
  }
  const noCandidate = await fixture.flow.execute({ action: "submit_review", caseId: "case-alpha", verdict: "pass", findings: [], requiredFixes: [], evidence: ["input/files/001-problem.md"] })
  assert.equal(noCandidate.status, "failed")
})

test("invalid Review evidence preserves the last valid awaiting-Critic handoff", async () => {
  const fixture = await preparedCase()
  await fixture.flow.execute({ action: "advance", caseId: "case-alpha" })
  const attemptRoot = path.join(fixture.runsRoot, "case-alpha", "attempts", "analysis", "001")
  await writeFile(path.join(attemptRoot, "problem-understanding.md"), "Understanding.\n")
  await writeFile(path.join(attemptRoot, "tasks.json"), JSON.stringify({ schema_version: 1, tasks: [{ id: "task-01", description: "Compute", requires_computation: false }] }))
  await writeFile(path.join(attemptRoot, "task-graph.json"), JSON.stringify({ schema_version: 1, tasks: [{ id: "task-01", depends_on: [], wave: 1 }] }))
  const critic = await fixture.flow.execute({ action: "advance", caseId: "case-alpha" })
  assert.equal(critic.status, "task")
  const handoffPath = path.join(fixture.runsRoot, "case-alpha", "handoff.json")
  const before = await readJson<Record<string, unknown>>(handoffPath)
  assert.equal(before.status, "awaiting_critic")

  const failed = await fixture.flow.execute({
    action: "submit_review",
    caseId: "case-alpha",
    verdict: "pass",
    findings: [],
    requiredFixes: [],
    evidence: ["tmp/not-declared.txt"],
  })
  assert.equal(failed.status, "failed")
  const after = await readJson<Record<string, unknown>>(handoffPath)
  assert.equal(after.status, "awaiting_critic")
  assert.equal(after.attempt_id, before.attempt_id)
  assert.equal(after.current_agent, before.current_agent)
})

test("a Case already marked failed receives a terminal failed handoff", async () => {
  const fixture = await preparedCase()
  const statePath = path.join(fixture.runsRoot, "case-alpha", "state.json")
  const state = await readJson<Record<string, unknown>>(statePath)
  state.status = "failed"
  await writeFile(statePath, `${JSON.stringify(state)}\n`)

  const result = await fixture.flow.execute({ action: "advance", caseId: "case-alpha" })
  assert.equal(result.status, "failed")
  const handoff = await readJson<Record<string, unknown>>(path.join(fixture.runsRoot, "case-alpha", "handoff.json"))
  assert.equal(handoff.status, "failed")
  assert.equal(handoff.current_agent, null)
  assert.equal(handoff.attempt_id, null)
})

test("Flow can block a failed Compute Attempt using its execution-result candidate", async () => {
  const fixture = await preparedCase()
  const analysis = await fixture.flow.execute({ action: "advance", caseId: "case-alpha" })
  const analysisRoot = path.join(fixture.runsRoot, "case-alpha", "attempts", "analysis", "001")
  await writeFile(path.join(analysisRoot, "problem-understanding.md"), "Understanding.\n")
  await writeFile(path.join(analysisRoot, "tasks.json"), JSON.stringify({ schema_version: 1, tasks: [{ id: "task-01", description: "Compute", requires_computation: true }] }))
  await writeFile(path.join(analysisRoot, "task-graph.json"), JSON.stringify({ schema_version: 1, tasks: [{ id: "task-01", depends_on: [], wave: 1 }] }))
  const modeler = await fixture.flow.execute({ action: "submit_review", caseId: "case-alpha", verdict: "pass", findings: [], requiredFixes: [], evidence: ["attempts/analysis/001/tasks.json"] })
  assert.equal(modeler.agent, "mm-modeler")

  const modelingRoot = path.join(fixture.runsRoot, "case-alpha", "attempts", "modeling", "001")
  await mkdir(path.join(modelingRoot, "retrieved-methods"), { recursive: true })
  await writeFile(path.join(modelingRoot, "modeling-scheme.md"), "# Model\n")
  await writeFile(path.join(modelingRoot, "retrieved-methods", "task-01.json"), JSON.stringify({ schema_version: 1, knowledge_source_id: "fixture", knowledge_source_hash: "a".repeat(64), query: "task-01", retrieval_mode: "fixture", candidates: [] }))
  const solver = await fixture.flow.execute({ action: "submit_review", caseId: "case-alpha", verdict: "pass", findings: [], requiredFixes: [], evidence: ["attempts/modeling/001/modeling-scheme.md"] })
  assert.equal(solver.agent, "mm-solver")

  const solverRoot = path.join(fixture.runsRoot, "case-alpha", "attempts", "solving", "task-01", "001")
  await mkdir(path.join(solverRoot, "code"), { recursive: true })
  await mkdir(path.join(solverRoot, "evidence"), { recursive: true })
  await writeFile(path.join(solverRoot, "code", "solve.py"), "raise RuntimeError('fixture')\n")
  await writeFile(path.join(solverRoot, "evidence", "compute-001-manifest.json"), JSON.stringify({ status: "failed", exit_code: 1, stderr: "fixture" }))
  const evidencePath = "attempts/solving/task-01/001/evidence/compute-001-manifest.json"
  await writeJsonAtomic(path.join(solverRoot, "execution-result.json"), {
    schema_version: 1,
    kind: "compute",
    path: evidencePath,
    sha256: await hashPath(path.join(solverRoot, "evidence", "compute-001-manifest.json")),
    created_at: "2026-08-12T00:00:00.000Z",
    status: "failed",
    exit_code: 1,
  })

  const blocked = await fixture.flow.execute({
    action: "submit_review",
    caseId: "case-alpha",
    verdict: "block",
    findings: ["compute failed"],
    requiredFixes: ["repair compute"],
    evidence: ["attempts/solving/task-01/001/execution-result.json"],
  })
  assert.equal(blocked.status, "blocked")
  assert.equal((await readJson<{ status: string }>(path.join(fixture.runsRoot, "case-alpha", "state.json"))).status, "blocked")
})

test("Plugin exposes six Tools and task hook corrects the pending directive", async () => {
  const root = await fixtureRoot()
  const problem = path.join(root, "problem.md")
  await writeFile(problem, "Plugin fixture.\n")
  const hooks = await mmAgentPlugin({ directory: root, worktree: root } as PluginInput)
  const config = {} as Config
  await hooks.config?.(config)
  assert.deepEqual(Object.keys(hooks.tool ?? {}).sort(), [
    "mm_agent_check",
    "mm_agent_compile",
    "mm_agent_compute",
    "mm_agent_flow",
    "mm_agent_hmml",
    "mm_agent_prepare",
  ])
  assert.deepEqual(Object.keys(config.agent ?? {}).sort(), ["mm-analyst", "mm-critic", "mm-modeler", "mm-solver", "mm-writer"])
  const flow = hooks.tool?.mm_agent_flow
  assert.ok(flow)
  const context = { directory: root, worktree: root, sessionID: "ses-formal", messageID: "msg", abort: new AbortController().signal } as never
  const prepare = hooks.tool?.mm_agent_prepare
  assert.ok(prepare)
  await prepare.execute({ case_id: "case-alpha", explicit_paths: ["problem.md"] }, context)
  const directive = JSON.parse(String(await flow.execute({ action: "advance", case_id: "case-alpha" }, context))) as { status: string; agent: string; description: string; prompt: string }
  assert.equal(directive.status, "task")
  const args = { subagent_type: "wrong", description: "wrong", prompt: "wrong", task_id: "wrong", command: "wrong", background: true }
  const argsIdentity = args
  await hooks["tool.execute.before"]?.({ tool: "task", sessionID: "ses-formal", callID: "call" }, { args })
  assert.equal(args, argsIdentity)
  assert.equal(args.subagent_type, directive.agent)
  assert.equal(args.description, directive.description)
  assert.equal(args.prompt, directive.prompt)
  assert.equal("task_id" in args, false)
  assert.equal("command" in args, false)
  assert.equal("background" in args, false)
  const unrelated = { subagent_type: "unrelated", description: "unrelated", prompt: "unrelated" }
  await hooks["tool.execute.before"]?.({ tool: "task", sessionID: "ses-other", callID: "call" }, { args: unrelated })
  assert.deepEqual(unrelated, { subagent_type: "unrelated", description: "unrelated", prompt: "unrelated" })
  const nonTask = { value: "unchanged" }
  await hooks["tool.execute.before"]?.({ tool: "mm_agent_flow", sessionID: "ses-formal", callID: "call" }, { args: nonTask })
  assert.deepEqual(nonTask, { value: "unchanged" })
  await hooks["tool.execute.after"]?.({ tool: "task", sessionID: "ses-formal", callID: "call", args }, { title: "", output: "", metadata: {} })
  const afterClear = { subagent_type: "after-clear", description: "after-clear", prompt: "after-clear" }
  await hooks["tool.execute.before"]?.({ tool: "task", sessionID: "ses-formal", callID: "call" }, { args: afterClear })
  assert.deepEqual(afterClear, { subagent_type: "after-clear", description: "after-clear", prompt: "after-clear" })
})

test("Agent prompt contracts are concise and skills remain four files", async () => {
  const configs = createAgentConfigs("/tmp/project", "/tmp/project")
  assert.equal(Object.keys(configs).length, 5)
  assert.match(configs["mm-critic"].prompt, /only verdict, findings, required_fixes, and evidence/u)
  assert.match(configs["mm-critic"].prompt, /solver Attempt.*execution-result\.json.*entry_script.*inputs.*outputs.*sha256/su)
  assert.match(configs["mm-critic"].prompt, /If kind is direct synthesis.*ordinary file.*without parsing it as a Runtime Evidence payload/su)
  assert.match(configs["mm-critic"].prompt, /missing or stale.*verdict must be revise.*required_fixes/su)
  assert.match(configs["mm-critic"].prompt, /context\.review\.required_reads.*context\.required_reads.*rubric.*Runtime Evidence JSON.*never use a directory.*context\.json.*manifest\.json.*runs\/<case-id>/su)
  assert.doesNotMatch(configs["mm-critic"].prompt, /schema_version|reviewed_at|attempt_id/u)
  const skillNames = (await readdir(path.join(repositoryRoot, "skills"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("mm-"))
    .map((entry) => entry.name)
    .sort()
  assert.deepEqual(skillNames, ["mm-agent", "mm-compute", "mm-hmml", "mm-report"])
})
