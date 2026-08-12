import { readdir, readFile, realpath, stat } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"

export function canonicalizeReviewEvidence(review, caseId) {
  if (!review || typeof review !== "object" || !Array.isArray(review.evidence)) return review
  const prefix = `runs/${caseId}/`
  return {
    ...review,
    evidence: review.evidence.map((item) => typeof item === "string" && item.startsWith(prefix) ? item.slice(prefix.length) : item),
  }
}

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
  const ready = pending.filter((task) => (task.depends_on ?? []).every((dependency) => accepted.has(`tasks/${dependency}/memory.json`)))
  return {
    action: "solve-wave",
    wave: state.current_wave,
    tasks: ready.map((task) => stageScope(`solving/${task.id}`, "solver", task.id)),
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
    const attemptPrefix = pdf.slice(0, -"report.pdf".length)
    const evidence = path.join(realRoot, ...attemptPrefix.split("/"), "evidence")
    const entries = await readdir(evidence, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile() || !/^compile-\d{3}\.json$/u.test(entry.name)) continue
      const reference = JSON.parse(await readFile(path.join(evidence, entry.name), "utf8"))
      const payloadRelative = `${attemptPrefix}evidence/${entry.name.replace(/\.json$/u, "-manifest.json")}`
      if (!(reference?.schema_version === 1 &&
        reference.kind === "compile" &&
        reference.status === "succeeded" &&
        reference.exit_code === 0 &&
        reference.path === payloadRelative)) continue
      const payloadBytes = await readFile(path.join(realRoot, ...payloadRelative.split("/")))
      if (createHash("sha256").update(payloadBytes).digest("hex") !== reference.sha256) continue
      const payload = JSON.parse(payloadBytes.toString("utf8"))
      if (!(payload?.schema_version === 1 &&
        payload.kind === "compile" &&
        payload.status === "succeeded" &&
        payload.exit_code === 0)) continue
      const currentHash = async (relative) => createHash("sha256")
        .update(await readFile(path.join(realRoot, ...relative.split("/"))))
        .digest("hex")
      const main = `${attemptPrefix}main.tex`
      const log = `${attemptPrefix}compile.log`
      const [mainHash, logHash, pdfHash] = await Promise.all([currentHash(main), currentHash(log), currentHash(pdf)])
      if (payload.inputs?.some((file) => file.path === main && file.sha256 === mainHash) &&
        payload.outputs?.some((file) => file.path === log && file.sha256 === logHash) &&
        payload.outputs?.some((file) => file.path === pdf && file.sha256 === pdfHash) &&
        payload.pdf?.path === pdf &&
        payload.pdf.sha256 === pdfHash) return true
    }
  } catch {
    return false
  }
  return false
}

export async function hasSuccessfulComputeEvidence(caseRoot, attempt) {
  const expected = Array.isArray(attempt?.expected_outputs) ? attempt.expected_outputs : []
  const result = expected.find((candidate) => typeof candidate === "string" && /^attempts\/solving\/[^/]+\/\d{3}\/execution-result\.json$/u.test(candidate))
  if (!result || !(await isAttemptComplete(caseRoot, { expected_outputs: [result] }))) return false
  try {
    const reference = JSON.parse(await readFile(path.join(await realpath(caseRoot), ...result.split("/")), "utf8"))
    const attemptPrefix = result.slice(0, -"execution-result.json".length)
    if (!(reference?.schema_version === 1 &&
      reference.kind === "compute" &&
      reference.status === "succeeded" &&
      reference.exit_code === 0 &&
      typeof reference.path === "string" &&
      reference.path.startsWith(`${attemptPrefix}evidence/`))) return false
    const root = await realpath(caseRoot)
    const payloadPath = path.join(root, ...reference.path.split("/"))
    const payloadBytes = await readFile(payloadPath)
    if (createHash("sha256").update(payloadBytes).digest("hex") !== reference.sha256) return false
    const payload = JSON.parse(payloadBytes.toString("utf8"))
    if (payload?.entry_script?.path !== `${attemptPrefix}code/solve.py`) return false
    if (typeof payload.stdout === "string" && /\bconverged\s*=\s*false\b/iu.test(payload.stdout)) return false
    if (typeof payload.stdout === "string" && /\boverall_status\s*[:=]\s*fail\b/iu.test(payload.stdout)) return false
    const files = [payload.entry_script, ...(payload.inputs ?? []), ...(payload.outputs ?? [])]
    const covered = new Set(files.map((file) => file?.path))
    for (const file of files) {
      if (typeof file?.path !== "string" || typeof file?.sha256 !== "string") return false
      const bytes = await readFile(path.join(root, ...file.path.split("/")))
      if (createHash("sha256").update(bytes).digest("hex") !== file.sha256) return false
    }
    const codePrefix = `${attemptPrefix}code/`
    const codeRoot = path.join(root, ...codePrefix.split("/").filter(Boolean))
    for (const relative of await readdir(codeRoot, { recursive: true })) {
      const normalized = String(relative).replaceAll("\\", "/")
      if (normalized.split("/").includes("__pycache__") || normalized.endsWith(".pyc")) continue
      const absolute = path.join(codeRoot, ...normalized.split("/"))
      if ((await stat(absolute)).isFile() && !covered.has(`${codePrefix}${normalized}`)) return false
    }
    return files.length > 0
  } catch {
    return false
  }
}

