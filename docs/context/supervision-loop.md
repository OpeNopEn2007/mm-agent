# 监督反馈回路

人类反馈是 Harness 的训练信号。

在 `1.x` 中，系统不训练模型权重，而是调整 Harness 层面的可控项：

- prompts
- rubrics
- retrieval parameters
- critic thresholds
- retry budgets
- artifact schemas
- report templates
- compile-repair behavior

## 反馈形态

反馈应按 Case 记录，并可选择性关联到阶段 artifacts：

```text
case:
final_report_feedback:
suspected_failures:
stage_notes:
next_adjustments:
```

人类可以用自然语言描述问题。后续 Harness 应该根据这些反馈推断哪些阶段需要调整。

## v1.0.0 边界

`v1.0.0` 只需要记录反馈。自动自诊断和参数调整，应在第一个闭环 Harness 存在之后再开始。
