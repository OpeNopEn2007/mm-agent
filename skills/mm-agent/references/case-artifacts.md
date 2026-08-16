# Case 文件与产物

仅在创建、恢复、整理建模任务，或需要确定文件应存放在哪里时读取本文。

## 1. 三层信息

始终区分 Knowledge、Case Library 和 Working Memory。

### Knowledge

系统长期资产，可跨建模任务复用。

例如：

- HMML；
- 竞赛知识；
- 模板；
- 代码配方；
- 经验；
- 研究指南。

Knowledge 不属于某一个建模任务。

### Case Library

当前建模任务的外部事实。

典型结构：

```text
library/
  problem/
  attachments/
  papers/
  datasets/
  references.bib
```

可包含原始赛题、用户材料、数据集、论文、已核验外部资料和引用记录。

### Working Memory

当前建模任务中子智能体形成的认知产物。

典型结构：

```text
STATE.md
task-graph.md

research/
  memo-*.md

tasks/
  <task-id>/
    memory.md
    work/

retrospective.md

report/
  main.tex
  figures/
  compile.log
  report.pdf
```

目录用于持久化工作。不要从文件布局推导固定语义状态机。

## 2. Case 根目录与 Skill 根目录

建模任务通常位于：

```text
runs/<case-id>/
```

`runs/<case-id>/...` 属于项目 / 建模任务路径空间。

Skill 内的：

```text
references/...
```

相对于当前 Skill 根目录解析。

这两个路径命名空间需要分开理解。

## 3. STATE.md

`STATE.md` 位于 Case 根目录，属于 Working Memory，用于持久化主会话的当前全局理解。

## 4. task-graph.md

`task-graph.md` 位于 Case 根目录，属于 Working Memory，用于保存当前 Living Task Graph。

## 5. Research Memo

Research Memo 通常位于：

```text
research/
  memo-*.md
```

属于 Working Memory。

## 6. Task Work 与 Task Memory

一个 Task 可以拥有：

```text
tasks/<task-id>/
  memory.md
  work/
```

`memory.md` 属于 Working Memory。

`work/` 可自由保存该 Task 的代码、数据、图表、中间结果、notebooks、logs 和其他工作产物。

不为 `work/` 设计统一业务 schema。

## 7. 恢复建模任务

恢复已有建模任务时通常按以下优先级读取：

```text
STATE.md
   ↓
task-graph.md
   ↓
当前决策真正依赖的 Research Memo / Task Memory
   ↓
必要时回到 Case Library / 原题
```

读取足够恢复全局认知即可。不要无条件重新加载全部历史文件和认知产物。

## 8. 写入边界

当前建模任务的运行产物应限制在本次求解的范围内。

不要因为处理一个建模任务而覆盖其他建模任务、系统 Knowledge、Skill 或项目核心源码。

跨建模任务 Knowledge 更新属于独立的 review、curation 和 promotion 行为。
