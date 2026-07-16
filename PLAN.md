# PLAN

## 当前阶段

`v1.0.0` 采用 Canonical Core + OpenCode Adapter。架构决策、协议设计和第 1 步 OpenCode Plugin Spike 已完成；下一步按下面的切口实现 CaseContextStore，并继续推进第一个输入到 PDF 闭环。

唯一公开入口是 `/mm-agent`。首个目标 Case 是 MM-Bench `2024_C` Wimbledon Momentum，但先用本地最小 fixture 验证每个确定性模块。

## 已确定的决策

- 首个宿主是 OpenCode Plugin，不使用 Pi、Claude 或 Codex Plugin 作为活跃入口。
- npm 包名为 `@mm-agent/opencode`，包含显式 install/update/remove CLI 和 receipt。
- 主 Agent 使用 OpenCode built-in `task` 派发 5 个 hidden Agents：`mm-analyst`、`mm-modeler`、`mm-solver`、`mm-writer`、`mm-critic`。
- Skill 集固定为 `mm-agent`、`mm-hmml`、`mm-compute`、`mm-report`。
- 自定义 Tool 集固定为 `mm_agent_check`、`mm_agent_prepare`、`mm_agent_case`、`mm_agent_hmml`、`mm_agent_compute`、`mm_agent_compile`。
- Subagent 每次使用 fresh context。`state.json`、accepted artifacts 和每个 attempt 的 `context.json` 组成可恢复的本地上下文。
- Case 状态只由 `mm_agent_case gate` 推进；subagent 不得写 `state.json`。
- TypeScript 负责 Plugin 和 Case 协议；Python 3.12 + uv 负责 HMML 和科学计算；TeX 是外部系统依赖。
- HMML 在 GTE 与 BGE-M3 小评测后只选择一个模型；下载模型和 TeX 发行版都不随包捆绑。
- Canonical Core 的唯一规范是 `docs/architecture/canonical-core.md` 和 `docs/context/artifact-protocol.md`；Adapter 不得重新定义 Case schema、状态推进或 Context Manifest。

完整机制说明在 [README.md](README.md)。实现接口在 [docs/architecture/opencode-plugin-harness.md](docs/architecture/opencode-plugin-harness.md)。

## 目标文件布局

以下是实现完成后的活跃文件面。Step 1 已创建 package、`src/index.ts`、`src/agents.ts`、`src/install.ts`、最小 `skills/mm-agent/` 和 Spike 测试；其余 `src/`、Skills、`runtime/`、`problems/` 和测试文件必须在对应任务中创建。

```text
package.json                         npm package、Plugin 与管理 CLI
tsconfig.json                        TypeScript 编译配置
src/index.ts                         OpenCode Plugin 导出和 hooks
src/core/case-context-store.ts       open/dispatch/gate/inspect 深模块
src/core/schema.ts                   Case、state、context、review schema
src/core/paths.ts                    Case 内相对路径、hash、原子写入
src/core/context-recipes.ts          五个角色的 context 选择规则
src/core/case-policy.ts              固化 Rubric 与 revision budget 的 Case Policy
src/core/migrations.ts               显式、版本化的 Case schema migration
src/tools/check.ts                   mm_agent_check
src/tools/prepare.ts                 mm_agent_prepare
src/tools/case.ts                    mm_agent_case
src/tools/hmml.ts                    mm_agent_hmml
src/tools/compute.ts                 mm_agent_compute
src/tools/compile.ts                 mm_agent_compile
src/agents.ts                        hidden Agent 定义和权限
src/install.ts                       install/update/remove 与 receipt
skills/mm-agent/SKILL.md             主工作流
skills/mm-hmml/SKILL.md              方法检索规则
skills/mm-compute/SKILL.md           求解与复现规则
skills/mm-report/SKILL.md            报告和编译规则
runtime/pyproject.toml               Python 3.12 runtime 定义
runtime/uv.lock                      锁定 Python 依赖
runtime/hmml_*.py                    embedding、检索和离线评测 helper
runtime/hmml-manifest.json           选定模型、revision、索引 hash 与 cache 策略
scripts/run-golden-case.mjs          最小 Case 与 MM-Bench Golden Case 运行器
tests/**/*.test.ts                   Core、Tool、Plugin 与安装器测试
tests/fixtures/**                    最小赛题、DAG、HMML 查询和 TeX fixture
problems/.gitkeep                    默认用户输入目录
```