export async function hasMmbenchCoachQuality(caseRoot, attempt) {
  if (attempt?.scope !== "solving/coach-claim-tests") return true
  const context = String(attempt.contextPath ?? "").replaceAll("\\", "/")
  const base = context.replace(/\/context\.json$/u, "")
  if (!/^attempts\/solving\/coach-claim-tests\/\d{3}$/u.test(base)) return false
  try {
    const codeRoot = path.join(await realpath(caseRoot), ...base.split("/"), "code")
    try {
      const lines = (await readFile(path.join(codeRoot, "coach_claim_tests.csv"), "utf8"))
        .trim().split(/\r?\n/u).map((line) => line.split(","))
      if (lines.length > 1 &&
        lines[0].join(",") === "match_id,test_name,statistic,effect_size,p_value,n_points" &&
        new Set(lines.slice(1).map((row) => row[0])).size >= 2 &&
        lines.slice(1).every((row) => row.length === 6 &&
          row[0].length > 0 && row[1].length > 0 &&
          row.slice(2).every((value) => Number.isFinite(Number(value))) &&
          Number(row[4]) >= 0 && Number(row[4]) <= 1 &&
          Number(row[5]) > 0)) return true
    } catch (error) {
      if (error?.code !== "ENOENT") return false
    }
    try {
      const raw = JSON.parse(await readFile(path.join(codeRoot, "coach_claim_results.json"), "utf8"))
      const folds = Object.values(raw?.mixed_effects?.folds ?? {})
      if (folds.length < 3) return false
      return folds.every((fold) => {
        const values = [fold?.beta_0, fold?.beta_1, fold?.sigma_match, fold?.sigma_player]
        if (fold?.converged !== true || !values.every(Number.isFinite)) return false
        const randomEffects = Object.values(fold?.u_match_recovered ?? {})
        return randomEffects.length > 1 && randomEffects.every((value) =>
          Number.isFinite(value) &&
          Math.abs(value - fold.beta_0) > 1e-12 &&
          Math.abs(value - fold.beta_1) > 1e-12)
      })
    } catch (error) {
      if (error?.code !== "ENOENT") return false
    }
    const [config, perMatch, draws, regressions] = await Promise.all([
      "config.json",
      "per_match_coach_claim_results.json",
      "per_permutation_draws.json",
      "logistic_regression_results.json",
    ].map(async (name) => JSON.parse(await readFile(path.join(codeRoot, name), "utf8"))))
    if (config?.n_draws === 2000 && Array.isArray(perMatch?.per_match_results) && perMatch.per_match_results.length >= 3) {
      const lagged = typeof config?.logistic?.lag_rule === "string" && /\bt-1\b/u.test(config.logistic.lag_rule)
      const logisticP = regressions?.likelihood_ratio_test?.p_value
      return lagged &&
        Number.isFinite(regressions?.full_model?.coefficients?.sign_r_lag1) &&
        Number.isFinite(logisticP) && logisticP >= 0 && logisticP <= 1 &&
        regressions?.n_obs > 0 &&
        perMatch.per_match_results.every((result) => {
          const draw = draws?.matches?.[result?.match_id]
          const statistics = [
            result?.max_run_length_effect_size,
            result?.max_run_length_p_value,
            result?.swing_count_effect_size,
            result?.swing_count_p_value,
          ]
          return statistics.every(Number.isFinite) &&
            [result.max_run_length_p_value, result.swing_count_p_value].every((value) => value >= 0 && value <= 1) &&
            draw?.n_draws === config.n_draws &&
            draw?.max_run_length_draws?.length === draw.n_draws &&
            draw?.swing_count_draws?.length === draw.n_draws &&
            draw?.stratification_keys?.length > 1
        })
    }
    const matches = Object.keys(perMatch)
    if (config?.P_permutations !== 2000 || config?.logistic_specification?.predictors_strictly_through_t_minus_1 !== true || matches.length < 3) return false
    return matches.every((id) => {
      const result = perMatch[id]
      const draw = draws[id]
      const regression = regressions[id]
      const statistics = [
        result?.max_run_length_eval?.effect_size,
        result?.max_run_length_eval?.p_perm,
        result?.swing_count_eval?.effect_size,
        result?.swing_count_eval?.p_perm,
        regression?.full?.beta_sign,
        regression?.lrt_full_vs_serving?.p_value,
      ]
      return statistics.every(Number.isFinite) &&
        [result.max_run_length_eval.p_perm, result.swing_count_eval.p_perm, regression.lrt_full_vs_serving.p_value].every((value) => value >= 0 && value <= 1) &&
        draw?.P === config.P_permutations &&
        draw?.null_max_run_lengths?.length === draw.P &&
        draw?.null_swing_counts?.length === draw.P &&
        draw?.per_stratum_keys?.length > 1 &&
        regression?.n_used > 0
    })
  } catch {
    return false
  }
}
