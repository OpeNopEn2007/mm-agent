---
name: mm-agent-parse-problem
description: Parse unstructured problem text into structured format
---

<objective>
将非结构化赛题文本解析为结构化 problem.md，提取关键信息供后续阶段使用。
</objective>

<context>
**problem_path variable:**
The problem file path is passed from the coordinator skill or from SKILL.md.
Use this variable to access the file path.

**text variable:**
Store extracted text in a variable for structured extraction in Step 3.
</context>

<input>
- `problem_path`: Problem file path (PDF/MD/TXT)
- `problem_text`: 原始问题文本内容（如果已提供）
</input>

<output>
输出文件:
- `.planning/memory/problem.md` — 结构化问题描述
- `.planning/memory/attachments.json` — 附件查找结果（如有附件）
- `.planning/memory/raw-problem-text.txt` — 原始文本（调试用）
</output>

<process>

## Step 1: Detect file format

Parse file extension from problem_path to determine parsing strategy:
- `.pdf` → Use PyMuPDF (fitz)
- `.md` or `.txt` → Use standard file I/O

## Step 2: Extract raw text

For PDF files:
```python
import fitz  # PyMuPDF

def extract_pdf_text(pdf_path: str) -> str:
    """Extract all text from PDF file with error handling."""
    try:
        doc = fitz.open(pdf_path)
        if len(doc) == 0:
            raise ValueError("PDF file is empty or corrupted")
        
        text_pages = []
        for page_num, page in enumerate(doc):
            try:
                text = page.get_text()
                text_pages.append(text)
            except Exception as e:
                print(f"Warning: Failed to extract page {page_num}: {e}")
                text_pages.append("")
        
        doc.close()
        full_text = "\n".join(text_pages)
        
        if not full_text.strip():
            raise ValueError("No text extracted from PDF")
        
        return full_text
    except FileNotFoundError:
        raise FileNotFoundError(f"PDF file not found: {pdf_path}")
    except Exception as e:
        raise RuntimeError(f"PDF extraction error: {str(e)}")
```

For MD/TXT files:
```python
def read_text_file(file_path: str) -> str:
    """Read text file with encoding fallback."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    except UnicodeDecodeError:
        with open(file_path, 'r', encoding='latin-1') as f:
            return f.read()
    except FileNotFoundError:
        raise FileNotFoundError(f"File not found: {file_path}")
    except Exception as e:
        raise RuntimeError(f"File reading error: {str(e)}")
```

## Step 2.5: Write raw text to memory (for debugging)

```bash
mkdir -p .planning/memory
echo "$text" > .planning/memory/raw-problem-text.txt

if [ ! -s .planning/memory/raw-problem-text.txt ]; then
  echo "Error: No text extracted from problem file"
  exit 1
fi

echo "✓ Extracted $(wc -l < .planning/memory/raw-problem-text.txt) lines from problem file"
```

## Step 2.6: Extract attachment references from problem text

Analyze the extracted text to identify attachment references:

```
Scan the problem text for attachment references:

{text}

Identify all attachments mentioned in the problem:
- Look for patterns: "附件1", "附件2", "附表", "附件说明", "数据文件", "提供的表格"
- Look for explicit file names with extensions: .csv, .xlsx, .txt, .dat, .json
- Look for context clues: "见附件", "参考数据", "附件中包含"

Return JSON with attachment info:
{
  "attachments": [
    {
      "mentioned_as": "original text mentioning the attachment",
      "pattern": "glob pattern to search (e.g., **/附件1*.csv)",
      "expected_type": "csv|xlsx|txt|dat|json|unknown"
    }
  ],
  "has_attachments": true|false
}

If no attachments mentioned, return:
{
  "attachments": [],
  "has_attachments": false
}
```

Store the attachment patterns for later search:
```bash
mkdir -p .planning/memory
echo "$attachment_json" > .planning/memory/attachment-patterns.json

if [ "$(jq '.has_attachments' .planning/memory/attachment-patterns.json)" == "true" ]; then
  ATTACHMENT_COUNT=$(jq '.attachments | length' .planning/memory/attachment-patterns.json)
  echo "✓ Identified $ATTACHMENT_COUNT attachment references"
fi
```

## Step 2.7: Find attachment files using Glob

For each attachment pattern, search for matching files:

```bash
# Get problem directory (where the problem file is located)
PROBLEM_DIR=$(dirname "$problem_path")

# Initialize attachments.json
echo '{"files": [], "missing": []}' > .planning/memory/attachments.json

# If no attachments mentioned, skip this step
if [ "$(jq '.has_attachments' .planning/memory/attachment-patterns.json)" != "true" ]; then
  echo "✓ No attachments mentioned in problem"
  exit 0
fi

# Iterate through each attachment pattern
ATTACHMENT_COUNT=$(jq '.attachments | length' .planning/memory/attachment-patterns.json)
for i in $(seq 0 $((ATTACHMENT_COUNT - 1))); do
  PATTERN=$(jq -r ".attachments[$i].pattern" .planning/memory/attachment-patterns.json)
  MENTIONED=$(jq -r ".attachments[$i].mentioned_as" .planning/memory/attachment-patterns.json)
  EXPECTED_TYPE=$(jq -r ".attachments[$i].expected_type" .planning/memory/attachment-patterns.json)

  # Use Glob tool to search for files
  # Note: This requires Claude Code's Glob tool which will be invoked by the skill
  echo "Searching for: $PATTERN in $PROBLEM_DIR"

  # Placeholder for Glob results (actual search happens via Claude Code tool)
  # Glob --pattern "$PATTERN" --path "$PROBLEM_DIR"
done
```