内部模块固定为五个：Environment/Intake（`check.ts`、`prepare.ts`）、CaseContextStore（`core/` 与 `case.ts`）、HMML（`hmml.ts` 与 `runtime/hmml_*.py`）、Compute（`compute.ts`）和 Compile（`compile.ts`）。Tool 只封装这些确定性模块；阶段编排留在主 Agent 与 Skill。

已有 `scripts/`、`prompts/`、`knowledge/` 和 `templates/` 是迁移来源，不是新 runtime 的默认接口。实现时只复用经过测试且与 v1 协议兼容的部分。`templates/cumcmthesis/` 与 `templates/mcmthesis/` 保留为 v1 的编译模板；旧 `templates/report-generator.py`、`servers/hmml-server/`、根 `requirements.txt`、旧 Python smoke/MMBench 验证和旧 `.mcp.json` 在第 7 或第 8 步删除或归档。

## 实施顺序

### 1. OpenCode Plugin Spike

**目标**：先验证宿主假设，不在猜测的 Plugin 行为上建设完整系统。

**创建**：`package.json`、`tsconfig.json`、`src/index.ts`、`src/agents.ts`、`src/tools/spike.ts`、`src/install.ts`、`tests/plugin-spike.test.ts`。

**实现**：

1. 定义最小 ESM TypeScript Plugin。
2. 在 `package.json` 定义 `test`、`build`、`test:runtime` 和 `golden` scripts，分别成为第 8 步的固定验证命令。
3. 用 `config` hook 注入一个测试 hidden Agent，确认不会覆盖用户同名配置。
4. 注册一个只读 Tool，返回 OpenCode 提供的 `directory`、`worktree` 和路径解析结果。
5. 创建安装器，将一个最小 `mm-agent` Skill 安装到 OpenCode 可扫描目录并写 receipt。
6. 定义 npm package `files` 清单：编译 Plugin、管理 CLI、4 Skills、5 Agent/rubric 资产、Python runtime/lockfile、HMML 只读源和单一预计算索引、报告模板、receipt schema。
7. receipt 至少记录 package、version、plugin entry、installed skills 和每个已安装文件的 path/SHA-256。
8. update 先比较 receipt 与磁盘 hash；用户修改过的文件必须报告冲突，不得静默覆盖。remove 只删除 receipt 拥有且 hash 仍匹配的文件。
9. compaction hook 只注入 active Case/state 路径提示；不能参与恢复正确性。Spike 结束后删除 `src/tools/spike.ts`，保留测试。

**通过条件**：

- npm 安装后的 Plugin 可以加载。
- Agent 注入、Tool 调用和 `/mm-agent` Skill 发现都通过。
- built-in `task` 创建 fresh child session，child 能读取项目内测试 `context.json`。
- fresh install、update、remove、reinstall 均通过；修改过的 Skill 不会被 update 或 remove 静默覆盖。
- Windows 路径、OpenCode 重启、更新和卸载都通过。
- compaction 关闭或不可用时，新会话仍可通过本地 Case state 恢复。

### 2. CaseContextStore 与文件契约

**目标**：建立唯一的 Case 状态和 context 机制，之后的所有 Tool 都调用它。

**创建**：`src/core/schema.ts`、`src/core/paths.ts`、`src/core/context-recipes.ts`、`src/core/case-context-store.ts`、`tests/core/case-context-store.test.ts`、`tests/fixtures/cases/`。

**实现**：

