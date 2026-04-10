# Phase 1: Foundation & Problem Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 01-foundation-problem-pipeline
**Mode:** Auto (--auto)
**Areas discussed:** Skill Entry Point Design, Problem Input Format, Problem Parsing Output Structure, Verification Gate Design, Context Passing Mechanism

---

## Skill Entry Point Design

| Option | Description | Selected |
|--------|-------------|----------|
| /mm-agent 命令 | CLI 原生，符合 Claude Code 使用习惯 | ✓ |
| /math-model 命令 | 更明确的命名，但较长 | |
| 自定义 skill 前缀 | 如 /mm:start, /mm:problem | |

**User's choice:** /mm-agent 命令 (auto-selected - recommended)
**Notes:** CLI-first approach per PROJECT.md, aligns with Claude Code conventions

---

## Problem Input Format

| Option | Description | Selected |
|--------|-------------|----------|
| 文件路径参数 | 支持长文本，可重用，符合数学建模场景 | ✓ |
| 命令行直接输入 | 快速但不适合长文本 | |
| 交互式多行输入 | 需要额外交互，复杂度高 | |

**User's choice:** 文件路径参数 (auto-selected - recommended)
**Notes:** Mathematical modeling problems are typically long, multi-paragraph texts. **User clarification:** 赛题、论文与参考资料多为 PDF 格式，需支持 PDF 解析

---

## Problem Parsing Output Structure

| Option | Description | Selected |
|--------|-------------|----------|
| 标准结构 | 标题、背景、问题、约束、目标、关键词 | ✓ |
| 最小结构 | 仅原始文本和摘要 | |
| 扩展结构 | 包含实体提取、关系图等 | |

**User's choice:** 标准结构 (auto-selected - recommended)
**Notes:** Covers common mathematical modeling problem elements, referenced from MM Agent paper

---

## Verification Gate Design

| Option | Description | Selected |
|--------|-------------|----------|
| 结构完整性 + 必填字段检查 | 轻量但有效，避免过度验证 | ✓ |
| 仅文件存在性检查 | 最简单，可能遗漏问题 | |
| LLM 语义验证 | 更智能但增加成本和延迟 | |

**User's choice:** 结构完整性 + 必填字段检查 (auto-selected - recommended)
**Notes:** Phase 1 does not need LLM-based verification, rule-based checks sufficient

---

## Context Passing Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| 文件传递 + 摘要字段 | GSD 模式，支持阶段隔离 | ✓ |
| 内存传递 | 更快但上下文易丢失 | |
| 数据库存储 | 持久化但增加依赖 | |

**User's choice:** 文件传递 + 摘要字段 (auto-selected - recommended)
**Notes:** Aligns with GSD framework patterns and PROJECT.md decision for file-based context passing

---

## Claude's Discretion

- Skill 文件的具体结构和组织方式
- 问题解析 LLM prompt 的具体设计
- 验证门控的错误消息措辞
- .planning/ 目录的子目录命名规范

## Deferred Ideas

- 交互式问题输入模式 — v2 功能
- 多语言问题支持 — 当前版本仅中文
- 问题模板库 — Phase 2 或以后