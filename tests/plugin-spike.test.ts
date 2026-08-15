import { tool, type Config, type PluginInput, type ToolContext } from "@opencode-ai/plugin"
import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"
const packageUrl = new URL("../package.json", import.meta.url)
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url))

async function loadPlugin() {
  return (await import("../src/index.js")).default
}

async function loadInstaller() {
  return import("../src/install.js")
}

function runtimeEnvironment(root: string): NodeJS.ProcessEnv {
  const inherited = { ...process.env }
  const configOverrides = new Set(["OPENCODE_CONFIG", "OPENCODE_CONFIG_DIR", "OPENCODE_CONFIG_CONTENT"])
  for (const key of Object.keys(inherited)) {
    if (configOverrides.has(key.toUpperCase())) delete inherited[key]
  }
  return {
    ...inherited,
    XDG_CONFIG_HOME: path.join(root, "config-home"),
    XDG_DATA_HOME: path.join(root, "data-home"),
    XDG_CACHE_HOME: path.join(root, "cache-home"),
    XDG_STATE_HOME: path.join(root, "state-home"),
    OPENCODE_DISABLE_MODELS_FETCH: "1",
  }
}

function runtimeModelArgs(): string[] {
  if (process.env.MM_AGENT_HOST_RUNTIME === "1") {
    const model = process.env.MM_AGENT_HOST_TEST_MODEL
    if (!model) return []
    const args = ["--model", model]
    if (process.env.MM_AGENT_HOST_TEST_VARIANT) args.push("--variant", process.env.MM_AGENT_HOST_TEST_VARIANT)
    return args
  }
  return ["--model", "minimax/MiniMax-M3", "--variant", "thinking", "--thinking"]
}

const runtimeModelEnabled = process.env.MM_AGENT_RUNTIME === "1" && Boolean(process.env.MM_AGENT_MINIMAX_API_KEY)
const runtimeHostModelEnabled = process.env.MM_AGENT_HOST_RUNTIME === "1"

async function configureRuntimeModel(configRoot: string): Promise<void> {
  const configPath = path.join(configRoot, "opencode.json")
  const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>
  config.model = "minimax/MiniMax-M3"
  config.provider = {
    minimax: {
      name: "MiniMax",
      npm: "@ai-sdk/openai-compatible",
      options: {
        apiKey: process.env.MM_AGENT_MINIMAX_API_KEY,
        baseURL: process.env.MM_AGENT_MINIMAX_API_HOST ?? "https://api.minimaxi.com/v1",
        setCacheKey: true,
      },
      models: { "MiniMax-M3": { name: "MiniMax M3", limit: { context: 512000, output: 128000 } } },
    },
  }
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`)
}

function findOpenCodeBinary(): string {
  if (process.env.OPENCODE_BIN) return process.env.OPENCODE_BIN
  if (process.platform === "win32") {
    const located = spawnSync("where.exe", ["opencode.cmd"], { encoding: "utf8" })
    assert.equal(located.status, 0, "installed opencode.cmd was not found on PATH")
    const wrapper = located.stdout.split(/\r?\n/u).find(Boolean)
    assert.ok(wrapper)
    const binary = path.join(path.dirname(wrapper), "node_modules", "opencode-ai", "bin", "opencode.exe")
    assert.equal(existsSync(binary), true, `installed OpenCode binary not found beside ${wrapper}`)
    return binary
  }

  const located = spawnSync("sh", ["-c", "command -v opencode"], { encoding: "utf8" })
  assert.equal(located.status, 0, "installed opencode was not found on PATH")
  return located.stdout.trim()
}

function sanitizeRuntimeOutput(value: string): string {
  return value
    .replace(/([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*)(\s*[:=]\s*)[^\s,}]+/giu, "$1$2[REDACTED]")
    .slice(0, 4000)
}

function normalizeModelMarkerText(parts: Array<string | undefined>): string {
  const text = parts.join("").trim()
  const inlineCode = /^`([^`\r\n]+)`$/u.exec(text)
  if (inlineCode?.[1]) return inlineCode[1].trim()
  const fencedCode = [...text.matchAll(/```(?:text)?\s*([\s\S]*?)\s*```/gu)]
  return (fencedCode.length === 1 ? fencedCode[0]?.[1] : text)?.trim() ?? ""
}

function matchesCompletionMarker(text: string | undefined, marker: string): boolean {
  const normalized = normalizeModelMarkerText([text])
  return normalized === marker || normalized === `${marker}.` || normalized === `${marker}。` || normalized === `${marker}!`
}

function runRuntimeProcess(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeout = 120_000,
) {
  return spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    timeout,
    maxBuffer: 20 * 1024 * 1024,
  })
}

function assertRuntimeSuccess(
  result: ReturnType<typeof spawnSync>,
  label: string,
): asserts result is ReturnType<typeof spawnSync> & { stdout: string; stderr: string } {
  assert.equal(
    result.status,
    0,
    `${label} failed: ${sanitizeRuntimeOutput(String(result.stderr ?? ""))}`,
  )
  assert.equal(typeof result.stdout, "string")
  assert.equal(typeof result.stderr, "string")
}

async function acquireWindowsReadLock(filePath: string): Promise<() => Promise<void>> {
  assert.equal(process.platform, "win32", "deterministic transaction lock is Windows-specific")
  const quotedPath = filePath.replaceAll("'", "''")
  const script = [
    `$stream = [System.IO.File]::Open('${quotedPath}',`,
    "[System.IO.FileMode]::Open,",
    "[System.IO.FileAccess]::Read,",
    "[System.IO.FileShare]::Read);",
    "[Console]::Out.WriteLine('LOCKED');",
    "[Console]::Out.Flush();",
    "try { Start-Sleep -Seconds 300 } finally { $stream.Dispose() }",
  ].join(" ")
  const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    stdio: ["ignore", "pipe", "pipe"],
  })
  let stderr = ""
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk)
  })
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out acquiring file lock: ${stderr}`)), 10_000)
    child.stdout.on("data", (chunk) => {
      if (!String(chunk).includes("LOCKED")) return
      clearTimeout(timer)
      resolve()
    })
    child.once("exit", (code) => {
      clearTimeout(timer)
      reject(new Error(`file-lock process exited ${code}: ${stderr}`))
    })
  })
  return async () => {
    if (child.exitCode === null) child.kill()
    if (child.exitCode !== null) return
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve())
      setTimeout(resolve, 5_000)
    })
  }
}

async function transactionArtifacts(configRoot: string): Promise<string[]> {
  try {
    return (await readdir(configRoot, { recursive: true }))
      .filter((entry) => entry.includes(".mm-agent-tmp-") || entry.includes(".mm-agent-backup-"))
      .sort()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
}

async function readOptionalFile(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw error
  }
}

test("package shape declares the Step 1 ESM distribution surface", async () => {
  const packageJson = JSON.parse(await readFile(packageUrl, "utf8")) as {
    name?: string
    version?: string
    description?: string
    license?: string
    repository?: { type?: string; url?: string }
    type?: string
    main?: string
    types?: string
    bin?: Record<string, string>
    scripts?: Record<string, string>
    files?: string[]
  }

  assert.equal(packageJson.name, "mm-agent")
  assert.equal(packageJson.version, "0.1.0")
  assert.ok(packageJson.description)
  assert.equal(packageJson.license, "MIT")
  assert.deepEqual(packageJson.repository, {
    type: "git",
    url: "git+https://github.com/OpeNopEn2007/mm-agent.git",
  })
  assert.equal(packageJson.type, "module")
  assert.equal(packageJson.main, "./dist/index.js")
  assert.equal(packageJson.types, "./dist/index.d.ts")
  assert.deepEqual(packageJson.bin, { "mm-agent-opencode": "./dist/install.js" })
  assert.deepEqual(Object.keys(packageJson.scripts ?? {}).sort(), ["build", "golden", "test", "test:runtime", "validate-config"])
  assert.deepEqual(packageJson.files, [
    "dist",
    "skills",
    "rubrics",
    "runtime",
    "!runtime/tests",
    "!runtime/evaluation",
    "!runtime/**/__pycache__",
    "!runtime/.pytest_cache",
    "knowledge",
    "templates/cumcmthesis",
    "templates/mcmthesis",
    "THIRD_PARTY_NOTICES.md",
  ])
})

test("runtime environment strips OpenCode config overrides but preserves provider credentials", () => {
  const keys = ["OPENCODE_CONFIG", "OPENCODE_CONFIG_DIR", "OPENCODE_CONFIG_CONTENT", "MM_AGENT_TEST_PROVIDER_API_KEY"] as const
  const previous = new Map(keys.map((key) => [key, process.env[key]]))
  process.env.OPENCODE_CONFIG = "outside-config.json"
  process.env.OPENCODE_CONFIG_DIR = "outside-config-directory"
  process.env.OPENCODE_CONFIG_CONTENT = "outside-inline-config"
  process.env.MM_AGENT_TEST_PROVIDER_API_KEY = "provider-credential-sentinel"
  try {
    const root = path.join(os.tmpdir(), "mm-agent-runtime-env")
    const env = runtimeEnvironment(root)
    assert.equal(env.OPENCODE_CONFIG, undefined)
    assert.equal(env.OPENCODE_CONFIG_DIR, undefined)
    assert.equal(env.OPENCODE_CONFIG_CONTENT, undefined)
    assert.equal(env.MM_AGENT_TEST_PROVIDER_API_KEY, "provider-credential-sentinel")
    assert.equal(env.OPENCODE_DISABLE_MODELS_FETCH, "1")
    assert.equal(env.XDG_CONFIG_HOME, path.join(root, "config-home"))
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test("runtime marker normalization accepts one fenced value with model narration", () => {
  assert.equal(
    normalizeModelMarkerText([
      "The value of the marker field is:\n\n```\nMM_AGENT_MARKER\n```",
    ]),
    "MM_AGENT_MARKER",
  )
  assert.equal(
    normalizeModelMarkerText(["prefix ```one``` suffix ```two```"]),
    "prefix ```one``` suffix ```two```",
  )
})

test("completion markers accept one terminal punctuation mark and no surrounding explanation", () => {
  const marker = "MM_AGENT_STEP6_SESSION1_DONE"
  for (const value of [marker, `${marker}.`, `${marker}。`, `\n\`${marker}\`\n`, `\`\`\`\n${marker}\n\`\`\``])
    assert.equal(matchesCompletionMarker(value, marker), true, value)
  for (const value of [`Completed: ${marker}`, `${marker} complete`, "MM_AGENT_STEP6_SESSION1_DONE_EXTRA"])
    assert.equal(matchesCompletionMarker(value, marker), false, value)
})

