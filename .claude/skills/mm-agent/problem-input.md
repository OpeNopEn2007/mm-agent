---
name: mm-agent-problem-input
description: Handle problem file input and format detection
---

<objective>
接收问题文件，检测格式，提取文本内容，传递给解析器。
</objective>

<input>
- `file_path`: 问题文件路径（支持 .md, .txt, .pdf）
</input>

<output>
- `problem_text`: 原始问题文本内容
</output>

<process>

## 1. 文件存在性验证

使用 Read 工具检查文件是否存在。

**如果文件不存在：**
```
❌ 文件不存在: {file_path}

请检查:
1. 文件路径是否正确
2. 文件是否在当前目录或指定路径

提示: 使用绝对路径或相对于当前工作目录的路径
```
退出。

## 2. 文件类型检测

从文件扩展名判断类型：
- `.md` → Markdown 文件
- `.txt` → 纯文本文件
- `.pdf` → PDF 文档

**如果不支持的格式：**
```
❌ 不支持的文件格式: {extension}

支持的格式:
- .md  — Markdown 文件
- .txt — 纯文本文件
- .pdf — PDF 文档

提示: 请将文件转换为支持的格式
```
退出。

## 3. 文本提取

### Markdown / Text 文件

直接使用 Read 工具读取文件内容。

### PDF 文件

调用 `mm-agent-pdf-extract` skill：
1. 检查 PyMuPDF 是否安装
2. 使用 Python 提取文本
3. 返回提取的文本内容

**如果 PDF 提取失败：**
```
⚠️ PDF 文本提取失败

可能原因:
1. PDF 是扫描件（需要 OCR）
2. PDF 有加密保护
3. PDF 格式特殊

建议:
1. 将 PDF 转换为文本文件
2. 手动复制文本内容
3. 使用 OCR 工具处理扫描件
```

## 4. 内容验证

检查提取的文本是否有效：
- 非空
- 包含有意义的内容（不只是空白字符）

**如果内容为空：**
```
⚠️ 文件内容为空

请确认文件包含问题文本。
```

## 5. 传递给解析器

将 `problem_text` 传递给 `mm-agent-parse-problem` skill。

</process>

<error_handling>

| 错误类型 | 处理方式 |
|---------|---------|
| 文件不存在 | 提示用户检查路径 |
| 格式不支持 | 列出支持的格式 |
| PDF 提取失败 | 提供备选方案 |
| 内容为空 | 提示用户确认文件内容 |

</error_handling>