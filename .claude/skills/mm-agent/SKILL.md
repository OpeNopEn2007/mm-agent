---
name: mm-agent
description: Mathematical modeling multi-agent workflow for contest problems
---

<objective>
输入赛题 → 自动化数学建模全流程 → 输出符合要求的论文报告

基于 MM Agent (NeurIPS 2025) 的多智能体架构，在 Claude Code 中实现数学建模全流程自动化。
</objective>

<execution_context>
- .planning/PROJECT.md (项目愿景和约束)
- .planning/ROADMAP.md (阶段概览)
- .planning/STATE.md (当前状态)
</execution_context>

<flags>
- `--problem <path>` — 问题文件路径（支持 .md, .txt, .pdf）
- `--interactive` — 进入交互模式，逐步确认
- `--skip-verify` — YOLO 模式，跳过验证门控
- `--phase <N>` — 从指定阶段开始/继续
</flags>

<process>

## 1. 参数检查

检查是否提供了 `--problem` 参数。

**如果没有参数：**
显示使用帮助：
```
## MM-Agent: 数学建模多智能体工作流

用法:
  /mm-agent --problem <file>     启动完整工作流
  /mm-agent --problem <file> --interactive  交互模式
  /mm-agent --phase <N>          从指定阶段继续

支持格式: .md, .txt, .pdf

示例:
  /mm-agent --problem contest-2024.pdf
  /mm-agent --problem problem.md --interactive
```

退出。

## 2. 初始化阶段输出目录

创建阶段输出目录结构：
```
.planning/phases/01-foundation-problem-pipeline/outputs/
.planning/phases/02-modeling-agent-system/inputs/
.planning/phases/02-modeling-agent-system/outputs/
```

## 3. 问题输入处理

调用 `mm-agent-problem-input` skill：
1. 验证文件存在性
2. 检测文件类型（.md/.txt/.pdf）
3. 提取文本内容
4. 将文本传递给解析器

## 4. 问题解析

调用 `mm-agent-parse-problem` skill：
1. 使用 LLM 解析问题结构
2. 提取：标题、背景、问题、约束、目标、关键词
3. 生成摘要
4. 输出到 `outputs/problem.md`

## 5. 验证（可选）

如果没有 `--skip-verify`：
调用 `mm-agent-verify-phase` skill：
1. 检查输出文件存在性
2. 检查必填字段完整性
3. 报告验证结果

## 6. 显示结果

输出问题解析摘要：
```
## 问题解析完成

**标题:** {title}
**关键词:** {keywords}

**背景摘要:** {summary}

**子问题:** {N} 个
**约束条件:** {N} 个
**建模目标:** {N} 个

输出文件: .planning/phases/01-foundation-problem-pipeline/outputs/problem.md

下一步: /mm-agent --phase 2
```

## 7. 配置常量

```yaml
# Workflow Configuration
max_iterations_per_phase: 5
max_total_iterations: 20
iteration_timeout_seconds: 300
```

</process>

<success_criteria>
- [ ] 问题文件成功读取
- [ ] problem.md 包含所有必填字段
- [ ] 摘要准确反映问题核心
</success_criteria>