# Phase 3: Task Decomposition with DAG - Research

**Researched:** 2026-04-11
**Domain:** Task dependency management with DAG and Memory System
**Confidence:** HIGH

## Summary

Phase 3 implements the core task decomposition and dependency orchestration system for MM-Agent. This phase transforms the structured problem.md from Phase 2 into a Directed Acyclic Graph (DAG) of dependent tasks, performs topological sorting to determine execution order, implements cycle detection, and establishes the Memory System for context passing between tasks.

The research confirms that Python's built-in `graphlib.TopologicalSorter` class (available since Python 3.9) provides a complete, battle-tested solution for topological sorting and cycle detection without requiring external dependencies. This aligns with the project's "minimal dependencies" principle while maintaining correctness and performance.

**Primary recommendation:** Use Python's `graphlib.TopologicalSorter` for all DAG operations, implement Memory System as JSON files in `.planning/memory/`, and follow the DAG schema defined in IDEA.md §3.5 and Memory schema from IDEA.md §7.2.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Decision D-01: 渐进分解策略**
- Phase 3 只处理简单一对一分解（每个 question → 一个 task）
- 复杂场景（如一个 question 需多个建模步骤）由 Phase 5 Actor-Critic 处理
- 分离关注点，Phase 3 聚焦 DAG 结构，Phase 5 聚焦建模细节
- Implementation: Phase 3 直接将 problem.md 的 questions 映射为 tasks

**Decision D-02: 循环依赖 → 报错退出 → 详细错误 → 用户决定**
- 循环依赖是结构性问题，自动拆解可能违背用户建模意图
- 数学建模的任务依赖关系有语义意义，不是纯技术 DAG
- 用户在场讨论比自动化更安全
- Implementation: 检测到循环依赖时输出详细错误报告并等待用户选择

**Decision D-03: DAG Format（已锁定）**
- 使用 IDEA.md §3.5 定义的基础 schema
- Schema 包含 tasks 字典和 execution_order 列表
- 每个任务有 description、dependencies、status 字段

**Decision D-04: Memory Schema（已锁定）**
- 使用 IDEA.md §7.2 定义的结构
- 包含 task_id、phase、status、task_description、mathematical_modeling_process、solution_interpretation 等字段
- 支持代码结构、图表等扩展字段

### Claude's Discretion

- **Task ID 格式:** 数字 ID（1, 2, 3...）还是带前缀（task-1）？建议使用数字 ID，更简洁
- **并行执行:** 拓扑排序后入度同时为 0 的任务是否并行执行？v1 可顺序执行，v2 可优化

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TASK-01 | 系统可识别赛题中的多个子问题 | LLM-based task decomposition from problem.md questions field |
| TASK-02 | 系统可分析子问题间的依赖关系并构建 DAG | graphlib.TopologicalSorter with Kahn's algorithm |
| TASK-03 | 系统可对 DAG 进行拓扑排序确定执行顺序 | TopologicalSorter.static_order() or get_ready()/done() pattern |
| TASK-04 | 系统可检测 DAG 中的循环依赖并报错 | CycleError exception from TopologicalSorter.prepare() |
| TASK-05 | 系统可输出 dag.json 和 execution-order.txt | JSON persistence + text file for human readability |
| MEM-01 | 系统可在任务开始时加载依赖任务的 Memory | JSON file loading from .planning/memory/task-{id}.json |
| MEM-02 | 系统可在任务完成时写入 Memory 文件（task-{id}.json） | JSON write with timestamp and status updates |
| MEM-03 | 系统可传递上下文信息给后续任务 | Memory file concatenation for dependency context |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `graphlib` (Python stdlib) | 3.9+ | Topological sorting and cycle detection | Built-in, battle-tested, no dependency, O(V+E) complexity |
| `json` (Python stdlib) | 3.x | DAG and Memory file persistence | Standard library, simple and reliable |
| `pathlib` (Python stdlib) | 3.x | File path operations | Modern, cross-platform path handling |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pytest | 9.0.2 | Unit and integration testing | Testing DAG operations, Memory I/O, cycle detection |
| jsonschema | TBD | Schema validation | Optional: validate dag.json and task-{id}.json structure |
| NetworkX | 3.x | Advanced DAG analysis | Optional: for visualization, transitive closure, future features |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| graphlib | NetworkX topological_sort | NetworkX provides richer graph API but adds heavy dependency; graphlib is stdlib and sufficient |
| JSON files | SQLite database | Files are simpler for v1, no deployment complexity; DB would add operational overhead |
| Hand-roll algorithm | Kahn's or DFS implementation | TopologicalSorter is stdlib, battle-tested, handles edge cases |

