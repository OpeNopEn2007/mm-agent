# 论文对齐

本文记录论文方法对 Canonical Core 的要求，不定义 Adapter 或 Local Runtime 的具体技术选择。`mm-agent` 只实现完成本地 Case 到 PDF 闭环所需的最小论文机制。

## 四阶段

| 论文阶段 | Canonical Role | Stable Artifact |
|----------|----------------|-----------------|
| Problem Analysis | Analyst | 问题理解、任务分解、任务 DAG。 |
| Mathematical Modeling | Modeler | HMML 候选、整体建模方案、任务级公式和方法。 |
| Computational Solving | Solver | 代码、执行结果、图表和 task memory。 |
| Solution Reporting | Writer | 大纲、符号表、LaTeX、编译日志和 PDF。 |

每个 Actor candidate 由 fresh Critic 审查。Gate 只在 schema 和 semantic review 都通过后提升 artifact。

## Task DAG

论文将任务分解和依赖关系作为 Coordinator 职责。Core 由 Analyst/Modeler 显式输出 `tasks.json` 和 `task-graph.json`，确定性 DAG 验证只检查 ID、引用和无环性。

同一 DAG wave 的 Solver 可以并行。下一 wave 只能读取已被 gate 接受的直接依赖 memory。v1 不从任务文案关键词推测依赖，也不在 DAG 无效时静默构造线性回退。

## Memory

论文将任务 memory 描述为 `H={(D_i,Q_i)}`。v1 将其映射为：

```text
tasks/<task-id>/memory.json
```

它记录任务描述、建模方法、结果解释、代码和图表路径。完整日志和代码留在相邻 artifact；依赖任务只在需要时读取它们。`context.json` 指明本次 Role Session 需要哪些 Task Memory，避免把所有历史任务塞入上下文。

## HMML

论文要求使用层次化数学方法库进行候选方法检索。Core 要求检索结果记录知识源标识、知识源版本或 hash、查询、检索模式、候选方法和分数。具体 embedding 模型、词法算法、索引格式和 cache 属于 Local Runtime。

检索结果只提供候选方法，不能替代 Modeler 对假设、数据条件和公式的判断。

## Actor-Critic

论文在问题理解、建模和公式层使用 Actor-Critic。v1 对每个需要语义验收的阶段保留：

```text
candidate -> fresh critic -> review.json -> gate -> accepted artifact
```

Analysis、Modeling、每个 Solving Task 和 Reporting 分别允许初稿加最多两次修订。复杂的自动自诊断、prompt 自调和跨 Case 参数优化留在第一个闭环之后。

## 计算求解

论文要求模型产生可执行求解。Core 要求 Local Runtime 记录命令、环境、stdout、stderr、exit code、timeout 和输出 hash，不规定执行语言。Solver 将结果解释写入 `execution-result.json` 和 Task Memory。

## 报告要求

官方代码将报告生成标为 optional；v1 不接受这个边界。Solution Reporting 是必经阶段。只有 `main.tex`、`compile.log` 和非空 `report.pdf` 同时存在，并通过最终 gate，Case 才完成。
