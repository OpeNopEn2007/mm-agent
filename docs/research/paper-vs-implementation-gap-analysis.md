# 论文 vs 实现差距分析

> 基于 PLAN.md 任务执行后的准确差距状态
> 更新日期: 2026-05-20
> 版本: v0.2.0-post-execution

---

## 1. 论文核心设计

### 1.1 四阶段流水线

```
Phase 1: Problem Analysis
  - Problem Understanding (Actor-Critic ×3轮)
  - Problem Decomposition
  - Task Dependency Analysis → DAG

Phase 2: Mathematical Modeling
  - HMML Retrieval (Top-6 methods)
  - Problem Modeling (Actor-Critic ×3轮)
  - Per-task: Task Analysis → Task Formulas (Actor-Critic ×3轮)

Phase 3: Computational Solving
  - Code Generation
  - Code Execution + Debugging (max_execute=5, max_repair=3)

Phase 4: Solution Reporting
  - Paper Chapter Creation
  - LaTeX Compilation
```

### 1.2 四层 Actor-Critic 设计

| 层次 | Actor Prompt | Critic Prompt | Improvement Prompt | 论文 Figure |
|------|-------------|---------------|-------------------|-------------|
| **Problem Understanding** | PROBLEM_ANALYSIS | PROBLEM_ANALYSIS_CRITIQUE | PROBLEM_ANALYSIS_IMPROVEMENT | Fig 16-18 |
| **Problem Modeling** | PROBLEM_MODELING | PROBLEM_MODELING_CRITIQUE | PROBLEM_MODELING_IMPROVEMENT | Fig 19-21 |
| **Task Formulas** | TASK_FORMULAS | TASK_FORMULAS_CRITIQUE | TASK_FORMULAS_IMPROVEMENT | Fig 22-24 |
| **Task Modeling** | TASK_MODELING | TASK_MODELING_CRITIQUE | TASK_MODELING_IMPROVEMENT | Fig 25-26 |

**关键观察：论文有 4 层 Actor-Critic，每层最多 3 轮迭代**

---

## 2. 当前实现状态

### 2.1 Prompts 完成度

| Prompt 类别 | 数量 | 状态 |
|------------|------|------|
| Problem 层 | 3 | ✅ 完整 |
| Problem Modeling 层 | 3 | ✅ 完整 |
| Task Decompose | 2 | ✅ 完整 |
| Task Analysis | 1 | ✅ 完整 |
| Task Formulas 层 | 3 | ✅ 完整 |
| Task Modeling 层 | 3 | ✅ 完整 |
| Task Coding | 2 | ✅ 完整 |
| Task Result | 3 | ✅ 完整 |
| Task Dependency | 2 | ✅ 完整 |
| Paper 相关 | 4 | ✅ 完整 |
| **总计** | **28** | ✅ **100% 完整** |

### 2.2 Skills 完成度

| Skill | 论文对应 | 状态 |
|-------|---------|------|
| parse-problem.md | Problem Extraction | ✅ 存在 |
| problem-understanding.md | Problem Understanding Actor-Critic | ✅ 新增 |
| task-decomposition.md | Task Decompose | ✅ 存在 |
| coordinator.md | DAG + Memory | ✅ 存在 |
| hmml-retrieval.md | HMML Retrieval | ✅ 存在 |
| modeling.md | Task Modeling Actor-Critic | ✅ 重构 |
| code-execution.md | Code Gen + Debug | ✅ 存在 |
| report-generation.md | Paper Generation | ✅ 存在 |

### 2.3 Agents 完成度

| Agent | 角色 | 状态 |
|-------|------|------|
| mm-agent-coordinator.md | DAG Orchestration | ✅ memory: project |
| mm-agent-analyst.md | Problem Understanding Actor | ✅ 新增 |
| mm-agent-critic.md | Independent Critic (opus) | ✅ 新增 |
| mm-agent-modeler.md | Modeling Actor | ✅ memory: project |
| mm-agent-programmer.md | Code Execution | ✅ memory: project |
| mm-agent-reporter.md | Report Generation | ✅ memory: project |

### 2.4 MCP Server 完成度

