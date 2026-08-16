# MM-Agent 论文深度解读与 v1 Workflow 目标

本文是 `docs/reference/MM-Agent-Paper.pdf` 的中文伴读文档。它不是论文摘要，也不是历史调研报告，而是回答一个工程问题：

> 深挖 MM-Agent 论文后，`mm-agent` 到底要在 Pi CLI 上构建怎样的 workflow？

结论先行：`mm-agent v1.0.0` 不应该先追求 AutoGen 式的并发子智能体系统。论文和官方实现真正有价值的结构，是一个以 artifact 为接口的顺序协调工作流：

```text
赛题输入
  -> Problem Analysis
  -> Task DAG + Memory 初始化
  -> 按 DAG 顺序逐任务执行 Mathematical Modeling + Computational Solving
  -> Solution Reporting
  -> LaTeX 编译/修复
  -> report.pdf
```

在 Pi 上，合理实现不是“让 Pi 本体变成多智能体平台”，而是：

```text
Pi CLI Extension = 命令入口 + 工具注册 + 会话承载
mm-agent Harness = 阶段状态机 + 角色 prompt + artifact 协议 + 本地工具 + PDF 完成门
```

## 1. 论文真正解决的问题

传统数学题通常从已形式化的问题开始：变量、方程、目标函数、约束都已经给出，求解器或 LLM 只需要推理答案。数学建模赛题不同，它从现实场景开始：背景、附件数据、多个开放目标、隐含假设和评价标准都混在一起。论文把这个任务定义为 LLM-powered real-world mathematical modeling：智能体必须先把现实问题转化为结构化、可计算、可报告的建模过程。

论文的核心洞察是：数学建模不是“回答问题”，而是完整生产一篇可评价的 solution report。这个过程至少包含：

- 理解现实背景和任务要求。
- 抽象变量、目标、约束和假设。
- 把大问题拆成相互依赖的子任务。
- 为每个子任务选择合适建模方法。
- 写代码或给出有理由的直接洞察。
- 汇总结果，写成正式报告。

这和本项目的核心产品标准一致：最终产品不是聊天记录、计划或中间推理，而是可编译的 LaTeX 和 PDF 论文。

## 2. 论文贡献对本项目的意义

论文主要贡献可以拆成四类，但对本项目的工程价值不同。

| 论文贡献 | 论文内容 | 对 `mm-agent` 的工程含义 |
|----------|----------|--------------------------|
| MM-Bench | 111 个 MCM/ICM 赛题样本，覆盖 10 个领域、8 类任务 | v1 不必先复刻 benchmark，但应把每次 Case 运行保存为可复盘样本 |
| HMML | Hierarchical Mathematical Modeling Library，三层建模方法库 | v1 应复用 `knowledge/hmml/`，让建模阶段有方法检索输入 |
| MM-Agent workflow | Problem Analysis、Mathematical Modeling、Computational Solving、Solution Reporting | v1 的阶段状态机必须按这四阶段组织 |
| 评估标准 | Analysis Evaluation、Modeling Rigorousness、Practicality and Scientificity、Result and Bias Analysis | v1 的反馈记录和后续 critic rubric 应围绕这些维度演进 |

其中最应该优先落地的是 workflow、artifact、Memory、HMML 检索、Actor-Critic 和 PDF gate。MM-Bench 全量评估、自动评分器和跨 Case 参数优化可以后置。

## 3. 论文中的“多智能体”到底是什么

论文使用 multi-agent 叙述，但它的关键不在运行时并发，而在角色化分工。图 3 把流程画成多个 agent：Analyst、Coordinator、Modeling Actor、Modeling Critic、Programmer、Reporter 等。但官方工程实现更接近：

```text
一个 main.py
一个 LLM wrapper
多个 role class / prompt module
一个 coordinator memory
一个按 DAG 顺序执行的 for loop
```

已有工程分析也指出，官方实现中 Stage 2 和 Stage 3 是按 DAG 顺序逐任务交织执行：每个任务先建模，再求解，然后把结果写入 coordinator memory，后续任务读取依赖任务的 memory。官方 `Coordinator` 管理 `memory`、`code_memory` 和 DAG，它不是并发 worker scheduler。

因此，对 `mm-agent` 来说，“多智能体协作”应该被解释为：

```text
角色隔离
+ prompt contract
+ artifact handoff
+ DAG dependency
+ bounded critic loop
```

而不是：

```text
多个长期存活的 agent 进程互相聊天
```

