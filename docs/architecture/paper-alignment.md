# 论文对齐

`mm-agent` 在机制层面对齐 MM-Agent 论文，但第一步只实现本地闭环所需的最小能力。

## 四阶段

| 论文阶段 | 本地 Harness 输出 |
|----------|-------------------|
| Problem Analysis | 问题理解、任务分解、任务依赖图 |
| Mathematical Modeling | HMML 检索、建模方案、Critic 反馈 |
| Computational Solving | 生成代码或直接洞察、执行结果、结果解释 |
| Solution Reporting | 大纲、符号表、LaTeX 源文件、编译后的 PDF |

## Memory

论文将任务 memory 描述为 `H={(D_i,Q_i)}`，每个任务记录建模、代码和结果。Harness 应在 Case artifacts 中持久化等价结构，让后续任务和报告生成阶段能够读取。

## Actor-Critic

`v1.0.0` 至少应保留建模和报告质量相关的最小 Actor-Critic artifact 轨迹。更复杂的自诊断可以在第一个闭环跑通后演进。

## 报告要求

论文报告在本项目中不是可选项。本地工作流只有在 LaTeX 编译成功并产出 PDF 后，才算完成。
