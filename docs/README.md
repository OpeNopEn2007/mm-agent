# docs

这个目录用于区分当前项目真相和历史调研证据。

## 当前设计

| 目录 | 职责 |
|------|------|
| `context/` | 项目级协作、Handoff、artifact 和反馈协议。设计或实现 Harness 行为前应先读这里。 |
| `architecture/` | Canonical Core、Adapter 实现接口、论文对齐和参考工程取舍。 |
| `roadmap/` | 简短里程碑文档。 |

## 证据与参考

| 目录 | 职责 |
|------|------|
| `reference/` | 一手资料及其紧贴原文的伴读文档。MM-Agent 论文和论文深度解读放在这里。 |
| `research/` | 历史分析和外部项目调研。它们是证据，不是活跃指令。 |

当前关键参考：

| 文档 | 职责 |
|------|------|
| `reference/MM-Agent-Paper.pdf` | MM-Agent 论文原文。 |
| `reference/mm-agent-paper-deep-dive.md` | MM-Agent 论文中文深度解读，并从论文机制反推本项目 v1 Pi workflow 目标。 |

当前关键调研：

| 文档 | 职责 |
|------|------|
| `research/pi-cli-extension-analysis.md` | Pi CLI 安装、Extension、Package、生态包和 v1 Harness 可行性分析。 |
| `research/llm-mm-agent-engineering-analysis.md` | 官方 LLM-MM-Agent 工程实现分析。 |
| `research/gsd-project-analysis.md` | GSD 上下文工程和工作流纪律分析。 |
| `research/cross-platform-agent-cli-comparison.md` | 多 Agent CLI 插件系统历史对比。 |

## 边界规则

- 持久项目规则放进 `context/`。
- 当前交接状态写进根目录 `HANDOFF.md`，不要写进 `docs/context/`。
- 实现设计放进 `architecture/`。
- 版本目标放进 `roadmap/`。
- 论文、规范、原始材料放进 `reference/`。
- 调研、比较、分析放进 `research/`。
- 与旧 Claude/Codex 插件实现状态绑定的研究文档，应归档到 `.archived/legacy-claude-codex-plugin/`。

不要在多个文档里重复同一个结论。需要引用时，链接到负责该结论的文档。