test("npm pack dry run contains the intended distribution surface", () => {
  const npmCli = process.env.npm_execpath
  assert.ok(npmCli)
  const build = spawnSync(process.execPath, [npmCli, "run", "build"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })
  assert.equal(build.status, 0, `${build.stdout}${build.stderr}`)
  const result = spawnSync(process.execPath, [npmCli, "pack", "--dry-run", "--json"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })
  assert.equal(result.status, 0, result.stderr)
  const packs = JSON.parse(result.stdout) as Array<{ files?: Array<{ path?: string }> }>
  const files = (packs[0]?.files ?? []).map((file) => file.path ?? "")
  for (const required of [
    "LICENSE",
    "README.md",
    "THIRD_PARTY_NOTICES.md",
    "dist/index.js",
    "dist/install.js",
    "dist/tools/check.js",
    "dist/tools/compile.js",
    "dist/tools/compute.js",
    "dist/tools/hmml.js",
    "dist/tools/prepare.js",
    "runtime/hmml_benchmark.py",
    "runtime/hmml_build.py",
    "runtime/hmml_common.py",
    "runtime/hmml_download.py",
    "runtime/hmml_recalculate.py",
    "runtime/hmml_retrieve.py",
    "runtime/hmml_review.py",
    "runtime/hmml_select.py",
    "runtime/pyproject.toml",
    "runtime/uv.lock",
    "skills/mm-agent/SKILL.md",
    "rubrics/analysis.md",
    "rubrics/modeling.md",
    "rubrics/solving.md",
    "rubrics/reporting.md",
  ]) {
    assert.ok(files.includes(required), required)
  }
  assert.ok(files.some((file) => file.startsWith("templates/cumcmthesis/")))
  assert.ok(files.some((file) => file.startsWith("templates/mcmthesis/")))
  assert.equal(files.includes("templates/report-generator.py"), false)
  assert.equal(
    files.some((file) => /(^|\/)(?:node_modules|runs|\.cache|\.config|\.git|\.worktrees)(?:\/|$)|\.(?:log|env)$/u.test(file)),
    false,
  )
  assert.equal(files.some((file) => /(^|\/)(?:__pycache__|tests)(?:\/|$)|\.pyc$/u.test(file)), false)
  assert.equal(files.some((file) => /(^|\/)(?:evaluation|prompts|scripts|servers)(?:\/|$)|requirements\.txt$/u.test(file)), false)
})

test("golden command invokes the Step 7 runner", async () => {
  const packageJson = JSON.parse(await readFile(packageUrl, "utf8")) as { scripts?: Record<string, string> }
  assert.equal(packageJson.scripts?.golden, "node scripts/run-golden-case.mjs")
  const runner = await readFile(path.join(repositoryRoot, "scripts", "run-golden-case.mjs"), "utf8")
  assert.match(runner, /mm_agent_compute/u)
  assert.match(runner, /mm_agent_compile/u)
  assert.match(runner, /runCaseAction/u)
  assert.match(runner, /multi-wave/u)
  assert.match(runner, /MM-Bench requires/u)
})

test("Skills expose the four-stage workflow without a second public command", async () => {
  const skill = await readFile(path.join(repositoryRoot, "skills", "mm-agent", "SKILL.md"), "utf8")
  assert.match(skill, /mm_agent_check/u)
  assert.match(skill, /mm_agent_prepare/u)
  assert.match(skill, /mm_agent_flow/u)
  assert.match(skill, /mm-critic/u)
  assert.match(skill, /四个语义字段/u)
  assert.match(skill, /要恢复一个已有 case/u)
  assert.match(skill, /`case_id`.*不传新的显式路径或 `revision_budget`/u)
  assert.match(skill, /持久化的不可变输入 manifest、policy、state 和 revision budget 是权威/u)
  assert.match(skill, /不要重新提交输入路径或 budget/u)
  assert.doesNotMatch(skill, /expected_revision/u)
  assert.doesNotMatch(skill, /schema_version: 1/u)
  assert.match(skill, /唯一的用户命令是 `\/mm-agent`；不要发明其他 slash command/u)
  for (const name of ["mm-hmml", "mm-compute", "mm-report"]) {
    const installed = await readFile(path.join(repositoryRoot, "skills", name, "SKILL.md"), "utf8")
    assert.match(installed, new RegExp(`name: ${name}`, "u"))
  }
})

