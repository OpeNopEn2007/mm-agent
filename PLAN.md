# PLAN

## 当前结论

`v1.0.0` 采用 Canonical Core + OpenCode Adapter。架构决策与协议设计已经接受；Step 1 至 Step 6 均已接受。当前边界不进入 Step 7 Golden Case。

唯一公开入口是 `/mm-agent`。首个真实目标 Case 是 MM-Bench `2024_C` Wimbledon Momentum；在此之前，各确定性模块必须先在本地最小 fixture 上留下可重复验证的证据。

## 固定边界

- 首个宿主是 OpenCode Plugin，不使用 Pi、Claude 或 Codex Plugin 作为活跃入口。
- npm 包名为 `@mm-agent/opencode`，包含显式 install/update/remove CLI 和 receipt。
- 主 Agent 使用 OpenCode built-in `task` 派发 5 个 hidden Agents：`mm-analyst`、`mm-modeler`、`mm-solver`、`mm-writer`、`mm-critic`。
- Skill 集固定为 `mm-agent`、`mm-hmml`、`mm-compute`、`mm-report`。
- Tool 集固定为 `mm_agent_check`、`mm_agent_prepare`、`mm_agent_case`、`mm_agent_hmml`、`mm_agent_compute`、`mm_agent_compile`。
- Canonical Core 的唯一规范是 `docs/architecture/canonical-core.md` 和 `docs/context/artifact-protocol.md`；Adapter 不得重写 Case schema、状态推进或 Context Manifest。
- Case 状态只由 `mm_agent_case gate` 推进；subagent 不得直接修改 `state.json` 或 stable artifacts。
- TypeScript 负责 Plugin、Case 和确定性 Tool 编排；Python 3.12 + uv 负责 HMML 与科学计算；TeX 是外部系统依赖。
- 不读取用户项目 `.venv`，不把模型 cache、Python 环境、Case 产物或用户数据提交到仓库。

完整产品机制见 [README.md](README.md)，Adapter 接口见 [docs/architecture/opencode-plugin-harness.md](docs/architecture/opencode-plugin-harness.md)。

## 验收含义

本文件只定义产品完成态和里程碑结果。项目工作规则由 `AGENTS.md` / `CLAUDE.md` 约束，当前工作状态由 `HANDOFF.md` 记录。

一个里程碑只有在以下事实同时成立时才算接受：

- 该里程碑的预期结果已经成为用户或后续模块可观察的真实能力，而不是局部代码、mock 结果或设计意图。
- 可观察交付全部存在，并符合 Canonical Core、Artifact 协议与 OpenCode Adapter 的职责边界。
- 验收证据直接支撑对应结论；真实 runtime 主张必须有真实进程证据，跳过、零匹配或仅 mock 的测试不算通过。
- 协议、安全、并发、迁移、数据完整性与失败恢复等高风险不变量有自动化回归证据。
- 完整相关测试、Build、受影响的真实 runtime gate、package/diff checks 均通过，已知限制与未覆盖边界被明确记录。

## v1 完成态

以下文件面描述 v1 完成时可观察到的产品结构，不代表文件必须按此顺序创建：

```text
package.json                         npm package、验证命令与管理 CLI
src/index.ts                         OpenCode Plugin 导出和 hooks
src/agents.ts                        hidden Agent 定义和权限
src/install.ts                       install/update/remove 与 receipt
src/core/                            CaseContextStore、schema、路径、迁移与 context recipes
src/tools/check.ts                   mm_agent_check
src/tools/prepare.ts                 mm_agent_prepare
src/tools/case.ts                    mm_agent_case
src/tools/hmml.ts                    mm_agent_hmml
src/tools/compute.ts                 mm_agent_compute
src/tools/compile.ts                 mm_agent_compile
skills/mm-agent/SKILL.md             唯一用户入口与主工作流
skills/mm-hmml/SKILL.md              方法检索规则
skills/mm-compute/SKILL.md           求解与复现规则
skills/mm-report/SKILL.md            报告和编译规则
runtime/pyproject.toml               Python 3.12 runtime 定义
runtime/uv.lock                      锁定 Python 依赖
runtime/hmml_*.py                    embedding、检索和离线评测
runtime/hmml-manifest.json           模型、revision、索引 hash 与 cache 策略
scripts/run-golden-case.mjs          最小与真实 Golden Case 运行器
tests/**                             Core、Tool、Adapter 与端到端证据
problems/.gitkeep                    默认用户输入目录
```

