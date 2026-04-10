---
name: mm-agent-parse-problem
description: Parse unstructured problem text into structured format
---

<objective>
将非结构化赛题文本解析为结构化 problem.md，提取关键信息供后续阶段使用。
</objective>

<input>
- `problem_text`: 原始问题文本内容
</input>

<output>
输出文件: `.planning/phases/01-foundation-problem-pipeline/outputs/problem.md`
</output>

<output_format>

## problem.md 结构

```markdown
# Problem: {title}

## Metadata
- **Source:** {来源，如已知}
- **Parsed:** {解析时间}
- **Language:** {语言}

## Background

{问题背景描述}

## Questions

### Q1: {第一个问题标题}
{第一个问题的详细描述}

### Q2: {第二个问题标题}
{第二个问题的详细描述}

...

## Constraints

### Known Conditions
- {已知条件 1}
- {已知条件 2}
- ...

### Assumptions
- {可做假设 1}
- {可做假设 2}
- ...

## Objectives

### Main Goal
{主要建模目标}

### Sub-objectives
- {子目标 1}
- {子目标 2}
- ...

## Keywords

- {关键词 1}
- {关键词 2}
- ...

## Summary

{100-200 字的问题摘要，包含核心问题和主要目标}

## Raw Text

```
{原始问题文本，完整保留}
```

## Context Summary

**For downstream phases:**
- Problem type: {问题类型：优化/预测/评价/等}
- Key variables: {关键变量列表}
- Data available: {是否有提供数据}
- Expected output: {期望输出：模型/方案/报告}
```

</output_format>

<process>

## 1. 分析问题结构

使用 LLM 分析问题文本，识别：
- 问题标题
- 问题背景
- 具体问题（可能有多个子问题）
- 已知条件和约束
- 建模目标
- 关键词

## 2. 解析 Prompt 模板

```
请将以下数学建模赛题解析为结构化格式。

## 解析要求

1. **标题**: 提取问题的主题或标题
2. **背景**: 描述问题的现实背景和意义
3. **问题**: 列出所有需要回答的问题（可能有多个子问题）
4. **约束**: 提取所有已知条件、数据和限制
5. **目标**: 明确建模需要达成的目标
6. **关键词**: 提取 5-10 个关键词

## 注意事项

- 保持原始问题的完整性
- 不要添加原文没有的信息
- 如果某个部分不明确，标注为"需进一步分析"

## 原始赛题文本

{problem_text}
```

## 3. 结构化输出

将 LLM 的解析结果按照 `<output_format>` 格式整理。

## 4. 生成摘要

创建 100-200 字的问题摘要，包含：
- 问题核心是什么
- 主要建模目标
- 关键约束或挑战

## 5. 添加上下文摘要

为后续阶段生成简明的上下文信息：
- 问题类型分类
- 关键变量
- 数据可用性
- 期望输出类型

## 6. 保留原始文本

将原始问题文本完整保存在 `## Raw Text` 部分。

## 7. 写入文件

将结构化内容写入：
`.planning/phases/01-foundation-problem-pipeline/outputs/problem.md`

</process>

<quality_gate>
- [ ] 所有必填字段都有内容
- [ ] 摘要准确反映问题核心
- [ ] 原始文本完整保留
- [ ] 上下文摘要便于后续阶段理解
</quality_gate>