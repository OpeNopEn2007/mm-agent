# Pi Extension Harness

## 定位

Pi CLI Extension 是 `v1.x` 的执行底座。它不是产品哲学，也不是最终 runtime。

真正的产品是 MM-Agent Harness：

```text
Pi CLI Extension -> MM-Agent 工作流 -> 本地 artifacts -> LaTeX -> PDF -> 反馈
```

## Harness 职责

- 接收赛题文件并创建 Case 运行
- 编排 MM-Agent 四阶段
- 在适合确定性执行的地方调用本地工具
- 在阶段之间保存 artifacts
- 编译并修复 LaTeX
- 记录反馈，供后续迭代使用

## 复用资产

Harness 可以复用：

- `knowledge/hmml/` 中的 HMML 数据
- `prompts/` 中的 prompt 资产
- `scripts/` 中的 DAG 和 memory 工具
- `templates/` 中的 LaTeX 模板
- `servers/` 中的工具/服务实验

复用资产，不等于保留旧 Claude/Codex 入口。

## v1 边界

`v1.0.0` 直接基于 Pi CLI Extension。自定义 Pi SDK Agent、TUI 或新 runtime 属于后续大版本工作。