`knowledge/`、`prompts/`、`scripts/`、`servers/` 和 `templates/` 是迁移来源。只有与 v1 协议兼容且有验证证据的资产才能进入运行时；旧入口不得因复用资产而复活。

## 里程碑结果

| Step | 预期结果 | 状态 |
|------|----------|------|
| 1 | OpenCode 能真实加载、发现、派发和恢复最小 Plugin。 | 已接受：`315c319`、`ab56d42` |
| 2 | CaseContextStore 成为唯一 Case 状态、Context 和 Gate 协议实现。 | 已接受：`cfda6ea` |
| 3 | `/mm-agent` 能可靠判断环境是否可用，并从用户输入创建或恢复不可变 Case。 | 已接受：当前 acceptance HEAD |
| 4 | HMML 模型选择有数据依据，检索结果可追溯且有离线降级路径。 | 已完成：当前 acceptance commit |
| 5 | 计算与 LaTeX/PDF 编译产生可重放的 Runtime Evidence。 | 已完成：当前 acceptance commit |
| 6 | 四阶段 Agents、Skills 和 Tools 通过 Canonical Core 跑成真实工作流。 | 已接受：当前 acceptance commit |
| 7 | 最小 Case 与 MM-Bench 真实 Case 均能从输入闭环到非空 PDF，并可在新会话恢复。 | 待开始 |
| 8 | 发布包、文档、历史资产和最终验证证据一致。 | 待开始 |

### Step 1：OpenCode Plugin Spike

**已接受结果**

- npm 安装后的 Plugin 能被真实 OpenCode 加载。
- hidden Agent、只读 Tool 和 `/mm-agent` Skill 可发现，且不覆盖用户同名配置。
- built-in `task` 创建 fresh child session；新进程能从磁盘恢复测试 Case，不依赖 compaction。
- install/update/remove/reinstall 受 receipt 与 hash 约束，用户修改不会被静默覆盖或删除。
- Windows 路径、重启和 package allowlist 均有验证证据；临时 Spike Tool 已删除。

### Step 2：CaseContextStore 与文件契约

**已接受结果**

- `open / dispatch / gate / inspect` 是唯一公开 Core contract。
- `case.json`、`state.json`、`context.json`、`review.json`、Task Memory、Runtime Evidence 和 accepted artifact index 有运行时 schema。
- 输入、Rubric 与 Case Policy 不可变；未知 schema version 只允许显式 migration。
- Actor Attempt、Critic Review、promotion、revision budget、blocker、DAG/wave 和 completion evidence 符合 Canonical Core。
- Case-relative path、realpath/junction escape、CAS、跨 Store lock、durable Gate transaction、崩溃恢复和 TOCTOU 防护有自动化回归证据。
- 普通测试、Build、package allowlist、diff checks 与真实 OpenCode Adapter regression gate 通过；runtime gate 不被误称为 Core 直接调用证据。

### Step 3：Preflight 与输入整理

**已接受结果**

Step 3 完成后，用户运行 `/mm-agent` 即可在进入四阶段正文前得到可信、可行动的环境结论。有效输入成为可由新进程恢复的不可变 Case；已有兼容 Case 可以恢复；冲突输入不会覆盖既有事实；原始文件、用户项目环境与系统环境保持不变。

**可观察交付**

- `mm_agent_check` 对 Node/OpenCode、uv/Python、Case 写权限、HMML 索引/cache 和真实 TeX 模板编译返回结构化 `pass` / `warn` / `fail` 结果、证据与 `automatic` / `user` / `none` 修复分类。
- `mm_agent_prepare` 按显式路径优先、`problems/` 次之发现输入，并且只通过 `CaseContextStore.open` 固化输入副本、manifest、`case.json.policy` 与四份 Rubric 快照，不直接写入第二套 Case 状态。
- 同一 Case ID 在没有新 intake 参数时恢复已有兼容 Case；携带冲突输入或 Policy 的重复创建返回结构化冲突，不覆盖已有 Case。
- persisted facts 不保留可用于重新访问源文件的用户绝对路径。
- 用户只看到 `/mm-agent` 入口；环境缺口通过结构化结果表达，不新增 `/doctor` 或 `/setup`。

**验收证据**

- 用户源文件在成功、失败和重试路径中都不被修改。
- 空输入、无效 Case ID、冲突重复创建、缺失工具和不可写目录返回可行动的结构化错误。
- 本机 TeX 结论来自真实模板编译，不来自版本字符串。
- 没有测试或实现读取用户 `.venv`、修改系统 Python 或把依赖安装进用户项目。
- 新 Store 实例可以恢复 prepare 创建或复用的 Case，且输入 hash、Case Policy、Rubric 快照与初始状态保持一致。
- Step 3 相关测试、完整回归、Build、受影响的真实 OpenCode runtime gate、package allowlist 与 diff checks 全部通过。

