# PLAN

## 当前方向

`v0.2.0` 已经结束旧 Claude/Codex 插件实验方向。

下一个里程碑是 `v1.0.0`：基于 Pi CLI Extension 的 MM-Agent Harness，能够跑通论文工作流，并产出可编译的报告。

## v1.0.0 成功标准

第一个可用版本必须做到：

- 接收赛题文件作为输入
- 跑完 MM-Agent 四个阶段：
  - Problem Analysis
  - Mathematical Modeling
  - Computational Solving
  - Solution Reporting
- 为一次 Case 运行持久化阶段 artifacts
- 生成 LaTeX 源文件
- 将 LaTeX 编译为 PDF
- 记录反馈，供后续监督迭代使用

第一个版本的建模质量可以不完美，但不能跳过 artifact 流转或报告编译。

## 近期工作

1. 完成本轮文档重置。
2. 定义 Pi CLI Extension 入口和命令形态。
3. 定义 `runs/<case-id>/` artifact 契约。
4. 将论文 prompt 和 HMML 检索资产以最小可用方式接入 Harness。
5. 实现四阶段工作流骨架。
6. 添加 LaTeX 生成与编译/修复循环。
7. 跑通一个从输入到 PDF 的最小 Case。
8. 记录反馈，并识别第一批可被监督迭代调节的参数。

## v1.0.0 非目标

- 不做 Web UI。
- 不做自定义 Pi SDK runtime。
- 不做自定义 TUI。
- 不做 benchmark 规模评估。
- 不尝试完整复刻官方 LLM-MM-Agent Web Demo。
- 不依赖不透明的厂商 Harness。

## 活跃真相来源

- `IDEA.md`：项目为什么存在。
- `README.md`：项目结构和入口。
- `HANDOFF.md`：当前交接状态和下一位智能体动作。
- `docs/context/`：项目上下文和 artifact 协议。
- `docs/architecture/`：实现设计。
- `docs/roadmap/v1.0.0.md`：里程碑清单。

`.archived/` 下的旧文件仅作为参考材料。