test("build emits a loadable ESM Plugin entry and declarations", async () => {
  const npmCli = process.env.npm_execpath
  assert.ok(npmCli)
  await rm(path.join(repositoryRoot, "dist"), { recursive: true, force: true })
  const result = spawnSync(process.execPath, [npmCli, "run", "build"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })

  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`)
  for (const file of ["index.js", "index.d.ts", "install.js", "install.d.ts"]) {
    assert.equal(existsSync(path.join(repositoryRoot, "dist", file)), true, file)
  }
  const module = await import(`${pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href}?test=${Date.now()}`)
  assert.equal(typeof module.default, "function")
})

test("config hook injects five hidden least-privilege stage subagents", async () => {
  const mmAgentPlugin = await loadPlugin()
  const hooks = await mmAgentPlugin({ directory: repositoryRoot, worktree: repositoryRoot } as PluginInput)
  const config = {} as Config

  await hooks.config?.(config)

  assert.deepEqual(Object.keys(config.agent ?? {}).sort(), ["mm-analyst", "mm-critic", "mm-modeler", "mm-solver", "mm-writer"])
  for (const [name, agent] of Object.entries(config.agent ?? {})) {
    assert.equal(agent.hidden, true, name)
    assert.equal(agent.mode, "subagent", name)
    assert.equal(agent.permission?.task, "deny", name)
    assert.equal(agent.permission?.mm_agent_case, "deny", name)
    assert.equal(agent.permission?.["*"], "deny", name)
    for (const tool of ["webfetch", "websearch", "lsp", "external_directory", "question"])
      assert.equal(agent.permission?.[tool], "deny", `${name}:${tool}`)
  }
  assert.equal(config.agent?.["mm-critic"]?.permission?.edit, "deny")
  const expectedAttempts = {
    "mm-analyst": "runs/*/attempts/analysis/*/**",
    "mm-modeler": "runs/*/attempts/modeling/*/**",
    "mm-solver": "runs/*/attempts/solving/*/*/**",
    "mm-writer": "runs/*/attempts/reporting/*/**",
  }
  for (const [name, attempt] of Object.entries(expectedAttempts)) {
    const edit = config.agent?.[name]?.permission?.edit as Record<string, string>
    assert.deepEqual(Object.keys(edit), ["*", attempt, `${attempt}/context.json`, `${attempt}/review.json`])
    assert.equal(edit["*"], "deny")
    assert.equal(edit[attempt], "allow")
    assert.equal(edit[`${attempt}/context.json`], "deny")
    assert.equal(edit[`${attempt}/review.json`], "deny")
    assert.equal(edit["runs/*/state.json"], undefined)
    assert.equal(edit["runs/*/artifacts/**"], undefined)
    assert.equal(edit["runs/*/tasks/**"], undefined)
    assert.equal(edit["runs/*/report/**"], undefined)
  }
  assert.deepEqual(config.agent?.["mm-analyst"]?.permission?.skill, { "*": "deny" })
  assert.deepEqual(config.agent?.["mm-modeler"]?.permission?.skill, { "*": "deny", "mm-hmml": "allow" })
  assert.deepEqual(config.agent?.["mm-solver"]?.permission?.skill, { "*": "deny", "mm-compute": "allow" })
  assert.match(config.agent?.["mm-solver"]?.prompt ?? "", /Computational Solver/u)
  assert.match(config.agent?.["mm-solver"]?.prompt ?? "", /current_task\.requires_computation is false/u)
  assert.match(config.agent?.["mm-solver"]?.prompt ?? "", /direct synthesis result/u)
  assert.match(config.agent?.["mm-solver"]?.prompt ?? "", /do not create evidence\//u)
  assert.deepEqual(config.agent?.["mm-writer"]?.permission?.skill, { "*": "deny", "mm-report": "allow" })
  assert.deepEqual(config.agent?.["mm-critic"]?.permission?.skill, { "*": "deny" })
  const criticPrompt = config.agent?.["mm-critic"]?.prompt ?? ""
  assert.match(criticPrompt, /only verdict, findings, required_fixes, and evidence/u)
  assert.match(criticPrompt, /declared candidate execution-result\.json/u)
  assert.match(criticPrompt, /raw payload/u)
  assert.match(criticPrompt, /If kind is direct synthesis/u)
  assert.match(criticPrompt, /without parsing it as a Runtime Evidence payload/u)
  assert.match(criticPrompt, /never use a directory, context\.json, manifest\.json/u)
  assert.match(criticPrompt, /valid Runtime Evidence JSON envelope/u)
  assert.doesNotMatch(criticPrompt, /schema_version|reviewed_at|attempt_id/u)
  const analystPrompt = config.agent?.["mm-analyst"]?.prompt ?? ""
  for (const required of ["\"tasks\"", "depends_on", "wave", "Do not use waves, task_ids, or dependencies", "never add wave, depends_on, input_paths, or output_paths"])
    assert.match(analystPrompt, new RegExp(required, "u"))
  assert.match(analystPrompt, /post-modeling domain-solving DAG consumed by mm-solver/u)
  assert.match(analystPrompt, /accepted modeling artifacts and direct dependency memory/u)
  assert.match(analystPrompt, /fixed Analysis, Modeling, Reporting\/LaTeX compile, Writer, Critic, Gate, and Flow stages remain harness-owned/u)
})

test("config hook preserves an existing same-name agent unchanged", async () => {
  const userAgent = {
    description: "User-defined spike agent",
    mode: "subagent" as const,
    hidden: false,
    model: "example/user-model",
    permission: { read: "deny" as const },
  }
  const config = { agent: { "mm-analyst": userAgent } } as Config
  const mmAgentPlugin = await loadPlugin()
  const hooks = await mmAgentPlugin({ directory: repositoryRoot, worktree: repositoryRoot } as PluginInput)

  await hooks.config?.(config)

  assert.strictEqual(config.agent?.["mm-analyst"], userAgent)
  assert.deepEqual(config.agent?.["mm-analyst"], userAgent)
})

test("Plugin registers the six deterministic Tools", async () => {
  const mmAgentPlugin = await loadPlugin()
  const hooks = await mmAgentPlugin({ directory: repositoryRoot, worktree: repositoryRoot } as PluginInput)

  assert.deepEqual(Object.keys(hooks.tool ?? {}).sort(), [
    "mm_agent_check",
    "mm_agent_compile",
    "mm_agent_compute",
    "mm_agent_flow",
    "mm_agent_hmml",
    "mm_agent_prepare",
  ])
  assert.match(hooks.tool?.mm_agent_check?.description ?? "", /structured evidence/i)
  assert.match(hooks.tool?.mm_agent_prepare?.description ?? "", /CaseContextStore\.open/i)
  assert.match(hooks.tool?.mm_agent_flow?.description ?? "", /formal mm-agent runtime/i)
  assert.match(hooks.tool?.mm_agent_hmml?.description ?? "", /BM25 fallback/i)
  assert.match(hooks.tool?.mm_agent_compute?.description ?? "", /Runtime Evidence/i)
  assert.match(hooks.tool?.mm_agent_compile?.description ?? "", /latexmk/i)
})

test("check Tool uses the real execution directory for the Case write probe", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "mm-agent-check-tool-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const mmAgentPlugin = await loadPlugin()
  const hooks = await mmAgentPlugin({ directory: "wrong-plugin-directory", worktree: "wrong-plugin-worktree" } as PluginInput)
  const definition = hooks.tool?.mm_agent_check
  assert.ok(definition)

  const output = JSON.parse(await definition.execute(
    { scope: "case", case_id: "case-tool" },
    { directory, worktree: directory } as ToolContext,
  ) as string) as { ok: boolean; checks: Array<Record<string, unknown>> }
  assert.equal(output.ok, true)
  assert.deepEqual(output.checks.map((check) => check.id), ["case-write"])
  assert.match(String(output.checks[0]?.evidence), new RegExp(directory.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"))
})

test("prepare Tool snapshots relative explicit input and resumes it", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "mm-agent-prepare-tool-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await writeFile(path.join(directory, "problem.md"), "tool input\n")
  const mmAgentPlugin = await loadPlugin()
  const hooks = await mmAgentPlugin({ directory, worktree: directory } as PluginInput)
  const definition = hooks.tool?.mm_agent_prepare
  assert.ok(definition)

  const created = JSON.parse(await definition.execute(
    { case_id: "case-tool", explicit_paths: ["problem.md"] },
    { directory, worktree: directory } as ToolContext,
  ) as string) as { ok: boolean; result?: { mode?: string } }
  assert.equal(created.ok, true)
  assert.equal(created.result?.mode, "created")

  const resumed = JSON.parse(await definition.execute(
    { case_id: "case-tool" },
    { directory, worktree: directory } as ToolContext,
  ) as string) as { ok: boolean; result?: { mode?: string } }
  assert.equal(resumed.ok, true)
  assert.equal(resumed.result?.mode, "resumed")
  assert.equal(await readFile(path.join(directory, "problem.md"), "utf8"), "tool input\n")

  const invalid = JSON.parse(await definition.execute(
    { case_id: "../invalid" },
    { directory, worktree: directory } as ToolContext,
  ) as string) as { ok: boolean; error?: { code?: string; repair?: string } }
  assert.equal(invalid.ok, false)
  assert.equal(invalid.error?.code, "INVALID_CASE_ID")
  assert.equal(invalid.error?.repair, "user")
})

test("config hook scopes actor edits to the project when OpenCode reports a non-Git worktree root", async () => {
  const mmAgentPlugin = await loadPlugin()
  const worktree = path.parse(repositoryRoot).root
  const hooks = await mmAgentPlugin({ directory: repositoryRoot, worktree } as PluginInput)
  const config = {} as Config

  await hooks.config?.(config)

  const relativeAttempt = path.relative(worktree, path.join(repositoryRoot, "runs", "*", "attempts", "analysis", "*", "**")).replaceAll("\\", "/")
  const edit = config.agent?.["mm-analyst"]?.permission?.edit as Record<string, string>
  assert.equal(edit[relativeAttempt], "allow")
  assert.equal(edit[`${relativeAttempt}/context.json`], "deny")
  assert.equal(edit[`${relativeAttempt}/review.json`], "deny")
  assert.equal(edit["runs/*/attempts/analysis/*/**"], undefined)
})

test("formal Flow owns Review machine fields through Plugin execute", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "mm-agent-case-tool-revise-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await writeFile(path.join(directory, "problem.md"), "revise boundary fixture\n")
  const mmAgentPlugin = await loadPlugin()
  const hooks = await mmAgentPlugin({ directory, worktree: directory } as PluginInput)
  const prepare = hooks.tool?.mm_agent_prepare
  const definition = hooks.tool?.mm_agent_flow
  assert.ok(prepare)
  assert.ok(definition)
  const context = { directory, worktree: directory, sessionID: "ses-flow", messageID: "msg", abort: new AbortController().signal } as ToolContext
  const caseId = "case-tool-revise"

  await prepare.execute({
    case_id: caseId,
    explicit_paths: ["problem.md"],
  }, context)
  const dispatched = JSON.parse(await definition.execute({ action: "advance", case_id: caseId }, context) as string) as { attempt_id: string; context_path: string }
  const attempt = path.join(directory, "runs", caseId, path.dirname(dispatched.context_path))
  await writeFile(path.join(attempt, "problem-understanding.md"), "# Understanding\n")
  await writeFile(path.join(attempt, "tasks.json"), '{"schema_version":1,"tasks":[{"id":"task-01","description":"solve","requires_computation":false}]}\n')
  await writeFile(path.join(attempt, "task-graph.json"), '{"schema_version":1,"tasks":[{"id":"task-01","depends_on":[],"wave":1}]}\n')
  const gated = JSON.parse(await definition.execute({
    action: "submit_review",
    case_id: caseId,
    verdict: "revise",
    findings: ["clarify the understanding"],
    required_fixes: ["add one constraint"],
    evidence: ["attempts/analysis/001/problem-understanding.md"],
  }, context) as string) as { status: string; agent?: string }

  assert.equal(gated.status, "task")
  assert.equal(gated.agent, "mm-analyst")
  const review = JSON.parse(await readFile(path.join(attempt, "review.json"), "utf8")) as Record<string, unknown>
  assert.equal(review.schema_version, 1)
  assert.equal(review.attempt_id, dispatched.attempt_id)
  assert.match(String(review.reviewed_at), /^\d{4}-\d{2}-\d{2}T.*Z$/u)
  assert.equal(review.verdict, "revise")
})

test("formal Plugin omits the compaction hint; recovery remains a disk-backed Flow operation", async () => {
  const hooks = await loadPlugin()
  const plugin = await hooks({ directory: repositoryRoot, worktree: repositoryRoot } as PluginInput)
  assert.equal(plugin["experimental.session.compacting"], undefined)
})

test("fresh process recovery reads fixture state and context from disk without compaction", () => {
  const fixtureRoot = path.join(repositoryRoot, "tests", "fixtures", "plugin-spike-project")
  const contextPath = path.join(fixtureRoot, "context.json")
  const statePath = path.join(fixtureRoot, "runs", "case-alpha", "state.json")
  const script = `import { readFile } from "node:fs/promises"; const [context, state] = await Promise.all([readFile(process.argv[1], "utf8"), readFile(process.argv[2], "utf8")]); process.stdout.write(JSON.stringify({ context: JSON.parse(context), state: JSON.parse(state) }))`
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script, contextPath, statePath], {
    cwd: os.tmpdir(),
    encoding: "utf8",
    env: { ...process.env, OPENCODE_DISABLE_AUTOCOMPACT: "1" },
  })

  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), {
    context: { marker: "MM_AGENT_FRESH_CHILD_CONTEXT_7E4A" },
    state: { case_id: "case-alpha", status: "running", marker: "MM_AGENT_STATE_DISK_9C21" },
  })
})

test("installer fresh install preserves unrelated config and writes a hashed receipt", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-install-"))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  const configRoot = path.join(root, ".opencode")
  const pluginSource = path.join(root, "mm-agent-plugin.js")
  const pluginEntry = pathToFileURL(pluginSource).href
  await mkdir(configRoot, { recursive: true })
  await writeFile(pluginSource, "export default async () => ({})\n")
  await writeFile(path.join(configRoot, "opencode.json"), `${JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    username: "preserve-me",
    plugin: ["existing-plugin"],
  }, null, 2)}\n`)
  const installer = await loadInstaller()

  assert.equal(typeof installer.install, "function")
  const result = await installer.install({ configRoot, pluginEntry })

  const installedSkillPath = path.join(configRoot, "skills", "mm-agent", "SKILL.md")
  const installedSkill = await readFile(installedSkillPath, "utf8")
  assert.match(installedSkill, /^---\r?\nname: mm-agent\r?\ndescription: /)
  const config = JSON.parse(await readFile(path.join(configRoot, "opencode.json"), "utf8"))
  assert.equal(config.username, "preserve-me")
  assert.deepEqual(config.plugin, ["existing-plugin", pluginEntry])
  const receipt = JSON.parse(await readFile(path.join(configRoot, "mm-agent", "receipt.json"), "utf8"))
  assert.deepEqual(receipt, {
    package: "mm-agent",
    version: "0.1.0",
    plugin_entry: pluginEntry,
    plugin_added: true,
    installed_skills: ["mm-agent", "mm-hmml", "mm-compute", "mm-report"],
    files: await Promise.all(["mm-agent", "mm-hmml", "mm-compute", "mm-report"].map(async (name) => {
      const content = await readFile(path.join(configRoot, "skills", name, "SKILL.md"))
      return { path: `skills/${name}/SKILL.md`, sha256: createHash("sha256").update(content).digest("hex") }
    })),
  })
  assert.deepEqual(result.receipt, receipt)
  assert.equal(result.receiptPath, path.join(configRoot, "mm-agent", "receipt.json"))
})

test("installer update remove and reinstall lifecycle succeeds for unchanged files", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-lifecycle-"))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  const configRoot = path.join(root, ".opencode")
  const pluginSource = path.join(root, "mm-agent-plugin.js")
  const pluginEntry = pathToFileURL(pluginSource).href
  await mkdir(configRoot, { recursive: true })
  await writeFile(pluginSource, "export default async () => ({})\n")
  await writeFile(path.join(configRoot, "opencode.json"), `${JSON.stringify({ username: "preserve-me", plugin: ["existing-plugin"] }, null, 2)}\n`)
  const installer = await loadInstaller()
  assert.equal(typeof installer.update, "function")
  assert.equal(typeof installer.remove, "function")

  await installer.install({ configRoot, pluginEntry })
  const updateResult = await installer.update({ configRoot, pluginEntry })
  assert.equal(updateResult.receipt.plugin_entry, pluginEntry)
  assert.equal(updateResult.receipt.plugin_added, true)
  const removeResult = await installer.remove({ configRoot })
  assert.deepEqual(removeResult, {
    removed: ["skills/mm-agent/SKILL.md", "skills/mm-hmml/SKILL.md", "skills/mm-compute/SKILL.md", "skills/mm-report/SKILL.md"],
    conflicts: [],
  })
  assert.equal(existsSync(path.join(configRoot, "skills", "mm-agent", "SKILL.md")), false)
  assert.equal(existsSync(path.join(configRoot, "mm-agent", "receipt.json")), false)
  const configAfterRemove = JSON.parse(await readFile(path.join(configRoot, "opencode.json"), "utf8"))
  assert.equal(configAfterRemove.username, "preserve-me")
  assert.deepEqual(configAfterRemove.plugin, ["existing-plugin"])

  const reinstallResult = await installer.install({ configRoot, pluginEntry })
  assert.equal(reinstallResult.receipt.plugin_entry, pluginEntry)
  assert.equal(reinstallResult.receipt.plugin_added, true)
  assert.equal(existsSync(path.join(configRoot, "skills", "mm-agent", "SKILL.md")), true)
})

test("installer upgrades a hash-verified legacy one-Skill receipt to four Skills", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-legacy-upgrade-"))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  const configRoot = path.join(root, ".opencode")
  const pluginEntry = pathToFileURL(path.join(root, "plugin.js")).href
  const installer = await loadInstaller()
  await installer.install({ configRoot, pluginEntry })
  const legacySkill = await readFile(path.join(configRoot, "skills", "mm-agent", "SKILL.md"))
  for (const name of ["mm-hmml", "mm-compute", "mm-report"])
    await rm(path.join(configRoot, "skills", name), { recursive: true, force: true })
  await writeFile(path.join(configRoot, "mm-agent", "receipt.json"), `${JSON.stringify({
    package: "mm-agent", version: "0.1.0", plugin_entry: pluginEntry, plugin_added: true,
    installed_skills: ["mm-agent"],
    files: [{ path: "skills/mm-agent/SKILL.md", sha256: createHash("sha256").update(legacySkill).digest("hex") }],
  }, null, 2)}\n`)

  const result = await installer.update({ configRoot, pluginEntry })
  assert.deepEqual(result.receipt.installed_skills, ["mm-agent", "mm-hmml", "mm-compute", "mm-report"])
  assert.equal(result.receipt.files.length, 4)
  for (const name of ["mm-agent", "mm-hmml", "mm-compute", "mm-report"])
    assert.equal(existsSync(path.join(configRoot, "skills", name, "SKILL.md")), true, name)
})

test("installer preserves legacy owned and unowned files when an upgrade conflicts", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-legacy-conflict-"))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  const configRoot = path.join(root, ".opencode")
  const pluginEntry = pathToFileURL(path.join(root, "plugin.js")).href
  const installer = await loadInstaller()
  await installer.install({ configRoot, pluginEntry })
  const legacySkillPath = path.join(configRoot, "skills", "mm-agent", "SKILL.md")
  const legacySkill = await readFile(legacySkillPath)
  for (const name of ["mm-hmml", "mm-compute", "mm-report"])
    await rm(path.join(configRoot, "skills", name), { recursive: true, force: true })
  const receiptPath = path.join(configRoot, "mm-agent", "receipt.json")
  const legacyReceipt = `${JSON.stringify({
    package: "mm-agent", version: "0.1.0", plugin_entry: pluginEntry, plugin_added: true,
    installed_skills: ["mm-agent"],
    files: [{ path: "skills/mm-agent/SKILL.md", sha256: createHash("sha256").update(legacySkill).digest("hex") }],
  }, null, 2)}\n`
  await writeFile(receiptPath, legacyReceipt)
  const userSkillPath = path.join(configRoot, "skills", "mm-hmml", "SKILL.md")
  await mkdir(path.dirname(userSkillPath), { recursive: true })
  await writeFile(userSkillPath, "user skill\n")
  await assert.rejects(() => installer.update({ configRoot, pluginEntry }), (error: unknown) => {
    assert.equal((error as Error).name, "InstallerConflictError")
    assert.deepEqual((error as { conflicts?: string[] }).conflicts, ["skills/mm-hmml/SKILL.md"])
    return true
  })
  assert.equal(await readFile(userSkillPath, "utf8"), "user skill\n")
  assert.equal(await readFile(receiptPath, "utf8"), legacyReceipt)
  await writeFile(legacySkillPath, "user modified legacy skill\n")
  await rm(userSkillPath)
  await assert.rejects(() => installer.update({ configRoot, pluginEntry }), /Modified owned file conflict: skills\/mm-agent\/SKILL\.md/u)
  assert.equal(await readFile(legacySkillPath, "utf8"), "user modified legacy skill\n")
})

test("legacy receipt upgrade rolls back every Skill when the transaction cannot replace config", {
  skip: process.platform !== "win32",
}, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-legacy-rollback-"))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  const configRoot = path.join(root, ".opencode")
  const pluginEntry = pathToFileURL(path.join(root, "plugin.js")).href
  const installer = await loadInstaller()
  await installer.install({ configRoot, pluginEntry })
  const legacySkillPath = path.join(configRoot, "skills", "mm-agent", "SKILL.md")
  const legacySkill = await readFile(legacySkillPath)
  for (const name of ["mm-hmml", "mm-compute", "mm-report"])
    await rm(path.join(configRoot, "skills", name), { recursive: true, force: true })
  const receiptPath = path.join(configRoot, "mm-agent", "receipt.json")
  const legacyReceipt = `${JSON.stringify({
    package: "mm-agent", version: "0.1.0", plugin_entry: pluginEntry, plugin_added: true,
    installed_skills: ["mm-agent"],
    files: [{ path: "skills/mm-agent/SKILL.md", sha256: createHash("sha256").update(legacySkill).digest("hex") }],
  }, null, 2)}\n`
  await writeFile(receiptPath, legacyReceipt)
  const configPath = path.join(configRoot, "opencode.json")
  const configBefore = await readFile(configPath, "utf8")
  const release = await acquireWindowsReadLock(configPath)
  try {
    await assert.rejects(() => installer.update({ configRoot, pluginEntry }))
  } finally {
    await release()
  }
  assert.equal(await readFile(legacySkillPath, "utf8"), legacySkill.toString("utf8"))
  assert.equal(await readFile(receiptPath, "utf8"), legacyReceipt)
  assert.equal(await readFile(configPath, "utf8"), configBefore)
  for (const name of ["mm-hmml", "mm-compute", "mm-report"])
    assert.equal(existsSync(path.join(configRoot, "skills", name, "SKILL.md")), false, name)
})

test("installer update reports a modified owned file and does not overwrite it", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-update-conflict-"))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  const configRoot = path.join(root, ".opencode")
  const pluginEntry = pathToFileURL(path.join(root, "mm-agent-plugin.js")).href
  const installer = await loadInstaller()
  await installer.install({ configRoot, pluginEntry })
  const skillPath = path.join(configRoot, "skills", "mm-agent", "SKILL.md")
  const receiptPath = path.join(configRoot, "mm-agent", "receipt.json")
  const receiptBefore = await readFile(receiptPath, "utf8")
  const modifiedSkill = "user modified installed skill\n"
  await writeFile(skillPath, modifiedSkill)

  await assert.rejects(
    () => installer.update({ configRoot, pluginEntry }),
    (error: unknown) => {
      assert.equal((error as Error).name, "InstallerConflictError")
      assert.deepEqual((error as { conflicts?: string[] }).conflicts, ["skills/mm-agent/SKILL.md"])
      assert.match((error as Error).message, /modified owned file/i)
      return true
    },
  )
  assert.equal(await readFile(skillPath, "utf8"), modifiedSkill)
  assert.equal(await readFile(receiptPath, "utf8"), receiptBefore)
})

test("installer remove reports and preserves a modified owned file", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-remove-conflict-"))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  const configRoot = path.join(root, ".opencode")
  const pluginEntry = pathToFileURL(path.join(root, "mm-agent-plugin.js")).href
  const installer = await loadInstaller()
  await installer.install({ configRoot, pluginEntry })
  const skillPath = path.join(configRoot, "skills", "mm-agent", "SKILL.md")
  const receiptPath = path.join(configRoot, "mm-agent", "receipt.json")
  const configPath = path.join(configRoot, "opencode.json")
  const compactReceipt = `${JSON.stringify(JSON.parse(await readFile(receiptPath, "utf8")))}\n`
  await writeFile(receiptPath, compactReceipt)
  const configBefore = await readFile(configPath, "utf8")
  const modifiedSkill = "user modified before remove\n"
  await writeFile(skillPath, modifiedSkill)

  const result = await installer.remove({ configRoot })

  assert.deepEqual(result, {
    removed: [],
    conflicts: ["skills/mm-agent/SKILL.md"],
  })
  assert.equal(await readFile(skillPath, "utf8"), modifiedSkill)
  assert.equal(await readFile(receiptPath, "utf8"), compactReceipt)
  assert.equal(await readFile(configPath, "utf8"), configBefore)
  const config = JSON.parse(configBefore)
  assert.deepEqual(config.plugin, [pluginEntry])
})

test("installer rejects a traversing tampered receipt before update or remove", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-receipt-traversal-"))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  const configRoot = path.join(root, ".opencode")
  const pluginEntry = pathToFileURL(path.join(root, "mm-agent-plugin.js")).href
  const victimPath = path.join(root, "victim.txt")
  const victimContent = "outside file with matching receipt hash\n"
  const installer = await loadInstaller()
  await installer.install({ configRoot, pluginEntry })
  await writeFile(victimPath, victimContent)
  const receiptPath = path.join(configRoot, "mm-agent", "receipt.json")
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"))
  receipt.files = [{
    path: "../victim.txt",
    sha256: createHash("sha256").update(victimContent).digest("hex"),
  }]
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)

  for (const action of ["update", "remove"] as const) {
    await assert.rejects(
      () => installer[action]({ configRoot, pluginEntry }),
      (error: unknown) => {
        assert.equal((error as Error).name, "InstallerReceiptError")
        assert.match((error as Error).message, /invalid receipt/i)
        return true
      },
    )
    assert.equal(await readFile(victimPath, "utf8"), victimContent)
  }
})

test("installer rejects receipts without a boolean plugin ownership field", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-receipt-ownership-"))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  const configRoot = path.join(root, ".opencode")
  const pluginEntry = pathToFileURL(path.join(root, "plugin.js")).href
  const installer = await loadInstaller()
  await installer.install({ configRoot, pluginEntry })
  const skillPath = path.join(configRoot, "skills", "mm-agent", "SKILL.md")
  const configPath = path.join(configRoot, "opencode.json")
  const receiptPath = path.join(configRoot, "mm-agent", "receipt.json")
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"))
  receipt.plugin_added = "yes"
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)
  const before = {
    skill: await readFile(skillPath, "utf8"),
    config: await readFile(configPath, "utf8"),
    receipt: await readFile(receiptPath, "utf8"),
  }

  for (const action of ["update", "remove"] as const) {
    await assert.rejects(
      () => installer[action]({ configRoot, pluginEntry }),
      (error: unknown) => {
        assert.equal((error as Error).name, "InstallerReceiptError")
        assert.match((error as Error).message, /plugin_added must be a boolean/i)
        return true
      },
    )
    assert.equal(await readFile(skillPath, "utf8"), before.skill)
    assert.equal(await readFile(configPath, "utf8"), before.config)
    assert.equal(await readFile(receiptPath, "utf8"), before.receipt)
  }
})

test("installer rejects owned-path symlink or junction escapes before mutation", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-link-escape-"))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  const installer = await loadInstaller()
  const linkType = process.platform === "win32" ? "junction" : "dir"

  await t.test("install", async () => {
    const scenarioRoot = path.join(root, "install")
    const configRoot = path.join(scenarioRoot, ".opencode")
    const outsideDirectory = path.join(scenarioRoot, "outside")
    const victimPath = path.join(outsideDirectory, "SKILL.md")
    const victimContent = "outside install victim\n"
    await mkdir(path.join(configRoot, "skills"), { recursive: true })
    await mkdir(outsideDirectory, { recursive: true })
    await writeFile(victimPath, victimContent)
    await symlink(outsideDirectory, path.join(configRoot, "skills", "mm-agent"), linkType)

    let error: unknown
    try {
      await installer.install({ configRoot })
    } catch (caught) {
      error = caught
    }

    assert.equal(await readFile(victimPath, "utf8"), victimContent)
    assert.equal((error as Error | undefined)?.name, "InstallerReceiptError")
    assert.equal(existsSync(path.join(configRoot, "mm-agent", "receipt.json")), false)
  })

  for (const action of ["update", "remove"] as const) {
    await t.test(action, async () => {
      const scenarioRoot = path.join(root, action)
      const configRoot = path.join(scenarioRoot, ".opencode")
      const pluginEntry = pathToFileURL(path.join(scenarioRoot, "plugin.js")).href
      await installer.install({ configRoot, pluginEntry })
      const skillDirectory = path.join(configRoot, "skills", "mm-agent")
      const skillPath = path.join(skillDirectory, "SKILL.md")
      const installedSkill = await readFile(skillPath, "utf8")
      const outsideDirectory = path.join(scenarioRoot, "outside")
      const victimPath = path.join(outsideDirectory, "SKILL.md")
      const configPath = path.join(configRoot, "opencode.json")
      const receiptPath = path.join(configRoot, "mm-agent", "receipt.json")
      const configBefore = await readFile(configPath, "utf8")
      const receiptBefore = await readFile(receiptPath, "utf8")
      await mkdir(outsideDirectory, { recursive: true })
      await writeFile(victimPath, installedSkill)
      await rm(skillDirectory, { recursive: true, force: true })
      await symlink(outsideDirectory, skillDirectory, linkType)

      let error: unknown
      try {
        await installer[action]({ configRoot, pluginEntry })
      } catch (caught) {
        error = caught
      }

      assert.equal(await readFile(victimPath, "utf8"), installedSkill)
      assert.equal(await readFile(configPath, "utf8"), configBefore)
      assert.equal(await readFile(receiptPath, "utf8"), receiptBefore)
      assert.equal((error as Error | undefined)?.name, "InstallerReceiptError")
    })
  }
})

test("fresh install refuses an unowned or modified receipt-owned Skill", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-install-collision-"))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  const installer = await loadInstaller()
  const unownedRoot = path.join(root, "unowned", ".opencode")
  const unownedSkillPath = path.join(unownedRoot, "skills", "mm-agent", "SKILL.md")
  const unownedContent = "user-owned Skill\n"
  await mkdir(path.dirname(unownedSkillPath), { recursive: true })
  await writeFile(unownedSkillPath, unownedContent)

  await assert.rejects(
    () => installer.install({ configRoot: unownedRoot }),
    (error: unknown) => {
      assert.equal((error as Error).name, "InstallerConflictError")
      assert.deepEqual((error as { conflicts?: string[] }).conflicts, ["skills/mm-agent/SKILL.md"])
      return true
    },
  )
  assert.equal(await readFile(unownedSkillPath, "utf8"), unownedContent)
  assert.equal(existsSync(path.join(unownedRoot, "mm-agent", "receipt.json")), false)

  const ownedRoot = path.join(root, "owned", ".opencode")
  await installer.install({ configRoot: ownedRoot })
  const ownedSkillPath = path.join(ownedRoot, "skills", "mm-agent", "SKILL.md")
  const modifiedContent = "modified receipt-owned Skill\n"
  await writeFile(ownedSkillPath, modifiedContent)

  await assert.rejects(
    () => installer.install({ configRoot: ownedRoot }),
    (error: unknown) => {
      assert.equal((error as Error).name, "InstallerConflictError")
      assert.deepEqual((error as { conflicts?: string[] }).conflicts, ["skills/mm-agent/SKILL.md"])
      return true
    },
  )
  assert.equal(await readFile(ownedSkillPath, "utf8"), modifiedContent)
})

test("installer update replaces only its previous plugin entry", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-plugin-update-"))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  const configRoot = path.join(root, ".opencode")
  const oldPluginEntry = pathToFileURL(path.join(root, "old-plugin.js")).href
  const newPluginEntry = pathToFileURL(path.join(root, "new-plugin.js")).href
  const unrelatedPlugin = "unrelated-plugin"
  await mkdir(configRoot, { recursive: true })
  await writeFile(path.join(configRoot, "opencode.json"), `${JSON.stringify({
    username: "preserve-me",
    plugin: [unrelatedPlugin],
  }, null, 2)}\n`)
  const installer = await loadInstaller()
  await installer.install({ configRoot, pluginEntry: oldPluginEntry })

  const updateResult = await installer.update({ configRoot, pluginEntry: newPluginEntry })

  assert.equal(updateResult.receipt.plugin_entry, newPluginEntry)
  assert.equal(updateResult.receipt.plugin_added, true)
  const updatedConfig = JSON.parse(await readFile(path.join(configRoot, "opencode.json"), "utf8"))
  assert.equal(updatedConfig.username, "preserve-me")
  assert.deepEqual(updatedConfig.plugin, [unrelatedPlugin, newPluginEntry])
  const removeResult = await installer.remove({ configRoot })
  assert.deepEqual(removeResult, { removed: ["skills/mm-agent/SKILL.md", "skills/mm-hmml/SKILL.md", "skills/mm-compute/SKILL.md", "skills/mm-report/SKILL.md"], conflicts: [] })
  const removedConfig = JSON.parse(await readFile(path.join(configRoot, "opencode.json"), "utf8"))
  assert.equal(removedConfig.username, "preserve-me")
  assert.deepEqual(removedConfig.plugin, [unrelatedPlugin])
})

test("installer tracks ownership of pre-existing and changed plugin registrations", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-plugin-ownership-"))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  const installer = await loadInstaller()
  const unrelatedPlugin = "unrelated-plugin"

  const freshConfigRoot = path.join(root, "fresh", ".opencode")
  const existingPluginEntry = pathToFileURL(path.join(root, "existing-plugin.js")).href
  await mkdir(freshConfigRoot, { recursive: true })
  await writeFile(path.join(freshConfigRoot, "opencode.json"), `${JSON.stringify({
    plugin: [unrelatedPlugin, existingPluginEntry],
  }, null, 2)}\n`)

  const freshResult = await installer.install({ configRoot: freshConfigRoot, pluginEntry: existingPluginEntry })
  assert.equal(freshResult.receipt.plugin_added, false)
  await installer.remove({ configRoot: freshConfigRoot })
  assert.deepEqual(
    JSON.parse(await readFile(path.join(freshConfigRoot, "opencode.json"), "utf8")).plugin,
    [unrelatedPlugin, existingPluginEntry],
  )

  const updateConfigRoot = path.join(root, "update", ".opencode")
  const oldPluginEntry = pathToFileURL(path.join(root, "old-pre-existing-plugin.js")).href
  const newPluginEntry = pathToFileURL(path.join(root, "new-pre-existing-plugin.js")).href
  await mkdir(updateConfigRoot, { recursive: true })
  await writeFile(path.join(updateConfigRoot, "opencode.json"), `${JSON.stringify({
    plugin: [unrelatedPlugin, oldPluginEntry, newPluginEntry],
  }, null, 2)}\n`)

  const initialResult = await installer.install({ configRoot: updateConfigRoot, pluginEntry: oldPluginEntry })
  assert.equal(initialResult.receipt.plugin_added, false)
  const updateResult = await installer.update({ configRoot: updateConfigRoot, pluginEntry: newPluginEntry })
  assert.equal(updateResult.receipt.plugin_added, false)
  assert.deepEqual(
    JSON.parse(await readFile(path.join(updateConfigRoot, "opencode.json"), "utf8")).plugin,
    [unrelatedPlugin, oldPluginEntry, newPluginEntry],
  )
  await installer.remove({ configRoot: updateConfigRoot })
  assert.deepEqual(
    JSON.parse(await readFile(path.join(updateConfigRoot, "opencode.json"), "utf8")).plugin,
    [unrelatedPlugin, oldPluginEntry, newPluginEntry],
  )
})

test("installer transactions preserve pre-operation state across filesystem failures", {
  skip: process.platform !== "win32",
}, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-transaction-"))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  const installer = await loadInstaller()

  await t.test("install", async () => {
    const configRoot = path.join(root, "install", ".opencode")
    const configPath = path.join(configRoot, "opencode.json")
    const skillPath = path.join(configRoot, "skills", "mm-agent", "SKILL.md")
    const receiptPath = path.join(configRoot, "mm-agent", "receipt.json")
    await mkdir(configRoot, { recursive: true })
    await writeFile(configPath, `${JSON.stringify({ username: "preserve-me", plugin: ["existing-plugin"] }, null, 2)}\n`)
    const configBefore = await readFile(configPath, "utf8")
    const release = await acquireWindowsReadLock(configPath)
    try {
      assert.equal(await readFile(configPath, "utf8"), configBefore)
      await assert.rejects(() => writeFile(configPath, configBefore))
      await assert.rejects(() => installer.install({ configRoot }))
    } finally {
      await release()
    }

    assert.equal(await readFile(configPath, "utf8"), configBefore)
    assert.equal(await readOptionalFile(skillPath), undefined)
    assert.equal(await readOptionalFile(receiptPath), undefined)
    assert.deepEqual(await transactionArtifacts(configRoot), [])
  })

  await t.test("update", async () => {
    const configRoot = path.join(root, "update", ".opencode")
    const oldPluginEntry = pathToFileURL(path.join(root, "old-transaction-plugin.js")).href
    const newPluginEntry = pathToFileURL(path.join(root, "new-transaction-plugin.js")).href
    await installer.install({ configRoot, pluginEntry: oldPluginEntry })
    const configPath = path.join(configRoot, "opencode.json")
    const skillPath = path.join(configRoot, "skills", "mm-agent", "SKILL.md")
    const receiptPath = path.join(configRoot, "mm-agent", "receipt.json")
    const before = {
      config: await readFile(configPath, "utf8"),
      skill: await readFile(skillPath, "utf8"),
      receipt: await readFile(receiptPath, "utf8"),
    }
    const release = await acquireWindowsReadLock(receiptPath)
    try {
      assert.equal(await readFile(receiptPath, "utf8"), before.receipt)
      await assert.rejects(() => writeFile(receiptPath, before.receipt))
      await assert.rejects(() => installer.update({ configRoot, pluginEntry: newPluginEntry }))
    } finally {
      await release()
    }

    assert.equal(await readFile(configPath, "utf8"), before.config)
    assert.equal(await readFile(skillPath, "utf8"), before.skill)
    assert.equal(await readFile(receiptPath, "utf8"), before.receipt)
    assert.deepEqual(await transactionArtifacts(configRoot), [])
  })

  await t.test("remove", async () => {
    const configRoot = path.join(root, "remove", ".opencode")
    const pluginEntry = pathToFileURL(path.join(root, "remove-transaction-plugin.js")).href
    await installer.install({ configRoot, pluginEntry })
    const configPath = path.join(configRoot, "opencode.json")
    const skillPath = path.join(configRoot, "skills", "mm-agent", "SKILL.md")
    const receiptPath = path.join(configRoot, "mm-agent", "receipt.json")
    const before = {
      config: await readFile(configPath, "utf8"),
      skill: await readFile(skillPath, "utf8"),
      receipt: await readFile(receiptPath, "utf8"),
    }
    const release = await acquireWindowsReadLock(receiptPath)
    try {
      assert.equal(await readFile(receiptPath, "utf8"), before.receipt)
      await assert.rejects(() => rm(receiptPath))
      await assert.rejects(() => installer.remove({ configRoot }))
    } finally {
      await release()
    }

    assert.equal(await readOptionalFile(configPath), before.config)
    assert.equal(await readOptionalFile(skillPath), before.skill)
    assert.equal(await readOptionalFile(receiptPath), before.receipt)
    assert.deepEqual(await transactionArtifacts(configRoot), [])
  })
})

test("installer exposes the safe current-platform OpenCode config default", async () => {
  const installer = await loadInstaller()

  assert.equal(typeof installer.defaultConfigRoot, "function")
  assert.equal(installer.defaultConfigRoot(), path.join(os.homedir(), ".config", "opencode"))
})

test("installer CLI supports explicit install update and remove commands", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-cli-"))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  const configRoot = path.join(root, ".opencode")
  const npmCli = process.env.npm_execpath
  assert.ok(npmCli)
  const build = spawnSync(process.execPath, [npmCli, "run", "build"], { cwd: repositoryRoot, encoding: "utf8" })
  assert.equal(build.status, 0, `${build.stdout}${build.stderr}`)
  const cliPath = path.join(repositoryRoot, "dist", "install.js")

  for (const action of ["install", "update", "remove"] as const) {
    const result = spawnSync(process.execPath, [cliPath, action, "--config-root", configRoot], {
      cwd: root,
      encoding: "utf8",
    })
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`)
    const output = JSON.parse(result.stdout)
    assert.equal(output.action, action)
    if (action !== "remove") assert.equal(output.result.receipt.plugin_added, true)
  }
  assert.equal(existsSync(path.join(configRoot, "skills", "mm-agent", "SKILL.md")), false)
  assert.equal(existsSync(path.join(configRoot, "mm-agent", "receipt.json")), false)
})

