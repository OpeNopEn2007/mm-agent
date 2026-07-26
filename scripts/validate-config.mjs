#!/usr/bin/env node
import process from "node:process"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import path from "node:path"

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const result = spawnSync(process.execPath, [path.join(repositoryRoot, "scripts", "run-golden-case.mjs"), "--validate-config"], {
  cwd: repositoryRoot,
  encoding: "utf8",
  timeout: 30_000,
  env: process.env,
})
process.stdout.write(result.stdout ?? "")
process.stderr.write(result.stderr ?? "")
if (result.status !== 0) process.exit(result.status ?? 1)