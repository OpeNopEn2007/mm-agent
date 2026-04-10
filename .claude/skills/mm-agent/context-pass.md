---
name: mm-agent-context-pass
description: Manage context passing between phases
---

<objective>
实现阶段间上下文传递，支持阶段隔离和信息流转。
</objective>

<mechanism>

## 上下文传递模式

采用 GSD 框架的文件传递模式：

1. **输入阶段**: 从 `.planning/phases/XX-name/outputs/` 读取前一阶段输出
2. **输出阶段**: 写入 `.planning/phases/XX-name/outputs/` 当前阶段输出
3. **摘要字段**: 每个输出包含 `summary` 字段供快速理解

</mechanism>

<directory_structure>

## 阶段目录结构

```
.planning/phases/
├── 01-foundation-problem-pipeline/
│   ├── 01-CONTEXT.md
│   ├── 01-RESEARCH.md
│   ├── 01-PLAN-01.md
│   ├── 01-PLAN-02.md
│   ├── 01-SUMMARY.md
│   └── outputs/
│       └── problem.md        # Phase 1 output
│
├── 02-modeling-agent-system/
│   ├── inputs/
│   │   └── problem.md        # Read from Phase 1
│   └── outputs/
│       └── plan.md           # Phase 2 output
│
├── 03-simulation-execution/
│   ├── inputs/
│   │   ├── problem.md
│   │   └── plan.md           # Read from Phase 2
│   └── outputs/
│       ├── code.py
│       └── results.json
│
└── 04-review-report-generation/
    ├── inputs/
    │   ├── problem.md
    │   ├── plan.md
    │   └── results.json
    └── outputs/
        └── report.pdf
```

</directory_structure>

<process>

## 传递上下文函数

```
pass_context(from_phase, to_phase, output_file):
  1. 验证源文件存在
  2. 创建目标阶段输入目录
  3. 复制文件到目标目录
  4. 更新 STATE.md 记录传递
```

## 1. 验证源文件

检查前一阶段的输出文件是否存在：

```bash
SOURCE_FILE=".planning/phases/${from_phase}-${from_slug}/outputs/${output_file}"
test -f "$SOURCE_FILE" && echo "VALID" || echo "MISSING"
```

**如果源文件不存在：**
```
❌ 上下文传递失败: 源文件不存在

源阶段: Phase {from_phase}
期望文件: {source_file}

请先完成前一阶段。
```

## 2. 创建目标目录

```bash
TARGET_DIR=".planning/phases/${to_phase}-${to_slug}/inputs"
mkdir -p "$TARGET_DIR"
```

## 3. 复制文件

```bash
cp "$SOURCE_FILE" "$TARGET_DIR/"
```

## 4. 更新 STATE.md

记录上下文传递：

```
## Context Passing Log

- {timestamp}: Phase {from} → Phase {to}: {output_file}
```

</process>

<summary_rules>

## 上下文摘要生成规则

每个阶段输出应包含摘要字段：

### Phase 1 (problem.md)

```
## Context Summary

**For downstream phases:**
- Problem type: {优化/预测/评价/等}
- Key variables: {关键变量列表}
- Data available: {是否有提供数据}
- Expected output: {期望输出：模型/方案/报告}
```

### Phase 2 (plan.md)

```
## Context Summary

**For downstream phases:**
- Modeling approach: {建模方法}
- Key equations: {关键方程数量}
- Computational needs: {计算需求}
- Expected results: {预期结果类型}
```

### Phase 3 (results.json)

```
{
  "context_summary": {
    "simulation_status": "success/partial/failed",
    "key_metrics": [...],
    "visualization_files": [...],
    "confidence_level": "high/medium/low"
  }
}
```

### Phase 4 (report)

报告中应包含摘要部分。

</summary_rules>

<notes>

## 设计原则

1. **阶段隔离**: 每个阶段只依赖输入目录，不直接访问其他阶段内部
2. **完整性**: 输入目录包含所有必要的前置信息
3. **可追溯**: STATE.md 记录所有传递操作
4. **摘要优先**: 提供快速理解的摘要字段

## 注意事项

- 避免循环依赖
- 保持文件命名一致性
- 定期清理过期的中间文件

</notes>