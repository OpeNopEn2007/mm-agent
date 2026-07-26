import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

const repositoryRoot = path.resolve(import.meta.dirname, "..")

test("writerWorkDir derives the current Attempt directory from context.json", async () => {
  const runner = await readFile(path.join(repositoryRoot, "scripts", "run-golden-case.mjs"), "utf8")
  assert.match(runner, /function writerWorkDir\(contextPath\)/u)
  assert.match(runner, /return match\[1\]/u)
  const block = runner.match(/function writerWorkDir[\s\S]+?\n\}/u)
  assert.ok(block, "writerWorkDir definition is present")
  const fn = new Function(`${block[0]}\nreturn writerWorkDir;`)()
  assert.equal(fn("attempts/reporting/002/context.json"), "attempts/reporting/002")
  assert.equal(fn("attempts\\reporting\\002\\context.json"), "attempts/reporting/002")
  assert.throws(() => fn("attempts/reporting/002/main.tex"), /attempts\/reporting\/<NNN>\/context\.json/u)
  assert.throws(() => fn("attempts/solving/task-01/001/context.json"), /attempts\/reporting\/<NNN>\/context\.json/u)
  assert.throws(() => fn("/abs/path/attempts/reporting/002/context.json"), /attempts\/reporting\/<NNN>\/context\.json/u)
})

test("rebaseRequiredFixes rewrites the previous Attempt base to the current Attempt base", async () => {
  const runner = await readFile(path.join(repositoryRoot, "scripts", "run-golden-case.mjs"), "utf8")
  const rebase = runner.match(/function rebaseAttemptPath[\s\S]+?\n\}/u)
  const fixes = runner.match(/function rebaseRequiredFixes[\s\S]+?\n\}/u)
  assert.ok(rebase, "rebaseAttemptPath definition is present")
  assert.ok(fixes, "rebaseRequiredFixes definition is present")
  const fn = new Function(`${rebase![0]}\n${fixes![0]}\nreturn rebaseRequiredFixes;`)()
  assert.deepEqual(
    fn(["rewrite attempts/reporting/001/main.tex", "see attempts/reporting/001/evidence/compile-001.json"], "attempts/reporting/001", "attempts/reporting/002"),
    ["rewrite attempts/reporting/002/main.tex", "see attempts/reporting/002/evidence/compile-001.json"],
  )
  assert.deepEqual(fn(["untouched path"], "attempts/reporting/001", "attempts/reporting/002"), ["untouched path"])
  assert.deepEqual(fn([], "attempts/reporting/001", "attempts/reporting/002"), [])
  assert.deepEqual(fn(["x"], "attempts/reporting/002", "attempts/reporting/002"), ["x"])
  assert.deepEqual(fn(undefined, "attempts/reporting/001", "attempts/reporting/002"), [])
})

test("writerCompileContract pins work_dir and main_tex and forbids absolute and prior paths", async () => {
  const runner = await readFile(path.join(repositoryRoot, "scripts", "run-golden-case.mjs"), "utf8")
  assert.match(runner, /const writerCompileContract = \(contextPath\) =>/u)
  const work = runner.match(/function writerWorkDir[\s\S]+?\n\}/u)
  const block = runner.match(/const writerCompileContract = \(contextPath\) =>[\s\S]+?\n\}/u)
  assert.ok(block, "writerCompileContract definition is present")
  assert.ok(work, "writerWorkDir definition is present")
  const fn = new Function(`${work![0]}\n${block![0]}\nreturn writerCompileContract;`)()
  const prompt = fn("attempts/reporting/002/context.json")
  assert.match(prompt, /attempts\/reporting\/002/u)
  assert.match(prompt, /Never pass an absolute path/u)
  assert.match(prompt, /or any other reporting Attempt directory/u)
  assert.match(prompt, /main_tex must be the literal string main\.tex/u)
  assert.match(prompt, /Do not call mm_agent_case, do not call Gate/u)
})

