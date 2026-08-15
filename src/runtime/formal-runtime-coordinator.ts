import { lstat, readFile } from "node:fs/promises"
import path from "node:path"
import { FileCaseContextStore } from "../core/case-context-store.js"
import {
  CaseProtocolError,
  ContextManifestSchema,
  RuntimeEvidenceSchema,
  TaskGraphSchema,
  TaskListSchema,
  type CaseSnapshot,
  type ContextManifest,
  type Review,
} from "../core/schema.js"
import {
  hashPath,
  readJson,
  resolveInsideCase,
  writeJsonAtomic,
} from "../core/paths.js"

export type FlowInput =
  | { action: "advance"; caseId: string }
  | {
      action: "submit_review"
      caseId: string
      verdict: "pass" | "revise" | "block"
      findings: string[]
      requiredFixes: string[]
      evidence: string[]
    }

export type FlowTaskDirective = {
  status: "task"
  kind: "task"
  agent: "mm-analyst" | "mm-modeler" | "mm-solver" | "mm-writer" | "mm-critic"
  description: string
  prompt: string
  attempt_id: string
  context_path: string
}

export type FlowTerminalResult = {
  status: "blocked" | "failed" | "completed"
  kind: "blocked" | "failed" | "completed"
  message: string
  blocker?: unknown
  error?: { code: string; message: string }
  report_path?: string
  completion?: CaseSnapshot["completion"]
}

export type FlowResult = FlowTaskDirective | FlowTerminalResult

export type FormalRuntimeCoordinatorOptions = {
  runsRoot: string
  now?: () => string
}

type HandoffProjection = {
  schema_version: 1
  case_id: string
  status: "awaiting_actor" | "awaiting_critic" | "blocked" | "failed" | "completed"
  current_agent: string | null
  next_agent: string | null
  attempt_id: string | null
  context_path: string | null
  required_reads: string[]
  expected_outputs: string[]
  updated_at: string
}

type PendingDirective = FlowTaskDirective

const roleAgent = {
  analyst: "mm-analyst",
  modeler: "mm-modeler",
  solver: "mm-solver",
  writer: "mm-writer",
} as const

const roleDescription = {
  analyst: "Analyze the immutable problem input and produce the Analysis candidate.",
  modeler: "Choose and document the mathematical model and method evidence.",
  solver: "Execute the current DAG task and leave reproducible results and Task Memory.",
  writer: "Write the final report from accepted artifacts and compile the PDF.",
} as const

const stageRole = {
  analysis: "analyst",
  modeling: "modeler",
  reporting: "writer",
} as const

function sequenceText(manifest: ContextManifest): string {
  return String(manifest.sequence).padStart(3, "0")
}

function contextPathFor(manifest: ContextManifest): string {
  return `attempts/${manifest.scope}/${sequenceText(manifest)}/context.json`
}

function attemptBaseFor(manifest: ContextManifest): string {
  return `attempts/${manifest.scope}/${sequenceText(manifest)}`
}

function roleForManifest(manifest: ContextManifest): keyof typeof roleAgent | "critic" {
  return manifest.role
}

function caseRelativePath(value: string, caseId: string): string {
  if (typeof value !== "string")
    throw new CaseProtocolError("REVIEW_INVALID", "Review evidence must be a string path")
  const normalized = value.trim()
  const prefix = `runs/${caseId}/`
  if (normalized.startsWith(prefix))
    throw new CaseProtocolError("REVIEW_INVALID", `Review evidence is not Case-relative: ${value}`)
  if (
    !normalized ||
    normalized.startsWith("/") ||
    path.posix.isAbsolute(normalized) ||
    path.win32.isAbsolute(normalized) ||
    normalized.includes("\\") ||
    normalized.includes("\0") ||
    normalized.includes(":")
  )
    throw new CaseProtocolError("REVIEW_INVALID", `Review evidence is not Case-relative: ${value}`)
  const segments = normalized.split("/")
  if (segments.some((segment) => segment === "" || segment === "." || segment === ".."))
    throw new CaseProtocolError("REVIEW_INVALID", `Review evidence is not Case-relative: ${value}`)
  return normalized
}

