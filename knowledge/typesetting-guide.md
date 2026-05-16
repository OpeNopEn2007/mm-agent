# 数学建模论文 LaTeX 排版经验

> 记录 NKUMMT2026-A 论文排版过程中的实践经验

---

## 1. 页面布局

### 页边距设置
```latex
\usepackage{geometry}
\geometry{a4paper, margin=1.7cm}  % 平衡美观与内容量
```

**经验**：
- 默认 2.5cm 边距过于保守，数学建模论文内容密集
- 1.7-2.0cm 是较优范围，需确保最终页数符合要求（≤25页）

---

## 2. 表格排版

### 2.1 表格宽度与页芯对齐

**推荐方案**：使用 `tabularx` 宏包

```latex
\usepackage{tabularx}
\usepackage{array}

% 表格示例 - 宽度自动填充页芯
\begin{table}[htbp]
\centering
\caption{表格标题}
\small
\begin{tabularx}{\textwidth}{l>{\centering\arraybackslash}X>{\centering\arraybackslash}X}
\toprule
参数 & 数值 & 单位 \\
\midrule
速度 & 15 & m/s \\
时间 & 120 & s \\
\bottomrule
\end{tabularx}
\end{table}
```

**列格式规则**：
- 第一列（标签列）：`l` 左对齐
- 数据列：`>{\centering\arraybackslash}X` 居中 + 自动填充
- 所有列总和填满 `\textwidth`

### 2.2 续表（跨页表格）

**适用场景**：符号说明表、长数据表

**规范格式**（推荐）：
```latex
\usepackage{longtable}

\begin{longtable}{@{}p{0.15\textwidth}p{0.50\textwidth}>{\centering\arraybackslash}p{0.15\textwidth}@{\hspace{1em}}}
\caption{主要符号说明} \\  % 首页标题
\toprule
\hspace{2em}\textbf{符号} & \hspace{6em}\textbf{含义} & \textbf{单位} \\
\midrule
\endfirsthead

\multicolumn{3}{l}{\textbf{续表}} \\  % 续页左侧"续表"二字
\midrule
\hspace{2em}\textbf{符号} & \hspace{6em}\textbf{含义} & \textbf{单位} \\
\midrule
\endhead

\midrule
\multicolumn{3}{r}{\small 续下页}  % 每页底部
\endfoot

\bottomrule  % 最后一页底部
\endlastfoot

% 分组标题
\multicolumn{3}{@{}l}{\textit{控制分配模型}} \\
\midrule
% 表格内容 - 使用\hspace调整呼吸感
\hspace{2em}$c_T$ & \hspace{6em}拉力系数 & N/(rad/s)$^2$ \\
\hspace{2em}$c_M$ & \hspace{6em}反扭矩系数 & N$\cdot$m/(rad/s)$^2$ \\
\end{longtable}
```

**关键点**：
- `\endfirsthead`：仅第一页显示的表头（含完整caption）
- `\endhead`：后续每页显示的表头（**无caption**，左侧"续表"+列标题）
- `\endfoot`：每页底部（如"续下页"提示）
- `\endlastfoot`：最后一页底部

**呼吸感处理**（避免文字贴边）：

❌ **错误做法**（文字贴死边界）：
```latex
\begin{longtable}{@{}lll@{}}  % @{} 移除所有间距
```

✅ **正确做法**（保留默认间距）：
```latex
\begin{longtable}{lll}  % 保留默认列间距
% 或使用 p{width} 控制列宽同时保留间距
\begin{longtable}{p{0.11\textwidth}p{0.54\textwidth}>{\centering\arraybackslash}p{0.15\textwidth}}
```

**呼吸感原理**：
- 去掉 `@{}` 恢复 LaTeX 默认列间距（约 6pt）
- 单元格内文字与边框有自然留白
- 避免"轴线抖动"和"贴边"视觉效果
- 分组标题使用 `\multicolumn{3}{l}{}` 左对齐，与表格左边缘对齐

**列宽设计**（总宽80%页芯）：
| 列 | 宽度 | 对齐 | 说明 |
|----|------|------|------|
| 符号列 | 11% | 左对齐 | 固定宽度，自然留白 |
| 含义列 | 54% | 左对齐 | 较宽，容纳长描述 |
| 单位列 | 15% | 居中 | 内容较短，居中美观 |

**内容缩进技巧**（符号/含义不贴左边缘）：

❌ **错误做法**（列格式加hspace导致分组标题错位）：
```latex
\begin{longtable}{@{}>{\hspace{2em}}p{0.10\textwidth}...}  % 影响multicolumn
\multicolumn{3}{@{}l}{\textit{控制分配模型}}  % 错位！
```

