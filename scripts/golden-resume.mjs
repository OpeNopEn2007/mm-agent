import { readdir, readFile, realpath, stat } from "node:fs/promises"
import path from "node:path"

export function planGoldenResume({ state, taskGraph, activeAttempts }) {
  const accepted = new Set(state.accepted_artifacts.map((artifact) => artifact.path))
  const active = new Map(activeAttempts.map((attempt) => [attempt.scope, attempt]))
  const stageScope = (scope, role, taskId) => active.get(scope)
    ? { action: "resume-attempt", role, task_id: taskId, attempt: active.get(scope) }
    : { action: "dispatch", role, task_id: taskId }

  if (state.status === "completed") return { action: "inspect-completion" }
  if (state.stage === "analysis") return stageScope("analysis", "analyst")
  if (state.stage === "modeling") return stageScope("modeling", "modeler")
  if (state.stage === "reporting") return stageScope("reporting", "writer")

  const currentWave = taskGraph.tasks.filter((task) => task.wave === state.current_wave)
  const pending = currentWave.filter((task) => !accepted.has(`tasks/${task.id}/memory.json`))
  return {
    action: "solve-wave",
    wave: state.current_wave,
    tasks: pending.map((task) => stageScope(`solving/${task.id}`, "solver", task.id)),
  }
}

export async function isAttemptComplete(caseRoot, attempt) {
  const expected = Array.isArray(attempt?.expected_outputs) ? attempt.expected_outputs : []
  if (expected.length === 0) return false
  if (typeof caseRoot !== "string" || !caseRoot) return false
  let realRoot
  try {
    realRoot = await realpath(caseRoot)
  } catch {
    return false
  }
  for (const candidate of expected) {
    if (typeof candidate !== "string" || !candidate) return false
    if (path.posix.isAbsolute(candidate) || path.win32.isAbsolute(candidate)) return false
    if (candidate.includes("\\") || candidate.includes("\0") || candidate.includes(":")) return false
    const segments = candidate.split("/")
    if (segments.some((segment, index) => segment === ".." || segment === "." || (segment === "" && (index !== segments.length - 1 || segments.length === 1)))) return false
    const requiresDirectory = candidate.endsWith("/")
    const absolute = path.resolve(realRoot, ...segments)
    let info
    try {
      info = await stat(absolute)
    } catch {
      return false
    }
    let realTarget
    try {
      realTarget = await realpath(absolute)
    } catch {
      return false
    }
    const relative = path.relative(realRoot, realTarget)
    if (relative.startsWith("..") || path.isAbsolute(relative)) return false
    if (requiresDirectory) {
      if (!info.isDirectory()) return false
    } else {
      if (!info.isFile()) return false
    }
  }
  return true
}

export async function hasSuccessfulCompileEvidence(caseRoot, attempt) {
  const expected = Array.isArray(attempt?.expected_outputs) ? attempt.expected_outputs : []
  const pdf = expected.find((candidate) => typeof candidate === "string" && /^attempts\/reporting\/\d{3}\/report\.pdf$/u.test(candidate))
  if (!pdf) return false
  let realRoot
  try {
    realRoot = await realpath(caseRoot)
    const evidence = path.join(realRoot, ...pdf.split("/").slice(0, -1), "evidence")
    const entries = await readdir(evidence, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile() || !/^compile-\d{3}\.json$/u.test(entry.name)) continue
      const reference = JSON.parse(await readFile(path.join(evidence, entry.name), "utf8"))
      if (reference?.kind === "compile" && reference.status === "succeeded" && reference.exit_code === 0) return true
    }
  } catch {
    return false
  }
  return false
}
