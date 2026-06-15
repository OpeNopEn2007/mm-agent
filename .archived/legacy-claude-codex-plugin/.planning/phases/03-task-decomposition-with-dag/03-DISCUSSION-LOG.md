# Phase 3: Task Decomposition with DAG - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 03-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 03-task-decomposition-with-dag
**Areas discussed:** Task Granularity, Cycle Handling

---

## Task Granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Question → Task (一对一) | 每个 question 直接对应一个 task | |
| Sub-question 分解 | 根据建模复杂度细分：数据预处理、建模、验证等 | |
| LLM 自适应 | 让 LLM 自行判断分解粒度 | |
| 渐进分解 | Phase 3 简单一对一，复杂场景 Phase 5 处理 | ✓ |

**User's choice:** 渐进分解（推荐）
**Notes:** 分离关注点，Phase 3 聚焦 DAG 结构，Phase 5 聚焦建模细节

---

## Cycle Handling

| Option | Description | Selected |
|--------|-------------|----------|
| 报错退出 | 检测循环后终止，输出错误报告 | ✓ |
| 尝试自动拆解 | 自动拆解任务节点打破循环 | |
| 提示用户干预 | 检测到循环后暂停，让用户选择 | |
| 延迟处理 | Phase 3 不处理循环检测 | |

**User's choice:** 报错退出 + 详细错误说明 + 用户交互
**Notes:**
- 循环依赖是结构性问题，自动拆解可能违背用户建模意图
- 数学建模的任务依赖关系有语义意义，不是纯技术 DAG
- 用户在场讨论比自动化更安全

**Error handling flow:**
```
检测循环 → 输出详细错误报告 → 等待用户决定下一步
- 循环链：A → B → C → A
- 每个任务的依赖关系
- 可能的修复建议

用户选择：
1. 手动调整依赖关系
2. 重新分解任务
3. 删除某个任务打破循环
4. 其他方案
```

---

## Claude's Discretion

1. **Task ID 格式:** 数字 ID（1, 2, 3...）还是带前缀（task-1）？建议使用数字 ID
2. **并行执行:** 拓扑排序后入度同时为 0 的任务是否并行？v1 顺序，v2 可优化

---

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Discussion completed: 2026-04-11*