1. 定义 `case.json`、`state.json`、`context.json`、`review.json`、task memory、Runtime Evidence 和 accepted artifact index schema，路径一律以 Case 根目录为基准；`state.stage` 只能为 analysis/modeling/solving/reporting，`state.status` 只能为 prepared/running/blocked/failed/completed，`current_wave` 只在 Solving 从 1 开始。
2. `open` 固化输入副本、四份 Rubric 快照及其 hash，并把 `case.json.policy` 写入 analysis/modeling/solving-per-task/reporting revision budget；未知 `schema_version` 必须拒绝并要求显式迁移。`src/core/migrations.ts` 只暴露版本化的 `migrateCase(caseRoot, fromVersion, toVersion)`，Role 不得原地修改 schema。
3. 以 `open / dispatch / gate / inspect` 实现 `CaseContextStore`。`dispatch` 生成白名单 scope 和三位序号 attempt ID；同 scope 存在 active Attempt 时拒绝第二次 dispatch。`inspect` 将“active”定义为存在 `context.json` 且尚未拥有有效 `review.json` 的 attempt 目录。
4. Manifest 必须记录 `base_revision`、required reads、allowed writes、expected outputs、promotions、review rubric 和可选 `resolves_blocker`。Critic 从同一 Manifest 的 review section/expected outputs/rubric 重建 fresh context，不创建第二个 Attempt。
5. Gate 以 `expected_revision` 执行 compare-and-swap，并验证每个 required read hash 仍对应输入快照、Runtime Evidence 或 accepted artifact；验证 promotion target 位于当前 scope 白名单：analysis 只能提升 `artifacts/problem-understanding.md`、`tasks.json`、`task-graph.json`；modeling 只能提升 `artifacts/modeling-scheme.md` 与任务级检索/建模 artifact；solving/<task-id> 只能提升 `tasks/<task-id>/{code,figures,execution-result,memory}`；reporting 只能提升 `report/{outline,notation,main.tex,compile.log,report.pdf}`。
6. 实现 append-only blocker `{id, scope, attempt_id, reason, created_at, resolved_at}`：`block` 保留 stage/wave、设为 blocked；同 wave 无依赖 sibling 可以继续 gate，但 wave 不能前进；只有同 scope Actor Attempt 可通过 `resolves_blocker` 解决 blocker。
7. Gate 按完成 artifact 推进 `analysis -> modeling -> solving(current_wave=1) -> reporting(current_wave=null) -> completed`，并在 Modeling Gate 创建每个 Task 的 solving budget。`revise` 在预算耗尽时设为 failed。
8. `inspect` 从当前文件和完成规则计算 completion evidence，不写第二份完成 flag；state 使用临时文件和原子替换。

**通过条件**：

- 测试覆盖 Case-root-relative path、`..`/symlink escape、未知 schema version、版本化 migration、缺失 artifact、无效 review、scope 白名单、attempt ID、由 context/review 推导的 active Attempt、第二 active Attempt 和每个 promotion target 白名单。
- DAG 测试覆盖唯一 Task ID、依赖引用存在、无环、当前 wave 的依赖已经 accepted。
- 两个并发 Gate 使用同一 expected revision 时，只有一个成功；并行 Solver 基于相同 base revision 时，依靠 read-set hash 安全串行 Gate。
- pass/revise/block、预算耗尽 failed、blocker 解决、四个 Stage 转换和 completion evidence 均有测试。
- 每个 Solving Task 有独立 revision budget；新 Store 实例可以从现有 `state.json` 恢复。

### 3. Preflight 与输入整理

**目标**：让 `/mm-agent` 能安全建立或恢复 Case，并在正文前报告环境问题。

**创建**：`src/tools/check.ts`、`src/tools/prepare.ts`、`problems/.gitkeep`、`tests/tools/check.test.ts`、`tests/tools/prepare.test.ts`。

**实现**：

1. 检查 Node/OpenCode、uv/Python、Case 目录可写性、HMML 索引、模型 cache 和 TeX 可执行文件。
2. 用真实最小 LaTeX 模板测试 XeLaTeX 或 latexmk，不把版本字符串当作可用证明。
3. 按显式路径、`problems/`、询问用户的优先级发现输入。
4. 复制或整理输入、Case Policy 和 Rubric 快照到 Case，生成 input manifest 和 SHA-256；不保留可被后续访问的用户原始绝对路径。
5. 只创建 MM-Agent 专用 uv Python 3.12 环境；拒绝读取用户项目 `.venv` 或向系统 Python 安装依赖。
6. 采用平台 cache 根：Windows `%LOCALAPPDATA%/mm-agent/`、macOS `~/Library/Caches/mm-agent/`、Linux `$XDG_CACHE_HOME/mm-agent/` 或 `~/.cache/mm-agent/`。通过显式环境变量传给 uv 和 Hugging Face。
7. 将 preflight 交互实现为：完整修复计划 -> 用户回复“完善” -> 自动修复安全项 -> 人工步骤 -> 复检 -> 请求开始正文；不公开 `/doctor` 或 `/setup` 命令。

**通过条件**：