test("runtime: isolated install loads the Plugin and discovers its Agent and Skill", {
  skip: process.env.MM_AGENT_RUNTIME !== "1",
  timeout: 180_000,
}, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-runtime-load-"))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  const projectRoot = path.join(root, "project")
  const configRoot = path.join(root, "config-home", "opencode")
  await mkdir(projectRoot, { recursive: true })

  const npmCli = process.env.npm_execpath
  assert.ok(npmCli)
  const build = runRuntimeProcess(process.execPath, [npmCli, "run", "build"], repositoryRoot, process.env)
  assertRuntimeSuccess(build, "npm run build")
  const installResult = runRuntimeProcess(
    process.execPath,
    [path.join(repositoryRoot, "dist", "install.js"), "install", "--config-root", configRoot],
    repositoryRoot,
    process.env,
  )
  assertRuntimeSuccess(installResult, "installer CLI")
  assert.equal(JSON.parse(installResult.stdout).action, "install")

  const opencode = findOpenCodeBinary()
  const env = runtimeEnvironment(root)
  const version = runRuntimeProcess(opencode, ["--version"], projectRoot, env)
  assertRuntimeSuccess(version, "opencode --version")
  const packageJson = JSON.parse(await readFile(packageUrl, "utf8")) as {
    dependencies?: Record<string, string>
  }
  const pluginApiVersion = packageJson.dependencies?.["@opencode-ai/plugin"]
  assert.match(pluginApiVersion ?? "", /^\d+\.\d+\.\d+$/u)
  const hostVersion = version.stdout.trim()
  assert.match(hostVersion, /^\d+\.\d+\.\d+$/u)
  const [hostMajor, hostMinor, hostPatch] = hostVersion.split(".").map(Number)
  const [apiMajor, apiMinor, apiPatch] = (pluginApiVersion ?? "").split(".").map(Number)
  assert.deepEqual([hostMajor, hostMinor], [apiMajor, apiMinor])
  assert.ok(hostPatch >= apiPatch, `OpenCode ${hostVersion} is older than Plugin API ${pluginApiVersion}`)

  for (const name of ["mm-analyst", "mm-modeler", "mm-solver", "mm-writer", "mm-critic"]) {
    const agentResult = runRuntimeProcess(opencode, ["debug", "agent", name], projectRoot, env)
    assertRuntimeSuccess(agentResult, `opencode debug agent ${name}`)
    const agent = JSON.parse(agentResult.stdout) as Record<string, unknown>
    assert.equal(agent.name, name)
    assert.equal(agent.mode, "subagent")
    assert.equal(agent.hidden, true)
  }

  const skillResult = runRuntimeProcess(opencode, ["debug", "skill"], projectRoot, env)
  assertRuntimeSuccess(skillResult, "opencode debug skill")
  const skills = JSON.parse(skillResult.stdout) as Array<Record<string, unknown>>
  for (const name of ["mm-agent", "mm-hmml", "mm-compute", "mm-report"]) {
    const skill = skills.find((candidate) => candidate.name === name)
    assert.ok(skill)
    assert.equal(skill.location, path.join(configRoot, "skills", name, "SKILL.md"))
  }
})

