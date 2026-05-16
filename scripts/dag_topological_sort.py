#!/usr/bin/env python3
"""
CLI script for analyzing task dependencies and performing topological sort on a DAG.

This script loads a tasks.json file, analyzes dependencies using LLM,
performs topological sorting to determine execution order, and writes
output files (dag.json and execution-order.txt).

Per Decision D-02: Circular dependency → error exit with detailed error message.

Usage:
    python3 dag_topological_sort.py --input tasks.json --output dag.json
"""

import argparse
import json
import sys
from graphlib import TopologicalSorter, CycleError
from pathlib import Path
from typing import Dict, List, Tuple, Optional


def analyze_task_dependencies(tasks_data: Dict) -> Dict:
    """
    Analyze task dependencies using LLM.

    For v1, uses a simple heuristic based on keyword matching in task descriptions.
    Future enhancement would use LLM to analyze task descriptions.

    Args:
        tasks_data: Dict of task_id -> {description, dependencies, status}

    Returns:
        Updated tasks_data with analyzed dependencies
    """
    return _analyze_dependencies_heuristic(tasks_data)


def _analyze_dependencies_heuristic(tasks_data: Dict) -> Dict:
    """
    Simple heuristic for dependency analysis based on keywords.

    For v1, uses simple pattern matching. Future: LLM-based analysis.
    This approach analyzes task descriptions to infer dependencies:
    - Tasks mentioning "based on", "using", "depends on" keywords
    - Sequential task ordering (later tasks may depend on earlier ones)

    Args:
        tasks_data: Dict with 'tasks' key containing task_id -> {description, dependencies, status}

    Returns:
        Updated tasks_data with analyzed dependencies
    """
    # Get the tasks dict from the input
    tasks_dict = tasks_data.get('tasks', tasks_data)

    dependency_keywords = {
        'based on', 'using', 'depends on', 'after', 'requires', 'given',
        'following', 'assuming', 'based upon', 'building on', 'continuing'
    }

    task_ids = sorted(tasks_dict.keys(), key=int)

    for i, task_id in enumerate(task_ids):
        desc = tasks_dict[task_id]['description'].lower()

        # Initialize dependencies list if not present
        if 'dependencies' not in tasks_dict[task_id]:
            tasks_dict[task_id]['dependencies'] = []

        # Check if this task references dependency keywords
        has_dependency_keyword = any(keyword in desc for keyword in dependency_keywords)

        # If task has dependency keywords and there are previous tasks,
        # infer dependency on the immediately preceding task
        if has_dependency_keyword and i > 0:
            prev_task_id = task_ids[i - 1]
            if prev_task_id not in tasks_dict[task_id]['dependencies']:
                tasks_dict[task_id]['dependencies'].append(prev_task_id)

    # Update the original tasks_data if it had a 'tasks' key
    if 'tasks' in tasks_data:
        tasks_data['tasks'] = tasks_dict
    else:
        tasks_data = tasks_dict

    return tasks_data


def format_cycle_error(cycle_path: List[str], tasks_data: Dict) -> str:
    """
    Format detailed error message for circular dependency (Decision D-02).

    Args:
        cycle_path: List of task IDs forming the cycle
        tasks_data: Dict of task_id -> {description, dependencies, status}

    Returns:
        Formatted error message string
    """
    # Format cycle path: remove duplicate first element if present
    if len(cycle_path) > 1 and cycle_path[0] == cycle_path[-1]:
        cycle_display = cycle_path
    else:
        cycle_display = cycle_path + [cycle_path[0]]

    cycle_str = " → ".join(cycle_display)

    deps_detail = []
    for task_id in cycle_path:
        task = tasks_data.get(task_id, {})
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


def topological_sort(tasks_data: Dict) -> Tuple[Optional[List[str]], Optional[Dict]]:
    """
    Perform topological sort on DAG and detect cycles.

    Args:
        tasks_data: Dict of task_id -> {description, dependencies, status}

    Returns:
        Tuple: (execution_order, cycle_info)
               - execution_order: List of task IDs in order, or None if cycle
               - cycle_info: Dict with 'has_cycle' and 'cycle' path, or None
    """
    if "tasks" not in tasks_data:
        raise ValueError("DAG data must contain 'tasks' key")

    # Build graph for TopologicalSorter
    graph = {
        task_id: set(task_info['dependencies'])
        for task_id, task_info in tasks_data['tasks'].items()
    }

    sorter = TopologicalSorter(graph)

    # Try to prepare - this detects cycles
    try:
        sorter.prepare()
    except CycleError as e:
        # Extract cycle path from CycleError
        cycle_path = list(e.args[1]) if len(e.args) > 1 else list(e.args[0])
        error_msg = format_cycle_error(cycle_path, tasks_data['tasks'])
        print(error_msg, file=sys.stderr)
        return None, {'has_cycle': True, 'cycle': cycle_path}

    # Get execution order
    execution_order = list(sorter.static_order())

    # Update tasks_data with execution order
    tasks_data['execution_order'] = execution_order

    return execution_order, None


def main() -> int:
    """Main entry point for CLI script."""
    parser = argparse.ArgumentParser(
        description='Analyze task dependencies and perform topological sort'
    )
    parser.add_argument(
        '--input', required=True,
        help='Input tasks.json file path'
    )
    parser.add_argument(
        '--output', required=True,
        help='Output dag.json file path'
    )

    args = parser.parse_args()

    # Load input file
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: Input file not found: {input_path}", file=sys.stderr)
        return 1

    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            tasks_data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in input file: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: Failed to read input file: {e}", file=sys.stderr)
        return 1

    # Analyze dependencies using LLM/heuristic
    try:
        tasks_data = analyze_task_dependencies(tasks_data)
    except Exception as e:
        print(f"Error: Failed to analyze dependencies: {e}", file=sys.stderr)
        return 1

    # Perform topological sort with cycle detection
    try:
        execution_order, cycle_info = topological_sort(tasks_data)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: Unexpected error during topological sort: {e}", file=sys.stderr)
        return 1

    # Check for cycle
    if cycle_info and cycle_info['has_cycle']:
        return 1

    # Create output directory
    output_dir = Path(args.output).parent
    output_dir.mkdir(parents=True, exist_ok=True)

    # Write dag.json with tasks dict and execution_order
    dag_path = Path(args.output)
    try:
        with open(dag_path, 'w', encoding='utf-8') as f:
            json.dump(tasks_data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error: Failed to write dag.json: {e}", file=sys.stderr)
        return 1

    # Write execution-order.txt (one task ID per line)
    order_path = dag_path.parent / 'execution-order.txt'
    try:
        with open(order_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(execution_order))
    except Exception as e:
        print(f"Error: Failed to write execution-order.txt: {e}", file=sys.stderr)
        return 1

    print(f"SUCCESS: DAG written to {dag_path}")
    print(f"Execution order written to {order_path}")
    print(f"Tasks: {len(execution_order)}")
    return 0


if __name__ == '__main__':
    sys.exit(main())