# Domain Pitfalls: Mathematical Modeling Multi-Agent System

**Domain:** 数学建模多智能体系统 (MM-Agent in Claude Code)
**Researched:** 2026-04-10
**Confidence:** MEDIUM

## Executive Summary

数学建模多智能体系统结合了 LLM Agent 编排、数值计算和学术报告生成。其核心陷阱包括：(1) Agent 层面的无限循环和死锁；(2) 数学计算的数值精度问题；(3) 任务依赖图的循环检测遗漏；(4) 多阶段流水线的错误级联；(5) Claude Code 上下文窗口管理失效。理解这些陷阱是构建可靠端到端流水线的关键。

---

## Critical Pitfalls

### Pitfall 1: Agent 无限循环 (Infinite Loop)

**What goes wrong:** Agent 在 Actor-Critic 迭代或代码执行重试中无法退出，持续消耗 Token 且不产生有效输出。

**Why it happens:**
- 迭代终止条件判断逻辑错误（score 比较使用严格大于而非大于等于）
- 重试没有最大次数限制
- Agent 生成的 "修复" 代码与原代码相同，形成闭环

**Consequences:**
- Token 快速耗尽
- Claude Code 会话崩溃或超时
- 无法生成任何有效输出

**Prevention:**
```python
# Always implement explicit loop limits
max_iterations = 3
for iteration in range(max_iterations):
    result = actor.generate()
    score = critic.evaluate(result)
    if score >= quality_threshold:
        break
    # Ensure progress - if same result twice, force exit
    if iteration > 0 and result == previous_result:
        break
```

**Detection:**
- 日志记录每次迭代的 score 值
- 监控 Token 消耗速率（异常加速表示可能进入循环）
- 设置单次执行的最大 Token 上限

**Phase:** Phase 5 (Actor-Critic 迭代) 和 Phase 6 (代码执行重试)

---

### Pitfall 2: DAG 循环依赖 (Circular Dependency)

**What goes wrong:** 任务分解产生的依赖图存在循环，导致拓扑排序失败或系统死锁。

**Why it happens:**
- 子问题分析时产生相互依赖（如 A 的求解依赖 B，B 的求解依赖 A）
- LLM 生成的依赖关系未经循环检测
- 缺少对 "自环"（任务依赖自身）的检测

**Consequences:**
- 拓扑排序抛出异常
- 执行顺序无法确定
- 系统卡在任务调度阶段

**Prevention:**
```python
# Always validate DAG before execution
def validate_dag(tasks: list[Task]) -> bool:
    # Check for self-loops
    for task in tasks:
        if task.id in task.dependencies:
            raise CircularDependencyError(f"Task {task.id} depends on itself")
    
    # Check for cycles using DFS
    visited = set()
    rec_stack = set()
    
    def has_cycle(node):
        visited.add(node)
        rec_stack.add(node)
        for dep in get_dependencies(node):
            if dep not in visited:
                if has_cycle(dep):
                    return True
            elif dep in rec_stack:
                return True
        rec_stack.remove(node)
        return False
    
    for task in tasks:
        if task.id not in visited:
            if has_cycle(task.id):
                raise CircularDependencyError("Cycle detected in task dependencies")
    return True
```

**Detection:**
- 任务添加时立即验证
- 绘制依赖图可视检查（.planning/research/ 中保存 DAG.png）

**Phase:** Phase 3 (任务分解和 DAG 构建)

---

### Pitfall 3: 数值计算精度灾难 (Numerical Precision Catastrophe)

**What goes wrong:** 数学模型生成的代码存在浮点数精度问题，导致结果错误或 NaN/Inf 传播。

**Why it happens:**
- LLM 生成的代码未考虑数值稳定性（如除以接近零的数）
- 浮点累积误差（如 0.1 + 0.2 != 0.3）
- 大数运算溢出或小数下溢

**Consequences:**
- 报告中的图表显示异常值
- 优化算法不收敛
- 结果与预期相差数十个数量级

**Prevention:**
```python
# Add numerical safety checks in generated code
def safe_divide(a, b, default=0.0):
    """Safe division with zero-check"""
    if abs(b) < 1e-10:
        return default
    return a / b

# Use tolerance for equality comparisons
def floats_equal(a, b, tol=1e-9):
    return abs(a - b) < tol
```

**Detection:**
- 代码执行后检查结果是否为 NaN/Inf
- 对比理论边界值（如概率应在 [0,1]，和应为 1）

