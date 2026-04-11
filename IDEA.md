# MM-Agent in Claude Code — 设计决策文档

**文档性质**：本项目的完整设计上下文，作为 GSD 工作流的输入。包含所有选型理由、技术决策、架构细节。

**创建日期**：2026-04-10

**核心价值**：输入非结构化赛题 → 自动化数学建模全流程 → 输出符合要求的论文报告

---

## 一、项目定位与约束

### 1.1 项目是什么

将 NeurIPS 2025 论文 "MM-Agent" 的数学建模多智能体架构，本地化为 Claude Code 工作流插件。

**不是**：
- 不是重新实现 MM-Agent（复刻而非创新）
- 不是独立 Python 应用（集成而非独立）
- 不是 Web UI（CLI-first 策略）

**是**：
- Claude Code Skills/Agents 体系内的数学建模工作流
- 用户通过 `/mm-agent --problem <file>` 启动
- 继承 Claude Code 的模型配置，无需单独配置 API Key

### 1.2 为什么做这个项目

**用户痛点**：
- 数学建模竞赛参与者需要快速建模工具
- 原版 MM-Agent 需要独立部署和 API 配置
- Claude Code 是很多人的日常工作环境

**解决方案**：
- 在熟悉环境中提供 MM-Agent 的能力
- 降低部署门槛（继承 Claude Code 配置）
- 保持工作流的持久化状态

### 1.3 目标用户

| 用户类型 | 使用场景 | 核心需求 |
|---------|---------|---------|
| 数学建模竞赛参与者 | MCM/ICM 比赛 | 快速生成建模方案和报告 |
| 科研工作者 | 论文研究 | 结构化的建模流程 |
| Claude Code 用户 | 日常工作流集成 | 不需要切换工具 |

### 1.4 约束条件

**技术约束**：
- 必须在 Claude Code CLI 环境中运行
- 使用 Claude Code 的 Skills/Hooks/Agents 体系
- 参考 LLM-MM-Agent 和 get-shit-done 的实现

**功能约束**：
- CLI-first，v1 不做 Web UI
- 聚焦核心流水线，其他功能失败不影响主流程
- 不追求与原版 MM-Agent 100% 功能对齐

**用户约束**：
- 用户已有 Claude Code 环境
- 用户接受命令行交互
- 用户可提供赛题文件（PDF/MD/TXT）

---

## 二、技术选型

### 2.1 核心技术栈

| 技术 | 版本 | 用途 | 选型理由 |
|------|------|------|---------|
| Claude Code Skills | Current | 工作流入口定义 | Claude Code 原生机制，自动发现加载 |
| Claude Code Agents | Current | 专业执行者 | 可被其他 Agent 调用，支持 Memory |
| Claude Code Hooks | Current | 自动触发逻辑 | PreToolUse/PostToolUse 验证和格式化 |
| Python + NumPy/SciPy | 3.12+ | 数值模拟执行 | 数学建模标准工具链 |
| sentence-transformers | Latest | HMML 向量计算 | embedding 模型，确定性计算 |
| LaTeX/Pandoc | Latest | 报告生成 | 学术标准输出格式 |

### 2.2 为什么不用其他方案

| 方案 | 不用的理由 |
|------|----------|
| Django/Flask Web 框架 | 不是 Web 应用，CLI-native 更合适 |
| LangGraph/LangChain | GSD 框架已提供更好的编排模式 |
| 独立 Python CLI | Claude Code 集成比独立部署更方便 |
| 数据库持久化 | 文件系统足够，避免额外依赖 |

### 2.3 Python 环境依赖

**必需**：
- numpy: 数值计算基础
- scipy: 科学计算（优化、插值、统计）
- matplotlib: 可视化
- pandas: 数据处理
- sentence-transformers: embedding 计算

**可选**：
- sympy: 符号计算（解析推导）
- jinja2: 报告模板

---

## 三、MM-Agent 论文核心洞察

### 3.1 论文解决了什么问题

**问题陈述**：
- 数学建模 ≠ 数学推理
- 建模需要：开放式问题分析、抽象、有原则的形式化
- LLM 在推理上强，但在模型构建上弱

**解决方案**：
- 形式化 LLM-driven 数学建模任务
- 多智能体协作框架（四阶段）
- 层次化知识库（HMML）
- 实验验证有效性

### 3.2 四阶段工作流映射

| 论文阶段 | 核心任务 | Agent 角色 | 输出产物 |
|---------|---------|-----------|---------|
| Problem Analysis | 问题理解、分解、依赖分析 | Analyst + Coordinator | problem.md, DAG |
| Mathematical Modeling | 方法检索、Actor-Critic 建模 | Modeler + Critic | model.md, formulas |
| Computational Solving | 代码生成、执行、调试 | Programmer | code.py, results.json |
| Solution Reporting | 报告大纲、内容填充 | Reporter | report.pdf |

### 3.3 HMML（层次化数学建模库）设计

**为什么需要 HMML**：
- LLM 不擅长凭空想出建模方法
- 提供 98 个高质量方法节点作为候选
- 通过 embedding 检索最相关的方法

**三层结构设计理由**：

```
Level 1: Domains（领域层）— 粗粒度分类
├── 为什么需要：快速定位问题所属领域
├── 包含：Operations Research, Optimization, ML, Prediction, Evaluation
└── 数量：约 5-10 个

Level 2: Subdomains（子领域层）— 中粒度分类
├── 为什么需要：领域内进一步细分
├── 包含：Linear Programming, Monte Carlo, Time Series...
└── 数量：约 17 个

Level 3: Method Nodes（方法节点层）— 细粒度方法
├── 为什么需要：具体可执行的方法描述
├── 包含：{method, core_idea, application}
└── 数量：98 个
```

**检索流程设计**：