**结果边界**

- Step 3 只报告 HMML index/cache 的当前状态和修复分类，不选择 embedding 模型、不构建最终索引，也不提前满足 Step 4。
- Step 3 不实现 HMML 检索、Compute/Compile、四阶段编排或 Golden Case。
- Step 3 的接受不代表本机所有依赖都已完善；例如缺失 Python 3.12 时，可信结果是 `fail + automatic` 并阻止正文，而不是把环境误报为可用。

### Step 4：HMML 检索评测与运行时

**预期结果**

项目只发布一个经离线评测选定的 embedding 方案；每次检索都能说明使用了什么知识源、模型/index revision、查询、候选和分数，模型不可用时仍能继续建模。

**可观察交付**

- 至少 30 个带可追溯相关标签的中英文查询；标签由两个独立强模型完整复核，任一 Important 问题均保守修正并由两者对新内容 hash 最终确认，诚实标记为 `ai-adjudicated` 并保留逐项复核、修改、模型/session 和内容 hash；以及 GTE 与 BGE-M3 的 Recall@5、MRR、冷启动、体积和延迟报告。
- 根据既定阈值选择唯一模型，并固定 Hugging Face revision、下载文件 hash、embedding 维度、索引 hash 和专用 cache。
- 唯一一致的 `(model, hmml-embeddings.npy, embedding-meta.json, method-index.json)` 四元组。
- `retrieved-methods.json` 记录知识源、query、retrieval mode、候选和 score；无模型时使用明确标记的 BM25/关键词降级模式。

**验收证据**

- 查询集、标签、汇总指标和逐查询结果完整且可复算。
- 选定模型能重建一致索引；meta、模型 hash 和 `.npy` 维度匹配。
- 无模型 cache 的离线环境不会阻塞建模阶段。

### Step 5：Compute 与 Compile

**已接受结果**

数学结果和最终 PDF 都由真实机器执行支撑；成功与失败均留下足够证据供 Gate 判断和人工复查。

**可观察交付**

- Compute 在 Case task 工作目录内执行受控 Python，记录命令、环境、stdout、stderr、exit code、timeout 和输出 hash。
- Compile 优先 `latexmk -xelatex`，回退多遍 `xelatex`，保留完整日志、结构化错误摘要和 PDF 路径。
- 检索、计算和编译 manifest 都能作为带 provenance/hash 的 Runtime Evidence 被 Gate 引用。
- Case 外工作目录、入口脚本和输出路径被拒绝。

- Compute 仅从当前 Solver Attempt 的 `code/` 目录运行 MM-Agent 专用 Python 3.12；成功、失败和超时都写入带命令、净化环境、stdout/stderr、exit/timeout、输入输出 hash 的 Evidence manifest，并由 `execution-result.json` 引用。
- Compile 仅从当前 Writer Attempt 编译 `main.tex`；每次清除旧 PDF，优先 `latexmk -xelatex`，其缺失、失败、超时或无非空 PDF 时以至多三遍 `xelatex` 回退，记录完整 `compile.log`、结构化错误、新 PDF hash 和 Runtime Evidence。
- Reporting `pass` 除原有非空 PDF 条件外，要求同一 Attempt 有成功且 hash 匹配的 Compile Runtime Evidence。

**验收证据**

- 成功与失败 Python fixture 均可重放。
- 成功与失败 TeX fixture 均产生预期 manifest/log。
- 没有非空 PDF 时 Compile 不返回成功；缺失 TeX 时返回人工修复结论而不是无限重试。
- Python 成功、失败、超时和 TeX 成功、失败、无 PDF fixture 均留下自动化证据；专用 Python/TeX 的真实运行单独 opt-in 执行。

### Step 6：Skills、Agents 与四阶段编排

**预期结果**

用户只通过 `/mm-agent` 即可驱动 Problem Analysis、Mathematical Modeling、Computational Solving 和 Solution Reporting；所有持久事实都经过 CaseContextStore Gate。

**可观察交付**

- 5 个 hidden Agents 具备清晰角色、最小权限和结构化输出约束；subagent 不嵌套委派。
- 4 个 Skills 分别承载主流程、HMML、计算和报告方法。
- `mm_agent_case` 将 Adapter 直接映射到 `open / dispatch / gate / inspect`，不产生第二套状态或路径协议。
- Actor 与 fresh Critic 复用同一 Attempt Manifest；Solver 按 DAG 读取当前 task、accepted modeling scheme 和直接依赖 Task Memory。
- Writer 只消费 accepted artifacts，并通过 Compile/Gate 生成报告候选。

