import type { Config, PluginInput, ToolContext } from "@opencode-ai/plugin"
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
  const fencedCode = /^```(?:text)?\s*([\s\S]*?)\s*```$/u.exec(text)
  return (fencedCode?.[1] ?? text).trim()
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
    type?: string
    main?: string
    types?: string
    bin?: Record<string, string>
    scripts?: Record<string, string>
    files?: string[]
  }

  assert.equal(packageJson.name, "@mm-agent/opencode")
  assert.equal(packageJson.version, "1.0.0")
  assert.equal(packageJson.type, "module")
  assert.equal(packageJson.main, "./dist/index.js")
  assert.equal(packageJson.types, "./dist/index.d.ts")
  assert.deepEqual(packageJson.bin, { "mm-agent-opencode": "./dist/install.js" })
  assert.deepEqual(Object.keys(packageJson.scripts ?? {}).sort(), ["build", "golden", "test", "test:runtime"])
  assert.deepEqual(packageJson.files, [
    "dist",
    "skills",
    "agents",
    "rubrics",
    "runtime",
    "knowledge",
    "templates/cumcmthesis",
    "templates/mcmthesis",
    "schemas",
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
  for (const required of ["dist/index.js", "dist/install.js", "skills/mm-agent/SKILL.md"]) {
    assert.ok(files.includes(required), required)
  }
  assert.ok(files.some((file) => file.startsWith("templates/cumcmthesis/")))
  assert.ok(files.some((file) => file.startsWith("templates/mcmthesis/")))
  assert.equal(files.includes("templates/report-generator.py"), false)
  assert.equal(
    files.some((file) => /(^|\/)(?:node_modules|runs|\.cache|\.config|\.git|\.worktrees)(?:\/|$)|\.(?:log|env)$/u.test(file)),
    false,
  )
})

test("golden command rejects Step 1 execution", () => {
  const npmCli = process.env.npm_execpath
  assert.ok(npmCli)
  const result = spawnSync(process.execPath, [npmCli, "run", "golden"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })

  assert.notEqual(result.status, 0)
  assert.match(`${result.stdout}${result.stderr}`, /Golden Case belongs to PLAN Step 7/)
})

