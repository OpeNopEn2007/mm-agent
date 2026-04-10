# Pitfalls Research

**Domain:** Mathematical Modeling Multi-Agent System (Claude Code Integration)
**Researched:** 2026-04-10
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Context Loss Between Agents

**What goes wrong:**
Information from earlier phases (problem understanding, model assumptions) gets lost when later agents execute. Results don't match original problem intent.

**Why it happens:**
Agents operate independently, each has limited context window. Without explicit context passing, critical information disappears.

**How to avoid:**
Use GSD-style context isolation with explicit output files. Each agent writes its reasoning to a file that the next agent reads. Include "Context Summary" section in all outputs.

**Warning signs:**
- Later agent outputs contradict earlier analysis
- Results don't match problem statement
- User has to re-explain problem mid-workflow

**Phase to address:**
All phases — implement context file passing from Phase 1

---

### Pitfall 2: Infinite Agent Loops

**What goes wrong:**
Agents call each other recursively without termination. Planner → Modeler → Programmer → back to Planner for refinement → infinite cycle.

**Why it happens:**
No explicit termination conditions, agents keep "refining" indefinitely.

**How to avoid:**
Define max iterations per phase, explicit completion criteria, and termination signals. GSD's verification gates help — each phase must pass verification to advance.

**Warning signs:**
- Workflow never completes
- Same agent keeps spawning
- Token usage explodes without output

**Phase to address:**
Phase 1 — implement termination logic and max iteration limits

---

### Pitfall 3: Numerical Simulation Failures

**What goes wrong:**
Generated Python code has bugs, numerical errors, or doesn't match the mathematical model. Simulation outputs garbage or crashes.

**Why it happens:**
Programmer Agent generates code without testing. No validation between code generation and execution. Models may be mathematically correct but computationally infeasible.

**How to avoid:**
Add verification agent between Programmer and Simulation. Run unit tests on generated code before full simulation. Include "Code Validation" phase.

**Warning signs:**
- Python execution errors
- Results are NaN or obviously wrong
- Simulation runs forever without output

**Phase to address:**
Phase 3 (Simulation) — add code verification sub-phase

---

### Pitfall 4: Report Format Drift

**What goes wrong:**
Generated report doesn't meet contest submission requirements. Missing sections, wrong citation format, incorrect structure.

**Why it happens:**
Report generation is done by a general-purpose agent without specific format knowledge. No verification against submission guidelines.

**How to avoid:**
Add dedicated Format Verification Agent. Define explicit template with required sections. Add format checklist as verification gate.

**Warning signs:**
- Report missing required sections (Abstract, References, etc.)
- Citation format incorrect
- Formatting inconsistent across sections

**Phase to address:**
Phase 4 (Report) — add format verification sub-agent

---

### Pitfall 5: Over-Engineering the Model

**What goes wrong:**
Modeler Agent creates unnecessarily complex model. Too many variables, over-specified equations, impractical simulation requirements.

**Why it happens:**
LLMs tend toward complexity. No constraints on model complexity. "More sophisticated" seems better.

**How to avoid:**
Add simplicity constraint in Modeler Agent prompt. Include "Model Complexity Check" as verification step. Set max variables/equations limits.

**Warning signs:**
- Model has 50+ variables
- Simulation takes hours
- Results hard to interpret

**Phase to address:**
Phase 2 (Modeling) — add complexity constraints

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip verification | Faster execution | Hidden errors cascade | Never |
| Single monolithic agent | Easier to set up | Quality suffers, hard to debug | Prototype only |
| Hardcoded prompts | Quick to write | Can't update without code changes | Never — use Skills |
| No context files | Less file I/O | Context loss, debugging nightmare | Never |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Python execution | Run untrusted code directly | Sandbox or validate generated code first |
| LaTeX generation | Assume LaTeX installed | Check environment, provide fallback to markdown |
| Claude API | Unlimited calls | Set token/call limits per phase |
| File outputs | Write to random locations | Use structured .planning/ directory |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Large context files | Slow agent reads | Keep files concise, summarize | 100+ KB per file |
| No caching | Re-generate same templates | Cache templates, reuse | 10+ runs |
| Unlimited iterations | Workflow never ends | Max iteration limits | Any scale |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Run untrusted Python code | Arbitrary execution | Validate/sandbox generated code |
| Store API keys in prompts | Key exposure | Use environment variables |
| No output validation | Garbage accepted as results | Verification gates |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No progress visibility | User thinks it's stuck | Phase progress updates |
| No error recovery | One error ruins everything | GSD checkpoint recovery |
| Mystery failures | User doesn't know what went wrong | Explicit error messages with phase info |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Report generated:** Often missing citations, appendices — verify complete structure
- [ ] **Simulation ran:** Often missing result validation — verify output makes sense
- [ ] **Model defined:** Often missing assumptions documentation — verify context captured
- [ ] **Workflow complete:** Often missing final verification — verify all phases passed

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Context loss | MEDIUM | Re-run from phase where context exists, fix passing |
| Infinite loop | LOW | Kill agents, add iteration limit, re-run |
| Simulation failure | MEDIUM | Debug generated code, fix, re-run simulation phase |
| Format drift | LOW | Run format verification, fix template |
| Over-engineering | MEDIUM | Simplify model, re-run from modeling phase |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Context loss | Phase 1 | Context file check at each transition |
| Infinite loops | Phase 1 | Max iteration counter |
| Simulation failure | Phase 3 | Code validation before execution |
| Format drift | Phase 4 | Format checklist verification |
| Over-engineering | Phase 2 | Complexity constraint check |

## Sources

- MM Agent Paper: NeurIPS 2025 — Known limitations discussed
- LLM-MM-Agent repo: GitHub — Issues and challenges
- GSD Framework: get-shit-done — Built-in pitfall prevention patterns
- Claude Code extension docs: Common mistakes in skill/agent design
- Mathematical modeling contest experience: Typical failure modes

---
*Pitfalls research for: Mathematical Modeling Multi-Agent System*
*Researched: 2026-04-10*