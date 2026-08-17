# MM-Agent 手工 E2E 摩擦审查

## 背景

本文审查 MM-Agent Harness 在一次真实手工端到端运行后暴露的摩擦，并判断这些摩擦应该由哪一层解决。

证据来源：

- Happy Path 已通过：`runs/campus-ev-001/` 完整运行了 Explorer + Solver Task A + Solver Task B + LaTeX 报告编译。
- Replan Path 已通过：人为构造 Solver Task C 缺参场景，验证未顺利完成协议与 Living Task Graph 动态演化。
- 主证据：`runs/campus-ev-001/retrospective.md`、`STATE.md`、`task-graph.md`、`tasks/*/memory.md`、`tasks/*/work/`。

本文不预设 Host Adapter 或 Thin Runtime 一定存在。所有结论必须能在上述证据中找到出处。

---

## 实际运行过程

### Happy Path

```text
主会话读 architecture + skills + AGENTS.md
   ↓
write STATE.md + task-graph.md
   ↓
task(general)委派 Explorer
   ↓ (子智能体读 agents/explorer.md + fixture Knowledge + Case Library)
   ↓ (write research/memo-001-method-candidates.md)
主会话 read memo-001 核验
   ↓
task(general)委派 Solver Task A
   ↓ (子智能体读 agents/solver.md + memo + Knowledge + 附件)
   ↓ (bash pip install scipy; write solve.py; bash python solve.py)
   ↓ (write tasks/task-a/memory.md)
主会话 read task-a/memory.md + result.csv 核验
   ↓
task(general)委派 Solver Task B
   ↓ (子智能体复用 Task A 的 build_problem 风格)
   ↓ (write sensitivity.py; bash python sensitivity.py)
   ↓ (write tasks/task-b/memory.md)
主会话 read task-b/memory.md 核验
   ↓
主会话 write report/main.tex
   ↓
bash pdflatex ×2 → 失败 → 修 caption 去 $...$ → 仍失败 → 去 hyperref + label 改 ASCII → 成功
   ↓
write retrospective.md + 更新 STATE.md / task-graph.md
```

### Replan Path

```text
主会话 task(general)委派 Solver Task C (故意缺 T/α/μ 参数)
   ↓ (子智能体读 agents/solver.md + 所有 inputs + grep 全 fixture 无匹配)
   ↓ (write tasks/task-c/memory.md 103 行未顺利完成版 + work/README.md)
主会话 read task-c/memory.md
   ↓ (识别 4 条处置路径)
主会话决策：路径 1 直接给参数 (T=1h, α=0.7, μ=1, demand_slots 语义)
   ↓
task(general)委派 Solver Task C2 (沿用 tasks/task-c/ 目录与 memory.md 路径)
   ↓ (子智能体读 agents/solver.md + 上游 Memory + 主会话给的参数)
   ↓ (write queue.py; bash python queue.py; 4 组 assertion 全通过)
   ↓ (write tasks/task-c/memory.md 240 行最终版,保留"前情"段覆盖旧版)
主会话 read task-c/memory.md 核验
   ↓
主会话更新 task-graph.md (Task C 经 Replan 完成) + STATE.md
```

---

## 已发现的摩擦

### F1 LaTeX 编译踩坑（caption 含数学 + 中文 label + hyperref）

**证据**：retrospective.md L19、L23；实际编译日志显示 `Missing \endcsname` 在 `\caption{...$...$...}` 与 `\label{tab:粒度}` 处。

**分类**：A（Skill / 认知语义）—— 编译本身是机械操作，但踩坑根因是缺乏输出资产 hygiene 知识，不是工具层故障。

**频率**：本 case 2 次失败。修好后未来 case 若不知规则可能复现。

**人工成本**：中（2 轮 debug，需读 log 定位 `\csname` 错误）。

**可靠性风险**：低（编译失败明显，不会 silent fail）。

**认知 vs 机械**：避坑规则是认知/知识；编译执行是机械。

**OpenCode 已有**：`bash` 跑 `pdflatex` 完全足够，不需要包装。

**最小解决方向**：在 `.agents/skills/doc-style/SKILL.md` 或 `knowledge/` 加 LaTeX 输出资产 hygiene 规则（caption 不夹 `$...$`；`\label{}` 全 ASCII；ctexart 下 `hyperref` 慎用）。属 A 类 Skill/Knowledge 层修复，不需要 Runtime。

