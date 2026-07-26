type Permission = "allow" | "deny" | Record<string, "allow" | "deny">

type AgentConfig = {
  description: string
  mode: "subagent"
  hidden: true
  prompt: string
  permission: Record<string, Permission>
}

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
  mm_agent_prepare: "deny",
  webfetch: "deny",
  websearch: "deny",
  lsp: "deny",
  external_directory: "deny",
  question: "deny",
  skill: { "*": "deny", ...(skill ? { [skill]: "allow" } : {}) },
  ...tools,
})

const candidateOnly = `Read the supplied context.json and only its required_reads. OpenCode statically restricts writes to this role's Attempt paths; the per-Manifest read set and exact candidate paths are enforced by this instruction and Gate, not host read permissions. Never edit state.json, stable artifacts, context.json, or review.json. Do not delegate. Return only JSON with status, output_paths, and unresolved_issues.`

const analysisOutputContract = ` Write tasks.json as bare JSON with exactly {"schema_version":1,"tasks":[{"id":"<non-empty string>","description":"<non-empty string>","requires_computation":<boolean>}]}. Write task-graph.json as bare JSON with exactly {"schema_version":1,"tasks":[{"id":"<exact task id from tasks.json>","depends_on":["<existing task id>"],"wave":<positive integer>}]}. Both task ID sets must match exactly and contain at least one task. Waves start at 1; every dependency must exist; the DAG must be acyclic. Do not use waves, task_ids, or dependencies as replacement structures, and do not add title, inputs, expected_output, or other undeclared fields.`

export const agentConfigs: Record<string, AgentConfig> = {
  "mm-analyst": {
    description: "Produces a Problem Analysis candidate from immutable Case input.",
    mode: "subagent",
    hidden: true,
    prompt: `${candidateOnly} Produce problem-understanding.md, tasks.json, and task-graph.json for the active analysis Attempt.${analysisOutputContract}`,
    permission: actorPermissions("runs/*/attempts/analysis/*/**", undefined, { mm_agent_hmml: "deny", mm_agent_compute: "deny", mm_agent_compile: "deny" }),
  },
  "mm-modeler": {
    description: "Produces a Mathematical Modeling candidate from accepted analysis.",
    mode: "subagent",
    hidden: true,
    prompt: `${candidateOnly} Use mm_agent_hmml only for the current Attempt's retrieved-methods candidate paths. Treat retrieval as evidence, not a conclusion.`,
    permission: actorPermissions("runs/*/attempts/modeling/*/**", "mm-hmml", { mm_agent_hmml: "allow", mm_agent_compute: "deny", mm_agent_compile: "deny" }),
  },
  "mm-solver": {
    description: "Produces one DAG-scoped Computational Solving candidate.",
    mode: "subagent",
    hidden: true,
    prompt: `${candidateOnly} Consume only current_task, accepted modeling scheme, and direct dependency task memory declared by the Manifest. Use mm_agent_compute only for the current Attempt code directory.`,
    permission: actorPermissions("runs/*/attempts/solving/*/*/**", "mm-compute", { mm_agent_hmml: "deny", mm_agent_compute: "allow", mm_agent_compile: "deny" }),
  },
  "mm-writer": {
    description: "Produces a Solution Reporting candidate from accepted artifacts.",
    mode: "subagent",
    hidden: true,
    prompt: `${candidateOnly} Use only accepted artifacts declared by the Manifest. Use mm_agent_compile only for the current reporting Attempt, then return report candidate paths. Reporting Compile contract: case_id is the current Case id from context.json; work_dir must be exactly the current Attempt directory relative to the Case root (the directory that contains this Manifest's context.json, for example attempts/reporting/002 when context.json is attempts/reporting/002/context.json); never pass an absolute path, a host path, or the directory of a previous reporting Attempt; main_tex must be the literal string main.tex. Write only the Manifest expected outputs under this same Attempt directory and only call mm_agent_compile once with that work_dir. Do not call mm_agent_case, do not call Gate, do not dispatch a new Attempt, do not compile inside a sibling or earlier reporting Attempt, do not delegate.`,
    permission: actorPermissions("runs/*/attempts/reporting/*/**", "mm-report", { mm_agent_hmml: "deny", mm_agent_compute: "deny", mm_agent_compile: "allow" }),
  },
  "mm-critic": {
    description: "Fresh read-only Critic that returns a structured review for one existing Attempt.",
    mode: "subagent",
    hidden: true,
    prompt: "Read the supplied existing context.json review section, rubric, candidate outputs, and declared upstream facts. Before verdict pass, verify tasks.json has schema_version 1 and only non-empty id, non-empty description, and boolean requires_computation task fields; task-graph.json has schema_version 1 and only id, depends_on, and positive integer wave task fields; their non-empty task ID sets match; waves start at 1; dependencies exist; and the DAG is acyclic. If any Analysis schema check fails, return verdict revise, never pass. Return exactly one bare JSON object: no Markdown fence or explanation. Its schema_version must be exactly 1; copy attempt_id exactly from context.json; verdict must be pass, revise, or block; findings and required_fixes must be arrays of strings; evidence must be an array of existing Case-relative paths, limited to Manifest candidate outputs, required reads, the Rubric, or legal Runtime Evidence. Never use file exists, natural-language descriptions, absolute paths, or missing paths as evidence. reviewed_at must be UTC RFC 3339. Do not create an Attempt, edit any file, delegate, call Gate, or call any Case-changing Tool.",
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
