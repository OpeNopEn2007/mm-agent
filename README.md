# mm-agent

`mm-agent` 是一个面向数学建模的本地 Agent Harness。你把题目和数据交给 OpenCode，它组织五种角色完成分析、建模、计算、写作和审查，最后留下可审计的 Case artifacts、可编译 LaTeX、编译日志和 PDF 论文。

```text
题目与数据
  → Analyst
  → Modeler + HMML
  → Solver DAG + Compute
  → Writer + Compile
  → Critic / Gate
  → PDF
```

当前 v1 版本的唯一宿主是 OpenCode；长期可复用的核心是与宿主无关的 [Canonical Core](docs/architecture/canonical-core.md)。

## 为什么做这个项目

复杂建模任务很容易退化成一段看似完整、却无法复算或恢复的聊天。`mm-agent` 把最终论文当作产品，把中间成果当作接口：

- 阶段事实写进文件，不依赖上一段聊天。
- Actor 产生 candidate，Critic 审查，只有 Gate 能提升 artifact 和推进状态。
- Solver 按 DAG 工作，只读取当前任务和直接依赖的 Task Memory。
- 模型负责理解、选择和表达；Python、TeX 与 Tool 负责可重复的计算、编译和校验。
- Compute/Compile Evidence 保存路径、状态和 SHA-256，证明结论对应当前文件。
- timeout、revision budget、compare-and-swap 和 resume 让长流程可以停、查、修、接。

所以一次运行不是“五个 Agent 聊完了”，而是一份可以从磁盘检查、恢复和复验的 Case。

## Quick Start

### 前置依赖

