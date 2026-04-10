# MM-Agent in Claude Code

## What This Is

将 NeurIPS 2025 论文 "MM-Agent" 的数学建模多智能体架构，本地化为 Claude Code 工作流插件。用户通过 `/mm-agent --problem <file>` 启动，继承 Claude Code 的模型配置，无需单独配置 API Key。

为数学建模竞赛参与者、科研工作者在熟悉的 Claude Code 环境中提供 MM-Agent 的自动化建模能力。

## Core Value

**输入非结构化赛题 → 自动化数学建模全流程 → 输出符合要求的论文报告**

如果其他功能失败，这条核心流水线必须能跑通。

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] 问题解析：接收 PDF/MD/TXT 赛题，输出结构化 problem.md
- [ ] 任务分解：分解子问题，构建 DAG，拓扑排序确定执行顺序
- [ ] HMML 检索：从层次化数学建模库检索相关建模方法
- [ ] Actor-Critic 建模：迭代生成建模方案，直到质量达标
- [ ] 代码生成执行：生成 Python 代码，执行数值仿真，处理错误
- [ ] Memory System：任务间上下文传递，依赖任务结果加载
- [ ] 报告生成：输出 LaTeX/PDF 报告

### Out of Scope

- Web UI（Django/Flask）— CLI-first，v1 不做 Web UI
- 独立 Python CLI — 集成而非独立部署
- 100% MM-Agent 功能对齐 — 复刻而非创新，聚焦核心流水线
- 数据库持久化 — 文件系统足够，避免额外依赖
- LangGraph/LangChain — GSD 框架已提供更好的编排模式

## Context

### 技术环境
- Claude Code Skills/Hooks/Agents 体系（原生机制）
- Python + NumPy/SciPy/Matplotlib（数值模拟）
- sentence-transformers（HMML embedding 计算）
- LaTeX/Pandoc（报告生成）
- GSD Framework（已验证的工作流编排模式）

### 参考实现
- 论文：https://arxiv.org/abs/2505.14148
- LLM-MM-Agent 仓库：https://github.com/usail-hkust/LLM-MM-Agent
- GSD Framework：https://github.com/gsd-build/get-shit-done

### 关键洞察
- 数学建模 ≠ 数学推理：需要开放式问题分析、抽象、有原则的形式化
- LLM 在推理上强，但在模型构建上弱 → 需要多智能体协作 + HMML 知识库
- 任务间存在依赖 → DAG + 拓扑排序 + Memory System
- 单次生成质量不稳定 → Actor-Critic 迭代改进

## Constraints

- **Tech Stack**: 必须在 Claude Code CLI 环境中运行，使用 Skills/Hooks/Agents 体系
- **Integration**: 继承 Claude Code 的模型配置，无需单独配置 API Key
- **Scope**: 聚焦核心流水线，其他功能失败不影响主流程
- **Reference**: 需参考 LLM-MM-Agent 和 get-shit-done 的实现模式
- **CLI-first**: v1 不做 Web UI，命令行交互为主
- **User Requirements**: 用户已有 Claude Code 环境，可提供赛题文件（PDF/MD/TXT）

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 框架复用：GSD | 已验证的编排模式，避免重新发明轮子 | — Pending |
| 知识检索：预计算 embedding | 确定性计算，LLM 不擅长向量运算 | — Pending |
| 任务依赖：DAG + 拓扑排序 | 数学建模特有需求，子问题间存在依赖 | — Pending |
| 迭代改进：Actor-Critic | 单次生成质量不稳定，模拟专家审视过程 | — Pending |
| 状态持久化：JSON 文件 | 简单可读可追踪，避免数据库依赖 | — Pending |
| 代码执行：Python 沙盒 | 数学建模需要数值计算，需要执行环境 | — Pending |
| HMML embedding：BGE-m3 或 mGTE | 中英文优秀，支持离线 | — Pending |
| Actor-Critic：Modeler Agent 内部迭代 | v1 简单实现，后续可升级双 Agent | — Pending |
| max_rounds=3 | 平衡质量与成本，过多迭代边际效益递减 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-10 after initialization*