# LLM-MM-Agent 工程实现分析报告

> 基于论文官方工程仓库 [usail-hkust/LLM-MM-Agent](https://github.com/usail-hkust/LLM-MM-Agent) 的完整代码分析
> 分析日期: 2025-05-07

---

## 1. 仓库概览

### 1.1 目录结构

```
LLM-MM-Agent/
├── MMAgent/                    # 核心 Agent 代码
│   ├── main.py                 # 入口文件
│   ├── agent/                  # Agent 类定义
│   │   ├── base_agent.py       # ABC 基类
│   │   ├── coordinator.py      # 协调器：DAG + Memory
│   │   ├── problem_analysis.py # 问题理解：Actor-Critic
│   │   ├── problem_decompse.py # 任务分解 + 细化
│   │   ├── retrieve_method.py  # HMML 方法检索
│   │   ├── task_solving.py     # 任务求解：建模 + 编码 + 调试
│   │   ├── data_description.py # 数据描述摘要
│   │   └── create_charts.py    # 图表生成
│   ├── llm/
│   │   └── llm.py              # LLM API 封装
│   ├── prompt/
│   │   ├── template.py         # 所有 Prompt 模板
│   │   ├── constants.py        # 常量
│   │   └── decompose_prompt.json # 分解原则配置
│   ├── utils/
│   │   ├── utils.py            # 文件 I/O、JSON 解析、Markdown 转换
│   │   ├── problem_analysis.py # 问题分析流水线编排
│   │   ├── mathematical_modeling.py # 建模流水线编排
│   │   ├── computational_solving.py # 求解流水线编排
│   │   ├── solution_reporting.py    # 论文生成
│   │   ├── embedding.py        # 嵌入评分（gte-multilingual-base）
│   │   └── convert_format.py   # Markdown ↔ JSON 转换
│   ├── HMML/
│   │   ├── HMML.md             # 层次化方法库（Markdown 源）
│   │   └── HMML.json           # 转换后的 JSON 结构
│   └── code_template/
│       └── main1.py ~ main10.py # 代码模板（每个任务一个）
├── MMBench/                    # 基准测试集
│   ├── dataset/                # 数据集文件
│   └── problem/                # 问题 JSON 文件
└── config.yaml                 # 配置文件
```

### 1.2 技术依赖

| 依赖 | 用途 |
|------|------|
| openai | LLM API 调用（兼容 DeepSeek、Qwen 等） |
| torch + transformers | 嵌入模型推理 |
| tiktoken | Token 计数 |
| json5 | 容错 JSON 解析 |
| pyyaml | 配置文件 |

---

## 2. 架构设计

### 2.1 四阶段流水线

`main.py` 是入口，按顺序执行四个阶段：

```python
# Stage 1: Problem Analysis
problem, order, with_code, coordinator, task_descriptions, solution = problem_analysis(...)

# Stage 2 & 3: Mathematical Modeling & Computational Solving（按 DAG 顺序迭代）
for id in order:
    task_description, task_analysis, task_modeling_formulas, task_modeling_method, dependent_file_prompt = mathematical_modeling(...)
    solution = computational_solving(...)

# Stage 4: Solution Reporting（论文生成，代码中标记为 optional）
paper = generate_paper(...)
```

**关键观察：**
- Stage 2 和 3 是**交织执行**的（每个任务先建模再求解），不是先全部建模再全部求解
- Stage 4（论文生成）在 main.py 中被注释为 `# optional`
- 执行顺序由 DAG 拓扑排序决定，支持任务间依赖

### 2.2 Agent 类继承体系

```
BaseAgent (ABC)
├── ProblemUnderstanding    # 问题理解 + 建模方案
├── ProblemDecompose        # 任务分解 + 细化
├── Coordinator             # DAG + Memory（不继承 BaseAgent，直接持有 LLM）
├── MethodRetriever         # HMML 检索
├── TaskSolver              # 任务求解全流程
├── DataDescription         # 数据摘要
└── ChartCreator            # 图表生成
```

**BaseAgent** 极简：
```python
class BaseAgent(ABC):
    def __init__(self, llm):
        self.llm = llm
```

所有 Agent 都持有同一个 `llm` 实例，共享 API 配额和连接。

### 2.3 Memory 系统

Coordinator 维护两个内存字典：

```python
class Coordinator:
    def __init__(self, llm):
        self.memory = {}        # 任务结果：{task_id: {task_description, task_analysis, ...}}
        self.code_memory = {}   # 代码结构：{task_id: code_structure_json}
        self.DAG = {}           # 依赖图
```

**跨任务上下文传递机制：**
- 每个任务完成后，结果存入 `coordinator.memory[str(task_id)]`
- 后续依赖任务通过 `get_dependency_prompt()` 从 memory 中读取前序任务的：
  - `task_description`
  - `mathematical_modeling_process`
  - `code_structure`（来自 code_memory）
  - `solution_interpretation`
- 依赖信息被格式化为 prompt 前缀，注入到当前任务的分析/公式/建模 prompt 中

---

## 3. 各 Agent 详细分析

### 3.1 ProblemUnderstanding（问题理解）

**核心：双重 Actor-Critic 循环**

```python
class ProblemUnderstanding(BaseAgent):
    def analysis(self, modeling_problem, round=3):
        # Actor: 初始分析
        problem_analysis = self.analysis_actor(modeling_problem)
        # Critic: 迭代优化
        for i in range(round):
            critique = self.analysis_critic(modeling_problem, problem_analysis)
            problem_analysis = self.analysis_improvement(modeling_problem, problem_analysis, critique)
        return problem_analysis

    def modeling(self, modeling_problem, problem_analysis, round=3):
        # Actor: 初始建模方案
        modeling_solution = self.modeling_actor(modeling_problem, problem_analysis)
        # Critic: 迭代优化
        for i in range(round):
            critique = self.modeling_critic(modeling_problem, problem_analysis, modeling_solution)
            modeling_solution = self.modeling_improvement(modeling_problem, problem_analysis, modeling_solution, critique)
        return modeling_solution
```

**两个循环的区别：**
1. `analysis()` — 优化**问题理解**（5个维度：深度、原创性、批判性、严谨性、上下文意识）
2. `modeling()` — 优化**建模方案**（4个维度：问题分析理解、模型开发严谨性、数据结果分析、假设局限性）

**配置参数：**
- `problem_analysis_round`: 问题理解迭代轮数（默认 3）
- `problem_modeling_round`: 建模方案迭代轮数（默认 3）

**Prompt 模板（6个）：**
- `PROBLEM_ANALYSIS_PROMPT` — Actor: 深度分析问题
- `PROBLEM_ANALYSIS_CRITIQUE_PROMPT` — Critic: 5维度批判
- `PROBLEM_ANALYSIS_IMPROVEMENT_PROMPT` — 改进: 基于批判优化
- `PROBLEM_MODELING_PROMPT` — Actor: 设计数学模型
- `PROBLEM_MODELING_CRITIQUE_PROMPT` — Critic: 4维度批判
- `PROBLEM_MODELING_IMPROVEMENT_PROMPT` — 改进: 基于批判优化

### 3.2 ProblemDecompose（任务分解）

```python
class ProblemDecompose(BaseAgent):
    def decompose_and_refine(self, modeling_problem, problem_analysis, modeling_solution, problem_type, tasknum):
        # Step 1: 分解
        decomposed_subtasks = self.decompose(...)
        # Step 2: 逐个细化
        for task_i in range(len(decomposed_subtasks)):
            refined_subtask = self.refine(..., task_i)
            decomposed_subtasks[task_i] = refined_subtask
        return decomposed_subtasks
```

**关键设计：**
- 分解原则从 `decompose_prompt.json` 加载，按问题类型（C/D/E 等）和任务数量（3/4/5）选择不同的分解策略
- 分解后对每个子任务单独调用 `refine()` 细化描述
- 子任务用 `---` 分隔符分割

### 3.3 Coordinator（协调器）

```python
class Coordinator:
    def analyze_dependencies(self, ...):
        # Step 1: 依赖分析（LLM 生成）
        task_dependency_analysis = self.analyze(...)
        # Step 2: DAG 构建（LLM 生成 JSON，重试 5 次）
        for i in range(5):
            try:
                dependency_DAG = self.dag_construction(...)
                self.DAG = json5.loads(dependency_DAG)
                break
            except:
                continue
        # Step 3: 拓扑排序
        order = self.compute_dag_order(self.DAG)
        return order
```

**容错机制：**
- DAG JSON 解析失败时重试 5 次
- 5 次都失败则使用默认 DAG（线性依赖：`{1: [], 2: ['1'], 3: ['1'], ...}`）

### 3.4 MethodRetriever（HMML 检索）

```python
class MethodRetriever(BaseAgent):
    def __init__(self, llm, rag=True):
        # 加载 HMML（Markdown → JSON 树）
        self.method_tree = markdown_to_json_method(self.markdown_text)
        # 初始化嵌入评分器
        self.embedding_scorer = EmbeddingScorer()

    def retrieve_meethods(self, problem_description, top_k=6, method='embedding'):
        # 层次化评分（parent_weight=0.5, child_weight=0.5）
        method_scores = MethodScorer(score_func).process(self.method_tree)
        method_scores.sort(key=lambda x: x['score'], reverse=True)
        return self.format_methods(method_scores[:top_k])
```

**HMML 评分机制：**
- `EmbeddingScorer` 使用 `Alibaba-NLP/gte-multilingual-base` 模型
- 计算查询与每个方法的余弦相似度 × 100
- `MethodScorer` 实现层次化分数传播：`final_score = parent_avg × 0.5 + child_score × 0.5`
- 默认返回 top 6 个方法

**注意：** 论文说用 BGE-m3，但代码实际用的是 `gte-multilingual-base`。

### 3.5 TaskSolver（任务求解）

这是最复杂的 Agent，包含多个子功能：

```python
class TaskSolver(BaseAgent):
    def analysis(self, prompt, task_description): ...           # 任务分析
    def formulas_actor(self, ...): ...                          # 公式 Actor
    def formulas_critic(self, ...): ...                         # 公式 Critic
    def formulas_improvement(self, ...): ...                    # 公式改进
    def modeling(self, ...): ...                                # 完整建模（含 Actor-Critic）
    def coding_actor(self, ...): ...                            # 代码生成
    def coding_debugger(self, ...): ...                         # 代码调试
    def coding(self, ...): ...                                  # 完整编码（含重试）
    def result(self, ...): ...                                  # 结果解释
    def answer(self, ...): ...                                  # 答案综合
    def extract_code_structure(self, ...): ...                  # 代码结构提取
```

**代码执行与调试循环：**

```python
def coding(self, ..., try_num=5, round=1):
    for i in range(try_num):          # 最多 5 次大重试
        iteration = 0
        max_iteration = 3
        while iteration < max_iteration:  # 每次最多 3 轮调试
            if iteration == 0:
                code, observation = self.coding_actor(...)  # 首次生成
            else:
                code, observation = self.coding_debugger(...)  # 调试修复
            
            # 检查是否成功（无 Traceback/SyntaxError/IndentationError）
            if "Traceback" not in observation and "SyntaxError" not in observation:
                return code, True, observation
            iteration += 1
    return code, False, None
```

**关键实现细节：**
- 代码从 LLM 输出中提取 ` ```python ... ``` ` 块
- 执行使用 `subprocess.Popen` + `selectors` 实时读取 stdout/stderr
- 观察结果超过 2000 token 时截断
- 语法错误/缩进错误触发调试，其他错误直接重试

### 3.6 PaperGenerator（论文生成）

```python
class PaperGenerator:
    def generate_paper(self, json_data, metadata, output_dir, filename):
        # 1. 创建大纲结构
        chapters = self.outline_generator.create_outline(task_count)
        # 2. 逐章生成内容（带相关性映射）
        for chapter in chapters:
            context = self.context_extractor.get_context_for_chapter(chapter, json_data)
            relevant_chapters = self._get_relevant_chapters(chapter, completed_chapters, relevance_map)
            prompt = self.prompt_creator.create_prompt(chapter, context, relevant_chapters)
            chapter.content = self.content_generator.generate_chapter_content(prompt)
        # 3. 生成元信息（标题、摘要、关键词）
        complete_metadata = self._complete_metadata(chapters, metadata)
        # 4. 组装 LaTeX 文档
        document = self.document_assembler.create_document(chapters, complete_metadata)
        # 5. 保存 + 编译 PDF
        self.file_manager.save_to_file(document, latex_path)
        self.file_manager.generate_pdf(latex_path)
```

**论文结构：**
```
Problem Restatement
├── Problem Background
└── Problem Statement
Model Assumptions
Explanation of Assumptions
Problem Analysis
├── Task 1 Analysis
├── Task 2 Analysis
└── ...
Solution to the Problem
├── Task 1 Solution
│   ├── Model Setup: Assumptions and Chain Models
│   └── Model Calculation
├── Task 2 Solution
│   ├── Model Setup: Assumptions and Chain Models
│   └── Model Calculation
└── ...
Model Conclusion
├── Model Advantages
└── Model Limitations
Notation and Explanations
```

**相关性映射（Chapter Relevance Map）：**
- 每个章节只引用与其相关的前序章节，避免上下文窗口爆炸
- 例如："Task 1 Calculation" 只引用 "Task 1 Analysis" 和 "Task 1 Model Setup"
- "Model Conclusion" 引用所有任务的计算和建模结果

---

## 4. LLM 封装层

### 4.1 LLM 类

```python
class LLM:
    def __init__(self, model_name, key):
        # 根据模型名自动选择 API base
        if model_name in ['deepseek-chat', 'deepseek-reasoner']:
            self.api_base = os.getenv('DEEPSEEK_API_BASE')
        elif model_name in ['qwen2.5-72b-instruct']:
            self.api_base = "https://dashscope.aliyuncs.com/compatible-mode/v1"
        elif model_name in ['gpt-4o', 'gpt-4']:
            self.api_base = os.getenv('OPENAI_API_BASE')
        
        self.client = openai.Client(api_key=key, base_base=self.api_base)

    def generate(self, prompt, system="You are a helpful assistant.", usage=True):
        response = self.client.chat.completions.create(
            model=self.model_name,
            messages=[
                {'role': 'system', 'content': system},
                {'role': 'user', 'content': prompt}
            ],
            temperature=0.7,
            top_p=1.0,
        )
        return response.choices[0].message.content
```

**关键设计：**
- 使用 OpenAI 兼容 API，支持多提供商
- 全局 `usages` 列表跟踪 token 消耗
- `reset()` 方法可运行时切换模型/API
- temperature=0.7 平衡创造性和一致性

### 4.2 Prompt 模板统计

从 `prompt/template.py` 提取的所有 Prompt：

| Prompt 变量 | 对应论文 Figure | 用途 |
|------------|----------------|------|
| `PROBLEM_PROMPT` | Fig 15 | 问题模板 |
| `DATA_DESCRIPTION_PROMPT` | Fig 14 | 数据描述 |
| `PROBLEM_ANALYSIS_PROMPT` | Fig 16 | 问题理解 Actor |
| `PROBLEM_ANALYSIS_CRITIQUE_PROMPT` | Fig 17 | 问题理解 Critic |
| `PROBLEM_ANALYSIS_IMPROVEMENT_PROMPT` | Fig 18 | 问题理解改进 |
| `PROBLEM_MODELING_PROMPT` | Fig 23 | 建模方案 Actor |
| `PROBLEM_MODELING_CRITIQUE_PROMPT` | Fig 24 | 建模方案 Critic |
| `PROBLEM_MODELING_IMPROVEMENT_PROMPT` | Fig 25 | 建模方案改进 |
| `TASK_DECOMPOSE_PROMPT` | Fig 19 | 任务分解 |
| `TASK_DESCRIPTION_PROMPT` | Fig 20 | 任务描述细化 |
| `TASK_DEPENDENCY_ANALYSIS_PROMPT` | Fig 21 | 依赖分析 |
| `DAG_CONSTRUCTION_PROMPT` | Fig 22 | DAG 构建 |
| `TASK_ANALYSIS_PROMPT` | — | 任务分析 |
| `TASK_FORMULAS_PROMPT` | Fig 23 | 公式构建 Actor |
| `TASK_FORMULAS_CRITIQUE_PROMPT` | Fig 24 | 公式 Critic |
| `TASK_FORMULAS_IMPROVEMENT_PROMPT` | Fig 25 | 公式改进 |
| `TASK_MODELING_PROMPT` | Fig 26 | 建模过程 |
| `TASK_CODING_PROMPT` | Fig 27 | 代码生成 |
| `TASK_CODING_DEBUG_PROMPT` | Fig 28 | 代码调试 |
| `CODE_STRUCTURE_PROMPT` | Fig 29 | 代码结构提取 |
| `TASK_RESULT_PROMPT` | Fig 30 | 结果解释（无代码） |
| `TASK_RESULT_WITH_CODE_PROMPT` | Fig 30 | 结果解释（有代码） |
| `TASK_ANSWER_PROMPT` | Fig 31 | 答案综合 |
| `METHOD_CRITIQUE_PROMPT` | — | 方法评分 |
| `PAPER_CHAPTER_PROMPT` | Fig 33 | 论文章节生成 |
| `PAPER_CHAPTER_WITH_PRECEDING_PROMPT` | Fig 34 | 带前文的章节生成 |
| `PAPER_INFO_PROMPT` | Fig 36 | 论文元信息 |
| `PAPER_NOTATION_PROMPT` | Fig 35 | 符号表生成 |

**共 28 个 Prompt，覆盖论文全部 Figure 10-36。**

---

## 5. HMML（层次化数学方法库）

### 5.1 结构

```markdown
# HMML.md（简化示例）
## Operations Research
### Programming Theory
#### Linear Programming
- modeling method: Linear Programming
- core idea: Optimization using linear objectives and constraints
- application: Production planning, resource allocation
```

### 5.2 解析流程

```
HMML.md (Markdown)
    ↓ markdown_to_json_method()
HMML.json (JSON 树)
    ↓ MethodScorer.process()
带评分的方法列表
    ↓ sort by score
Top-K 方法
```

### 5.3 评分算法

```python
class MethodScorer:
    def __init__(self, score_func, parent_weight=0.5, child_weight=0.5):
        # score_func: 嵌入相似度或 LLM 评分
    
    def _process_node(self, node, parent_scores):
        # 对叶节点：final_score = parent_avg × 0.5 + child_score × 0.5
        # 对中间节点：仅计算分数，传播给子节点
```

---

## 6. 与 mm-agent 的差异分析

### 6.1 架构差异

| 维度 | LLM-MM-Agent | mm-agent |
|------|-------------|----------------|
| **运行环境** | Python 脚本（CLI） | Claude Code Skills/Agents |
| **LLM 调用** | 直接 OpenAI API | Claude Code 内置模型 |
| **Agent 通信** | 函数调用 + 共享 memory dict | Skill/Agent 工具调用 |
| **Actor-Critic** | 方法级循环（3轮） | prompt 模板（无实际调用） |
| **代码执行** | subprocess + selector | Bash 工具 |
| **状态管理** | Coordinator.memory 字典 | 文件系统（.planning/） |
| **论文生成** | 完整 PaperGenerator 类 | 引用不存在的模块 |

### 6.2 Prompt 差异

| Prompt | LLM-MM-Agent | mm-agent |
|--------|-------------|----------------|
| Problem Understanding Actor | ✅ 完整实现 | ❌ 缺失 |
| Problem Understanding Critic | ✅ 完整实现 | ❌ 缺失 |
| Problem Understanding Improvement | ✅ 完整实现 | ❌ 缺失 |
| Modeling Solution Actor | ✅ 完整实现 | ❌ 缺失 |
| Modeling Solution Critic | ✅ 完整实现 | ❌ 缺失 |
| Modeling Solution Improvement | ✅ 完整实现 | ❌ 缺失 |
| Task Decompose | ✅ 完整实现 | 部分（coordinator.md） |
| Task Description Refinement | ✅ 完整实现 | ❌ 缺失 |
| Task Dependency Analysis | ✅ 完整实现 | 部分（coordinator.md） |
| DAG Construction | ✅ 完整实现 | ✅ dag_topological_sort.py |
| Method Retrieval | ✅ 完整实现（embedding） | ✅ hmml_retrieval.py |
| Task Analysis | ✅ 完整实现 | ❌ 缺失 |
| Formulas Actor-Critic | ✅ 完整实现 | ❌ 仅 prompt 模板 |
| Code Generation | ✅ 完整实现 | 部分（code-execution.md） |
| Code Debugging | ✅ 完整实现（subprocess） | ❌ 空函数 |
| Code Structure Extraction | ✅ 完整实现 | ❌ 缺失 |
| Result Interpretation | ✅ 完整实现 | ❌ 缺失 |
| Solution Formulation | ✅ 完整实现 | ❌ 缺失 |
| Chart Generation | ✅ 完整实现 | ❌ 缺失 |
| Paper Chapter Creation | ✅ 完整实现 | 断裂（导入失败） |
| Paper Meta Information | ✅ 完整实现 | ❌ 缺失 |
| Paper Notation | ✅ 完整实现 | ❌ 缺失 |
| Evaluation (4维度) | ❌ 未实现 | ❌ 缺失 |

### 6.3 mm-agent 的独特价值

尽管实现上有差距，mm-agent 有几个独特优势：

1. **Claude Code 原生集成** — 无需单独配置 API Key，继承用户模型配置
2. **知识积累** — `knowledge/` 目录有手工调优的写作风格、排版指南、配色方案
3. **DAG 脚本独立** — `dag_topological_sort.py` 是独立可用的工具
4. **HMML 预计算** — 支持离线嵌入预计算，减少运行时开销
5. **模板系统** — `cumcmthesis` LaTeX 模板支持中文论文格式

---

## 7. 关键工程洞察

### 7.1 Actor-Critic 是核心模式

论文中 Actor-Critic 出现在**三个层次**：
1. **问题理解层** — analysis_actor → analysis_critic → analysis_improvement
2. **建模方案层** — modeling_actor → modeling_critic → modeling_improvement
3. **公式层** — formulas_actor → formulas_critic → formulas_improvement

每个层次都是独立的 3 轮迭代，总共可能产生 **9 次 Critic 调用**。

### 7.2 Memory 是跨任务的桥梁

Coordinator 的 memory 系统是整个架构的核心：
- 每个任务的输出（分析、公式、代码、结果）都存入 memory
- 后续任务通过 `get_dependency_prompt()` 读取依赖任务的 memory
- 依赖信息被格式化为结构化 prompt，注入到当前任务的上下文中
- 这实现了论文描述的"信息传递和任务间通信"

### 7.3 代码执行的容错设计

```python
# 三层容错：
# 1. 代码格式重试（5次）：确保 LLM 输出包含 ```python 块
# 2. 执行调试循环（3轮）：修复运行时错误
# 3. 整体重试（5次）：从头重新生成
```

### 7.4 论文生成的相关性映射

PaperGenerator 不是把所有前序章节都注入 prompt，而是通过 `chapter_relevance_map` 精确控制：
- 每个章节只引用 **语义相关** 的前序内容
- 这避免了上下文窗口溢出，同时保证了内容连贯性

### 7.5 配置驱动的行为

`config.yaml` 控制关键参数：
```yaml
problem_analysis_round: 3    # 问题理解迭代轮数
problem_modeling_round: 3    # 建模方案迭代轮数
task_formulas_round: 1       # 公式迭代轮数
tasknum: 4                   # 任务分解数量
top_method_num: 6            # HMML 检索 top-k
chart_num: 3                 # 每个任务生成图表数
```

---

## 8. 对 mm-agent 的启示

### 8.1 必须实现的核心模式

1. **三层次 Actor-Critic** — 问题理解、建模方案、公式，每个都要有完整的 Actor→Critic→Improvement 循环
2. **Coordinator Memory** — 跨任务上下文传递机制
3. **代码调试循环** — 不是空函数，而是真实的 LLM 修复 + 重试
4. **Prompt 完整性** — 28 个 Prompt 缺一不可

### 8.2 Claude Code 适配策略

| 原始实现 | Claude Code 适配 |
|---------|-----------------|
| `LLM.generate()` | Claude Code Agent 工具调用 |
| `Coordinator.memory` | 文件系统持久化（.planning/） |
| `subprocess` 执行 | Bash 工具 |
| `BaseAgent` 继承 | Agent .md 文件定义 |
| `config.yaml` | SKILL.md frontmatter 参数 |
| 直接 API 调用 | Skill 工具链式调用 |

### 8.3 报告生成的正确实现

`templates/report-generator.py` 的代码逻辑是正确的（PaperGenerator 类），但它：
1. 导入了不存在的模块（`prompt.template`, `llm.llm`, `utils.utils`）
2. 文件名不匹配（连字符 vs 下划线）
3. 路径不匹配（`templates/` vs `src/scripts/`）

**修复方案：** 将 LLM-MM-Agent 的 `solution_reporting.py` + `template.py` 中的相关 prompt 整合进来，替换断裂的导入。
