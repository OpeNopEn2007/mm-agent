#!/usr/bin/env python3
"""
Smoke Test for MM-Agent Plugin

Validates that core components are properly configured and can execute.
Run: python tests/smoke_test.py
"""

import os
import sys
import json
import subprocess
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

def test_plugin_structure():
    """Test plugin.json and directory structure"""
    print("\n=== Testing Plugin Structure ===")

    # Check plugin.json
    plugin_json = PROJECT_ROOT / ".claude-plugin" / "plugin.json"
    assert plugin_json.exists(), "plugin.json not found"

    with open(plugin_json) as f:
        data = json.load(f)

    assert data.get("name") == "mm-agent", "Plugin name incorrect"
    assert data.get("skills"), "skills path not configured"
    assert data.get("agents"), "agents path not configured"
    assert data.get("hooks"), "hooks path not configured"
    print("✓ plugin.json valid with all paths configured")

    # Check directories exist
    for path_key in ["skills", "agents", "hooks"]:
        path = PROJECT_ROOT / data[path_key].lstrip("./")
        assert path.exists(), f"{path_key} directory not found"
        print(f"✓ {path_key} directory exists")


def test_skills():
    """Test skill files exist"""
    print("\n=== Testing Skills ===")

    skills_dir = PROJECT_ROOT / "skills" / "mm-agent"
    assert skills_dir.exists(), "skills/mm-agent directory not found"

    skill_file = skills_dir / "SKILL.md"
    assert skill_file.exists(), "SKILL.md not found"
    print("✓ SKILL.md exists")

    # Check supporting skill files
    support_files = ["coordinator.md", "hmml-retrieval.md", "code-execution.md"]
    for f in support_files:
        path = skills_dir / f
        assert path.exists(), f"{f} not found"
        print(f"✓ {f} exists")


def test_agents():
    """Test agent files exist"""
    print("\n=== Testing Agents ===")

    agents_dir = PROJECT_ROOT / "agents"
    agent_files = [
        "mm-agent-coordinator.md",
        "mm-agent-modeler.md",
        "mm-agent-programmer.md",
        "mm-agent-reporter.md"
    ]

    for f in agent_files:
        path = agents_dir / f
        assert path.exists(), f"{f} not found"
        print(f"✓ {f} exists")


def test_scripts():
    """Test Python scripts exist and have valid syntax"""
    print("\n=== Testing Scripts ===")

    scripts_dir = PROJECT_ROOT / "scripts"
    script_files = [
        "dag_topological_sort.py",
        "hmml_retrieval.py",
        "hmml_precompute_embeddings.py",
        "load_dependency_memory.py"
    ]

    for f in script_files:
        path = scripts_dir / f
        assert path.exists(), f"{f} not found"

        # Syntax check
        result = subprocess.run(
            ["python3", "-m", "py_compile", str(path)],
            capture_output=True
        )
        assert result.returncode == 0, f"{f} has syntax errors"
        print(f"✓ {f} exists and syntax valid")


def test_prompts():
    """Test prompts module can be imported"""
    print("\n=== Testing Prompts ===")

    from prompts.mm_agent_prompts import (
        PROBLEM_PROMPT,
        PAPER_CHAPTER_PROMPT,
        PAPER_INFO_PROMPT
    )
    print("✓ prompts.mm_agent_prompts imports successfully")
    print(f"✓ PROBLEM_PROMPT defined: {bool(PROBLEM_PROMPT)}")
    print(f"✓ PAPER_CHAPTER_PROMPT defined: {bool(PAPER_CHAPTER_PROMPT)}")


def test_knowledge_base():
    """Test knowledge base files exist"""
    print("\n=== Testing Knowledge Base ===")

    knowledge_dir = PROJECT_ROOT / "knowledge" / "hmml"
    kb_files = [
        "hmml.json",
        "hmml-embeddings.npy",
        "method-index.json"
    ]

    for f in kb_files:
        path = knowledge_dir / f
        assert path.exists(), f"{f} not found"
        print(f"✓ {f} exists")


def test_templates():
    """Test template files exist"""
    print("\n=== Testing Templates ===")

    templates_dir = PROJECT_ROOT / "templates"

    # Check report-generator.py syntax
    report_gen = templates_dir / "report-generator.py"
    assert report_gen.exists(), "report-generator.py not found"

    result = subprocess.run(
        ["python3", "-m", "py_compile", str(report_gen)],
        capture_output=True
    )
    assert result.returncode == 0, "report-generator.py has syntax errors"
    print("✓ report-generator.py syntax valid")


def test_hooks():
    """Test hooks configuration"""
    print("\n=== Testing Hooks ===")

    hooks_json = PROJECT_ROOT / "hooks" / "hooks.json"
    assert hooks_json.exists(), "hooks.json not found"

    with open(hooks_json) as f:
        data = json.load(f)
    print("✓ hooks.json valid JSON")

    session_start = PROJECT_ROOT / "hooks" / "session-start"
    assert session_start.exists(), "session-start not found"
    print("✓ session-start exists")


def main():
    """Run all smoke tests"""
    print("=" * 50)
    print("MM-Agent Smoke Test")
    print("=" * 50)

    tests = [
        test_plugin_structure,
        test_skills,
        test_agents,
        test_scripts,
        test_prompts,
        test_knowledge_base,
        test_templates,
        test_hooks
    ]

    passed = 0
    failed = 0

    for test in tests:
        try:
            test()
            passed += 1
        except AssertionError as e:
            print(f"✗ FAILED: {e}")
            failed += 1
        except Exception as e:
            print(f"✗ ERROR: {e}")
            failed += 1

    print("\n" + "=" * 50)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 50)

    if failed > 0:
        sys.exit(1)

    print("\n✓ All smoke tests passed!")
    print("\nTo test full pipeline, run:")
    print("  claude --plugin-dir .")
    print("  /mm-agent --problem tests/fixtures/minimal.md")


if __name__ == "__main__":
    main()