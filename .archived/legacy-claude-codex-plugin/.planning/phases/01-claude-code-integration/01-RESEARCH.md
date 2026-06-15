---
phase: 01
name: Claude Code Integration
researched: 2026-04-10
confidence: HIGH
---

# Phase 1 Research: Claude Code Integration

**Question:** What do I need to know to PLAN this phase well?

## Executive Summary

Claude Code Skills/Agents 体系是 Claude Code CLI 的原生扩展机制。Skills 是用户调用的命令入口，Agents 是系统编排的专业执行者。Phase 1 需要建立 `/mm-agent` Skill 作为数学建模工作流的入口点，并注册相关 Agents 执行各阶段任务。

关键技术：
1. **Skills** — `.claude/skills/*/SKILL.md` 定义，自动发现
2. **Agents** — `.claude/agents/*.md` 定义，可被 Skills/Agents 调用
3. **Hooks** — `settings.json` 配置，PreToolUse/PostToolUse
4. **Model Inheritance** — 无需单独配置，自动继承会话模型

---

## Technical Approaches

### 1. Claude Code Skills Structure

**Location:** `.claude/skills/<skill-name>/SKILL.md`

**Format:**
```markdown
---
name: <skill-name>
description: <one-line description>
---

<objective>
What this skill does
</objective>

<execution_context>
@<reference-files>
</execution_context>

<process>
Step-by-step instructions
</process>
```

**Auto-discovery:** Claude Code 自动扫描 `.claude/skills/*/SKILL.md`，技能名即目录名。

**Invocation:** 用户通过 `/skill-name [args]` 调用。

### 2. Claude Code Agents Structure

**Location:** `.claude/agents/<agent-name>.md`

**Format:**
```markdown
---
name: <agent-name>
description: <description>
tools: <tool-list>
color: <color>
---

<role>
Agent role definition
</role>

<execution_flow>
How the agent works
</execution_flow>

<structured_returns>
Return format
</structured_returns>
```

**Invocation:** 通过 Agent 工具的 `subagent_type` 参数调用。

### 3. Skill-Agent Orchestration

**Pattern 1: Skill invokes Agent directly**
```markdown
<process>
Use Agent tool with subagent_type="<agent-name>"
</process>
```

**Pattern 2: Skill invokes GSD workflow**
```markdown
<process>
Use Skill tool to invoke /gsd:plan-phase or /gsd:execute-phase
</process>
```

**Recommended for this project:** Pattern 2 — mm-agent Skill 作为 coordinator，内部调用 GSD phases。

### 4. Model Configuration Inheritance

**Key insight:** Claude Code Agents 自动继承当前会话的模型配置。无需在 Agent 定义中指定模型。

**How it works:**
1. 用户配置 Claude Code 的模型（通过 `/model` 或环境变量）
2. 所有 Skills/Agents 自动使用该模型
3. Agent 工具可选指定 `model` 参数覆盖

**Implementation:** Skill 中无需配置 API key，直接使用 Claude Code 工具。

### 5. Command Parameter Parsing

**Pattern:** Skill 接收 `$ARGUMENTS` 环境变量，包含用户传入的参数。

**Example:**
```markdown
<context>
**Flags:**
- `--problem <file>` — Problem file path (required)
- `--interactive` — Step-by-step mode
- `--phase N` — Resume from phase N
</context>

<process>
Parse $ARGUMENTS to extract parameters.
</process>
```

**Implementation approach:**
- Use Bash tool to parse arguments with regex
- Store parsed values in variables
- Pass to downstream commands

### 6. Hooks Configuration

**Location:** `~/.claude/settings.json` (global) or `.claude/settings.json` (project)

