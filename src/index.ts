import { tool, type Plugin } from "@opencode-ai/plugin"
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { SPIKE_AGENT_NAME, spikeAgentConfig } from "./agents.js"
import { runPreflight } from "./tools/check.js"
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

const mmAgentPlugin = (async ({ directory }) => ({
  config: async (config) => {
    config.agent ??= {}
    if (!(SPIKE_AGENT_NAME in config.agent)) {
      config.agent[SPIKE_AGENT_NAME] = spikeAgentConfig
    }
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
    mm_agent_hmml: tool({
      description: "Retrieve traceable HMML method candidates with the pinned dense index or an explicit BM25 fallback when the model cache is unavailable.",
      args: {
        query: tool.schema.string(),
        top_k: tool.schema.number(),
        output_path: tool.schema.string(),
        mode: tool.schema.enum(["auto", "bm25"]).optional(),
      },
      execute: async (input, context) => {
        return JSON.stringify(await retrieveHmml({
          projectRoot: context.directory,
          packageRoot,
          query: input.query,
          topK: input.top_k,
          outputPath: input.output_path,
          ...(input.mode ? { mode: input.mode } : {}),
        }))
      },
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
