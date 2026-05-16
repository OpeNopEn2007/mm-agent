---
name: mm-agent
description: Mathematical modeling workflow - parse problems, build models, execute simulations, generate reports
---

# MM-Agent Skill

Execute end-to-end mathematical modeling workflow from problem input to paper report output.

**Invocation:** `/mm-agent --problem <file>`

The workflow inherits Claude Code's model configuration automatically — no separate API keys or model configuration needed.

**Core value:** 输入非结构化赛题 → 自动化数学建模全流程 → 输出符合要求的论文报告

## Arguments

Parse `$ARGUMENTS` for these flags:

| Flag | Description | Required |
|------|-------------|----------|
| `--problem <file>` | Problem file path (PDF/MD/TXT) | Yes |
| `--interactive` | Step-by-step confirmation mode | No |
| `--skip-verify` | Skip verification gates | No |
| `--phase N` | Resume from phase N (1-7) | No |

Default (no flags): Full auto workflow.

## Step 1: Validate problem file

1. Extract the `--problem` file path from `$ARGUMENTS`
2. Verify the file exists — if not, tell the user and stop
3. Verify the file extension is `.pdf`, `.md`, or `.txt` — if not, tell the user the supported formats and stop
4. Verify the file is readable — if not, tell the user and stop

## Step 2: Invoke coordinator

Use the **Skill tool** to invoke `mm-agent-coordinator` with the validated problem file path.

The coordinator handles:
- Memory system initialization (`.planning/memory/`)
- Phase 2: Problem Analysis (parse-problem skill)
- Phase 3: Task Decomposition (task-decomposition skill + DAG construction)
- Phases 4–6: Per-task execution loop (HMML retrieval → modeling → code execution)
- Phase 7: Report Generation (report-generation skill)
- Progress tracking and error handling

## Step 3: Report completion

After the coordinator completes, display the output summary:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 Workflow Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Output: .planning/output/report.pdf
Memory: .planning/memory/task-*.json
```

---

## Phase Overview

1. **Problem Analysis** — Parse and structure competition problems from PDF/MD/TXT
2. **Task Decomposition** — Build DAG with dependencies and execution order
3. **HMML Knowledge Retrieval** — Find relevant modeling methods using embedding search
4. **Mathematical Modeling** — Generate models via Actor-Critic iteration (max 3 rounds)
5. **Code Generation & Execution** — Run Python numerical simulations with error repair
6. **Report Generation** — Produce LaTeX/PDF paper reports

## Notes

- **Skill auto-discovery:** Claude Code discovers this skill from `skills/mm-agent/SKILL.md`
- **Model inheritance:** Uses Claude Code's configured model (set via `/model` command)
- **Error handling:** Each phase has its own error recovery; coordinator aggregates failures for final report
