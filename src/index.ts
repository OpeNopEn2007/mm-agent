import { tool, type Plugin } from "@opencode-ai/plugin"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createAgentConfigs } from "./agents.js"
import { runPreflight } from "./tools/check.js"
import { runCompile } from "./tools/compile.js"
import { runCompute } from "./tools/compute.js"
import { retrieveHmml } from "./tools/hmml.js"
import { prepareCase } from "./tools/prepare.js"
import { FormalRuntimeCoordinator, type FlowInput } from "./runtime/formal-runtime-coordinator.js"

const packageRoot = fileURLToPath(new URL("..", import.meta.url))

// OpenCode 每次 plugin 初始化都调用一次这个 async 工厂，并在项目生命周期内复用返回的 hooks。
// `flow` 是进程内协调器，同时持有按会话隔离的待执行指令表，供下面的 `tool.execute.before` 读取。
const mmAgentPlugin = (async ({ directory, worktree }) => {
  const flow = new FormalRuntimeCoordinator({ runsRoot: path.join(directory, "runs") })
  return {
  config: async (config) => {
    // 只在用户未定义同名 Agent 时注入五个 hidden subagent；用户提供的 Agent 配置优先。
    config.agent ??= {}
    for (const [name, agent] of Object.entries(createAgentConfigs(directory, worktree)))
      if (!(name in config.agent)) config.agent[name] = agent
  },
  // 模型可见的正式 Tools。`mm_agent_case` 故意不在此注册：它是 Flow、Golden runner 和测试
  // 通过 CaseContextStore 直接使用的内部 Core seam，模型永远不可见。
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
    mm_agent_flow: tool({
      description: "Advance the formal mm-agent runtime or submit the Critic's semantic Review.",
      args: {
        action: tool.schema.enum(["advance", "submit_review"]),
        case_id: tool.schema.string(),
        verdict: tool.schema.enum(["pass", "revise", "block"]).optional(),
        findings: tool.schema.array(tool.schema.string()).optional(),
        required_fixes: tool.schema.array(tool.schema.string()).optional(),
        evidence: tool.schema.array(tool.schema.string()).optional(),
      },
      execute: async (input, context) => {
        if (input.action === "submit_review" && (!input.verdict || !input.findings || !input.required_fixes || !input.evidence))
          return JSON.stringify({ status: "failed", kind: "failed", message: "submit_review requires verdict, findings, required_fixes, and evidence" })
        const flowInput = (input.action === "advance"
          ? { action: "advance", caseId: input.case_id }
          : {
              action: "submit_review",
              caseId: input.case_id,
              verdict: input.verdict!,
              findings: input.findings!,
              requiredFixes: input.required_fixes!,
              evidence: input.evidence!,
            }) satisfies FlowInput
        const result = await flow.execute(flowInput)
        // 把 directive 暂存在当前会话，供下一次 `task` 调用使用。Skill 每 directive 机械发出
        // 一次 `task`，下面的 `tool.execute.before` hook 读取这条暂存并覆盖调用的 args，
        // 因此由 runtime 而非主模型决定 Agent、description 和 prompt。
        flow.rememberDirective(context.sessionID, result)
        return JSON.stringify(result)
      },
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
  // OpenCode 最关键的 seam。Skill 每个 directive 机械发出一次 built-in `task`，OpenCode 本会
  // 按模型填的参数路由；这个 hook 在真正执行前用该会话暂存的 directive 原地覆盖调用的 args，
  // 从而由 runtime 决定谁跑、跑什么。先全量删除 args，防止模型设置了 `task_id`、`background`、
  // `command` 或错误的 `subagent_type`。Plugin API 没有受支持的接口从 hook 直接派遣子会话；
  // 重写这一次 `task` 调用是让 child 保持 fresh、前景运行的受支持方式。
  "tool.execute.before": async ({ tool: toolName, sessionID }, output) => {
    if (toolName !== "task") return
    const directive = flow.pendingDirective(sessionID)
    if (!directive) return
    const args = output.args ?? (output.args = {})
    delete args.task_id
    delete args.command
    delete args.background
    for (const key of Object.keys(args)) delete args[key]
    args.subagent_type = directive.agent
    args.description = directive.description
    args.prompt = directive.prompt
  },
  "tool.execute.after": async ({ tool: toolName, sessionID }) => {
    // 一次性消费信号：一条 directive 只驱动一次 `task` 调用，随后清除。
    if (toolName === "task") flow.clearDirective(sessionID)
  },
  }
}) satisfies Plugin

export default mmAgentPlugin
