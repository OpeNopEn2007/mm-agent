# Roadmap: MM-Agent in Claude Code

**Created:** 2026-04-10
**Granularity:** Standard
**Total Phases:** 7

## Overview

This roadmap delivers the MM-Agent mathematical modeling system in Claude Code. Each phase follows the natural pipeline from problem input to paper output, with clear success criteria and requirement mapping.

## Phases

- [x] **Phase 1: Claude Code Integration** - Establish Skills/Agents framework and workflow entry point
- [x] **Phase 2: Problem Analysis Pipeline** - Parse and structure competition problems from PDF/MD/TXT
- [x] **Phase 3: Task Decomposition with DAG** - Decompose into dependent tasks with Memory System
- [x] **Phase 4: HMML Knowledge Retrieval** - Retrieve relevant modeling methods from knowledge base
- [ ] **Phase 5: Mathematical Modeling with Actor-Critic** - Generate iterative modeling solutions
- [ ] **Phase 6: Code Generation & Execution** - Execute Python numerical simulations
- [ ] **Phase 7: Report Generation** - Produce LaTeX/PDF paper reports

## Phase Details

### Phase 1: Claude Code Integration

**Goal:** Establish the foundational Skills/Agents framework with workflow entry point that inherits Claude Code configuration

**Depends on:** Nothing (first phase)

**Requirements:** INTG-01, INTG-02, INTG-03, INTG-04

**Success Criteria** (what must be TRUE):
1. User can invoke `/mm-agent --problem <file>` command and receive initial workflow response
2. System inherits Claude Code's model configuration without requiring separate API keys
3. Workflow is defined as a Claude Code Skill with auto-discovery in `.claude/skills/`
4. Agents are registered for executing workflow phases with proper isolation

**Plans:** 4/4 complete

**Plan List:**
- [x] 01-01-PLAN.md — Create main mm-agent Skill and coordinator sub-skill entry points
- [x] 01-02-PLAN.md — Create phase-specific Agents (coordinator, modeler, programmer, reporter)
- [x] 01-03-PLAN.md — Implement workflow orchestration logic and configure Hooks
- [x] 01-04-PLAN.md — Verify workflow entry point and create smoke test fixtures

---

### Phase 2: Problem Analysis Pipeline

**Goal:** Parse unstructured competition problems and extract structured problem definition

**Depends on:** Phase 1

**Requirements:** PROB-01, PROB-02, PROB-03, PROB-04

**Success Criteria** (what must be TRUE):
1. User can provide PDF format problem file and system extracts full text content
2. User can provide Markdown or TXT format problem file and system parses it
3. System outputs `problem.md` with structured fields: title, background, questions, constraints, objectives, keywords, summary
4. System identifies problem context, research goals, and evaluation criteria from raw text

**Plans:** 4/4 complete

**Plan List:**
- [x] 02-01-PLAN.md — Install PyMuPDF and create parse-problem skill foundation (Wave 1)
- [x] 02-02-PLAN.md — Implement PDF text extraction with PyMuPDF (Wave 2)
- [x] 02-03-PLAN.md — Implement LLM-based structured extraction (Wave 2)
- [x] 02-04-PLAN.md — Integrate with coordinator and create PDF fixtures (Wave 2)

---

### Phase 3: Task Decomposition with DAG

**Goal:** Decompose problem into dependent subproblems with execution order and context passing

**Depends on:** Phase 2

**Requirements:** TASK-01, TASK-02, TASK-03, TASK-04, TASK-05, MEM-01, MEM-02, MEM-03

**Success Criteria** (what must be TRUE):
1. System identifies multiple subproblems from structured problem.md and assigns unique task IDs
2. System constructs DAG showing dependencies between tasks and outputs `dag.json`
3. System performs topological sort to determine execution order and outputs `execution-order.txt`
4. System detects circular dependencies and reports error with cycle details
5. System loads dependency task results from Memory files before starting dependent tasks
6. System writes task results to `task-{id}.json` Memory files after completion

**Plans:** 5/5 complete

**Plan List:**
- [x] 03-01-PLAN.md — Create test scaffolds for DAG operations, Memory system, and Task Decomposition (Wave 0)
- [x] 03-02-PLAN.md — Implement task-decomposition.md skill for subproblem identification (Wave 1)
- [x] 03-03-PLAN.md — Implement DAG operations with topological sort and cycle detection (Wave 1)
- [x] 03-04-PLAN.md — Implement Memory System I/O (load/write) with schema validation (Wave 2)
- [x] 03-05-PLAN.md — Integrate Phase 3 workflow into coordinator with context passing (Wave 2)

---

### Phase 4: HMML Knowledge Retrieval

**Goal:** Retrieve relevant mathematical modeling methods from hierarchical knowledge library

**Depends on:** Phase 3

**Requirements:** KNOW-01, KNOW-02, KNOW-03

**Success Criteria** (what must be TRUE):
1. System loads precomputed HMML embedding files from knowledge base directory
2. Given task description, system retrieves Top-K most relevant modeling methods
3. System outputs retrieval results to `retrieved-methods.json` with method names, descriptions, and similarity scores

**Plans:** 4/5 complete (04-01 test scaffolds skipped, created implicitly)

