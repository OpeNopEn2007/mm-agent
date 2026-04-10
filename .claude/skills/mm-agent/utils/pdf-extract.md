---
name: mm-agent-pdf-extract
description: Extract text content from PDF files
---

<objective>
从 PDF 文件提取文本内容，支持赛题、论文和参考资料的读取。
</objective>

<input>
- `pdf_file_path`: PDF 文件路径
</input>

<output>
- `text_content`: 提取的文本内容
</output>

<process>

## 1. 依赖检查

检查 PyMuPDF (fitz) 是否已安装。

```bash
python -c "import fitz; print('PyMuPDF available')" 2>&1
```

**如果未安装：**
```
⚠️ PyMuPDF 未安装

安装命令:
  pip install pymupdf

或使用备选方案:
  brew install poppler  # macOS
  pdftotext input.pdf output.txt
```

## 2. 文件验证

检查 PDF 文件是否存在且可读。

**如果文件损坏或无法读取：**
```
❌ PDF 文件无法读取

可能原因:
1. 文件损坏
2. 文件被加密
3. 文件权限问题
```

## 3. 文本提取

### 方法 1: PyMuPDF (推荐)

```python
import fitz  # PyMuPDF

def extract_pdf_text(pdf_path):
    """Extract text from PDF using PyMuPDF"""
    doc = fitz.open(pdf_path)
    text = ""
    
    for page_num, page in enumerate(doc):
        # Extract text from each page
        page_text = page.get_text()
        text += f"\n--- Page {page_num + 1} ---\n"
        text += page_text
    
    doc.close()
    return text
```

### 方法 2: pdftotext (备选)

```bash
pdftotext -layout input.pdf output.txt
cat output.txt
```

## 4. 内容处理

- 移除过多的空白行
- 保留段落结构
- 处理特殊字符

## 5. 质量检查

检查提取的文本质量：
- 非空检查
- 有效字符比例
- 是否包含乱码

**如果质量较差：**
```
⚠️ PDF 文本提取质量可能不佳

检测到:
- {问题描述}

建议:
1. 检查 PDF 是否为扫描件
2. 尝试使用 OCR 工具
3. 手动核对关键信息
```

## 6. 返回结果

返回提取的文本内容，供问题解析使用。

</process>

<error_handling>

| 错误类型 | 原因 | 解决方案 |
|---------|------|---------|
| PyMuPDF 未安装 | 依赖缺失 | pip install pymupdf |
| 文件加密 | PDF 有密码保护 | 提供密码或移除保护 |
| 扫描件 PDF | 无文本层 | 使用 OCR 工具 |
| 提取乱码 | 编码问题 | 尝试其他提取方法 |

</error_handling>

<notes>

## PDF 类型判断

1. **文本 PDF**: 直接提取即可
2. **扫描件 PDF**: 需要 OCR 处理
3. **混合 PDF**: 部分页面可能需要 OCR

## 特殊处理

- **表格**: 可能需要专门处理
- **公式**: 可能无法准确提取
- **图片**: 提取 alt 文本或使用图像识别

</notes>