- 用户源文件不被修改。
- 空输入、重复 Case ID 和缺失工具产生可行动的结构化错误。
- preflight 能在本机真实报告 TeX 成功或失败原因。
- 缺少模型、uv 或 cache 时只执行允许的完善动作；缺少 OpenCode 或 TeX 时返回人工修复步骤和 `repair: "user"`。
- 不存在用户 `.venv` 或系统 Python 安装路径被读取/修改的测试证据。

### 4. HMML 检索评测与运行时

**目标**：以数据而不是印象选择 embedding 模型，并提供可追溯的检索结果。

**创建**：`runtime/pyproject.toml`、`runtime/uv.lock`、`runtime/hmml_retrieval.py`、`runtime/hmml_eval.py`、`runtime/hmml-manifest.json`、`tests/fixtures/hmml/queries.json`、`tests/fixtures/hmml/eval-report.json`、`tests/fixtures/hmml/eval-report.md`、`tests/hmml-eval.test.ts`。

**修改**：`knowledge/hmml/embedding-meta.json`、`knowledge/hmml/hmml-embeddings.npy`、`knowledge/hmml/method-index.json` 及选定模型对应的预计算索引。

**实现**：

1. 建立至少 30 个中英文查询和人工相关方法标签。
2. 比较 `Alibaba-NLP/gte-multilingual-base` 与 `BAAI/bge-m3` 的 Recall@5、MRR、冷启动、体积和查询延迟。
3. 如果 GTE 的 Recall@5 与最佳结果相差不超过 3 个百分点，选择 GTE；否则选择 BGE-M3。
4. 固定选定模型的 Hugging Face revision、下载文件 SHA-256、embedding 维度、索引 hash 和专用 cache 路径，并写入 `runtime/hmml-manifest.json`。
5. 定义 `tasks/<task-id>/retrieved-methods.json`：`knowledge_source_id`、version/hash、query、retrieval_mode、candidates 及 score。
6. 实现 BM25/关键词 degraded mode，结果必须标记 `retrieval_mode: "bm25"`。
7. 评测选择后原子更新唯一 `(model, hmml-embeddings.npy, embedding-meta.json, method-index.json)` 四元组，不允许遗留另一模型维度的索引。

**通过条件**：

- `tests/fixtures/hmml/queries.json` 至少有 30 个带相关方法标签的中英文查询；测试拒绝不完整 query set。
- 评测结果写入 `tests/fixtures/hmml/eval-report.json` 和 `tests/fixtures/hmml/eval-report.md`，包含逐查询标签及 Recall@5、MRR、冷启动、体积和延迟汇总。
- 选定模型能重建单一索引四元组并得到稳定结果；meta 与 `.npy` 维度和模型 hash 一致。
- 没有模型 cache 时，BM25 fallback 不会阻塞建模阶段。

### 5. Compute 与 Compile Tools

**目标**：让数学结果和 PDF 都能接受真实机器验证。

**创建**：`src/tools/compute.ts`、`src/tools/compile.ts`、`tests/tools/compute.test.ts`、`tests/tools/compile.test.ts`、`tests/fixtures/latex/`。

**实现**：

1. 在 Case task 目录中执行 Python 入口，记录命令、环境、stdout、stderr、exit code、timeout 和输出 hash，写 Runtime Evidence。
2. 拒绝 Case 外工作目录、入口脚本和输出路径。
3. 优先调用 `latexmk -xelatex`，回退到多遍 `xelatex`。
4. 检索、计算和编译都写 Runtime Evidence；Gate 将其作为合法 required read source。
5. 保留完整编译日志，返回结构化错误摘要和 PDF 路径；缺失 TeX 时返回 `status: "fail"` 和 `repair: "user"`，不无限重试。

**通过条件**：

- 成功与失败 Python 执行均可重放。
- 成功与失败 TeX fixture 均产生预期 manifest/log。
- 未产生非空 PDF 时，compile Tool 不能返回成功。
- 检索、计算和编译 manifest 均包含命令/模式、环境、stdout、stderr、exit、timeout 与 output hash。

### 6. Skills、Agents 与四阶段编排

**目标**：将已验证的 Core 接入实际 MM-Agent 行为。

**创建**：四个 `skills/*/SKILL.md`、Agent prompt/rubric 资产、`src/tools/case.ts`、`tests/workflow/*.test.ts`。