test("Writer prompt forbids child Gate calls and nested task dispatch", async () => {
  const runner = await readFile(path.join(repositoryRoot, "scripts", "run-golden-case.mjs"), "utf8")
  const agents = await readFile(path.join(repositoryRoot, "src", "agents.ts"), "utf8")
  const skill = await readFile(path.join(repositoryRoot, "skills", "mm-report", "SKILL.md"), "utf8")
  for (const [name, source] of [["runner", runner], ["agents", agents], ["skill", skill]]) {
    assert.match(source, /(do not call|never calls?) .*mm_agent_case/iu, name)
    assert.match(source, /(do not call|never calls?) .*Gate/iu, name)
    assert.match(source, /(do not dispatch|never dispatches)/iu, name)
    assert.match(source, /delegate/iu, name)
  }
  const writerPrompt = agents.match(/"mm-writer":[\s\S]+?permission: actorPermissions\(["']runs\/\*\/attempts\/reporting\/\*\/\*\*["'], ["']mm-report["']/u)
  assert.ok(writerPrompt, "mm-writer prompt is present in agents.ts")
  assert.match(writerPrompt[0], /work_dir must be exactly the current Attempt directory/u)
  assert.match(writerPrompt[0], /main_tex must be the literal string main\.tex/u)
  assert.match(writerPrompt[0], /do not call mm_agent_case, do not call Gate/iu)
  assert.match(writerPrompt[0], /do not dispatch a new Attempt/iu)
})

test("Writer dispatcher prompt says the child must not call Gate or nested task", async () => {
  const runner = await readFile(path.join(repositoryRoot, "scripts", "run-golden-case.mjs"), "utf8")
  const dispatcher = runner.match(/function actorChildInstructions[\s\S]+?\n\}/u)
  const allowlist = runner.match(/function actorToolAllowlist[\s\S]+?\n\}/u)
  const contract = runner.match(/const actorDispatchContract = \(role, contextPath\) => `[\s\S]+?`/u)
  assert.ok(dispatcher, "actorChildInstructions is present")
  assert.ok(allowlist, "actorToolAllowlist is present")
  assert.ok(contract, "actorDispatchContract is present")
  const fn = new Function(`${allowlist![0]}\n${contract![0]};\n${dispatcher![0]}\nreturn actorChildInstructions;`)()
  const writerPrompt = fn("writer", "attempts/reporting/002/context.json", "do the work")
  assert.match(writerPrompt, /Use built-in task exactly once/u)
  assert.match(writerPrompt, /mm-writer/u)
  assert.match(writerPrompt, /must not call any other mm_agent Tool/u)
  assert.match(writerPrompt, /must never call mm_agent_case/u)
  assert.match(writerPrompt, /attempts\/reporting\/002/u)
  const solverPrompt = fn("solver", "attempts/solving/task-01/001/context.json", "do the work")
  assert.match(solverPrompt, /must not call any other mm_agent Tool/u)
  assert.match(solverPrompt, /must never call mm_agent_case/u)
})

test("Actor tool allowlist pins exactly one mm_agent Tool per non-analyst role", async () => {
  const runner = await readFile(path.join(repositoryRoot, "scripts", "run-golden-case.mjs"), "utf8")
  const allowlistBlock = runner.match(/function actorToolAllowlist[\s\S]+?\n\}/u)
  const dispatcherBlock = runner.match(/function actorChildInstructions[\s\S]+?\n\}/u)
  const contractBlock = runner.match(/const actorDispatchContract = \(role, contextPath\) => `[\s\S]+?`/u)
  assert.ok(allowlistBlock, "actorToolAllowlist is present")
  assert.ok(dispatcherBlock, "actorChildInstructions is present")
  assert.ok(contractBlock, "actorDispatchContract is present")
  const source = `${allowlistBlock![0]}\n${contractBlock![0]};\n${dispatcherBlock![0]}\nreturn { allowlist: actorToolAllowlist, build: actorChildInstructions };`
  const { allowlist, build } = new Function(source)()
  assert.deepEqual(allowlist("analyst"), { allow: [], forbid: "any" })
  assert.deepEqual(allowlist("modeler"), { allow: ["mm_agent_hmml"], forbid: ["mm_agent_compute", "mm_agent_compile", "mm_agent_case"] })
  assert.deepEqual(allowlist("solver"), { allow: ["mm_agent_compute"], forbid: ["mm_agent_hmml", "mm_agent_compile", "mm_agent_case"] })
  assert.deepEqual(allowlist("writer"), { allow: ["mm_agent_compile"], forbid: ["mm_agent_hmml", "mm_agent_compute", "mm_agent_case"] })
  for (const role of ["analyst", "modeler", "solver", "writer"] as const) {
    const prompt = build(role, "attempts/reporting/002/context.json", "follow the contract")
    assert.match(prompt, /must not call any (other )?mm_agent Tool/u, role)
    assert.match(prompt, /must never call mm_agent_case/u, role)
    assert.match(prompt, /must never call Gate/u, role)
    assert.match(prompt, /must never call built-in task/u, role)
    assert.match(prompt, /must never nest delegation/u, role)
  }
  assert.match(build("analyst", "attempts/reporting/002/context.json", "x"), /must not call any mm_agent Tool/u)
  assert.match(build("modeler", "attempts/reporting/002/context.json", "x"), /mm_agent_hmml/u)
  assert.match(build("modeler", "attempts/reporting/002/context.json", "x"), /must not call mm_agent_compute, mm_agent_compile, mm_agent_case/u)
  assert.match(build("solver", "attempts/reporting/002/context.json", "x"), /mm_agent_compute/u)
  assert.match(build("solver", "attempts/reporting/002/context.json", "x"), /must not call mm_agent_hmml, mm_agent_compile, mm_agent_case/u)
  assert.match(build("writer", "attempts/reporting/002/context.json", "x"), /mm_agent_compile/u)
  assert.match(build("writer", "attempts/reporting/002/context.json", "x"), /must not call mm_agent_hmml, mm_agent_compute, mm_agent_case/u)
})