function isDeclaredPath(candidate: string, declared: string): boolean {
  if (candidate === declared) return true
  return declared.endsWith("/") && candidate.startsWith(declared)
}

export class FormalRuntimeCoordinator {
  private readonly now: () => string
  // 进程内、按会话隔离的「下一条 Task directive」表。不持久化。每次 `mm_agent_flow`
  // 调用（advance 或 submit_review）末尾通过 `rememberDirective` 把结果暂存于此；
  // Skill 随后机械发出一次 `task`，其 `tool.execute.before` hook 消费这条暂存。因此
  // directive 只在「一次 `mm_agent_flow` → 紧跟的那一次 `task`」之间存在，plugin 重启后
  // 该 Map 会随着新的 flow 调用自然重建。
  private readonly pending = new Map<string, PendingDirective>()
  // Core 深模块。协调器从不直接读写 Case 文件——所有持久化变更都经过此 store，它拥有
  // 路径安全、schema 校验、基于 `state.revision` 的 compare-and-swap，以及「只有 gate 能改
  // accepted index / stage / revision」这条不变量。
  private readonly store: FileCaseContextStore

  constructor(private readonly options: FormalRuntimeCoordinatorOptions) {
    this.now = options.now ?? (() => new Date().toISOString())
    this.store = new FileCaseContextStore({ runsRoot: options.runsRoot, now: this.now })
  }

// Plugin 的 `tool.execute.before` hook 读取此处暂存的 directive，覆盖下一次 `task` 调用的 args。
// 终态结果（blocked/failed/completed）会删除暂存，避免本会话后续无关的 `task` 调用捡到过期指令。
rememberDirective(sessionId: string, result: FlowResult): void {
    if (result.status === "task") this.pending.set(sessionId, result)
    else this.pending.delete(sessionId)
  }

  pendingDirective(sessionId: string): PendingDirective | undefined {
    return this.pending.get(sessionId)
  }

  clearDirective(sessionId: string): void {
    this.pending.delete(sessionId)
  }

  async execute(input: FlowInput): Promise<FlowResult> {
    try {
      if (input.action === "advance") return await this.advance(input.caseId)
      return await this.submitReview(input)
    } catch (error) {
      const normalized = this.errorResult(error)
      // 失败时仍把失败写进 `handoff.json`，避免派生投影漏报上一次尝试的动作。真正返回给模型
      // 的是这个错误本身；handoff 写入是 best-effort，不得掩盖原始错误。
      await this.writeFailureHandoff(input.caseId, normalized).catch(() => undefined)
      return normalized
    }
  }

  // 只从磁盘事实推导的单一决策树——调用之间不做内存态延续。四个分支：
  // (1) completed/failed/blocked 返回终态投影；
  // (2) 有 active Attempt 且 expected outputs 齐全 → 为同一 Attempt 派 fresh Critic
  //     （复用同一 Manifest，不新建 Actor Attempt）；
  // (3) 有 active Attempt 但 outputs 不齐 → 恢复同一 Actor 和同一 `context.json`，不新 dispatch；
  // (4) 无 active Attempt → 按 DAG 顺序恰好 dispatch 下一个 Actor。
  async advance(caseId: string): Promise<FlowResult> {
    const snapshot = await this.store.inspect(caseId)
    if (snapshot.state.status === "completed") return this.completed(caseId, snapshot)
    if (snapshot.state.status === "failed") {
      const result = this.failed("CASE_FAILED", `Case ${caseId} is failed`)
      await this.writeHandoff(caseId, this.handoffForTerminal(caseId, result))
      return result
    }
    if (snapshot.state.status === "blocked") {
      const blocker = snapshot.state.blockers.find((item) => item.resolved_at === null)
      const result: FlowTerminalResult = {
        status: "blocked",
        kind: "blocked",
        message: blocker?.reason ?? `Case ${caseId} is blocked`,
        blocker,
      }
      await this.writeHandoff(caseId, this.handoffForTerminal(caseId, result))
      return result
    }

    const active = await this.currentActiveAttempt(caseId, snapshot)
    if (active) {
      const complete = await this.attemptOutputsComplete(caseId, active)
      const result = complete
        ? this.criticDirective(caseId, active)
        : this.actorDirective(caseId, active)
      await this.writeHandoff(caseId, await this.handoffForDirective(caseId, result))
      return result
    }

    const dispatched = await this.dispatchNext(caseId, snapshot)
    const result = this.actorDirective(caseId, dispatched.manifest)
    await this.writeHandoff(caseId, await this.handoffForDirective(caseId, result))
    return result
  }