**修改**：`src/agents.ts`、`src/index.ts`、`prompts/mm_agent_prompts.py` 中被明确迁移的 prompt 资产。

**实现**：

1. 为 5 个 Agents 设置角色说明、必读 context、输出路径、最终消息 schema 和最小权限；只有 primary Agent 能派发，subagent 禁止调用 `task` 或委派。
2. 建立 Analyst、Modeler、Solver、Writer 和 Critic 的 context recipe，并为每个 Role 写 dispatch fixture；Solver 只取得直接依赖 Task Memory。
3. 让 `mm-agent` Skill 执行 dispatch -> Actor task -> 同 Manifest Critic task -> gate 循环；Critic 不创建 Attempt。
4. 逐项迁移 prompt：Analyst 拥有 `PROBLEM_PROMPT`、`DATA_DESCRIPTION_PROMPT`、`PROBLEM_ANALYSIS_PROMPT`、`PROBLEM_ANALYSIS_IMPROVEMENT_PROMPT`、`DECOMPOSE_PRINCIPLE_PROMPT`、`TASK_DECOMPOSE_PROMPT`、`TASK_DESCRIPTION_PROMPT`、`PROBLEM_EXTRACT_PROMPT`、`TASK_DEPENDENCY_ANALYSIS_PROMPT`、`TASK_DEPENDENCY_ANALYSIS_WITH_CODE_PROMPT`、`DAG_CONSTRUCTION_PROMPT`；Modeler 拥有 `PROBLEM_MODELING_PROMPT`、`PROBLEM_MODELING_IMPROVEMENT_PROMPT`；Solver 拥有 `TASK_ANALYSIS_PROMPT`、`TASK_FORMULAS_PROMPT`、`TASK_FORMULAS_IMPROVEMENT_PROMPT`、`TASK_MODELING_PROMPT`、`TASK_MODELING_IMPROVEMENT_PROMPT`、`TASK_CODING_PROMPT`、`TASK_CODING_DEBUG_PROMPT`、`TASK_RESULT_PROMPT`、`TASK_RESULT_WITH_CODE_PROMPT`、`TASK_ANSWER_PROMPT`、`CREATE_CHART_PROMPT`、`TASK_ANALYSIS_APPEND_PROMPT`、`TASK_FORMULAS_APPEND_PROMPT`、`TASK_MODELING_APPEND_PROMPT`、`CODE_STRUCTURE_PROMPT`；Critic 拥有 `PROBLEM_ANALYSIS_CRITIQUE_PROMPT`、`METHOD_CRITIQUE_PROMPT`、`PROBLEM_MODELING_CRITIQUE_PROMPT`、`TASK_FORMULAS_CRITIQUE_PROMPT`、`TASK_MODELING_CRITIQUE_PROMPT`；Writer 拥有 `PAPER_CHAPTER_PROMPT`、`PAPER_CHAPTER_WITH_PRECEDING_PROMPT`、`PAPER_NOTATION_PROMPT`、`PAPER_INFO_PROMPT`。
5. 在 HMML 评测锁定 `embedding-meta.json` 后再完成 `mm-hmml` Skill；它不得假设未选定的模型。
6. 为 Problem Analysis、Modeling、Solving 和 Reporting 生成并验证 required artifacts、Task Memory 六字段和 promotion 白名单。

**通过条件**：

- 每个 Agent 都能在临时 Case 中读取 manifest 并只写 allowed paths。
- Critic 无写权限。
- Solver 按 DAG wave 并行，后续任务只读取 accepted direct-dependency memory。
- 失败 attempt 不会出现在 accepted index。
- Adapter 不得把 Case state 写入 host chat、允许 Role 绕过 Gate 写 stable artifact，或以宿主路径取代 Case-root-relative path。
- 每个 Task Memory 验证 `task_description`、`modeling_method`、`result_interpretation`、`execution_result`、`code_outputs` 和 `figures`。

### 7. Golden Case 与回归验证

**目标**：完成真实赛题从输入到 PDF 的闭环。

**创建**：`tests/fixtures/cases/minimal/`、`tests/fixtures/cases/multi-wave/`、`tests/fixtures/cases/mmb-2024-c/LICENSE.md`、`scripts/run-golden-case.mjs`、`tests/workflow/case-protocol.e2e.test.ts`、`tests/workflow/golden-case.e2e.test.ts`、`docs/roadmap/golden-case-report.md`。