test("stage() rewrites required_fixes after the next dispatch lands (no empty previous base, no stale paths)", async () => {
  const runner = await readFile(path.join(repositoryRoot, "scripts", "run-golden-case.mjs"), "utf8")
  const rebase = runner.match(/function rebaseAttemptPath[\s\S]+?\n\}/u)
  const fixes = runner.match(/function rebaseRequiredFixes[\s\S]+?\n\}/u)
  const builder = runner.match(/function buildStageActorInstructions[\s\S]+?\n\}/u)
  assert.ok(rebase, "rebaseAttemptPath is present")
  assert.ok(fixes, "rebaseRequiredFixes is present")
  assert.ok(builder, "buildStageActorInstructions is present")
  const source = `${rebase![0]}\n${fixes![0]}\n${builder![0]}\nreturn buildStageActorInstructions;`
  const buildStageActorInstructions = new Function(source)()

  // First iteration: no pendingRevision → prompt is the base instruction only.
  const base = (contextPath: string) => `Writer contract for ${contextPath}: call mm_agent_compile(work_dir=...)`
  const firstPrompt = buildStageActorInstructions(base("attempts/reporting/002/context.json"), "attempts/reporting/002", null)
  assert.equal(firstPrompt, base("attempts/reporting/002/context.json"))
  assert.doesNotMatch(firstPrompt, /Rewrite every path/u)
  assert.doesNotMatch(firstPrompt, /previous Attempt/u)
  assert.doesNotMatch(firstPrompt, /attempts\/reporting\/001/u)

  // Gate revise on reporting-001 → record pendingRevision (no prompt yet, no empty base).
  const pendingRevision = {
    previousAttemptBase: "attempts/reporting/001",
    requiredFixes: [
      "rewrite attempts/reporting/001/main.tex to drop \\input{attempts/reporting/001/old.tex}",
      "rerun mm_agent_compile under attempts/reporting/001",
    ],
  }
  // null pendingRevision is the no-revision case → returns the base instructions unchanged.
  assert.equal(buildStageActorInstructions("base", "attempts/reporting/002", null), "base")
  // pendingRevision without a previousAttemptBase is rejected so we never produce "previous Attempt under ;".
  assert.throws(() => buildStageActorInstructions("base", "attempts/reporting/002", { previousAttemptBase: "", requiredFixes: ["x"] }), /revision requires both/u)
  assert.throws(() => buildStageActorInstructions("base", "", pendingRevision), /revision requires both/u)

  // Second dispatch lands as reporting-002 → assemble prompt with rebased fixes.
  const secondPrompt = buildStageActorInstructions(base("attempts/reporting/002/context.json"), "attempts/reporting/002", pendingRevision)
  assert.match(secondPrompt, /attempts\/reporting\/002\/main\.tex/u)
  assert.match(secondPrompt, /attempts\/reporting\/002/u)
  assert.match(secondPrompt, /Rewrite every path from attempts\/reporting\/001 to attempts\/reporting\/002/u)
  assert.match(secondPrompt, /do not write under attempts\/reporting\/001/u)
  assert.doesNotMatch(secondPrompt, /previous Attempt under ;/u)
  assert.doesNotMatch(secondPrompt, /attempts\/reporting\/001\/main\.tex/u)
  assert.doesNotMatch(secondPrompt, /attempts\/reporting\/001\/old\.tex/u)
  assert.doesNotMatch(secondPrompt, /attempts\/reporting\/001"\)/u)

  // Empty required_fixes still produces a clean prompt (no empty "previous Attempt under ;").
  const emptyFixPrompt = buildStageActorInstructions("base", "attempts/reporting/002", { previousAttemptBase: "attempts/reporting/001", requiredFixes: [] })
  assert.doesNotMatch(emptyFixPrompt, /previous Attempt under ;/u)
  assert.doesNotMatch(emptyFixPrompt, /attempts\/reporting\/001\/main\.tex/u)
  assert.match(emptyFixPrompt, /all required fixes were already satisfied/u)
})