  // Critic 只提供四个语义字段。本方法生成所有机器字段（`schema_version`、`attempt_id`、
  // `reviewed_at`），校验 evidence allowlist，再用调用方的 `expectedRevision` 调 Core Gate 做
  // compare-and-swap 并发控制。`block` 即使 candidate output 不全也接受；`revise`/`pass` 必须先
  // 有 expected outputs。Gate 成功后立即再调 `advance` 从最新磁盘状态路由下一步。
  private async submitReview(input: Extract<FlowInput, { action: "submit_review" }>): Promise<FlowResult> {
    const snapshot = await this.store.inspect(input.caseId)
    if (snapshot.state.status === "completed") return this.completed(input.caseId, snapshot)
    if (snapshot.state.status === "failed") {
      const result = this.failed("CASE_FAILED", `Case ${input.caseId} is failed`)
      await this.writeHandoff(input.caseId, this.handoffForTerminal(input.caseId, result))
      return result
    }
    const active = await this.currentActiveAttempt(input.caseId, snapshot)
    if (!active) return this.failed("REVIEW_INVALID", "no active Attempt is awaiting a Review")
    if (input.verdict !== "block" && !(await this.attemptOutputsComplete(input.caseId, active)))
      return this.failed("CANDIDATE_MISSING", "current Attempt outputs are incomplete")

    const evidence = await this.validateReviewEvidence(input.caseId, active, input)
    const review: Review = {
      schema_version: 1,
      attempt_id: active.attempt_id,
      verdict: input.verdict,
      findings: input.findings,
      required_fixes: input.requiredFixes,
      evidence,
      reviewed_at: this.now(),
    }
    try {
      await this.store.gate({
        caseId: input.caseId,
        attemptId: active.attempt_id,
        review,
        expectedRevision: snapshot.state.revision,
      })
    } catch (error) {
      throw error
    }
    // A successful Gate is immediately followed by routing from fresh disk facts.
    return this.advance(input.caseId).catch((error) => this.errorResult(error))
  }

  // 正式运行时每个 stage 最多一个 active Attempt。sort-and-take-first 让 resume 在 legacy
  // 开发期 runner 留下的未完成同 wave 兄弟 Attempt 上保持确定性；v1 正式 Case 只会有一个。
  private async currentActiveAttempt(caseId: string, snapshot: CaseSnapshot): Promise<ContextManifest | undefined> {
    const candidates = snapshot.activeAttempts.filter((manifest) => {
      if (snapshot.state.stage === "solving") return manifest.scope.startsWith("solving/")
      return manifest.scope === snapshot.state.stage
    })
    if (candidates.length === 0) return undefined
    // A formal run creates one active Attempt. Sorting keeps resume deterministic for legacy Cases
    // that may contain unfinished same-wave siblings from the development runner.
    return [...candidates].sort((left, right) => left.attempt_id.localeCompare(right.attempt_id))[0]
  }

  private async dispatchNext(caseId: string, snapshot: CaseSnapshot): Promise<{ manifest: ContextManifest }> {
    if (snapshot.state.stage === "solving") {
      const task = await this.nextSolverTask(caseId, snapshot)
      return this.store.dispatch({
        caseId,
        role: "solver",
        taskId: task.id,
        goal: `Execute the accepted task ${task.id} and produce its complete reproducible result.`,
        baseRevision: snapshot.state.revision,
      })
    }
    const role = stageRole[snapshot.state.stage as keyof typeof stageRole]
    if (!role) throw new CaseProtocolError("INVALID_SCOPE", `no formal route for stage ${snapshot.state.stage}`)
    return this.store.dispatch({
      caseId,
      role,
      goal: roleDescription[role],
      baseRevision: snapshot.state.revision,
    })
  }