**Installation:**
```bash
# Core libraries are in stdlib - no install needed
# Testing (already installed in environment):
pip3 show pytest  # Should show 9.0.2 or later

# Optional schema validation:
pip3 install jsonschema

# Optional advanced DAG features (not needed for v1):
pip3 install networkx
```

**Version verification:**
```bash
# pytest version - verified
python3 --version  # 3.14.3 (includes graphlib)
pip3 show pytest   # 9.0.2

# jsonschema (if needed)
pip3 show jsonschema || pip3 install jsonschema
```

## Architecture Patterns

### Recommended Project Structure

```
.claude/
├── scripts/
│   ├── dag_topological_sort.py      # Topological sort and cycle detection
│   ├── load_dependency_memory.py    # Load dependency Memory files
│   └── validate_dag.py              # Validate DAG structure (optional)
│
├── agents/
│   └── mm-agent-coordinator.md      # Updated to handle Phase 3 operations
│
└── skills/mm-agent/
    └── task-decomposition.md        # New skill for Phase 3

.planning/memory/
├── dag.json                         # DAG structure and task status
├── execution-order.txt              # Topological sort result
├── task-1.json                      # Task 1 Memory
├── task-2.json                      # Task 2 Memory
└── ...

tests/
├── test_dag_operations.py           # DAG construction, sorting, cycle detection
├── test_memory_system.py            # Memory I/O, context passing
└── conftest.py                      # Shared fixtures for test data
```

### Pattern 1: Topological Sort with graphlib.TopologicalSorter

**What:** Use Python's built-in `TopologicalSorter` class for DAG operations including topological sorting and cycle detection.

**When to use:** All Phase 3 DAG operations - task ordering, cycle detection, dependency resolution.

**Example:**
```python
# Source: https://docs.python.org/3/library/graphlib.html
from graphlib import TopologicalSorter, CycleError

def build_and_sort_dag(tasks_data):
    """
    Build DAG and perform topological sort.

    Args:
        tasks_data: Dict with task_id -> {description, dependencies}

    Returns:
        Tuple: (dag_dict, execution_order, cycle_info)
    """
    # Build graph for TopologicalSorter
    graph = {}
    for task_id, task_info in tasks_data.items():
        graph[task_id] = set(task_info['dependencies'])

    sorter = TopologicalSorter(graph)

    # Try to prepare - this detects cycles
    try:
        sorter.prepare()
    except CycleError as e:
        # Cycle detected: e.args[1] contains the cycle path
        cycle_path = e.args[1]  # List of nodes forming the cycle
        return None, None, {'has_cycle': True, 'cycle': cycle_path}

    # Get execution order
    execution_order = list(sorter.static_order())

    # Build DAG dict with status
    dag_dict = {
        'tasks': {
            task_id: {
                'description': task_info['description'],
                'dependencies': task_info['dependencies'],
                'status': 'pending'
            }
            for task_id, task_info in tasks_data.items()
        },
        'execution_order': execution_order
    }

    return dag_dict, execution_order, {'has_cycle': False}
```

### Pattern 2: Memory File I/O

**What:** JSON-based Memory files for task results and context passing.

**When to use:** Loading dependency context before task execution, storing task results after completion.

