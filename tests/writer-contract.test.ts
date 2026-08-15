import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { createAgentConfigs } from "../src/agents.js"

const repositoryRoot = path.resolve(import.meta.dirname, "..")

test("Writer and Solver roles expose only their dedicated runtime Tools", () => {
  const configs = createAgentConfigs(repositoryRoot, repositoryRoot)
  const writer = configs["mm-writer"]
  const solver = configs["mm-solver"]
  assert.equal(writer.permission.mm_agent_compile, "allow")
  assert.equal(writer.permission.mm_agent_compute, "deny")
  assert.equal(writer.permission.mm_agent_case, "deny")
  assert.equal(writer.permission.mm_agent_flow, "deny")
  assert.equal(solver.permission.mm_agent_compute, "allow")
  assert.equal(solver.permission.mm_agent_compile, "deny")
  assert.equal(solver.permission.mm_agent_case, "deny")
  assert.equal(solver.permission.mm_agent_flow, "deny")
})

test("Agent prompts delegate path and machine metadata to the runtime Manifest", () => {
  const configs = createAgentConfigs(repositoryRoot, repositoryRoot)
  for (const name of ["mm-analyst", "mm-modeler", "mm-solver", "mm-writer"] as const) {
    assert.match(configs[name].prompt, /context\.json/u, name)
    assert.match(configs[name].prompt, /expected output/u, name)
    assert.doesNotMatch(configs[name].prompt, /reviewed_at|expected_revision/u, name)
  }
  assert.match(configs["mm-critic"].prompt, /only verdict, findings, required_fixes, and evidence/u)
  assert.doesNotMatch(configs["mm-critic"].prompt, /schema_version|attempt_id|reviewed_at/u)
})

test("Reporting Skill keeps the compile boundary without describing Gate internals", async () => {
  const skill = await readFile(path.join(repositoryRoot, "skills", "mm-report", "SKILL.md"), "utf8")
  assert.match(skill, /mm_agent_compile/u)
  assert.match(skill, /current Attempt/u)
  assert.match(skill, /main_tex/u)
  assert.doesNotMatch(skill, /expected_revision/u)
})