  // DAG 驱动的串行执行。一个 task ready 当且仅当：处于当前 wave、自己的
  // `tasks/<id>/memory.json` 尚未 accepted、且所有依赖的 memory 都已 accepted。按字典序最小取首
  // 以保证确定性。v1 不并发执行同 wave task——DAG 记录依赖，但首条产品链是串行的。
  private async nextSolverTask(caseId: string, snapshot: CaseSnapshot): Promise<{ id: string }> {
    const root = path.join(this.options.runsRoot, caseId)
    const graph = await readJson(
      await resolveInsideCase(root, "artifacts/task-graph.json", "existing"),
      TaskGraphSchema,
    )
    const tasks = await readJson(
      await resolveInsideCase(root, "artifacts/tasks.json", "existing"),
      TaskListSchema,
    )
    const accepted = new Set(snapshot.state.accepted_artifacts.map((artifact) => artifact.path))
    const ready = graph.tasks
      .filter((task) => task.wave === snapshot.state.current_wave)
      .filter((task) => !accepted.has(`tasks/${task.id}/memory.json`))
      .filter((task) => task.depends_on.every((dependency) => accepted.has(`tasks/${dependency}/memory.json`)))
      .sort((left, right) => left.id.localeCompare(right.id))
    const next = ready[0]
    if (!next || !tasks.tasks.some((task) => task.id === next.id))
      throw new CaseProtocolError("INVALID_SCOPE", `no ready task exists for wave ${snapshot.state.current_wave}`)
    return { id: next.id }
  }

