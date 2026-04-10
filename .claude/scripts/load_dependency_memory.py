#!/usr/bin/env python3
"""
CLI script for loading dependency Memory files to provide task context.

This script loads a DAG structure, identifies dependencies for a given task,
and loads the corresponding Memory files to format context for LLM consumption.

Context format per IDEA.md §7.3:
---
# Task {dep_id}: {task_description}

## Modeling Method
{mathematical_modeling_process}

## Result Interpretation
{solution_interpretation}
---

Usage:
    python3 load_dependency_memory.py --task-id 3 --dag dag.json --memory-dir ./memory --output context.md
"""

import argparse
import json
import sys
from pathlib import Path


def load_dependencies(task_id, dag_path, memory_dir):
    """
    Load dependency Memory files for a given task.

    Args:
        task_id: ID of the task to load dependencies for.
        dag_path: Path to dag.json file.
        memory_dir: Path to memory directory containing task-{id}.json files.

    Returns:
        Formatted context string containing all dependency task information.

    Raises:
        FileNotFoundError: If DAG file or dependency Memory files are missing.
        ValueError: If required fields are missing or task_id not found in DAG.
    """
    # Load DAG structure
    dag_path = Path(dag_path)
    if not dag_path.exists():
        raise FileNotFoundError(f"DAG file not found: {dag_path}")

    try:
        with open(dag_path, 'r', encoding='utf-8') as f:
            dag_data = json.load(f)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON in DAG file: {e}")

    # Find the task in DAG
    if "tasks" not in dag_data:
        raise ValueError("DAG data must contain 'tasks' key")

    task_info = dag_data["tasks"].get(task_id)
    if not task_info:
        raise ValueError(f"Task ID '{task_id}' not found in DAG")

    # Get dependencies for the task
    dependencies = task_info.get("dependencies", [])

    # Load Memory files for each dependency
    context_parts = []
    memory_dir = Path(memory_dir)

    for dep_id in dependencies:
        memory_path = memory_dir / f"task-{dep_id}.json"

        if not memory_path.exists():
            raise FileNotFoundError(f"Dependency Memory file not found: {memory_path}")

        try:
            with open(memory_path, 'r', encoding='utf-8') as f:
                memory = json.load(f)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in Memory file {memory_path}: {e}")

        # Validate required fields
        required_fields = ["task_description", "solution_interpretation"]
        for field in required_fields:
            if field not in memory:
                raise ValueError(f"Missing required field '{field}' in {memory_path}")

        # Format context per IDEA.md §7.3
        context_part = f"""---
# Task {dep_id}: {memory['task_description']}

## Modeling Method
{memory.get('mathematical_modeling_process', 'N/A')}

## Result Interpretation
{memory.get('solution_interpretation', 'N/A')}
---
"""
        context_parts.append(context_part)

    # Combine all dependency contexts
    if context_parts:
        return '\n'.join(context_parts)
    else:
        return "# No dependencies for this task"


def main():
    """Main entry point for CLI script."""
    parser = argparse.ArgumentParser(
        description='Load dependency Memory files for task context'
    )
    parser.add_argument(
        '--task-id',
        required=True,
        help='Task ID to load dependencies for'
    )
    parser.add_argument(
        '--dag',
        required=True,
        help='Path to dag.json file'
    )
    parser.add_argument(
        '--memory-dir',
        required=True,
        help='Path to memory directory containing task-{id}.json files'
    )
    parser.add_argument(
        '--output',
        required=True,
        help='Output context file path'
    )

    args = parser.parse_args()

    # Load dependencies and format context
    try:
        context = load_dependencies(args.task_id, args.dag, args.memory_dir)
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: Unexpected error: {e}", file=sys.stderr)
        return 1

    # Write output file
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(context)
    except Exception as e:
        print(f"Error: Failed to write output file: {e}", file=sys.stderr)
        return 1

    print(f"Context loaded and written to: {output_path}")
    return 0


if __name__ == '__main__':
    sys.exit(main())