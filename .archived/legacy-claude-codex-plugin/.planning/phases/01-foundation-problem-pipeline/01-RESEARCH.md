# Phase 1: Foundation & Problem Pipeline - Research

**Phase:** 01-foundation-problem-pipeline
**Researched:** 2026-04-10
**Confidence:** HIGH

## Research Objective

研究如何实现 Phase 1：Foundation & Problem Pipeline。回答："需要了解什么才能规划好这个阶段？"

## Phase Scope Summary

**Goal:** 建立工作流基础设施和问题输入流程

**Requirements:**
- FND-01~04: Skill 框架、目录结构、配置、Git 追踪
- PROB-01~04: 工作流启动、问题解析、存储、上下文传递
- AGNT-05~06: 文件传递、迭代限制
- VRF-01~03: 验证门控

---

## Technical Research

### 1. Claude Code Skills Structure

Claude Code Skills 是声明式的 Markdown 文件，放置在 `.claude/skills/` 目录。

**Skill 文件结构：**
```markdown
---
name: skill-name
description: What this skill does
---

<objective>
What the skill accomplishes
</objective>

<execution_context>
Files to read for context
</execution_context>

<process>
Step-by-step instructions
</process>
```

**Discovery:** Skills are auto-discovered by Claude Code from:
- `~/.claude/skills/` (global)
- `.claude/skills/` (project-level)

**Invocation:** `/skill-name` from Claude Code CLI

**Sources:**
- GSD Framework skills in `$HOME/.claude/get-shit-done/commands/`
- Claude Code documentation

### 2. Problem Parsing Approach

**Challenge:** 将非结构化赛题文本解析为结构化 problem.md

**Approach 1: LLM Structured Output**
- 使用 LLM 将原始文本解析为结构化字段
- 优点：灵活，可处理各种格式
- 缺点：需要 LLM 调用成本

**Approach 2: Rule-based Parsing**
- 使用正则表达式和模式匹配
- 优点：确定性，无额外成本
- 缺点：难以处理变体格式

**Recommendation:** LLM Structured Output，因为数学建模赛题格式多样

**Implementation pattern:**
```markdown
<objective>
Parse the provided problem text into structured format
</objective>

<output_format>
## problem.md Structure
- title: string
- background: string
- questions: string[]
- constraints: string[]
- objectives: string[]
- keywords: string[]
- raw_text: string
- summary: string
</output_format>
```

### 3. PDF Parsing for Problem Input

**User clarification:** 赛题、论文与参考资料多为 PDF 格式

**PDF Text Extraction Options:**
- PyMuPDF (fitz): Fast, accurate text extraction
- pdfplumber: Good for tables and structured content
- pypdf: Simple, pure Python

**Recommendation:** PyMuPDF via MCP or direct Python execution

**Integration point:** Problem input skill should:
1. Detect file type (pdf/md/txt)
2. Extract text from PDF if needed
3. Pass text to parser

### 4. Context Passing Pattern (GSD-style)

**Pattern:** File-based context passing between phases

**Implementation:**
```
.planning/
├── phases/
│   ├── 01-foundation-problem-pipeline/
│   │   └── outputs/
│   │       └── problem.md    # Phase 1 output
│   ├── 02-modeling-agent-system/
│   │   ├── inputs/
│   │   │   └── problem.md    # Read from Phase 1
│   │   └── outputs/
│   │       └── plan.md       # Phase 2 output
```

**Context Summary Field:**
每个输出文件包含摘要字段，便于后续阶段快速理解关键信息。

### 5. Verification Gate Implementation

**Verification Types:**
1. **File existence:** `test -f problem.md`
2. **Required fields:** `grep "title:" problem.md`
3. **Format validation:** Check Markdown syntax

**Implementation approach:**
- Simple shell commands for verification
- Verification skill that runs checks
- Error messages with fix suggestions

### 6. Phase Directory Structure

**Recommended structure:**
```
.claude/
├── skills/
│   └── mm-agent/
│       ├── SKILL.md           # Main entry
│       ├── problem-input.md   # Problem parsing
│       └── verify-phase.md    # Verification gate
├── agents/
│   └── (Phase 2+)
└── hooks/
    └── (Phase 2+)

.planning/
├── phases/
│   └── 01-foundation-problem-pipeline/
│       ├── 01-CONTEXT.md
│       ├── 01-RESEARCH.md
│       ├── 01-PLAN-01.md
│       └── outputs/
│           └── problem.md
```

---

## Implementation Considerations

### Claude's Discretion Areas

以下细节可在执行阶段由 Claude 决定：
1. Skill 文件的具体组织结构
2. 问题解析 LLM prompt 的精确措辞
3. 验证错误消息的具体措辞
4. 配置参数的默认值

### Dependencies

**External:**
- Claude Code Skills system (built-in)
- PDF parsing library (PyMuPDF)

**Internal:**
- .planning/ directory (already created)
- config.json (already configured)

### Risk Mitigation

| Risk | Mitigation |
|------|------------|
| PDF 解析失败 | 提供文本输入作为备选 |
| 问题格式多变 | LLM 解析提供灵活性 |
| 验证门控过严 | YOLO 模式允许跳过 |

---

## Recommendations

1. **Skill 设计:** 使用模块化 Skill，每个功能一个文件
2. **问题解析:** 使用 LLM 结构化输出，处理 PDF 和文本
3. **验证:** 简单的文件和字段检查，避免过度工程
4. **上下文:** 遵循 GSD 文件传递模式

---

## Sources

- GSD Framework: `$HOME/.claude/get-shit-done/` — Skill patterns, workflow structure
- Claude Code docs: https://claude.ai/code — Skills documentation
- PyMuPDF: https://pymupdf.readthedocs.io/ — PDF text extraction

---
*Phase 1 research completed: 2026-04-10*
*Ready for planning*