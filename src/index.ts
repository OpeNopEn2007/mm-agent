import { tool, type Plugin } from "@opencode-ai/plugin"
import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { SPIKE_AGENT_NAME, spikeAgentConfig } from "./agents.js"

function executionPathApi(directory: string): path.PlatformPath {
  const isWindowsDriveOrUnc = /^(?:[A-Za-z]:[\\/]|(?:\\\\|\/\/)[^\\/]+[\\/][^\\/]+(?:[\\/]|$))/u.test(directory)
  return isWindowsDriveOrUnc ? path.win32 : path.posix
}

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
    mm_agent_spike_context: tool({
      description: "Return read-only path context supplied by the active OpenCode Tool execution.",
      args: {
        path: tool.schema.string().min(1),
      },
      execute: async (input, context) => {
        if (path.win32.parse(input.path).root || path.posix.parse(input.path).root) {
          throw new Error("path must be a relative path")
        }
        const pathApi = executionPathApi(context.directory)
        return JSON.stringify({
          directory: context.directory,
          worktree: context.worktree,
          resolved_path: pathApi.resolve(context.directory, input.path),
        })
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