**Example:**
```python
import json
from pathlib import Path
from datetime import datetime

def load_dependency_memory(task_id: str, memory_dir: Path) -> str:
    """
    Load Memory files for all dependencies of a task.

    Args:
        task_id: Current task ID
        memory_dir: Path to memory directory

    Returns:
        Formatted context string from all dependency memories
    """
    dag_path = memory_dir / 'dag.json'
    with open(dag_path) as f:
        dag = json.load(f)

    dependencies = dag['tasks'][task_id]['dependencies']
    context_parts = []

    for dep_id in dependencies:
        memory_path = memory_dir / f'task-{dep_id}.json'
        with open(memory_path) as f:
            memory = json.load(f)

        context_parts.append(f"""
---
# Task {dep_id}: {memory['task_description']}

## Status
{memory['status']}

## Result Interpretation
{memory.get('solution_interpretation', 'N/A')}

## Code Outputs
{json.dumps(memory.get('code_structure', {}).get('file_outputs', []), indent=2)}
---
""")

    return '\n'.join(context_parts)

def write_task_memory(task_id: str, memory_data: dict, memory_dir: Path):
    """
    Write task Memory file with timestamp.

    Args:
        task_id: Task ID
        memory_data: Memory content dict
        memory_dir: Path to memory directory
    """
    timestamp = datetime.now().isoformat()
    memory_data['task_id'] = task_id
    memory_data['updated_at'] = timestamp
    if 'created_at' not in memory_data:
        memory_data['created_at'] = timestamp

    memory_path = memory_dir / f'task-{task_id}.json'
    with open(memory_path, 'w', encoding='utf-8') as f:
        json.dump(memory_data, f, indent=2, ensure_ascii=False)
```

### Pattern 3: Cycle Detection and Error Reporting

**What:** Detect circular dependencies and provide detailed error messages for user resolution.

**When to use:** When constructing DAG from problem.md or validating user-provided DAG.

**Example:**
```python
def format_cycle_error(cycle_path: list, tasks_data: dict) -> str:
    """
    Format detailed error message for circular dependency.

    Args:
        cycle_path: List of task IDs forming the cycle
        tasks_data: Dict of task_id -> task_info

    Returns:
        Formatted error message
    """
    cycle_str = " → ".join(cycle_path + [cycle_path[0]])  # Close the loop

    deps_detail = []
    for task_id in cycle_path:
        task = tasks_data[task_id]
        deps = task.get('dependencies', [])
        deps_detail.append(f"- Task {task_id}: depends on {deps}")

    return f"""❌ 循环依赖检测失败

循环链: {cycle_str}

任务依赖详情:
{chr(10).join(deps_detail)}

修复建议:
1. 检查任务描述是否有逻辑矛盾
2. 考虑拆解某个任务打破循环
3. 手动调整 DAG 结构

选项:
- 重新分解任务
- 手动编辑 dag.json
- 退出并检查问题描述
"""
```

### Pattern 4: LLM-Based Dependency Analysis

**What:** Use LLM to analyze task descriptions and infer dependencies.

**When to use:** Initial DAG construction from problem.md questions.

**Example:**
```python
def analyze_task_dependencies(questions: list) -> dict:
    """
    Analyze task dependencies using LLM.

    Args:
        questions: List of question strings from problem.md

    Returns:
        Dict of task_id -> {description, dependencies}
    """
    prompt = f"""分析以下任务的依赖关系，输出 JSON 格式：

任务列表：
{chr(10).join(f"{i+1}. {q}" for i, q in enumerate(questions))}

输出格式：
{{
  "tasks": {{
    "1": {{"description": "任务1描述", "dependencies": []}},
    "2": {{"description": "任务2描述", "dependencies": ["1"]}}
  }}
}}

规则：
- 如果任务B需要任务A的结果，则B依赖A
- 使用数字ID（1, 2, 3...）
- 返回纯JSON，无markdown格式
"""

    # LLM generates JSON response here
    # ... implementation depends on LLM API choice

    return llm_generated_tasks
```

