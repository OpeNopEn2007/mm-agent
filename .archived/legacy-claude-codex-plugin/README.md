# Legacy Claude/Codex 插件归档

本目录保存 `v0.2.0` 最终快照之后，`0.x` Claude/Codex 插件方向的历史资产，以及一度出现在 `Unreleased` 文档重置中的 Pi CLI Extension 方向资产。

这些文件是历史资产：

- 旧插件 manifest
- 旧 skills、agents、hooks
- GSD `.planning/` 运行产物和阶段文档
- 旧灵感和方向记录
- Claude Code 插件参考材料
- 旧架构重构笔记
- 绑定旧 Claude/Codex 实现状态的差距分析
- 面向旧 Claude Code 插件适配的 GSD 架构分析

它们不应被视为活跃项目指令。

`v1.0.0` 的活跃设计入口固定为：

- [Canonical Core](../docs/architecture/canonical-core.md)：宿主无关的 Case、artifact、context manifest、review 和 gate 协议。
- [Artifact 协议](../docs/context/artifact-protocol.md)：Case 文件职责、状态推进和完成规则。
- [OpenCode Plugin Harness](../docs/architecture/opencode-plugin-harness.md)：v1 唯一 Adapter 的实现接口。

如果归档目录中有可复用思想，应先迁移到 `docs/context/` 或 `docs/architecture/`，再由 OpenCode Adapter 使用。归档内容不得被 OpenCode Adapter 直接 import 或 link。