  // 前置 Gate 的完整性探针：只检查声明的 expected outputs 是否都在磁盘上，用于控制
  // Actor→Critic 的衔转。真正的 schema / 路径 / Runtime Evidence / hash / promotion 校验
  // 发生在 `submit_review` 时的 Core Gate 里，不在此次这里。
  private async attemptOutputsComplete(caseId: string, manifest: ContextManifest): Promise<boolean> {
    const root = path.join(this.options.runsRoot, caseId)
    for (const expected of manifest.expected_outputs) {
      try {
        await resolveInsideCase(root, expected, "existing")
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error as NodeJS.ErrnoException).code === "ENOTDIR")
          return false
        if (error instanceof CaseProtocolError && error.code === "PATH_ESCAPE") throw error
        return false
      }
    }
    return true
  }

  private actorDirective(caseId: string, manifest: ContextManifest): FlowTaskDirective {
    const agent = roleAgent[roleForManifest(manifest) as keyof typeof roleAgent]
    if (!agent) throw new CaseProtocolError("INVALID_SCOPE", `invalid Actor role: ${manifest.role}`)
    const contextPath = contextPathFor(manifest)
    return {
      status: "task",
      kind: "task",
      agent,
      description: roleDescription[manifest.role],
      prompt: `Read runs/${caseId}/${contextPath}. Follow that context.json and its declared files exactly. Produce every expected candidate output for this ${manifest.role} Attempt, using only the role's permitted Tool. Do not redefine the file contract or route another Agent. Return a concise completion message after the files exist.`,
      attempt_id: manifest.attempt_id,
      context_path: contextPath,
    }
  }

  private criticDirective(caseId: string, manifest: ContextManifest): FlowTaskDirective {
    const contextPath = contextPathFor(manifest)
    return {
      status: "task",
      kind: "task",
      agent: "mm-critic",
      description: "Review the current Attempt candidate against its declared rubric and upstream facts.",
      prompt: `Read runs/${caseId}/${contextPath}, its declared candidate outputs, required reads, rubric, and legal Runtime Evidence. For a solver Attempt, read execution-result.json. If kind is compute or a legacy synthesis envelope, parse its path to the raw payload and verify every entry_script, inputs, and outputs path exists and its sha256 matches. If kind is direct synthesis, its path is the artifact itself: verify that ordinary file exists within the current Attempt's allowed writes, its sha256 matches, and optional size_bytes matches; assess its semantic content without parsing it as a Runtime Evidence payload. If any path is missing or stale, verdict must be revise and required_fixes must name the repair. Return exactly one JSON object with only verdict, findings, required_fixes, and evidence. Cite the declared execution-result.json rather than any raw payload or direct artifact. Evidence may otherwise contain only existing file paths from context.review.required_reads candidates, context.required_reads, the rubric, or a valid Runtime Evidence JSON envelope referenced by execution-result.json; never use a directory, context.json, manifest.json, a runs/<case-id>/ prefixed path, or natural-language text. Do not edit files, call Tools, Gate, or delegate.`,
      attempt_id: manifest.attempt_id,
      context_path: contextPath,
    }
  }

  // Evidence allowlist 是 Critic 主张与 accepted 事实之间的安全边界。每条 evidence 必须是
  // Case-relative（无 `runs/<case-id>/` 前缀、无绝对路径、无 `..` 或分隔符逃逸）、是普通文件
  //（非符号链接），且恰好落进四类合法来源之一：
  // (1) Manifest 声明的 candidate / review-required-read / allowed-write / promotion target；
  // (2) Manifest required read（immutable input 或 accepted 上游 artifact）；
  // (3) 本 Manifest 的 rubric；
  // (4) 本 Attempt `evidence/` 下、通过 `RuntimeEvidenceSchema` 与 hash 校验的 JSON Runtime Evidence envelope。
  // `context.json`、`manifest.json`、其他 Attempt、case-root 前缀和自然语言描述全部拒绝。
  // `pass` 至少要引用一个 candidate output，使 Critic 不能只靠 rubric / 上游背书就放过。
  private async validateReviewEvidence(
    caseId: string,
    manifest: ContextManifest,
    input: Extract<FlowInput, { action: "submit_review" }>,
  ): Promise<string[]> {
    if (!Array.isArray(input.evidence) || input.evidence.length === 0)
      throw new CaseProtocolError("REVIEW_INVALID", "Review evidence must not be empty")
    const root = path.join(this.options.runsRoot, caseId)
    const attemptBase = attemptBaseFor(manifest)
    const declaredCandidates = [
      ...manifest.expected_outputs,
      ...manifest.review.required_reads,
      ...manifest.allowed_writes,
      ...manifest.promotions.map((promotion) => promotion.candidate),
    ]
    const requiredReads = manifest.required_reads.map((item) => item.path)
    const rubric = manifest.review.rubric.path
    const normalized: string[] = []
    let candidateCount = 0
    for (const raw of input.evidence) {
      const evidencePath = caseRelativePath(raw, caseId)
      const fileName = path.posix.basename(evidencePath)
      if (fileName === "context.json" || fileName === "manifest.json")
        throw new CaseProtocolError("REVIEW_INVALID", `Review evidence file is not allowed: ${evidencePath}`)
      const absolute = await resolveInsideCase(root, evidencePath, "existing")
      const info = await lstat(absolute)
      if (!info.isFile() || info.isSymbolicLink())
        throw new CaseProtocolError("REVIEW_INVALID", `Review evidence must be a regular file: ${evidencePath}`)
      const declared = declaredCandidates.some((item) => isDeclaredPath(evidencePath, item))
      const required = requiredReads.some((item) => isDeclaredPath(evidencePath, item))
      const isRubric = evidencePath === rubric
      const runtime = evidencePath.startsWith(`${attemptBase}/evidence/`)
      if (declared || required || isRubric) {
        if (declared) candidateCount += 1
        normalized.push(evidencePath)
        continue
      }
      if (runtime) {
        const parsed = await readJson(absolute, RuntimeEvidenceSchema)
        if (!parsed.path.startsWith(`${attemptBase}/evidence/`))
          throw new CaseProtocolError("REVIEW_INVALID", `Runtime Evidence escapes current Attempt: ${evidencePath}`)
        const payload = await resolveInsideCase(root, parsed.path, "existing")
        if ((await hashPath(payload)) !== parsed.sha256)
          throw new CaseProtocolError("REVIEW_INVALID", `Runtime Evidence hash is stale: ${evidencePath}`)
        normalized.push(evidencePath)
        continue
      }
      throw new CaseProtocolError("REVIEW_INVALID", `Review evidence is not declared: ${evidencePath}`)
    }
    if (input.verdict === "pass" && candidateCount === 0)
      throw new CaseProtocolError("REVIEW_INVALID", "pass Review must cite a candidate output")
    return normalized
  }

  // `handoff.json` 是 Flow 从权威磁盘事实（state.json、active Attempt、accepted artifacts、DAG）
  // 重建的*派生投影*。每次 Flow 调用都覆盖，不作为第二真相源：任何模块都不得用它做 promotion、
  // Gate 或 completion 判定——这些一律读底层持久 Case 文件。
  private async handoffForDirective(caseId: string, directive: FlowTaskDirective): Promise<HandoffProjection> {
    const manifest = await this.manifestFromDirective(caseId, directive)
    const actor = directive.agent === "mm-critic" ? "mm-critic" : directive.agent
    return {
      schema_version: 1,
      case_id: caseId,
      status: directive.agent === "mm-critic" ? "awaiting_critic" : "awaiting_actor",
      current_agent: actor,
      next_agent: directive.agent === "mm-critic" ? null : "mm-critic",
      attempt_id: directive.attempt_id,
      context_path: directive.context_path,
      required_reads: manifest?.required_reads.map((item) => item.path) ?? [],
      expected_outputs: manifest?.expected_outputs ?? [],
      updated_at: this.now(),
    }
  }

  private async manifestFromDirective(caseId: string, directive: FlowTaskDirective): Promise<ContextManifest | undefined> {
    const root = path.join(this.options.runsRoot, caseId)
    try {
      return await readJson(
        await resolveInsideCase(root, directive.context_path, "existing"),
        ContextManifestSchema,
      )
    } catch {
      return undefined
    }
  }

  private handoffForTerminal(caseId: string, result: FlowTerminalResult): HandoffProjection {
    return {
      schema_version: 1,
      case_id: caseId,
      status: result.status,
      current_agent: null,
      next_agent: null,
      attempt_id: null,
      context_path: null,
      required_reads: [],
      expected_outputs: [],
      updated_at: this.now(),
    }
  }

  private async completed(caseId: string, snapshot: CaseSnapshot): Promise<FlowTerminalResult> {
    const result: FlowTerminalResult = {
      status: "completed",
      kind: "completed",
      message: `Case ${caseId} completed`,
      report_path: "report/report.pdf",
      completion: snapshot.completion,
    }
    await this.writeHandoff(caseId, this.handoffForTerminal(caseId, result))
    return result
  }

  private failed(code: string, message: string): FlowTerminalResult {
    return { status: "failed", kind: "failed", message, error: { code, message } }
  }

  private errorResult(error: unknown): FlowTerminalResult {
    if (error instanceof CaseProtocolError) return this.failed(error.code, error.message)
    return this.failed("FLOW_ERROR", error instanceof Error ? error.message : String(error))
  }

  private async writeFailureHandoff(caseId: string, result: FlowTerminalResult): Promise<void> {
    if (result.status !== "failed") return
    let snapshot: CaseSnapshot
    try {
      snapshot = await this.store.inspect(caseId)
    } catch {
      return
    }
    if (snapshot.state.status !== "failed") return
    await this.writeHandoff(caseId, this.handoffForTerminal(caseId, result))
  }

  private async writeHandoff(caseId: string, handoff: HandoffProjection): Promise<void> {
    const root = path.join(this.options.runsRoot, caseId)
    const target = await resolveInsideCase(root, "handoff.json", "candidate")
    await writeJsonAtomic(target, handoff)
  }
}

export async function runFormalFlow(
  projectRoot: string,
  input: FlowInput,
  now?: () => string,
): Promise<FlowResult> {
  const coordinator = new FormalRuntimeCoordinator({
    runsRoot: path.join(projectRoot, "runs"),
    ...(now ? { now } : {}),
  })
  return coordinator.execute(input)
}