```
输入：任务描述文本
步骤：
1. DFS 遍历 HMML 树
2. 计算任务与每个方法节点的 embedding 相似度
3. 父节点分数加权：S = ω·child_sim + (1-ω)·parent_sim
4. 返回 Top-K 方法（默认 K=6）
输出：方法描述列表，供 Modeler Agent 参考
```

**embedding 模型选择**：

| 模型 | 优点 | 缺点 | 选择 |
|------|------|------|------|
| mGTE | 原版使用，中英文好 | 需要额外安装 | ⭐⭐⭐⭐ |
| BGE-m3 | 中英文优秀，质量高 | 需要额外安装 | ⭐⭐⭐⭐⭐（推荐） |
| OpenAI embedding | 无需安装 | 不支持离线，成本高 | ❌ |
| all-MiniLM-L6-v2 | 轻量 | 中英文一般 | ⭐⭐ |

**决策**：使用 BGE-m3 或 mGTE，预计算 embedding 存为 numpy 文件。

### 3.4 Actor-Critic 迭代设计

**为什么需要迭代**：
- 单次生成的建模方案质量不稳定
- 模拟人类专家的自我审视过程
- 通过反馈循环提升方案质量

**Actor-Critic 角色分工**：

| 角色 | 职责 | 输入 | 输出 |
|------|------|------|------|
| Actor | 生成/改进建模方案 | 任务描述 + HMML 方法 + Critic feedback | 建模方案 M |
| Critic | 评估方案质量 | 任务描述 + 当前方案 M | 评估报告 F + 改进建议 |

**迭代参数设计**：

| 参数 | 默认值 | 设计理由 |
|------|--------|---------|
| max_rounds | 3 | 平衡质量与成本，过多迭代边际效益递减 |
| ω (父节点权重) | 0.5 | 平衡方法自身匹配度与领域相关性 |
| top_k | 6 | 覆盖主要方法，避免信息过载 |

**停止条件**：
- 达到 max_rounds
- Critic 评估为 "满意"（可选实现）

### 3.5 DAG（任务依赖图）设计

**为什么需要 DAG**：
- 数学建模问题常有多个子问题
- 子问题之间存在依赖（如预测模型依赖数据预处理）
- 需要正确的执行顺序

**DAG 数据结构**：

```json
{
  "tasks": {
    "1": { "description": "...", "dependencies": [], "status": "pending" },
    "2": { "description": "...", "dependencies": ["1"], "status": "pending" },
    "3": { "description": "...", "dependencies": ["1", "2"], "status": "pending" }
  },
  "execution_order": ["1", "2", "3"]
}
```

**拓扑排序必要性**：
- 从 DAG 计算唯一执行顺序
- 检测循环依赖（报错并重新分解）
- 支持并行执行（入度同时为 0 的任务）

### 3.6 Memory System 设计

**为什么需要 Memory**：
- 任务间上下文传递
- 后续任务需要前置任务的结果
- 原版用 Python dict，本地化用 JSON 文件

**Memory 数据结构**：

```json
{
  "task_id": "2",
  "task_description": "建立预测模型",
  "mathematical_modeling_process": "使用线性回归...",
  "solution_interpretation": "模型准确率 95%...",
  "task_code": "import numpy...",
  "execution_result": { "accuracy": 0.95 },
  "code_structure": {
    "file_outputs": [
      { "path": "output/model.pkl", "description": "训练好的模型" }
    ]
  }
}
```

**Memory 传递机制**：

```
Task 3 开始时：
1. 读取 DAG，确定依赖：["1", "2"]
2. 加载 memory/task-1.json 和 memory/task-2.json
3. 构造上下文 Prompt：
   """
   # Task 1 Description: {memory["1"]["task_description"]}
   # Task 1 Result: {memory["1"]["solution_interpretation"]}
   
   # Task 2 Description: {memory["2"]["task_description"]}
   # Task 2 Result: {memory["2"]["solution_interpretation"]}
   """
4. Task 3 Agent 使用此上下文执行
5. 完成后存储到 memory/task-3.json
```

---

## 四、GSD 框架复用设计

### 4.1 GSD 提供什么

**直接复用的机制**：

| GSD 机制 | 本项目用途 |
|---------|-----------|
| Skills 体系 | `/mm-agent` 入口定义 |
| Agents 定义 | Modeler/Programmer 等执行者 |
| 文件上下文传递 | problem.md → model.md → ... |
| Goal-Backward 验证 | 阶段输出质量检查 |
| Deviation Rules | 自动处理 Bug/Blocking 问题 |
| Hooks | 自动验证和状态追踪 |

### 4.2 本项目特有的扩展

| 扩展 | 为什么 GSD 没有 | 本项目如何实现 |
|------|----------------|---------------|
| HMML 知识库 | GSD 是通用框架 | `.planning/knowledge/hmml.json` + 检索脚本 |
| DAG 任务依赖 | GSD 用固定 Phase 顺序 | `.planning/memory/dag.json` + 拓扑排序脚本 |
| Actor-Critic 迭代 | GSD 单次规划 | Modeler Agent 内部迭代或两个 Agent 对话 |
| Python 代码执行 | GSD 不执行用户代码 | Programmer Agent + 代码沙盒脚本 |
| Memory System | GSD 用简单文件传递 | 结构化 JSON + 传递协议 |

### 4.3 Skills vs Agents 分工

**Skills**：用户调用的入口，定义工作流骨架
**Agents**：系统编排的执行者，可被其他 Agent 调用

**本项目分配**：

| 类型 | 文件位置 | 数量 | 示例 |
|------|---------|------|------|
| Skills | `.claude/skills/mm-agent/` | 2-3 | SKILL.md, coordinator.md |
| Agents | `.claude/agents/` | 5-6 | modeler.md, programmer.md |

