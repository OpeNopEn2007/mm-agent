# Feature Research

**Domain:** Mathematical Modeling Multi-Agent System (Claude Code Integration)
**Researched:** 2026-04-10
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Problem input parsing | Users need to submit problems | LOW | Text/markdown input via CLI |
| Multi-agent coordination | Core to MM Agent architecture | HIGH | Planner, modeler, programmer, reviewer roles |
| Numerical simulation | Must execute models | MEDIUM | Python execution environment |
| Report generation | Final output requirement | MEDIUM | LaTeX/markdown to PDF |
| Progress tracking | Users want visibility | LOW | Phase status, checkpoints |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Format verification agent | Ensures report meets standards | MEDIUM | Specialized reviewer for formatting |
| Interactive refinement | User can steer modeling process | HIGH | Hooks for user intervention |
| Template library | Pre-built modeling templates | MEDIUM | Domain-specific templates |
| Verification loop | Confirm deliverables match goals | HIGH | GSD-style verification |
| Auto-advance mode | Autonomous execution | LOW | YOLO mode for confident runs |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Web UI | Visual interface appeal | Claude Code is CLI-native; web adds complexity | CLI-first, optional web later |
| Real-time collaboration | Team modeling appeal | Context synchronization nightmare | Single-user focus, async collaboration |
| Auto-save all state | Fear of losing work | Massive storage, retrieval overhead | Key checkpoints only |
| Unlimited model calls | Flexibility appeal | Cost explosion, timeout risks | Phased execution with limits |

## Feature Dependencies

```
Problem Input
    └──requires──> Problem Parser
                       └──requires──> Planner Agent

Planner Agent
    └──requires──> Modeler Agent
                       └──requires──> Programmer Agent
                                          └──requires──> Simulation Runtime

Programmer Agent
    └──enhances──> Reviewer Agent

Format Verification Agent ──conflicts──> Simple Report Generator (choose one)
```

### Dependency Notes

- **Simulation Runtime requires Python/NumPy:** Environment must be set up before execution
- **Format Verification enhances Report Generator:** Adds quality check layer
- **Planner Agent requires Problem Parser:** Can't plan without parsed problem

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- [ ] Problem input and parsing — essential to start workflow
- [ ] Basic multi-agent coordination (Planner → Modeler → Programmer → Reviewer) — core architecture
- [ ] Numerical simulation execution — essential output
- [ ] Basic report generation (markdown → PDF) — essential deliverable

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] Format verification agent — trigger: users report formatting issues
- [ ] Progress tracking/visibility — trigger: users want status updates
- [ ] Interactive refinement hooks — trigger: users want control points

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Template library — defer: need usage patterns first
- [ ] Web UI option — defer: CLI-native for now
- [ ] Team collaboration — defer: single-user focus

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Problem parsing | HIGH | LOW | P1 |
| Multi-agent coordination | HIGH | HIGH | P1 |
| Simulation execution | HIGH | MEDIUM | P1 |
| Report generation | HIGH | MEDIUM | P1 |
| Format verification | MEDIUM | MEDIUM | P2 |
| Progress tracking | MEDIUM | LOW | P2 |
| Interactive refinement | MEDIUM | HIGH | P3 |
| Template library | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | MM Agent (Original) | GSD Framework | Our Approach |
|---------|---------------------|---------------|--------------|
| Agent roles | Planner/Modeler/Programmer/Reviewer | Phase-specific agents | Combine MM Agent roles with GSD phases |
| Context management | In-memory state | Isolated phases with files | GSD-style file-based isolation |
| Verification | Manual review | Verification agent per phase | Add format verification agent |
| User interface | Web UI | CLI-native | CLI-first (Claude Code native) |
| Report format | LaTeX | Markdown/docs | LaTeX → PDF with format check |

## Sources

- MM Agent Paper: NeurIPS 2025 — Feature breakdown from paper
- LLM-MM-Agent repo: GitHub — Implemented features reference
- GSD Framework: get-shit-done — Workflow features
- Mathematical modeling contest guidelines — Standard workflow requirements

---
*Feature research for: Mathematical Modeling Multi-Agent System*
*Researched: 2026-04-10*