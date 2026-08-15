#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto"
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

// OpenCode 安装器。把 4 个 Skill 写进 OpenCode config root、把 plugin entry 加进
// `opencode.json` 的 plugin 数组、写一份 receipt。所有变更事务化(backup→写入→出错逐个
// 回滚),所有路径经 realpath 边界检查防符号链接逃逸,用户改动过的 owned 文件用 sha256
// 比对发现后拒绝静默覆盖。`install`/`update`/`remove` 三个顶层函数被测试 import 调用,
// CLI 入口在文件末尾。
export type InstallerOptions = {
  configRoot?: string
  pluginEntry?: string
}

type ReceiptBase = {
  package: "mm-agent"
  version: "0.1.0"
  plugin_entry: string
  plugin_added: boolean
  installed_skills: string[]
  files: Array<{
    path: string
    sha256: string
  }>
}

export type Receipt = ReceiptBase & {
  installed_skills: ["mm-agent", "mm-hmml", "mm-compute", "mm-report"]
}

type LegacyReceipt = ReceiptBase & {
  installed_skills: ["mm-agent"]
}

type StoredReceipt = Receipt | LegacyReceipt

export type InstallResult = {
  receipt: Receipt
  receiptPath: string
}

export type RemoveResult = {
  removed: string[]
  conflicts: string[]
}

export class InstallerConflictError extends Error {
  readonly conflicts: string[]

  constructor(conflicts: string[]) {
    super(`Modified owned file conflict: ${conflicts.join(", ")}`)
    this.name = "InstallerConflictError"
    this.conflicts = conflicts
  }
}

export class InstallerReceiptError extends Error {
  constructor(message: string) {
    super(`Invalid receipt: ${message}`)
    this.name = "InstallerReceiptError"
  }
}

// 包根目录(本文件编译后位于 dist/，所以 `..` 即包根)，所有 Skill 内容从包内读出后写入用户 config。
const packageRoot = fileURLToPath(new URL("..", import.meta.url))
// 安装器唯一允许写入用户 config root 的受管路径。任何 receipt 里的 file.path 必须落进这个白名单，
// 校验在 `validateReceipt` 和 `resolveOwnedPath` 两处把关。Skills 外的 rubrics/templates/runtime 走 plugin
// 运行时按包内路径访问，不经安装器写入。
const ownedSkillPaths = [
  "skills/mm-agent/SKILL.md",
  "skills/mm-hmml/SKILL.md",
  "skills/mm-compute/SKILL.md",
  "skills/mm-report/SKILL.md",
] as const
const configFilePath = "opencode.json"
const receiptFilePath = "mm-agent/receipt.json"
const allowedOwnedPaths = new Set<string>(ownedSkillPaths)

export function defaultConfigRoot(): string {
  return path.join(os.homedir(), ".config", "opencode")
}

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex")
}

function resolveConfigPath(configRoot: string, relativePath: string): string {
  if (
    path.posix.normalize(relativePath) !== relativePath
    || path.posix.isAbsolute(relativePath)
    || relativePath.includes("\\")
  ) {
    throw new InstallerReceiptError(`unsafe config path: ${relativePath}`)
  }
  const resolvedRoot = path.resolve(configRoot)
  const resolved = path.resolve(resolvedRoot, ...relativePath.split("/"))
  const fromRoot = path.relative(resolvedRoot, resolved)
  if (fromRoot === "" || fromRoot === ".." || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) {
    throw new InstallerReceiptError(`path resolves outside config root: ${relativePath}`)
  }
  return resolved
}

function resolveOwnedPath(configRoot: string, relativePath: string): string {
  if (!allowedOwnedPaths.has(relativePath)) {
    throw new InstallerReceiptError(`unowned or unsafe path: ${relativePath}`)
  }
  return resolveConfigPath(configRoot, relativePath)
}

