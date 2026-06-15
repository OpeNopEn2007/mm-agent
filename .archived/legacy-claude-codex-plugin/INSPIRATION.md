## 1. 项目背景与目标

本项目旨在利用 GSD 框架的上下文隔离与状态机特性，将学术界的 MM Agent 数学建模多智能体架构复刻并本地化为 Claude Code 的工作流插件。目标是打造一个能全自动接收非结构化赛题、进行数学建模、执行数值仿真并输出报告的端到端系统。

## 2. 核心参考资料

* 理论支撑: [MM Agent: LLM as Agents for Real-world Mathematical Modeling Problem (NeurIPS 2025)](https://arxiv.org/abs/2505.14148)
* 开源仓库: 
  * [LLM-MM-Agent](https://github.com/usail-hkust/LLM-MM-Agent)
  * [get-shit-done](https://github.com/gsd-build/get-shit-done.git)

## 3. 架构设计思维链

* MM Agent 的论文成果非常优秀，并且已经有工程实现，搭建了一个类似于可交互智能体（例如 Claude Code）的编排系统，并且搭建了一个基于 Web 的可视化界面。
* 考虑到 Claude Code（以下简称 cc） 已经成为非常多人惯用的生产工具，并且 cc 本身具有本地文件读写、工具调用、子智能体编排以及强大的可拓展性（Plugins、Hooks、Skills），我想要把这个东西搬进 cc，让相关工作者在熟悉的 cc 环境中使用这个强大的数学建模工具。
* 并且在使用 GSD 的过程中，我发现 GSD 设计了一套非常工程化的智能体编排系统，非常结构化的上下文管理（隔离和传递）方案，这与 MM Agent 非常类似，我想要参考 GSD 的设计和实现，结合 MM Agent 的理论成果和工程实现，「复刻」一个数学建模的 GSD，让工作者能够输入非结构化赛题来启动这个智能体系统，完成赛题的全过程解答，并最终产出一份符合要求的论文报告成果进行提交。
* 并且在这个数学建模的特化场景下，我们还可以对 GSD 中的一些为了泛化而妥协的设计进行约束，例如可以在报告生成阶段引入格式排版审查的子智能体参与审批循环，通过提示词工程让该子智能体重点关注论文排版细节的审查。

## 4. 设计哲学（2026-05-07 讨论）

### 4.1 GSD 是骨架，MM-Agent 是灵魂

GSD 证明了一件事：用 markdown 文件 + 一个 CLI 工具 + Agent 派发，就能在 Claude Code 里编排复杂的多智能体工作流。它的"约束"恰恰是优势——所有中间状态都落在文件系统里，可审计、可恢复、可跨会话。

MM-Agent 的四阶段流水线天然适合这个骨架。每个阶段就是一个 Agent，阶段之间的数据通过 `.mm-agent/` 目录下的文件传递。

### 4.2 翻译的关键：把 Python 的"隐式状态"变成文件的"显式状态"

论文的 Python 实现里，状态在内存中流动——coordinator 持有 dict，agent 返回 dict，一切在进程内完成。在 Claude Code 里，需要把每个中间产物都写成文件。**这不是妥协，这是升级**——论文实现的中间结果很难复现和调试，而文件系统方案天然支持断点续跑、人工审查、跨会话恢复。

### 4.3 实施策略：最小可跑通流水线优先

不要一开始就实现完整的 9 轮 Actor-Critic。先跑通：

```
赛题 PDF → 问题理解(1轮) → 单任务建模(1轮) → 代码执行 → LaTeX 输出
```

这条最小路径通了之后，再逐步加：DAG 多任务、完整 Actor-Critic、HMML 检索、报告模板。

### 4.4 Claude Code 原生能力利用

- **Agent Panel UI**（v2.1.97+）：用户可实时监控子智能体工作进展，这是论文 Python 实现做不到的透明度
- **File-as-Context**：Agent 之间通过文件路径传递上下文，不内联到 prompt
- **Fresh Agent**：每轮 Actor-Critic 派发全新 Agent，通过文件传递 checkpoint 状态
