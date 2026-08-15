import path from "node:path"

type Permission = "allow" | "deny" | Record<string, "allow" | "deny">

type AgentConfig = {
  description: string
  mode: "subagent"
  hidden: true
  prompt: string
  permission: Record<string, Permission>
}

// Actor 的静态权限表。`attemptPath` 是 worktree 相对的 glob，由下面的 `permissionPath` 产生。
// OpenCode 对一条路径应用其匹配到的*最后一条*权限规则，所以广义拒绝（`*: "deny"` 和
// `edit.*: "deny"`）必须排在每-Attempt 的 `edit` 允许之前。
const actorPermissions = (attemptPath: string, skill: string | undefined, tools: Record<string, Permission> = {}): Record<string, Permission> => ({
  "*": "deny",
  read: "allow",
  glob: "allow",
  grep: "allow",
  // OpenCode applies the final matching pattern. Keep broad denial first.
  edit: {
    "*": "deny",
    [attemptPath]: "allow",
    [`${attemptPath}/context.json`]: "deny",
    [`${attemptPath}/review.json`]: "deny",
  },
  bash: "deny",
  task: "deny",
  mm_agent_case: "deny",
  mm_agent_flow: "deny",
  mm_agent_prepare: "deny",
  webfetch: "deny",
  websearch: "deny",
  lsp: "deny",
  external_directory: "deny",
  question: "deny",
  skill: { "*": "deny", ...(skill ? { [skill]: "allow" } : {}) },
  ...tools,
})

// 拼在每个角色身份 prompt 之后的系统级契约。它们只决定 Agent 工作的*风格*；*文件契约*
//（确切路径、attempt id、required reads、allowed writes、expected outputs）来自 runtime 生成
// 的 `context.json`，绝不来于此字符串——prompt 不得重新定义文件契约，也不得路由其他 Agent。
const candidateOnly = `Read the supplied context.json as the authoritative handoff. Use only its declared reads and writes, and finish every declared expected output. Do not edit state.json, stable artifacts, context.json, or review.json. Do not delegate. Return a concise completion message after writing the candidate.`

const criticReviewContract = ` For a solver Attempt, read the declared candidate execution-result.json. If kind is compute or a legacy synthesis envelope, parse its path to the raw payload and verify every entry_script, inputs, and outputs path exists and its sha256 matches. If kind is direct synthesis, its path is the artifact itself: verify that ordinary file exists within the current Attempt's allowed writes, its sha256 matches, and optional size_bytes matches; assess its semantic content without parsing it as a Runtime Evidence payload. If any path is missing or stale, verdict must be revise and required_fixes must name the repair. Review.evidence must cite the declared candidate execution-result.json rather than any raw payload or direct artifact. Evidence may otherwise contain only existing file paths from context.review.required_reads candidates, context.required_reads, the rubric, or a valid Runtime Evidence JSON envelope referenced by execution-result.json; never use a directory, context.json, manifest.json, a runs/<case-id>/ prefixed path, or natural-language text.`

const analysisOutputContract = ` Write tasks.json as bare JSON with exactly {"schema_version":1,"tasks":[{"id":"<lowercase letters, digits, and hyphens only; 1-64 characters>","description":"<non-empty string>","requires_computation":<boolean>}]}. Write task-graph.json as bare JSON with exactly {"schema_version":1,"tasks":[{"id":"<exact task id from tasks.json>","depends_on":["<existing task id>"],"wave":<positive integer>}]}. Define this as the post-modeling domain-solving DAG consumed by mm-solver: each task is a concrete mathematical, computational, or synthesis question that can be completed from accepted modeling artifacts and direct dependency memory. The fixed Analysis, Modeling, Reporting/LaTeX compile, Writer, Critic, Gate, and Flow stages remain harness-owned stage orchestration. Every task ID must match ^[a-z0-9][a-z0-9-]{0,63}$. Both task ID sets must match exactly and contain at least one task. Waves start at 1; every dependency must exist; the DAG must be acyclic. In tasks.json never add wave, depends_on, input_paths, or output_paths. In task-graph.json never add description, requires_computation, input_paths, or output_paths. Do not use waves, task_ids, or dependencies as replacement structures, and do not add title, inputs, expected_output, or other undeclared fields.`

function permissionPath(directory: string, worktree: string, attemptPath: string): string {
  return path.relative(worktree, path.join(directory, ...attemptPath.split("/"))).replaceAll("\\", "/")
}