**Phase:** Phase 6 (代码生成和执行)

---

### Pitfall 4: 上下文窗口耗尽 (Context Window Exhaustion)

**What goes wrong:** 多阶段流水线中上下文信息不断累积，超过 Claude Code 的窗口限制。

**Why it happens:**
- Memory System 每次保存完整历史而非增量
- 多个 Agent 共享上下文但未清理中间状态
- 报告生成时加载所有历史数据

**Consequences:**
- API 返回 context overflow 错误
- 流水线在后期阶段崩溃
- 需要重新开始整个流程

**Prevention:**
```python
# Implement context budget management
MAX_CONTEXT_TOKENS = 150000  # Leave buffer below limit
CHUNK_SIZE = 50000  # Load in chunks when needed

def estimate_token_count(text: str) -> int:
    return len(text) // 4  # Rough estimate

def ensure_context_budget(context: str, max_tokens: int = MAX_CONTEXT_TOKENS):
    while estimate_token_count(context) > max_tokens:
        # Remove oldest non-essential entries
        context = trim_old_entries(context, keep_recent=True)
    return context
```

**Detection:**
- 每次 Agent 调用前估算 Token 数
- 监控剩余 Token 比例（低于 20% 时触发清理）

**Phase:** 跨所有阶段，尤其是 Phase 7 (报告生成) 需要加载所有前置结果

---

### Pitfall 5: 错误级联传播 (Error Cascade)

**What goes wrong:** 早期阶段的错误（如问题解析不完整）在后续阶段被放大，导致整个流水线失败。

**Why it happens:**
- 缺少阶段性验证（每个阶段输出是否有效）
- 错误信息未向下传递，下游阶段基于错误输入继续执行
- 没有 "快速失败" 机制

**Consequences:**
- 用户看到错误但不知道根本原因
- 浪费后续阶段的 Token 和时间
- 难以调试（不知道哪个阶段出了问题）

**Prevention:**
```python
# Stage validation before proceeding
def validate_problem_output(output: ProblemOutput) -> bool:
    required_fields = ['background', 'objectives', 'constraints', 'data']
    for field in required_fields:
        if not hasattr(output, field) or not output.field:
            raise StageValidationError(f"Problem missing required field: {field}")
    
    # Validate field content
    if len(output.background) < 50:
        raise StageValidationError("Problem background too short, parsing may have failed")
    
    return True

# Each stage should validate input before processing
def execute_stage(stage_name: str, input_data, validator):
    if not validator(input_data):
        raise InputValidationError(f"{stage_name} received invalid input")
    
    result = process_stage(input_data)
    if not validate_output(result):
        raise OutputValidationError(f"{stage_name} produced invalid output")
    
    return result
```

**Detection:**
- 每个阶段设置最小输出长度/字段数
- 记录每个阶段的执行时间和输出大小（异常小可能表示失败）

**Phase:** 跨所有阶段，建议在 Phase 1 实现基础验证框架

---

## Moderate Pitfalls

### Pitfall 6: HMML 检索失效 (Knowledge Retrieval Failure)

**What goes wrong:** 检索到的建模方法与实际问题不匹配，导致生成的模型不适用。

**Why it happens:**
- Embedding 模型对数学领域理解不足
- 方法描述与实际问题表述差异大
- Top-k 返回的方法都不合适

**Consequences:**
- 生成的模型无法解决目标问题
- 浪费 Actor-Critic 迭代次数

**Prevention:**
- 使用数学领域特定的 embedding 模型（如已有针对 STEM 的微调版本）
- 增加 "方法不适用" 的检测，让 LLM 主动拒绝不相关结果
- 保留无检索结果的降级策略（直接基于问题推理）

**Phase:** Phase 4 (HMML 知识检索)

---

### Pitfall 7: 代码执行超时 (Execution Timeout)

**What goes wrong:** 生成的 Python 代码运行时间过长，导致流水线卡死。

**Why it happens:**
- LLM 生成无限循环代码
- 数值算法收敛太慢（如梯度下降步长太小）
- 大数据处理未优化

**Prevention:**
```python
import signal

class TimeoutError(Exception):
    pass

def timeout_handler(signum, frame):
    raise TimeoutError("Code execution exceeded time limit")

# Set 60 second timeout
signal.signal(signal.SIGALRM, timeout_handler)
signal.alarm(60)

try:
    exec(code, {})
finally:
    signal.alarm(0)  # Cancel alarm
```

