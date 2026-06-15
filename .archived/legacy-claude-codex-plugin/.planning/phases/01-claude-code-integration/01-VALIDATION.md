---
phase: 01
slug: claude-code-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual + Smoke tests |
| **Config file** | none — Skills/Agents tested by invocation |
| **Quick run command** | `/mm-agent --problem tests/fixtures/simple.md` |
| **Full suite command** | Full workflow smoke test |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Verify Skill/Agent files exist
- **After every plan wave:** Run smoke test invocation
- **Before `/gsd:verify-work`:** Full workflow entry verified
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | INTG-03 | file | `test -f .claude/skills/mm-agent/SKILL.md` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | INTG-04 | file | `test -f .claude/agents/mm-agent-*.md` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | INTG-01 | smoke | `/mm-agent --problem tests/fixtures/simple.md` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 1 | INTG-02 | smoke | Verify no API key needed | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `.claude/skills/mm-agent/SKILL.md` — Skill entry point
- [ ] `.claude/agents/mm-agent-coordinator.md` — Orchestrator agent
- [ ] `.claude/agents/mm-agent-modeler.md` — Modeling agent stub
- [ ] `.claude/agents/mm-agent-programmer.md` — Programming agent stub
- [ ] `.claude/agents/mm-agent-reporter.md` — Report agent stub
- [ ] `tests/fixtures/simple.md` — Minimal test problem

*Infrastructure: No test framework needed — Skills/Agents tested by invocation.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Skill discovery | INTG-03 | Claude Code auto-discovery is internal | Run `/mm-agent` and observe response |
| Model inheritance | INTG-02 | Cannot programmatically verify API key absence | Verify skill runs without extra config |
| Parameter parsing | INTG-01 | Requires interactive session | Test with `--problem`, `--interactive`, `--phase` flags |

---

## Validation Sign-Off

- [ ] All tasks have file or smoke test verification
- [ ] Sampling continuity: no 3 consecutive tasks without verify
- [ ] Wave 0 covers all MISSING files
- [ ] No watch-mode flags (manual verification only)
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending