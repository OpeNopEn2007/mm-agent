# PLAN

## 当前方向

`v0.2.0` 已经结束旧 Claude/Codex 插件实验方向。

下一个里程碑是 `v1.0.0`：host-agnostic 数学建模 MM-Agent Harness，以 `docs/abstracted-design.md` 为架构唯一权威依据。

四阶段（Problem Analysis / Mathematical Modeling / Computational Solving / Solution Reporting）理解为数学建模的认知骨架，端到端跑通并产出可编译报告。

## v1.0.0 成功标准

第一个可用版本必须做到：

- 接收赛题文件作为输入
- 跑完数学建模四阶段：
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

1. 完成本轮文档重置与 active-doc 收口。
2. 按 `docs/abstracted-design.md` 建立 host adapter 骨架与端到端最小命令。
3. 定义 `runs/<case-id>/` 目录布局（library / STATE.md / task-graph.md / research / tasks / report / retrospective）。
4. 按 `docs/abstracted-design.md` §13 重组 Knowledge 树（HMML INDEX + 子目录 + 方法 md）。
5. 实现 Explorer 与 Task Solver 两个 subagent 的最小 prompt 框架。
6. 实现 Runtime 工具最小集（prepare / compute / compile），不预建 hmml 专用 Tool。
7. 跑通一个从输入到 PDF 的最小 Case。
8. 记录反馈与 Retrospective。

## v1.0.0 非目标

- 不做 Web UI。
- 不做自定义宿主 SDK runtime（适配宿主是 adapter 职责，不重写宿主语义）。
- 不做自定义 TUI。
- 不做 benchmark 规模评估。
- 不尝试完整复刻官方 LLM-MM-Agent Web Demo。
- 不依赖不透明的厂商 Harness。

## 活跃真相来源

- `IDEA.md`：项目为什么存在。
- `README.md`：项目结构和入口。
- `HANDOFF.md`：当前交接状态和下一位智能体动作。
- `docs/abstracted-design.md`：系统架构与设计唯一权威依据。
- `docs/context/`：项目级协议（project-kernel、handoff-protocol）。
- `docs/roadmap/v1.0.0.md`：里程碑清单。

`.archived/` 下的旧文件仅作为参考材料。