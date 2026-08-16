# 设计原则

本文件解释机制背后的取舍；[Canonical Core](../architecture/canonical-core.md) 定义规范行为。两者冲突时以 Canonical Core 和 [Artifact 协议](artifact-protocol.md) 为准。

## Harness 高于 Prompt

`mm-agent` 不是 prompt 集合。Harness 负责 Case、artifact、context、工具、Critic、计算、编译和恢复；prompt 只定义角色如何处理领域问题。

## Canonical Core 高于宿主

Case 文件、artifact schema、context manifest 和 gate 规则是长期核心。宿主只通过 Adapter 使用这些机制，不应复制或迁移 Case 事实。

## Artifact 是接口

Role 不通过聊天互传完整上下文。下游工作只读取已验收 artifact 和由 `dispatch` 生成的 `context.json`。如果一个事实不能写入本地文件，它不能成为后续阶段的前提。

## Fresh Context 高于会话延续

每次 task 都创建 Fresh Role Session。Orchestrator 使用当前 `state.json`、Role Recipe、DAG 和 Accepted Artifact Index 重建最小上下文。宿主会话压缩或重启后，Case 必须仍能恢复。

## State 由 Gate 拥有

Actor 产出 Candidate，Critic 产出 Review，Gate 验证并推进状态。Role 和 Orchestrator 都不能直接修改 `state.json` 或 Stable Artifact。

## 语义与确定性分离

Role 负责理解题目、选择模型、解释结果和写作。Core 与 Local Runtime 负责 schema、DAG、hash、文件、进程、编译和状态机。不要把语义决策塞进确定性操作，也不要让 Role 绕过 Gate 更新状态。

## Case 是学习单位

每个赛题运行都是一个 Case。它包含输入、中间 artifacts、尝试、评审、最终报告和反馈。后续改进比较 Case 证据，不依赖私人聊天。

## 报告是产品

最终 PDF 是产品。中间 artifacts 服务于可解释、可修复、可复现的报告。没有可编译 LaTeX、日志和 PDF，就没有完成的 Case。

## 最小表面积

优先选择更少的 Core 操作、更少的持久对象和更清晰的契约。新增状态层、数据库、服务或抽象必须先证明它能消除现有复杂度。