**Phase:** Phase 6 (代码执行)

---

### Pitfall 8: PDF 解析失败静默 (Silent PDF Parse Failure)

**What goes wrong:** PDF 解析出错但系统继续执行，导致后续阶段基于空输入工作。

**Why it happens:**
- 加密 PDF 无法读取
- 扫描版 PDF（图像）无文本层
- 编码问题导致乱码

**Prevention:**
```python
def parse_pdf(file_path: str) -> str:
    try:
        text = extract_text(file_path)
        if not text or len(text.strip()) < 100:
            raise ParseError(f"Extracted text too short: {len(text)} chars")
        return text
    except Exception as e:
        raise ParseError(f"PDF parsing failed: {e}")
```

**Phase:** Phase 2 (问题解析)

---

### Pitfall 9: 报告模板失效 (Template Failure)

**What goes wrong:** LaTeX 模板渲染失败或生成的 PDF 格式错误。

**Why it happens:**
- 特殊字符未转义（如 %, $, _ in LaTeX）
- 图表路径错误
- 中文字体未配置

**Prevention:**
- 对用户输入进行 LaTeX 转义
- 使用模板变量而非字符串拼接
- 生成后验证 PDF 可读性

**Phase:** Phase 7 (报告生成)

---

## Minor Pitfalls

### Pitfall 10: 多模型配置冲突

**What goes wrong:** 不同的 Agent 使用不同的模型配置，导致输出格式不一致。

**Prevention:** 统一在 Skill 中定义模型配置，所有 Agent 继承相同设置。

### Pitfall 11: 状态文件竞争

**What goes wrong:** 并行任务同时写入 JSON 状态文件导致数据损坏。

**Prevention:** 使用文件锁或顺序写入后刷新。

### Pitfall 12: 迭代阈值设置不当

**What goes wrong:** Actor-Critic 的质量阈值设置过高导致永远无法达标，或设置过低导致质量不足。

**Prevention:** 默认 8/10 分，允许用户配置，结合 max_rounds 硬限制。

---

## Phase-Specific Warnings

| Phase | Likely Pitfall | Mitigation |
|-------|---------------|------------|
| Phase 1 (Foundation) | 上下文窗口耗尽 | 限制 Memory System 保存内容，使用增量而非全量 |
| Phase 2 (Problem Parse) | PDF 解析失败静默 | 添加解析结果验证，失败时明确提示用户 |
| Phase 3 (Task Decomposition) | DAG 循环依赖 | 每次添加依赖后立即验证 DAG 有效性 |
| Phase 4 (HMML Retrieval) | 检索失效 | 降级策略：无结果时基于问题直接推理 |
| Phase 5 (Actor-Critic) | 无限循环 | 强制 max_rounds=3，检测重复输出 |
| Phase 6 (Code Execution) | 数值精度灾难 + 执行超时 | 添加安全除法函数，设置 60s 超时 |
| Phase 7 (Report Gen) | 模板失效 + 上下文耗尽 | LaTeX 转义，分块加载历史数据 |

---

## Sources

| Source | Confidence | Relevance |
|--------|------------|-----------|
| [MM-Agent Paper (arXiv 2505.14148)](https://arxiv.org/abs/2505.14148) | HIGH | 核心架构，四阶段流水线 |
| [LLM-MM-Agent Repository](https://github.com/usail-hkust/LLM-MM-Agent) | MEDIUM | 实现细节，服务器过期问题 |
| [Floating-Point Arithmetic (Wikipedia)](https://en.wikipedia.org/wiki/Floating-point_arithmetic) | HIGH | 数值精度基础 |
| [Python Floating Point Tutorial](https://docs.python.org/3/tutorial/floatingpoint.html) | HIGH | 常见精度问题 |
| [Topological Sort Cycle Detection](https://en.wikipedia.org/wiki/Topological_sorting) | HIGH | DAG 验证基础 |

---

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Agent Infinite Loops | HIGH | 通用 LLM Agent 问题，有明确解决方案 |
| DAG Circular Dependencies | HIGH | 经典图论问题，有标准检测算法 |
| Numerical Precision | HIGH | 数学计算基础问题 |
| Context Exhaustion | MEDIUM | Claude Code 特有，需验证实际窗口限制 |
| Error Cascade | MEDIUM | 架构设计问题，需实践验证 |
| HMML Retrieval | MEDIUM | 新领域，检索质量依赖 Embedding |