这点决定了 Pi v1 的架构选择：Pi core 不提供 first-class subagents 并不阻止实现论文核心机制。真正必须实现的是 role workflow 和文件化 Memory。

## 4. v1 要构建的总体 Workflow

`mm-agent v1.0.0` 应构建一个 artifact-first workflow。推荐的最小闭环如下：

```text
/mm-agent <problem-file>
  1. 创建 runs/<case-id>/
  2. 写入 manifest.json 和 input/ 赛题副本
  3. Problem Analysis
     - problem-understanding.md
     - tasks.json
     - task-graph.json
  4. 对每个 task 按 DAG 顺序执行
     - HMML retrieval
     - Modeling Actor
     - Modeling Critic
     - Modeling Improve
     - Code Generation 或 Direct Insight
     - Code Execution / Debug Loop
     - task memory update
  5. Solution Reporting
     - outline.md
     - notation.md
     - main.tex
  6. LaTeX compile / repair loop
     - compile.log
     - report.pdf
  7. feedback/feedback.md
```

这个 workflow 的工程重点不是“模型一次性生成完整论文”，而是每一步都留下可检查 artifact。任何后续阶段需要的信息，都必须从文件读，而不能依赖隐藏聊天上下文。

## 5. Case 目录是系统边界

论文里的 memory 是抽象的 `H={(D_i,Q_i)}`。对本项目来说，它必须落到 `runs/<case-id>/`。建议 v1 的 Case 结构沿用并强化现有 artifact 协议：

```text
runs/<case-id>/
├── input/
│   └── <problem-file>
├── manifest.json
├── artifacts/
│   ├── problem-understanding.md
│   ├── tasks.json
│   ├── task-graph.json
│   ├── memory.json
│   └── run-summary.md
├── tasks/
│   └── <task-id>/
│       ├── retrieved-methods.json
│       ├── task-analysis.md
│       ├── modeling-formulas.md
│       ├── critic-feedback.md
│       ├── modeling-scheme.md
│       ├── code/
│       ├── execution-result.json
│       └── task-memory.json
├── report/
│   ├── outline.md
│   ├── notation.md
│   ├── main.tex
│   ├── compile.log
│   └── report.pdf
└── feedback/
    └── feedback.md
```

`manifest.json` 是 coordinator 的运行账本，应记录：

- case id、输入文件、创建时间。
- 当前阶段和阶段状态。
- task DAG 和拓扑顺序。
- 每个 task 的 artifact 路径。
- Actor-Critic 轮次、critic 结果和是否接受。
- 代码执行状态、stdout/stderr 摘要和输出文件。
- LaTeX 编译状态和 PDF 路径。

这相当于把论文中的 Coordinator Memory 变成可恢复、可审计的本地状态。

## 6. Stage 1：Problem Analysis 要产出什么

论文的 Problem Analysis 包含三步：Problem Understanding、Problem Decomposition、Task Dependency Analysis。v1 应把这三步做成明确 artifact。

### 6.1 Problem Understanding

输入：赛题文本、数据描述、附件摘要。

输出：`artifacts/problem-understanding.md`。

它应回答：

- 赛题背景是什么。
- 真实目标是什么。
- 显式要求有哪些。
- 隐含假设和潜在陷阱有哪些。
- 数据、变量和附件如何影响建模。
- 哪些问题可能需要计算，哪些可能是政策/解释型任务。

论文在这一步强调 self-reflection。本项目 v1 可以实现为一个有界 Actor-Critic 小循环：初稿、critic、改进稿。即使只跑 1 轮，也必须保存 critic feedback，不能只保存最终稿。

### 6.2 Problem Decomposition

输入：赛题、problem understanding、初步 modeling solution。

输出：`artifacts/tasks.json`。

每个 task 至少包含：

```json
{
  "task_id": "1",
  "title": "...",
  "description": "...",
  "objective": "...",
  "expected_inputs": ["..."],
  "expected_outputs": ["..."],
  "requires_code": true
}
```

拆解的目标不是把问题切碎，而是让后续每个 task 可以独立建模、求解、写入 memory，并能支撑最终报告。

### 6.3 Task Dependency Analysis

输入：tasks.json。

输出：`artifacts/task-graph.json`。

这一步必须构造 DAG，而不是自然语言依赖描述。DAG 用来决定执行顺序，并告诉后续 task 应读取哪些前置 task memory。

最小格式：

