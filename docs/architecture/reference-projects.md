# 参考工程

本项目使用参考资料来辅助判断，而不是复制结构。

## MM-Agent 论文

定义核心理论工作流：

- 四阶段
- HMML 检索
- 任务依赖图
- Actor-Critic 优化
- 任务 memory
- 报告生成

## LLM-MM-Agent

作为官方实现参考，用于理解：

- prompt 清单
- HMML 结构
- Case 执行预期
- 报告生成行为

不要把它的 Web Demo 架构复制到 `v1.0.0`。

## GSD Core

作为工作流纪律参考，用于理解：

- 持久上下文
- 阶段边界
- 状态交接
- 以 artifact 为中心的协作

不要把旧 `.planning/` 运行产物继续当作活跃项目真相。
