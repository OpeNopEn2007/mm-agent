# MM-Agent Plugin for Claude Code

**将 NeurIPS 2025 论文 MM-Agent 的数学建模能力复刻为 Claude Code 工作流插件**

> **当前状态 (2026-05-16)**: Phase 1-7 文档完成，但核心流水线有断裂。详见 [PLAN.md](./PLAN.md)。

---

## 核心价值

```
输入非结构化赛题 → 自动化数学建模全流程 → 输出符合要求的论文报告
```

## 功能特性

- **4 阶段完整流程**：Problem Analysis → Mathematical Modeling → Computational Solving → Solution Reporting
- **HMML 知识库**：内置 98 种数学建模方法（5 大领域、17 个子领域），支持语义检索
- **DAG 依赖管理**：多任务自动拓扑排序执行
- **LaTeX 报告生成**：支持 MCM/ICM 两种模板

## 安装

### 1. 复制插件到项目

将插件复制到你的数学建模项目：

```bash
# 插件结构应包含：
# skills/mm-agent/           # Skill 定义
# scripts/                   # 工具脚本
# knowledge/hmml/             # HMML 知识库
# templates/                 # LaTeX 模板
```

### 2. 安装 Python 依赖

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install numpy scipy matplotlib statsmodels pandas symPy pymupdf pyyaml sentence-transformers
```

### 3. 安装 LaTeX (可选，用于 PDF 生成)

```bash
brew install --cask mactex  # macOS
# 或
# Ubuntu: sudo apt install texlive-xetex
```

## 使用

```bash
# 在 Claude Code 中运行
/mm-agent --problem 赛题.pdf

# 交互模式（逐步确认）
/mm-agent --problem 赛题.pdf --interactive
```

## 插件结构

```
├── .claude-plugin/
│   └── plugin.json              # 插件元数据
├── skills/
│   └── mm-agent/
│       ├── SKILL.md             # 主入口（自然语言指令）
│       ├── coordinator.md       # 流程编排
│       ├── parse-problem.md     # 问题解析
│       ├── task-decomposition.md # 任务分解
│       ├── hmml-retrieval.md    # 知识检索
│       ├── modeling.md          # 数学建模（Actor-Critic）
│       ├── code-execution.md    # 代码生成与执行
│       └── report-generation.md # 报告生成
├── agents/
│   ├── mm-agent-coordinator.md  # DAG 编排 agent
│   ├── mm-agent-modeler.md      # 建模 agent
│   ├── mm-agent-programmer.md   # 编程 agent
│   └── mm-agent-reporter.md     # 报告 agent
├── hooks/
│   ├── hooks.json               # Hook 配置
│   └── session-start            # 会话启动 hook
├── scripts/
│   ├── dag_topological_sort.py  # DAG 拓扑排序
│   ├── hmml_retrieval.py        # HMML 语义检索
│   ├── hmml_precompute_embeddings.py # 预计算嵌入
│   └── load_dependency_memory.py     # 依赖记忆加载
├── knowledge/
│   ├── hmml/                    # HMML 方法库（98种方法）
│   └── *.md                     # 写作指南、排版规范
├── templates/
│   ├── mcmthesis/               # MCM 美赛模板
│   └── cumcmthesis/             # CUMCM 国赛模板
├── prompts/
└── docs/
```

## 工作流程

```
Stage 1: Problem Analysis
  输入: PDF/MD/TXT 赛题
  过程: 问题理解(Actor-Critic×3) → 任务分解+细化 → DAG 构建
  输出: problem_analysis, task_descriptions, dag_order

Stage 2 & 3: Mathematical Modeling & Computational Solving（按 DAG 顺序迭代）
  对每个任务:
    建模: HMML 检索(top-6) → 公式 Actor-Critic → 建模过程
    求解: 代码生成 → 执行 → 调试循环 → 结果解释
  输出: 各任务的模型、代码、结果

Stage 4: Solution Reporting（可选）
  输入: 所有阶段输出
  过程: 大纲生成 → 逐章 LaTeX 生成 → 元信息 → PDF 编译
  输出: report.tex, report.pdf
```

## 输出文件

运行后生成：

```
output/
├── json/
│   └── {task}.json         # 完整求解结果（含所有阶段输出）
├── markdown/
│   └── {task}.md           # Markdown 格式报告
├── code/
│   ├── main1.py ~ mainN.py # 各任务代码
│   └── *.png               # 生成的图表
├── latex/
│   └── solution.tex        # LaTeX 源文件（+ PDF）
└── usage/
    └── {task}.json         # Token 使用统计
```

## 依赖

- **Python**: 3.10+
- **LaTeX**: XeLaTeX (TeX Live 2026+)
- **模型**: Claude Code 内置模型（继承配置，无需单独 API Key）

## 论文来源

本项目基于 [MM-Agent (NeurIPS 2025)](https://arxiv.org/abs/2505.14148)：

**GitHub**: https://github.com/OpeNopEn2007/mm-agent

```bibtex
@misc{mmagent2025,
  title={MM-Agent: LLM as Agents for Real-world Mathematical Modeling Problem},
  author={Fan Liu et al.},
  year={2025},
  eprint={2505.14148},
  archivePrefix={arXiv},
  primaryClass={cs.AI}
}
```

---

## 已知问题 (2026-05-16)

当前版本存在以下问题：

| 问题 | 影响 | 解决方案 |
|------|------|---------|
| `templates/report-generator.py` 导入断裂 | Phase 7 无法执行 | 修复导入路径或重构为纯 Skill |
| Actor-Critic 同一 Skill 执行 | Critic 评估不独立 | 重构为独立 Agent |
| HMML 检索用 Python 脚本 | 脱离 Claude 生态 | 转为 MCP Server |
| Agent 文件未被调用 | Agent Team 架构未实现 | 使用 Agent tool 调用 |

**详细分析**: `docs/research/paper-vs-implementation-gap-analysis.md`
**重构方案**: `docs/research/claude-code-architecture-refactor.md`
**执行计划**: `PLAN.md`

---

*MM-Agent in Claude Code - 让数学建模更简单*