**Format:**
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          { "type": "command", "command": "python validate.py" }
        ]
      }
    ]
  }
}
```

**Pattern for this project:**
- PostToolUse for `.planning/memory/*.json` → schema validation
- PreToolUse for `python ...` → env check

---

## Implementation Gotchas

### 1. Skill Naming Convention

**Gotcha:** Skill 名必须是目录名，不是文件名。

**Correct:** `.claude/skills/mm-agent/SKILL.md` → 调用 `/mm-agent`
**Wrong:** `.claude/skills/mm-agent.md` → 不被发现

### 2. Agent tool Parameter

**Gotcha:** `subagent_type` 必须精确匹配 agent 文件中的 `name` frontmatter。

**Correct:** `subagent_type="gsd-planner"` (agent name)
**Wrong:** `subagent_type="planner"` (file name)

### 3. Skill Reference Syntax

**Gotcha:** `@file.md` 语法只在 `<execution_context>` 中有效。

**Correct:**
```markdown
<execution_context>
@$HOME/.claude/get-shit-done/workflows/new-project.md
</execution_context>
```

**Wrong:** 在 `<process>` 中使用 `@file.md` 不会加载文件。

### 4. Model Override

**Gotcha:** Agent 工具的 `model` 参数会覆盖会话模型。如果模型名不被 API 支持，会失败。

**Recommendation:** Auto mode 下不指定 `model`，让 Agent 继承会话模型。

### 5. Hook Timeout

**Gotcha:** Hook 命令有默认 timeout（通常 5-10s）。长时间验证会超时。

**Recommendation:** 保持 Hook 命令简单快速，复杂验证放在 Phase 内部。

---

## Dependencies

| Dependency | Purpose | Status |
|------------|---------|--------|
| GSD Framework | Phase/Plan/Execute workflow | Already installed |
| Claude Code CLI | Skills/Agents runtime | Already available |
| Python 3.12+ | Script execution | Need to verify |
| PyMuPDF | PDF parsing (Phase 2) | Phase 2 dependency |

**Phase 1 specific:** 无外部依赖，纯 Claude Code 配置。

---

## Testing Strategies

### Unit Testing (not applicable for Skills/Agents)

Skills/Agents 本身不直接测试，测试的是：
1. Skill 是否正确发现和加载
2. Agent 是否正确注册
3. 调用链是否正确传递参数

### Integration Testing

**Test 1:** Skill discovery
```bash
# Verify skill is discovered
claude skill list | grep mm-agent
```

**Test 2:** Skill invocation
```bash
# Test skill response
/mm-agent --problem tests/fixtures/simple.md
# Expect: initial workflow response
```

**Test 3:** Model inheritance
```bash
# Verify no separate API key needed
/mm-agent --problem tests/fixtures/simple.md
# Should work without additional config
```

### Smoke Test

**Minimal test case:**
```markdown
# Simple Test Problem

问题：求解 x + 5 = 10

目标：找到 x 的值
```

Expected flow:
1. `/mm-agent --problem simple.md` → Skill loads
2. Skill orchestrator → GSD workflow
3. Phase 1 passes → proceed to Phase 2

---

## Validation Architecture

### Dimension 8 Requirements (Nyquist)

**Validation Gate 1: Skill Discovery**
- Test: `claude skill list` shows `mm-agent`
- Acceptance: Skill name appears in list

**Validation Gate 2: Skill Invocation**
- Test: `/mm-agent --problem <file>` returns response
- Acceptance: Response contains workflow initiation message

**Validation Gate 3: Agent Registration**
- Test: Agent files exist in `.claude/agents/`
- Acceptance: `mm-agent-*.md` files present with valid frontmatter

**Validation Gate 4: Model Inheritance**
- Test: Skill runs without separate API config
- Acceptance: Uses session model, no API key required

**Validation Gate 5: Parameter Parsing**
- Test: `--problem` parameter correctly extracted
- Acceptance: Problem file path passed to downstream

---

## Recommended Implementation Order

| Step | What | Why |
|------|------|-----|
| 1 | Create Skill directory `.claude/skills/mm-agent/` | Foundation for entry point |
| 2 | Write `SKILL.md` with basic structure | Enable discovery |
| 3 | Create placeholder Agents `.claude/agents/mm-agent-*.md` | Register execution roles |
| 4 | Add parameter parsing in Skill | Enable `--problem` handling |
| 5 | Implement Skill orchestration logic | Call GSD phases |
| 6 | Configure Hooks in settings.json | Enable validation |
| 7 | Create smoke test fixture `tests/fixtures/simple.md` | Enable verification |

---

## Sources

- Claude Code Documentation: https://claude.ai/code
- GSD Framework: https://github.com/gsd-build/get-shit-done
- IDEA.md: Complete design document for this project

---
*Research completed: 2026-04-10*