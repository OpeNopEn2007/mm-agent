# Architecture Patterns: Mathematical Modeling Multi-Agent System

**Domain:** 数学建模多智能体系统 (MM-Agent in Claude Code)
**Researched:** 2026-04-10
**Confidence:** MEDIUM

## Executive Summary

A mathematical modeling multi-agent system (MM-Agent) requires a **four-stage pipeline architecture** with specialized agents for problem analysis, model formulation, computational solving, and report generation. The key architectural components include: (1) Problem Parser for unstructured input processing, (2) Task Decomposer with DAG-based dependency management, (3) HMML Knowledge Retriever with hierarchical embedding search, (4) Actor-Critic Modeler for iterative refinement, (5) Code Executor for numerical simulation, (6) Memory System for context persistence, and (7) Report Generator for LaTeX output. The system should leverage GSD framework's phase orchestration patterns for workflow management while implementing Claude Code's Skills/Hooks/Agents for agent implementation.

## Architecture Overview

### Recommended Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MM-Agent Architecture                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│  │   Problem    │────▶│    Task      │────▶│    HMML      │                │
│  │   Parser     │     │  Decomposer  │     │  Retriever   │                │
│  └──────────────┘     └──────────────┘     └──────────────┘                │
│         │                    │                    │                         │
│         ▼                    ▼                    ▼                         │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │                    Memory System (JSON)                           │       │
│  │  - problem.md     - task DAG     - model iterations              │       │
│  │  - execution results     - final report                          │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                ▲                                            │
│                                │                                            │
│         ┌──────────────────────┼──────────────────────┐                    │
│         │                      │                      │                    │
│         ▼                      ▼                      ▼                    │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│  │    Actor     │◀───▶│   Critic     │     │    Code      │                │
│  │   Modeler    │     │  Evaluator   │     │   Executor   │                │
│  └──────────────┘     └──────────────┘     └──────────────┘                │
│         │                                        │                         │
│         │           Actor-Critic Loop            │                         │
│         │         (max 3 iterations)             │                         │
│         │                                        ▼                         │
│         │                              ┌──────────────┐                    │
│         └────────────────────────────▶│    Report    │                    │
│                                        │  Generator   │                    │
│                                        └──────────────┘                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Four-Stage Pipeline

| Stage | Component | Purpose | Output |
|-------|-----------|---------|--------|
| 1. Problem Analysis | Problem Parser | Parse PDF/MD/TXT, extract background/objectives/constraints | structured problem.md |
| 2. Model Formulation | Task Decomposer + HMML Retriever + Actor-Critic | Decompose subproblems, retrieve methods, iterate modeling | modeling方案.md |
| 3. Computational Solving | Code Executor | Generate and run Python simulation code | execution results |
| 4. Report Generation | Report Generator | Compile results into LaTeX/PDF | final paper |

## Component Boundaries

### Core Components

| Component | Responsibility | Communicates With | Boundary |
|-----------|---------------|-------------------|----------|
| Problem Parser | Receive problem file, extract structured info | Input: PDF/MD/TXT, Output: problem.md | Frontend boundary |
| Task Decomposer | Analyze subproblems, build DAG, topological sort | Input: problem.md, Output: task graph | Logic boundary |
| HMML Retriever | Search hierarchical modeling library by embedding | Input: task query, Output: method candidates | Knowledge boundary |
| Actor Modeler | Generate modeling方案 based on problem + methods | Input: task + methods, Output: model draft | Core logic |
| Critic Evaluator | Evaluate model quality, provide feedback | Input: model draft, Output: critique + score | Quality boundary |
| Code Executor | Generate Python code, execute in sandbox, handle errors | Input: model spec, Output: execution results | Execution boundary |
| Memory System | Persist context across tasks, load dependent results | All components | State boundary |
| Report Generator | Compile all outputs into LaTeX/PDF | Input: all results, Output: final paper | Output boundary |

### Claude Code Integration Boundaries

| Component | Implementation | Notes |
|-----------|----------------|-------|
| Entry Point | Skill (SKILL.md) | `/mm-agent --problem <file>` trigger |
| Problem Parser | Hook (parse-problem.md) | PreToolUse for problem input |
| Task Decomposer | Agent (planner subagent) | DAG construction logic |
| HMML Retriever | MCP tool + embedding compute | BGE-m3 or mGTE for embedding |
| Actor-Critic | Agent (modeler + critic) | Internal iteration loop |
| Code Executor | MCP tool (Python sandbox) | Execution environment |
| Memory System | JSON files in .planning/ | State persistence |
| Report Generator | Hook (report-gen.md) | PostToolUse for output |