test("runtime: model invokes Step 3 Tools, compiles the real template, and creates a recoverable Case", {
  skip: !runtimeModelEnabled,
  timeout: 300_000,
}, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-runtime-tool-"))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  const projectRoot = path.join(root, "project")
  const configRoot = path.join(root, "config-home", "opencode")
  await mkdir(projectRoot, { recursive: true })
  await writeFile(path.join(projectRoot, "problem.md"), "runtime immutable input\n")

  const npmCli = process.env.npm_execpath
  assert.ok(npmCli)
  const build = runRuntimeProcess(process.execPath, [npmCli, "run", "build"], repositoryRoot, process.env)
  assertRuntimeSuccess(build, "npm run build")
  const installResult = runRuntimeProcess(
    process.execPath,
    [path.join(repositoryRoot, "dist", "install.js"), "install", "--config-root", configRoot],
    repositoryRoot,
    process.env,
  )
  assertRuntimeSuccess(installResult, "installer CLI")
  await configureRuntimeModel(configRoot)
  const gitInit = runRuntimeProcess("git", ["init"], projectRoot, process.env)
  assertRuntimeSuccess(gitInit, "git init")

  const opencode = findOpenCodeBinary()
  const prompt = [
    "Call mm_agent_check exactly once with scope tex.",
    "After it completes, call mm_agent_prepare exactly once with case_id case-runtime and explicit_paths containing problem.md.",
    "Do not use any other tool.",
    "Then reply exactly MM_AGENT_STEP3_TOOLS_DONE_4F19.",
  ].join(" ")
  const result = runRuntimeProcess(
    opencode,
    ["run", "--format", "json", "--auto", ...runtimeModelArgs(), prompt],
    projectRoot,
    runtimeEnvironment(root),
    240_000,
  )
  assertRuntimeSuccess(result, "opencode run Step 3 Tool prompt")
  const events = result.stdout
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as {
      type?: string
      sessionID?: string
      part?: { type?: string; tool?: string; text?: string; state?: { status?: string; output?: string } }
    })
  const checkEvent = events.find((event) => event.type === "tool_use" && event.part?.tool === "mm_agent_check")
  const prepareEvent = events.find((event) => event.type === "tool_use" && event.part?.tool === "mm_agent_prepare")
  assert.ok(checkEvent)
  assert.ok(prepareEvent)
  assert.equal(checkEvent.part?.state?.status, "completed")
  assert.equal(prepareEvent.part?.state?.status, "completed")
  assert.match(checkEvent.sessionID ?? "", /^ses_/u)
  assert.equal(prepareEvent.sessionID, checkEvent.sessionID)
  const checkOutput = JSON.parse(checkEvent.part?.state?.output ?? "") as {
    ok?: boolean
    checks?: Array<{ id?: string; status?: string; evidence?: string }>
  }
  assert.equal(checkOutput.ok, true)
  assert.deepEqual(checkOutput.checks?.map((check) => check.id), ["tex-template"])
  assert.equal(checkOutput.checks?.[0]?.status, "pass")
  assert.match(checkOutput.checks?.[0]?.evidence ?? "", /example\.tex; pdf_bytes=[1-9]\d*/u)
  const prepareOutput = JSON.parse(prepareEvent.part?.state?.output ?? "") as {
    ok?: boolean
    result?: { mode?: string; snapshot?: { state?: { revision?: number } } }
  }
  assert.equal(prepareOutput.ok, true)
  assert.equal(prepareOutput.result?.mode, "created")
  assert.equal(prepareOutput.result?.snapshot?.state?.revision, 0)
  assert.equal(await readFile(path.join(projectRoot, "problem.md"), "utf8"), "runtime immutable input\n")
  assert.ok(events.some((event) => event.part?.type === "text" && event.part.text === "MM_AGENT_STEP3_TOOLS_DONE_4F19"))

  const recoveryScript = [
    "const { FileCaseContextStore } = await import(process.argv[1]);",
    "const store = new FileCaseContextStore({ runsRoot: process.argv[2] });",
    "const snapshot = await store.open(process.argv[3]);",
    "process.stdout.write(JSON.stringify({ case_id: snapshot.caseFile.case_id, revision: snapshot.state.revision, files: snapshot.inputManifest.files.length }));",
  ].join(" ")
  const recovery = runRuntimeProcess(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      recoveryScript,
      pathToFileURL(path.join(repositoryRoot, "dist", "core", "case-context-store.js")).href,
      path.join(projectRoot, "runs"),
      "case-runtime",
    ],
    projectRoot,
    process.env,
  )
  assertRuntimeSuccess(recovery, "fresh-process Case recovery")
  assert.deepEqual(JSON.parse(recovery.stdout), {
    case_id: "case-runtime",
    revision: 0,
    files: 1,
  })
  const persistedFacts = ["case.json", "state.json", path.join("input", "manifest.json")]
  for (const relative of persistedFacts) {
    const content = await readFile(path.join(projectRoot, "runs", "case-runtime", relative), "utf8")
    assert.equal(content.includes(projectRoot), false, relative)
  }
})

