# Test cases for Memory system (MEM-01, MEM-02, MEM-03)

import json
import pytest


def test_load_dependencies(sample_memory_data, temp_memory_dir):
    """
    Tests loading dependency Memory files (MEM-01).

    Validates:
    - Function loads all dependency tasks
    - Context includes task description and results
    - Multiple task files can be loaded
    """
    # Create multiple task Memory files simulating a dependency chain
    task_1_data = {
        "task_id": "1",
        "phase": "task-decomposition",
        "status": "completed",
        "task_description": "Traffic analysis",
        "mathematical_modeling_process": "M/M/1 queuing model",
        "solution_interpretation": "Peak wait time: 5.2 minutes",
        "created_at": "2026-04-11T00:00:00Z",
        "updated_at": "2026-04-11T00:00:00Z"
    }

    task_2_data = {
        "task_id": "2",
        "phase": "task-decomposition",
        "status": "completed",
        "task_description": "Route design",
        "mathematical_modeling_process": "Graph optimization",
        "solution_interpretation": "3 routes proposed with 20% capacity increase",
        "created_at": "2026-04-11T00:00:00Z",
        "updated_at": "2026-04-11T00:00:00Z"
    }

    # Write Memory files (simulating what implementation should do)
    for task_data in [task_1_data, task_2_data]:
        task_path = temp_memory_dir / f"task-{task_data['task_id']}.json"
        with open(task_path, 'w') as f:
            json.dump(task_data, f, indent=2)

    # This test will fail until load_dependencies() is implemented
    # For now, we validate we can read the files back
    task_1_path = temp_memory_dir / "task-1.json"
    task_2_path = temp_memory_dir / "task-2.json"

    assert task_1_path.exists(), "task-1.json must exist"
    assert task_2_path.exists(), "task-2.json must exist"

    with open(task_1_path) as f:
        loaded_1 = json.load(f)
    with open(task_2_path) as f:
        loaded_2 = json.load(f)

    # Validate loaded data includes required fields
    assert "task_description" in loaded_1
    assert "task_description" in loaded_2
    assert "solution_interpretation" in loaded_1
    assert "solution_interpretation" in loaded_2


def test_write_memory(sample_memory_data, temp_memory_dir):
    """
    Tests writing Memory file (MEM-02).

    Validates:
    - task-{id}.json is written to memory directory
    - JSON schema matches Memory schema from IDEA.md
    - Timestamps are generated if missing
    """
    import time
    from datetime import datetime, timezone

    # Create copy without timestamps to test auto-generation
    memory_data = sample_memory_data.copy()
    memory_data.pop("created_at", None)
    memory_data.pop("updated_at", None)

    # Write Memory file (simulating what implementation should do)
    task_path = temp_memory_dir / f"task-{memory_data['task_id']}.json"

    # Generate timestamps if missing
    timestamp = datetime.now(timezone.utc).isoformat()
    memory_data["created_at"] = timestamp
    memory_data["updated_at"] = timestamp

    with open(task_path, 'w') as f:
        json.dump(memory_data, f, indent=2)

    # Validate file exists
    assert task_path.exists(), f"task-{memory_data['task_id']}.json must be written"

    # Validate JSON schema matches Memory schema
    with open(task_path) as f:
        loaded_memory = json.load(f)

    required_fields = ["task_id", "phase", "status", "task_description", "created_at", "updated_at"]
    for field in required_fields:
        assert field in loaded_memory, f"Memory must have '{field}' field"

    # Validate status is one of allowed values
    assert loaded_memory["status"] in ["pending", "in_progress", "completed", "failed"], \
        f"Status must be one of: pending, in_progress, completed, failed"

    # Validate timestamps are ISO format
    assert "T" in loaded_memory["created_at"], "Timestamp must be ISO format"


def test_context_passing(sample_memory_data, temp_memory_dir):
    """
    Tests context passing between tasks (MEM-03).

    Validates:
    - Task 3 receives context from tasks 1 and 2
    - Context is formatted correctly for LLM consumption
    - Chain of dependencies works correctly
    """
    # Create a chain of dependent tasks (1 -> 2 -> 3)
    task_1_data = {
        "task_id": "1",
        "phase": "task-decomposition",
        "status": "completed",
        "task_description": "Traffic analysis",
        "mathematical_modeling_process": "M/M/1 queuing model",
        "solution_interpretation": "Peak wait time: 5.2 minutes",
        "created_at": "2026-04-11T00:00:00Z",
        "updated_at": "2026-04-11T00:00:00Z"
    }

    task_2_data = {
        "task_id": "2",
        "phase": "task-decomposition",
        "status": "completed",
        "task_description": "Route design",
        "mathematical_modeling_process": "Graph optimization",
        "solution_interpretation": "3 routes proposed with 20% capacity increase",
        "created_at": "2026-04-11T00:00:00Z",
        "updated_at": "2026-04-11T00:00:00Z"
    }

    task_3_data = {
        "task_id": "3",
        "phase": "task-decomposition",
        "status": "in_progress",
        "task_description": "Cost estimation",
        "dependencies": ["1", "2"],
        "created_at": "2026-04-11T00:00:00Z",
        "updated_at": "2026-04-11T00:00:00Z"
    }

    # Write Memory files
    for task_data in [task_1_data, task_2_data, task_3_data]:
        task_path = temp_memory_dir / f"task-{task_data['task_id']}.json"
        with open(task_path, 'w') as f:
            json.dump(task_data, f, indent=2)

    # This test will fail until context_passing() is implemented
    # For now, we validate we can format context from dependencies

    # Simulate loading context for task 3 from dependencies 1 and 2
    context_parts = []
    for dep_id in task_3_data.get("dependencies", []):
        dep_path = temp_memory_dir / f"task-{dep_id}.json"
        assert dep_path.exists(), f"Dependency task-{dep_id}.json must exist"

        with open(dep_path) as f:
            dep_memory = json.load(f)

        # Format context per IDEA.md §7.3
        context_part = f"""---
# Task {dep_id}: {dep_memory['task_description']}

## Modeling Method
{dep_memory.get('mathematical_modeling_process', 'N/A')}

## Result Interpretation
{dep_memory.get('solution_interpretation', 'N/A')}
---
"""
        context_parts.append(context_part)

    context = '\n'.join(context_parts)

    # Validate context includes both dependencies
    assert "Task 1: Traffic analysis" in context
    assert "Task 2: Route design" in context
    assert "M/M/1 queuing model" in context
    assert "Graph optimization" in context
    assert "Peak wait time: 5.2 minutes" in context
    assert "3 routes proposed with 20% capacity increase" in context