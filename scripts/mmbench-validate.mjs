import { readFile, stat } from "node:fs/promises"
import path from "node:path"

export async function validateMmbench({ problemPath, datasetPath, provenancePath }) {
  for (const [label, target] of [["--mmbench-problem", problemPath], ["--mmbench-dataset", datasetPath], ["--mmbench-provenance", provenancePath]]) {
    if (!target) throw new Error(`${label} is required`)
    let info
    try { info = await stat(target) } catch { throw new Error(`${label} not found: ${target}`) }
    if (!info.isFile()) throw new Error(`${label} is not a regular file: ${target}`)
  }
  const provenance = JSON.parse(await readFile(provenancePath, "utf8"))
  for (const field of ["repository", "problem_url", "dataset_url", "upstream_commit", "retrieval_date", "license"])
    if (typeof provenance[field] !== "string" || !provenance[field].trim()) throw new Error(`MM-Bench provenance requires ${field}`)
  if (provenance.redistribution !== false) throw new Error("MM-Bench provenance must set redistribution to false")
  const problem = JSON.parse(await readFile(problemPath, "utf8"))
  const datasetPaths = Array.isArray(problem.dataset_path) ? problem.dataset_path : problem.dataset_path ? [problem.dataset_path] : []
  if (!datasetPaths.length) throw new Error("MM-Bench problem JSON is missing dataset_path")
  const datasetName = path.basename(datasetPath)
  if (!datasetPaths.includes(datasetName)) throw new Error(`--mmbench-dataset filename ${datasetName} does not match problem dataset_path ${datasetPaths.join(", ")}`)
  return [problemPath, datasetPath, provenancePath]
}