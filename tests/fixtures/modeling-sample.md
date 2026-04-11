---
task_id: sample
phase: mathematical-modeling
---

# Modeling Method

使用线性回归模型预测网球比赛动量。

## Formulas

$$ y = \beta_0 + \beta_1 x_1 + \beta_2 x_2 + \epsilon $$

其中：
- $y$ 为比赛结果（胜/负）
- $x_1$ 为历史动量指标
- $x_2$ 为球员状态指标
- $\epsilon$ 为误差项

## Variables

| Variable | Description | Type |
|----------|-------------|------|
| $y$ | 比赛结果 | Binary (0/1) |
| $x_1$ | 历史动量指标 | Continuous [0,1] |
| $x_2$ | 球员状态指标 | Continuous [0,1] |
| $\beta_0$ | 截距 | Real |
| $\beta_1, \beta_2$ | 回归系数 | Real |

## Assumptions

1. 动量效应对比赛结果有线性影响
2. 历史数据能够准确反映当前状态
3. 误差项服从正态分布 $\epsilon \sim N(0, \sigma^2)$