test("runtime: model invokes HMML and receives a traceable offline BM25 result", {
  skip: !runtimeModelEnabled,
  timeout: 300_000,
}, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-runtime-hmml-"))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  const projectRoot = path.join(root, "project")
  const configRoot = path.join(root, "config-home", "opencode")
  await mkdir(projectRoot, { recursive: true })

  const npmCli = process.env.npm_execpath
  assert.ok(npmCli)
  const build = runRuntimeProcess(process.execPath, [npmCli, "run", "build"], repositoryRoot, process.env)
  assertRuntimeSuccess(build, "npm run build")
  const installResult = runRuntimeProcess(
    process.execPath,
    [path.join(repositoryRoot, "dist", "install.js"), "install", "--config-root", configRoot],
    repositoryRoot,
    process.env,
  )
  assertRuntimeSuccess(installResult, "installer CLI")
  await configureRuntimeModel(configRoot)
  assertRuntimeSuccess(runRuntimeProcess("git", ["init"], projectRoot, process.env), "git init")

  const outputPath = "runs/case-hmml/tasks/task-01/retrieved-methods.json"
  const prompt = [
    "Call mm_agent_hmml exactly once.",
    "Use query customer waiting queue and service congestion, top_k 5,",
    `output_path ${outputPath}, and mode auto.`,
    "Do not use any other tool.",
    "Then reply exactly MM_AGENT_HMML_DONE_91C7.",
  ].join(" ")
  const result = runRuntimeProcess(
    findOpenCodeBinary(),
    ["run", "--format", "json", "--auto", ...runtimeModelArgs(), prompt],
    projectRoot,
    {
      ...runtimeEnvironment(root),
      MM_AGENT_CACHE_DIR: path.join(root, "isolated-mm-agent-cache"),
    },
    240_000,
  )
  assertRuntimeSuccess(result, "opencode run HMML Tool prompt")
  const events = result.stdout.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as {
    type?: string
    part?: { type?: string; tool?: string; text?: string; state?: { status?: string; output?: string } }
  })
  const toolEvent = events.find((event) => event.type === "tool_use" && event.part?.tool === "mm_agent_hmml")
  assert.ok(toolEvent)
  assert.equal(toolEvent.part?.state?.status, "completed")
  const output = JSON.parse(toolEvent.part?.state?.output ?? "") as {
    retrieval_mode?: string
    degraded_reason?: string | null
    knowledge_source?: { sha256?: string }
    model?: { available?: boolean; revision?: string }
    index?: { hash?: string; embedding_dimension?: number }
    candidates?: Array<{ method?: string; score?: number }>
  }
  assert.equal(output.retrieval_mode, "bm25")
  assert.equal(output.model?.available, false)
  assert.match(output.degraded_reason ?? "", /model cache|Python runtime/u)
  assert.match(output.knowledge_source?.sha256 ?? "", /^[a-f0-9]{64}$/u)
  assert.match(output.model?.revision ?? "", /^[a-f0-9]{40}$/u)
  assert.match(output.index?.hash ?? "", /^[a-f0-9]{64}$/u)
  assert.ok((output.index?.embedding_dimension ?? 0) > 0)
  assert.equal(output.candidates?.length, 5)
  assert.equal(output.candidates?.[0]?.method, "Queuing Theory")
  assert.ok((output.candidates?.[0]?.score ?? 0) > 0)
  assert.deepEqual(JSON.parse(await readFile(path.join(projectRoot, ...outputPath.split("/")), "utf8")), output)
  assert.ok(events.some((event) => event.part?.type === "text" && event.part.text === "MM_AGENT_HMML_DONE_91C7"))
})