function isWithinRealRoot(realRoot: string, candidate: string): boolean {
  const relative = path.relative(realRoot, candidate)
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

// 防符号链接逃逸：不仅做词法 `path.relative` 校验，还对路径上每一段已存在的组件做 `realpath`，
// 确认真实指向仍落在 config root 内。这阻挡一种攻击：合法相对路径中途经 symlink 指向 root 外。
// 不存在的末段组件允许通过(那是将要写入的目标)。逐段而非整体 realpath，是为了在中间某段是文件
// 而非目录时给出精确的错误，而不是一个模糊的 escape。
async function assertRealPathBoundary(configRoot: string, targetPath: string): Promise<void> {
  const resolvedRoot = path.resolve(configRoot)
  const relative = path.relative(resolvedRoot, path.resolve(targetPath))
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new InstallerReceiptError(`path resolves outside config root: ${targetPath}`)
  }
  const realRoot = await realpath(resolvedRoot)
  let current = resolvedRoot
  const segments = relative === "" ? [] : relative.split(path.sep)
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]!)
    let information
    try {
      information = await lstat(current)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return
      throw error
    }
    let realCurrent: string
    try {
      realCurrent = await realpath(current)
    } catch {
      throw new InstallerReceiptError(`existing path cannot be resolved safely: ${current}`)
    }
    if (!isWithinRealRoot(realRoot, realCurrent)) {
      throw new InstallerReceiptError(`existing path escapes config root: ${current}`)
    }
    if (index < segments.length - 1 && !information.isDirectory() && !information.isSymbolicLink()) {
      throw new InstallerReceiptError(`non-directory config path component: ${current}`)
    }
  }
}

async function readConfigFile(configRoot: string, relativePath: string): Promise<Buffer> {
  const targetPath = resolveConfigPath(configRoot, relativePath)
  await assertRealPathBoundary(configRoot, targetPath)
  return readFile(targetPath)
}

async function readOwnedFile(configRoot: string, relativePath: string): Promise<Buffer> {
  const targetPath = resolveOwnedPath(configRoot, relativePath)
  await assertRealPathBoundary(configRoot, targetPath)
  return readFile(targetPath)
}

// Receipt 是安装/update/remove 的唯一真相源。校验严格：package/version 必须精确匹配，
// plugin_entry 必须非空字符串，installed_skills 必须恰好是 legacy 单 Skill 集或当前四 Skill 集，
// files 数组必须为空、不能多、每条 sha256 匹配 64 位十六进制、且每条 path 都在 ownedSkillPaths 白名单内。
// 任何不符直接抛 `InstallerReceiptError`，不留局部状态——损坏 receipt 不能触发部分文件操作。
function validateReceipt(configRoot: string, value: unknown): StoredReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InstallerReceiptError("expected an object")
  }
  const receipt = value as Partial<StoredReceipt>
  if (receipt.package !== "mm-agent" || receipt.version !== "0.1.0") {
    throw new InstallerReceiptError("package or version mismatch")
  }
  if (typeof receipt.plugin_entry !== "string" || receipt.plugin_entry.length === 0) {
    throw new InstallerReceiptError("plugin_entry must be a non-empty string")
  }
  if (typeof receipt.plugin_added !== "boolean") {
    throw new InstallerReceiptError("plugin_added must be a boolean")
  }
  const legacy = JSON.stringify(receipt.installed_skills) === JSON.stringify(["mm-agent"])
  const current = JSON.stringify(receipt.installed_skills) === JSON.stringify(["mm-agent", "mm-hmml", "mm-compute", "mm-report"])
  if (!legacy && !current)
    throw new InstallerReceiptError("installed_skills must be the legacy mm-agent set or the current four-Skill set")
  const ownedPaths: readonly string[] = legacy ? [ownedSkillPaths[0]] : ownedSkillPaths
  if (!Array.isArray(receipt.files) || receipt.files.length !== ownedPaths.length) {
    throw new InstallerReceiptError("files must describe every installer-owned path exactly once")
  }
  const seen = new Set<string>()
  for (const file of receipt.files) {
    if (
      !file
      || typeof file !== "object"
      || typeof file.path !== "string"
      || typeof file.sha256 !== "string"
      || !/^[a-f0-9]{64}$/u.test(file.sha256)
      || seen.has(file.path)
    ) {
      throw new InstallerReceiptError("invalid file entry")
    }
    if (!ownedPaths.includes(file.path))
      throw new InstallerReceiptError(`unowned path in receipt: ${file.path}`)
    resolveOwnedPath(configRoot, file.path)
    seen.add(file.path)
  }
  if (ownedPaths.some((owned) => !seen.has(owned))) {
    throw new InstallerReceiptError("missing installer-owned path")
  }
  return receipt as StoredReceipt
}

async function readReceipt(configRoot: string): Promise<StoredReceipt> {
  let source: string
  try {
    source = (await readConfigFile(configRoot, receiptFilePath)).toString("utf8")
  } catch (error) {
    if (error instanceof InstallerReceiptError || (error as NodeJS.ErrnoException).code === "ENOENT") throw error
    throw error
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    throw new InstallerReceiptError("receipt is not valid JSON")
  }
  return validateReceipt(configRoot, parsed)
}

async function readReceiptIfPresent(configRoot: string): Promise<StoredReceipt | undefined> {
  try {
    return await readReceipt(configRoot)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw error
  }
}

