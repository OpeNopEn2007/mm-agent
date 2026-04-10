# Architecture Research

**Domain:** Mathematical Modeling Multi-Agent System (Claude Code Integration)
**Researched:** 2026-04-10
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    User Interface Layer                       │
│                   (Claude Code CLI / Skills)                  │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │ Problem │  │  Skill  │  │  Skill  │  │  Skill  │        │
│  │  Input  │  │ Execute │  │ Verify  │  │ Report  │        │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
│       │            │            │            │              │
├───────┴────────────┴────────────┴────────────┴──────────────┤
│                   Agent Orchestration Layer                   │
│                     (GSD-style phases)                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │ Planner │  │ Modeler │  │Programmer│ │Reviewer │        │
│  │  Agent  │  │  Agent  │  │  Agent   │ │  Agent  │        │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
│       │            │            │            │              │
├───────┴────────────┴────────────┴────────────┴──────────────┤
│                    Execution Layer                            │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │  Python  │  │  LaTeX   │  │  Report  │                   │
│  │  Runtime │  │ Generator│  │  Output  │                   │
│  └──────────┘  └──────────┘  └──────────┘                   │
├─────────────────────────────────────────────────────────────┤
│                    State Layer                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ Planning │  │ Context  │  │  Output  │                   │
│  │   Docs   │  │  Files   │  │  Files   │                   │
│  └──────────┘  └──────────┘  └──────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Problem Input Skill | Receive and parse contest problems | Markdown skill with parsing logic |
| Planner Agent | Analyze problem, create modeling plan | Claude Agent with planning prompts |
| Modeler Agent | Derive mathematical models from plan | Claude Agent with math reasoning |
| Programmer Agent | Convert models to executable code | Claude Agent with Python code generation |
| Reviewer Agent | Validate results, check format | Claude Agent with review prompts |
| Python Runtime | Execute numerical simulations | Local Python environment |
| LaTeX Generator | Format reports for submission | Pandoc + LaTeX templates |
| State Layer | Persist context and outputs | File-based (.planning/ directory) |

## Recommended Project Structure

```
.claude/
├── skills/
│   ├── mm-agent/
│   │   ├── SKILL.md           # Main entry skill
│   │   ├── problem-input.md   # Problem parsing skill
│   │   ├── execute-phase.md   # Phase execution skill
│   │   ├── verify-phase.md    # Phase verification skill
│   │   └── generate-report.md # Report generation skill
│   └── mm-agent-workflow.md   # Full workflow skill
├── agents/
│   ├── planner.md             # Planner agent definition
│   ├── modeler.md             # Modeler agent definition
│   ├── programmer.md          # Programmer agent definition
│   ├── reviewer.md            # Reviewer agent definition
│   └── format-verifier.md     # Format verification agent
├── hooks/
│   └── post-simulation.md     # Hook for simulation results
│   └── pre-report.md          # Hook for report validation
└── templates/
    ├── report-template.md     # LaTeX report template
    └── phase-template.md      # Phase plan template

.planning/
├── PROJECT.md                 # Project context
├── ROADMAP.md                 # Phase roadmap
├── STATE.md                   # Current state
├── phases/
│   ├── phase-1/               # Phase 1 artifacts
│   ├── phase-2/               # Phase 2 artifacts
│   └── ...
└── output/
    ├── models/                # Mathematical models
    ├── simulations/           # Simulation results
    └── reports/               # Final reports
```

### Structure Rationale

- **skills/mm-agent/:** Modular skills for each workflow step
- **agents/:** Specialized agent definitions for MM Agent roles
- **hooks/:** Event triggers for validation and state management
- **templates/:** Reusable templates for reports and phases
- **.planning/:** GSD-style state management directory

## Architectural Patterns

### Pattern 1: Phase-Based Execution (GSD-style)

**What:** Execute workflow in discrete phases with verification at each step
**When to use:** Complex multi-step workflows with dependencies
**Trade-offs:** More overhead, but better error recovery and visibility

**Example:**
```
Phase 1: Problem Understanding → verify → Phase 2: Model Planning → verify → ...
```

### Pattern 2: Agent Role Specialization (MM Agent-style)

**What:** Each agent has a specific role (planner, modeler, programmer, reviewer)
**When to use:** Complex tasks requiring different expertise
**Trade-offs:** More agents to manage, but better quality through specialization

**Example:**
```
Planner Agent → outputs plan.md → Modeler Agent reads plan.md → outputs model.md
```

### Pattern 3: Context Isolation (GSD-style)

**What:** Each phase/agent has isolated context, passes outputs via files
**When to use:** Preventing context pollution, enabling recovery
**Trade-offs:** More file I/O, but cleaner state management

## Data Flow

### Request Flow

```
[Problem Input]
    ↓
[Problem Parser] → [Planner Agent] → [Modeler Agent] → [Programmer Agent]
    ↓                  ↓                 ↓                  ↓
[Parsed Problem]   [Plan.md]         [Model.md]         [Code.py]
                                                        ↓
                                                   [Python Runtime]
                                                        ↓
                                                   [Results.json]
                                                        ↓
                                                   [Reviewer Agent]
                                                        ↓
                                                   [Report.md]
                                                        ↓
                                                   [PDF Output]
```

### State Management

```
[.planning/phases/phase-N/]
    ↓ (read by next agent)
[Next Agent] ←→ [Context Files] → [Output Files]
    ↓
[.planning/phases/phase-N+1/]
```

### Key Data Flows

1. **Problem to Plan:** Problem text → Planner Agent → structured plan.md
2. **Plan to Model:** plan.md → Modeler Agent → mathematical model.md
3. **Model to Code:** model.md → Programmer Agent → executable Python code
4. **Code to Results:** code execution → simulation results → JSON/plots
5. **Results to Report:** results + template → formatted report → PDF

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-10 problems | Single-phase execution, basic agents |
| 10-100 problems | Multi-phase with verification, parallel agents |
| 100+ problems | Consider caching, template reuse, batch processing |

### Scaling Priorities

1. **First bottleneck:** Agent context window → use GSD context isolation
2. **Second bottleneck:** Report generation time → template caching

## Anti-Patterns

### Anti-Pattern 1: Global State Without Isolation

**What people do:** Keep all context in memory or single file
**Why it's wrong:** Context pollution, hard to recover from errors
**Do this instead:** GSD-style isolated phase directories

### Anti-Pattern 2: Monolithic Agent

**What people do:** One agent does everything (planning + modeling + coding)
**Why it's wrong:** Quality suffers, hard to debug specific failures
**Do this instead:** Specialized agents per MM Agent role

### Anti-Pattern 3: Skip Verification

**What people do:** Run through phases without checking outputs
**Why it's wrong:** Errors cascade, late-stage failures expensive
**Do this instead:** GSD verification at each phase transition

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Python runtime | Local execution | NumPy/SciPy environment required |
| LaTeX/Pandoc | Local execution | For report generation |
| Claude API | Via Claude Code | Agent execution, model calls |
| MCP Servers | Optional | For web search, external tools |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Skill → Agent | File outputs | Skills spawn agents, pass files |
| Agent → Agent | Context files | Each agent reads predecessor output |
| Phase → Phase | Verification gate | Verification agent checks before transition |

## Sources

- MM Agent Paper: NeurIPS 2025 — Multi-agent architecture
- LLM-MM-Agent repo: GitHub — Reference implementation structure
- GSD Framework: get-shit-done — Phase/plan/execute patterns
- Claude Code docs: Skills/Hooks/Agents architecture

---
*Architecture research for: Mathematical Modeling Multi-Agent System*
*Researched: 2026-04-10*