✅ **正确做法**（单元格内容前加hspace，不影响分组）：
```latex
% 列格式保持简单
\begin{longtable}{@{}p{0.15\textwidth}p{0.50\textwidth}>{\centering\arraybackslash}p{0.15\textwidth}@{\hspace{1em}}}

% 表头缩进
\hspace{2em}\textbf{符号} & \hspace{6em}\textbf{含义} & \textbf{单位} \\

% 内容缩进（分组标题自然左对齐）
\multicolumn{3}{@{}l}{\textit{控制分配模型}} \\
\midrule
\hspace{2em}$c_T$ & \hspace{6em}拉力系数 & N/(rad/s)$^2$ \\
```

**缩进参数建议**：
| 位置 | 缩进量 | 说明 |
|------|--------|------|
| 符号列 | `\hspace{2em}` | 右移约2字符，不贴左边缘 |
| 含义列 | `\hspace{6em}` | 右移约6字符，视觉居中偏左 |
| 分组标题 | 无缩进 | 保持左对齐，与表格标题对齐 |
| 右边缘 | `@{\hspace{1em}}` | 留1em边距 |

**效果对比**：
- **之前**：内容贴左边缘，视觉拥挤，分组标题与内容混在一起
- **之后**：内容向内缩进，有呼吸感，分组标题突出，层次分明

**表头加粗规范**：

表头（列标题）应该加粗，与数据行区分：

```latex
\toprule
\textbf{控制通道} & \textbf{"+"型系数} & \textbf{"X"型系数} \\
\midrule
总拉力$f$ & $[c_T, c_T, c_T, c_T]$ & $[c_T, c_T, c_T, c_T]$ \\
```

**效果对比**：
| 样式 | 视觉效果 | 适用场景 |
|------|----------|----------|
| 不加粗 | 表头与数据同等粗细，层次不清 | ❌ 不推荐 |
| **加粗** | **表头突出，层次清晰** | **✅ 推荐** |

**注意**：续表的表头同样需要加粗保持一致。

---

## 3. 行间距控制

**避免全局压缩行间距**：
```latex
% 不推荐 - 影响阅读体验
\usepackage{setspace}
\setstretch{0.95}
```

**推荐做法**：
- 保持默认行间距（约1.2倍）
- 通过调整页边距控制页数
- 局部调整表格内间距使用 `\small` 或 `\footnotesize`

---

## 4. 符号表设计

### 分组组织
```latex
\multicolumn{3}{@{}l@{}}{\textit{控制分配模型}} \\
$c_T$ & 拉力系数 & N/(rad/s)$^2$ \\
\midrule
\multicolumn{3}{@{}l@{}}{\textit{路径规划模型}} \\
$v$ & 飞行速度 & m/s \\
```

**经验**：
- 使用 `\textit{}` 斜体分组标题
- 左对齐 `@{}l@{}` 移除多余间距
- 用 `\midrule` 分隔不同组

---

## 5. 页眉页脚

```latex
\usepackage{fancyhdr}
\pagestyle{fancy}
\fancyhf{}
\rhead{NKUMMT2026077}        % 控制号
\lhead{无人机森林救火路径规划}  % 论文标题
\cfoot{\thepage}              % 页码居中
\setlength{\headheight}{14.5pt}
```

**注意**：数学建模竞赛要求在页眉标注控制号

---

## 6. 公式与图表编号

**自动引用**：
```latex
\usepackage{hyperref}
\hypersetup{
    colorlinks=true,
    linkcolor=blue,
}

% 文中引用
如图~\ref{fig:path} 所示，公式~\eqref{eq:distance} 表明...
```

---

## 7. 常见问题解决

### 问题1：表格错位/溢出
**原因**：列宽计算错误
**解决**：使用 `tabularx` 替代 `tabular`

### 问题2：页数超标
**解决优先级**：
1. 减小页边距（1.7-2.0cm）
2. 精简冗余内容
3. 最后考虑压缩行间距（不推荐）

### 问题3：续表标题显示异常
**检查**：`longtable` 环境中 `\endfirsthead` 和 `\endhead` 的顺序

---

## 9. 图片渲染优化

### 9.1 问题背景

**现象**：PDF中包含大量散点图（如2500个数据点）时，缩放PDF出现"转圈圈加载"，渲染缓慢。

**原因**：
- 纯矢量PDF：每个散点独立存储坐标，缩放时需重新计算绘制
- 大量数据点 → PDF阅读器渲染负担重

### 9.2 解决方案：栅格化 + dpi控制

**核心技术**：matplotlib 的 `rasterized=True` 参数