// 冲突 = receipt 声称拥有的某个 Skill 文件，磁盘当前内容的 sha256 与 receipt 记录不符。
// 这用来实现"用户改过的已安装文件不能被静默覆盖"：update/remove 检测到冲突就拒绝，
// 要求用户先处理。对 legacy 单 Skill receipt，还要检查它没覆盖的那三个 Skill 路径是否已被占用——
// 避免升级时把别人装的东西无声覆盖掉。
async function findConflicts(configRoot: string, receipt: StoredReceipt): Promise<string[]> {
  const conflicts: string[] = []
  for (const file of receipt.files) {
    try {
      const content = await readOwnedFile(configRoot, file.path)
      if (sha256(content) !== file.sha256) conflicts.push(file.path)
    } catch (error) {
      if (error instanceof InstallerReceiptError) throw error
      conflicts.push(file.path)
    }
  }
  if (receipt.installed_skills.length === 1) {
    for (const ownedPath of ownedSkillPaths.slice(1)) {
      const target = resolveOwnedPath(configRoot, ownedPath)
      await assertRealPathBoundary(configRoot, target)
      try {
        await lstat(target)
        conflicts.push(ownedPath)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      }
    }
  }
  return conflicts
}

async function readConfig(configRoot: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse((await readConfigFile(configRoot, configFilePath)).toString("utf8")) as Record<string, unknown>
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { $schema: "https://opencode.ai/config.json" }
    }
    throw error
  }
}

type TransactionChange = {
  relativePath: string
  content?: string | Buffer
  delete?: true
}

type PreparedChange = TransactionChange & {
  targetPath: string
  temporaryPath: string | undefined
  backupPath: string
  hadOriginal: boolean
  backupMoved: boolean
  replacementPlaced: boolean
}

async function removeArtifact(configRoot: string, artifactPath: string): Promise<void> {
  try {
    await assertRealPathBoundary(configRoot, artifactPath)
    await rm(artifactPath, { force: true, maxRetries: 3, retryDelay: 25 })
  } catch {
    // 事务清理是 best-effort；留着 backup 比删除失败快照更安全。
  }
}

// 事务化写入：所有变更先逐个 backup(原文件)→写临时文件，全部就绪后再逐个用 rename 原子替换。
// 任一步骤失败时按相反顺序回滚：删已替换的新文件、把 backup 还原回原位。回滚本身若也失败则收集
// rollbackErrors 合并抛 `AggregateError`，宁可留 backup 也不删失败快照。final 清理 backup/临时文件
// 是 best-effort(`removeArtifact` 吞错)。全程逐次 `assertRealPathBoundary` 防止中途路径被改动。
// 写入的 Skills、opencode.json 和 receipt 作为一个 batch：要么全成功落地，要么整体回滚到调用前。
async function applyTransaction(configRoot: string, changes: TransactionChange[]): Promise<void> {
  const prepared: PreparedChange[] = []
  try {
    for (const change of changes) {
      const targetPath = resolveConfigPath(configRoot, change.relativePath)
      await assertRealPathBoundary(configRoot, targetPath)
      const parentPath = path.dirname(targetPath)
      await mkdir(parentPath, { recursive: true })
      await assertRealPathBoundary(configRoot, parentPath)
      await assertRealPathBoundary(configRoot, targetPath)
      let hadOriginal = false
      try {
        const information = await lstat(targetPath)
        if (information.isDirectory()) {
          throw new InstallerReceiptError(`transaction target is a directory: ${change.relativePath}`)
        }
        hadOriginal = true
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      }
      const suffix = `${path.basename(targetPath)}-${randomUUID()}`
      const temporaryPath = change.content !== undefined
        ? path.join(parentPath, `.mm-agent-tmp-${suffix}`)
        : undefined
      const backupPath = path.join(parentPath, `.mm-agent-backup-${suffix}`)
      if (temporaryPath) {
        await assertRealPathBoundary(configRoot, temporaryPath)
        await writeFile(temporaryPath, change.content!, { flag: "wx" })
      }
      prepared.push({
        ...change,
        targetPath,
        temporaryPath,
        backupPath,
        hadOriginal,
        backupMoved: false,
        replacementPlaced: false,
      })
    }

    for (const change of prepared) {
      await assertRealPathBoundary(configRoot, change.targetPath)
      if (change.hadOriginal) {
        await rename(change.targetPath, change.backupPath)
        change.backupMoved = true
      }
      if (change.temporaryPath) {
        await rename(change.temporaryPath, change.targetPath)
        change.replacementPlaced = true
        change.temporaryPath = undefined
      }
    }
  } catch (error) {
    const rollbackErrors: unknown[] = []
    for (const change of [...prepared].reverse()) {
      try {
        if (change.replacementPlaced) {
          await assertRealPathBoundary(configRoot, change.targetPath)
          await rm(change.targetPath, { force: true })
          change.replacementPlaced = false
        }
        if (change.backupMoved) {
          await assertRealPathBoundary(configRoot, change.backupPath)
          await rename(change.backupPath, change.targetPath)
          change.backupMoved = false
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError)
      }
    }
    for (const change of prepared) {
      if (change.temporaryPath) await removeArtifact(configRoot, change.temporaryPath)
      if (!change.backupMoved) await removeArtifact(configRoot, change.backupPath)
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError([error, ...rollbackErrors], "Installer transaction failed and rollback was incomplete")
    }
    throw error
  }

  for (const change of prepared) {
    if (change.temporaryPath) await removeArtifact(configRoot, change.temporaryPath)
    if (change.backupMoved) {
      await removeArtifact(configRoot, change.backupPath)
      change.backupMoved = false
    }
  }
}