test("runtime: Main gates a real Analyst candidate after a fresh Critic review", {
  skip: !runtimeModelEnabled && !runtimeHostModelEnabled,
  timeout: 300_000,
}, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-runtime-step6-"))
  const keepFailedRuntime = process.env.MM_AGENT_KEEP_FAILED_RUNTIME === "1"
  t.after(async () => {
    if (keepFailedRuntime) {
      t.diagnostic(`Step 6 runtime project retained at ${root}`)
      return
    }
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })
  const projectRoot = path.join(root, "project")
  const configRoot = path.join(root, "config-home", "opencode")
  await mkdir(projectRoot, { recursive: true })
  await writeFile(path.join(projectRoot, "problem.md"), "Determine the total cost of buying 3 notebooks at 2 dollars each.\n")

  const npmCli = process.env.npm_execpath
  assert.ok(npmCli)
  assertRuntimeSuccess(runRuntimeProcess(process.execPath, [npmCli, "run", "build"], repositoryRoot, process.env), "npm run build")
  if (runtimeHostModelEnabled) {
    await writeFile(path.join(projectRoot, "opencode.json"), `${JSON.stringify({
      plugin: [pathToFileURL(path.join(repositoryRoot, "dist", "index.js")).href],
    }, null, 2)}\n`)
  } else {
    assertRuntimeSuccess(runRuntimeProcess(
      process.execPath,
      [path.join(repositoryRoot, "dist", "install.js"), "install", "--config-root", configRoot],
      repositoryRoot,
      process.env,
    ), "installer CLI")
    await configureRuntimeModel(configRoot)
  }
  assertRuntimeSuccess(runRuntimeProcess("git", ["init"], projectRoot, process.env), "git init")

  const opencode = findOpenCodeBinary()
  const env = runtimeHostModelEnabled ? process.env : runtimeEnvironment(root)
  const caseId = runtimeHostModelEnabled ? `case-step6-host-${Date.now().toString(36)}` : "case-step6-runtime"
  type RuntimeToolState = {
    status?: string
    input?: Record<string, unknown>
    output?: string
    error?: unknown
    metadata?: { parentSessionId?: string; sessionId?: string } | Record<string, unknown>
  }
  type RuntimeEvent = {
    type?: string
    sessionID?: string
    part?: {
      type?: string
      tool?: string
      text?: string
      state?: RuntimeToolState
    }
  }
  const runMain = (label: string, prompt: string, timeout = 150_000): RuntimeEvent[] => {
    const result = runRuntimeProcess(
      opencode,
      ["run", "--format", "json", "--auto", ...runtimeModelArgs(), prompt],
      projectRoot,
      env,
      timeout,
    )
    assertRuntimeSuccess(result, label)
    return result.stdout.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as RuntimeEvent)
  }
  const assertToolCompleted = (label: string, event: RuntimeEvent | undefined): void => {
    assert.equal(
      event?.part?.state?.status,
      "completed",
      `${label}; main_session=${event?.sessionID ?? "unknown"}; tool_state=${sanitizeRuntimeOutput(JSON.stringify(event?.part?.state ?? {}))}`,
    )
  }

  const session1 = runMain("Step 6 prepare and dispatch", [
    `Call mm_agent_prepare exactly once with case_id ${caseId} and explicit_paths [problem.md].`,
    `Then call mm_agent_flow exactly once with action advance and case_id ${caseId}.`,
    "Do not call task, inspect, gate, or any other mm_agent Tool. Reply exactly MM_AGENT_STEP6_SESSION1_DONE.",
  ].join(" "))
  const session2 = runMain("Step 6 Analyst task", [
    `Call mm_agent_flow exactly once with action advance and case_id ${caseId}. Use only its disk-backed active Attempt context_path.`,
    "Then use built-in task exactly once with subagent_type mm-analyst. Tell it to read the returned context_path and create every expected output in that Attempt only. tasks.json must be exactly {\"schema_version\":1,\"tasks\":[{\"id\":\"task-01\",\"description\":\"Compute the notebook cost\",\"requires_computation\":false}]}. task-graph.json must be exactly {\"schema_version\":1,\"tasks\":[{\"id\":\"task-01\",\"depends_on\":[],\"wave\":1}]}. Return its required JSON status.",
    "Do not call dispatch, gate, or any other mm_agent Tool. Reply exactly MM_AGENT_STEP6_SESSION2_DONE.",
  ].join(" "))
  const session3 = runMain("Step 6 Critic and Gate", [
    `Call mm_agent_flow exactly once with action advance and case_id ${caseId}. Use only its disk-backed active Attempt context_path.`,
    "Then use built-in task exactly once with subagent_type mm-critic. Tell it to read that same active context_path and candidate outputs, then return exactly one JSON object with only verdict, findings, required_fixes, and evidence using existing Case-relative paths.",
    `Immediately call mm_agent_flow exactly once with action submit_review for ${caseId}, passing only the Critic's four semantic fields. If Flow returns an error, stop and report it without retrying or altering the Review. Do not call dispatch, gate, or any other mm_agent Tool. Reply exactly MM_AGENT_STEP6_SESSION3_DONE.`,
  ].join(" "))
  const sessionIds = [session1, session2, session3].map((events) => events.find((event) => event.sessionID)?.sessionID)
  assert.equal(new Set(sessionIds).size, 3)
  for (const sessionId of sessionIds) assert.match(sessionId ?? "", /^ses_/u)

  const session1Tools = session1.filter((event) => event.type === "tool_use")
  const dispatchEvent = session1Tools.find((event) => event.part?.tool === "mm_agent_flow")
  assertToolCompleted("Session 1 advance", dispatchEvent)
  const dispatch = JSON.parse(dispatchEvent?.part?.state?.output ?? "") as { attempt_id?: string; context_path?: string }
  assert.equal(dispatch.attempt_id, "analysis-001")
  assert.equal(dispatch.context_path, "attempts/analysis/001/context.json")

  const analystTask = session2.find((event) => event.type === "tool_use" && event.part?.tool === "task")
  const criticTask = session3.find((event) => event.type === "tool_use" && event.part?.tool === "task")
  assert.equal(analystTask?.part?.state?.input?.subagent_type, "mm-analyst")
  assert.equal(criticTask?.part?.state?.input?.subagent_type, "mm-critic")
  assertToolCompleted("Session 2 Analyst task", analystTask)
  assertToolCompleted("Session 3 Critic task", criticTask)
  const actorChildId = (analystTask?.part?.state?.metadata as { sessionId?: string } | undefined)?.sessionId
  const criticChildId = (criticTask?.part?.state?.metadata as { sessionId?: string } | undefined)?.sessionId
  assert.match(actorChildId ?? "", /^ses_/u)
  assert.match(criticChildId ?? "", /^ses_/u)
  assert.notEqual(actorChildId, criticChildId)
  assert.equal((analystTask?.part?.state?.metadata as { parentSessionId?: string } | undefined)?.parentSessionId, sessionIds[1])
  assert.equal((criticTask?.part?.state?.metadata as { parentSessionId?: string } | undefined)?.parentSessionId, sessionIds[2])
  const criticExport = runRuntimeProcess(opencode, ["export", criticChildId ?? ""], projectRoot, env)
  assertRuntimeSuccess(criticExport, "opencode export Critic child")
  const criticParts = (JSON.parse(criticExport.stdout) as {
    messages?: Array<{ parts?: Array<{ type?: string; tool?: string }> }>
  }).messages?.flatMap((message) => message.parts ?? []) ?? []
  assert.equal(criticParts.some((part) => part.type === "tool" && (part.tool === "edit" || part.tool === "task")), false)
  const session3FlowEvents = session3.filter((event) => event.type === "tool_use" && event.part?.tool === "mm_agent_flow")
  assert.equal(session3FlowEvents.length, 2)
  assertToolCompleted("Session 3 advance", session3FlowEvents[0])
  assertToolCompleted("Session 3 submit_review", session3FlowEvents[1])
  const gated = JSON.parse(session3FlowEvents[1]?.part?.state?.output ?? "") as { status?: string; agent?: string }
  assert.equal(gated.status, "task")
  assert.equal(gated.agent, "mm-modeler")

  const caseRoot = path.join(projectRoot, "runs", caseId)
  const attempts = await readdir(path.join(caseRoot, "attempts", "analysis"), { withFileTypes: true })
  assert.deepEqual(attempts.filter((entry) => entry.isDirectory()).map((entry) => entry.name), ["001"])
  const state = JSON.parse(await readFile(path.join(caseRoot, "state.json"), "utf8")) as {
    revision?: number; stage?: string; accepted_artifacts?: Array<{ path?: string }>
  }
  assert.equal(state.revision, 1)
  assert.equal(state.stage, "modeling")
  assert.deepEqual(state.accepted_artifacts?.map((artifact) => artifact.path).sort(), [
    "artifacts/problem-understanding.md",
    "artifacts/task-graph.json",
    "artifacts/tasks.json",
  ])
  for (const name of ["problem-understanding.md", "tasks.json", "task-graph.json"]) {
    const candidate = await readFile(path.join(caseRoot, "attempts", "analysis", "001", name), "utf8")
    const accepted = await readFile(path.join(caseRoot, "artifacts", name), "utf8")
    assert.equal(accepted, candidate, name)
  }
  assert.equal(existsSync(path.join(caseRoot, "attempts", "analysis", "001", "review.json")), true)
  assert.ok(session1.some((event) => event.part?.type === "text" && matchesCompletionMarker(event.part.text, "MM_AGENT_STEP6_SESSION1_DONE")))
  assert.ok(session2.some((event) => event.part?.type === "text" && matchesCompletionMarker(event.part.text, "MM_AGENT_STEP6_SESSION2_DONE")))
  assert.ok(session3.some((event) => event.part?.type === "text" && matchesCompletionMarker(event.part.text, "MM_AGENT_STEP6_SESSION3_DONE")))
  t.diagnostic(`Step 6 runtime sessions: main=${sessionIds.join(",")}; actor=${actorChildId}; critic=${criticChildId}`)
})

