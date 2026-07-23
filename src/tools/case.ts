import path from "node:path"
import { FileCaseContextStore } from "../core/case-context-store.js"
import type { Review } from "../core/schema.js"

export type CaseActionInput = {
  action: "open" | "dispatch" | "gate" | "inspect"
  caseId: string
  role?: "analyst" | "modeler" | "solver" | "writer"
  taskId?: string
  baseRevision?: number
  goal?: string
  constraints?: string[]
  resolvesBlocker?: string
  attemptId?: string
  review?: Omit<Review, "schema_version"> & { schema_version: number }
  expectedRevision?: number
}

export async function runCaseAction(projectRoot: string, input: CaseActionInput): Promise<unknown> {
  const store = new FileCaseContextStore({ runsRoot: path.join(projectRoot, "runs") })
  if (input.action === "open") return store.open(input.caseId)
  if (input.action === "inspect") return store.inspect(input.caseId)
  if (input.action === "dispatch") {
    if (!input.role || !input.goal) throw new Error("dispatch requires role and goal")
    return store.dispatch({
      caseId: input.caseId,
      role: input.role,
      goal: input.goal,
      ...(input.taskId ? { taskId: input.taskId } : {}),
      ...(input.baseRevision === undefined ? {} : { baseRevision: input.baseRevision }),
      ...(input.constraints ? { constraints: input.constraints } : {}),
      ...(input.resolvesBlocker ? { resolvesBlocker: input.resolvesBlocker } : {}),
    })
  }
  if (!input.attemptId || !input.review || input.expectedRevision === undefined)
    throw new Error("gate requires attemptId, review, and expectedRevision")
  return store.gate({
    caseId: input.caseId,
    attemptId: input.attemptId,
    review: input.review as Review,
    expectedRevision: input.expectedRevision,
  })
}