---

## 五、HMML 向量检索实现细节

### 5.1 离线准备阶段

**步骤 1：构建 HMML 知识库**

```json
// hmml.json 结构示例
[
  {
    "domain": "Operations Research",
    "subdomains": [
      {
        "name": "Linear Programming",
        "methods": [
          {
            "name": "LP Standard Form",
            "core_idea": "优化线性目标函数，满足线性约束",
            "application": "资源分配、生产调度",
            "text_for_embedding": "Linear Programming: 优化线性目标函数，满足线性约束，适用于资源分配、生产调度"
          }
        ]
      }
    ]
  }
]
```

**步骤 2：预计算 embedding**

```
流程：
1. 提取所有 98 个方法的 text_for_embedding
2. 使用 BGE-m3 或 mGTE 计算 embedding
3. 存储为 hmml-embeddings.npy（numpy 数组）
4. 存储方法 ID 映射到 embedding-meta.json
```

**文件产出**：
- `.planning/knowledge/hmml.json` — 知识库本体
- `.planning/knowledge/hmml-embeddings.npy` — 向量文件
- `.planning/knowledge/embedding-meta.json` — ID 映射

### 5.2 运行时检索流程

```
触发时机：Modeler Agent 开始建模前

步骤：
1. Modeler Agent 将任务描述写入临时文件
2. Modeler Agent 执行：
   python .claude/scripts/hmml_retrieval.py \
     --query-file .planning/memory/task-desc.txt \
     --top-k 6 \
     --output .planning/memory/retrieved-methods.json
3. 脚本：
   a. 加载 query 文本
   b. 计算 query embedding
   c. 加载预计算向量
   d. 计算余弦相似度
   e. 父节点加权
   f. 返回 Top-K
4. Modeler Agent 读取 retrieved-methods.json
```

### 5.3 检索脚本实现细节

**输入输出约定**：

```
输入：
--query-file: 包含任务描述的文本文件路径
--top-k: 返回方法数量（默认 6）
--output: 输出 JSON 文件路径

输出 JSON 格式：
{
  "query": "网球比赛动量预测",
  "methods": [
    {
      "domain": "Prediction",
      "subdomain": "Time Series",
      "method": "ARIMA",
      "score": 0.85,
      "core_idea": "...",
      "application": "..."
    },
    ...
  ],
  "timestamp": "2026-04-10T12:00:00Z"
}
```

**相似度计算**：

```
余弦相似度：
sim(query, method) = (e_query · e_method) / (||e_query|| · ||e_method||)

父节点加权：
final_score = ω · sim(method) + (1-ω) · sim(parent_domain)

其中 ω = 0.5（可配置）
```

---

## 六、DAG 管理实现细节

### 6.1 DAG 构建流程

```
触发时机：Problem Analysis 阶段完成，子任务列表确定

步骤：
1. Coordinator Skill 接收子任务列表
2. Coordinator 构造 Prompt：
   """
   分析以下子任务的依赖关系：
   
   任务列表：
   1. 数据预处理
   2. 建立预测模型
   3. 模型评估
   4. 结果可视化
   
   输出 JSON 格式的依赖图：
   {
     "1": [],      // Task 1 无依赖
     "2": ["1"],   // Task 2 依赖 Task 1
     ...
   }
   """
3. LLM 返回 DAG JSON
4. 验证 JSON 格式正确
5. 执行拓扑排序脚本
6. 存储 dag.json 和 execution-order.txt
```

### 6.2 拓扑排序脚本

**输入输出**：

```
输入：
--input: dag.json 路径
--output: execution-order.txt 路径

输出：
执行顺序，每行一个任务 ID
如：
1
2
3
4
```

**算法实现**：

```
Kahn's Algorithm:
1. 计算所有节点的入度
2. 入度=0 的节点入队
3. 循环：
   a. 取队首节点
   b. 加入结果
   c. 减少依赖此节点的节点入度
   d. 新的入度=0 节点入队
4. 如果结果长度 < 节点总数 → 循环依赖报错
```

### 6.3 任务状态管理

**状态流转**：

```
pending → in_progress → completed | failed
```

**状态更新时机**：
- pending → in_progress：Agent 开始执行任务前
- in_progress → completed：任务验证通过后
- in_progress → failed：超过重试次数后

**状态存储位置**：
- dag.json 中的每个 task 的 status 字段

### 6.4 依赖检查逻辑

```
触发时机：每个 Agent 开始执行任务前

步骤：
1. 读取 dag.json
2. 获取当前任务的 dependencies 列表
3. For each dep_id:
   a. 检查 memory/task-{dep_id}.json 是否存在
   b. 检查 dag.json 中 task-{dep_id} 的 status 是否为 "completed"
4. 如果所有依赖满足 → 继续执行
5. 如果有依赖未完成 → 等待或报错
```

---

## 七、Memory System 实现细节

### 7.1 Memory 文件组织

```
.planning/memory/
├── dag.json                # DAG 结构和任务状态
├── execution-order.txt     # 拓扑排序结果
├── task-1.json             # Task 1 的完整记忆
├── task-2.json             # Task 2 的完整记忆
├── task-3.json             # Task 3 的完整记忆
└── ...
```

### 7.2 Memory JSON Schema

```json
{
  "task_id": "string (required)",
  "phase": "string (required)",
  "status": "pending|in_progress|completed|failed (required)",
  "task_description": "string (required)",
  "mathematical_modeling_process": "string (optional, Phase 2)",
  "preliminary_formulas": "string (optional, Phase 2)",
  "task_code": "string (optional, Phase 3)",
  "execution_result": "object|string (optional, Phase 3)",
  "solution_interpretation": "string (required after completion)",
  "subtask_outcome_analysis": "string (optional)",
  "code_structure": {
    "file_outputs": [
      { "path": "string", "description": "string" }
    ]
  },
  "charts": "array (optional)",
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp"
}
```

