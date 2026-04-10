# Roadmap: MM-Agent in Claude Code

**Project:** MM-Agent in Claude Code (mm-agent-in-cc)
**Created:** 2026-04-10
**Granularity:** Coarse (4 phases)
**Core Value:** 输入非结构化赛题 → 自动化数学建模全流程 → 输出符合要求的论文报告

## Phase Overview

| # | Phase | Goal | Requirements | Status |
|---|-------|------|--------------|--------|
| 1 | Foundation & Problem Pipeline | 建立工作流基础设施和问题输入流程 | FND-01~04, PROB-01~04, AGNT-05~06, VRF-01~03 | ✓ Complete |
| 2 | Modeling Agent System | 实现核心建模智能体和协调机制 | AGNT-01, AGNT-02 | Pending |
| 3 | Simulation & Execution | 数值模拟执行和结果验证 | AGNT-03, SIM-01~04 | Pending |
| 4 | Review & Report Generation | 结果审查和报告生成 | AGNT-04, RPT-01~04 | Pending |

**Total phases:** 4
**Total requirements:** 24
**Coverage:** 100% ✓
**Completed:** 1/4 phases

---

## Phase Details

### Phase 1: Foundation & Problem Pipeline

**Goal:** 建立工作流基础设施和问题输入流程

**Duration estimate:** 1-2 days

**Requirements covered:**
- FND-01, FND-02, FND-03, FND-04 (Foundation)
- PROB-01, PROB-02, PROB-03, PROB-04 (Problem Input)
- AGNT-05, AGNT-06 (Agent Coordination basics)
- VRF-01, VRF-02, VRF-03 (Verification framework)

**Success criteria:**
1. 用户执行 `/mm-agent` skill 可启动工作流
2. 问题文本正确解析为 problem.md 结构化文件
3. .planning/ 目录按 GSD 规范创建
4. 验证门控机制可拦截不合格输出

**Key deliverables:**
- `.claude/skills/mm-agent/SKILL.md` — 主入口 Skill
- `.claude/skills/mm-agent/problem-input.md` — 问题解析 Skill
- `.planning/` 目录结构
- `config.json` 工作流配置
- 验证门控逻辑

**Dependencies:** None (foundation phase)

**Approach notes:**
- 参考 GSD framework 的初始化模式
- 问题解析使用 LLM 结构化输出
- 上下文传递机制：problem.md → plan.md → ...

---

### Phase 2: Modeling Agent System

**Goal:** 实现核心建模智能体和协调机制

**Duration estimate:** 2-3 days

**Requirements covered:**
- AGNT-01 (Planner Agent)
- AGNT-02 (Modeler Agent)

**Success criteria:**
1. Planner Agent 可分析 problem.md 并生成 plan.md
2. Modeler Agent 可根据 plan.md 推导 model.md
3. 智能体输出包含上下文摘要供后续阶段使用

**Key deliverables:**
- `.claude/agents/planner.md` — Planner Agent 定义
- `.claude/agents/modeler.md` — Modeler Agent 定义
- `.claude/skills/mm-agent/modeling-phase.md` — 建模阶段 Skill
- 复杂度约束检查逻辑

**Dependencies:**
- Phase 1 (问题解析输出 problem.md)

**Approach notes:**
- Planner: 问题分析 → 建模策略选择 → 任务分解
- Modeler: 符号建模 → 方程推导 → 变量定义
- 参考 MM Agent 论文的智能体角色定义
- 添加模型复杂度约束（max variables, max equations）

---

### Phase 3: Simulation & Execution

**Goal:** 数值模拟执行和结果验证

**Duration estimate:** 2-3 days

**Requirements covered:**
- AGNT-03 (Programmer Agent)
- SIM-01, SIM-02, SIM-03, SIM-04 (Simulation)

**Success criteria:**
1. Programmer Agent 可将 model.md 转换为可执行 Python 代码
2. Python 运行时正确执行模拟代码
3. 结果以 results.json + plots/ 输出
4. 代码验证在执行前检查语法和逻辑错误

**Key deliverables:**
- `.claude/agents/programmer.md` — Programmer Agent 定义
- `.claude/skills/mm-agent/simulation-phase.md` — 模拟阶段 Skill
- 代码验证逻辑（语法检查、逻辑检查）
- Python 运行时配置
- 结果输出模板 (results.json schema)

**Dependencies:**
- Phase 2 (建模输出 model.md)

**Approach notes:**
- Programmer: 模型 → 算法选择 → 代码生成
- 代码验证：静态分析 + 单元测试框架
- 数值库：NumPy, SciPy, Matplotlib
- 错误处理：捕获异常，生成调试建议

---

### Phase 4: Review & Report Generation

**Goal:** 结果审查和报告生成

**Duration estimate:** 2-3 days

**Requirements covered:**
- AGNT-04 (Reviewer Agent)
- RPT-01, RPT-02, RPT-03, RPT-04 (Report Generation)

**Success criteria:**
1. Reviewer Agent 可验证结果是否符合问题预期
2. 报告包含标准章节（摘要、模型、结果、结论、参考文献）
3. 格式验证智能体检查报告结构
4. 最终输出为 PDF

**Key deliverables:**
- `.claude/agents/reviewer.md` — Reviewer Agent 定义
- `.claude/agents/format-verifier.md` — 格式验证智能体定义
- `.claude/skills/mm-agent/report-phase.md` — 报告阶段 Skill
- 报告模板 (LaTeX/Pandoc)
- 格式验证清单

**Dependencies:**
- Phase 3 (模拟输出 results.json, plots/)

**Approach notes:**
- Reviewer: 结果验证 → 逻辑检查 → 敏感性分析
- 报告模板：数学建模标准结构
- 格式验证：章节完整性、引用格式、图表标注
- 输出转换：Markdown → LaTeX → PDF (Pandoc)

---

## Phase Dependencies

```
Phase 1 (Foundation)
    ↓
Phase 2 (Modeling) ──── depends on problem.md from Phase 1
    ↓
Phase 3 (Simulation) ──── depends on model.md from Phase 2
    ↓
Phase 4 (Report) ──── depends on results.json/plots from Phase 3
```

## Verification Points

| Phase | Verification Gate | What Gets Verified |
|-------|-------------------|--------------------|
| 1 | Problem parsed | problem.md structure, required fields |
| 2 | Model defined | model.md completeness, complexity limits |
| 3 | Simulation ran | results.json valid, plots generated |
| 4 | Report complete | PDF output, format checklist passed |

## Risk Mitigation

| Risk | Mitigation Phase | Strategy |
|------|------------------|----------|
| Context loss | Phase 1 | File-based context passing |
| Infinite loops | Phase 1 | Max iteration limits |
| Simulation failure | Phase 3 | Code verification sub-phase |
| Format drift | Phase 4 | Format verifier agent |
| Model over-complexity | Phase 2 | Complexity constraints |

---

## Execution Mode

**Parallelization:** Enabled (within phases, parallel agent work)
**Verification:** Enabled at each phase transition
**Auto-advance:** Enabled (YOLO mode by default)

---
*Roadmap created: 2026-04-10*
*Granularity: Coarse*
*Ready for Phase 1 planning*