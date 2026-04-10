# MM-Agent in Claude Code (mm-agent-in-cc)

## What This Is

一个将学术界的 MM Agent 数学建模多智能体架构复刻并本地化为 Claude Code 工作流插件的系统。目标是打造一个能全自动接收非结构化赛题、进行数学建模、执行数值仿真并输出报告的端到端工作流。

基于 NeurIPS 2025 收录的 MM Agent 论文，结合 GSD 框架的上下文隔离与状态机特性，让数学建模工作者在熟悉的 Claude Code 环境中使用这个强大的数学建模工具。

## Core Value

**输入非结构化赛题 → 自动化数学建模全流程 → 输出符合要求的论文报告**

如果其他功能失败，这条核心流水线必须能跑通。

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] 将 MM Agent 的多智能体编排架构移植到 Claude Code 的 Skills/Hooks/Agents 体系
- [ ] 实现赛题接收、解析、建模规划的能力
- [ ] 实现数学建模过程中的智能体协作与上下文管理
- [ ] 实现数值仿真执行与结果验证的能力
- [ ] 实现论文报告自动生成与格式排版审查的能力
- [ ] 提供用户友好的交互界面（CLI 或 Web）

### Out of Scope

- Web 可视化界面（MM Agent 原版有，但 Claude Code 本身是 CLI，优先 CLI 集成）
- 与原版 MM Agent 100% 功能对齐（聚焦核心流水线，特化数学建模场景）

## Context

### 理论支撑
- **MM Agent 论文**: [MM Agent: LLM as Agents for Real-world Mathematical Modeling Problem](https://arxiv.org/abs/2505.14148) - NeurIPS 2025 收录
- 论文提出的核心贡献：多智能体协作架构用于数学建模问题求解

### 开源参考
- **LLM-MM-Agent**: https://github.com/usail-hkust/LLM-MM-Agent - MM Agent 的工程实现
- **get-shit-done**: https://github.com/gsd-build/get-shit-done.git - GSD 框架，提供工程化的智能体编排系统和结构化的上下文管理方案

### 技术环境
- Claude Code 已具备：本地文件读写、工具调用、子智能体编排、可拓展性（Plugins、Hooks、Skills）
- GSD 框架特性：上下文隔离、状态机、结构化的上下文传递

### 设计思路
- MM Agent 论文成果优秀，已有工程实现和编排系统
- Claude Code 是很多人的生产工具，有强大的可拓展性
- 参考 GSD 设计，结合 MM Agent 理论，在 Claude Code 中"复刻"数学建模的 GSD
- 在数学建模特化场景下，可以对 GSD 的泛化设计进行约束优化（如引入格式排版审查子智能体）

## Constraints

- **Tech Stack**: Claude Code Skills/Hooks/Agents 体系
- **Target Users**: 数学建模竞赛参与者、科研工作者
- **Integration**: 必须能在 Claude Code CLI 环境中运行
- **Reference**: 需参考 LLM-MM-Agent 和 get-shit-done 的实现

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| CLI-first 而非 Web 界面 | Claude Code 本身是 CLI 工具，优先与其原生集成 | — Pending |
| 参考 GSD 框架设计 | GSD 的上下文隔离与状态机特性与 MM Agent 需求高度匹配 | — Pending |
| 特化数学建模场景 | 可对 GSD 泛化设计进行约束优化（如报告格式审查） | — Pending |

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