- [OpenCode](https://opencode.ai/)——开发时使用版本为 `1.18.x`。
- Node.js 与 npm——建议使用满足依赖 engine 声明的 Node `^22.22.2`、`^24.15.0` 或 `>=26`；本机 Node `24.8.0` 已通过 RC 全部验收，但 npm 会提示非阻塞的 `ini@7` engine warning。
- [uv](https://docs.astral.sh/uv/)——`mm-agent` 使用隔离的 Python 3.12 runtime。
- XeLaTeX——`latexmk` 可选，缺失时会回退到多遍 `xelatex`。
- 已在 OpenCode 中配置、可支付长流程调用的模型 provider。

先确认命令来自你预期的安装位置：

```powershell
opencode --version
node --version
uv --version
xelatex --version
```

### 安装

正式发布后，预期安装方式是：

```powershell
npm install @mm-agent/opencode
```

在 npm publish 前，这条命令不可用。请使用仓库源码或本地 `.tgz` RC：

```powershell
npm install E:\path\to\mm-agent-opencode-1.0.0.tgz
New-Item -ItemType Directory -Force .opencode\plugins, .opencode\skills | Out-Null
Set-Content .opencode\plugins\mm-agent.js 'export { default } from "../../node_modules/@mm-agent/opencode/dist/index.js"'
Copy-Item node_modules\@mm-agent\opencode\skills\* .opencode\skills -Recurse -Force
```

这是 OpenCode 原生的项目级发现方式：Plugin 位于 `.opencode/plugins/`，Skills 位于 `.opencode/skills/<name>/SKILL.md`。它不会修改用户全局 OpenCode 配置。

若从本仓库开发：

```powershell
npm ci
npm run build
npm pack
```

然后在实际题目项目中安装生成的 `.tgz`，不要让题目项目读取源码仓库内部路径。

### 跑一道题

在独立题目项目中：

```text
your-project/
├── .opencode/
│   ├── plugins/mm-agent.js
│   └── skills/
├── problems/
│   ├── problem.md
│   └── data.csv
└── .gitignore
```

1. 把题目和附件放入 `problems/`。
2. 在这个项目目录启动 `opencode`。
3. 执行 `/mm-agent`。
4. 检查 preflight 与输入快照，确认后让工作流继续。
5. 在 `runs/<case-id>/report/report.pdf` 查看论文。

中断后仍在同一项目执行 `/mm-agent`。Skill 会先检查已有 Case，并根据 `state.json`、accepted artifacts 和 active Attempt 恢复；不要复制旧聊天来“续跑”。

## OpenCode 中注册了什么

这些角色不是五个常驻进程。每次 Attempt 都由 OpenCode built-in `task` 创建 fresh child session，完成后以 Case 文件交接。

### Hidden Agents

| Agent        | 职责                         | 允许的专用 Tool    |
| ------------ | ---------------------------- | ------------------ |
| `mm-analyst` | 理解题目、拆分任务 DAG       | 无                 |
| `mm-modeler` | 选择方法、建立模型           | `mm_agent_hmml`    |
| `mm-solver`  | 执行当前 DAG task            | `mm_agent_compute` |
| `mm-writer`  | 写作并编译论文               | `mm_agent_compile` |
| `mm-critic`  | 按 Rubric 只读审查 candidate | 无写入 Tool        |

Critic 不写 Candidate、不调用 Gate。它只返回结构化 Review，避免“审查者顺手修掉自己要审的内容”。

### Tools

| Tool               | 作用                                         |
| ------------------ | -------------------------------------------- |
| `mm_agent_check`   | 检查 OpenCode、Python、HMML、Case 存储和 TeX |
| `mm_agent_prepare` | 发现输入并创建或恢复 Case                    |
| `mm_agent_case`    | `open / dispatch / gate / inspect`           |
| `mm_agent_hmml`    | 检索数学建模方法知识                         |
| `mm_agent_compute` | 在受控 Python runtime 中执行和记录计算       |
| `mm_agent_compile` | 编译 LaTeX 并记录 Compile Evidence           |

`mm_agent_case gate` 是唯一状态推进入口。它校验 Review、revision、hash、promotion 白名单和当前 Attempt，Agent 不能直接改 `state.json` 冒充完成。

### Skills 与宿主 Hook

| Skill        | 作用                       |
| ------------ | -------------------------- |
| `mm-agent`   | 唯一用户入口与四阶段工作流 |
| `mm-hmml`    | 方法检索规则               |
| `mm-compute` | 计算、输出和 Evidence 规则 |
| `mm-report`  | 报告与编译规则             |

Plugin 的 config hook 注入 hidden Agents，Tool registry 注册六个 Tool，OpenCode 负责 Skill discovery。compaction hook 只提示 active Case 路径；恢复正确性仍来自磁盘，而不是压缩后的聊天摘要。

```text
OpenCode
├── /mm-agent Skill
├── built-in task ── fresh hidden Agent
└── @mm-agent/opencode Plugin
    ├── Agent definitions
    ├── six deterministic Tools
    └── CaseContextStore ── Canonical Core
```

## 工作流如何落盘

四个阶段固定为：

1. Problem Analysis
2. Mathematical Modeling
3. Computational Solving
4. Solution Reporting

一次 Case 的核心结构如下：

```text
runs/<case-id>/
├── case.json
├── state.json
├── input/
│   ├── files/
│   └── policy/
├── artifacts/                  # accepted stage artifacts
├── tasks/<task-id>/memory.json # accepted Task Memory
├── attempts/
│   └── <scope>/<sequence>/      # solving 在 scope 下再含 task-id
│       ├── context.json        # 当前 Attempt Manifest
│       ├── review.json
│       └── evidence/
└── report/
    ├── main.tex
    ├── compile.log
    └── report.pdf
```

Candidate 先写入 Attempt；`pass` 后 Gate 才把它提升到稳定 artifact 路径。Review 复用同一 Manifest。Runtime Evidence 记录确定性工具的命令、输入/输出和 hash。`inspect` 从这些磁盘事实推导 completion，不在 `state.json` 再维护一份容易漂移的“完成证据”。

字段级 schema、路径白名单和 transaction 语义请直接看：

- [Canonical Core](docs/architecture/canonical-core.md)
- [Artifact Protocol](docs/context/artifact-protocol.md)
- [OpenCode Adapter](docs/architecture/opencode-plugin-harness.md)
- [Paper Alignment](docs/architecture/paper-alignment.md)

## 项目布局

```text
src/                    TypeScript Plugin、Tools 与 Canonical Core 实现
skills/                 四个可安装 Skills
rubrics/                四阶段 Critic 验收标准
runtime/                Python 3.12 HMML/Compute runtime
knowledge/hmml/         HMML catalog 与唯一 GTE 索引
templates/              CUMCMThesis 与 mcmthesis 模板
schemas/                Canonical JSON Schemas
scripts/                构建期和 Golden Case 验证工具
tests/                  确定性回归与 host/runtime gates
docs/                   协议、架构、路线图和研究来源
```

源码、Skills、rubrics、schemas 和必要模板属于 Git。用户题目、Case、trace、下载的模型 cache、Python 环境、MM-Bench 输入和 provider 凭据必须留在仓库外。npm 包也不包含 tests、Golden runner、benchmark 输入或模型权重。

## 恢复与常见故障

- Provider 认证、余额或服务失败：停止并处理外部原因，不盲目重跑。
- Python/HMML 失败：先看 `mm_agent_check` 的 evidence；不要读取题目项目的 `.venv` 代替 MM-Agent runtime。
- TeX 失败：看当前 Writer Attempt 的 Compile Evidence 与 `compile.log`。
- Windows 外层 timeout：先确认原 OpenCode/runner PID 是否仍活跃，再决定等待或 resume；不得并发启动第二个 runner。
- 协议失败：沿 Actor completeness → Runtime Evidence → Critic Review → Core Gate → Compile 找第一个失败边界，只修该边界。
- resume：已接受阶段不会重派；active Attempt 根据当前 Manifest 继续。

## 验证状态

Step 7 已完成：

- Gate A：minimal，验证最小四阶段闭环。
- Gate B：multi-wave，验证 Solver wave、直接依赖 memory 和串行 Gate。
- Gate C：MM-Bench `2024_C`，验证真实 figures、coach tests、held-out metrics、编译论文和 fresh recovery。

Step 8 已从外部解包后的 RC 重新执行 A/B/C，并对每个 completed Case 做 fresh recovery、Evidence/hash 核对和 PDF 逐页目检。`1.0.0` 仍是 unpublished local RC，不是 npm publish 或公开再分发承诺；公开发布前仍需解决第三方 notices 中未明确授权的资产。

开发者可运行：

```powershell
npm ci
npm test
npm run build
npm run validate-config
npm run test:runtime
uv run --project runtime pytest
npm pack --dry-run --json
```

> v1 不建设第二宿主、Web UI、自定义 TUI，也不训练或捆绑模型权重。

## 改造成你自己的 Harness

欢迎 fork 本项目，把它改造成面向科研、数据分析、工程设计、竞赛或其他复杂任务的专用 Harness。这个项目的目标不是规定唯一的 Agent 组织方式，而是提供一套可以拆解、替换和继续演化的工程基础。

你可以：

- 替换角色分工、prompt 和 Skills。
- 增减 Tool，或接入自己的本地业务工具。
- 调整 Rubric、revision budget 和 Gate 标准。
- 替换 HMML 知识库、检索器或 embedding 模型。
- 更换论文模板，甚至换成完全不同的最终产物。
- 编写第二个 Adapter，同时保留 Canonical Core。

> 若改变已经落盘的 Case 结构，请增加显式 schema migration；不要让新代码静默猜测旧数据。

## 参考资料与致谢

### 理论来源

- [MM-Agent: LLM-based Multi-Agent Systems for Mathematical Modeling](https://arxiv.org/abs/2505.14148)
- [LLM-MM-Agent reference implementation](https://github.com/usail-hkust/LLM-MM-Agent)
- [Alibaba-NLP/gte-multilingual-base](https://huggingface.co/Alibaba-NLP/gte-multilingual-base)

### 工程参考

- [OpenCode](https://github.com/anomalyco/opencode)
- [OpenCode Plugins](https://opencode.ai/docs/plugins/)
- [OpenCode Agent Skills](https://opencode.ai/docs/skills/)
- [GSD Core](https://github.com/open-gsd/gsd-core)

### 第三方资产

- [CUMCMThesis](https://github.com/latexstudio/CUMCMThesis)
- [mcmthesis](https://github.com/latexstudio-org/mcmthesis)
- [Third-Party Notices](THIRD_PARTY_NOTICES.md)

### 项目文档

- [IDEA：项目为什么存在](IDEA.md)
- [文档导航](docs/README.md)
- [v1.0.0 Roadmap](docs/roadmap/v1.0.0.md)

> 以上引用说明设计来源或工程参考，不代表任何上游项目对 `mm-agent` 的官方隶属、合作或背书。