### 7.3 上下文传递协议

**依赖加载函数**：

```python
# 脚本：load_dependency_memory.py
def load_dependencies(task_id, dag_path, memory_dir):
    dag = json.load(open(dag_path))
    dependencies = dag['tasks'][task_id]['dependencies']
    
    context = ""
    for dep_id in dependencies:
        memory = json.load(open(f"{memory_dir}/task-{dep_id}.json"))
        context += f"""
---
# Task {dep_id}: {memory['task_description']}

## Modeling Method
{memory.get('mathematical_modeling_process', 'N/A')}

## Result Interpretation
{memory.get('solution_interpretation', 'N/A')}

## Code Outputs
{json.dumps(memory.get('code_structure', {}).get('file_outputs', []), indent=2)}
---
"""
    return context
```

**Agent 调用方式**：

```
Agent 执行前：
1. Bash: python .claude/scripts/load_dependency_memory.py \
     --task-id 3 \
     --dag .planning/memory/dag.json \
     --memory-dir .planning/memory \
     --output .planning/memory/context-for-task-3.txt
2. Read: .planning/memory/context-for-task-3.txt
3. 将内容作为 Prompt 的一部分
```

### 7.4 Memory 写入时机

| 时机 | 写入内容 | 写入位置 |
|------|---------|---------|
| 任务开始 | task_id, status=in_progress | dag.json |
| 建模完成 | modeling_process, formulas | task-{id}.json |
| 代码执行完成 | code, result, interpretation | task-{id}.json |
| 任务完成 | status=completed | dag.json + task-{id}.json |

---

## 八、Actor-Critic 迭代实现细节

### 8.1 实现方式选择

| 方式 | 优点 | 缺点 | 推荐 |
|------|------|------|------|
| Modeler Agent 内部迭代 | 简单，单 Agent | 无法并行 | ⭐⭐⭐⭐ |
| Modeler + Critic 两个 Agent | 可并行，清晰分工 | 复杂度高 | ⭐⭐⭐ |

**决策**：v1 使用 Modeler Agent 内部迭代（更简单），后续可升级为双 Agent。

### 8.2 Modeler Agent 内部迭代流程

```
步骤：
1. 加载任务描述、依赖 Memory、HMML 检索结果
2. Actor 部分：
   Prompt = """
   根据任务描述和参考方法，生成初步建模方案：
   
   任务：{task_description}
   参考方法：{retrieved_methods}
   前置任务结果：{dependency_memory}
   
   输出：
   - 建模方法选择及理由
   - 数学公式推导
   - 变量定义
   - 假设条件
   """
   
   方案_0 = LLM.generate(Prompt)

3. Critic 部分（round=0）：
   Prompt = """
   评估以下建模方案的质量：
   
   方案：{方案_0}
   
   评估维度：
   - 假设合理性
   - 公式正确性
   - 方法适配度
   
   输出：
   - 评分（1-10）
   - 具体问题列表
   - 改进建议
   """
   
   feedback_0 = LLM.generate(Prompt)

4. 改进部分：
   Prompt = """
   根据反馈改进建模方案：
   
   原方案：{方案_0}
   反馈：{feedback_0}
   
   输出改进后的方案。
   """
   
   方案_1 = LLM.generate(Prompt)

5. 重复步骤 3-4 直到：
   - Critic 评分 ≥ 8（满意）
   - 或达到 max_rounds=3

6. 最终方案存储到 Memory
```

### 8.3 迭代参数配置

```json
// config.json 或 Agent frontmatter
{
  "actor_critic": {
    "max_rounds": 3,
    "satisfaction_threshold": 8,
    "critic_model": "opus"  // 可选：用更强模型做 Critic
  }
}
```

---

## 九、代码执行实现细节

### 9.1 代码生成流程

```
触发时机：Programmer Agent 接收建模方案

步骤：
1. 加载 model.md 和 formulas.json
2. 加载依赖任务的 code_structure（知道有哪些输入文件）
3. Prompt = """
   根据建模方案生成可执行 Python 代码：
   
   建模方案：{model}
   数学公式：{formulas}
   输入数据文件：{dependency_file_outputs}
   
   要求：
   - 使用 NumPy/SciPy/Matplotlib
   - 包含清晰的函数注释
   - 输出结果到 results.json
   - 生成可视化图表到 plots/
   """
   
4. code = LLM.generate(Prompt)
5. 提取代码块（```python ... ```）
6. 写入 .planning/code/task-{id}.py
```

### 9.2 代码执行沙盒

```
步骤：
1. 检查 Python 环境（python3 --version）
2. 检查依赖库（import numpy/scipy/matplotlib）
3. 执行代码：
   python .planning/code/task-{id}.py
   
4. 捕获输出：
   - stdout：执行结果
   - stderr：错误信息
   
5. 检查输出文件：
   - results.json 存在且可解析
   - plots/ 目录有图片文件
```

### 9.3 错误处理流程

```
检测到错误：
1. 解析 traceback，定位问题
2. Prompt = """
   代码执行失败，请修复：
   
   原代码：{code}
   错误信息：{traceback}
   
   输出修复后的代码。
   """
   
3. code_fixed = LLM.generate(Prompt)
4. 重试执行（最多 5 次）

超过重试次数：
- 标记任务为 failed
- 存储最后一次错误信息
- 继续 DAG 中下一个任务
- 最终报告汇总所有失败任务
```

---

## 十、输出规范化细节

### 10.1 各阶段输出产物

