#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto"
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

export type InstallerOptions = {
  configRoot?: string
  pluginEntry?: string
}

export type Receipt = {
  package: "@mm-agent/opencode"
  version: "1.0.0"
  plugin_entry: string
  plugin_added: boolean
  installed_skills: ["mm-agent"]
  files: Array<{
    path: string
    sha256: string
  }>
}

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

const packageRoot = fileURLToPath(new URL("..", import.meta.url))
const ownedSkillPath = "skills/mm-agent/SKILL.md"
const configFilePath = "opencode.json"
const receiptFilePath = "mm-agent/receipt.json"
const allowedOwnedPaths = new Set([ownedSkillPath])

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

function validateReceipt(configRoot: string, value: unknown): Receipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InstallerReceiptError("expected an object")
  }
  const receipt = value as Partial<Receipt>
  if (receipt.package !== "@mm-agent/opencode" || receipt.version !== "1.0.0") {
    throw new InstallerReceiptError("package or version mismatch")
  }
  if (typeof receipt.plugin_entry !== "string" || receipt.plugin_entry.length === 0) {
    throw new InstallerReceiptError("plugin_entry must be a non-empty string")
  }
  if (typeof receipt.plugin_added !== "boolean") {
    throw new InstallerReceiptError("plugin_added must be a boolean")
  }
  if (
    !Array.isArray(receipt.installed_skills)
    || receipt.installed_skills.length !== 1
    || receipt.installed_skills[0] !== "mm-agent"
  ) {
    throw new InstallerReceiptError("installed_skills must contain only mm-agent")
  }
  if (!Array.isArray(receipt.files) || receipt.files.length !== allowedOwnedPaths.size) {
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
    resolveOwnedPath(configRoot, file.path)
    seen.add(file.path)
  }
  if ([...allowedOwnedPaths].some((owned) => !seen.has(owned))) {
    throw new InstallerReceiptError("missing installer-owned path")
  }
  return receipt as Receipt
}

async function readReceipt(configRoot: string): Promise<Receipt> {
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

async function readReceiptIfPresent(configRoot: string): Promise<Receipt | undefined> {
  try {
    return await readReceipt(configRoot)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw error
  }
}

async function findConflicts(configRoot: string, receipt: Receipt): Promise<string[]> {
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
    // Transaction cleanup is best effort; a retained backup is safer than deleting a failed snapshot.
  }
}

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

async function writeInstallation(
  configRoot: string,
  pluginEntry: string,
  previousReceipt?: Receipt,
): Promise<InstallResult> {
  const sourceSkillPath = path.join(packageRoot, "skills", "mm-agent", "SKILL.md")
  const skill = await readFile(sourceSkillPath, "utf8")
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
    package: "@mm-agent/opencode",
    version: "1.0.0",
    plugin_entry: pluginEntry,
    plugin_added: pluginAdded ?? false,
    installed_skills: ["mm-agent"],
    files: [{ path: ownedSkillPath, sha256: sha256(skill) }],
  }
  await applyTransaction(configRoot, [
    { relativePath: ownedSkillPath, content: skill },
    { relativePath: configFilePath, content: `${JSON.stringify(config, null, 2)}\n` },
    { relativePath: receiptFilePath, content: `${JSON.stringify(receipt, null, 2)}\n` },
  ])
  const receiptPath = resolveConfigPath(configRoot, receiptFilePath)
  return { receipt, receiptPath }
}

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
    const installedSkillPath = resolveOwnedPath(configRoot, ownedSkillPath)
    await assertRealPathBoundary(configRoot, installedSkillPath)
    try {
      await lstat(installedSkillPath)
      throw new InstallerConflictError([ownedSkillPath])
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }
  return writeInstallation(configRoot, pluginEntry, existingReceipt)
}

export async function update(options: InstallerOptions = {}): Promise<InstallResult> {
  const configRoot = path.resolve(options.configRoot ?? defaultConfigRoot())
  const pluginEntry = options.pluginEntry ?? pathToFileURL(fileURLToPath(new URL("./index.js", import.meta.url))).href
  if (typeof pluginEntry !== "string" || pluginEntry.length === 0) throw new Error("pluginEntry must be a non-empty string")
  const receipt = await readReceipt(configRoot)
  const conflicts = await findConflicts(configRoot, receipt)
  if (conflicts.length > 0) throw new InstallerConflictError(conflicts)
  return writeInstallation(configRoot, pluginEntry, receipt)
}

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

async function runCli(argv: string[]): Promise<void> {
  const { action, options } = parseCliArguments(argv)
  const result = action === "install"
    ? await install(options)
    : action === "update"
      ? await update(options)
      : await remove(options)
  process.stdout.write(`${JSON.stringify({ action, result })}\n`)
}

const entryPath = process.argv[1]
if (entryPath && pathToFileURL(path.resolve(entryPath)).href === import.meta.url) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