**Claude Code Tool Integration:**

The skill will use Claude Code's Glob tool to search for attachments:

```markdown
After identifying attachment patterns, use the Glob tool to search:

For each attachment pattern from attachment-patterns.json:
1. Glob --pattern "{pattern}" --path "{problem_directory}"
2. If found:
   - Add to attachments.json with found_path
   - Read file to get metadata (rows, columns if CSV/XLSX)
3. If not found:
   - Add to attachments.json "missing" array
   - Prompt user to provide the attachment
```

**Output attachments.json format:**

```json
{
  "files": [
    {
      "mentioned_as": "附件1_食堂历史运行数据",
      "found_path": "春季补选/B题/附件1_食堂历史运行数据.csv",
      "type": "csv",
      "rows": 10000,
      "columns": ["日期", "时段", "进店人数", "..."]
    }
  ],
  "missing": [
    {
      "mentioned_as": "附件2_窗口信息",
      "expected_pattern": "**/附件2*.csv",
      "suggestion": "Please provide the file or specify path with --attachments"
    }
  ]
}
```

**Missing attachment handling:**

```markdown
If attachments.json has entries in "missing" array, display error:

❌ 附件未找到

题目提及以下附件：
{for each missing attachment}
- {mentioned_as}

请提供附件：
1. 将附件文件放入题目目录
2. 或手动指定路径：
   /mm-agent --problem {problem_path} --attachments "附件1.csv,附件2.csv"
```

## Step 3: Extract structured fields using LLM

Analyze the extracted text and extract the following 7 fields as JSON:

```
Analyze this mathematical modeling problem and extract structured information:

{text}

Return a JSON object with these fields:
{
  "title": "Problem title (string)",
  "background": "Context and problem statement (2-3 paragraphs)",
  "questions": ["Question 1", "Question 2", ...],
  "constraints": ["Constraint 1", "Constraint 2", ...],
  "objectives": ["Objective 1", "Objective 2", ...],
  "keywords": ["keyword1", "keyword2", ...],
  "summary": "One-sentence problem summary"
}

Guidelines:
- Extract ALL information from the problem
- If a field is not explicitly stated, infer it from context
- If truly not present, use "not specified"
- Return ONLY valid JSON, no markdown formatting
```

Validation:
```python
import json

problem_data = json.loads(problem_json)
required_fields = ["title", "background", "questions", "constraints", "objectives", "keywords", "summary"]

for field in required_fields:
    if field not in problem_data:
        raise ValueError(f"Missing required field: {field}")
```

## Step 4: Write problem.md to memory

```python
import yaml

frontmatter = {
    'title': problem_data['title'],
    'type': 'competition_problem',
    'source': problem_path
}

def format_list(items):
    if not items:
        return "- (none specified)"
    return "\n".join(f"- {item}" for item in items)

content = f"""---
{yaml.dump(frontmatter, default_flow_style=False).strip()}
---

# Background

{problem_data['background']}

## Questions

{format_list(problem_data['questions'])}

## Constraints

{format_list(problem_data['constraints'])}

## Objectives

{format_list(problem_data['objectives'])}

## Keywords

{format_list(problem_data['keywords'])}

## Summary

{problem_data['summary']}
"""

mkdir -p .planning/memory
with open('.planning/memory/problem.md', 'w', encoding='utf-8') as f:
    f.write(content)

print(f"✓ Wrote problem.md to .planning/memory/")
```

Verify output:
```bash
test -f .planning/memory/problem.md || exit 1
grep -q "^title:" .planning/memory/problem.md || exit 1
grep -q "# Background" .planning/memory/problem.md || exit 1
grep -q "## Questions" .planning/memory/problem.md || exit 1
grep -q "## Constraints" .planning/memory/problem.md || exit 1
grep -q "## Objectives" .planning/memory/problem.md || exit 1
grep -q "## Keywords" .planning/memory/problem.md || exit 1
grep -q "## Summary" .planning/memory/problem.md || exit 1

echo "✓ problem.md validated with all 7 fields"
```

</process>

<quality_gate>
- [ ] PDF/MD/TXT text extraction successful
- [ ] Attachment references identified (if any)
- [ ] Attachment files searched using Glob
- [ ] attachments.json created with found/missing status
- [ ] All 7 fields extracted from problem text
- [ ] problem.md written to .planning/memory/
- [ ] All sections present: Background, Questions, Constraints, Objectives, Keywords, Summary
</quality_gate>

<notes>
**Skill auto-discovery:**
This skill is automatically discovered by Claude Code from `.claude/skills/mm-agent/parse-problem.md`.

**Coordinator integration:**
The coordinator skill invokes parse-problem with the problem file path after initial validation in SKILL.md.

**Attachment handling (IDEA.md §11.2):**
- Step 2.6: LLM extracts attachment references from problem text
- Step 2.7: Glob tool searches for attachment files recursively
- Output: attachments.json with found/missing status
- Missing attachments: Prompt user to provide files or specify paths

**Output format:**
problem.md is written to `.planning/memory/` for use by Phase 3 (Task Decomposition).
attachments.json is written to `.planning/memory/` for use by Phase 5 (Modeling) and Phase 6 (Code Execution).

**Requirements addressed:**
- PROB-01: PDF parsing with PyMuPDF
- PROB-02: MD/TXT file reading
- PROB-03: LLM structured extraction with 7 fields
- PROB-04: Output problem.md with structured format
- Attachment handling: Glob-based search with missing file prompts
</notes>