| 阶段 | 输出文件 | 格式 | 必填内容 |
|------|---------|------|---------|
| Phase 1 | problem.md | Markdown | title, background, questions, constraints, objectives, keywords, summary, context_summary |
| Phase 2 | model.md | Markdown | modeling_method, formulas, variables, assumptions, derivation_steps |
| Phase 2 | formulas.json | JSON | equations[], variables[], assumptions[] |
| Phase 3 | results.json | JSON | status, data, metrics, execution_time, plots[] |
| Phase 3 | plots/*.png | PNG | 可视化图表 |
| Phase 4 | report.pdf | PDF | abstract, introduction, methodology, results, conclusion, references |

### 10.2 Schema 定义位置

```
.planning/schemas/
├── problem.schema.json
├── model.schema.json
├── formulas.schema.json
├── results.schema.json
└── report.schema.json
```

### 10.3 验证触发时机

| 时机 | 验证内容 | 验证方式 |
|------|---------|---------|
| problem.md 写入后 | 字段完整性 | Python 脚本 + Schema |
| model.md 写入后 | 方法选择合理 | LLM 评估 + Schema |
| results.json 写入后 | 结果有效 | JSON 解析检查 |
| report.pdf 生成后 | 章节完整 | PDF 解析检查 |

### 10.4 验证失败处理

```
验证失败：
1. 记录失败原因到 .planning/verification-errors.json
2. 显示给用户具体缺失项
3. 选项：
   - 自动修复（LLM 补充）
   - 手动修复（用户提供）
   - 跳过（YOLO 模式）
```

---

## 十一、报告生成实现细节（Phase 7）

> **资源已获取**：详见 `.planning/templates/report-generator.py` 和 `.planning/prompts/mm-agent-prompts.py`

### 11.1 报告生成架构

**核心类设计**（来自 report-generator.py）：

| 类 | 职责 | 输入 | 输出 |
|---|------|------|------|
| `OutlineGenerator` | 生成固定大纲结构 | task_count | List[Chapter] |
| `ContextExtractor` | 精细化上下文提取 | chapter + json_data | Dict[str, Any] |
| `PromptCreator` | 创建生成 Prompt | chapter + context + previous_chapters | prompt string |
| `LatexDocumentAssembler` | 组装 LaTeX 文档 | chapters + metadata | .tex file |
| `FileManager` | 保存 + 编译 PDF | latex_path | .pdf file |

### 11.2 固定大纲结构

**不让 LLM 自己决定结构，而是固定模板 + 动态扩展**：

```python
outline = [
    ["Problem Restatement", "Problem Background"],      # 问题背景
    ["Problem Restatement", "Problem Statement"],       # 问题陈述
    ["Model Assumptions"],                               # 模型假设
    ["Explanation of Assumptions"],                      # 假设解释
    ["Problem Analysis"],                                # 问题分析
    ["Problem Analysis", "Task 1 Analysis"],            # 动态：Task N 分析
    # ... 更多 Task N Analysis
    ["Solution to the Problem"],                         # 问题解决
    ["Solution to the Problem", "Task 1 Solution", "Model Setup"],     # 模型建立
    ["Solution to the Problem", "Task 1 Solution", "Model Calculation"], # 模型计算
    # ... 更多 Task N Solution
    ["Model Conclusion", "Model Advantages"],            # 模型优点
    ["Model Conclusion", "Model Limitations"],           # 模型局限
    ["Notation and Explanations"]                        # 符号说明
]
```

**动态生成规则**：
- Task 数量从 DAG 的 tasks 数量获取
- 每个 Task 生成 Analysis + Solution 两层结构

### 11.3 章节依赖关系图

**精细化上下文传递，避免全量污染**：

```python
chapter_relevance_map = {
    # Model Setup 只需要对应的 Task Analysis
    "Task 1 Solution > Model Setup": ["Problem Analysis > Task 1 Analysis"],
    
    # Model Calculation 需要 Analysis + Model Setup
    "Task 1 Solution > Model Calculation": [
        "Problem Analysis > Task 1 Analysis",
        "Task 1 Solution > Model Setup"
    ],
    
    # 结论需要所有 Task Solution
    "Model Conclusion > Model Advantages": [
        "Task 1 Solution > Model Calculation",
        "Task 2 Solution > Model Calculation",
        # ... 所有 Task
    ],
}
```

**传递机制**：
- 每个章节生成时，只加载依赖章节的内容
- 避免传递无关章节，减少 context 污染

### 11.4 精细化上下文提取

**ContextExtractor 只提取当前章节需要的 JSON 字段**：

```python
def get_context_for_chapter(chapter, json_data):
    if chapter.path == ["Problem Analysis", "Task 1 Analysis"]:
        return {
            "task_1": {
                "task_analysis": json_data["tasks"][0]["task_analysis"],
                "task_description": json_data["tasks"][0]["task_description"]
            }
        }
    
    elif chapter.path == ["Solution to the Problem", "Task 1 Solution", "Model Calculation"]:
        return {
            "task_1": {
                "formulas": json_data["tasks"][0]["preliminary_formulas"],
                "execution_result": json_data["tasks"][0]["execution_result"],
                "solution_interpretation": json_data["tasks"][0]["solution_interpretation"]
            }
        }
```

### 11.5 科学语言规范（硬编码 Prompt）

**关键要求**（来自 `PAPER_CHAPTER_PROMPT`）：

```python
PAPER_CHAPTER_PROMPT = """
## Requirements:
- Write exclusively in accurate, idiomatic LaTeX; avoid Markdown syntax
- Present as continuous, fluent narrative (no section headings, bullet points)
- Critically evaluate the structured draft, selecting only high-quality content
- Remove all redundancy, eliminate low-value statements
- Maintain rigorous academic style, logical coherence, and clarity
- Integrate naturally with preceding chapters (avoid repetition)
"""
```

**禁止行为**：
- ❌ Markdown 符号（`*`、`#` 等）
- ❌ Bullet points / Numbered lists
- ❌ 冗余低价值语句
- ❌ 与前置章节重复

**要求行为**：
- ✅ 连贯叙事段落
- ✅ 学术严谨风格
- ✅ 精炼高质量内容
- ✅ 与前置章节自然衔接

### 11.6 LaTeX 模板选择

**支持两种竞赛模板**：

| 模板 | 文件位置 | 适用竞赛 | 来源 |
|------|---------|---------|------|
| **mcmthesis** | `.planning/templates/mcmthesis/` | MCM/ICM 美赛 | [CTAN](https://ctan.org/pkg/mcmthesis) |
| **cumcmthesis** | `.planning/templates/cumcmthesis/` | CUMCM 国赛 | [latexstudio](https://github.com/latexstudio/CUMCMThesis) |

**模板特性对比**：

| 特性 | mcmthesis | cumcmthesis |
|------|-----------|-------------|
| Summary Sheet | ✅ 第一页摘要 | ❌ 无 |
| 页数限制 | 25页上限 | 无硬性限制 |
| 字体 | 英文（Palatino） | 中文支持（ctex） |
| 目录 | `\tableofcontents` | 无目录 |
| 附录代码 | `\begin{lstlisting}` | 可选 |

**使用方式**：

```latex
# 美赛模板
\documentclass{mcmthesis}
\mcmsetup{CTeX=false, tcn=2500001, problem=A, year=2025}

# 国赛模板
\documentclass{cumcmthesis}
\赛题类型{A}
\队号{2500001}
\年份{2025}
```

### 11.7 元数据生成规范

**自动生成 title/summary/keywords**：

```python
PAPER_INFO_PROMPT = """
Based on the paper chapters, generate:
1. A concise, descriptive title
2. A comprehensive summary (~400 words) covering:
   - Restatement and Clarification of the Problem
   - Explanation of Assumptions and Their Rationality
   - Model Design and Rationality Argumentation
   - Description of Model Testing and Sensitivity Analysis
3. 4-6 relevant keywords (general to specific)

Return JSON: {"title": "...", "summary": "...", "keywords": "kw1; kw2; kw3"}
"""
```

### 11.8 图表和代码附录

**自动添加可视化结果**：

```python
# 从 Memory 收集所有图表
metadata['figures'] = [
    os.path.join(code_dir, f) for f in os.listdir(code_dir) 
    if f.endswith('.png') or f.endswith('.jpg')
]

# 从 Memory 收集所有代码
metadata['codes'] = sorted([
    os.path.join(code_dir, f) for f in os.listdir(code_dir) 
    if f.endswith('.py')
])
```

**LaTeX 输出格式**：

```latex
\section{Appendix}
\subsubsection*{main1.py}
\begin{lstlisting}[language=Python, frame=single]
{代码内容}
\end{lstlisting}

\begin{figure}[H]
\includegraphics[width=0.5\textwidth]{plots/result.png}
\caption{结果可视化}
\end{figure}
```

### 11.9 PDF 编译流程

```python
def generate_pdf(latex_path):
    # 运行两次确保引用和目录正确
    subprocess.run(["pdflatex", "-interaction=nonstopmode", latex_path])
    subprocess.run(["pdflatex", "-interaction=nonstopmode", latex_path])
    
    # 清理临时文件
    for ext in ["aux", "log", "toc", "out"]:
        os.remove(latex_path.replace('.tex', f'.{ext}'))
```

### 11.10 资源文件路径

```
.planning/
├── templates/
│   ├── report-generator.py          # 报告生成完整逻辑
│   ├── mcmthesis/                   # 美赛模板
│   │   ├── mcmthesis.dtx            # 模板源文件
│   │   └── mcmthesis-demo.pdf       # 示例论文
│   └── cumcmthesis/                 # 国赛模板
│       ├── cumcmthesis.cls          # 模板类文件
│       ├── example.tex              # 示例源文件
│       └── example.pdf              # 示例论文
├── prompts/
│   └── mm-agent-prompts.py          # 38 个 Prompt 模板
└── knowledge/
    └── hmml.json                    # HMML 知识库
```

---

## 十二、边界情况处理细节

### 11.1 问题输入边界

| 情况 | 检测方法 | 处理 |
|------|---------|------|
| 文件不存在 | os.path.exists() | 报错并提示检查路径 |
| 格式不支持 | 扩展名检查 | 列出支持格式 |
| PDF 解析失败 | PyMuPDF 异常 | 提示转换为 MD/TXT |
| 文本为空 | len(text) == 0 | 报错"问题内容为空" |
| 问题太短（<100字） | len(text) < 100 | 警告"可能信息不足" |

### 11.2 附件处理机制

**设计决策**：

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 附件识别 | **LLM 自动识别** | 题目文本自然描述附件需求 |
| 附件查找 | **Glob 递归查找** | Claude Code 原生工具，无需额外脚本 |
| 错误处理 | **提示用户补充** | 避免静默失败，用户体验清晰 |

**流程**：

```
Phase 2 (parse-problem):
    ↓
Step 2.5: 提取附件引用 pattern
    ├── 题目说 "附件1_食堂数据.csv"
    ├── LLM 提取 pattern = "**/附件1*.csv"
    ↓
