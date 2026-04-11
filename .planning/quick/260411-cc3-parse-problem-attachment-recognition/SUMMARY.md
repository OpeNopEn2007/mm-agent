---
quick_id: 260411-cc3
slug: parse-problem-attachment-recognition
description: parse-problem attachment recognition
status: complete
completed: "2026-04-11T00:55:00Z"
---

# Quick Task: Parse-Problem Attachment Recognition

## Summary

Enhanced parse-problem.md with automatic attachment identification and search logic per IDEA.md §11.2.

## Changes

### Added Steps 2.6-2.7

**Step 2.6: Extract Attachment References**
- LLM analyzes problem text for attachment patterns
- Patterns: "附件1", "附件2", "附表", "附件说明", ".csv", ".xlsx"
- Output: attachment-patterns.json with glob patterns

**Step 2.7: Find Attachment Files**
- Uses Claude Code Glob tool for recursive search
- Searches from problem file directory
- Output: attachments.json with found/missing status
- Missing handling: Prompt user to provide files

### Output Files Added

| File | Purpose |
|------|---------|
| attachments.json | Attachment search results |
| attachment-patterns.json | Intermediate patterns |
| raw-problem-text.txt | Debug output |

### attachments.json Format

```json
{
  "files": [
    {
      "mentioned_as": "附件1_食堂数据",
      "found_path": "B题/附件1.csv",
      "type": "csv",
      "rows": 10000,
      "columns": [...]
    }
  ],
  "missing": [
    {
      "mentioned_as": "附件2",
      "expected_pattern": "**/附件2*.csv",
      "suggestion": "Please provide..."
    }
  ]
}
```

## Acceptance Criteria

- [x] Step 2.6: Attachment reference extraction
- [x] Step 2.7: Glob-based file search
- [x] Output: attachments.json
- [x] Missing handling: User prompt
- [x] Per IDEA.md §11.2 design

## Commit

```
3f6f94f feat(parse-problem): add attachment recognition and search logic
```

---

*Quick task completed: 2026-04-11*