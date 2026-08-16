# E2E Expected Behavior — 校园充电设施选址 fixture

本文件描述手工 OpenCode E2E 测试在使用本 fixture 运行时应当验证的行为。它不是断言脚本，而是供人工 review 或后续 E2E harness 使用的检查清单。

## 输入

- 赛题：`case/library/problem/problem.md`；
- 附件：`case/library/attachments/`（`sites.csv`、`demand.csv`、`distance_km.csv`）；
- Knowledge 镜像：`knowledge/`（`INDEX.md` + `optimization/` + `validation/`）。

## 输出位置

运行时产物写入 `runs/<case-id>/`，结构遵循 `skills/mm-agent/references/case-artifacts.md`：

- `STATE.md` 主会话全局笔记；
- `task-graph.md` Living Task Graph；
- `research/memo-*.md` Explorer 研究产物；
- `tasks/<task-id>/memory.md` 与 `tasks/<task-id>/work/` Solver 局部工作；
- `retrospective.md`；
- `report/` 最终报告与可复现脚本。

测试 fixture 中不预置 Working Memory；运行时由主会话与子智能体生成。

## Happy Path 验收清单

按 `docs/abstracted-design.md` 的三角色契约逐项核对行为，不要求逐字断言。

### 主会话

- 主会话保持全局视角与最终决策权，不亲自吞掉所有局部求解；
- 主会话在 Grounding / Abstraction / Decomposition 后产出可读的 Living Task Graph（Markdown）；
- 主会话从 Research Memo 与 Task Memory 读取真实内容，据此更新 `STATE.md` 与 Task Graph；
- Task 是否完成、Living Task Graph 是否需要修改，由主会话语义判断，不由 enum 决定。

### Explorer

- Explorer 至少被委派一次，形成独立可读的 Research Memo；
- Research Memo 记录检索路径（Knowledge INDEX、子目录 INDEX、文件），不仅在模型记忆；
- Research Memo 给出方法候选、适用条件、不确定性与对当前局面的建议；
- Explorer 不替主会话决定最终建模方案。

### Solver

- 至少两个 Solver Task 分别围绕一个局部 Task 工作（例如：Task A 选址与容量优化求解；Task B 敏感性分析）；
- 每个 Task 产生自包含的 Task Memory（`tasks/<task-id>/memory.md`）；
- Task Memory 写清：实际解决了什么、方法、关键假设、结果、是否可信、关键文件、局限、下游可用什么；
- Solver 内部允许 Formulation / Computation / Evaluation / Interpretation 回环，主会话不逐步介入；
- 求解脚本与中间结果保存在 `tasks/<task-id>/work/`，不大量塞进 Task Memory。

### Living Task Graph

- 在 Solver 返回新结果或 Explorer 提供新证据后，Task Graph 至少发生一次随结果的修改；
- 不被写成固定状态机或带 status enum 的执行表。

### Reporting

- 最终报告反映真实计算结果，不依赖模型记忆编造；
- 引用可追溯到 Research Memo / Task Memory 或 Case Library 中的具体文件；
- LaTeX 编译成功仅作为机械完成条件，不代表完成判断；
- 完成判断仍由主会话基于语义进行，不由固定字符串决定。

## Replan Path 验收清单（故障 E2E）

人为制造 Solver 缺关键上游信息（例如 Task B 需要上游结果但 Task A 未完成）：

- Solver 不编造输入；
- Task Memory 写清卡点、已尝试、超出 Task 边界的部分、可复用工作与需要主会话判断什么；
- 主会话读取 Task Memory 后改 Living Task Graph，重新安排上游 Task 或调整委派；
- 不出现新的 SUCCESS / BLOCKED 状态字段；
- 不出现新的正式角色或新协议对象。

## 不属于本 fixture 的事

本 fixture 不测试：

- Host Adapter 包装层（留至阶段 10）；
- Thin Runtime 必要性（阶段 11）；
- Cross-Case Knowledge promotion（阶段 13 之后）。

本 fixture 只验证三角色语义边界、Living Task Graph 真实可变、文件持久化与完成判断保留在主会话。