Step 2.6: Glob 递归查找
    ├── 从题目目录开始递归
    ├── 使用 Claude Code Glob 工具
    ↓
Step 2.7: 匹配验证
    ├── 找到 → attachments.json
    ├── 多个候选 → LLM 判断最匹配
    ├── 找不到 → 报错提示用户
```

**附件引用 pattern 提取**：

```python
# LLM 从题目文本识别附件引用
附件引用模式：
- "附件1"、"附件2"、"附表"
- "数据文件"、"提供的表格"
- "见附件"、"参考数据"

# 构造 Glob pattern
题目: "附件1_食堂历史运行数据.csv"
→ pattern: "**/附件1*.csv"

题目: "附件说明.txt"
→ pattern: "**/附件说明*"
```

**Claude Code 工具调用示例**：

```bash
# Step 2.6: 递归查找附件
Glob --pattern "**/*.csv" --path "{problem_directory}"
Glob --pattern "**/*.xlsx" --path "{problem_directory}"
Glob --pattern "**/附件说明*" --path "{problem_directory}"

# 如果找到附件说明文件，读取内容
Read --file "附件说明.txt"
# 从说明文件中提取更精确的附件名称
```

**输出产物**：

`attachments.json`：
```json
{
  "files": [
    {
      "mentioned_as": "附件1_食堂历史运行数据",
      "found_path": "春季补选/B题/附件1_食堂历史运行数据.csv",
      "type": "csv",
      "rows": 10000,
      "columns": ["日期", "时段", "进店人数", ...]
    },
    {
      "mentioned_as": "附件2_窗口信息",
      "found_path": "春季补选/B题/附件2_窗口信息.csv",
      "type": "csv",
      "rows": 50,
      "columns": ["窗口编号", "菜品类别", "平均出餐时间", ...]
    }
  ],
  "missing": []
}
```

**错误提示格式**：

```markdown
❌ 附件未找到

