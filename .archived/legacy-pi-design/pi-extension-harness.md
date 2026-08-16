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

## 已验证的 Pi 事实

- 本机已安装 `@earendil-works/pi-coding-agent@0.79.4`，命令入口为 `pi`。
- Pi Extension 是 TypeScript 模块，可注册 command、tool、flag、事件 hook、UI 和资源发现。
- Pi Package 可以通过 npm、git 或本地路径分发 `extensions/`、`skills/`、`prompts/`、`themes/`。
- Project-local `.pi/` 资源需要 trust；`AGENTS.md` 和 `CLAUDE.md` 会作为上下文文件加载。
- Pi 没有内建 sandbox；v1 Harness 必须自己约束写入路径和危险命令。
- 本机 PATH 上第一个 `bash.exe` 是 Windows/WSL 入口；正式运行前应在用户级 Pi settings 中显式设置 Git Bash `shellPath`。

详细证据见 `docs/research/pi-cli-extension-analysis.md`。

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

## v1 最小形态

`v1.0.0` 优先做 Pi package，而不是只做用户全局 extension。最小构成：

- 一个 coordinator extension，提供 `/mm-agent` 入口和必要 tools。
- 一个阶段 workflow skill，说明四阶段协议。
- 一个 prompt template，提供快捷启动入口。
- 复用现有 `knowledge/`、`prompts/`、`scripts/`、`templates/`。
- 将所有 Case 产物写入 `runs/<case-id>/`。