```json
{
  "tasks": {
    "1": { "dependencies": [] },
    "2": { "dependencies": ["1"] },
    "3": { "dependencies": ["1"] },
    "4": { "dependencies": ["2", "3"] }
  }
}
```

如果 LLM 生成的 DAG 非法，Harness 应使用确定性校验和修复策略：解析失败、环检测失败、缺失 task 都不能静默通过。

## 7. Stage 2：Mathematical Modeling 要产出什么

论文认为建模是最难阶段，因此引入 HMML 和 Hierarchical Actor-Critic Modeling Optimization。v1 应保留这个核心形状。

### 7.1 HMML Retrieval

输入：当前 task description、problem understanding、依赖 task memory。

输出：`tasks/<task-id>/retrieved-methods.json`。

每条检索结果应包含：

```json
{
  "method": "Linear Programming",
  "domain": "Operations Research",
  "subdomain": "Programming Theory",
  "core_idea": "...",
  "application": "...",
  "score": 0.82,
  "why_relevant": "..."
}
```

重点不是算法必须完全复刻论文，而是建模阶段必须有结构化方法候选，而不是让 LLM 凭空选择。

### 7.2 Modeling Actor

输入：task、依赖 memory、retrieved methods。

输出：`modeling-formulas.md` 和初版 `modeling-scheme.md`。

Actor 应生成：

- 变量定义。
- 假设。
- 目标函数或评价指标。
- 约束或机制关系。
- 关键公式。
- 方法选择理由。
- 计算可行性说明。

### 7.3 Modeling Critic

输入：Actor 输出。

输出：`critic-feedback.md`。

Critic 不应该泛泛说“不错”。它要按论文关注点批判：

- 模型是否贴合现实背景。
- 假设是否清晰且合理。
- 公式是否严谨、维度是否一致。
- 是否忽略重要变量或约束。
- 是否只套模板而缺少问题特异性。
- 是否能进入计算求解阶段。

### 7.4 Modeling Improve

输入：Actor 输出 + Critic feedback。

输出：最终 `modeling-scheme.md`。

v1 可以把循环设为小预算，例如 1-2 轮。关键是每轮可追踪：

```text
actor-v1 -> critic-v1 -> actor-v2 -> accepted
```

这比并发多 agent 更重要。论文的性能增益来自有结构的 critique/refine，而不是来自 agent 数量本身。

## 8. Stage 3：Computational Solving 要产出什么

论文的 Computational Solving 不是“解释一下结果”，而是让 agent 生成代码、运行代码、根据错误修复代码，并把结果写入 memory。

v1 应支持两类任务：

### 8.1 Code Path

适用于数据分析、优化、仿真、预测等任务。

输出：

```text
tasks/<task-id>/code/
tasks/<task-id>/execution-result.json
tasks/<task-id>/task-memory.json
```

`execution-result.json` 至少包含：

```json
{
  "status": "success",
  "command": "python main.py",
  "stdout_summary": "...",
  "stderr_summary": "...",
  "outputs": ["result.csv", "figure.png"],
  "interpretation": "..."
}
```

如果失败，应记录失败和修复轮次，而不是覆盖掉错误：

```json
{
  "status": "failed_after_repair_budget",
  "attempts": [
    { "attempt": 1, "error": "FileNotFoundError", "repair": "..." }
  ]
}
```

### 8.2 Direct Insight Path

论文也承认政策型或定性任务可能不生成代码。v1 应允许 no-code task，但必须写清楚原因：

```json
{
  "requires_code": false,
  "reason": "policy-oriented modeling task without numeric dataset",
  "insight_artifact": "task-result.md"
}
```

不能因为代码难写就逃到 no-code path。是否需要代码应在 task decomposition 或 modeling scheme 中被记录。

### 8.3 Task Memory

每个 task 完成后，必须写 `task-memory.json`，并汇总进入 `artifacts/memory.json`。

它是论文中 `Q_i={M_i,C_i,O_i}` 的工程版本：

```json
{
  "task_id": "1",
  "task_description": "...",
  "mathematical_modeling_process": "...",
  "code_structure": { "...": "..." },
  "execution_result": { "...": "..." },
  "solution_interpretation": "...",
  "output_files": ["..."]
}
```

后续 task 和报告阶段只能通过这些 artifact 读取前序上下文。

## 9. Stage 4：Solution Reporting 要产出什么