test("runtime: built-in task creates a linked fresh child that reads disk context", {
  skip: !runtimeModelEnabled,
  timeout: 300_000,
}, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-runtime-task-"))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  const projectRoot = path.join(root, "project")
  const configRoot = path.join(root, "config-home", "opencode")
  const marker = "MM_AGENT_FRESH_CHILD_CONTEXT_7E4A"
  await mkdir(projectRoot, { recursive: true })
  await writeFile(path.join(projectRoot, "context.json"), `${JSON.stringify({ marker })}\n`)

  const npmCli = process.env.npm_execpath
  assert.ok(npmCli)
  const build = runRuntimeProcess(process.execPath, [npmCli, "run", "build"], repositoryRoot, process.env)
  assertRuntimeSuccess(build, "npm run build")
  const installResult = runRuntimeProcess(
    process.execPath,
    [path.join(repositoryRoot, "dist", "install.js"), "install", "--config-root", configRoot],
    repositoryRoot,
    process.env,
  )
  assertRuntimeSuccess(installResult, "installer CLI")
  await configureRuntimeModel(configRoot)
  const gitInit = runRuntimeProcess("git", ["init"], projectRoot, process.env)
  assertRuntimeSuccess(gitInit, "git init")

  const opencode = findOpenCodeBinary()
  const env = runtimeEnvironment(root)
  const prompt = [
    "Use the built-in task tool exactly once with subagent_type mm-critic.",
    "Tell the child to read context.json from the project root and return exactly the marker value.",
    "Do not read context.json yourself and do not use any other tool.",
    "After the child responds, reply with exactly the child's response.",
  ].join(" ")
  const result = runRuntimeProcess(
    opencode,
    ["run", "--format", "json", "--auto", ...runtimeModelArgs(), prompt],
    projectRoot,
    env,
    240_000,
  )
  assertRuntimeSuccess(result, "opencode run built-in task prompt")
  const events = result.stdout
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as {
      type?: string
      sessionID?: string
      part?: {
        type?: string
        tool?: string
        text?: string
        state?: {
          status?: string
          output?: string
          metadata?: { parentSessionId?: string; sessionId?: string }
        }
      }
    })
  const taskEvent = events.find((event) => event.type === "tool_use" && event.part?.tool === "task")
  assert.ok(taskEvent)
  assert.equal(events.some((event) => event.type === "tool_use" && event.part?.tool === "read"), false)
  assert.equal(taskEvent.part?.state?.status, "completed")
  const childResult = /<task_result>\s*([\s\S]*?)\s*<\/task_result>/u.exec(taskEvent.part?.state?.output ?? "")
  assert.ok(childResult?.[1])
  assert.equal(normalizeModelMarkerText([childResult[1]]), marker)
  const parentSessionId = taskEvent.sessionID
  const childSessionId = taskEvent.part?.state?.metadata?.sessionId
  assert.match(parentSessionId ?? "", /^ses_/u)
  assert.match(childSessionId ?? "", /^ses_/u)
  assert.notEqual(childSessionId, parentSessionId)
  assert.equal(taskEvent.part?.state?.metadata?.parentSessionId, parentSessionId)

  const childExport = runRuntimeProcess(opencode, ["export", childSessionId ?? "", "--sanitize"], projectRoot, env)
  assertRuntimeSuccess(childExport, "opencode export child --sanitize")
  const exported = JSON.parse(childExport.stdout) as {
    info?: { id?: string; parentID?: string }
    messages?: Array<{
      parts?: Array<{
        id?: string
        type?: string
        tool?: string
        state?: { status?: string; input?: { filePath?: string; redacted?: string } }
      }>
    }>
  }
  assert.equal(exported.info?.id, childSessionId)
  assert.equal(exported.info?.parentID, parentSessionId)
  const childParts = (exported.messages ?? []).flatMap((message) => message.parts ?? [])
  const childReads = childParts
    .filter((part) => part.type === "tool" && part.tool === "read")
  const sanitizedRead = childReads.find((part) => part.state?.status === "completed")
  assert.ok(
    sanitizedRead,
    `child Tool parts: ${sanitizeRuntimeOutput(JSON.stringify(childParts.filter((part) => part.type === "tool")))}`,
  )
  assert.match(sanitizedRead.state?.input?.redacted ?? "", /^tool-input:/u)

  const rawChildExport = runRuntimeProcess(opencode, ["export", childSessionId ?? ""], projectRoot, env)
  assertRuntimeSuccess(rawChildExport, "opencode export child")
  const rawExported = JSON.parse(rawChildExport.stdout) as typeof exported
  const rawRead = (rawExported.messages ?? [])
    .flatMap((message) => message.parts ?? [])
    .find((part) => part.id === sanitizedRead.id && part.type === "tool" && part.tool === "read")
  assert.equal(rawRead?.state?.status, "completed")
  assert.equal(rawRead.state.input?.filePath, path.join(projectRoot, "context.json"))
})

test("runtime: Skill slash command executes and restart rediscovers Plugin and Skill", {
  skip: !runtimeModelEnabled,
  timeout: 300_000,
}, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-runtime-restart-"))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  const projectRoot = path.join(root, "project")
  const configRoot = path.join(root, "config-home", "opencode")
  await mkdir(path.join(projectRoot, "problems"), { recursive: true })
  await writeFile(path.join(projectRoot, "problems", "problem.md"), "slash intake\n")

  const npmCli = process.env.npm_execpath
  assert.ok(npmCli)
  const build = runRuntimeProcess(process.execPath, [npmCli, "run", "build"], repositoryRoot, process.env)
  assertRuntimeSuccess(build, "npm run build")
  const installResult = runRuntimeProcess(
    process.execPath,
    [path.join(repositoryRoot, "dist", "install.js"), "install", "--config-root", configRoot],
    repositoryRoot,
    process.env,
  )
  assertRuntimeSuccess(installResult, "installer CLI")
  await configureRuntimeModel(configRoot)
  const gitInit = runRuntimeProcess("git", ["init"], projectRoot, process.env)
  assertRuntimeSuccess(gitInit, "git init")

  const opencode = findOpenCodeBinary()
  const env = runtimeEnvironment(root)
  const firstLoad = runRuntimeProcess(opencode, ["debug", "agent", "mm-analyst"], projectRoot, env)
  assertRuntimeSuccess(firstLoad, "first opencode debug agent")
  assert.equal(JSON.parse(firstLoad.stdout).hidden, true)

  const commandRun = runRuntimeProcess(
    opencode,
    ["run", "--format", "json", "--auto", ...runtimeModelArgs(), "--command", "mm-agent"],
    projectRoot,
    env,
    240_000,
  )
  assertRuntimeSuccess(commandRun, "opencode run --command mm-agent")
  const commandEvents = commandRun.stdout
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as {
      type?: string
      sessionID?: string
      part?: {
        type?: string
        tool?: string
        text?: string
        state?: { status?: string; output?: string }
      }
    })
  const commandTexts = commandEvents
    .filter((event) => event.part?.type === "text")
    .map((event) => event.part?.text)
  const checkEvent = commandEvents.find(
    (event) => event.type === "tool_use" && event.part?.tool === "mm_agent_check",
  )
  assert.ok(checkEvent)
  assert.equal(checkEvent.part?.state?.status, "completed")
  const prepareEvents = commandEvents.filter(
    (event) => event.type === "tool_use" && event.part?.tool === "mm_agent_prepare",
  )
  const prepareEvent = prepareEvents.find((event) => {
    try {
      return JSON.parse(event.part?.state?.output ?? "{}").ok === true
    } catch {
      return false
    }
  })
  const check = JSON.parse(checkEvent.part?.state?.output ?? "") as {
    ok?: boolean
    checks?: Array<{ id?: string; status?: string; repair?: string; evidence?: string }>
  }
  assert.equal(check.checks?.length, 8)
  const python = check.checks?.find((item) => item.id === "python-3.12")
  assert.match(python?.status ?? "", /^(?:pass|fail)$/u)
  assert.equal(python?.repair, python?.status === "pass" ? "none" : "automatic")
  assert.equal(
    check.checks?.find((item) => item.id === "tex-template")?.status,
    "pass",
  )
  assert.match(
    check.checks?.find((item) => item.id === "tex-template")?.evidence ?? "",
    /pdf_bytes=[1-9]\d*/u,
  )
  if (check.ok) {
    assert.ok(prepareEvent)
    assert.equal(prepareEvent.part?.state?.status, "completed")
    const prepared = JSON.parse(prepareEvent.part?.state?.output ?? "") as {
      ok?: boolean
      result?: { mode?: string }
    }
    assert.equal(prepared.ok, true)
    assert.equal(prepared.result?.mode, "created")
  } else {
    assert.equal(prepareEvents.length, 0)
  }
  assert.ok(commandTexts.join(" ").length > 0)
  assert.match(commandEvents.find((event) => event.sessionID)?.sessionID ?? "", /^ses_/u)

  const restartedAgent = runRuntimeProcess(opencode, ["debug", "agent", "mm-analyst"], projectRoot, env)
  assertRuntimeSuccess(restartedAgent, "restarted opencode debug agent")
  const agent = JSON.parse(restartedAgent.stdout) as Record<string, unknown>
  assert.equal(agent.name, "mm-analyst")
  assert.equal(agent.hidden, true)

  const restartedSkill = runRuntimeProcess(opencode, ["debug", "skill"], projectRoot, env)
  assertRuntimeSuccess(restartedSkill, "restarted opencode debug skill")
  const skills = JSON.parse(restartedSkill.stdout) as Array<Record<string, unknown>>
  assert.equal(
    skills.find((candidate) => candidate.name === "mm-agent")?.location,
    path.join(configRoot, "skills", "mm-agent", "SKILL.md"),
  )
})

test("runtime: compaction-off fresh process recovers context and state from disk", {
  skip: !runtimeModelEnabled,
  timeout: 300_000,
}, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-runtime-recovery-"))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  const projectRoot = path.join(root, "project")
  const configRoot = path.join(root, "config-home", "opencode")
  const contextMarker = "MM_AGENT_DISK_CONTEXT_A14C"
  const stateMarker = "MM_AGENT_STATE_DISK_9C21"
  const stateRelativePath = path.join("runs", "case-alpha", "state.json")
  await mkdir(path.join(projectRoot, "runs", "case-alpha"), { recursive: true })
  await writeFile(path.join(projectRoot, "context.json"), `${JSON.stringify({ marker: contextMarker })}\n`)
  await writeFile(
    path.join(projectRoot, stateRelativePath),
    `${JSON.stringify({ case_id: "case-alpha", marker: stateMarker })}\n`,
  )

  const npmCli = process.env.npm_execpath
  assert.ok(npmCli)
  const build = runRuntimeProcess(process.execPath, [npmCli, "run", "build"], repositoryRoot, process.env)
  assertRuntimeSuccess(build, "npm run build")
  const installResult = runRuntimeProcess(
    process.execPath,
    [path.join(repositoryRoot, "dist", "install.js"), "install", "--config-root", configRoot],
    repositoryRoot,
    process.env,
  )
  assertRuntimeSuccess(installResult, "installer CLI")
  await configureRuntimeModel(configRoot)
  const gitInit = runRuntimeProcess("git", ["init"], projectRoot, process.env)
  assertRuntimeSuccess(gitInit, "git init")

  const opencode = findOpenCodeBinary()
  const env = { ...runtimeEnvironment(root), OPENCODE_DISABLE_AUTOCOMPACT: "1" }
  const firstProcess = runRuntimeProcess(opencode, ["debug", "agent", "mm-critic"], projectRoot, env)
  assertRuntimeSuccess(firstProcess, "compaction-off first OpenCode process")
  assert.equal(JSON.parse(firstProcess.stdout).name, "mm-critic")

  const prompt = [
    "Use the read tool to read context.json and runs/case-alpha/state.json from disk.",
    "Do not infer their contents.",
    "Reply with exactly the context marker, then a vertical bar, then the state marker.",
  ].join(" ")
  const recovery = runRuntimeProcess(
    opencode,
    ["run", "--format", "json", "--auto", ...runtimeModelArgs(), prompt],
    projectRoot,
    env,
    240_000,
  )
  assertRuntimeSuccess(recovery, "compaction-off fresh OpenCode recovery process")
  const events = recovery.stdout
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as {
      sessionID?: string
      type?: string
      part?: {
        type?: string
        tool?: string
        text?: string
        state?: { status?: string; input?: { filePath?: string } }
      }
    })
  const reads = events.filter((event) => event.type === "tool_use" && event.part?.tool === "read")
  assert.equal(reads.length, 2)
  assert.deepEqual(
    reads.map((event) => event.part?.state?.input?.filePath).sort(),
    [path.join(projectRoot, "context.json"), path.join(projectRoot, stateRelativePath)].sort(),
  )
  assert.ok(reads.every((event) => event.part?.state?.status === "completed"))
  assert.match(events.find((event) => event.sessionID)?.sessionID ?? "", /^ses_/u)
  const assistantText = events
    .filter((event) => event.part?.type === "text")
    .map((event) => event.part?.text)
    .join("")
    .trim()
  assert.equal(assistantText.replace(/\s*\|\s*/gu, "|"), `${contextMarker}|${stateMarker}`)
})
