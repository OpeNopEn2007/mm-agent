---
name: parse-problem
description: Parse unstructured problem text into structured format
---

# Parse Problem Skill

将非结构化赛题文本解析为结构化 problem.md，提取关键信息供后续阶段使用。

**Invocation:** The coordinator invokes this skill during Phase 2 (Problem Analysis).

## Parameters

- `problem_path` — Problem file path (PDF/MD/TXT), passed from coordinator

## Step 1: Detect file format and extract raw text

Determine parsing strategy from the file extension:

- `.pdf` — Use PyMuPDF (fitz) to extract text from all pages
- `.md` or `.txt` — Read with standard file I/O (UTF-8, fallback to latin-1)

If the extracted text is empty, report an error and stop.

## Step 2: Save raw text

Write the extracted text to `.planning/memory/raw-problem-text.txt` for debugging.

## Step 3: Identify attachment references

Analyze the problem text for attachment references. Look for patterns like:
- "附件1", "附件2", "附表", "附件说明", "数据文件"
- File names with extensions: `.csv`, `.xlsx`, `.txt`, `.dat`, `.json`
- Context clues: "见附件", "参考数据", "附件中包含"

Save identified patterns to `.planning/memory/attachment-patterns.json`.

For each attachment pattern, use the **Glob tool** to search for matching files in the problem file's directory. Save results to `.planning/memory/attachments.json` with:
- `files` — found attachments with path, type, and metadata
- `missing` — attachments mentioned but not found

If attachments are missing, display an error message listing the missing files and stop.

## Step 4: Extract structured fields using LLM

Ask the LLM to analyze the problem text and extract structured information:

> Analyze this mathematical modeling problem and extract structured information:
>
> {text}
>
> Return a JSON object with these fields:
> {
>   "title": "Problem title",
>   "background": "Context and problem statement (2-3 paragraphs)",
>   "questions": ["Question 1", "Question 2", ...],
>   "constraints": ["Constraint 1", ...],
>   "objectives": ["Objective 1", ...],
>   "keywords": ["keyword1", ...],
>   "summary": "One-sentence problem summary"
> }
>
> Extract ALL information. If a field is not explicitly stated, infer from context.

Validate that all 7 required fields are present in the JSON response.

## Step 5: Write problem.md

Create `.planning/memory/problem.md` with YAML frontmatter and structured sections:

```markdown
---
title: {title}
type: competition_problem
source: {problem_path}
---

# Background

{background}

## Questions

- Question 1
- Question 2

## Constraints

- Constraint 1

## Objectives

- Objective 1

## Keywords

- keyword1, keyword2

## Summary

{summary}
```

## Step 6: Validate output

Verify `.planning/memory/problem.md` exists and contains all required sections:
- YAML frontmatter with title
- Background, Questions, Constraints, Objectives, Keywords, Summary sections

---

## Quality Checklist

- [ ] File format detected (PDF/MD/TXT)
- [ ] Raw text extracted and saved
- [ ] Attachment references identified (if any)
- [ ] Attachment files found via Glob search
- [ ] All 7 fields extracted from problem text
- [ ] problem.md written with all sections
- [ ] Output validated
