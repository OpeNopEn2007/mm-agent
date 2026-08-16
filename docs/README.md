# docs

这个目录用于区分当前项目真相和历史调研证据。

## 当前设计

| 文档 | 职责 |
|------|------|
| `abstracted-design.md` | MM-Agent 架构与设计唯一权威依据（Host-Agnostic 主体、Case 目录、Knowledge 三层、Runtime 边界、Host Adapter）。当前所有实现细节以本文为准。 |
| `context/` | 项目级协议：project-kernel（项目协作与运行边界）、handoff-protocol（多 AI agent 交接协议）。 |
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
| `reference/mm-agent-paper-deep-dive.md` | MM-Agent 论文中文深度解读。 |
| `reference/upstream-prompts/mm_agent_prompts.py` | 上游 LLM-MM-Agent 仓库原版 prompt 套件，作为论文机制伴读。 |

当前关键调研：

| 文档 | 职责 |
|------|------|
| `research/pi-cli-extension-analysis.md` | Pi CLI 安装、Extension、Package、生态包和早期 v1 Harness 可行性分析。 |
| `research/llm-mm-agent-engineering-analysis.md` | 官方 LLM-MM-Agent 工程实现分析。 |
| `research/gsd-project-analysis.md` | GSD 上下文工程和工作流纪律分析。 |
| `research/cross-platform-agent-cli-comparison.md` | 多 Agent CLI 插件系统历史对比。 |

## 边界规则

- 持久项目规则放进 `context/`。
- 当前交接状态写进根目录 `HANDOFF.md`，不要写进 `docs/context/`。
- 系统架构与设计放进 `docs/abstracted-design.md`，不要新建 `docs/architecture/` 子目录作为活跃设计层。
- 版本目标放进 `roadmap/`。
- 论文、规范、原始材料放进 `reference/`。
- 调研、比较、分析放进 `research/`。
- 与旧 Claude/Codex 插件实现状态绑定的研究文档，应归档到 `.archived/legacy-claude-codex-plugin/`。
- 与 Pi CLI Extension 时期协议绑定的设计文档，应归档到 `.archived/legacy-pi-design/`。

不要在多个文档里重复同一个结论。需要引用时，链接到负责该结论的文档。