# 数学建模论文图表配色方案指南

> 基于 ColorBrewer、SciencePlots 及获奖论文实践的 8 套经典配色方案

---

## 一、配色原则（官方指南）

### 1.1 学术图表配色三原则

根据《Best Practices for Data Visualisation》(RSS指南)：

| 原则 | 说明 | 具体要求 |
|------|------|----------|
| **色盲友好** | 约8%男性有色觉缺陷 | 使用红绿盲友好配色 |
| **黑白打印友好** | 期刊可能黑白印刷 | 颜色需有足够明度对比 |
| **数据类型匹配** | 配色反映数据性质 | 序列/发散/定性三类 |

### 1.2 三类数据配色选择（ColorBrewer体系）

**序列型（Sequential）**：
- 用途：表示从低到高的连续数据
- 特点：单一颜色渐变，从浅到深
- 示例：温度分布、密度热力图

**发散型（Diverging）**：
- 用途：表示偏离中心的正负变化
- 特点：两端深色，中间浅色
- 示例：相关性系数、增长率

**定性型（Qualitative）**：
- 用途：区分不同类别
- 特点：颜色相互独立，无渐变
- 示例：不同区域、不同算法对比

---

## 二、8套经典配色方案

### 方案1：SciencePlots 默认配色（学术标准）

```python
import matplotlib.pyplot as plt
plt.style.use(['science'])

# 颜色循环（默认）
colors = ['#0C5DA5', '#00B945', '#FF9500', '#FF2C00', '#845B97', '#474747']
```

| 颜色 | 色值 | 适用场景 |
|------|------|----------|
| 深蓝 | #0C5DA5 | 主数据系列、对照组 |
| 绿色 | #00B945 | 正向增长、优化结果 |
| 橙色 | #FF9500 | 对比数据、次要系列 |
| 红色 | #FF2C00 | 错误率、负向指标 |
| 紫色 | #845B97 | 特殊类别、预测值 |
| 灰色 | #474747 | 背景、基准线 |

**特点**：
- ✅ 色盲友好
- ✅ 黑白打印友好
- ✅ 适合柱状图、折线图、散点图

---

### 方案2：IEEE 论文配色（工程期刊标准）

```python
plt.style.use(['science', 'ieee'])

# IEEE 颜色循环
colors_ieee = ['#0C5DA5', '#00B945', '#FF9500', '#FF2C00', '#845B97', '#474747']
```

**与 Science 的区别**：
- 字体：Times New Roman（符合 IEEE 规范）
- 宽度：适配 IEEE 单栏（约 3.5 英寸）
- 字号：更小（8pt 标签）

**适用期刊**：IEEE Transactions、工程类期刊

---

### 方案3：Nature 论文配色（顶级期刊）

```python
plt.style.use(['science', 'nature'])

# Nature 风格使用 sans-serif 字体
# 颜色同 SciencePlots 默认
colors_nature = ['#0C5DA5', '#00B945', '#FF9500', '#FF2C00', '#845B97', '#474747']
```

**特点**：
- 字体：Helvetica/Arial（sans-serif）
- 宽度：适配 Nature 单栏（约 89mm）
- 风格：简洁、现代

---

### 方案4：高对比度配色（会议演示）

```python
plt.style.use(['science', 'high-vis'])

# 高对比度颜色循环
colors_highvis = ['#0C5DA5', '#FF9500', '#00B945', '#FF2C00', '#FF5C00', '#00B945']
```

**特点**：
- 颜色对比强烈
- 适合投影演示
- 不适合黑白打印

---

### 方案5：Set1 定性配色（类别区分）

```python
from matplotlib.colors import ListedColormap
import matplotlib.cm as cm

# ColorBrewer Set1（定性型，色盲友好）
colors_set1 = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33']
cmap_set1 = ListedColormap(colors_set1)
```

| 颜色 | 色值 | 典型用途 |
|------|------|----------|
| 红 | #e41a1c | 类别1、实验组 |
| 蓝 | #377eb8 | 类别2、对照组 |
| 绿 | #4daf4a | 类别3、最优解 |
| 紫 | #984ea3 | 类别4、预测值 |
| 橙 | #ff7f00 | 类别5、异常值 |
| 黄 | #ffff33 | 类别6、特殊标记 |

**特点**：
- ✅ 色盲友好（经过验证）
- ❌ 黑白打印不友好
- 适合：区域划分、多类别对比

---

### 方案6：Blues 序列配色（连续数据）

```python
# ColorBrewer Blues（序列型，色盲友好）
colors_blues = ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b']
cmap_blues = plt.cm.Blues
```