// 五个 hidden subagent。模型不会在用户回合里按名字选中它们；只能通过 runtime 改写过的
// `task` 调用到达某个特定 Agent。每个 Actor 的 `edit` 权限只收到该角色的 per-Attempt 写目录，
// 其余（state.json、stable 成品、其他 Attempt、其他 Case）一律拒绝。
export function createAgentConfigs(directory: string, worktree: string): Record<string, AgentConfig> {
  const analysisAttempt = permissionPath(directory, worktree, "runs/*/attempts/analysis/*/**")
  const modelingAttempt = permissionPath(directory, worktree, "runs/*/attempts/modeling/*/**")
  const solvingAttempt = permissionPath(directory, worktree, "runs/*/attempts/solving/*/*/**")
  const reportingAttempt = permissionPath(directory, worktree, "runs/*/attempts/reporting/*/**")

  return {
  "mm-analyst": {
    description: "Produces a Problem Analysis candidate from immutable Case input.",
    mode: "subagent",
    hidden: true,
    prompt: `${candidateOnly} You are the Problem Analyst. Understand the immutable input, state the assumptions and constraints, and produce problem-understanding.md, tasks.json, and task-graph.json for the active Analysis Attempt.${analysisOutputContract}`,
    permission: actorPermissions(analysisAttempt, undefined, { mm_agent_hmml: "deny", mm_agent_compute: "deny", mm_agent_compile: "deny" }),
  },
  "mm-modeler": {
    description: "Produces a Mathematical Modeling candidate from accepted analysis.",
    mode: "subagent",
    hidden: true,
    prompt: `${candidateOnly} You are the Mathematical Modeler. Use mm_agent_hmml for the declared retrieval candidates, then choose and justify variables, assumptions, equations, validation, and task solve requirements. Retrieval is evidence, not a conclusion.`,
    permission: actorPermissions(modelingAttempt, "mm-hmml", { mm_agent_hmml: "allow", mm_agent_compute: "deny", mm_agent_compile: "deny" }),
  },
  "mm-solver": {
    description: "Produces one DAG-scoped Computational Solving candidate.",
    mode: "subagent",
    hidden: true,
    prompt: `${candidateOnly} You are the Computational Solver. Execute the current task from current_task using only the accepted model and direct dependency memory declared by context.json. When current_task.requires_computation is true, use mm_agent_compute for the current Attempt code directory and leave reproducible results, figures, compute execution evidence, and Task Memory. When current_task.requires_computation is false, do not create evidence/ or hand-write a raw manifest: write execution-result.json as a direct synthesis result with kind "synthesis", status "succeeded", exit_code 0, path pointing to the ordinary artifact file under this Attempt's allowed writes, sha256 equal to that artifact's hash, and optional size_bytes; then write Task Memory.`,
    permission: actorPermissions(solvingAttempt, "mm-compute", { mm_agent_hmml: "deny", mm_agent_compute: "allow", mm_agent_compile: "deny" }),
  },
  "mm-writer": {
    description: "Produces a Solution Reporting candidate from accepted artifacts.",
    mode: "subagent",
    hidden: true,
    prompt: `${candidateOnly} You are the Solution Writer. Use only accepted artifacts and Task Memory declared by context.json, include every required problem deliverable, write the report candidate, and use mm_agent_compile for this reporting Attempt. Finish with a successful non-empty PDF and its compile evidence.`,
    permission: actorPermissions(reportingAttempt, "mm-report", { mm_agent_hmml: "deny", mm_agent_compute: "deny", mm_agent_compile: "allow" }),
  },
  "mm-critic": {
    description: "Fresh read-only Critic that returns a structured review for one existing Attempt.",
    mode: "subagent",
    hidden: true,
    prompt: `You are the semantic Critic. Read the supplied context.json, candidate outputs, declared upstream facts, rubric, and legal Runtime Evidence. Check the candidate's schema, completeness, factual consistency, reproducibility, and report quality for this role.${criticReviewContract} Return exactly one bare JSON object with only verdict, findings, required_fixes, and evidence; use existing Case-relative paths in evidence. Do not edit files, call Tools, delegate, or route the Case.`,
    permission: {
      "*": "deny",
      read: "allow",
      glob: "allow",
      grep: "allow",
      edit: "deny",
      bash: "deny",
      task: "deny",
      mm_agent_case: "deny",
      mm_agent_prepare: "deny",
      mm_agent_hmml: "deny",
      mm_agent_compute: "deny",
      mm_agent_compile: "deny",
      webfetch: "deny",
      websearch: "deny",
      lsp: "deny",
      external_directory: "deny",
      question: "deny",
      skill: { "*": "deny" },
    },
  },
  }
}
