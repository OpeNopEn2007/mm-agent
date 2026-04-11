---
task_id: "1"
phase: mathematical-modeling
---

# Modeling Method

使用线性回归模型预测网球比赛动量。该模型基于历史动量指标和球员状态指标来预测比赛结果。

## Formulas

线性回归模型的基本公式为：

$$ y = \beta_0 + \beta_1 x_1 + \beta_2 x_2 + \epsilon $$

其中：
- $y$ 为比赛结果（胜/负，二值变量）
- $x_1$ 为历史动量指标（0-1 之间的连续值）
- $x_2$ 为球员状态指标（0-1 之间的连续值）
- $\beta_0$ 为截距项
- $\beta_1, \beta_2$ 为回归系数
- $\epsilon$ 为误差项，假设服从正态分布 $\epsilon \sim N(0, \sigma^2)$

## Variables

| Variable | Description | Type | Range |
|----------|-------------|------|-------|
| $y$ | 比赛结果 | Binary | {0, 1} |
| $x_1$ | 历史动量指标 | Continuous | [0, 1] |
| $x_2$ | 球员状态指标 | Continuous | [0, 1] |
| $\beta_0$ | 截距 | Real | $(-\infty, \infty)$ |
| $\beta_1$ | 动量系数 | Real | $(-\infty, \infty)$ |
| $\beta_2$ | 状态系数 | Real | $(-\infty, \infty)$ |
| $\epsilon$ | 误差项 | Random | $N(0, \sigma^2)$ |

## Assumptions

1. 动量效应对比赛结果有线性影响
2. 历史数据能够准确反映当前状态
3. 误差项服从正态分布，且相互独立
4. 解释变量之间不存在严重的多重共线性
5. 样本量足够大以满足大样本性质