**用途**：
- 火点密度热力图
- 概率分布图
- 高程渲染图

---

### 方案7：Paired 对比配色（成对比较）

```python
# ColorBrewer Paired（定性型，色盲友好）
colors_paired = ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', '#fdbf6f', '#ff7f00', '#cab2d6', '#6a3d9a', '#ffff99', '#b15928']
```

**特点**：
- 12 种颜色，适合多类别
- 部分色盲友好
- 适合：多算法对比、区域分区

---

### 方案8：经典论文配色（获奖论文常用）

```python
# 经典获奖论文配色（自定义）
colors_classic = [
    '#1f77b4',  # 蓝 - 主系列
    '#ff7f0e',  # 橙 - 对比
    '#2ca02c',  # 绿 - 正向
    '#d62728',  # 红 - 负向
    '#9467bd',  # 紫 - 特殊
    '#8c564b',  # 棕 - 辅助
]
```

| 颜色 | 色值 | 含义 |
|------|------|------|
| 蓝 | #1f77b4 | 基准、原始数据 |
| 橙 | #ff7f0e | 优化后数据 |
| 绿 | #2ca02c | 提升、改善 |
| 红 | #d62728 | 衰退、错误 |
| 紫 | #9467bd | 预测、估计 |
| 棕 | #8c564b | 辅助说明 |

---

## 三、配色选择决策树

```
数据类型判断：
├─ 连续数值（温度、密度）→ 序列型配色
│   └─ 蓝色系（Blues）、绿色系（Greens）
├─ 正负偏离（相关性、误差）→ 发散型配色
│   └─ RdBu（红蓝）、RdYlGn（红黄绿）
└─ 类别区分（区域、方法）→ 定性型配色
    ├─ ≤6类 → Set1、SciencePlots 默认
    ├─ ≤12类 → Paired、Set3
    └─ 需色盲友好 → Set2、SciencePlots

场景判断：
├─ 正式期刊 → SciencePlots（science + ieee/nature）
├─ 会议演示 → high-vis、bright
├─ 可能黑白打印 → 选择明度对比强的配色
```

---

## 四、Python 实现模板

### 4.1 基础配置

```python
import matplotlib.pyplot as plt
import numpy as np

# 字体配置（中文 + Times New Roman）
plt.rcParams['font.serif'] = ['SimSun', 'Times New Roman']
plt.rcParams['font.family'] = 'serif'
plt.rcParams['axes.unicode_minus'] = False

# 图片输出配置
plt.rcParams['figure.dpi'] = 300  # 出版质量
plt.rcParams['savefig.dpi'] = 300
plt.rcParams['savefig.bbox'] = 'tight'
```

### 4.2 使用 SciencePlots

```python
# 安装：pip install SciencePlots

import matplotlib.pyplot as plt
plt.style.use(['science', 'ieee'])  # IEEE 论文风格

fig, ax = plt.subplots(figsize=(3.5, 2.5))  # IEEE 单栏宽度

x = np.linspace(0, 10, 100)
ax.plot(x, np.sin(x), label='方法一')
ax.plot(x, np.cos(x), label='方法二')
ax.legend()
ax.set_xlabel('参数 $\\alpha$')
ax.set_ylabel('结果值')

plt.savefig('figure.pdf', format='pdf')  # 矢量图
```

### 4.3 自定义配色应用

```python
# 方案：类别对比（如区域划分）
colors = ['#0C5DA5', '#00B945', '#FF9500', '#FF2C00', '#845B97', '#474747']

fig, ax = plt.subplots(figsize=(8, 6))
for i, (data, label) in enumerate(zip(datasets, labels)):
    ax.plot(data, color=colors[i], label=label, linewidth=1.5)

ax.legend(loc='upper right')
ax.grid(True, alpha=0.3)
```

### 4.4 热力图配色

```python
# 序列型配色（火点密度）
plt.rcParams['image.cmap'] = 'Blues'  # 或 'YlOrRd'（黄橙红）

# 或发散型（相关性矩阵）
plt.rcParams['image.cmap'] = 'RdBu_r'  # 红蓝反向
```

---

## 五、黑白打印验证

### 5.1 明度对比检查