**v1 是否处理**：Yes —— 作为 candidate experience 进 doc-style 或 Knowledge recipe，经 ≥ 3 个 case 验证后提升正式 Knowledge。

---

### F2 scipy / pulp 默认未安装，Solver 自行 pip install

**证据**：retrospective.md L24；`tasks/task-a/memory.md` L23-24 记录 `pip install scipy pulp`。

**分类**：D（OpenCode 原生解决）—— Solver 用 `bash` 跑 `pip install` 即可。

**频率**：每 case 首次用 scipy 时 1 次。

**人工成本**：低（Solver 自处理，主会话无需介入）。

**可靠性风险**：低（装失败 Solver 会报错）。

**认知 vs 机械**：机械。

**OpenCode 已有**：`bash` + `pip` —— 足够。

**最小解决方向**：Do Nothing。若反复出现可在 `knowledge/recipes/` 加"常用 Python 依赖列表"作为 Solver 提示，但当前模式已工作。

**v1 是否处理**：No。

---

### F3 委派 prompt 临场撰写，长且不齐

**证据**：retrospective.md L39；实际 `task` 工具调用的 prompt 每次由主会话临场撰写，含角色契约路径、Task 目标、输入路径、上游 Memory 路径、工作目录、Task Memory 目标位置等字段，长度 300-800 字不等。

**分类**：A（Skill / 认知语义）+ B（Host Adapter 映射）的边界 —— 字段清单是机械的，字段内容是认知的。

**频率**：每次委派（每 case 4-6 次）。

**人工成本**：中（主会话每次写长 prompt，且字段可能漏）。

**可靠性风险**：中（漏字段会导致子智能体缺信息 —— Phase 7 Task C 故意缺字段验证了这点）。

**认知 vs 机械**：混合 —— 字段清单机械，内容认知。

**OpenCode 已有**：`task` 工具接受任意 prompt，不提供模板。

**最小解决方向**：在 `knowledge/` 或 `skills/mm-agent/references/` 加委派 prompt 字段清单 recipe（Task 目标 / 输入路径 / 上游 Memory / Research Memo / 工作目录 / Task Memory 目标位置 / 约束声明）。这可以在 Knowledge/Skill 层解决，不一定要 Host Adapter。

**v1 是否处理**：Partially —— 先在 Knowledge/Skill 层固化字段清单；Host Adapter 包装留待 Phase 10 评估，且只有当 ≥ 2 个 case 证明字段清单 recipe 仍不够薄时才启动。

---

### F4 Task Memory 未顺利版本被覆盖丢失

**证据**：retrospective.md L69；`tasks/task-c/memory.md` 实际从 103 行（未顺利完成版）被 Task C2 覆盖为 240 行（最终版），仅保留"前情：Task C 未顺利版本的更新历史"段，原版字面丢失。

**分类**：A（Skill / 认知语义）—— 文件命名约定问题，不是 Runtime 问题。

**频率**：Replan 场景（低频）。

**人工成本**：低（前情段保留了关键信息，git 历史可追溯，但运行时不可）。

**可靠性风险**：中（若主会话或后续智能体只读 `memory.md` 不读 git log，原版字面不可见）。

**认知 vs 机械**：机械（文件命名约定）。

**OpenCode 已有**：`write` 覆盖文件 —— 不提供版本化。

**最小解决方向**：在 `skills/mm-agent/references/case-artifacts.md` 加约定"Task Memory 重写时旧版归档为 `memory-superseded-<n>.md`"。属 A 类 Skill 层修复。

**v1 是否处理**：Maybe —— 候选经验，需更多 Replan case 验证；可先在 case-artifacts.md 加一行约定。

---

### F5 subagent 能否使用 web 工具的边界

**证据**：retrospective.md L70；`tasks/task-c/memory.md` L75 提到 path 2"重委派 Solver Task D 启用 web"与 host 限制冲突。

**分类**：B（Host Adapter 映射）—— 宿主能力边界仲裁。

**频率**：低（只在 Solver 想用 web 时）。

**人工成本**：低（主会话临场在 prompt 中声明约束）。

**可靠性风险**：低（子智能体遵守 prompt 约束即可）。

**认知 vs 机械**：认知（主会话决定何时解除约束）。

**OpenCode 已有**：`task` 工具的 prompt 可包含约束声明 —— 足够。

**最小解决方向**：Do Nothing（主会话在 prompt 中声明约束已工作）；或 Host Adapter 加"subagent 工具白名单"配置，但当前 prompt 声明模式足够。

