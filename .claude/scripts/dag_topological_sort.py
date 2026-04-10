#!/usr/bin/env python3
"""
CLI script for performing topological sort on a DAG.

This script loads a DAG structure from a JSON file, performs topological
sorting to determine the execution order, and writes the order to an output file.

Per Decision D-02: Circular dependency → error exit with detailed error message.

Usage:
    python3 dag_topological_sort.py --input dag.json --output execution-order.txt
"""

import argparse
import json
import sys
from graphlib import TopologicalSorter, CycleError
from pathlib import Path


def topological_sort(dag_data):
    """
    Perform topological sort on DAG structure.

    Args:
        dag_data: Dict containing 'tasks' key with task definitions.
                  Each task should have 'dependencies' list.

    Returns:
        List of task IDs in execution order (topological order).

    Raises:
        CycleError: If the DAG contains a circular dependency.
        ValueError: If required keys are missing.
    """
    if "tasks" not in dag_data:
        raise ValueError("DAG data must contain 'tasks' key")

    # Create topological sorter
    sorter = TopologicalSorter()

    # Add all tasks to the sorter
    for task_id, task_info in dag_data["tasks"].items():
        dependencies = task_info.get("dependencies", [])
        sorter.add(task_id, *dependencies)

    # Get static order (will raise CycleError if cycle exists)
    try:
        execution_order = list(sorter.static_order())
    except CycleError as e:
        # Format cycle error with detailed information
        cycle_nodes = list(e.args[0]) if e.args else []
        error_msg = (
            "Circular dependency detected in DAG. "
            f"Cycle involves tasks: {', '.join(cycle_nodes)}. "
            "Please review task dependencies to resolve the cycle."
        )
        raise CycleError(error_msg) from e

    return execution_order


def main():
    """Main entry point for CLI script."""
    parser = argparse.ArgumentParser(
        description='Perform topological sort on DAG to determine execution order'
    )
    parser.add_argument(
        '--input',
        required=True,
        help='Input DAG JSON file path'
    )
    parser.add_argument(
        '--output',
        required=True,
        help='Output execution order file path (one task ID per line)'
    )

    args = parser.parse_args()

    # Load input file
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: Input file not found: {input_path}", file=sys.stderr)
        return 1

    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            dag_data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in input file: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: Failed to read input file: {e}", file=sys.stderr)
        return 1

    # Perform topological sort
    try:
        execution_order = topological_sort(dag_data)
    except CycleError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: Unexpected error during topological sort: {e}", file=sys.stderr)
        return 1

    # Write output file
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(execution_order))
    except Exception as e:
        print(f"Error: Failed to write output file: {e}", file=sys.stderr)
        return 1

    print(f"Topological sort complete. Execution order written to: {output_path}")
    return 0


if __name__ == '__main__':
    sys.exit(main())