```python
# 检查配色黑白打印效果
import matplotlib.pyplot as plt

def check_bw_friendly(colors):
    """检查配色黑白打印友好性"""
    rgb_colors = [plt.cm.colors.to_rgb(c) for c in colors]
    luminance = [0.299*r + 0.587*g + 0.114*b for r, g, b in rgb_colors]
    return luminance

# 示例：SciencePlots 默认配色
colors = ['#0C5DA5', '#00B945', '#FF9500', '#FF2C00', '#845B97', '#474747']
luminance = check_bw_friendly(colors)
print(f"明度值: {luminance}")
# 要求：相邻颜色明度差 > 0.3
```

### 5.2 推荐的黑白友好配色

| 配色方案 | 明度对比 | 黑白打印质量 |
|----------|----------|--------------|
| SciencePlots 默认 | 高 | ✅ 推荐 |
| Set2 | 高 | ✅ 推荐 |
| Blues 序列 | 极高 | ✅ 推荐 |
| Set1 | 中等 | ⚠️ 需检查 |
| Paired | 低 | ❌ 不推荐 |

---

## 六、色盲友好验证

### 6.1 色盲模拟测试

```python
# 使用 colorblindness 库模拟色盲效果
# pip install colorblindness

from colorblindness import colorblind_transform

# 模拟红绿色盲
original_color = '#FF2C00'  # 纅红
simulated_color = colorblind_transform(original_color, 'deuteranopia')
print(f"色盲模拟: {simulated_color}")
```

### 6.2 色盲友好配色清单

**经过验证的色盲友好方案**：

| 方案 | 来源 | 状态 |
|------|------|------|
| Set2 (8色) | ColorBrewer | ✅ 色盲友好 |
| Set1 (9色) | ColorBrewer | ⚠️ 部分友好 |
| SciencePlots 默认 | SciencePlots | ✅ 色盲友好 |
| Blues 序列 | ColorBrewer | ✅ 色盲友好 |
| Paired (12色) | ColorBrewer | ⚠️ 部分友好 |

---

## 七、实际应用案例

### 7.1 火点分布图（序列型）

```python
# 火点密度热力图
plt.style.use(['science'])
plt.rcParams['image.cmap'] = 'YlOrRd'  # 黄橙红

# 或使用 Blues（冷色调）
plt.rcParams['image.cmap'] = 'Blues'
```

### 7.2 区域划分图（定性型）

```python
# K-means 6区域划分
colors = ['#0C5DA5', '#00B945', '#FF9500', '#FF2C00', '#845B97', '#474747']

for k in range(6):
    ax.scatter(points[:, 0], points[:, 1], 
               c=colors[k], label=f'区域{k+1}')
```

### 7.3 算法对比图（定性型）

```python
# 多算法性能对比
plt.style.use(['science', 'ieee'])

colors = ['#0C5DA5', '#FF9500', '#00B945', '#FF2C00']
labels = ['贪心', '遗传', '蚁群', '粒子群']

for i, (result, label) in enumerate(zip(results, labels)):
    ax.plot(result, color=colors[i], label=label)
```

### 7.4 误差分布图（发散型）

```python
# 误差热力图（正相关蓝，负相关红）
plt.rcParams['image.cmap'] = 'RdBu_r'  # 红蓝反向
plt.rcParams['image.cmap'] = 'coolwarm'
```

---

## 八、配色方案速查表

| 序号 | 方案名称 | 类型 | 颜色数 | 色盲友好 | 黑白友好 | 适用场景 |
|------|----------|------|--------|----------|----------|----------|
| 1 | SciencePlots 默认 | 定性 | 6 | ✅ | ✅ | 论文图表 |
| 2 | IEEE 论文 | 定性 | 6 | ✅ | ✅ | 工程期刊 |
| 3 | Nature 论文 | 定性 | 6 | ✅ | ✅ | 顶级期刊 |
| 4 | high-vis | 定性 | 6 | ❌ | ❌ | 会议演示 |
| 5 | Set1 | 定性 | 9 | ⚠️ | ❌ | 多类别 |
| 6 | Blues | 序列 | 9 | ✅ | ✅ | 密度图 |
| 7 | Paired | 定性 | 12 | ⚠️ | ❌ | 多算法 |
| 8 | 经典论文 | 定性 | 6 | ⚠️ | ⚠️ | 通用 |

---

## 参考文献

[1] ColorBrewer 2.0. https://colorbrewer2.org/

[2] SciencePlots. https://github.com/garrettj403/SciencePlots

[3] Best Practices for Data Visualisation. Royal Statistical Society. https://www.statsref.com/RSS-data-vis-guide.pdf

[4] Ten guidelines for effective data visualization. Kelleher & Wagener. Eos, 2011.

---

*指南生成日期：2026-04-11*
*适用范围：数学建模竞赛、学术论文图表*