# Artifact 协议

`v1.0.0` 应该把论文工作流保存为本地 artifacts。

## Case 目录

```text
runs/<case-id>/
├── input/
├── artifacts/
│   ├── problem-understanding.md
│   ├── tasks.json
│   ├── task-graph.json
│   ├── memory.json
│   └── run-summary.md
├── tasks/
│   └── <task-id>/
│       ├── retrieved-methods.json
│       ├── modeling-scheme.md
│       ├── critic-feedback.md
│       ├── code/
│       └── execution-result.json
├── report/
│   ├── outline.md
│   ├── notation.md
│   ├── main.tex
│   ├── compile.log
│   └── report.pdf
└── feedback/
    └── feedback.md
```

## 阶段职责

| 阶段 | 必要 artifact |
|------|---------------|
| Problem Analysis | 问题理解、任务分解、依赖图 |
| Mathematical Modeling | 检索方法、建模方案、Critic 反馈 |
| Computational Solving | 代码、执行结果、结果解释 |
| Solution Reporting | 大纲、符号表、LaTeX、编译日志、PDF |

## 完成规则

只有当 `report/report.pdf` 存在，并且编译日志被保留下来时，一个 Case 才算完成。