**v1 是否处理**：No —— 当前 prompt 声明工作；若未来 case 反复出现约束遗漏可评估 Host Adapter 配置层。

---

### F6 主会话补参决策留痕位置不统一

**证据**：retrospective.md L67；`STATE.md` 实际有"主会话重新规划"段，但这是临场写的，没有标准段落约定。

**分类**：A（Skill / 认知语义）—— STATE.md 段落约定。

**频率**：Replan 场景。

**人工成本**：低。

**可靠性风险**：低（信息没丢，只是位置不统一）。

**认知 vs 机械**：认知（主会话决定何时留痕）。

**OpenCode 已有**：`write` —— 足够。

**最小解决方向**：在 `skills/mm-agent/references/case-artifacts.md` 或 `skills/mm-agent/SKILL.md` 加 STATE.md 段落建议（全局理解 / 已完成 / 当前判断 / 下一步 / 主会话决策留痕）。

**v1 是否处理**：Maybe —— 候选经验，需更多 case 验证。

---

## OpenCode 原生能力评估

| 能力 | OpenCode 原生工具 | 本 E2E 是否足够 | 是否需要包装 |
|------|-------------------|-----------------|--------------|
| 读文件 | `read` | 足够 | 否 |
| 写文件 | `write` | 足够 | 否 |
| 搜索文件名 | `glob` | 足够 | 否 |
| 搜索文件内容 | `grep` | 足够 | 否 |
| shell / 进程执行 | `bash` | 足够 | 否 |
| Python 执行 | `bash` + `python` | 足够 | 否 |
| LaTeX 编译 | `bash` + `pdflatex` | 足够（跑两轮即可） | 否 |
| PDF 存在性检查 | `bash` + `Test-Path` | 足够 | 否 |
| 子智能体调用 | `task` | 足够（prompt 模板缺失是 A 类问题，不是工具层故障） | 否 |
| 文件锁 | 未用到 | 当前不需要 | 否 |
| 下载 / 缓存 | 未用到（子智能体被禁 web） | 当前不需要 | 否 |
| 全文搜索 | `grep` | 足够 | 否 |

结论：OpenCode 原生工具在本 E2E 中覆盖了所有机械操作需求，没有出现"原生工具不够、必须写 Runtime helper"的情况。

---

## Host Adapter 候选需求

逐一检查真实 E2E 中是否出现了需要 Host Adapter 解决的摩擦：

1. **如何加载 Main Skill**：主会话直接读 `skills/mm-agent/SKILL.md` 即可，未出现加载摩擦。
2. **如何启动 Explorer / Solver**：通过 `task` 工具 + `subagent_type: "general"` + prompt 含角色契约路径，子智能体自行读 `agents/*.md`。未出现启动摩擦。
3. **如何给子智能体独立上下文**：`task` 工具原生提供独立 context。未出现上下文隔离摩擦。
4. **如何将选定文件作为局部上下文传入**：prompt 中列出文件路径，子智能体用 `read` 读取。未出现路径拼装摩擦。
5. **如何把结果文件位置返回给主会话**：子智能体在 Task Memory 中写明产物路径，主会话用 `read` 核验。未出现返回摩擦。
6. **如何映射 Agent 定义到 OpenCode**：`agents/explorer.md` 与 `agents/solver.md` 是自然语言契约，子智能体读即可工作。未出现映射摩擦。

唯一接近 Host Adapter 边界的是 F3（委派 prompt 字段清单），但该问题可在 Knowledge/Skill 层用 recipe 解决，不需要 Host Adapter 包装。

**结论**：当前没有足够证据支持开发 Host Adapter。

---

## Thin Runtime 候选需求

逐一检查原先设想的 Runtime 能力：

| Runtime 候选能力 | 本 E2E 状态 | 结论 |
|------------------|------------|------|
| 文件读写 | OpenCode `read`/`write` 足够 | 明确不需要 |
| 目录创建 | `bash` + `New-Item` 足够 | 明确不需要 |
| 全文搜索 | `grep` 足够 | 明确不需要 |
| 进程执行 | `bash` 足够 | 明确不需要 |
| Python 执行 | `bash` + `python` 足够 | 明确不需要 |
| stdout / stderr / exit status | `bash` 原生捕获 | 明确不需要 |
| LaTeX 编译 | `bash` + `pdflatex` 跑两轮足够 | 明确不需要 |
| PDF existence check | `bash` + `Test-Path` 足够 | 明确不需要 |
| 下载 / 缓存 | 未用到 | 当前未验证，不做 |
| 文件锁 | 未用到 | 当前未验证，不做 |

