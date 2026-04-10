# Project Research Summary

**Project:** MM-Agent in Claude Code (mm-agent-in-cc)
**Domain:** Mathematical Modeling Multi-Agent System
**Researched:** 2026-04-10
**Confidence:** HIGH

## Executive Summary

本项目将 MM Agent（NeurIPS 2025 论文）的数学建模多智能体架构本地化为 Claude Code 工作流插件。核心目标：输入非结构化赛题 → 自动化建模全流程 → 输出符合规范的论文报告。

研究显示，最佳方案是结合 MM Agent 的角色专业化架构（Planner、Modeler、Programmer、Reviewer）与 GSD 框架的阶段化执行模式。Claude Code 的 Skills/Hooks/Agents 体系天然支持这种集成，无需构建独立应用。

关键风险：上下文丢失、无限循环、模拟失败。通过 GSD 的上下文隔离、验证门控、终止限制可有效预防。

## Key Findings

### Recommended Stack

Claude Code Skills/Hooks/Agents 为核心技术栈，结合 Python 数值计算环境和 LaTeX/Pandoc 报告生成。

**Core technologies:**
- Claude Code Skills — 工作流定义与入口
- Claude Code Agents — 角色专业化智能体（Planner、Modeler 等）
- GSD Framework patterns — 阶段化执行、上下文隔离、验证门控
- Python + NumPy/SciPy — 数值模拟执行
- LaTeX/Pandoc — 报告格式化输出

### Expected Features

**Must have (table stakes):**
- 问题输入解析 — 用户提交赛题
- 多智能体协调 — Planner→Modeler→Programmer→Reviewer 流程
- 数值模拟执行 — Python 环境运行模型
- 报告生成 — Markdown/LaTeX → PDF

**Should have (competitive):**
- 格式验证智能体 — 确保报告符合规范
- 进度追踪 — 阶段状态可见
- 交互式精化 — 用户干预点

**Defer (v2+):**
- Web UI — CLI-first 策略
- 团队协作 — 单用户优先

### Architecture Approach

采用 GSD 式的阶段化架构，结合 MM Agent 的角色专业化。每个阶段由专门智能体执行，输出通过文件传递给下一阶段，实现上下文隔离。

**Major components:**
1. Skill Layer — 问题输入、阶段执行、报告生成技能
2. Agent Layer — Planner、Modeler、Programmer、Reviewer 智能体
3. Execution Layer — Python 运行时、LaTeX 生成器
4. State Layer — .planning/ 目录管理阶段输出

### Critical Pitfalls

1. **上下文丢失** — 通过 GSD 文件传递预防
2. **无限循环** — 设置最大迭代限制
3. **模拟失败** — 代码验证子阶段
4. **格式漂移** — 格式验证智能体
5. **过度工程化模型** — 复杂度约束检查

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation & Problem Pipeline
**Rationale:** 建立基础设施和问题输入流程，是后续所有阶段的基础
**Delivers:** Skills 框架、问题解析能力、上下文传递机制
**Addresses:** 上下文丢失预防、无限循环限制
**Avoids:** 无基础设施导致的后续返工

### Phase 2: Modeling Agent System
**Rationale:** 实现 MM Agent 的核心智能体角色和协调机制
**Delivers:** Planner、Modeler 智能体定义，建模规划流程
**Uses:** Claude Code Agents，GSD 阶段模式
**Implements:** Agent Layer 核心组件
**Addresses:** 复杂度约束（Modeler 阶段）

### Phase 3: Simulation & Execution
**Rationale:** 数值模拟执行能力，模型到结果的转换
**Delivers:** Programmer 智能体、Python 运行时集成、代码验证
**Addresses:** 模拟失败预防（代码验证子阶段）

### Phase 4: Review & Report Generation
**Rationale:** 最终输出阶段，验证与报告生成
**Delivers:** Reviewer 智能体、格式验证智能体、报告模板、PDF 输出
**Addresses:** 格式漂移预防（格式验证智能体）

### Phase Ordering Rationale

- Phase 1 最先：基础设施决定后续架构可行性
- Phase 2 第二：智能体核心是建模流程关键
- Phase 3 第三：模拟依赖于建模输出
- Phase 4 最后：报告依赖于所有前置输出
- 依赖关系：解析→建模→模拟→报告，顺序固定

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** MM Agent 角色协调机制细节，需要参考论文和 repo
- **Phase 3:** Python 代码生成与验证的最佳实践

Phases with standard patterns (skip research-phase):
- **Phase 1:** Claude Code Skills 创建有标准模板
- **Phase 4:** 报告生成有成熟的 Pandoc/LaTeX 流程

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Claude Code Skills/Hooks/Agents 是成熟机制 |
| Features | HIGH | MM Agent 论文明确列出，GSD 模式参考 |
| Architecture | HIGH | MM Agent + GSD 组合架构清晰 |
| Pitfalls | HIGH | GSD 框架已解决大部分问题 |

**Overall confidence:** HIGH

### Gaps to Address

- MM Agent 论文的具体智能体角色定义细节 — 计划阶段参考论文附录
- Python 代码生成质量保证机制 — 执行阶段添加测试子流程
- LaTeX 报告模板的具体结构 — 报告阶段根据竞赛规范定制

## Sources

### Primary (HIGH confidence)
- MM Agent Paper: https://arxiv.org/abs/2505.14148 — 核心架构
- LLM-MM-Agent repo: https://github.com/usail-hkust/LLM-MM-Agent — 实现参考
- GSD Framework: https://github.com/gsd-build/get-shit-done — 工作流模式

### Secondary (MEDIUM confidence)
- Claude Code docs: https://claude.ai/code — Skills/Hooks/Agents 机制

### Tertiary (LOW confidence)
- Mathematical modeling contest guidelines — 需执行阶段验证具体规范

---
*Research completed: 2026-04-10*
*Ready for roadmap: yes*