# Project Kernel

Project Kernel 是任何智能体都能读取并接续工作的本地项目上下文。

它不是 Prompt，而是 Harness 级协议，用来约束协作方式、artifact 流转和项目记忆。

## 原则

- 项目状态属于仓库文件。
- 运行期 Case 状态属于 `runs/`。
- Research 不能覆盖当前项目文档。
- 每个阶段都必须留下可被后续阶段读取的 artifact。
- 人类反馈必须被记录成能影响后续运行的形式。

## 必读顺序

1. `README.md`
2. `IDEA.md`
3. `PLAN.md`
4. `docs/abstracted-design.md`

## 运行边界

Harness 应该把 Case 输出写入：

```text
runs/<case-id>/
```

Case 运行产物的写入必须限制在 `runs/<case-id>/` 范围内，并拒绝路径穿越与符号链接逃逸；读取系统 Knowledge 或其他明确允许的项目资产不受此限制。

根目录项目文档用于描述系统，不应该变成 Case 日志堆放处。