**删除**：`tests/smoke_test.py`、`tests/mmbench_validate.py`、`tests/mmbench-validation.yaml`，以及它们对 `.claude-plugin`、`.planning/` 和旧 prompt import 的全部假设。

**实现**：

1. 先运行 minimal Case fixture，再运行 multi-wave fixture，验证 Case 协议不依赖 MM-Bench 下载。
2. 获取并核验 MM-Bench `2024_C` 题目、附件和许可证；`LICENSE.md` 记录 source URL、retrieval date、license type 和 redistribution permission。
3. 运行完整四阶段，保留 Case 输出在 `runs/`。
4. 在全新 OpenCode 会话中恢复 Case，检查 `inspect` 的派生 completion evidence、state 与 PDF。
5. 将结果与 artifact、Runtime Evidence、执行和编译 gate 对照。
6. 将人类反馈保存到 `runs/<case-id>/feedback/feedback.md`；测试证明当前 Case 的 accepted artifacts 不会被反馈改写，后续 Case 只有在 input manifest 或约束显式列出旧 Case 和 feedback 时才能读取它。

**通过条件**：

- `report/main.tex`、`report/compile.log` 和非空 `report/report.pdf` 均存在。
- 所有阶段有 accepted artifact。
- task code 能重新执行。
- 重启恢复不需要任何前序聊天内容。
- 旧 v0 Python 测试已删除，`npm test` 只运行新的 v1 TypeScript/Case test surface。

### 8. 文档、发布和交接

**目标**：发布前让代码、安装说明、项目状态和历史记录一致。

**修改**：`README.md`、`docs/context/`、`docs/architecture/`、`docs/roadmap/v1.0.0.md`、`HANDOFF.md`、`CHANGELOG.md`、`AGENTS.md`、`CLAUDE.md`。

**实现**：

1. 将 README、OpenCode Adapter 文档和 Agent 规则同步到 Canonical Core 的 `attempt_id/base_revision/expected_revision`、Case Policy、Manifest、promotion、blocker 和派生 completion evidence schema。
2. 以真实命令替换设计阶段的未来时描述，并记录已锁定的 HMML 模型、四元组 hash 和 Golden Case 证据。
3. 更新安装、更新、卸载、cache、模型下载、TeX 预检和故障排查说明。
4. 明确保留 `templates/cumcmthesis/` 与 `templates/mcmthesis/`；删除或归档旧 `templates/report-generator.py`、`servers/hmml-server/`、根 `requirements.txt` 和所有活跃 Claude `.mcp.json` 配置。
5. 将 `scripts/dag_topological_sort.py` 和 `scripts/load_dependency_memory.py` 的必要语义迁移进 TypeScript Core 测试后删除；其他 `scripts/` 逐项记录保留或归档理由。
6. 检查 `AGENTS.md` 与 `CLAUDE.md` 内容一致，归档目录只被描述为历史资产，`docs/research/` 明确保持历史证据角色。

**通过条件**：

- 在仓库根执行 `npm test`、`npm run build`、`npm run test:runtime`、`npm run golden -- --case tests/fixtures/cases/minimal`、`npm run golden -- --case tests/fixtures/cases/mmb-2024-c` 均通过；`test:runtime` 固定执行 `uv run --project runtime pytest`。
- `git diff --no-index AGENTS.md CLAUDE.md` 返回 0；搜索活跃文件不再出现 Pi、旧 Plugin 入口或 `.planning/` 作为运行路径，搜索必须排除 `.archived/` 与 `.git/`。
- `git status --short` 只包含预期文件，或将无关用户改动明确记录在 `HANDOFF.md`。

## 不做的工作

- 在第一个闭环前支持第二个 Agent 宿主。
- 训练模型权重、构建 Web UI 或自定义 TUI。
- 捆绑 TeX 发行版或 embedding 权重。
- 用数据库、MCP memory server 或隐藏会话状态替代 Case 文件。
- 复活归档中的 Claude/Codex Plugin 结构。

## 当前下一步

第 1 步 OpenCode Plugin Spike 已由 `315c319` 接受。下一步只执行第 2 步 CaseContextStore 与文件契约；在该 gate 通过前不进入 Preflight、HMML、Compute/Compile 或 Golden Case。
