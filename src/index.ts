import { tool, type Plugin } from "@opencode-ai/plugin"
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createAgentConfigs } from "./agents.js"
import { runCaseAction } from "./tools/case.js"
import { runPreflight } from "./tools/check.js"
import { runCompile } from "./tools/compile.js"
import { runCompute } from "./tools/compute.js"
import { retrieveHmml } from "./tools/hmml.js"
import { prepareCase } from "./tools/prepare.js"

const packageRoot = fileURLToPath(new URL("..", import.meta.url))

async function findActiveCase(directory: string): Promise<string | undefined> {
  let entries
  try {
    entries = await readdir(path.join(directory, "runs"), { withFileTypes: true })
  } catch {
    return undefined
  }

  const candidates: string[] = []
  const activeStatuses = new Set(["prepared", "running", "blocked"])
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    try {
      const state = JSON.parse(await readFile(path.join(directory, "runs", entry.name, "state.json"), "utf8")) as {
        case_id?: unknown
        status?: unknown
      }
      if (state.case_id === entry.name && typeof state.status === "string" && activeStatuses.has(state.status)) {
        candidates.push(entry.name)
      }
    } catch {
      continue
    }
  }
  return candidates.length === 1 ? candidates[0] : undefined
}

const mmAgentPlugin = (async ({ directory, worktree }) => ({
  config: async (config) => {
    config.agent ??= {}
    for (const [name, agent] of Object.entries(createAgentConfigs(directory, worktree)))
      if (!(name in config.agent)) config.agent[name] = agent
  },
  tool: {
    mm_agent_check: tool({
      description: "Check the mm-agent environment with structured evidence and repair ownership before starting a Case.",
      args: {
        scope: tool.schema.enum(["all", "environment", "case", "hmml", "tex"]).optional(),
        case_id: tool.schema.string().optional(),
      },
      execute: async (input, context) => {
        return JSON.stringify(await runPreflight({
          projectRoot: context.directory,
          packageRoot,
          scope: input.scope ?? "all",
          ...(input.case_id ? { caseId: input.case_id } : {}),
        }))
      },
    }),
    mm_agent_prepare: tool({
      description: "Discover explicit input or problems/, then create or resume an immutable Case only through CaseContextStore.open.",
      args: {
        case_id: tool.schema.string(),
        explicit_paths: tool.schema.array(tool.schema.string()).optional(),
        revision_budget: tool.schema.object({
          analysis: tool.schema.number(),
          modeling: tool.schema.number(),
          solving_per_task: tool.schema.number(),
          reporting: tool.schema.number(),
        }).optional(),
      },
      execute: async (input, context) => {
        const budget = input.revision_budget
        return JSON.stringify(await prepareCase({
          projectRoot: context.directory,
          runsRoot: path.join(context.directory, "runs"),
          rubricRoot: path.join(packageRoot, "rubrics"),
        }, {
          caseId: input.case_id,
          ...(input.explicit_paths ? { explicitPaths: input.explicit_paths } : {}),
          ...(budget ? {
            revisionBudget: {
              analysis: budget.analysis,
              modeling: budget.modeling,
              solvingPerTask: budget.solving_per_task,
              reporting: budget.reporting,
            },
          } : {}),
        }))
      },
    }),
    mm_agent_case: tool({
      description: "Direct CaseContextStore adapter for open, dispatch, gate, and inspect. Gate is the only state transition.",
      args: {
        action: tool.schema.enum(["open", "dispatch", "gate", "inspect"]),
        case_id: tool.schema.string(),
        role: tool.schema.enum(["analyst", "modeler", "solver", "writer"]).optional(),
        task_id: tool.schema.string().optional(),
        base_revision: tool.schema.number().optional(),
        goal: tool.schema.string().optional(),
        constraints: tool.schema.array(tool.schema.string()).optional(),
        resolves_blocker: tool.schema.string().optional(),
        attempt_id: tool.schema.string().optional(),
        review: tool.schema.object({
          schema_version: tool.schema.number(),
          attempt_id: tool.schema.string(),
          verdict: tool.schema.enum(["pass", "revise", "block"]),
          findings: tool.schema.array(tool.schema.string()),
          required_fixes: tool.schema.array(tool.schema.string()),
          evidence: tool.schema.array(tool.schema.string()),
          reviewed_at: tool.schema.string(),
        }).optional(),
        expected_revision: tool.schema.number().optional(),
      },
      execute: async (input, context) => JSON.stringify(await runCaseAction(context.directory, {
        action: input.action,
        caseId: input.case_id,
        ...(input.role ? { role: input.role } : {}),
        ...(input.task_id ? { taskId: input.task_id } : {}),
        ...(input.base_revision === undefined ? {} : { baseRevision: input.base_revision }),
        ...(input.goal ? { goal: input.goal } : {}),
        ...(input.constraints ? { constraints: input.constraints } : {}),
        ...(input.resolves_blocker ? { resolvesBlocker: input.resolves_blocker } : {}),
        ...(input.attempt_id ? { attemptId: input.attempt_id } : {}),
        ...(input.review ? { review: input.review } : {}),
        ...(input.expected_revision === undefined ? {} : { expectedRevision: input.expected_revision }),
      })),
    }),
    mm_agent_hmml: tool({
      description: "Retrieve traceable HMML method candidates with the pinned dense index or an explicit BM25 fallback when the model cache is unavailable.",
      args: {
        case_id: tool.schema.string().optional(),
        query: tool.schema.string(),
        top_k: tool.schema.number(),
        output_path: tool.schema.string(),
        mode: tool.schema.enum(["auto", "bm25"]).optional(),
      },
      execute: async (input, context) => {
        return JSON.stringify(await retrieveHmml({
          projectRoot: context.directory,
          packageRoot,
          ...(input.case_id ? { caseId: input.case_id } : {}),
          query: input.query,
          topK: input.top_k,
          outputPath: input.output_path,
          ...(input.mode ? { mode: input.mode } : {}),
        }))
      },
    }),
    mm_agent_compute: tool({
      description: "Run a Python entry script only inside the current solving Attempt code directory and return hash-addressed Runtime Evidence.",
      args: {
        case_id: tool.schema.string(),
        work_dir: tool.schema.string(),
        entry_script: tool.schema.string(),
        args: tool.schema.array(tool.schema.string()).optional(),
        input_paths: tool.schema.array(tool.schema.string()).optional(),
        output_paths: tool.schema.array(tool.schema.string()).optional(),
        timeout_ms: tool.schema.number().optional(),
      },
      execute: async (input, context) => JSON.stringify(await runCompute({
        projectRoot: context.directory,
        caseId: input.case_id,
        workDir: input.work_dir,
        entryScript: input.entry_script,
        ...(input.args ? { args: input.args } : {}),
        ...(input.input_paths ? { inputPaths: input.input_paths } : {}),
        ...(input.output_paths ? { outputPaths: input.output_paths } : {}),
        ...(input.timeout_ms === undefined ? {} : { timeoutMs: input.timeout_ms }),
      })),
    }),
    mm_agent_compile: tool({
      description: "Compile main.tex only inside the current reporting Attempt, preferring latexmk -xelatex and returning hash-addressed Runtime Evidence.",
      args: {
        case_id: tool.schema.string(),
        work_dir: tool.schema.string(),
        main_tex: tool.schema.string().optional(),
        timeout_ms: tool.schema.number().optional(),
      },
      execute: async (input, context) => JSON.stringify(await runCompile({
        projectRoot: context.directory,
        caseId: input.case_id,
        workDir: input.work_dir,
        ...(input.main_tex ? { mainTex: input.main_tex } : {}),
        ...(input.timeout_ms === undefined ? {} : { timeoutMs: input.timeout_ms }),
      })),
    }),
  },
  "experimental.session.compacting": async (_input, output) => {
    const caseId = await findActiveCase(directory)
    if (caseId) {
      output.context.push(`Active Case: ${caseId}; state: runs/${caseId}/state.json. Inspect local state before continuing.`)
    }
  },
})) satisfies Plugin

export default mmAgentPlugin