// 实际落地逻辑：从包内读 4 个 Skill、读现有 opencode.json、把 plugin_entry 加进 plugin 数组、
// 组装新 receipt，把 [Skills + opencode.json + receipt] 作为一个事务写入。previousReceipt 用来处理
// plugin_entry 变更(升级后新 entry 替换旧 entry，且别重复 push)。
async function writeInstallation(
  configRoot: string,
  pluginEntry: string,
  previousReceipt?: StoredReceipt,
): Promise<InstallResult> {
  const skills = await Promise.all(ownedSkillPaths.map(async (ownedPath) => ({
    path: ownedPath,
    content: await readFile(path.join(packageRoot, ...ownedPath.split("/")), "utf8"),
  })))
  const config = await readConfig(configRoot)
  let plugins = Array.isArray(config.plugin) ? [...config.plugin] : []
  if (previousReceipt && previousReceipt.plugin_entry !== pluginEntry && previousReceipt.plugin_added) {
    plugins = plugins.filter((entry) => entry !== previousReceipt.plugin_entry)
  }
  let pluginAdded = previousReceipt?.plugin_entry === pluginEntry && previousReceipt.plugin_added
  if (!plugins.includes(pluginEntry)) {
    plugins.push(pluginEntry)
    pluginAdded = true
  } else if (previousReceipt?.plugin_entry !== pluginEntry) {
    pluginAdded = false
  }
  config.plugin = plugins
  const receipt: Receipt = {
    package: "mm-agent",
    version: "0.1.0",
    plugin_entry: pluginEntry,
    plugin_added: pluginAdded ?? false,
    installed_skills: ["mm-agent", "mm-hmml", "mm-compute", "mm-report"],
    files: skills.map((skill) => ({ path: skill.path, sha256: sha256(skill.content) })),
  }
  await applyTransaction(configRoot, [
    ...skills.map((skill) => ({ relativePath: skill.path, content: skill.content })),
    { relativePath: configFilePath, content: `${JSON.stringify(config, null, 2)}\n` },
    { relativePath: receiptFilePath, content: `${JSON.stringify(receipt, null, 2)}\n` },
  ])
  const receiptPath = resolveConfigPath(configRoot, receiptFilePath)
  return { receipt, receiptPath }
}

// 安装。前置：若已有 receipt，先比对 sha256 检测冲突，用户改过任何 owned 文件就抛
// `InstallerConflictError` 拒绝；若没有 receipt，退而检查 4 个 owned Skill 路径是否已被别的东西占用
// (任意一个已存在就当冲突)。通过后调 `writeInstallation`。默认 config root 为 `~/.config/opencode`，
// plugin_entry 默认指向包内 dist/index.js。
export async function install(options: InstallerOptions = {}): Promise<InstallResult> {
  const configRoot = path.resolve(options.configRoot ?? defaultConfigRoot())
  const pluginEntry = options.pluginEntry ?? pathToFileURL(fileURLToPath(new URL("./index.js", import.meta.url))).href
  if (typeof pluginEntry !== "string" || pluginEntry.length === 0) throw new Error("pluginEntry must be a non-empty string")
  await mkdir(configRoot, { recursive: true })
  await realpath(configRoot)
  const existingReceipt = await readReceiptIfPresent(configRoot)
  if (existingReceipt) {
    const conflicts = await findConflicts(configRoot, existingReceipt)
    if (conflicts.length > 0) throw new InstallerConflictError(conflicts)
  } else {
    for (const ownedSkillPath of ownedSkillPaths) {
      const installedSkillPath = resolveOwnedPath(configRoot, ownedSkillPath)
      await assertRealPathBoundary(configRoot, installedSkillPath)
      try {
        await lstat(installedSkillPath)
        throw new InstallerConflictError([ownedSkillPath])
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      }
    }
  }
  return writeInstallation(configRoot, pluginEntry, existingReceipt)
}