**Plan List:**
- [ ] 04-01-PLAN.md — Create test scaffolds for HMML retrieval (Wave 0) - SKIPPED
- [x] 04-02-PLAN.md — Create embedding precomputation script and generate HMML embeddings (Wave 1)
- [x] 04-03-PLAN.md — Create HMML retrieval script with cosine similarity and parent weighting (Wave 2)
- [x] 04-04-PLAN.md — Integrate HMML retrieval into coordinator workflow (Wave 3)
- [x] 04-05-PLAN.md — Verify Phase 4 completion with comprehensive artifact checks (Wave 4)

---

### Phase 5: Mathematical Modeling with Actor-Critic

**Goal:** Generate mathematical modeling solutions through iterative quality improvement

**Depends on:** Phase 4

**Requirements:** MODEL-01, MODEL-02, MODEL-03, MODEL-04, MODEL-05

**Success Criteria** (what must be TRUE):
1. System generates initial modeling plan based on task description and retrieved methods
2. System outputs `model.md` with modeling method, formulas, variables, and assumptions
3. System outputs `formulas.json` with structured mathematical formula definitions
4. System performs Actor-Critic iteration (max 3 rounds) to improve modeling quality
5. System stops iteration when modeling quality reaches threshold (satisfaction_threshold=8) instead of always completing max rounds

**Plans:** 4/4 planned

**Plan List:**
- [ ] 05-01-PLAN.md — Create test scaffolds for mathematical modeling (Wave 1)
- [ ] 05-02-PLAN.md — Implement Actor-Critic iteration in modeling skill (Wave 1)
- [ ] 05-03-PLAN.md — Integrate modeling skill into coordinator workflow (Wave 2)
- [ ] 05-04-PLAN.md — Verify Phase 5 completion (Wave 3)

---

### Phase 6: Code Generation & Execution

**Goal:** Generate and execute Python code for numerical simulation with error handling

**Depends on:** Phase 5

**Requirements:** CODE-01, CODE-02, CODE-03, CODE-04, CODE-05, CODE-06

**Success Criteria** (what must be TRUE):
1. System generates executable Python code based on modeling plan and formulas
2. System executes generated Python code in sandboxed environment
3. System captures execution output (stdout/stderr) and saves to results files
4. System automatically retries execution up to 5 times with error handling on failures
5. System outputs `results.json` with numerical results and generates visualization plots
6. System enforces 300-second execution timeout and terminates hanging processes

**Plans:** 4/4 planned

**Plan List:**
- [ ] 05-01-PLAN.md — Create test scaffolds for mathematical modeling (Wave 1)
- [ ] 05-02-PLAN.md — Implement Actor-Critic iteration in modeling skill (Wave 1)
- [ ] 05-03-PLAN.md — Integrate modeling skill into coordinator workflow (Wave 2)
- [ ] 05-04-PLAN.md — Verify Phase 5 completion (Wave 3)

---

### Phase 7: Report Generation

**Goal:** Generate final paper report with fixed outline, chapter-based context passing, and LaTeX/PDF compilation

**Depends on:** Phase 6

**Requirements:** RPT-01, RPT-02, RPT-03, RPT-04, RPT-05

**Key Design** (IDEA.md §11):
- Fixed outline structure with dynamic Task chapters (§11.2)
- Chapter relevance map for fine-grained context passing (§11.3)
- Scientific language prompt for academic writing (§11.5)
- mcmthesis (美赛) and cumcmthesis (国赛) template support (§11.6)

**Success Criteria** (what must be TRUE):
1. System generates fixed outline structure with dynamic Task chapters
2. System uses chapter relevance map for fine-grained context passing
3. System generates LaTeX following scientific language prompt (no markdown, continuous narrative)
4. System supports both mcmthesis and cumcmthesis templates
5. System compiles LaTeX to PDF and collects figures/codes as appendix

**Resources:**
- `.planning/templates/report-generator.py` - Report generation logic
- `.planning/templates/mcmthesis/` - 美赛模板
- `.planning/templates/cumcmthesis/` - 国赛模板
- `.planning/prompts/mm-agent-prompts.py` - 38 Prompt templates

**Plans:** 4/4 planned

**Plan List:**
- [ ] 05-01-PLAN.md — Create test scaffolds for mathematical modeling (Wave 1)
- [ ] 05-02-PLAN.md — Implement Actor-Critic iteration in modeling skill (Wave 1)
- [ ] 05-03-PLAN.md — Integrate modeling skill into coordinator workflow (Wave 2)
- [ ] 05-04-PLAN.md — Verify Phase 5 completion (Wave 3)

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Claude Code Integration | 4/4 | Complete | 2026-04-10 |
| 2. Problem Analysis Pipeline | 4/4 | Complete | 2026-04-10 |
| 3. Task Decomposition with DAG | 5/5 | Complete | 2026-04-11 |
| 4. HMML Knowledge Retrieval | 4/5 | Complete | 2026-04-11 |
| 5. Mathematical Modeling with Actor-Critic | 0/5 | Planned | - |
| 6. Code Generation & Execution | 0/6 | Not started | - |
| 7. Report Generation | 0/3 | Not started | - |

---

*Roadmap created: 2026-04-10*
*Phase 1 planned: 2026-04-10*
*Phase 2 planned: 2026-04-10*
*Phase 3 planned: 2026-04-11*
*Phase 4 planned: 2026-04-11*