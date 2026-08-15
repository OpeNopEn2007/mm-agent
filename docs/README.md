# docs

这个目录用于区分当前项目真相和历史调研证据。

## 当前设计

| 目录 | 职责 |
|------|------|
| `context/` | 项目级协作、Handoff、artifact 和反馈协议。设计或实现 Harness 行为前应先读这里。 |
| `architecture/` | Canonical Core、正式 OpenCode Adapter/Flow 接口、多宿主安装与分发架构、论文对齐和参考工程取舍。 |
| `roadmap/` | 简短里程碑文档。 |

## 证据与参考

| 目录 | 职责 |
|------|------|
| `reference/` | 一手资料。MM-Agent 论文放在这里。 |
| `research/` | 历史分析和外部项目调研。它们是证据，不是活跃指令。 |
| `../.archived/implementation-records/` | 已完成里程碑的简短历史记录；只用于回溯，不参与当前实施。 |

## 边界规则

- 持久项目规则放进 `context/`。
- 当前交接状态写进根目录 `HANDOFF.md`，不要写进 `docs/context/`。
- 实现设计放进 `architecture/`。
- 版本目标放进 `roadmap/`。
- 论文、规范、原始材料放进 `reference/`。
- 调研、比较、分析放进 `research/`。
- 根 `PLAN.md` 只描述里程碑预期结果、边界和验收证据，不保存逐步执行脚本。
- 已完成的详细过程计划应删除或压缩到 `.archived/implementation-records/`；归档内容不是活跃指令。
- 与旧 Claude/Codex 插件实现状态绑定的研究文档，应归档到 `.archived/legacy-claude-codex-plugin/`。
- `formal-runtime-convergence.md` 是本轮正式运行面收敛规格；它定义薄 Flow、六个模型可见 Tool、五个 hidden Agents、handoff 和外部验收边界。Golden runner 只属于开发期证据，不是产品 runtime。
- `mm_agent_case` 在活跃文档中只可描述为 Flow/Golden/兼容测试的内部 Core seam，不得写成模型可见入口。持久 `schema_version: 1` 不因本轮运行面收敛而原地改写。
- 多宿主安装与分发架构（`architecture/multi-host-install.md`）是 Design 状态：一包多宿主、安装时按宿主原生路径分流、receipt 每 host 一份。它不改变 v1 仅 OpenCode 一宿主的事实；v2 实施项与执行序以本文档锁架构、以根 `PLAN.md` 为准。
- 外部正式运行面的最新验收事实（OpenCode 1.18.9、minimax/MiniMax-M3、revision 27、A4 17 页和中断恢复）以根目录 `README.md`、`PLAN.md`、`HANDOFF.md` 与 `docs/roadmap/v1.0.0.md` 为准；本导航不记录外部路径、Case 数据或包 hash。

不要在多个文档里重复同一个结论。需要引用时，链接到负责该结论的文档。