题目提及以下附件：
- 附件1: 食堂历史运行数据（CSV）
- 附件2: 窗口信息（CSV）
- 附件3: 特殊日期说明（CSV）

当前目录查找结果：
- 未找到匹配文件

请提供附件：
1. 将附件文件放入题目目录
2. 或手动指定路径：
   /mm-agent --problem NKUMMT_2026_B.pdf --attachments "附件1.csv,附件2.csv"
```

---

### 11.3 问题分解边界

| 情况 | 检测方法 | 处理 |
|------|---------|------|
| 无法分解 | LLM 输出无结构 | fallback: 整体作为单任务 |
| 分解过多（>10） | len(tasks) > 10 | 建议"任务较多，请简化" |
| 任务描述模糊 | description 缺少关键信息 | 让 LLM 提出澄清问题 |

### 11.4 DAG 边界

| 情况 | 检测方法 | 处理 |
|------|---------|------|
| 循环依赖 | 拓扑排序失败 | 报错，要求重新分解 |
| 孤立任务 | dependencies=[] 且无依赖者 | 可并行执行 |
| 单任务 | len(tasks) == 1 | 直接执行，无 DAG |

### 11.5 HMML 检索边界

| 情况 | 检测方法 | 处理 |
|------|---------|------|
| 无相关方法 | top score < 0.3 | 返回通用建模方法列表 |
| 方法过少 | len(results) < 3 | 扩大 top_k |

### 11.6 代码执行边界

| 情况 | 检测方法 | 处理 |
|------|---------|------|
| 语法错误 | Python traceback | 自动修复，最多 3 次 |
| 运行时错误 | 执行返回非 0 | 自动调试，最多 5 次 |
| 结果为空 | results.json 无 data | 重新生成代码 |
| 执行超时 | timeout=300s | 终止，标记失败 |

### 11.7 Actor-Critic 边界

| 情况 | 检测方法 | 处理 |
|------|---------|------|
| 迭代无改进 | score 不提升 | 达到 max_rounds 后接受当前方案 |
| Critic 不满意 | score < threshold | 继续迭代或标记"需人工审视" |

---

## 十三、测试策略细节

### 12.1 测试金字塔

```
E2E Tests（端到端）：
- 数量：开始时 3-5，后续用 MM-Bench
- 目的：验证完整流水线
- 成本：高（每任务 $0.5-1）

Integration Tests（集成）：
- 数量：10-20
- 目的：验证 DAG 流转、Memory 传递
- 成本：中

Unit Tests（单元）：
- 数量：20-50
- 目的：验证单个脚本、函数
- 成本：低（纯脚本）
```

### 12.2 冒烟测试用例设计

```yaml
# tests/smoke-test-cases.yaml
cases:
  - id: smoke-001
    name: "简单优化问题"
    input: "tests/fixtures/optimization-simple.md"
    expected_outputs:
      - problem.md 存在
      - model.md 存在
      - results.json 存在
      - status=completed
    timeout: 120s
    
  - id: smoke-002
    name: "预测类问题（有数据）"
    input: "tests/fixtures/prediction-with-data.md"
    data_file: "tests/fixtures/data.csv"
    expected_outputs:
      - HMML 检索返回预测方法
      - results.json 包含 accuracy
      - plots/ 包含图表
    timeout: 180s
    
  - id: smoke-003
    name: "多任务依赖问题"
    input: "tests/fixtures/multi-task.md"
    expected_outputs:
      - DAG 包含 ≥2 任务
      - execution-order.txt 存在
      - 所有 Memory 文件存在
    timeout: 240s
```

### 12.3 MM-Bench 集成时机

```
前置条件：
- 冒烟测试全部通过
- Phase 1-4 基础实现完成
- 输出格式验证稳定

集成步骤：
1. 从 MM-Bench 提取 2024-2025 赛题（避免训练数据泄露）
2. 每赛题运行完整工作流
3. 四维评估：
   - AE（分析评估）
   - MR（建模严谨性）
   - PS（实用性科学性）
   - RBA（结果偏差分析）
4. 与原版 MM-Agent 结果对比
```

---

## 十三、Claude Code 脚本调用细节

### 13.1 脚本位置约定

```
.claude/scripts/
├── hmml_retrieval.py        # HMML 检索
├── dag_topological_sort.py  # DAG 排序
├── validate_schema.py       # Schema 验证
├── load_dependency_memory.py # Memory 加载
├── execute_code.py          # 代码执行
├── parse_pdf.py             # PDF 解析
└── validate_report.py       # 报告验证
```

### 13.2 脚本输入输出约定

**统一约定**：

```
输入方式：
- 命令行参数（简单值）
- 临时文件（复杂内容）

