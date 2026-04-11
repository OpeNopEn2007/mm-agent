# MM-Agent in Claude Code

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/downloads/)
[![Claude Code](https://img.shields.io/badge/Claude_Code-CLI-orange?style=flat-square)](https://claude.ai/code)
[![NeurIPS 2025](https://img.shields.io/badge/NeurIPS-2025-B31B1B?style=flat-square)](https://arxiv.org/abs/2505.14148)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

**将 MM-Agent (NeurIPS 2025) 的数学建模多智能体架构复刻并本地化为 Claude Code 工作流插件**

---

## 核心价值

```
输入非结构化赛题 → 自动化数学建模全流程 → 输出符合要求的论文报告
```

## 项目背景

### 论文来源

本项目基于论文 [**MM-Agent: LLM as Agents for Real-world Mathematical Modeling Problem**](https://arxiv.org/abs/2505.14148) (NeurIPS 2025)。

**论文核心贡献：**
1. **MM-Bench** — 111 个真实 MCM/ICM 数学建模赛题基准（2000-2025 年，10 个领域）
2. **MM-Agent** — 四阶段专家启发式框架：问题分析 → 模型构建 → 计算求解 → 报告生成
3. **HMML** — 层次化数学建模库（98 个建模方法节点）
4. **实证验证** — 帮助两支本科生队伍获得 MCM/ICM 2025 Finalist Award（top 2.0%）

### 为什么要本地化到 Claude Code？

| 原版 MM-Agent | 本地化版本 |
|--------------|-----------|
| 独立 Python 脚本 | Claude Code Skills/Agents 体系 |
| 单一 CLI 入口 | `/mm-agent` 交互式命令 |
| 需要配置 API Key | 继承 Claude Code 的模型配置 |
| 无持久化状态 | GSD 风格的 `.planning/` 状态管理 |
| 无上下文传递 | 基于文件的上下文隔离与传递 |

---

## 深度设计分析

### 一、原版 MM-Agent 核心设计

#### 1.1 四阶段工作流

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Problem        │    │  Mathematical   │    │  Computational  │    │  Solution       │
│  Analysis       │───▶│  Modeling       │───▶│  Solving        │───▶│  Reporting      │
└─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘
        │                      │                      │                      │
        ▼                      ▼                      ▼                      ▼
  - 问题理解             - 方法检索              - 代码生成             - 报告大纲
  - 问题分解             - Actor-Critic          - 执行调试             - 内容填充
  - 依赖分析             - 公式推导              - 结果存储             - LaTeX 编译
```

#### 1.2 智能体角色定义

| Agent | 职责 | 输入 | 输出 |
|-------|------|------|------|
| **Analyst Agent** | 问题理解与反思 | 原始问题文本 | 问题分析报告 |
| **Coordinator Agent** | 问题分解与 DAG 构建 | 问题分析 | 子任务列表 + 依赖图 |
| **Modeler Agent** | 数学建模 (Actor-Critic) | 子任务 + HMML 方法 | 建模方案 + 公式 |
| **Programmer Agent** | 代码生成与调试 | 建模方案 | 可执行代码 + 结果 |
| **Reporter Agent** | 报告生成 | 所有任务结果 | LaTeX 报告 |

#### 1.3 关键技术创新

**HMML (Hierarchical Mathematical Modeling Library)**

```
Domains (领域层)
├── Operations Research (运筹学)
├── Optimization (优化)
├── Machine Learning (机器学习)
├── Prediction (预测)
└── Evaluation (评价)
    │
    ▼ Subdomains (子领域层)
    ├── Linear Programming (线性规划)
    ├── Quadratic Programming (二次规划)
    └── Monte Carlo Simulation (蒙特卡洛模拟)
        │
        ▼ Method Nodes (方法节点层) - 共 98 个
        ├── {method, core_idea, application}
        └── Example: Linear Programming
            ├── Method: 线性规划
            ├── Core Idea: 在约束条件下优化线性目标
            └── Application: 生产调度、资源分配
```

**Actor-Critic 迭代优化**

```python
# 伪代码
for round in range(max_rounds):
    # Actor: 生成建模方案
    modeling_scheme = actor(task, retrieved_methods)
    
    # Critic: 评估方案质量
    feedback = critic(task, modeling_scheme)
    
    # Actor: 根据 feedback 改进
    modeling_scheme = actor.refine(modeling_scheme, feedback)
```

**DAG 依赖管理**

```python
# 任务依赖图构建
DAG = {
    "1": [],           # Task 1 无依赖
    "2": ["1"],        # Task 2 依赖 Task 1
    "3": ["1", "2"],   # Task 3 依赖 Task 1, 2
    "4": ["2", "3"]    # Task 4 依赖 Task 2, 3
}

# 拓扑排序确定执行顺序
order = topological_sort(DAG)  # [1, 2, 3, 4]
```

**Memory System**

```python
# 任务间上下文传递
memory = {
    "1": {
        "task_description": "...",
        "mathematical_modeling_process": "...",
        "solution_interpretation": "...",
        "task_code": "...",
        "execution_result": "..."
    },
    # ...
}

# 后续任务可访问前置任务的 memory
dependency_prompt = f"""
# The Description of Task {id}:
{coordinator.memory[str(id)]['task_description']}
# The modeling method for Task {id}:
{coordinator.memory[str(id)]['mathematical_modeling_process']}
# The result for Task {id}:
{coordinator.memory[str(id)]['solution_interpretation']}
"""
```

---

### 二、GSD 框架核心设计

#### 2.1 三层架构模式

```
┌─────────────────────────────────────────────────────────────┐
│                    Orchestrator Layer                        │
│  (plan-phase.md, execute-phase.md, discuss-phase.md)        │
│  - 上下文加载、决策路由、状态更新                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Agent Layer                             │
│  (gsd-planner.md, gsd-executor.md, gsd-verifier.md)         │
│  - 专业执行者，fresh context 运行，明确目标和输出              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Tools Layer                             │
│  (Read, Write, Edit, Grep, Bash, etc.)                      │
│  - 基础能力                                                   │
└─────────────────────────────────────────────────────────────┘
```

#### 2.2 文件驱动的上下文传递

```
┌──────────┐     ┌───────────┐      ┌──────────┐     ┌──────────┐
│CONTEXT.md│────▶│RESEARCH.md│─────▶│ PLAN.md  │────▶│SUMMARY.md│
└──────────┘     └───────────┘      └──────────┘     └──────────┘
     │                 │                 │                │
     ▼                 ▼                 ▼                ▼
 用户决策             技术调研           执行计划          执行结果
 (discuss)         (research)          (plan)          (execute)
```

**核心原则：每个 Agent 只加载必要的上下文，避免 context pollution**

#### 2.3 Goal-Backward 验证

```
              Goal (目标)
                 │
                 ▼
         ┌────────────────────┐
         │  Truths ( truths)  │  ← 什么必须为真？
         └────────────────────┘
                 │
                 ▼
         ┌─────────────────┐
         │ Artifacts (制品)│  ← 什么必须存在？
         └─────────────────┘
                 │
                 ▼
         ┌─────────────────┐
         │  Links (连接)   │  ← 什么必须连接？
         └─────────────────┘
                 │
                 ▼
         ┌───────────────┐
         │ Data Flow     │  ← 数据是否流动？
         └───────────────┘
```

**不是检查"任务是否完成"，而是检查"目标是否达成"**

#### 2.4 Deviation Rules (偏差处理规则)

| Rule | 触发条件 | 处理方式 | 权限 |
|------|---------|---------|------|
| **Rule 1: Bug** | 错误行为、类型错误、安全问题 | 自动修复 | Auto |
| **Rule 2: Missing Critical** | 缺少错误处理、验证、认证 | 自动添加 | Auto |
| **Rule 3: Blocking** | 缺少依赖、配置、文件 | 自动解决 | Auto |
| **Rule 4: Architectural** | 结构变更、新数据库表、新服务 | 停止并询问用户 | Ask |

---

### 三、迁移策略：MM-Agent → Claude Code

#### 3.1 概念映射表

| MM-Agent 概念 | GSD 对应概念 | 本地化实现 |
|--------------|-------------|-----------|
| Coordinator Agent | Orchestrator | `mm-agent-coordinator.md` (skill) |
| Analyst Agent | Researcher | `mm-agent-analyst.md` (agent) |
| Modeler Agent | Planner | `mm-agent-modeler.md` (agent) |
| Programmer Agent | Executor | `mm-agent-programmer.md` (agent) |
| Reporter Agent | Doc-Updater | `mm-agent-reporter.md` (agent) |
| HMML | Knowledge Base | `.planning/knowledge/hmml.json` |
| Memory System | File-based State | `.planning/memory/*.json` |
| DAG | Dependency Graph | `.planning/memory/dag.json` |
| Actor-Critic | Iteration Loop | Agent 内部迭代 |

#### 3.2 目标架构

```
/mm-agent --problem contest.pdf
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│ Phase 1: Foundation & Problem Pipeline                       │
│ - PDF/文本解析 → problem.md                                  │
│ - 问题结构化提取 (title, background, questions, constraints) │
│ - 验证门控                                                   │
└──────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 2: Modeling Agent System                              │
│ - 任务分解与 DAG 构建                                       │
│ - HMML 方法检索                                             │
│ - Actor-Critic 建模迭代                                     │
│ - 输出: model.md, formulas.json                             │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 3: Simulation & Execution                             │
│ - 代码生成 (Python/NumPy/SciPy)                             │
│ - 执行与调试循环                                            │
│ - 结果存储: results.json, plots/                            │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 4: Review & Report Generation                         │
│ - 结果验证                                                  │
│ - LaTeX 报告生成                                            │
│ - PDF 编译                                                  │
└─────────────────────────────────────────────────────────────┘
```

#### 3.3 Phase 1 审视：差距分析

**做得好的部分：**
- ✅ GSD 风格的目录结构 (`.planning/`)
- ✅ Skill 文件定义 (frontmatter + 结构化流程)
- ✅ 验证门控概念
- ✅ 问题解析模板

**存在的差距：**

| 缺失项 | 重要性 | 建议 |
|--------|--------|------|
| Coordinator 概念 | 🔴 高 | 需要实现任务 DAG 管理和依赖分析 |
| HMML 知识库 | 🔴 高 | 需要创建 98 个建模方法节点的知识库 |
| Memory System | 🔴 高 | 需要实现任务间上下文传递机制 |
| Actor-Critic 迭代 | 🟡 中 | 建模阶段需要迭代改进机制 |
| Agent 定义文件 | 🟡 中 | 应创建 `.claude/agents/*.md` 而非仅 Skills |
| Code Templates | 🟢 低 | 可在 Phase 3 实现 |

---

## 快速开始

### 安装

```bash
# 克隆仓库
git clone 【仓库地址：待填】
cd mm-agent-in-cc

# 安装 Python 依赖 (用于数值计算阶段)
pip install numpy scipy matplotlib pandas jinja2

# 安装 Pandoc 和 LaTeX (用于报告生成阶段)
brew install pandoc
brew install --cask mactex  # macOS
```

### 使用

```bash
# 在 Claude Code 中运行
/mm-agent --problem path/to/contest-problem.pdf

# 交互模式 (逐步确认)
/mm-agent --problem problem.md --interactive

# YOLO 模式 (跳过验证)
/mm-agent --problem problem.txt --skip-verify

# 从指定阶段继续
/mm-agent --phase 2
```

### 输出文件

```
.planning/
├── phases/
│   ├── 01-foundation-problem-pipeline/
│   │   └── outputs/
│   │       └── problem.md          # 结构化问题
│   ├── 02-modeling-agent-system/
│   │   └── outputs/
│   │       ├── model.md            # 建模方案
│   │       └── formulas.json       # 数学公式
│   ├── 03-simulation-execution/
│   │   └── outputs/
│   │       ├── code/               # Python 代码
│   │       ├── results.json        # 计算结果
│   │       └── plots/              # 可视化图表
│   └── 04-review-report/
│       └── outputs/
│           └── report.pdf          # 最终报告
└── memory/
    ├── dag.json                    # 任务依赖图
    └── task-*.json                 # 任务记忆
```

---

## 项目状态

- [x] Phase 1: Foundation & Problem Pipeline — **Complete**
- [ ] Phase 2: Modeling Agent System — **Pending**
- [ ] Phase 3: Simulation & Execution — **Blocked** (需要 Phase 2)
- [ ] Phase 4: Review & Report Generation — **Blocked** (需要 Phase 3)

---

## 参考文献

### 核心论文

```bibtex
@misc{mmagent2025,
  title={MM-Agent: LLM as Agents for Real-world Mathematical Modeling Problem},
  author={Fan Liu and Zherui Yang and Cancheng Liu and Tianrui Song and Xiaofeng Gao and Hao Liu},
  year={2025},
  eprint={2505.14148},
  archivePrefix={arXiv},
  primaryClass={cs.AI},
  url={https://arxiv.org/abs/2505.14148}
}
```

### 相关资源

- [MM-Agent 官方仓库](https://github.com/usail-hkust/LLM-MM-Agent)
- [MM-Agent 在线 Demo](https://huggingface.co/spaces/MathematicalModelingAgent/MathematicalModelingAgent)
- [GSD Framework](https://github.com/gsd-build/get-shit-done)
- [Claude Code 文档](https://claude.ai/code)

---

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

---

*本项目是对 NeurIPS 2025 论文 "MM-Agent" 的本地化复刻，旨在让数学建模工作者在熟悉的 Claude Code 环境中使用这个强大的数学建模工具。*