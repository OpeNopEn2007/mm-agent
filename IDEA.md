# IDEA

## mm-agent 的具象哲学

这个项目存在，是因为数学建模不只是推理。它是一门完整的工程手艺：

- 读懂一个开放式赛题
- 从混乱文本和数据里找到真正结构
- 选择经得起批评的假设
- 建立可以计算的模型
- 把结果写成一篇可以被评判的论文

论文不是产品。最终报告才是产品。

`mm-agent` 要做的，是让这门手艺变得可运行、可检查、可改进。

## 为什么做这个项目

MM-Agent 论文给出了一个强有力的形状：四阶段流程、HMML 检索、Actor-Critic 优化、任务 memory、计算求解、报告生成。但理论本身还不够。一个真正有用的本地智能体系统，需要一个 Harness：它让每个阶段跑起来，让每个中间产物留下来，让人类反馈进入系统，并让系统通过一个个 Case 逐渐变好。

目标不是膜拜论文，而是把论文转化成一个能承受真实赛题冲击的工程系统。

## 这个项目反对什么

这个项目反对不透明的舒适。

Claude Code、Codex 以及类似智能体环境都很有价值，但它们的 Harness 同样会塑造使用者。计划假设、工具路由、memory 策略、失败模式，都被藏在一个打磨好的表面后面。方便是真的方便，但当开发者想控制系统本身时，这种方便会变成限制。

`mm-agent` 不应该被锁在某个厂商对“Agent 应该如何协作”的想象里。真正的价值应该沉淀在项目自身：

- artifact 协议
- 阶段边界
- 反馈回路
- Case memory
- 报告生成纪律

Harness 应该服务项目，而不是成为项目。

## 为什么选择 OpenCode Adapter

`v1.0.0` 的 Adapter 是 OpenCode Plugin。OpenCode 提供了 v1 所需的宿主能力：Plugin、原生 Tool、Agent 配置、Skill 发现和隔离的 `task` session。它承担模型会话与通用文件工具，`mm-agent` 则保留数学建模方法、Case 状态、artifact 协议和报告纪律。

这个选择不把产品锁死在 OpenCode。项目的长期价值存在 Canonical Core：`runs/<case-id>/` 中的 Case、artifact、context manifest、review 和 gate 协议。OpenCode 只是第一个 Adapter，不是系统事实的唯一存放处。Canonical Core 由 [docs/architecture/canonical-core.md](docs/architecture/canonical-core.md) 与 [docs/context/artifact-protocol.md](docs/context/artifact-protocol.md) 定义，不依赖任何宿主。

Pi CLI Extension 一度是 `Unreleased` 中考虑的运行底座；该方向在 `4ce82cd`（Canonical Core 提交）后结束，资产进入 `.archived/legacy-claude-codex-plugin/`。Pi 不再是活跃 runtime 决策。

重点不是建设另一套 Agent runtime。重点是使用足够开放的宿主，把项目自己的工作流、可恢复状态和验收标准落到本地文件中。

## 报告是唯一最终产物

在数学建模里，过程日志不是提交物。一堆中间推理不是成果。唯一最终 artifact，是一篇可以编译、可以阅读、可以评价、可以提交的论文。

因此 `v1.0.0` 必须以这些内容结束：

- LaTeX 源文件
- 成功编译日志
- PDF 报告
- 支撑报告的阶段 artifacts

如果 PDF 不存在，闭环就没有完成。

## 监督迭代，而不是盲目自动化

人类反馈不应该只是“好”或“坏”。它应该成为 Harness 的训练信号。

在 `1.x` 中，这不意味着训练模型权重，而是调整系统可控参数：

- prompts
- rubrics
- artifact schemas
- retrieval weights
- critic standards
- retry budgets
- report templates
- phase-level acceptance checks

人类对 Case 给出反馈。Harness 应该逐渐学会判断到底是哪个阶段、哪个 artifact、哪个参数导致失败，然后把自己往收敛方向调整。

## 工程品味

这个项目应该是克制而有意图的。

- 文档更少，边界更强。
- 每个 artifact 都有明确职责。
- 运行产物不污染项目上下文。
- Research 是证据，不是命令。
- 项目真相存在文件里，而不是私人聊天记忆里。
- 任何有能力的 Agent 打开仓库，都应该能理解系统正在做什么。

目标不是一个聪明的 Demo，而是一个小而纪律严明的本地系统：它反复把混乱的数学建模赛题变成真实论文，并且因为人类持续监督而变得更好。