输出方式：
- JSON 文件（结构化结果）
- stdout（简单值或状态）

错误处理：
- JSON 包含 "error" 字段
- stderr 输出详细错误信息
```

**示例**：

```bash
# 输入：文件路径参数
python hmml_retrieval.py --query-file query.txt --output results.json

# 输出：JSON 文件
# results.json 内容：
{
  "methods": [...],
  "error": null
}

# 或错误情况：
{
  "methods": [],
  "error": "embedding 模型加载失败"
}
```

### 13.3 Agent 调用脚本模式

```markdown
<!-- Agent 定义中 -->
<process>
## Step X: 执行检索
执行 Bash 命令：
```bash
python .claude/scripts/hmml_retrieval.py \
  --query-file .planning/memory/task-desc.txt \
  --output .planning/memory/retrieved.json
```

读取结果：
```bash
Read .planning/memory/retrieved.json
```

如果 error != null：处理错误
如果 methods 存在：继续使用
</process>
```

---

## 十四、Hooks 配置细节

### 14.1 PostToolUse Hook

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "command": "python .claude/scripts/validate_schema.py",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

**用途**：
- Write 写入 JSON/MD 文件后自动验证
- 检查 Schema 合规性
- 输出验证结果

### 14.2 PreToolUse Hook

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "command": "node .claude/scripts/check-python-env.js",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

**用途**：
- Bash 执行 Python 前检查环境
- 验证依赖库可用

---

## 十五、用户交互设计

### 15.1 命令参数

```bash
/mm-agent --problem <file> [--interactive] [--skip-verify] [--phase N]
```

| 参数 | 作用 | 默认行为 |
|------|------|---------|
| --problem | 问题文件路径 | 必需 |
| --interactive | 逐步确认模式 | 自动执行 |
| --skip-verify | YOLO 模式，跳过验证 | 启用验证 |
| --phase | 从指定阶段继续 | 从头开始 |

### 15.2 进度显示

```
输出格式：
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 MM-Agent ► Phase 1: Problem Analysis
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Parsing problem...
◆ Building DAG (3 tasks detected)
◆ Execution order: 1 → 2 → 3

───────────────────────────────────────────────────────────────

Task 1: [pending] 数据预处理
Task 2: [pending] 建立预测模型  
Task 3: [pending] 模型评估
```

### 15.3 错误消息模板

```
❌ 验证失败: {具体问题}

文件: {file_path}
缺失: {missing_field}

修复建议:
1. {具体操作}
2. {备选方案}

选项:
- 自动修复 (推荐)
- 手动输入
- 跳过验证 (--skip-verify)
```

---

## 十六、关键设计决策总结

### 16.1 选型决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 框架复用 | GSD | 已验证的编排模式，避免重新发明 |
| 知识检索 | 预计算 embedding | 确定性计算，LLM 不擅长 |
| 任务依赖 | DAG + 拓扑排序 | 数学建模特有需求 |
| 迭代改进 | Actor-Critic | 单次生成质量不稳定 |
| 状态持久化 | JSON 文件 | 简单，可读，可追踪 |
| 代码执行 | Python 沙盒 | 数学建模需要数值计算 |

### 16.2 实现优先级

```
必须实现（Phase 1-2）：
1. 问题解析 → problem.md
2. 任务分解 → DAG
3. HMML 检索
4. Actor-Critic 建模

必须实现（Phase 3-4）：
5. 代码生成执行
6. 结果存储
7. 报告生成

可后续优化：
8. 双 Agent Actor-Critic
9. Web UI
10. MM-Bench 自动评估
```

### 16.3 风险点

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| LLM 生成质量不稳定 | 高 | 建模方案差 | Actor-Critic 多轮迭代 |
| 代码执行失败 | 中 | 无结果 | 自动调试 + 复试机制 |
| DAG 循环依赖 | 低 | 无法执行 | 拓扑排序检测 |
| HMML 检索不相关 | 低 | 方法错配 | 扩大搜索范围 |
| Memory 丢失 | 低 | 上下文断裂 | 文件持久化 |

---

## 附录

### A. 文件路径约定

```
项目根目录/
├── .claude/
│   ├── skills/mm-agent/
│   │   ├── SKILL.md
│   │   └── coordinator.md
│   ├── agents/
│   │   ├── mm-agent-modeler.md
│   │   ├── mm-agent-programmer.md
│   │   ├── mm-agent-reporter.md
│   └── scripts/
│       ├── hmml_retrieval.py
│       ├── dag_topological_sort.py
│       └── ...
├── .planning/
│   ├── knowledge/
│   │   ├── hmml.json
│   │   ├── hmml-embeddings.npy
│   │   └── embedding-meta.json
│   ├── memory/
│   │   ├── dag.json
│   │   ├── execution-order.txt
│   │   ├── task-*.json
│   │   └── retrieved-methods.json
│   ├── schemas/
│   │   ├── problem.schema.json
│   │   └── ...
│   └── phases/
│       ├── 01-problem-analysis/
│       ├── 02-modeling/
│       ├── 03-simulation/
│       └── 04-report/
└── tests/
    ├── smoke-test-cases.yaml
    └── fixtures/
```

### B. 外部资源链接

- 论文：https://arxiv.org/abs/2505.14148
- LLM-MM-Agent 仓库：https://github.com/usail-hkust/LLM-MM-Agent
- GSD Framework：https://github.com/gsd-build/get-shit-done
- Claude Code 文档：https://claude.ai/code

---

*文档创建：2026-04-10*
*用途：作为 GSD 工作流的完整设计上下文*