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

## Code Outputs
{code_structure.file_outputs}
---

Usage:
    python3 load_dependency_memory.py --mode load --task-id 3 --dag dag.json --memory-dir ./memory --output context.md
    python3 load_dependency_memory.py --mode create --task-id 1 --description "Task description" --memory-dir ./memory
    python3 load_dependency_memory.py --mode update --task-id 1 --result result.json --memory-dir ./memory
"""

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime, timezone


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

## Code Outputs
{json.dumps(memory.get('code_structure', {}).get('file_outputs', []), indent=2)}
---
"""
        context_parts.append(context_part)

    # Combine all dependency contexts
    if context_parts:
        return '\n'.join(context_parts)
    else:
        return "# No dependencies for this task"


def write_memory(task_id, memory_data, memory_dir):
    """
    Write task Memory file with timestamps (MEM-02).

    Args:
        task_id: Task ID (string, e.g., "1")
        memory_data: Memory content dict following IDEA.md §7.2 schema
        memory_dir: Path to memory directory

    Returns:
        Path to written Memory file

    Raises:
        ValueError: If memory_data missing required fields
    """
    # Validate required fields
    required_fields = ['task_id', 'phase', 'status', 'task_description']
    for field in required_fields:
        if field not in memory_data:
            raise ValueError(f"Memory data missing required field: {field}")

    # Add timestamps
    timestamp = datetime.now(timezone.utc).isoformat()
    memory_data['task_id'] = task_id  # Ensure task_id matches
    memory_data['updated_at'] = timestamp

    if 'created_at' not in memory_data:
        memory_data['created_at'] = timestamp

    # Write Memory file
    memory_dir = Path(memory_dir)
    memory_dir.mkdir(parents=True, exist_ok=True)

    memory_path = memory_dir / f'task-{task_id}.json'

    with open(memory_path, 'w', encoding='utf-8') as f:
        json.dump(memory_data, f, indent=2, ensure_ascii=False)

    return memory_path


def create_initial_memory(task_id, task_description, phase='task-decomposition', memory_dir='.planning/memory'):
    """
    Create initial Memory file when task starts.

    Args:
        task_id: Task ID
        task_description: Task description
        phase: Phase name (default: 'task-decomposition')
        memory_dir: Path to memory directory

    Returns:
        Path to created Memory file
    """
    timestamp = datetime.now(timezone.utc).isoformat()

    memory_data = {
        'task_id': task_id,
        'phase': phase,
        'status': 'in_progress',
        'task_description': task_description,
        'created_at': timestamp,
        'updated_at': timestamp
    }

    return write_memory(task_id, memory_data, memory_dir)


def update_task_completion(task_id, result, memory_dir='.planning/memory'):
    """
    Update Memory file when task completes.

    Args:
        task_id: Task ID
        result: Dict with interpretation and optional code_structure, charts
        memory_dir: Path to memory directory

    Returns:
        Path to updated Memory file
    """
    memory_path = Path(memory_dir) / f'task-{task_id}.json'

    if not memory_path.exists():
        raise FileNotFoundError(f"Memory file not found: {memory_path}")

    with open(memory_path, 'r', encoding='utf-8') as f:
        memory_data = json.load(f)

    memory_data['status'] = 'completed'
    memory_data['solution_interpretation'] = result.get('interpretation', '')
    memory_data['updated_at'] = datetime.now(timezone.utc).isoformat()

    # Add optional fields if provided
    if 'code_structure' in result:
        memory_data['code_structure'] = result['code_structure']
    if 'charts' in result:
        memory_data['charts'] = result['charts']
    if 'mathematical_modeling_process' in result:
        memory_data['mathematical_modeling_process'] = result['mathematical_modeling_process']
    if 'task_code' in result:
        memory_data['task_code'] = result['task_code']
    if 'execution_result' in result:
        memory_data['execution_result'] = result['execution_result']

    return write_memory(task_id, memory_data, memory_dir)


def main():
    """Main entry point for CLI script."""
    parser = argparse.ArgumentParser(
        description='Memory system I/O: load, write, create, update'
    )
    parser.add_argument(
        '--mode',
        choices=['load', 'write', 'create', 'update'],
        default='load',
        help='Operation mode: load|write|create|update'
    )
    parser.add_argument(
        '--task-id',
        required=True,
        help='Task ID'
    )
    parser.add_argument(
        '--dag',
        help='Path to dag.json file (load mode)'
    )
    parser.add_argument(
        '--memory-dir',
        default='.planning/memory',
        help='Path to memory directory'
    )
    parser.add_argument(
        '--output',
        help='Output context file path (load mode)'
    )
    parser.add_argument(
        '--memory-data',
        help='Memory data JSON file (write mode)'
    )
    parser.add_argument(
        '--description',
        help='Task description (create mode)'
    )
    parser.add_argument(
        '--phase',
        default='task-decomposition',
        help='Phase name (create mode)'
    )
    parser.add_argument(
        '--result',
        help='Result JSON file (update mode)'
    )

    args = parser.parse_args()

    try:
        if args.mode == 'load':
            # Load dependencies and format context
            if not args.dag:
                raise ValueError("--dag is required for load mode")
            if not args.output:
                raise ValueError("--output is required for load mode")

            context = load_dependencies(args.task_id, args.dag, args.memory_dir)

            # Write output file
            output_path = Path(args.output)
            output_path.parent.mkdir(parents=True, exist_ok=True)

            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(context)

            print(f"SUCCESS: Context written to {output_path}")

        elif args.mode == 'write':
            # Load memory_data from JSON file or stdin
            if args.memory_data:
                with open(args.memory_data, 'r', encoding='utf-8') as f:
                    memory_data = json.load(f)
            else:
                memory_data = json.load(sys.stdin)

            memory_path = write_memory(args.task_id, memory_data, args.memory_dir)
            print(f"SUCCESS: Memory file written to {memory_path}")

        elif args.mode == 'create':
            if not args.description:
                raise ValueError("--description is required for create mode")

            memory_path = create_initial_memory(
                task_id=args.task_id,
                task_description=args.description,
                phase=args.phase,
                memory_dir=args.memory_dir
            )
            print(f"SUCCESS: Initial Memory file created at {memory_path}")

        elif args.mode == 'update':
            if args.result:
                with open(args.result, 'r', encoding='utf-8') as f:
                    result = json.load(f)
            else:
                result = json.load(sys.stdin)

            memory_path = update_task_completion(args.task_id, result, args.memory_dir)
            print(f"SUCCESS: Task {args.task_id} marked as completed")

        return 0

    except FileNotFoundError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"ERROR: Unexpected error: {e}", file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())