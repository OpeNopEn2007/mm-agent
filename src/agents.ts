export const SPIKE_AGENT_NAME = "mm-agent-spike"

export const spikeAgentConfig = {
  description: "Reads project-local spike fixtures in a fresh child session.",
  mode: "subagent",
  hidden: true,
  permission: {
    read: "allow",
    glob: "allow",
    grep: "allow",
    edit: "deny",
    bash: "deny",
    task: "deny",
    webfetch: "deny",
  },
} as const