test("Skill carries the exact mm-agent command marker", async () => {
  const skill = await readFile(path.join(repositoryRoot, "skills", "mm-agent", "SKILL.md"), "utf8")
  assert.match(skill, /respond exactly `MM_AGENT_SKILL_DISCOVERED_31B7`/u)
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

test("config hook injects the mm-agent-spike hidden subagent", async () => {
  const mmAgentPlugin = await loadPlugin()
  const hooks = await mmAgentPlugin({ directory: repositoryRoot, worktree: repositoryRoot } as PluginInput)
  const config = {} as Config

  await hooks.config?.(config)

  assert.deepEqual(config.agent?.["mm-agent-spike"], {
    description: "Reads project-local spike fixtures in a fresh child session.",
    mode: "subagent",
    hidden: true,
    permission: {
      read: "allow",
      glob: "allow",
      grep: "allow",
      edit: "deny",
      bash: "deny",
      task: "deny",
      webfetch: "deny",
    },
  })
})

test("config hook preserves an existing same-name agent unchanged", async () => {
  const userAgent = {
    description: "User-defined spike agent",
    mode: "subagent" as const,
    hidden: false,
    model: "example/user-model",
    permission: { read: "deny" as const },
  }
  const config = { agent: { "mm-agent-spike": userAgent } } as Config
  const mmAgentPlugin = await loadPlugin()
  const hooks = await mmAgentPlugin({ directory: repositoryRoot, worktree: repositoryRoot } as PluginInput)

  await hooks.config?.(config)

  assert.strictEqual(config.agent?.["mm-agent-spike"], userAgent)
  assert.deepEqual(config.agent?.["mm-agent-spike"], userAgent)
})

test("context Tool resolves a relative path from the real execution context", async () => {
  const directory = path.join(os.tmpdir(), "mm-agent spike project")
  const worktree = path.join(os.tmpdir(), "mm-agent spike worktree")
  const relativePath = path.join("fixtures", "context.json")
  const mmAgentPlugin = await loadPlugin()
  const hooks = await mmAgentPlugin({ directory: "wrong-plugin-directory", worktree: "wrong-plugin-worktree" } as PluginInput)
  const definition = hooks.tool?.mm_agent_spike_context

  assert.ok(definition)
  assert.match(definition.description, /read-only/i)
  const result = await definition.execute(
    { path: relativePath },
    { directory, worktree } as ToolContext,
  )
  assert.equal(typeof result, "string")
  assert.deepEqual(JSON.parse(result as string), {
    directory,
    worktree,
    resolved_path: path.resolve(directory, relativePath),
  })
})

test("context Tool enforces Windows drive and relative-path semantics", async () => {
  const directory = "D:\\spike root\\project"
  const worktree = "D:\\spike root"
  const mmAgentPlugin = await loadPlugin()
  const hooks = await mmAgentPlugin({ directory, worktree } as PluginInput)
  const definition = hooks.tool?.mm_agent_spike_context
  assert.notEqual(definition, undefined)
  const context = { directory, worktree } as ToolContext

  const result = await definition.execute({ path: "fixtures\\context.json" }, context)
  assert.equal(typeof result, "string")
  assert.equal(JSON.parse(result as string).resolved_path, path.win32.resolve(directory, "fixtures\\context.json"))

  for (const invalidPath of ["C:\\outside\\context.json", "C:drive-relative.json", "\\\\server\\share\\context.json", "\\rooted.json", "/posix-rooted.json"]) {
    await assert.rejects(() => definition.execute({ path: invalidPath }, context), /relative path/i)
  }
})

test("context Tool selects POSIX drive and UNC path semantics independently of the host", async () => {
  const mmAgentPlugin = await loadPlugin()
  const hooks = await mmAgentPlugin({ directory: repositoryRoot, worktree: repositoryRoot } as PluginInput)
  const definition = hooks.tool?.mm_agent_spike_context
  assert.notEqual(definition, undefined)

  const scenarios = [
    {
      directory: "/tmp/mm-agent-project",
      worktree: "/tmp/mm-agent-project",
      input: "fixtures/context.json",
      expected: "/tmp/mm-agent-project/fixtures/context.json",
    },
    {
      directory: "D:\\mm-agent\\project",
      worktree: "D:\\mm-agent",
      input: "fixtures\\context.json",
      expected: "D:\\mm-agent\\project\\fixtures\\context.json",
    },
    {
      directory: "\\\\server\\share\\project",
      worktree: "\\\\server\\share",
      input: "fixtures\\context.json",
      expected: "\\\\server\\share\\project\\fixtures\\context.json",
    },
  ]

  for (const scenario of scenarios) {
    const result = await definition.execute(
      { path: scenario.input },
      { directory: scenario.directory, worktree: scenario.worktree } as ToolContext,
    )
    assert.equal(JSON.parse(result as string).resolved_path, scenario.expected, scenario.directory)
  }

  for (const absolutePath of ["/outside/context.json", "C:\\outside\\context.json", "\\\\server\\share\\context.json"]) {
    await assert.rejects(
      () => definition.execute(
        { path: absolutePath },
        { directory: "/tmp/mm-agent-project", worktree: "/tmp/mm-agent-project" } as ToolContext,
      ),
      /relative path/i,
    )
  }
})

test("compaction appends one active Case state hint without replacing the prompt", async (t) => {
  for (const status of ["prepared", "running", "blocked"]) {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), `mm-agent-compaction-${status}-`))
    t.after(() => rm(projectRoot, { recursive: true, force: true }))
    const stateDirectory = path.join(projectRoot, "runs", "case-alpha")
    await mkdir(stateDirectory, { recursive: true })
    await writeFile(path.join(stateDirectory, "state.json"), `${JSON.stringify({ case_id: "case-alpha", status })}\n`)
    const mmAgentPlugin = await loadPlugin()
    const hooks = await mmAgentPlugin({ directory: projectRoot, worktree: projectRoot } as PluginInput)
    const output = { context: ["existing context"], prompt: "keep this prompt" }

    await hooks["experimental.session.compacting"]?.({ sessionID: "session-1" }, output)

    assert.deepEqual(output.context, [
      "existing context",
      "Active Case: case-alpha; state: runs/case-alpha/state.json. Inspect local state before continuing.",
    ])
    assert.equal(output.prompt, "keep this prompt")
  }
})

test("compaction adds nothing when the active Case is ambiguous or absent", async (t) => {
  const ambiguousRoot = await mkdtemp(path.join(os.tmpdir(), "mm-agent-ambiguous-"))
  const emptyRoot = await mkdtemp(path.join(os.tmpdir(), "mm-agent-empty-"))
  t.after(() => Promise.all([
    rm(ambiguousRoot, { recursive: true, force: true }),
    rm(emptyRoot, { recursive: true, force: true }),
  ]))
  for (const caseId of ["case-alpha", "case-beta"]) {
    const caseDirectory = path.join(ambiguousRoot, "runs", caseId)
    await mkdir(caseDirectory, { recursive: true })
    await writeFile(path.join(caseDirectory, "state.json"), `${JSON.stringify({ case_id: caseId, status: "running" })}\n`)
  }

  for (const projectRoot of [ambiguousRoot, emptyRoot]) {
    const mmAgentPlugin = await loadPlugin()
    const hooks = await mmAgentPlugin({ directory: projectRoot, worktree: projectRoot } as PluginInput)
    const output = { context: ["existing context"], prompt: "keep this prompt" }
    await hooks["experimental.session.compacting"]?.({ sessionID: "session-2" }, output)
    assert.deepEqual(output, { context: ["existing context"], prompt: "keep this prompt" })
  }
})

