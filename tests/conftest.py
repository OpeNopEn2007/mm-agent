# Shared test fixtures for Phase 3: Task Decomposition with DAG

import pytest


@pytest.fixture
def sample_dag_data():
    """
    Returns a valid DAG structure for testing.

    This fixture provides a simple linear dependency chain:
    Task 3 depends on Task 2 and Task 1
    Task 2 depends on Task 1
    Task 1 has no dependencies

    Schema matches IDEA.md §3.5:
    {
      "tasks": {
        "1": { "description": "...", "dependencies": [], "status": "pending" },
        "2": { "description": "...", "dependencies": ["1"], "status": "pending" }
      },
      "execution_order": ["1", "2"]
    }
    """
    return {
        "tasks": {
            "1": {"description": "Task 1", "dependencies": [], "status": "pending"},
            "2": {"description": "Task 2", "dependencies": ["1"], "status": "pending"},
            "3": {"description": "Task 3", "dependencies": ["1", "2"], "status": "pending"}
        },
        "execution_order": ["1", "2", "3"]
    }


@pytest.fixture
def circular_dag_data():
    """
    Returns a DAG with a circular dependency for cycle detection tests.

    This fixture provides a cycle:
    Task 1 depends on Task 3
    Task 2 depends on Task 1
    Task 3 depends on Task 2

    This should trigger CycleError during topological sort.
    """
    return {
        "tasks": {
            "1": {"description": "Task 1", "dependencies": ["3"], "status": "pending"},
            "2": {"description": "Task 2", "dependencies": ["1"], "status": "pending"},
            "3": {"description": "Task 3", "dependencies": ["2"], "status": "pending"}
        }
    }


@pytest.fixture
def sample_memory_data():
    """
    Returns a valid Memory structure for testing.

    Schema matches IDEA.md §7.2:
    {
      "task_id": "string (required)",
      "phase": "string (required)",
      "status": "pending|in_progress|completed|failed (required)",
      "task_description": "string (required)",
      "mathematical_modeling_process": "string (optional)",
      "solution_interpretation": "string (required after completion)",
      "created_at": "ISO timestamp",
      "updated_at": "ISO timestamp"
    }
    """
    return {
        "task_id": "1",
        "phase": "task-decomposition",
        "status": "completed",
        "task_description": "Test task for traffic analysis",
        "mathematical_modeling_process": "Used queuing theory model M/M/1",
        "solution_interpretation": "Average wait time reduced by 30%",
        "created_at": "2026-04-11T00:00:00Z",
        "updated_at": "2026-04-11T00:00:00Z"
    }


@pytest.fixture
def temp_memory_dir(tmp_path):
    """
    Creates a temporary memory directory structure for testing.

    Returns a path object that can be used to create temporary
    Memory files (task-{id}.json) during tests.
    """
    memory_dir = tmp_path / "memory"
    memory_dir.mkdir()
    return memory_dir


@pytest.fixture
def sample_problem_md():
    """
    Returns the path to a sample problem.md file for testing.

    Points to tests/fixtures/multi-task.md which contains
    a multi-task dependency problem for testing task decomposition.
    """
    import os
    return os.path.join(os.path.dirname(__file__), "fixtures", "multi-task.md")