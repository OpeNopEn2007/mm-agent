# Phase 6: Code Generation & Execution - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 06-code-generation-execution
**Areas discussed:** 代码生成策略, 执行环境安全, 错误修复机制, 可视化输出, 代码存储结构, 依赖数据传递

---

## 代码生成策略

| Option | Description | Selected |
|--------|-------------|----------|
| 模板 + LLM 填充 | 针对常见建模方法预定义 Python 代码模板，LLM 填充参数和公式 | ✓ |
| 纯 LLM 生成 | LLM 直接根据 formulas.json 生成完整代码，无预定义模板 | |
| 混合模式 | 简单方法用模板，复杂方法用 LLM | |

**User's choice:** 模板 + LLM 填充 (推荐)

**Follow-up - 模板范围:**

| Option | Description | Selected |
|--------|-------------|----------|
| 覆盖 HMML 59 种方法 | 模板覆盖全部 HMML 方法 | |
| 核心 10-15 种方法 | 回归、时间序列、微分方程、优化、聚类等高频方法 | ✓ |
| 类别级模板 | 按建模类别分类的通用代码框架 | |

**User's choice:** 核心 10-15 种方法，并建议在开源社区寻找可靠的模板代码进行复用。

**Notes:** 符合 Glue Programming 原则，优先复用 scipy、statsmodels 等官方文档模板。

---

## 执行环境安全

| Option | Description | Selected |
|--------|-------------|----------|
| 本地 subprocess | 直接使用 subprocess.run() 执行，timeout=300s | ✓ |
| Docker 容器隔离 | 使用 Docker 容器执行，隔离环境 | |
| Python AST 检查 | 使用 restrictedpython 或 AST 检查限制危险操作 | |

**User's choice:** 本地 subprocess (推荐)

**Follow-up - 超时处理:**

| Option | Description | Selected |
|--------|-------------|----------|
| 终止并标记失败，继续 DAG | 终止进程，写入 results.json 标记 failed | |
| 终止并提示用户选择 | 终止进程，提示用户调整超时/简化模型/跳过 | |
| 终止并重试一次 | 终止进程，尝试简化代码重试 | |

**User's choice:** 先进行选项三（重试），若还遇到失败就进入选项二（终止并提示用户）。

**Notes:** 超时处理采用两阶段策略：自动重试一次 → 仍失败则用户介入。

---

## 错误修复机制

| Option | Description | Selected |
|--------|-------------|----------|
| LLM 自动修复 | 解析 traceback，LLM 修复代码后重新执行，最多 3 次 | ✓ |
| 重新生成代码 | 错误时直接重新生成完整代码 | |
| 记录错误，用户介入 | 记录错误信息，不尝试修复 | |

**User's choice:** LLM 自动修复

**User suggestions:**
- 修复 Prompt 包含：原代码 + traceback + 错误分类（语法/运行时/逻辑）
- 修复后先语法检查，再执行

**Follow-up - 重试次数分配:**

| Option | Description | Selected |
|--------|-------------|----------|
| 修复 3 次 + 执行 5 次 | 修复尝试最多 3 次，总执行尝试最多 5 次 | ✓ |
| 统一计数 5 次 | 修复和执行合并计数 | |
| 修复 5 次 | 修复尝试最多 5 次，不限制执行次数 | |

**User's choice:** 修复 3 次 + 执行 5 次 (推荐)

**Notes:** 与 IDEA.md max_retries=5 定义一致。

---

## 可视化输出

| Option | Description | Selected |
|--------|-------------|----------|
| Matplotlib 基础图表 | 折线图、散点图、柱状图、热力图、箱线图 | ✓ |
| 3D 图表 | 3D 散点图、曲面图（优化问题、多变量分析） | ✓ |
| 结果表格导出 | 数值结果、敏感性分析表格，导出 CSV | ✓ |
| 流程图/架构图 | 系统流程图、模型架构图 | ✓ |

**User's choice:** 全选（四种图表类型）

**User note:** LLM 根据建模方法选择，但是要经过审查。

**Follow-up - 审查机制:**

| Option | Description | Selected |
|--------|-------------|----------|
| 自动规则检查 | 代码执行前自动检查图表类型匹配建模方法 | |
| 用户确认 | 生成图表后显示给用户确认 | ✓ |
| 混合：自动检查 + 用户可选确认 | 默认自动检查，interactive 模式增加用户确认 | |

**User's choice:** 用户确认

**Follow-up - 图表存储结构:**

| Option | Description | Selected |
|--------|-------------|----------|
| 按任务分目录 | 所有图表存入 .planning/output/plots/{task_id}/ 目录 | ✓ |
| 单目录平铺 | 所有图表存入 .planning/output/plots/ 根目录 | |
| 与 Memory 同目录 | 图表存入 .planning/memory/{task_id}-plots/ | |

**User's choice:** 按任务分目录 (推荐)

---

## 结果格式 (results.json)

| Option | Description | Selected |
|--------|-------------|----------|
| 核心数值结果 | 数值解、拟合参数、评价指标（MSE, R², accuracy 等） | ✓ |
| 执行日志 | stdout 输出文本、stderr 错误信息、执行状态 | ✓ |
| 图表文件引用 | 生成的图表文件路径列表、图表类型与用途说明 | ✓ |
| 代码元数据 | 代码文件路径、代码 MD5 校验、生成时间戳 | |

**User's choice:** 核心数值结果 + 执行日志 + 图表文件引用（三项）

---

## 代码存储结构

| Option | Description | Selected |
|--------|-------------|----------|
| 单文件 per task | 每个任务一个 Python 文件，存入 .planning/code/task-{id}.py | ✓ |
| 多文件项目结构 | 每个任务可能有多个 Python 文件 | |
| 不持久化代码文件 | 生成代码不持久化，只在 Memory 中记录代码摘要 | |

**User's choice:** 单文件 per task (推荐)

---

## 依赖数据传递

| Option | Description | Selected |
|--------|-------------|----------|
| 路径注入 | 任务代码中自动注入依赖任务的 results.json 路径作为变量 | ✓ |
| 摘要传递 | 依赖任务的数据通过 context-for-task-{id}.txt 传递摘要 | |
| 数据复制到工作目录 | 依赖任务的数据复制到任务工作目录 | |

**User's choice:** 路径注入 (推荐)

---

## Claude's Discretion

以下决策留由 Claude 在实现时自行决定：

1. **模板来源:** 从 scipy docs, statsmodels examples, numpy tutorials 等官方文档提取模板
2. **图表审查实现:** Interactive 模式用 AskUserQuestion 确认；Auto 模式用规则检查
3. **错误分类逻辑:** 基于 traceback 关键词判断错误类型

---

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Discussion log created: 2026-04-11*