```python
import matplotlib.pyplot as plt

# 配置字体
plt.rcParams['font.serif'] = ['SimSun', 'Songti SC', 'Times New Roman']
plt.rcParams['font.family'] = 'serif'
plt.rcParams['axes.unicode_minus'] = False

# 绘制散点图 - 栅格化加速
plt.scatter(x, y, s=10, alpha=0.5, rasterized=True)

# 保存为PDF，设置dpi
plt.savefig('figure.pdf', dpi=300, bbox_inches='tight')
```

### 9.3 技术原理

| 方案 | 渲染速度 | 放大清晰度 | 文件大小 |
|------|----------|------------|----------|
| 纯矢量（无rasterized） | 慢（转圈圈） | 完美清晰 | 小 |
| 栅格化 dpi=72 | 快 | 明显马赛克 | 小 |
| **栅格化 dpi=300** | **快** | **较清晰** | **中** |

**栅格化原理**：
- `rasterized=True`：将散点数据"拍照"为固定分辨率位图嵌入PDF
- 缩放时直接显示位图，无需重新计算
- dpi控制位图分辨率：越高越清晰，文件越大

### 9.4 混合策略（推荐）

**最佳实践**：
- ✅ 数据点（scatter/plot）→ `rasterized=True` 位图（快速渲染）
- ✅ 文字/坐标轴/图例 → 矢量格式（保持清晰）

```python
# 数据点栅格化
ax.scatter(x, y, c='red', s=15, alpha=0.6, rasterized=True)
ax.plot(x, y, 'b-', linewidth=1.5, rasterized=True)

# 文字保持矢量（不设置rasterized）
ax.set_xlabel('X坐标')  # 自动矢量
ax.legend()             # 自动矢量
```

### 9.5 dpi选择建议

| dpi | 适用场景 | 文件大小估算 |
|-----|----------|--------------|
| 150 | 快速预览、网页展示 | 较小 |
| **300** | **论文投稿、打印输出（推荐）** | **中等** |
| 600 | 高质量印刷、需要精细放大 | 较大 |

**经验**：
- 300dpi 在放大4-5倍内无明显马赛克
- 数学建模论文推荐使用300dpi平衡清晰度与文件体积

### 9.6 文件格式选择

**PDF vs PNG**：

| 格式 | 优势 | 劣势 |
|------|------|------|
| PDF（矢量+栅格混合） | 文字永远清晰、支持无损缩放 | 大数据点需栅格化优化 |
| PNG（纯位图） | 简单直接、无需优化 | 固定分辨率、放大必模糊 |

**推荐**：论文插图使用PDF格式，配合栅格化优化。

### 9.7 完整示例

```python
import matplotlib.pyplot as plt
import numpy as np

# 字体配置（宋体 + Times New Roman）
plt.rcParams['font.serif'] = ['SimSun', 'Songti SC', 'Times New Roman']
plt.rcParams['font.family'] = 'serif'
plt.rcParams['axes.unicode_minus'] = False

# 创建图表
fig, ax = plt.subplots(figsize=(12, 10))

# 绘制大量数据点 - 栅格化
ax.scatter(x_data, y_data, c='red', s=10, alpha=0.5, 
           label='数据点', rasterized=True)

# 绘制路径线条 - 栅格化
ax.plot(path_x, path_y, 'b-', linewidth=1.5, 
        label='路径', rasterized=True)

# 文字和图例保持矢量（默认）
ax.set_xlabel('X坐标', fontsize=12)
ax.set_ylabel('Y坐标', fontsize=12)
ax.set_title('图表标题', fontsize=14)
ax.legend(fontsize=10)

# 保存PDF，300dpi
plt.tight_layout()
plt.savefig('figures/figure.pdf', dpi=300, bbox_inches='tight')
plt.close()
```

---

## 8. 完整宏包依赖

```latex
\documentclass[12pt]{article}
\usepackage[UTF8]{ctex}
\usepackage{geometry}
\usepackage{graphicx}
\usepackage{amsmath, amssymb}
\usepackage{booktabs}       % 三线表
\usepackage{longtable}      % 跨页表格
\usepackage{tabularx}       % 自动宽度表格
\usepackage{array}          % 列格式扩展
\usepackage{hyperref}       % 超链接
\usepackage{fancyhdr}       % 页眉页脚
\usepackage{listings}       % 代码高亮
\usepackage{xcolor}
\usepackage{float}
\usepackage{placeins}
\usepackage{tikz}
```

---

## 参考案例

本次论文 `thesis.tex` 中的典型应用：
- **符号表**：`longtable` 实现续表跨页
- **参数表**：`tabularx` 实现宽度对齐
- **对比表**：分组标题 + 三线表风格
