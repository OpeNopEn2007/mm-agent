import {
  CaseProtocolError,
  type ActorRole,
  type Promotion,
  type Scope,
} from "./schema.js";

export type ResolvedRecipe = {
  scope: Scope;
  allowedWrites: string[];
  expectedOutputs: string[];
  promotions: Promotion[];
  acceptance: string[];
};

export function resolveRecipe(
  role: ActorRole,
  sequencePath: string,
  taskId?: string,
  modelingTaskIds: string[] = [],
): ResolvedRecipe {
  const candidate = (name: string) => `${sequencePath}/${name}`;
  if (role === "analyst") {
    return {
      scope: "analysis",
      allowedWrites: [
        candidate("problem-understanding.md"),
        candidate("tasks.json"),
        candidate("task-graph.json"),
      ],
      expectedOutputs: [
        candidate("problem-understanding.md"),
        candidate("tasks.json"),
        candidate("task-graph.json"),
      ],
      promotions: [
        {
          candidate: candidate("problem-understanding.md"),
          target: "artifacts/problem-understanding.md",
          required: true,
        },
        {
          candidate: candidate("tasks.json"),
          target: "artifacts/tasks.json",
          required: true,
        },
        {
          candidate: candidate("task-graph.json"),
          target: "artifacts/task-graph.json",
          required: true,
        },
      ],
      acceptance: [
        "problem understanding, task list, and acyclic task graph are complete",
      ],
    };
  }
  if (role === "modeler") {
    if (
      modelingTaskIds.length === 0 ||
      new Set(modelingTaskIds).size !== modelingTaskIds.length ||
      modelingTaskIds.some((id) => !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(id))
    )
      throw new CaseProtocolError(
        "DAG_INVALID",
        "modeler requires unique accepted Task IDs",
      );
    const retrievals = modelingTaskIds.map((id) => ({
      candidate: candidate(`retrieved-methods/${id}.json`),
      target: `tasks/${id}/retrieved-methods.json`,
      required: true,
    }));
    return {
      scope: "modeling",
      allowedWrites: [
        candidate("modeling-scheme.md"),
        ...retrievals.map((item) => item.candidate),
      ],
      expectedOutputs: [
        candidate("modeling-scheme.md"),
        ...retrievals.map((item) => item.candidate),
      ],
      promotions: [
        {
          candidate: candidate("modeling-scheme.md"),
          target: "artifacts/modeling-scheme.md",
          required: true,
        },
        ...retrievals,
      ],
      acceptance: [
        "method evidence, variables, assumptions, equations, and solve requirements are explicit",
      ],
    };
  }
  if (role === "solver") {
    if (!taskId || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(taskId))
      throw new CaseProtocolError(
        "INVALID_SCOPE",
        "solver requires a valid taskId",
      );
    return {
      scope: `solving/${taskId}`,
      allowedWrites: [
        candidate("code/"),
        candidate("execution-result.json"),
        candidate("figures/"),
        candidate("memory.json"),
      ],
      expectedOutputs: [
        candidate("code/"),
        candidate("execution-result.json"),
        candidate("memory.json"),
      ],
      promotions: [
        {
          candidate: candidate("code/"),
          target: `tasks/${taskId}/code/`,
          required: true,
        },
        {
          candidate: candidate("execution-result.json"),
          target: `tasks/${taskId}/execution-result.json`,
          required: true,
        },
        {
          candidate: candidate("figures/"),
          target: `tasks/${taskId}/figures/`,
          required: false,
        },
        {
          candidate: candidate("memory.json"),
          target: `tasks/${taskId}/memory.json`,
          required: true,
        },
      ],
      acceptance: ["execution is reproducible and task memory is complete"],
    };
  }
  return {
    scope: "reporting",
    allowedWrites: [
      candidate("outline.md"),
      candidate("notation.md"),
      candidate("main.tex"),
      candidate("compile.log"),
      candidate("report.pdf"),
    ],
    expectedOutputs: [
      candidate("outline.md"),
      candidate("notation.md"),
      candidate("main.tex"),
      candidate("compile.log"),
      candidate("report.pdf"),
    ],
    promotions: [
      "outline.md",
      "notation.md",
      "main.tex",
      "compile.log",
      "report.pdf",
    ].map((name) => ({
      candidate: candidate(name),
      target: `report/${name}`,
      required: true,
    })),
    acceptance: [
      "report uses accepted artifacts and compiles to a non-empty PDF",
    ],
  };
}
