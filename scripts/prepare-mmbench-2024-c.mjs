#!/usr/bin/env node
import { mkdir, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const commit = "8abc1300e378eb40fe85b1ffcba6820c1358610a"
const defaultRoot = process.env.MM_AGENT_MMBENCH_CACHE_DIR ?? path.join(process.platform === "win32" ? process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local") : os.homedir(), "mm-agent", "mmbench", "2024_C", commit)
const sources = {
  repository: "https://github.com/usail-hkust/LLM-MM-Agent",
  problem_url: `https://raw.githubusercontent.com/usail-hkust/LLM-MM-Agent/${commit}/MMBench/problem/2024_C.json`,
  dataset_url: `https://raw.githubusercontent.com/usail-hkust/LLM-MM-Agent/${commit}/MMBench/dataset/2024_C/Wimbledon_featured_matches.csv`,
  readme_url: `https://raw.githubusercontent.com/usail-hkust/LLM-MM-Agent/${commit}/README.md`,
  license_url: `https://raw.githubusercontent.com/usail-hkust/LLM-MM-Agent/${commit}/LICENSE`,
  upstream_commit: commit,
  retrieval_date: new Date().toISOString().slice(0, 10),
  license: "README.md states CC BY-NC 4.0; root LICENSE states GPL-3.0",
  redistribution: false,
  license_note: "Upstream license statements differ; this metadata records the discrepancy without a legal conclusion.",
}

if (process.argv.includes("--help")) {
  console.log("Usage: node scripts/prepare-mmbench-2024-c.mjs [--output cache-directory]")
  console.log("")
  console.log("Outputs three files in the cache directory:")
  console.log("  2024_C.json")
  console.log("  Wimbledon_featured_matches.csv")
  console.log("  provenance.json")
  console.log("")
  console.log("Example Golden command:")
  console.log("  npm run golden -- mmbench \\")
  console.log("    --mmbench-problem \"C:\\\\Users\\\\<user>\\\\AppData\\\\Local\\\\Temp\\\\opencode\\\\mmbench-2024-c\\\\2024_C.json\" \\")
  console.log("    --mmbench-dataset \"C:\\\\Users\\\\<user>\\\\AppData\\\\Local\\\\Temp\\\\opencode\\\\mmbench-2024-c\\\\Wimbledon_featured_matches.csv\" \\")
  console.log("    --mmbench-provenance \"C:\\\\Users\\\\<user>\\\\AppData\\\\Local\\\\Temp\\\\opencode\\\\mmbench-2024-c\\\\provenance.json\"")
  process.exit(0)
}

const requested = process.argv.indexOf("--output")
const output = requested < 0 ? defaultRoot : process.argv[requested + 1]
if (!output) throw new Error("--output requires a directory")

await mkdir(output, { recursive: true })
for (const [name, url] of [["2024_C.json", sources.problem_url], ["Wimbledon_featured_matches.csv", sources.dataset_url]]) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
  await writeFile(path.join(output, name), Buffer.from(await response.arrayBuffer()))
}
await writeFile(path.join(output, "provenance.json"), `${JSON.stringify(sources, null, 2)}\n`)

const problem = path.join(output, "2024_C.json")
const dataset = path.join(output, "Wimbledon_featured_matches.csv")
const provenance = path.join(output, "provenance.json")
for (const target of [problem, dataset, provenance]) {
  const info = await stat(target)
  if (!info.isFile()) throw new Error(`${target} is not a regular file`)
}

console.log(JSON.stringify({
  ok: true,
  cache: output,
  problem,
  dataset,
  provenance,
  redistribution: false,
  upstream_commit: commit,
  golden_command: [
    "npm run golden -- mmbench",
    `  --mmbench-problem "${problem}"`,
    `  --mmbench-dataset "${dataset}"`,
    `  --mmbench-provenance "${provenance}"`,
  ].join("\n"),
}, null, 2))