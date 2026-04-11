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


# ---- Phase 7: Report Generation Fixtures ----

@pytest.fixture
def sample_report_memory():
    """
    Returns a valid Memory structure for Phase 7 report generation testing.

    Schema matches the combined output of Phases 2-6:
    {
      "title": "...",
      "summary": "...",
      "keywords": "...",
      "problem_background": "...",
      "problem_requirement": "...",
      "problem_analysis": "...",
      "tasks": [
        {
          "task_id": "1",
          "task_description": "...",
          "task_analysis": "...",
          "preliminary_formulas": "...",
          "mathematical_modeling_process": "...",
          "execution_result": "...",
          "solution_interpretation": "...",
          "subtask_outcome_analysis": "..."
        }
      ]
    }
    """
    return {
        "title": "Urban Traffic Flow Optimization Using Queueing Theory",
        "summary": "This paper addresses the optimization of urban traffic light timing...",
        "keywords": "traffic optimization; queueing theory; genetic algorithm",
        "problem_background": "Urban traffic congestion has become a critical issue...",
        "problem_requirement": "Optimize traffic light timing at a 4-way intersection...",
        "problem_analysis": "The problem requires modeling vehicle arrival patterns...",
        "tasks": [
            {
                "task_id": "1",
                "task_description": "Model vehicle arrival patterns using Poisson distribution",
                "task_analysis": "Vehicle arrivals follow a Poisson process with rate lambda...",
                "preliminary_formulas": "P(N=k) = (lambda^k * e^-lambda) / k!",
                "mathematical_modeling_process": "We model the intersection as an M/M/1 queue...",
                "execution_result": "Average wait time: 45.2 seconds",
                "solution_interpretation": "The model predicts wait times with 92% accuracy...",
                "subtask_outcome_analysis": "Model performs well under low traffic conditions..."
            },
            {
                "task_id": "2",
                "task_description": "Optimize traffic light timing using genetic algorithm",
                "task_analysis": "GA can find near-optimal timing parameters...",
                "preliminary_formulas": "fitness = 1 / (1 + total_delay)",
                "mathematical_modeling_process": "We encode timing as chromosomes and evolve...",
                "execution_result": "Optimal cycle: 90s, green phases: [30, 25, 20, 15]",
                "solution_interpretation": "GA convergence achieved in 150 generations...",
                "subtask_outcome_analysis": "Solution reduces average wait time by 23%..."
            },
            {
                "task_id": "3",
                "task_description": "Validate model with real-world data",
                "task_analysis": "We validate using traffic counts from sensors...",
                "preliminary_formulas": "MAPE = (1/n) * sum(|actual-predicted|/actual)",
                "mathematical_modeling_process": "Validation uses 24-hour sensor data...",
                "execution_result": "MAPE = 8.3%, R^2 = 0.91",
                "solution_interpretation": "Model shows good fit with real traffic patterns...",
                "subtask_outcome_analysis": "Model generalizes well to different time periods..."
            }
        ]
    }


@pytest.fixture
def sample_metadata():
    """
    Returns sample metadata for report generation.

    Used to test LatexDocumentAssembler._create_preamble() and _create_abstract().
    """
    return {
        "title": "Urban Traffic Flow Optimization Using Queueing Theory",
        "team": "2500001",
        "year": "2025",
        "problem_type": "A",
        "summary": "This paper presents an optimization approach for urban traffic light timing...",
        "keywords": "traffic optimization; queueing theory; genetic algorithm"
    }


@pytest.fixture
def template_paths():
    """
    Returns paths to mcmthesis and cumcmthesis template directories.
    """
    import os
    templates_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".planning", "templates")
    return {
        "mcmthesis": os.path.join(templates_dir, "mcmthesis"),
        "cumcmthesis": os.path.join(templates_dir, "cumcmthesis")
    }