## Data Flow

### Primary Data Flow

```
1. Input → Problem Parser
   problem.pdf/md/txt → [extract] → problem.md (JSON structure)

2. Problem → Task Decomposer
   problem.md → [analyze] → task DAG (nodes + edges) → topological sort

3. Tasks → HMML Retriever (per task)
   task description → [embedding] → [search] → relevant method nodes

4. Task + Methods → Actor-Critic Modeler (iterative)
   (task + methods) → Actor: generate model → Critic: evaluate
   → [if not satisfied] → iterate (max 3 rounds) → final model

5. Model → Code Executor
   model specification → [generate Python] → [execute] → results + plots

6. Results → Report Generator
   (problem + model + results) → [template] → LaTeX → PDF

7. Throughout: Memory System
   - Load: dependent task results before execution
   - Save: each stage output for debugging/continuation
```

### Memory System Data Flow

```
Session Start:
  Load .planning/STATE.md → restore last position
  Load .planning/PROBLEM.md → current problem context
  Load last incomplete task output (if any)

During Execution:
  Save to .planning/phases/{n}/outputs/{task}.json after each task
  Update .planning/STATE.md with current position

Session End:
  Persist all outputs
  Update SUMMARY.md with execution results
```

## Patterns to Follow

### Pattern 1: Actor-Critic Iteration

**What:** Actor generates initial output, Critic evaluates and provides feedback, Actor refines based on feedback. Repeat until quality threshold met.

**When:** Model generation, code generation, solution refinement

**Example:**
```
Actor (Modeler Agent):
  Input: {problem: ..., methods: [...], constraints: ...}
  Output: {model: "...", rationale: "...", assumptions: [...]}

Critic (Evaluator Agent):
  Input: {model: output_from_actor, criteria: quality_metrics}
  Output: {score: 0-10, issues: [...], suggestions: [...]}

Loop (max 3):
  If score >= 8 → break
  Else → actor.refine(suggestions) → repeat
```

### Pattern 2: DAG Task Dependency

**What:** Decompose problem into directed acyclic graph of tasks. Execute in topological order, parallelize independent tasks.

**When:** Multi-subproblem mathematical modeling

**Example:**
```
Task A (Problem Analysis) → no dependencies
Task B (Data Preprocessing) → depends on A
Task C (Model Formulation) → depends on A
Task D (Numerical Solution) → depends on B, C
Task E (Result Analysis) → depends on D
Task F (Report Generation) → depends on D

Execution:
  Wave 1: A (parallel: none)
  Wave 2: B, C (parallel: both depend only on A)
  Wave 3: D (depends on B, C)
  Wave 4: E, F (parallel: both depend on D)
```

### Pattern 3: Hierarchical Knowledge Retrieval

**What:** Three-level hierarchy (domain → subdomain → method) with embedding-based semantic search. Supports both problem-aware and solution-aware retrieval.

**When:** Finding relevant mathematical modeling methods

**Example:**
```
HMML Structure:
  Domain: "Optimization" (e.g., 10 domains)
    Subdomain: "Linear Programming" (e.g., 50 subdomains)
      Method: "Simplex Method" (e.g., 98 method nodes)

Retrieval:
  1. Embed task description → vector
  2. Search method nodes by cosine similarity
  3. Return top-k methods with domain/subdomain context
  4. Actor uses context to inform model generation
```

### Pattern 4: GSD Phase Orchestration

**What:** GSD provides verified workflow patterns: research → plan → execute → verify. Each phase creates specific artifacts.

**When:** Overall project management, phase transitions

