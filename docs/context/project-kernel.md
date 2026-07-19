# Project Kernel

Project Kernel 是任何智能体都能读取并接续工作的本地项目上下文。

它不是 Prompt，而是 Harness 级协议，用来约束协作方式、artifact 流转和项目记忆。

## 原则

- 项目状态属于仓库文件。
- 运行期 Case 状态属于 `runs/`。
- Research 不能覆盖当前项目文档。
- 每个阶段都必须留下可被后续阶段读取的 artifact。
- 人类反馈必须被记录成能影响后续运行的形式。

## 事实恢复入口

完整必读顺序由根 [AGENTS.md](../../AGENTS.md) 与 [CLAUDE.md](../../CLAUDE.md) 统一维护，本文件不保存第二份易漂移的顺序。

恢复项目事实时，应能区分：

- `HANDOFF.md`：当前已接受状态、进行中工作和下一步边界。
- `PLAN.md`：里程碑预期结果、完成边界和验收证据。
- `docs/architecture/canonical-core.md` 与 `docs/context/artifact-protocol.md`：宿主无关协议。
- `docs/architecture/opencode-plugin-harness.md`：OpenCode Adapter 接口。

## 运行边界

Harness 应该把 Case 输出写入：

```text
runs/<case-id>/
```

根目录项目文档用于描述系统，不应该变成 Case 日志堆放处。