### Anti-Patterns to Avoid

- **Implementing topological sort from scratch:** Use `graphlib.TopologicalSorter` - it's stdlib, tested, handles edge cases
- **Ignoring cycle detection:** Always call `prepare()` before `static_order()` - it raises `CycleError`
- **Using mutable task IDs:** Stick to string or integer IDs, avoid changing them during execution
- **Bypassing Memory system:** Always read/write through Memory files, never use in-memory dict
- **Mixing status tracking locations:** Keep task status only in `dag.json`, not scattered across files

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Topological sorting algorithm | Kahn's or DFS implementation | `graphlib.TopologicalSorter` | Built-in, battle-tested, O(V+E) complexity |
| Cycle detection | Custom DFS with visited sets | `TopologicalSorter.prepare()` + `CycleError` | Already detects cycles with detailed cycle path |
| JSON validation | Custom schema checks | `jsonschema` library (optional) | Standardized validation, better error messages |
| Task ID generation | Custom numbering schemes | Simple sequential integers (1, 2, 3...) | Simple, unambiguous, human-readable |
| File path handling | String concatenation | `pathlib.Path` | Cross-platform, avoids path separator issues |

**Key insight:** Python's standard library already provides production-ready solutions for the core Phase 3 functionality. Building custom implementations would increase maintenance burden and risk subtle bugs in edge cases.

## Common Pitfalls

### Pitfall 1: Missing Dependencies in Task Data

**What goes wrong:** Tasks reference non-existent dependencies, causing KeyError or incorrect ordering.

**Why it happens:** LLM-generated dependencies may include invalid task IDs, or manual DAG editing introduces typos.

**How to avoid:**
- Validate all dependency IDs exist in tasks dict before building graph
- Add validation step in DAG construction script
- Provide clear error message: "Task 3 depends on unknown task ID: 'X'"

**Warning signs:** KeyError when accessing tasks dict, incomplete execution order

### Pitfall 2: Forgetting to Call prepare()

**What goes wrong:** Calling `static_order()` without `prepare()` works but may miss cycle detection.

**Why it happens:** `static_order()` internally calls `prepare()`, but error messages are less detailed than calling `prepare()` explicitly.

**How to avoid:**
- Always call `prepare()` explicitly before any other operations
- Catch `CycleError` and format detailed error message
- Document that `prepare()` is required for cycle detection

**Warning signs:** Cycle not detected, infinite loops in execution

### Pitfall 3: Memory File Race Conditions

**What goes wrong:** Multiple phases reading/writing Memory files concurrently causes corruption.

**Why it happens:** GSD framework may execute phases in parallel without proper coordination.

**How to avoid:**
- Ensure sequential execution: Phase 3 completes before Phase 4 starts
- Use file locking if parallel execution is introduced in v2
- Add atomic write pattern: write to temp file, then rename

**Warning signs:** JSON parse errors, corrupted Memory files

### Pitfall 4: Inconsistent Status Tracking

**What goes wrong:** Task status updated in Memory file but not in dag.json, or vice versa.

**Why it happens:** Separate update paths for Memory and DAG, inconsistent error handling.

**How to avoid:**
- Single source of truth: keep status only in `dag.json`
- Memory files are read-only append: only write new fields, don't update status
- Create helper function that updates both consistently

**Warning signs:** Status mismatches between files, tasks marked completed but Memory missing

### Pitfall 5: Circular Dependencies in Production

**What goes wrong:** User provides problem with circular dependencies, workflow crashes ungracefully.

**Why it happens:** Mathematical modeling problems can have legitimate cyclic references in their description.

**How to avoid:**
- Always detect and report cycles with detailed information
- Provide actionable repair suggestions
- Allow manual DAG editing to break cycles
- Don't auto-fix cycles - may break user intent

**Warning signs:** `CycleError` exception with no user guidance, workflow stops silently

## Code Examples

### Building DAG from problem.md