**Example:**
```
/gsd:new-project → Initialize PROJECT.md
/gsd:discuss-phase 1 → Shape implementation
/gsd:plan-phase 1 → Create research + plans
/gsd:execute-phase 1 → Run tasks in waves
/gsd:verify-phase 1 → Verify outputs
Transition → .planning/phases/01-foundation-.../
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Monolithic Agent

**What:** Single agent attempts to handle entire pipeline from problem to report.

**Why bad:** Context window limits, quality degradation, no modularity for debugging.

**Instead:** Separate agents with clear responsibilities, memory system for context passing.

### Anti-Pattern 2: Sequential-Only Execution

**What:** All tasks must complete before next starts, no parallelization.

**Why bad:** Wastes time on independent tasks, blocks on I/O-bound operations.

**Instead:** DAG with wave execution, parallelize independent tasks in same wave.

### Anti-Pattern 3: No Iteration on Quality

**What:** Generate once, accept first output without evaluation.

**Why bad:** LLM outputs are stochastic, single generation may miss critical aspects.

**Instead:** Actor-Critic loop with quality threshold, iterate up to max rounds.

### Anti-Pattern 4: In-Memory State Only

**What:** Store all state in agent context, no persistence.

**Why bad:** Claude Code sessions may end, context lost. No debugging trail.

**Instead:** JSON files in .planning/ for persistence, load on session restore.

### Anti-Pattern 5: Hardcoded Prompts

**What:** Embed all prompts in Python code.

**Why bad:** Hard to iterate, no separation of concerns, prompts become unwieldy.

**Instead:** Claude Code Skills (markdown files) for prompt management.

## Scalability Considerations

### At 10 Problems (Single Competition)

| Concern | Approach |
|---------|----------|
| Context | Single problem in memory, others in .planning/ |
| Execution | Sequential, ~15 min per problem |
| Memory | JSON files per problem |

### At 100 Problems (Team Workload)

| Concern | Approach |
|---------|----------|
| Context | Load problem on demand, unload after |
| Execution | Queue with DAG per problem, parallel execution |
| Memory | Directory per problem, .planning/phases/{problem_id}/ |

### At 1000 Problems (Organization)

| Concern | Approach |
|---------|----------|
| Context | Database for problem metadata, embeddings in vector store |
| Execution | Distributed workers, job queue (Celery/RQ) |
| Memory | PostgreSQL + pgvector for embeddings |

## Build Order Implications

### Phase 1: Foundation Pipeline

Build the core four-stage pipeline with mock components:
1. Problem Parser (stub: echo input)
2. Task Decomposer (stub: single task)
3. Actor-Critic (stub: single iteration, no real critique)
4. Code Executor (stub: echo code)
5. Report Generator (stub: echo output)
6. Memory System (basic JSON read/write)

**Rationale:** Verify pipeline connectivity before implementing complex logic.

### Phase 2: Problem Understanding

Implement real problem parsing:
1. PDF text extraction (PyMuPDF)
2. Markdown parsing
3. Structured problem.md output with fields: background, objectives, constraints, data

**Rationale:** Problem understanding drives everything downstream.

### Phase 3: Task Decomposition

Implement DAG-based task management:
1. Subproblem extraction from problem.md
2. Dependency analysis between subproblems
3. Topological sort for execution order
4. Wave execution logic

**Rationale:** Mathematical modeling inherently has task dependencies.

### Phase 4: Knowledge Retrieval

Implement HMML:
1. Create hierarchical method library (domains, subdomains, methods)
2. Embedding computation (BGE-m3 or mGTE)
3. Semantic search for relevant methods

**Rationale:** Domain knowledge retrieval improves model quality.

### Phase 5: Actor-Critic Iteration

Implement refinement loop:
1. Modeler agent generates modeling方案
2. Critic agent evaluates quality
3. Iteration until threshold or max rounds

**Rationale:** Iteration improves output quality, mirrors expert review.

### Phase 6: Code Execution

Implement sandboxed execution:
1. Python code generation from model
2. Sandbox execution (Pyodide or subprocess)
3. Error handling and retry logic
4. Result extraction

**Rationale:** Actual computation produces results for report.

### Phase 7: Report Generation

Implement document output:
1. LaTeX template
2. Jinja2 rendering
3. Pandoc conversion to PDF

**Rationale:** Final deliverable for competition submission.

## Sources

- **MM-Agent Paper (arXiv:2505.14148):** Four-stage pipeline architecture, NeurIPS 2025, HIGH confidence
- **LLM-MM-Agent GitHub:** Implementation details, HMML structure, component breakdown, MEDIUM confidence
- **GSD Framework:** Phase orchestration, context engineering, wave execution patterns, HIGH confidence
- **Reflexion (arXiv:2303.11366):** Actor-Critic self-reflection pattern, MEDIUM confidence
- **Self-Refine (arXiv:2304.03020):** Iterative refinement framework, MEDIUM confidence

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Four-stage pipeline | HIGH | Directly from MM-Agent paper |
| Component boundaries | HIGH | From GitHub implementation + PROJECT.md |
| Actor-Critic pattern | MEDIUM | Based on Reflexion/Self-Refine papers, adapted for MM |
| DAG task dependency | HIGH | Standard pattern in scientific workflows |
| HMML structure | MEDIUM | From GitHub, need verification of latest version |
| GSD integration | HIGH | Directly from GSD framework docs |
| Build order | MEDIUM | Suggested based on dependencies, may adjust |