# Reporting

仅在当前建模问题接近全局收束，需要形成最终报告、整理引用、编译论文或完成 Retrospective 时读取本文。

## 1. 进入报告阶段

进入报告阶段前，主会话应判断当前方案已经足够成熟。

如果继续增加局部工作仍可能显著改变核心答案，应先继续求解。

报告阶段不由固定阶段自动触发。

## 2. 全局一致性检查

### 问题覆盖

确认：

- 原题的重要要求都得到回应；
- 各子问题形成完整逻辑；
- 没有遗漏必要输出。

### 建模一致性

确认：

- 重要假设明确；
- 不同 Task 的假设兼容；
- 变量、符号、定义和单位一致；
- 下游正确使用上游结果。

### 证据

确认：

- 关键计算能够追溯；
- 关键图表对应实际结果；
- 重要结论有足够证据；
- 验证足以支撑结论；
- 不确定性和局限得到真实表达。

### 研究与引用

确认：

- 外部事实有可靠来源；
- 引用能追溯到 Case Library；
- `references.bib` 包含实际使用的参考资料；
- 没有凭空生成文献。

### 叙事

最终论文应忠实反映真正完成的建模工作。

不要为了叙事完整性隐藏关键失败、限制或方法变化。

## 3. 报告产物

通常使用：

```text
report/
  main.tex
  figures/
  compile.log
  report.pdf
```

主会话负责最终综合和内容判断。

Runtime 负责 LaTeX compile、process execution、stdout / stderr、exit status 和文件存在检查。

## 4. 完成判断

以下事实：

```text
compile exit code = 0
report.pdf exists
```

只证明机械过程成功。

它们不能单独证明本次求解已经充分解决。

主会话根据问题覆盖、数学合理性、证据质量、一致性、可解释性、可复现性和报告质量判断本次求解是否完成。

## 5. Retrospective

本次求解完成后写或更新：

```text
retrospective.md
```

可以记录：

- 有效的方法；
- 失败的方法；
- 建模中的关键经验；
- 研究经验；
- 工具与 Harness 的问题；
- 以后值得复用的知识；
- 可以改进的行为。

Retrospective 是 Candidate Knowledge 的来源之一。

不要自动把单次求解的经验写入正式 Knowledge。

跨建模任务学习遵循：

```text
建模任务
   ↓
Retrospective
   ↓
Candidate Knowledge
   ↓
review / curate
   ↓
Knowledge
```

Knowledge promotion 应独立于正常求解。