```python
import yaml
from pathlib import Path
from graphlib import TopologicalSorter, CycleError

def build_dag_from_problem(problem_md_path: Path):
    """
    Build DAG from problem.md questions field.

    Returns:
        Tuple: (dag_dict, execution_order, error_message)
    """
    # Read problem.md
    with open(problem_md_path) as f:
        content = f.read()

    # Parse YAML frontmatter and questions
    # ... (implementation depends on format)

    questions = parse_questions(content)

    # Analyze dependencies using LLM
    tasks_data = analyze_task_dependencies(questions)

    # Build and validate DAG
    graph = {
        task_id: set(task_info['dependencies'])
        for task_id, task_info in tasks_data.items()
    }

    sorter = TopologicalSorter(graph)

    try:
        sorter.prepare()
    except CycleError as e:
        cycle_path = e.args[1]
        error_msg = format_cycle_error(cycle_path, tasks_data)
        return None, None, error_msg

    execution_order = list(sorter.static_order())

    dag_dict = {
        'tasks': {
            task_id: {
                'description': task_info['description'],
                'dependencies': task_info['dependencies'],
                'status': 'pending'
            }
            for task_id, task_info in tasks_data.items()
        },
        'execution_order': execution_order
    }

    return dag_dict, execution_order, None
```

### Loading Dependency Context

```python
import json
from pathlib import Path

def load_task_context(task_id: str, memory_dir: Path) -> dict:
    """
    Load full context for a task including all dependencies.

    Returns:
        Dict with:
        - 'task_description': current task description
        - 'dependencies': list of dependency task IDs
        - 'dependency_context': formatted context from dependencies
    """
    dag_path = memory_dir / 'dag.json'
    with open(dag_path) as f:
        dag = json.load(f)

    task_info = dag['tasks'][task_id]
    dependencies = task_info['dependencies']

    context_parts = []
    for dep_id in dependencies:
        mem_path = memory_dir / f'task-{dep_id}.json'
        with open(mem_path) as f:
            mem = json.load(f)

        context_parts.append({
            'task_id': dep_id,
            'description': mem['task_description'],
            'status': mem['status'],
            'result': mem.get('solution_interpretation', '')
        })

    return {
        'task_description': task_info['description'],
        'dependencies': dependencies,
        'dependency_context': context_parts
    }
```

### Writing Memory File

```python
import json
from datetime import datetime
from pathlib import Path

def create_initial_memory(task_id: str, task_description: str, memory_dir: Path):
    """
    Create initial Memory file when task starts.
    """
    timestamp = datetime.now().isoformat()

    memory_data = {
        'task_id': task_id,
        'phase': 'task-decomposition',
        'status': 'in_progress',
        'task_description': task_description,
        'created_at': timestamp,
        'updated_at': timestamp
    }

    memory_path = memory_dir / f'task-{task_id}.json'
    with open(memory_path, 'w', encoding='utf-8') as f:
        json.dump(memory_data, f, indent=2, ensure_ascii=False)

def update_task_completion(task_id: str, result: dict, memory_dir: Path):
    """
    Update Memory file when task completes.
    """
    memory_path = memory_dir / f'task-{task_id}.json'
    with open(memory_path) as f:
        memory_data = json.load(f)

    memory_data['status'] = 'completed'
    memory_data['solution_interpretation'] = result.get('interpretation', '')
    memory_data['updated_at'] = datetime.now().isoformat()

    # Add optional fields if provided
    if 'code_structure' in result:
        memory_data['code_structure'] = result['code_structure']
    if 'charts' in result:
        memory_data['charts'] = result['charts']

    with open(memory_path, 'w', encoding='utf-8') as f:
        json.dump(memory_data, f, indent=2, ensure_ascii=False)
```

### Topological Sort Script (CLI)