// 更新。必须有合法 receipt；比对所有 owned 文件 sha256，有冲突则拒绝、不改任何东西。
// 用现 receipt 调 writeInstallation 覆盖 Skill 内容并刷新 receipt 里的 sha256。
export async function update(options: InstallerOptions = {}): Promise<InstallResult> {
  const configRoot = path.resolve(options.configRoot ?? defaultConfigRoot())
  const pluginEntry = options.pluginEntry ?? pathToFileURL(fileURLToPath(new URL("./index.js", import.meta.url))).href
  if (typeof pluginEntry !== "string" || pluginEntry.length === 0) throw new Error("pluginEntry must be a non-empty string")
  const receipt = await readReceipt(configRoot)
  const conflicts = await findConflicts(configRoot, receipt)
  if (conflicts.length > 0) throw new InstallerConflictError(conflicts)
  return writeInstallation(configRoot, pluginEntry, receipt)
}

// 卸载。有 receipt 且无冲突才会执行。删所有 owned Skill 文件、(若 plugin_added)从 opencode.json
// 的 plugin 数组移除本 entry、删 receipt 自身。有冲突时只返回 conflicts 列表不删任何文件——
// 用户改过的东西仍属于用户。Plugin entry 不存在或由用户手动加入则保持不动。
export async function remove(options: InstallerOptions = {}): Promise<RemoveResult> {
  const configRoot = path.resolve(options.configRoot ?? defaultConfigRoot())
  const receipt = await readReceipt(configRoot)
  const conflicts = await findConflicts(configRoot, receipt)
  if (conflicts.length > 0) {
    return { removed: [], conflicts }
  }
  const changes: TransactionChange[] = receipt.files.map((file) => ({ relativePath: file.path, delete: true }))
  if (receipt.plugin_added) {
    const config = await readConfig(configRoot)
    if (Array.isArray(config.plugin)) config.plugin = config.plugin.filter((entry) => entry !== receipt.plugin_entry)
    changes.push({ relativePath: configFilePath, content: `${JSON.stringify(config, null, 2)}\n` })
  }
  changes.push({ relativePath: receiptFilePath, delete: true })
  await applyTransaction(configRoot, changes)
  return { removed: receipt.files.map((file) => file.path), conflicts: [] }
}

type InstallerAction = "install" | "update" | "remove"

// CLI 参数解析。接受 `install|update|remove` 和可选 `--config-root <path>`、`--plugin-entry <url>`。
// 严格成对校验，未知 flag 或缺值直接报错退出。返回的 options 喂给同名顶层函数。
function parseCliArguments(argv: string[]): { action: InstallerAction; options: InstallerOptions } {
  const [action, ...args] = argv
  if (action !== "install" && action !== "update" && action !== "remove") {
    throw new Error("usage: mm-agent-opencode <install|update|remove> [--config-root <path>] [--plugin-entry <url>]")
  }

  const options: InstallerOptions = {}
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    if (!value) throw new Error(`missing value for ${flag ?? "argument"}`)
    if (flag === "--config-root") options.configRoot = value
    else if (flag === "--plugin-entry") options.pluginEntry = value
    else throw new Error(`unknown argument: ${flag}`)
  }
  return { action, options }
}

// CLI 入口分发：把子命令路由到 install/update/remove，把整个结果以 JSON 写到 stdout。
// 安装器同时是模块(导出顶层函数供测试和库式调用)和 CLI(下面 main 守卫)，靠 process.argv[1]
// 是否等于本文件 URL 来区分。
async function runCli(argv: string[]): Promise<void> {
  const { action, options } = parseCliArguments(argv)
  const result = action === "install"
    ? await install(options)
    : action === "update"
      ? await update(options)
      : await remove(options)
  process.stdout.write(`${JSON.stringify({ action, result })}\n`)
}

// `mm-agent-opencode` 命令的 main 守卫：只有当本文件作为脚本直接执行(而非被 import)时才跑 CLI。
// 避免 import 这个文件做单元测试时副作用地执行命令行逻辑。错误写到 stderr 并设退出码 1。
const entryPath = process.argv[1]
if (entryPath && pathToFileURL(path.resolve(entryPath)).href === import.meta.url) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
