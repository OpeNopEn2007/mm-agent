import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { validateMmbench } from "../scripts/mmbench-validate.mjs"

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "mm-agent-mmbench-"))
  const problemPath = path.join(directory, "2024_C.json")
  const datasetPath = path.join(directory, "Wimbledon_featured_matches.csv")
  const provenancePath = path.join(directory, "provenance.json")
  const provenance = {
    repository: "https://github.com/usail-hkust/LLM-MM-Agent",
    problem_url: "https://example.invalid/2024_C.json",
    dataset_url: "https://example.invalid/Wimbledon_featured_matches.csv",
    upstream_commit: "8abc1300e378eb40fe85b1ffcba6820c1358610a",
    retrieval_date: "2026-07-23",
    license: "CC BY-NC 4.0; root LICENSE states GPL-3.0",
    redistribution: false,
  }
  const problem = {
    background: "x",
    problem_requirement: "y",
    dataset_path: ["Wimbledon_featured_matches.csv"],
    dataset_description: { Wimbledon_featured_matches: "matches" },
    variable_description: { match_id: "id" },
  }
  await writeFile(problemPath, `${JSON.stringify(problem, null, 2)}\n`)
  await writeFile(datasetPath, "match_id,p1\n")
  await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`)
  return { directory, problemPath, datasetPath, provenancePath }
}

test("validateMmbench accepts matching problem, dataset, and provenance", async () => {
  const { directory, problemPath, datasetPath, provenancePath } = await fixture()
  try {
    const files = await validateMmbench({ problemPath, datasetPath, provenancePath })
    assert.deepEqual(files, [problemPath, datasetPath, provenancePath])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("validateMmbench rejects missing dataset", async () => {
  const { directory, problemPath, provenancePath } = await fixture()
  try {
    await assert.rejects(() => validateMmbench({ problemPath, datasetPath: "", provenancePath }), /--mmbench-dataset/)
    await assert.rejects(() => validateMmbench({ problemPath, datasetPath: path.join(directory, "missing.csv"), provenancePath }), /not found/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("validateMmbench rejects dataset filename that does not match problem dataset_path", async () => {
  const { directory, problemPath, provenancePath } = await fixture()
  const wrong = path.join(directory, "Other_dataset.csv")
  await writeFile(wrong, "x")
  try {
    await assert.rejects(() => validateMmbench({ problemPath, datasetPath: wrong, provenancePath }), /does not match problem dataset_path/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("validateMmbench rejects provenance with redistribution not strictly false", async () => {
  const { directory, problemPath, datasetPath, provenancePath } = await fixture()
  const overridden = JSON.parse(await import("node:fs/promises").then((mod) => mod.readFile(provenancePath, "utf8")))
  overridden.redistribution = "no"
  await writeFile(provenancePath, `${JSON.stringify(overridden, null, 2)}\n`)
  try {
    await assert.rejects(() => validateMmbench({ problemPath, datasetPath, provenancePath }), /redistribution/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("validateMmbench rejects provenance missing required fields", async () => {
  const { directory, problemPath, datasetPath, provenancePath } = await fixture()
  const partial = { repository: "x" }
  await writeFile(provenancePath, `${JSON.stringify(partial, null, 2)}\n`)
  try {
    await assert.rejects(() => validateMmbench({ problemPath, datasetPath, provenancePath }), /provenance requires/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})