```python
#!/usr/bin/env python3
"""
CLI script for topological sort and cycle detection.

Usage:
    python .claude/scripts/dag_topological_sort.py \\
        --input .planning/memory/dag.json \\
        --output .planning/memory/execution-order.txt
"""

import json
import argparse
from pathlib import Path
from graphlib import TopologicalSorter, CycleError

def main():
    parser = argparse.ArgumentParser(description='Perform topological sort on DAG')
    parser.add_argument('--input', required=True, help='Input DAG JSON file')
    parser.add_argument('--output', required=True, help='Output execution order file')
    args = parser.parse_args()

    # Load DAG
    with open(args.input) as f:
        dag_data = json.load(f)

    # Build graph
    graph = {
        task_id: set(task_info['dependencies'])
        for task_id, task_info in dag_data['tasks'].items()
    }

    sorter = TopologicalSorter(graph)

    try:
        sorter.prepare()
    except CycleError as e:
        cycle_path = e.args[1]
        print(f"ERROR: Circular dependency detected")
        print(f"Cycle: {' -> '.join(cycle_path + [cycle_path[0]])}")
        exit(1)

    # Get execution order
    execution_order = list(sorter.static_order())

    # Write output
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w') as f:
        f.write('\n'.join(execution_order))

    print(f"SUCCESS: Execution order written to {args.output}")
    print(f"Tasks: {len(execution_order)}")

if __name__ == '__main__':
    main()
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual Kahn's algorithm implementation | `graphlib.TopologicalSorter` | Python 3.9 (2020) | No need to implement topological sort, stdlib is battle-tested |
| In-memory DAG only | JSON file persistence | v1 design decision | Enables state recovery, debugging, and manual inspection |
| No cycle detection | `CycleError` exception | Python 3.9 | Built-in cycle detection with detailed cycle path |
| Dict-based Memory | JSON file Memory | v1 design decision | Simpler than DB, sufficient for single-user workflow |

**Deprecated/outdated:**
- Writing custom topological sort implementations: `graphlib` provides everything needed
- Using `heapq` for topological sort: Incorrect use case, `graphlib` is purpose-built
- Circular dependency auto-fix: User intervention is safer for mathematical modeling

## Open Questions

1. **LLM Dependency Analysis Accuracy**
   - What we know: LLM can analyze natural language dependencies
   - What's unclear: Accuracy of inferred dependencies without explicit statements
   - Recommendation: Start with LLM-based analysis, add manual review prompt if uncertain

2. **Task Granularity Boundaries**
   - What we know: Simple 1:1 mapping for v1 per Decision D-01
   - What's unclear: When does a single question become multiple tasks?
   - Recommendation: v1 uses 1:1, Phase 5 Actor-Critic can subdivide if needed

3. **Parallel Execution Strategy**
   - What we know: `TopologicalSorter.get_ready()` returns all ready nodes
   - What's unclear: Whether v1 should support parallel execution
   - Recommendation: v1 sequential (simpler), v2 add parallel support with ThreadPoolExecutor

4. **Memory Schema Evolution**
   - What we know: Base schema defined in IDEA.md §7.2
   - What's unclear: How schema changes across phases (Phase 5 adds formulas, Phase 6 adds code)
   - Recommendation: Schema is append-only - each phase adds fields without modifying existing ones

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.x | Core runtime | ✓ | 3.14.3 | — |
| graphlib (stdlib) | Topological sort | ✓ | Built-in | — |
| json (stdlib) | File persistence | ✓ | Built-in | — |
| pathlib (stdlib) | Path handling | ✓ | Built-in | — |
| pytest | Testing | ✓ | 9.0.2 | — |
| jsonschema | Schema validation (optional) | ✗ | — | Manual validation or skip |

**Missing dependencies with no fallback:**
- None - all core functionality available via stdlib

**Missing dependencies with fallback:**
- jsonschema: Schema validation can be done manually with try/except and field checking

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 |
| Config file | None - use default pytest discovery |
| Quick run command | `pytest tests/test_dag_operations.py -v -x` |
| Full suite command | `pytest tests/ -v --cov=.planning/phases/03-task-decomposition-with-dag` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TASK-01 | Identify subproblems from problem.md | unit | `pytest tests/test_task_decomposition.py::test_identify_subproblems -x` | ❌ Wave 0 |
| TASK-02 | Build DAG with dependencies | unit | `pytest tests/test_dag_operations.py::test_build_dag -x` | ❌ Wave 0 |
| TASK-03 | Topological sort execution order | unit | `pytest tests/test_dag_operations.py::test_topological_sort -x` | ❌ Wave 0 |
| TASK-04 | Detect circular dependencies | unit | `pytest tests/test_dag_operations.py::test_cycle_detection -x` | ❌ Wave 0 |
| TASK-05 | Output dag.json and execution-order.txt | integration | `pytest tests/test_dag_operations.py::test_dag_output -x` | ❌ Wave 0 |
| MEM-01 | Load dependency Memory | unit | `pytest tests/test_memory_system.py::test_load_dependencies -x` | ❌ Wave 0 |
| MEM-02 | Write Memory file | unit | `pytest tests/test_memory_system.py::test_write_memory -x` | ❌ Wave 0 |
| MEM-03 | Pass context to dependent tasks | integration | `pytest tests/test_memory_system.py::test_context_passing -x` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pytest tests/test_dag_operations.py tests/test_memory_system.py -v -x`
- **Per wave merge:** `pytest tests/ -v`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/test_dag_operations.py` — DAG construction, topological sort, cycle detection tests
- [ ] `tests/test_memory_system.py` — Memory I/O, context passing tests
- [ ] `tests/test_task_decomposition.py` — LLM-based task decomposition tests
- [ ] `tests/conftest.py` — Shared fixtures for test data (sample DAGs, Memory files)
- [ ] `.claude/scripts/dag_topological_sort.py` — Topological sort CLI script
- [ ] `.claude/scripts/load_dependency_memory.py` — Memory loading CLI script

## Sources

### Primary (HIGH confidence)

- [Python graphlib Module Documentation](https://docs.python.org/3/library/graphlib.html) — TopologicalSorter class, methods, CycleError exception, code examples
- [Topological Sorting (Wikipedia)](https://en.wikipedia.org/wiki/Topological_sorting) — Algorithms, complexity, cycle detection principles
- [Kahn's Algorithm (Wikipedia)](https://en.wikipedia.org/wiki/Kahn%27s_algorithm) — Implementation details, O(V+E) complexity
- [NetworkX DAG Algorithms](https://networkx.org/documentation/stable/reference/algorithms/dag.html) — Alternative library for advanced DAG operations

### Secondary (MEDIUM confidence)

- [IDEA.md §3.5](../IDEA.md#35-dag任务依赖图设计) — DAG schema definition (locked decision)
- [IDEA.md §6.1-6.4](../IDEA.md#六dag管理实现细节) — DAG construction, topological sort, status management patterns
- [IDEA.md §7.2](../IDEA.md#72-memory-json-schema) — Memory schema definition (locked decision)
- [03-CONTEXT.md](./03-CONTEXT.md) — User decisions D-01 to D-04 (locked decisions)
- [REQUIREMENTS.md](../REQUIREMENTS.md) — TASK-01~05, MEM-01~03 requirements

### Tertiary (LOW confidence)

- [Python jsonschema Library](https://python-jsonschema.readthedocs.io/) — Schema validation (optional, not verified in this research)
- [pytest Documentation](https://docs.pytest.org/) — Testing framework (verified version 9.0.2 installed)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - graphlib is stdlib, verified Python 3.14.3 includes it
- Architecture: HIGH - IDEA.md schemas are locked decisions, graphlib patterns verified
- Pitfalls: MEDIUM - Based on common DAG/Memory issues, some depend on LLM accuracy
- Environment: HIGH - Python 3.14.3 and pytest 9.0.2 verified installed

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (30 days - stdlib interfaces stable, IDEA.md decisions locked)