test("compaction ignores malformed inactive or mismatched Case state", async (t) => {
  const scenarios = [
    { name: "malformed", directoryCaseId: "case-alpha", state: "{not-json\n" },
    { name: "completed", directoryCaseId: "case-alpha", state: JSON.stringify({ case_id: "case-alpha", status: "completed" }) },
    { name: "failed", directoryCaseId: "case-alpha", state: JSON.stringify({ case_id: "case-alpha", status: "failed" }) },
    { name: "mismatched", directoryCaseId: "case-alpha", state: JSON.stringify({ case_id: "case-beta", status: "running" }) },
    { name: "missing-status", directoryCaseId: "case-alpha", state: JSON.stringify({ case_id: "case-alpha" }) },
  ]

  for (const scenario of scenarios) {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), `mm-agent-compaction-${scenario.name}-`))
    t.after(() => rm(projectRoot, { recursive: true, force: true }))
    const caseDirectory = path.join(projectRoot, "runs", scenario.directoryCaseId)
    await mkdir(caseDirectory, { recursive: true })
    await writeFile(path.join(caseDirectory, "state.json"), `${scenario.state}\n`)
    const mmAgentPlugin = await loadPlugin()
    const hooks = await mmAgentPlugin({ directory: projectRoot, worktree: projectRoot } as PluginInput)
    const output = { context: ["existing context"], prompt: "keep this prompt" }

    await hooks["experimental.session.compacting"]?.({ sessionID: "session-invalid" }, output)

    assert.deepEqual(output, { context: ["existing context"], prompt: "keep this prompt" }, scenario.name)
  }
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
  assert.match(installedSkill, /^---\nname: mm-agent\ndescription: /)
  const config = JSON.parse(await readFile(path.join(configRoot, "opencode.json"), "utf8"))
  assert.equal(config.username, "preserve-me")
  assert.deepEqual(config.plugin, ["existing-plugin", pluginEntry])
  const receipt = JSON.parse(await readFile(path.join(configRoot, "mm-agent", "receipt.json"), "utf8"))
  assert.deepEqual(receipt, {
    package: "@mm-agent/opencode",
    version: "1.0.0",
    plugin_entry: pluginEntry,
    plugin_added: true,
    installed_skills: ["mm-agent"],
    files: [{
      path: "skills/mm-agent/SKILL.md",
      sha256: createHash("sha256").update(installedSkill).digest("hex"),
    }],
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
    removed: ["skills/mm-agent/SKILL.md"],
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
  assert.deepEqual(removeResult, { removed: ["skills/mm-agent/SKILL.md"], conflicts: [] })
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

  const agentResult = runRuntimeProcess(opencode, ["debug", "agent", "mm-agent-spike"], projectRoot, env)
  assertRuntimeSuccess(agentResult, "opencode debug agent mm-agent-spike")
  const agent = JSON.parse(agentResult.stdout) as Record<string, unknown>
  assert.equal(agent.name, "mm-agent-spike")
  assert.equal(agent.mode, "subagent")
  assert.equal(agent.hidden, true)

  const skillResult = runRuntimeProcess(opencode, ["debug", "skill"], projectRoot, env)
  assertRuntimeSuccess(skillResult, "opencode debug skill")
  const skills = JSON.parse(skillResult.stdout) as Array<Record<string, unknown>>
  const skill = skills.find((candidate) => candidate.name === "mm-agent")
  assert.ok(skill)
  assert.equal(skill.location, path.join(configRoot, "skills", "mm-agent", "SKILL.md"))
})

test("runtime: model invokes the installed context Tool with real project paths", {
  skip: process.env.MM_AGENT_RUNTIME !== "1",
  timeout: 300_000,
}, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-runtime-tool-"))
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  const projectRoot = path.join(root, "project")
  const configRoot = path.join(root, "config-home", "opencode")
  const relativeFixture = path.join("fixtures", "context.json")
  await mkdir(path.join(projectRoot, "fixtures"), { recursive: true })
  await writeFile(path.join(projectRoot, relativeFixture), '{"marker":"MM_AGENT_TOOL_CONTEXT_6A82"}\n')

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
  const gitInit = runRuntimeProcess("git", ["init"], projectRoot, process.env)
  assertRuntimeSuccess(gitInit, "git init")

  const opencode = findOpenCodeBinary()
  const prompt = [
    "Call mm_agent_spike_context exactly once with path fixtures/context.json.",
    "Do not use any other tool.",
    "Then reply exactly MM_AGENT_TOOL_DONE_4F19.",
  ].join(" ")
  const result = runRuntimeProcess(
    opencode,
    ["run", "--format", "json", "--auto", prompt],
    projectRoot,
    runtimeEnvironment(root),
    240_000,
  )
  assertRuntimeSuccess(result, "opencode run context Tool prompt")
  const events = result.stdout
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as {
      type?: string
      sessionID?: string
      part?: { type?: string; tool?: string; text?: string; state?: { status?: string; output?: string } }
    })
  const toolEvent = events.find((event) => event.type === "tool_use" && event.part?.tool === "mm_agent_spike_context")
  assert.ok(toolEvent)
  assert.equal(toolEvent.part?.state?.status, "completed")
  assert.match(toolEvent.sessionID ?? "", /^ses_/u)
  const output = JSON.parse(toolEvent.part?.state?.output ?? "") as Record<string, unknown>
  assert.deepEqual(output, {
    directory: projectRoot,
    worktree: projectRoot,
    resolved_path: path.resolve(projectRoot, relativeFixture),
  })
  assert.ok(events.some((event) => event.part?.type === "text" && event.part.text === "MM_AGENT_TOOL_DONE_4F19"))
})