**验收证据**

- 每个 Role 都能在临时 Case 中只读取 Manifest 声明的事实并只写 allowed paths。
- Critic 无项目写权限；失败 Candidate 不进入 accepted index。
- 每个 Task Memory 包含任务描述、建模方法、结果解释、执行结果、代码输出和图表字段。
- Adapter 不把宿主聊天当作 Case 状态，也不允许 Role 绕过 Gate 写 stable artifacts。

### Step 7：Golden Case

**预期结果**

最小 fixture、multi-wave fixture 和获准使用的 MM-Bench `2024_C` 都能从输入运行到可编译 LaTeX 与非空 PDF；新 OpenCode 会话无需前序聊天即可恢复并确认完成。

**可观察交付**

- minimal、multi-wave 和真实赛题 fixtures；真实赛题附 source、retrieval date、license 和 redistribution 说明。
- 可重复运行的 Golden Case runner 与端到端测试。
- 四阶段 accepted artifacts、计算代码、Runtime Evidence、`report/main.tex`、`report/compile.log` 和非空 `report/report.pdf`。
- 人类反馈保存在 Case 内，不改写当前 accepted facts；只有显式列入新 Case 输入时才能被后续读取。

**验收证据**

- task code 可重新执行，报告可重新编译。
- `inspect` 在新进程中从磁盘推导完整 completion evidence。
- 旧 v0 Python 测试及其 Claude/`.planning/` 假设已删除或归档，不再影响 v1 gate。

### Step 8：发布与交接

**预期结果**

发布包、安装说明、Canonical Core、Adapter 文档、当前状态和历史边界一致；任何新智能体都能仅依靠仓库文件恢复项目。

**可观察交付**

- README、架构、协议、roadmap、CHANGELOG、AGENTS/CLAUDE 和 HANDOFF 描述同一真实实现面。
- package allowlist 只包含发布所需的 Plugin、Skills、Agents/rubrics、runtime、单一 HMML 索引、模板和 schemas。
- 旧 `templates/report-generator.py`、`servers/hmml-server/`、根 `requirements.txt`、旧脚本和活跃 Claude `.mcp.json` 已删除或归档，并有明确替代证据。
- 安装、更新、卸载、cache、模型下载、TeX preflight 和故障排查说明可执行。

**验收证据**

- `npm test` 与 `npm run build` 通过。
- `npm run test:runtime` 继续执行真实 OpenCode Adapter gate；Python runtime 测试独立执行 `uv run --project runtime pytest`，不得覆盖 OpenCode runtime script。
- minimal 与 MM-Bench Golden Case 命令均通过并生成非空 PDF。
- `npm pack --dry-run --json`、`git diff --check` 和 package forbidden-path 检查通过。
- `git diff --no-index AGENTS.md CLAUDE.md` 返回 0。
- 活跃文件不再把 Pi、旧 Plugin、`${CLAUDE_PLUGIN_ROOT}` 或 `.planning/` 描述为当前入口；搜索排除 `.archived/` 与 `.git/`。
- `git status --short` 只包含当前里程碑的预期文件，任何无关用户改动均被保留并记录。

## 非目标

- 在第一个闭环前支持第二个 Agent 宿主。
- 训练模型权重、建设 Web UI 或自定义 TUI。
- 捆绑 TeX 发行版或 embedding 模型权重。
- 用数据库、MCP memory server 或隐藏会话状态替代 Case 文件。
- 恢复归档中的 Claude/Codex Plugin、Pi CLI Extension 或 Superpowers 工作流。

## 后续协议演进候选

- 可考虑采用 Git 风格的内容寻址标识：Artifact、Runtime Evidence、索引和不可变 manifest 持久保存完整 SHA-256，对用户只展示当前范围内足够唯一的短前缀；独立运行事件仍使用 ULID、UUID 或包含随机 nonce 的标识，避免相同内容合并为同一次运行。
- `case_id`、`task_id` 和 `attempt_id` 继续保持当前可读语义。若未来要把哈希标识纳入已接受的 Case schema、路径或引用协议，必须设计显式 schema migration，不在 Step 7 Golden Case 中顺带改写。

## 当前里程碑

Step 1 至 Step 6 已接受；41 条典型方法查询只保留为 `proposed` smoke regression，正式选型使用 80 条 `ai-adjudicated` 数据集。当前停止，不进入 Step 7 Golden Case。