官方代码中 Solution Reporting 是 optional，但本项目不能照搬这一点。对 `mm-agent` 来说，报告是产品，PDF 是完成门。

v1 的 Reporting 阶段至少产出：

```text
report/outline.md
report/notation.md
report/main.tex
report/compile.log
report/report.pdf
```

报告结构应参考论文：

```text
Abstract
Problem Restatement
Model Assumptions
Explanation of Assumptions
Notation and Definitions
Problem Analysis
Solution to the Problem
Model Conclusion
References
Appendix
```

但 v1 不必一开始追求获奖论文质量。最低要求是：

- 所有 task 的 modeling 和 solving 结果进入报告。
- 关键假设、符号、公式和结果解释都可读。
- LaTeX 能编译。
- 编译日志保留。
- PDF 存在。

如果 LaTeX 编译失败，Harness 应进入 repair loop：读取错误摘要、修复 `main.tex`、重新编译。失败预算耗尽时，Case 状态应是 failed，而不是 completed。

## 10. Pi 上的实现形态

Pi v1 应承担薄壳职责：

| Pi 能力 | 在本项目中的用途 |
|---------|------------------|
| command | 提供 `/mm-agent`、`/mm-status`、`/mm-feedback` |
| tool | 提供 create case、read/write artifact、run solver、compile LaTeX 等确定性动作 |
| skill/prompt | 提供阶段说明和角色 prompt |
| hook | 做路径保护和上下文注入 |
| session | 承载交互，但不作为唯一项目 memory |

v1 最小命令面：

```text
/mm-agent <problem-file>     创建并运行 Case
/mm-status [case-id]         查看 Case 当前阶段、artifact 和失败原因
/mm-feedback <case-id>       记录人类反馈
```

v1 最小工具面：

```text
mm_create_case
mm_write_artifact
mm_read_artifact
mm_update_manifest
mm_retrieve_hmml
mm_run_solver
mm_compile_latex
mm_record_feedback
```

这些工具必须默认只写 `runs/<case-id>/`，不能让 agent 任意写项目文件、`.git/`、`.archived/` 或本机敏感路径。

## 11. 什么是 v1 必须做的，什么不是

### 11.1 v1 必须做

- 接收一个赛题文件。
- 创建 `runs/<case-id>/`。
- 明确四阶段状态机。
- Problem Analysis 产出 problem understanding、tasks、DAG。
- 按 DAG 顺序逐 task 建模与求解。
- HMML 检索结果进入建模上下文。
- Actor-Critic 至少在建模关键点留下 feedback artifact。
- 代码执行要真的运行，并保存结果或失败。
- task memory 被后续 task 和报告阶段读取。
- Reporting 生成 LaTeX。
- 编译 PDF。
- 记录 feedback。

### 11.2 v1 可以简化

- Actor-Critic 轮次可以少。
- HMML 检索算法可以先用现有本地脚本和预计算资产。
- no-code task 可以存在，但必须有理由。
- 图表生成可以先作为代码输出的一部分，不必做复杂 chart agent。
- 评估可以先记录人工反馈，不必实现自动 judge。

### 11.3 v1 不应该做

- 不做 Web UI。
- 不做自定义 Pi SDK runtime。
- 不做真正并发子智能体系统。
- 不依赖 `pi-subagents` 才能跑通核心闭环。
- 不做完整 MM-Bench 规模 benchmark。
- 不把 Pi session 当作唯一 memory。
- 不把报告生成作为 optional。

## 12. 从论文到本项目的目标清单

论文深挖后，本项目应把目标写成可执行目标，而不是抽象愿景。

### Goal A：Case Runner

用户给一个赛题文件，系统创建 Case，并把输入、manifest、阶段目录准备好。

完成定义：`runs/<case-id>/manifest.json` 存在，输入文件被复制或引用，状态为 `created` 或 `running`。

### Goal B：Problem Analysis Pipeline

系统能从赛题生成问题理解、任务拆解和任务依赖图。

完成定义：`problem-understanding.md`、`tasks.json`、`task-graph.json` 都存在且能被后续阶段读取。

### Goal C：Task-level Modeling Loop

系统能对每个 task 检索 HMML 方法，生成建模方案，并留下 critic feedback。

完成定义：每个 task 目录下存在 `retrieved-methods.json`、`modeling-scheme.md`、`critic-feedback.md`。

### Goal D：Computational Solving Loop

系统能按 task 的需要生成/执行代码，或记录 no-code direct insight，并写入 task memory。

