---
name: mm-agent-verify-phase
description: Verify phase outputs meet quality standards
---

<objective>
验证阶段输出文件存在且格式正确，确保质量门控。
</objective>

<flags>
- `--skip-verify` — YOLO 模式，跳过验证
- `--phase <N>` — 指定要验证的阶段
</flags>

<process>

## 1. 检查 YOLO 模式

如果传入 `--skip-verify` 标志：
```
⚡ YOLO MODE: Skipping verification

警告: 跳过验证可能导致后续阶段失败。
建议在关键阶段启用验证。
```
退出并返回成功。

## 2. 确定验证目标

从参数或 STATE.md 获取当前阶段号。

## 3. 验证规则

### Phase 1 验证规则

```yaml
phase: 01
output_file: outputs/problem.md
required_fields:
  - title
  - background
  - questions
  - constraints
  - objectives
  - keywords
  - raw_text
  - summary
format_check: markdown_syntax
```

### Phase 2 验证规则

```yaml
phase: 02
output_file: outputs/plan.md
required_fields:
  - modeling_strategy
  - variables
  - assumptions
  - equations
  - approach
format_check: markdown_syntax
```

### Phase 3 验证规则

```yaml
phase: 03
output_files:
  - outputs/code.py
  - outputs/results.json
required_in_results:
  - status
  - data
  - metrics
format_check: json_syntax
```

### Phase 4 验证规则

```yaml
phase: 04
output_file: outputs/report.pdf
required_sections:
  - abstract
  - introduction
  - methodology
  - results
  - conclusion
  - references
format_check: pdf_exists
```

## 4. 执行验证

### 4.1 文件存在性检查

```bash
test -f "{output_file}" && echo "EXISTS" || echo "NOT_FOUND"
```

**如果文件不存在：**
```
❌ 验证失败: 输出文件不存在

期望文件: {output_file}
阶段: Phase {N}

修复建议:
1. 检查上一阶段是否成功完成
2. 确认输出目录权限正确
3. 重新运行上一阶段

命令: /mm-agent --phase {prev_phase}
```
返回失败。

### 4.2 必填字段检查

使用 Grep 检查每个必填字段：

```bash
grep -q "## {field}" "{output_file}" && echo "FOUND" || echo "MISSING"
```

**如果字段缺失：**
```
❌ 验证失败: 必填字段缺失

文件: {output_file}
缺失字段: {field_name}

修复建议:
1. 检查问题解析输出
2. 确认输入文件包含必要信息
3. 手动添加缺失字段

跳过验证: /mm-agent --phase {phase} --skip-verify
```
返回失败。

### 4.3 格式检查

检查 Markdown 语法：
- 标题层级正确
- 列表格式正确
- 无明显语法错误

**如果格式问题：**
```
⚠️ 格式警告: Markdown 语法问题

文件: {output_file}
问题: {description}

建议: 使用 Markdown linter 检查
```

## 5. 验证结果

**如果所有检查通过：**
```
✓ Phase {N} Verification Passed

检查项:
- 文件存在性: ✓
- 必填字段: {M}/{M} ✓
- 格式检查: ✓

可以继续下一阶段。
```

## 6. 错误消息模板

### 文件不存在

```
❌ 验证失败: 输出文件不存在

期望文件: {file_path}
阶段: Phase {N}

修复建议:
1. 检查上一阶段是否成功完成
2. 确认输出目录权限正确
3. 重新运行上一阶段

命令: /mm-agent --phase {prev_phase}
```

### 字段缺失

```
❌ 验证失败: 必填字段缺失

文件: {file_path}
缺失字段: {field_name}

修复建议:
1. 检查问题解析输出
2. 确认输入文件包含必要信息
3. 手动添加缺失字段

跳过验证: /mm-agent --phase {phase} --skip-verify
```

### 格式问题

```
⚠️ 格式警告: Markdown 语法问题

文件: {file_path}
问题: {description}

建议: 使用 Markdown linter 检查
```

</process>

<exit_codes>
- 0: 验证通过
- 1: 验证失败（文件不存在或字段缺失）
- 2: 格式警告（可继续）
</exit_codes>