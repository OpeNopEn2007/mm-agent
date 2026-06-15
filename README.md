# mm-agent

基于 Pi CLI Extension 的数学建模 MM-Agent Harness。

`mm-agent` 试图把 MM-Agent 论文中的数学建模多智能体框架，变成本地可运行、可检查、可反馈、可迭代的工程系统。

```text
赛题输入 -> MM-Agent 四阶段工作流 -> 可编译 LaTeX -> PDF 论文
```

## 状态

当前主线从 `v1.0.0` 开始重建。

- `v0.2.0` 是旧 Claude/Codex 插件方向的最终快照。
- `v1.0.0` 目标是基于 Pi CLI Extension 跑通论文四阶段闭环。
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
- [docs/context/](docs/context/)：项目上下文、artifact 协议和监督反馈规则。
- [docs/architecture/](docs/architecture/)：Pi Harness 设计、论文对齐和参考工程取舍。
- [docs/roadmap/v1.0.0.md](docs/roadmap/v1.0.0.md)：第一个可用版本的验收标准。
- [docs/README.md](docs/README.md)：`docs/` 内部分类说明。

## 项目结构

```text
mm-agent/
├── .gitignore             # 忽略缓存、构建产物和运行期 Case 输出
├── .mcp.json              # 项目级 MCP 配置，当前作为可迁移资产保留
├── .archived/             # 历史资产，可回溯但不参与活跃开发
├── README.md              # 项目入口
├── IDEA.md                # 项目思想：为什么做、反对什么、相信什么
├── PLAN.md                # 当前计划：v1.0.0 的近期执行目标
├── HANDOFF.md             # 当前交接状态，供不同智能体恢复现场
├── CHANGELOG.md           # 版本历史和迁移记录
├── CLAUDE.md              # Claude 系智能体入口，与 AGENTS.md 同步
├── AGENTS.md              # 通用智能体入口，与 CLAUDE.md 同步
├── requirements.txt       # 当前 Python 依赖记录
├── docs/
│   ├── README.md          # docs 内部分类说明
│   ├── context/           # 项目级上下文协议、artifact 和反馈规则
│   ├── architecture/      # Pi Harness、论文对齐、参考工程取舍
│   ├── roadmap/           # 简短版本目标
│   ├── research/          # 调研材料，不是当前项目真相
│   └── reference/         # 一手参考资料，尤其是 MM-Agent 论文
├── knowledge/             # HMML 和数学建模知识资产
├── prompts/               # prompt 资产
├── scripts/               # DAG、HMML、memory 等本地工具
├── servers/               # 可复用的工具/服务实验
├── templates/             # LaTeX 报告模板和报告生成资产
├── tests/                 # 现有验证 fixtures，后续按 v1.0.0 对齐
└── runs/                  # 运行期 Case 输出；仅 .gitkeep 入库
```

根目录只保留项目入口、活跃资产和归档入口。文档分类以 [docs/README.md](docs/README.md) 为准。

## 参考资料

- 理论支撑：[MM-Agent: LLM as Agents for Real-world Mathematical Modeling Problem](https://arxiv.org/abs/2505.14148)
- 官方实现参考：[LLM-MM-Agent](https://github.com/usail-hkust/LLM-MM-Agent)
- 上下文工作流参考：[GSD Core](https://github.com/open-gsd/gsd-core)

## 旧方向归档

旧 Claude/Codex 插件实验资产保存在：

```text
.archived/legacy-claude-codex-plugin/
```

这些内容用于回溯和迁移参考，不再作为活跃开发入口。