完成定义：每个 task 有 `execution-result.json` 或明确 no-code result，且 `task-memory.json` 可汇入全局 memory。

### Goal E：Report Generator

系统能把所有 task memory 汇总成报告结构和 LaTeX。

完成定义：`report/outline.md`、`report/notation.md`、`report/main.tex` 存在。

### Goal F：PDF Completion Gate

系统能编译 LaTeX，失败则修复，最终产出 PDF 或明确失败。

完成定义：成功 Case 必须有 `report/report.pdf` 和 `report/compile.log`。没有 PDF 就不能标记 completed。

### Goal G：Feedback Loop Seed

系统能记录用户对 Case 的反馈，为后续监督迭代提供材料。

完成定义：`feedback/feedback.md` 存在，并能关联到本次 Case 的 manifest 和 report。

## 13. 关键设计取舍

### 13.1 为什么先单 coordinator

论文和官方实现证明，顺序 coordinator 足够表达核心工作流。Pi core 没有 first-class subagents，强行先做并发会让项目陷入 runtime 工程，而不是数学建模闭环。v1 应优先跑通：DAG、Memory、Actor-Critic、代码执行、报告编译。

### 13.2 为什么 artifact 高于 session

Pi session 可以帮助交互恢复，但它不是项目真相。数学建模 workflow 的每个阶段都要被检查、修复和复用，所以 artifact 必须是接口。隐藏在聊天上下文里的结论不能作为后续阶段依赖。

### 13.3 为什么 PDF 是 gate

论文官方实现把 reporting 标为 optional，是工程实现的取舍；本项目不能继承这个取舍。`mm-agent` 的产品目标是把赛题转化成真实报告。LaTeX 不编译、PDF 不存在，就没有完成数学建模 Case。

### 13.4 为什么不先做自动评估

论文的四维评分很重要，但 v1 的更小闭环是“产出可检查报告”。自动 judge、MM-Bench 批量评估和参数优化应建立在可重复 Case artifact 之上。没有稳定 artifact，就没有可靠评估。

## 14. 推荐的 v1 实施顺序

从论文反推，本项目最稳的实施顺序是：

1. 定义 `manifest.json` 和 Case 状态机。
2. 实现 `/mm-agent <problem-file>` 创建 Case。
3. 实现 artifact read/write 工具和路径保护。
4. 实现 Problem Analysis 三件套：understanding、tasks、DAG。
5. 接入 HMML retrieval。
6. 实现单 task 的 Modeling Actor-Critic。
7. 实现单 task 的 solving/code execution/debug。
8. 实现 task memory 汇总。
9. 实现 report outline 和 LaTeX 生成。
10. 实现 LaTeX compile/repair loop。
11. 跑通一个最小 Case 到 PDF。
12. 再考虑质量评估、反馈参数和并发扩展。

这个顺序故意避免先做“宏大多智能体平台”。每一步都对应论文机制，也都能被本地文件验证。

## 15. 本文和其他文档的分工

- `docs/reference/MM-Agent-Paper.pdf`：论文原文。
- `docs/reference/mm-agent-paper-deep-dive.md`：本文，负责解释论文如何转化为本项目 v1 workflow 目标。
- `docs/architecture/paper-alignment.md`：长期保持简短，只记录机制层面对齐摘要。
- `docs/architecture/pi-extension-harness.md`：记录 Pi Extension Harness 的工程设计。
- `docs/research/llm-mm-agent-engineering-analysis.md`：记录官方实现代码层分析。
- `docs/context/artifact-protocol.md`：定义 Case artifact 契约。

如果后续实现发现本文的目标需要固化为长期协议，应把对应内容移动到 `docs/context/` 或 `docs/architecture/`，而不是在多个文档里复制。

## 16. 最终判断

MM-Agent 论文给本项目的最大启发，不是“要有很多 agent”，而是“要把数学建模拆成可检查、可恢复、可改进的 artifact workflow”。

因此 `mm-agent v1.0.0` 的目标应该明确为：

> 在 Pi CLI 中实现一个单 coordinator 的 MM-Agent Harness。它用角色 prompt 模拟论文中的 agent 分工，用 DAG 和 Memory 管理 task 依赖，用 HMML 支撑建模方法选择，用 Actor-Critic 留下质量改进轨迹，用本地工具执行代码和编译 LaTeX，并以 `report.pdf` 作为 Case 完成门。

这就是当前最可实现、也最忠于论文核心价值的方案。