没有出现"重复、容易人为出错、OpenCode 原生无法稳定处理"的机械操作。

**结论**：当前没有足够证据支持开发 Thin Runtime。

---

## Do Not Mechanize

以下判断必须继续保留给主会话 / Explorer / Solver，不能变成代码规则：

- Task 是否完成 —— 主会话语义判断，不能自动判定
- Research Memo 是否可信 —— 主会话读取后判断，不能自动评分
- 是否需要 replan —— 主会话基于全局局势判断，不能自动触发
- Task 优先级与执行顺序 —— 主会话基于 Living Task Graph 判断，不能自动调度
- 何时委派 Explorer / Solver —— 主会话判断，不能自动分派
- Living Task Graph 是否修改 —— 主会话语义判断，不能自动重构
- 报告内容整合 —— 主会话语义整合，不能自动生成
- Task Memory 内容是否可接受 —— 主会话读取后判断，不能自动解析 schema
- 主会话补参决策 —— 主会话基于 Task Memory 缺口清单判断，不能自动补默认值
- Solver 局部方法选择 —— Solver 在 Task 边界内自治，不能自动选模型

发现这类倾向时必须明确标成 Do Not Mechanize。本 E2E 中未出现错误自动化冲动，但未来 Host Adapter / Runtime 设计时须持续检查。

---

## Do Nothing

以下摩擦明确不值得自动化：

- **read / write / grep / glob / bash 包装**：OpenCode 原生足够，包装只会增加复杂度
- **Python 执行包装**：`bash` + `python` 已足够
- **LaTeX 编译两轮**：`bash` 跑两次 `pdflatex` 即可，不需要 `compile_latex()` helper
- **scipy / pulp 安装**：Solver 自处理已工作，不需要 Runtime 预装
- **主会话核验子智能体产物**：这是主会话职责，不是摩擦
- **Living Task Graph / STATE.md 手工更新**：这是主会话语义职责，自动化会剥夺判断权

---

## 推荐的下一阶段

基于上述证据，推荐方案 **A：不写代码，继续更多 E2E，在 Knowledge / Skill 层固化候选经验**。

理由：

1. 当前只有 1 个 case（campus-ev-001），样本量不足以驱动 Host Adapter / Runtime 设计决策。
2. 6 个真实摩擦中，4 个属 A 类（Skill / Knowledge 层可解决），1 个属 D 类（Do Nothing），1 个属 A/B 边界（先试 Knowledge recipe）。
3. 没有出现 OpenCode 原生工具不够用的机械操作。
4. 候选经验（LaTeX hygiene、Task Memory 归档约定、委派 prompt 模板、STATE 段落约定）都需 ≥ 3 个 case 验证后才提升正式 Knowledge。
5. 过早写 Host Adapter / Runtime 会把"1 个 case 的偶然摩擦"固化成架构层代码，违背"不为完整架构提前实现尚未被真实 E2E 证明需要的代码"原则。

建议下一步：

- 跑第 2 个不同主题的 E2E case（例如时间序列预测或评价模型），验证 F1-F6 是否复现；
- 在跑之前先把高置信的 A 类修复落地（doc-style 加 LaTeX hygiene、case-artifacts 加 Task Memory 归档约定）；
- 跑完后重新评估 Host Adapter / Runtime 是否有了新的证据支持。

---

## Phase 10 是否应该启动

**No。**

当前证据不支持启动 Phase 10 Host Adapter 开发。

理由：

- 6 个真实摩擦中没有一个是"必须 Host Adapter 才能解决"的；
- F3（委派 prompt 模板）是最接近 Host Adapter 边界的，但可在 Knowledge/Skill 层用 recipe 解决；
- F5（subagent web 边界）当前 prompt 声明模式足够；
- OpenCode 原生 `task` 工具 + `read`/`write`/`bash` 已覆盖所有机械操作；
- 1 个 case 的样本量不足以设计稳定的 Agent 注册映射。

如果未来 ≥ 2 个 case 反复出现同一类 Host Adapter 边界摩擦（例如委派 prompt 字段清单 recipe 仍不够薄、subagent 工具白名单需配置化），再启动 Phase 10，且第一批最多实现：

- 极薄的 Agent 注册映射（把 `agents/*.md` 路径绑定到 `task` 调用的默认 prompt 前缀）；
- 可选的 subagent 工具白名单配置。

不实现任何业务语义层逻辑。