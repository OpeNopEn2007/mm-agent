---
phase: 3
name: Task Decomposition with DAG
created: 2026-04-11
---

# Phase 3 Context: Task Decomposition with DAG

**Goal:** Decompose problem into dependent subproblems with execution order and context passing (Memory System).

**Domain:** 将结构化 problem.md 分解为依赖任务 DAG，确定执行顺序，实现 Memory System 上下文传递。

---

## Prior Decisions

**From PROJECT.md:**
- CLI-first，不做 Web UI
- JSON 文件持久化，不用数据库
- 使用 GSD 框架的 phase/plan/execute 模式

**From REQUIREMENTS.md:**
- TASK-01~05: 分解、DAG、拓扑排序、循环检测、输出文件
- MEM-01~03: Memory 加载、写入、上下文传递

**From Phase 1:**
- mm-agent-coordinator Agent 负责 DAG 编排
- 输出文件位置: `.planning/memory/dag.json`, `execution-order.txt`, `task-{id}.json`
- GSD framework 执行 phases

**From IDEA.md (Section 3.5, 7.2):**
- DAG 数据结构已定义：tasks 字典 + execution_order 列表
- Memory Schema 已定义：task_id, phase, status, task_description, mathematical_modeling_process, solution_interpretation, task_code, execution_result, code_structure, charts

---

## Decisions

### Task Granularity

**Decision D-01:** 渐进分解策略

**Why:**
- Phase 3 只处理简单一对一分解（每个 question → 一个 task）
- 复杂场景（如一个 question 需多个建模步骤）由 Phase 5 Actor-Critic 处理
- 分离关注点，Phase 3 聚焦 DAG 结构，Phase 5 聚焦建模细节

**Implementation:**
- Phase 3: 直接将 problem.md 的 questions 映射为 tasks
- Phase 5: Actor-Critic 可根据建模复杂度细分任务

### Cycle Handling

**Decision D-02:** 循环依赖 → 报错退出 → 详细错误 → 用户决定

**Why:**
- 循环依赖是结构性问题，自动拆解可能违背用户建模意图
- 数学建模的任务依赖关系有语义意义，不是纯技术 DAG
- 用户在场讨论比自动化更安全

**Implementation:**
```
检测到循环依赖：
┌─────────────────────────────────────────────────┐
│ 拓扑排序检测到循环                                │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│ 输出详细错误报告                                  │
│ - 循环链：A → B → C → A                          │
│ - 每个任务的依赖关系                              │
│ - 可能的修复建议                                  │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│ 用户选择：                                        │
│ 1. 手动调整依赖关系                               │
│ 2. 重新分解任务                                   │
│ 3. 删除某个任务打破循环                           │
│ 4. 其他方案                                      │
└─────────────────────────────────────────────────┘
```

**Error message format:**
```
❌ 循环依赖检测失败

循环链: Task A → Task B → Task C → Task A

任务依赖详情:
- Task A: depends on [C]
- Task B: depends on [A]
- Task C: depends on [B]

修复建议:
1. 检查任务描述是否有逻辑矛盾
2. 考虑拆解某个任务打破循环
3. 手动调整 DAG 结构

选项:
- 重新分解任务
- 手动编辑 dag.json
- 退出并检查问题描述
```

### DAG Format

**Decision D-03:** 使用 IDEA.md 定义的基础 schema（已锁定）

**Schema (from IDEA.md Section 3.5):**
```json
{
  "tasks": {
    "1": { "description": "...", "dependencies": [], "status": "pending" },
    "2": { "description": "...", "dependencies": ["1"], "status": "pending" },
    "3": { "description": "...", "dependencies": ["1", "2"], "status": "pending" }
  },
  "execution_order": ["1", "2", "3"]
}
```

### Memory Schema

**Decision D-04:** 使用 IDEA.md 定义的结构（已锁定）

**Schema (from IDEA.md Section 7.2):**
```json
{
  "task_id": "string (required)",
  "phase": "string (required)",
  "status": "pending|in_progress|completed|failed (required)",
  "task_description": "string (required)",
  "mathematical_modeling_process": "string (optional, Phase 5)",
  "preliminary_formulas": "string (optional, Phase 5)",
  "task_code": "string (optional, Phase 6)",
  "execution_result": "object|string (optional, Phase 6)",
  "solution_interpretation": "string (required after completion)",
  "subtask_outcome_analysis": "string (optional)",
  "code_structure": {
    "file_outputs": [
      { "path": "string", "description": "string" }
    ]
  },
  "charts": "array (optional)",
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

### Claude's Discretion

- **Task ID 格式:** 数字 ID（1, 2, 3...）还是带前缀（task-1）？建议使用数字 ID，更简洁
- **并行执行:** 拓扑排序后入度同时为 0 的任务是否并行执行？v1 可顺序执行，v2 可优化

---

## Canonical Refs

**Downstream agents MUST read these before planning or implementing.**

### Core Architecture
- `.planning/PROJECT.md` — 项目定义和约束
- `.planning/REQUIREMENTS.md` — TASK-01~05, MEM-01~03 需求
- `IDEA.md` §3.5 — DAG 数据结构定义
- `IDEA.md` §7.2 — Memory Schema 定义
- `IDEA.md` §6.1-6.4 — DAG 构建流程、拓扑排序、状态管理

### Prior Phase Output
- `.planning/memory/problem.md` — Phase 2 输出，作为 Phase 3 输入

---

## Existing Code Insights

### Reusable Assets
- `.claude/skills/mm-agent/coordinator.md` — 已定义 Memory 目录初始化逻辑
- `.claude/skills/mm-agent/SKILL.md` — 已定义 workflow 入口和参数

### Established Patterns
- Phase 2 parse-problem.md 使用 LLM 提取结构化字段 → Phase 3 同样可用 LLM 分析依赖
- 输出文件写入 `.planning/memory/` 目录 → Phase 3 继承此模式

### Integration Points
- Phase 3 读取 `.planning/memory/problem.md`（Phase 2 输出）
- Phase 3 输出 `.planning/memory/dag.json`, `execution-order.txt`
- Phase 4+ 读取 DAG 和 Memory 文件执行后续任务

---

## Specifics

**No specific requirements — follow IDEA.md defined patterns.**

---

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Context created: 2026-04-11*
*Discussion mode: interactive (no --auto)*