| MCP Tool | 论文功能 | 状态 |
|----------|---------|------|
| hmml_retrieve | HMML Retrieval Top-K | ✅ 实现 |
| hmml_insert | HMML Method Insert | ✅ 实现 |
| hmml_recompute_embeddings | Embedding Update | ✅ 实现 |

---

## 3. 关键差距分析

### 3.1 Actor-Critic 层次差距

| 论文设计 | 当前实现 | 差距 |
|---------|---------|------|
| Problem Understanding Actor-Critic | problem-understanding.md + mm-agent-analyst/critic | ✅ 已实现 |
| Problem Modeling Actor-Critic | **❌ 缺失独立 skill** | ⚠️ 需补充 |
| Task Formulas Actor-Critic | TASK_FORMULAS_* prompts 存在，但无独立 skill | ⚠️ 需补充 |
| Task Modeling Actor-Critic | modeling.md + mm-agent-modeler/critic | ✅ 已实现 |

**核心差距：论文有 4 层 Actor-Critic，当前只有 2 层有独立 Skill**

### 3.2 Problem Modeling 层缺失

论文 Phase 2 有 Problem Modeling Actor-Critic：
- PROBLEM_MODELING_PROMPT — 整体建模方案 Actor
- PROBLEM_MODELING_CRITIQUE_PROMPT — 建模方案 Critic
- PROBLEM_MODELING_IMPROVEMENT_PROMPT — 建模方案改进

当前实现：
- 只有 task-level modeling.md（per-task 建模）
- 缺少 problem-level modeling skill

### 3.3 Task Formulas 层缺失

论文每个 Task 有 Formulas Actor-Critic：
- TASK_FORMULAS_PROMPT — 公式推导 Actor
- TASK_FORMULAS_CRITIQUE_PROMPT — 公式正确性 Critic
- TASK_FORMULAS_IMPROVEMENT_PROMPT — 公式改进

当前实现：
- prompts 存在（lines 310-412）
- 但 modeling.md 直接生成 formulas，没有独立 Formulas Actor-Critic 流程

---

## 4. 优先级建议

### P1 - 补充 Problem Modeling Skill

创建 `skills/mm-agent/problem-modeling.md`：
- 调用 PROBLEM_MODELING_* prompts
- 整体建模方案 Actor-Critic（在 task decomposition 之后）
- 输出整体建模策略到 `.planning/memory/problem-model.md`

### P2 - 补充 Task Formulas Skill

创建 `skills/mm-agent/formulas-generation.md`：
- 调用 TASK_FORMULAS_* prompts
- 公式层独立 Actor-Critic（在 task modeling 之后）
- 输出公式到 `.planning/memory/formulas-{task_id}.json`

### P3 - 整合四层流程

更新 SKILL.md 流程顺序：
```
Phase 1: Problem Understanding Actor-Critic ✅
Phase 2: Problem Modeling Actor-Critic ❌ (需补充)
Phase 3: Task Decomposition ✅
Phase 4: Per-Task:
  - HMML Retrieval ✅
  - Task Modeling Actor-Critic ✅
  - Task Formulas Actor-Critic ❌ (需补充)
  - Code Execution ✅
Phase 5: Report Generation ✅
```

---

## 5. 总结

| 维度 | 完成度 | 说明 |
|------|--------|------|
| Prompts | 100% (28/28) | 论文全部 Prompt 已定义 |
| Skills | 75% (6/8) | 缺 Problem Modeling、Formulas Generation |
| Agents | 100% (6/6) | 独立 Agent Team 已实现 |
| MCP Tools | 100% (3/3) | HMML MCP 已实现 |
| Actor-Critic 层次 | 50% (2/4) | 缺 Problem Modeling、Task Formulas 层 |

**核心价值流水线可运行，但 Actor-Critic 层次不完整。**

---

## 6. 下一步行动

1. 创建 `problem-modeling.md` Skill（P1）
2. 创建 `formulas-generation.md` Skill（P2）
3. 更新 SKILL.md 流程顺序（P3）
4. 验证四层 Actor-Critic 端到端执行

---

*分析创建: 2026-05-20*
*基于 PLAN.md 任务执行后的真实状态*