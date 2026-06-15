---
phase: 1
name: Claude Code Integration
created: 2026-04-10
---

# Phase 1 Context: Claude Code Integration

**Goal:** Establish Skills/Agents framework with workflow entry point that inherits Claude Code configuration.

**Domain:** Claude Code Skills/Hooks/Agents 体系的数学建模工作流入口。

---

## Prior Decisions

**From PROJECT.md:**
- CLI-first，不做 Web UI
- 继承 Claude Code 模型配置，无需单独 API Key
- 使用 GSD 框架的 phase/plan/execute 模式
- 文件持久化（JSON），不用数据库

**From REQUIREMENTS.md:**
- INTG-01: `/mm-agent --problem <file>` 启动命令
- INTG-02: 继承 Claude Code 模型配置
- INTG-03: Skill 定义工作流入口
- INTG-04: Agents 执行各阶段任务

---

## Decisions

### Skill Structure

**Decision:** Single entry Skill + phase-specific sub-skills

**Why:** 用户体验简单，单命令启动全流程。内部通过 coordinator orchestrator 调度各阶段。

**Implementation:**
- `.claude/skills/mm-agent/SKILL.md` — 主入口 Skill
- `.claude/skills/mm-agent/problem-input.md` — 问题输入子 Skill
- `.claude/skills/mm-agent/parse-problem.md` — 问题解析子 Skill
- 内部调用 GSD 的 `/gsd:plan-phase` 和 `/gsd:execute-phase`

### Agent Architecture

**Decision:** Phase-specific Agents (Modeler, Programmer, Reporter)

**Why:** 专业化分工，每个阶段由专门 Agent 执行，可并行。

**Implementation:**
| Agent | Phase | Responsibilities |
|-------|-------|-----------------|
| mm-agent-modeler | Phase 5 | Actor-Critic 建模迭代 |
| mm-agent-programmer | Phase 6 | 代码生成、执行、调试 |
| mm-agent-reporter | Phase 7 | 报告生成、LaTeX 转换 |
| mm-agent-coordinator | All | DAG 编排、Memory 管理 |

**Claude's Discretion:**
- Coordinator Agent 是否需要独立定义，还是由 Skill 内部逻辑处理
- Modeler 内部 Actor-Critic 是否拆分为两个 Agent（v2 考虑）

### Command Parameters

**Decision:** Basic + optional advanced parameters

**Parameters:**
```
/mm-agent --problem <file> [--interactive] [--skip-verify] [--phase N]
```

| Parameter | Purpose | Default |
|-----------|---------|---------|
| --problem | 问题文件路径（必需） | - |
| --interactive | 逐步确认模式 | auto |
| --skip-verify | YOLO 模式，跳过验证 | 验证启用 |
| --phase | 从指定阶段继续 | 从头开始 |

**Why:** 覆盖主要使用场景，高级参数支持灵活调试。

### Hooks Configuration

**Decision:** PostToolUse for validation, PreToolUse for environment checks

**Hooks:**
| Hook Type | Trigger | Action |
|-----------|---------|--------|
| PostToolUse | Write `.planning/memory/*.json` | Schema validation |
| PostToolUse | Write `.planning/phases/*/` | Output format verification |
| PreToolUse | Bash `python ...` | Python env check |

**Why:** 自动化验证减少人工检查，环境检查避免执行失败。

---

## Specifics

**User Reference:** IDEA.md 提供了完整的设计文档，包含 Skills/Agents 结构、Hooks 配置、参数设计。

**Implementation Notes:**
- Skill 定义使用 markdown frontmatter 格式
- Agent 定义使用 `.claude/agents/*.md` 格式
- Hooks 配置在 `settings.json` 中

---

## Canonical Refs

- `.planning/PROJECT.md` — 项目定义和约束
- `.planning/REQUIREMENTS.md` — INTG-01 到 INTG-04 需求
- `.planning/research/STACK.md` — Claude Code Skills/Hooks/Agents 技术栈
- `.planning/research/ARCHITECTURE.md` — 四阶段流水线架构
- `IDEA.md` — 完整设计文档（Skills/Agents/Hooks/参数）

---

## Deferred Ideas

None for Phase 1 scope.

---

## Claude's Discretion

1. **Coordinator vs Skill logic:** 是否需要独立 Coordinator Agent，还是由 Skill 内部 orchestrator 逻辑处理？建议 v1 使用 Skill 内部逻辑（更简单）。

2. **Agent naming convention:** `mm-agent-{role}` vs `gsd-{role}-mm-agent`？建议使用前者（清晰区分 mm-agent 项目 agents）。

3. **Hook script location:** `.claude/scripts/` vs `.planning/scripts/`？建议前者（Claude Code 标准）。

---

*Context created: 2026-04-10*
*Auto mode decisions logged*