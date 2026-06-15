---
phase: 6
name: Code Generation & Execution
created: 2026-04-11
---

# Phase 6 Context: Code Generation & Execution

**Goal:** Generate and execute Python code for numerical simulation with error handling.

**Domain:** 基于 modeling 方案生成可执行 Python 代码，执行数值仿真，处理错误，输出结果和可视化图表。

---

## Prior Decisions

**From PROJECT.md:**
- CLI-first，不做 Web UI
- JSON 文件持久化，不用数据库
- Glue Programming 原则：优先复用开源模板代码

**From REQUIREMENTS.md:**
- CODE-01: 生成可执行 Python 代码
- CODE-02: 执行代码
- CODE-03: 捕获 stdout/stderr
- CODE-04: 自动重试最多 5 次
- CODE-05: 输出 results.json 和可视化图表
- CODE-06: 执行超时保护 300s

**From Phase 1:**
- mm-agent-programmer Agent 负责代码生成、执行、调试

**From Phase 3:**
- Memory Schema 包含 `task_code`, `execution_result`, `code_structure`, `charts` 字段
- 依赖任务结果通过 context-for-task-{id}.txt 传递

**From Phase 5:**
- 输入：`model-{id}.md` (建模方法文档) + `formulas-{id}.json` (结构化公式)
- formulas.json schema: equations[], variables[], assumptions[]

**From IDEA.md:**
- §9 代码执行流程基础定义
- §11.6 max_retries=5, timeout=300s 定义

---

## Decisions

### Code Generation Strategy

**Decision D-06:** Template + LLM fill

**Why:**
- 数学建模常用方法有固定代码模式（回归、时间序列、优化等）
- 模板保证代码质量稳定，LLM 填充参数适应具体问题
- 符合 Glue Programming 原则：复用开源模板而非重新发明

**Template Coverage:**
- 核心 10-15 种高频建模方法
- 优先从开源社区复用可靠模板代码（如 scipy examples, statsmodels docs）
- 模板内容：建模方法名称、公式模板、变量定义、求解代码框架

**Categories to cover:**
1. 回归分析（线性、多项式、Logistic）
2. 时间序列（ARIMA、 Prophet）
3. 优化问题（线性规划、整数规划、非线性优化）
4. 微分方程（ODE 求解）
5. 聚类分析（K-means、层次聚类）
6. 插值拟合（多项式、样条）
7. 评价分析（层次分析法、TOPSIS）
8. 机理建模（物理仿真、系统动力学）

### Execution Environment

**Decision D-07:** Local subprocess with timeout protection

**Why:**
- CLI-first 定位，用户本地环境执行最简单
- subprocess 提供足够隔离（独立进程）
- timeout=300s 防止无限循环

**Implementation:**
```python
import subprocess
result = subprocess.run(
    ["python3", code_path],
    capture_output=True,
    text=True,
    timeout=300,
    cwd=work_dir
)
```

**Timeout Handling:**
1. 第一次超时：终止进程，尝试简化代码重试
2. 若仍超时：提示用户选择（调整超时时间 / 简化模型 / 跳过任务）

### Error Repair Logic

**Decision D-08:** LLM auto-repair with structured prompt

**Why:**
- 运行时错误可修复性高（语法错误、类型错误、路径错误）
- LLM 能理解 traceback 并定位问题
- 自动化修复减少用户介入

**Repair Prompt Structure:**
```
代码执行失败，请修复：

原代码：
{code}

错误信息：
{traceback}

错误分类：
- 语法错误 / 运行时错误 / 逻辑错误

请分析错误原因并输出修复后的完整代码。
```

**Repair Flow:**
1. 捕获 traceback
2. LLM 修复代码
3. 语法检查（AST validate）
4. 重新执行
5. 重复最多 3 次修复尝试

**Retry Limits:**
- max_repair = 3（修复尝试上限）
- max_execute = 5（总执行尝试上限）
- 修复后执行计入 max_execute

**After all retries exhausted:**
- 写入 results.json 标记 failed
- 记录最后一次错误信息
- 继续 DAG 执行下一任务（不阻塞整体流程）

### Visualization Output

**Decision D-09:** Intelligent selection + User confirmation

**Why:**
- 不同建模方法需要不同图表类型
- LLM 能根据方法智能选择
- 用户确认保证图表质量符合论文需求

**Chart Types:**
1. Matplotlib 基础图表：折线图、散点图、柱状图、热力图、箱线图
2. 3D 图表：3D 散点图、曲面图（优化问题、多变量分析）
3. 结果表格：数值结果、敏感性分析表格（导出 CSV）
4. 流程图/架构图：系统流程图、模型架构图（机理类问题）

**Selection Logic:**
| 建模方法 | 必选图表 | 可选图表 |
|---------|---------|---------|
| 回归分析 | 散点图 + 回归线 | 残差图、预测区间 |
| 时间序列 | 时间序列图 | ACF/PACF、预测对比 |
| 优化问题 | 目标函数收敛图 | 3D 目标函数曲面 |
| 聚类分析 | 散点图 + 聚类标签 | 聚类中心热力图 |
| 评价分析 | 权重条形图 | TOPSIS 排名雷达图 |

**User Confirmation:**
- 显示生成的图表列表
- 用户选择：保留 / 删除 / 添加
- Interactive 模式默认启用确认
- Auto 模式跳过确认（但执行自动规则检查）

### Chart Storage

**Decision D-10:** Per-task directory

**Path:** `.planning/output/plots/{task_id}/`

**Naming:** `{chart_type}.png` (如 `regression-line.png`, `residuals.png`)

**Why:**
- 多任务时避免文件名冲突
- 方便按任务组织报告附录
- 清晰的目录结构便于清理

### Results Format

**Decision D-11:** results.json schema

**Fields:**
```json
{
  "task_id": "1",
  "status": "success|failed|timeout",
  "execution_time": 12.5,
  "stdout": "完整输出文本",
  "stderr": "错误信息（如有）",
  "results": {
    "数值解": {...},
    "拟合参数": {...},
    "评价指标": {"MSE": 0.05, "R2": 0.95}
  },
  "plots": [
    {
      "path": ".planning/output/plots/1/regression-line.png",
      "type": "scatter",
      "description": "回归拟合效果图"
    }
  ],
  "created_at": "2026-04-11T..."
}
```

**Why:**
- 核心数值结果：报告引用的直接数据
- 执行日志：调试和审计需要
- 图表引用：报告插图索引

### Code Storage

**Decision D-12:** Single file per task

**Path:** `.planning/code/task-{id}.py`

**Why:**
- 简单易管理
- 与 Memory 文件一一对应
- 方便审计和复用

**Code structure:**
```python
# Task: {task_id} - {description}
# Generated: {timestamp}
# Dependencies: {dep_ids}

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from scipy import ...

# === Injected paths ===
DATA_PATH_1 = ".planning/memory/results-1.json"  # from task 1

# === Variables from formulas.json ===
# x: input variable
# y: target variable

# === Main computation ===
def main():
    ...

if __name__ == "__main__":
    main()
```

### Dependency Data Transfer

**Decision D-13:** Path injection

**Why:**
- DAG 定义了依赖关系，路径注入让代码直接访问依赖结果
- 无需复制数据，减少存储开销
- 保持数据溯源链

**Implementation:**
```python
# 代码生成时注入依赖路径
DATA_PATHS = {
    dep_id: f".planning/memory/results-{dep_id}.json"
    for dep_id in task_dependencies
}

# 注入到生成的代码中
code = f"""
# === Dependency data paths ===
DATA_PATH_{dep_1} = "{path_1}"
DATA_PATH_{dep_2} = "{path_2}"
"""
```

---

## Claude's Discretion

1. **模板来源:** 从 scipy docs, statsmodels examples, numpy tutorials 等官方文档提取模板，确保代码质量。

2. **图表审查实现:** Interactive 模式用 AskUserQuestion 让用户确认图表列表；Auto 模式用规则检查确保必选图表存在。

3. **错误分类逻辑:** 基于 traceback 关键词判断（SyntaxError → 语法, NameError/TypeError → 运行时, 结果不符合预期 → 逻辑）。

---

## Canonical Refs

**Downstream agents MUST read these before planning or implementing.**

### Core Architecture
- `.planning/PROJECT.md` — Glue Programming 原则，复用开源模板
- `.planning/REQUIREMENTS.md` — CODE-01~06 需求定义
- `IDEA.md` §9 — 代码执行实现细节
- `IDEA.md` §11.6 — 代码执行边界（max_retries, timeout）

### Prior Phase Output
- `.planning/memory/model-{id}.md` — Phase 5 建模方法文档
- `.planning/memory/formulas-{id}.json` — Phase 5 结构化公式
- `.planning/memory/context-for-task-{id}.txt` — Phase 3 依赖上下文

### Existing Code
- `.claude/skills/mm-agent/code-execution.md` — 现有骨架定义
- `.claude/scripts/hmml_retrieval.py` — HMML 检索脚本（模板方法来源）

---

## Existing Code Insights

### Reusable Assets
- `.claude/skills/mm-agent/coordinator.md` — 已定义 Phase 6 占位步骤
- `.claude/scripts/` 目录 — 已有 dag_topological_sort.py, load_dependency_memory.py 等脚本模式
- `.planning/knowledge/hmml.json` — 59 种建模方法定义，可作为模板分类依据

### Established Patterns
- Phase 5 modeling.md 使用 Actor-Critic 迭代 → Phase 6 可借鉴修复迭代模式
- 输出文件写入 `.planning/memory/` → Phase 6 继承此模式（results.json, code file）
- subprocess 执行已在 coordinator.md 提及 → Phase 6 实现具体执行逻辑

### Integration Points
- Phase 6 读取 Phase 5 输出（model.md, formulas.json）
- Phase 6 输出 Phase 7 输入（results.json, plots）
- DAG 执行循环中 Phase 6 是核心执行步骤

---

## Specifics

**Open-source template sources:**
- SciPy Official Examples: https://docs.scipy.org/doc/scipy/tutorial/
- Statsmodels Documentation: https://www.statsmodels.org/stable/examples/
- NumPy Tutorials: https://numpy.org/doc/stable/user/tutorials.html
- Matplotlib Gallery: https://matplotlib.org/stable/gallery/

**Template organization:**
```
.claude/templates/
├── regression/
│   ├── linear_regression.py
│   ├── polynomial_regression.py
│   └── logistic_regression.py
├── timeseries/
│   ├── arima.py
│   └── exponential_smoothing.py
├── optimization/
│   ├── linear_program.py
│   ├── nonlinear_optimize.py
│   └── integer_program.py
└── ...
```

---

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Context created: 2026-04-11*
*Discussion mode: interactive (no --auto)*