test("runtime: built-in task creates a linked fresh child that reads disk context", {
  skip: process.env.MM_AGENT_RUNTIME !== "1",
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
  const gitInit = runRuntimeProcess("git", ["init"], projectRoot, process.env)
  assertRuntimeSuccess(gitInit, "git init")

  const opencode = findOpenCodeBinary()
  const env = runtimeEnvironment(root)
  const prompt = [
    "Use the built-in task tool exactly once with subagent_type mm-agent-spike.",
    "Tell the child to read context.json from the project root and return exactly the marker value.",
    "Do not read context.json yourself and do not use any other tool.",
    "After the child responds, reply with exactly the child's response.",
  ].join(" ")
  const result = runRuntimeProcess(
    opencode,
    ["run", "--format", "json", "--auto", prompt],
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
  skip: process.env.MM_AGENT_RUNTIME !== "1",
  timeout: 300_000,
}, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mm-agent-runtime-restart-"))
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
  const gitInit = runRuntimeProcess("git", ["init"], projectRoot, process.env)
  assertRuntimeSuccess(gitInit, "git init")

  const opencode = findOpenCodeBinary()
  const env = runtimeEnvironment(root)
  const firstLoad = runRuntimeProcess(opencode, ["debug", "agent", "mm-agent-spike"], projectRoot, env)
  assertRuntimeSuccess(firstLoad, "first opencode debug agent")
  assert.equal(JSON.parse(firstLoad.stdout).hidden, true)

  const commandRun = runRuntimeProcess(
    opencode,
    ["run", "--format", "json", "--auto", "--command", "mm-agent"],
    projectRoot,
    env,
    240_000,
  )
  assertRuntimeSuccess(commandRun, "opencode run --command mm-agent")
  const commandEvents = commandRun.stdout
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { sessionID?: string; part?: { type?: string; text?: string } })
  const commandTexts = commandEvents
    .filter((event) => event.part?.type === "text")
    .map((event) => event.part?.text)
  assert.equal(
    normalizeModelMarkerText(commandTexts),
    "MM_AGENT_SKILL_DISCOVERED_31B7",
    `unexpected Skill command text events: ${sanitizeRuntimeOutput(JSON.stringify(commandTexts))}`,
  )
  assert.match(commandEvents.find((event) => event.sessionID)?.sessionID ?? "", /^ses_/u)

  const restartedAgent = runRuntimeProcess(opencode, ["debug", "agent", "mm-agent-spike"], projectRoot, env)
  assertRuntimeSuccess(restartedAgent, "restarted opencode debug agent")
  const agent = JSON.parse(restartedAgent.stdout) as Record<string, unknown>
  assert.equal(agent.name, "mm-agent-spike")
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
  skip: process.env.MM_AGENT_RUNTIME !== "1",
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
  const gitInit = runRuntimeProcess("git", ["init"], projectRoot, process.env)
  assertRuntimeSuccess(gitInit, "git init")

  const opencode = findOpenCodeBinary()
  const env = { ...runtimeEnvironment(root), OPENCODE_DISABLE_AUTOCOMPACT: "1" }
  const firstProcess = runRuntimeProcess(opencode, ["debug", "agent", "mm-agent-spike"], projectRoot, env)
  assertRuntimeSuccess(firstProcess, "compaction-off first OpenCode process")
  assert.equal(JSON.parse(firstProcess.stdout).name, "mm-agent-spike")

  const prompt = [
    "Use the read tool to read context.json and runs/case-alpha/state.json from disk.",
    "Do not infer their contents.",
    "Reply with exactly the context marker, then a vertical bar, then the state marker.",
  ].join(" ")
  const recovery = runRuntimeProcess(
    opencode,
    ["run", "--format", "json", "--auto", prompt],
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
