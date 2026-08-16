# mm-agent

host-agnostic 数学建模 MM-Agent Harness。

`mm-agent` 把数学建模赛题转化为一篇真实报告：可运行、可检查、可反馈、可迭代。

```text
赛题输入 -> 数学建模四阶段 (cognitive skeleton) -> 可编译 LaTeX -> PDF 论文
```

## 状态

当前主线从 `v1.0.0` 开始重建。

- `v0.2.0` 是旧 Claude/Codex 插件方向的最终快照。
- `v1.0.0` 以 `docs/abstracted-design.md` 为架构唯一权威依据。
- 当前还不是可安装、可直接使用的稳定工具。

## 核心目标

`v1.0.0` 的第一原则是闭环优先：

- 跑完 Problem Analysis、Mathematical Modeling、Computational Solving、Solution Reporting 四阶段。
- 为每个 Case 保存可检查的阶段 artifacts。
- 生成可编译的 LaTeX。
- 编译出最终 PDF 论文。
- 记录人类反馈，为后续监督迭代提供样本。

第一个可用版本可以质量一般，但不能跳过 artifact 流转和报告编译。

## 文档入口

- [IDEA.md](IDEA.md)：项目思想和动机。
- [PLAN.md](PLAN.md)：当前 `v1.0.0` 执行计划。
- [HANDOFF.md](HANDOFF.md)：当前交接状态，供不同智能体接手项目。
- [docs/abstracted-design.md](docs/abstracted-design.md)：MM-Agent 架构与设计唯一权威依据。
- [docs/context/](docs/context/)：项目级协议（project-kernel、handoff-protocol）。
- [docs/reference/](docs/reference/)：一手参考资料（论文原文、解读、上游工程实现）。
- [docs/roadmap/v1.0.0.md](docs/roadmap/v1.0.0.md)：第一个可用版本的验收标准。
- [docs/README.md](docs/README.md)：`docs/` 内部分类说明。

## 项目结构

```text
mm-agent/
├── .archived/             # 历史资产；legacy-claude-codex-plugin (v0.2.0), legacy-pi-design (v1.0.0 on Pi)
├── README.md              # 项目入口
├── IDEA.md                # 项目思想：为什么做、反对什么、相信什么
├── PLAN.md                # 当前计划：v1.0.0 的近期执行目标
├── HANDOFF.md             # 当前交接状态，供不同智能体恢复现场
├── CHANGELOG.md           # 版本历史和迁移记录
├── CLAUDE.md              # Claude 系智能体入口，与 AGENTS.md 同步
├── AGENTS.md              # 通用智能体入口，与 CLAUDE.md 同步
├── docs/
│   ├── README.md          # docs 内部分类说明
│   ├── abstracted-design.md  # MM-Agent 架构与设计唯一权威依据
│   ├── context/           # 项目级协议（project-kernel, handoff-protocol）
│   ├── reference/         # 一手参考资料（MM-Agent 论文 PDF + 中文解读 + upstream 伴读）
│   │   └── upstream-prompts/  # 上游 LLM-MM-Agent 仓库保留的 prompt 套件
│   ├── research/          # 调研材料，不是当前项目真相
│   └── roadmap/           # 简短版本目标
├── knowledge/             # HMML 方法树 + 写作经验 + 比赛模板（待重组）
├── templates/             # LaTeX 报告模板（CUMCM, MCM-ICM）
├── tests/                 # 验证 fixtures
└── runs/                  # 运行期 Case 输出；仅 .gitkeep 入库
```

根目录只保留项目入口、活跃资产和归档入口。文档分类以 [docs/README.md](docs/README.md) 为准。

## 参考资料

- 理论支撑：[MM-Agent: LLM as Agents for Real-world Mathematical Modeling Problem](https://arxiv.org/abs/2505.14148)
- 官方实现参考：[LLM-MM-Agent](https://github.com/usail-hkust/LLM-MM-Agent)
- 上下文工作流参考：[GSD Core](https://github.com/open-gsd/gsd-core)

## 旧方向归档

历史资产按方向分两个归档区：

```text
.archived/legacy-claude-codex-plugin/   # 旧 Claude/Codex 插件实验（v0.2.0）
.archived/legacy-pi-design/             # 旧 Pi CLI Extension 协议（v1.0.0 on Pi，本次重构后归档）
```

这些内容用于回溯和迁移参考，不再作为活跃开发入口。