# MM-Agent v1.0.0 顶层架构设计

> 面向数学建模问题求解的 Host-Agnostic Agent Harness 设计  
> 本文只描述顶层架构、认知分工与持久化约定，不绑定 OpenCode、Claude Code、Codex 或其他具体宿主实现。

---

## 0. 一句话定义

MM-Agent 是一个以 **Main Session 作为最强主导者**、以 **Subagent 作为局部认知工作单元**、以 **Markdown 与文件系统作为外部认知载体**、以 **Knowledge / Library / Working Memory** 构成长短期知识层的**数学建模 Harness**。

它的目标不是把数学建模固化为一个有限状态机，而是给 LLM 一个足够清晰、可靠、可持续的工作环境，让它可以像一个真实的数学建模团队一样：

- 理解问题；
- 动态拆解任务；
- 查找论文、数据和方法；
- 分派局部求解任务；
- 根据新结果持续修正计划；
- 形成可复用的研究记忆；
- 最终产出一套可信、可解释、可写成论文的解决方案。

---

# 1. 设计出发点

数学建模本身具有开放性、探索性和动态性。

真实的求解过程通常不会严格按照固定的：

```text
Stage 1
→ Stage 2
→ Stage 3
→ Stage 4
```

一路向前。

更常见的情况是：

```text
理解问题
   ↓
建立初步任务结构
   ↓
解决局部问题
   ↓
发现新事实
   ↓
修正任务结构
   ↓
补充资料
   ↓
重新建模
   ↓
补做实验
   ↓
重新整合
   ↓
形成最终方案
```

因此，MM-Agent 的业务流程不采用类似软件工程中固定的：

```text
Discuss → Plan → Execute → Verify
```

作为数学建模流程模板。

[GSD](https://github.com/open-gsd/gsd-core) 等系统真正值得借鉴的是：

- 主会话保持工整；
- 复杂工作交给 subagent，进入干净可控的上下文环境；
- 状态和事实依据约定，用自然语言写入文件；
- 使用自然语言进行跨会话交接，而不是让 LLM 像「填表」一样填预设字段；
- 运行时只负责确定性能力；
- LLM 负责开放世界中的语义判断与动态决策。

---

# 2. 核心架构

```plaintext
                         ┌──────────────────────┐
                         │     Main Session     │
                         │   最强模型 / 主导者  │
                         │   Lead Modeler / PI  │
                         └──────────┬───────────┘
                                    │
                         ┌──────────┴──────────┐
                         │                     │
                         ↓                     ↓
                   ┌──────────┐          ┌────────────┐
                   │ Explorer │          │ Solver│
                   │ 研究支持 │          │  局部解题  │
                   └────┬─────┘          └─────┬──────┘
                        │                      │
                        ↓                      ↓
                 Research Memo            Task Memory
                        │                      │
                        └──────────┬───────────┘
                                   ↓
                             Main Session
                                   │
                                   ↓
                               STATE.md
                                   │
                                   ↓
                          Living Task Graph
                                   │
                                   ↓
                                 Paper
```

这套架构中，**Main Session 是唯一持续保持全局视角的主导者**。

Subagent 不负责全局统治，只负责被委派的局部问题。

---

# 3. Main Session：主导者

## 3.1 定位

Main Session 是整个 Case 的：

- 全局问题理解者；
- 任务分解者；
- 动态调度者；
- 结果整合者；
- 研究方向判断者；
- 最终决策者。

它应该优先使用系统中推理能力最强的大语言模型。

它不需要亲自承担所有计算和检索工作，它应该把复杂、局部、可隔离的工作卸载给 subagent。

## 3.2 Main Session 负责什么

Main Session 主要承担：

```text
Problem Input
      ↓
Grounding
      ↓
Abstraction
      ↓
Decomposition
      ↓
Initial Task Graph
      ↓
动态分派 Explorer / Solver
      ↓
持续读取 Research Memo / Task Memory
      ↓
持续更新对 Case 的理解
      ↓
必要时修改 Task Graph
      ↓
最终整合与 Reporting
```

它最重要的能力是：

> 读取当前事实，理解局面，并决定下一步最值得做什么。

## 3.3 Main Session 不应该做什么

Main Session 不应该成为：

- 所有 Python 代码的亲自作者；
- 所有论文检索的亲自执行者；
- 每一个 Task 的完整求解者；
- 一个被庞大 JSON schema 约束的 workflow executor。

主会话的上下文应优先用于：

- 全局判断；
- 任务路由；
- 结果整合；
- 计划调整；
- 重要决策。

---

# 4. 数学建模的基本认知结构

MM-Agent 不把数学建模固化成固定流水线，但可以识别其中长期稳定的认知动作。

```plaintext
Problem Input
     ↓
Grounding
     ↓
Abstraction
     ↓
Decomposition
     ↓
Task Graph
     ↓
┌─────────────────────────────────────┐
│        Solver Episode          │
│                                     │
│  Formulation                        │
│      ↕                              │
│  Computation                        │
│      ↕                              │
│  Evaluation                         │
│      ↓                              │
│  Interpretation                     │
│      ↓                              │
│  Task Memory                        │
└─────────────────────────────────────┘
     ↓
Main Session 持续整合
     ↓
必要时重新规划 / 新增 Task / 重跑 Task
     ↓
Reporting
     ↓
Paper
```

这些动作是数学建模本身的认知结构，不是 Runtime 的强制状态机。

---

# 5. Living Task Graph

## 5.1 Task Graph 是活的

Main Session 在初始理解后建立一个 Task Graph。

Task Graph 描述：

- 当前有哪些 Task；
- Task 之间的依赖关系；
- 当前对问题结构的理解。

它不是一次生成以后永久冻结的计划。

真实求解过程中可能发生：

```text
Task A 完成
↓
发现 Task B 已无必要
```

也可能：

```text
Task A 完成
↓
发现新的关键问题
↓
新增 Task D
```

还可能：

```text
原本认为 B 与 C 独立
↓
新结果表明 C 依赖 B
↓
修改依赖关系
```

因此：

> Task Graph 是 Main Session 对当前问题结构的 living representation。

## 5.2 Task Graph 的表达方式

优先使用人类可读的 Markdown。

例如：

```markdown
# Task Graph

## Task A：数据清洗与异常检测

目标：
整理附件中的原始数据，识别异常值和缺失值。

依赖：
无。

后继：
Task B、Task C。

## Task B：参数估计

目标：
根据 Task A 的清洗结果估计模型参数。

依赖：
Task A。

## 当前判断

Task B 与 Task C 可以并行。
Task D 是否需要保留，等待 Task A 的结果后再决定。
```

不要求开发者提前规定固定字段。

---

# 6. Solver

## 6.1 定位

Solver 是核心的生产型 subagent。

每次启动：

```text
Fresh Context
     ↓
领取一个 Task
     ↓
读取当前 Task 上下文
     ↓
读取必要的原题上下文
     ↓
读取直接依赖的 Task Memories
     ↓
完成一次 Solver Episode
     ↓
留下 Task Memory
```

一个 Solver 只对当前 Task 的局部数学建模工作负责。

---

# 7. Solver Episode

Solver 进入 fresh context 后，内部完成：

```text
             ┌──────────────────┐
             ↓                  │
Formulation → Computation → Evaluation
     ↑             │            │
     └─────────────┴────────────┘
                         ↓
                  Interpretation
                         ↓
                    Task Memory
```

## 7.1 Formulation

负责：

- 理解当前子问题；
- 明确变量；
- 明确假设；
- 选择候选方法；
- 形式化模型；
- 明确参数与约束；
- 确定求解路径。

Formulation 允许调用 Explorer 获取：

- HMML 方法知识；
- 相关论文；
- 数据来源；
- 领域背景。

## 7.2 Computation

负责：

- 编写和运行 Python；
- 数值求解；
- 优化；
- 仿真；
- 参数估计；
- 数据处理；
- 绘图；
- 生成表格和中间结果。

Computation 由确定性 Runtime 工具执行。

## 7.3 Evaluation

负责判断：

- 模型是否合理；
- 拟合是否可接受；
- 结果是否稳定；
- 误差是否合理；
- 是否需要敏感性分析；
- 是否存在过拟合；
- 参数是否可辨识；
- 结果是否违反现实约束；
- 是否需要重新 Formulation。

Evaluation 属于 Solver 自己的内部工作与局部自检。

## 7.4 Interpretation

负责把数学结果重新解释为当前问题中的现实意义：

```text
现实问题
→ 数学模型
→ 数值结果
→ 现实解释
```

Solver 不应该只留下：

```text
x = 0.713
```

还应说明：

- 0.713 表示什么；
- 为什么会得到这个结果；
- 它对当前 Task 意味着什么；
- 结果的可信范围；
- 有哪些限制。

---

# 8. Task 内部允许局部迭代

Solver 对当前 Task 拥有局部自治权。

例如：

```text
Computation 失败
→ 回 Formulation
```

```text
Evaluation 发现模型效果差
→ 回 Formulation / Computation
```

```text
Interpretation 发现结果违反现实常识
→ 回检查假设 / Formulation
```

这些回环不需要主会话逐步介入。

如果问题仍然属于当前 Task 的边界，Solver 应自主尝试解决。

---

# 9. Solver 如何退出

Solver 不使用固定的：

```text
SUCCESS
BLOCKED
REPLAN_REQUIRED
UNCERTAIN
```

之类枚举协议。

这些可以作为设计者理解失败类型的概念，但不应成为 Agent 的填表 schema。

Solver 结束时应写一份自然语言 Markdown 交接文档。

如果顺利完成，它写清：

- 做了什么；
- 用了什么模型；
- 关键假设是什么；
- 得到了什么结果；
- 结果是否可信；
- 下游可以使用什么；
- 生成了哪些文件；
- 有什么局限性；
- ……

如果没有顺利完成，它写清：

- 卡在哪里；
- 已经尝试过什么；
- 为什么继续做没有意义；
- 问题是否超出当前 Task 权限；
- 可能需要主会话重新考虑什么；
- 哪些已有工作仍然可复用；
- ……

目标是：

> 让一个完全没有经历当前会话的 fresh agent，仅通过这份 Markdown，也能够理解发生了什么并继续工作。

---

# 10. Task Memory

Task Memory 是 Solver 对局部求解过程的压缩提交。

```plaintext
Solver Episode
        ↓
     Task Memory
        ↓
   Main Session / 后继 Task
```

它是 Agent 之间的主要语义接口。

Task Memory 不应该被理解成固定的数据结构。

它是一份自包含的工作交接文档。

例如：

```markdown
# Task B：人口增长模型

我使用 Logistic Growth Model 对清洗后的年度数据进行了拟合。

模型：
...

参数估计：
...

结果：
...

稳定性：
删除最后一个观测点后，参数 K 从 812 变化到 636，
说明长期上限估计存在较高不确定性。

当前判断：
短期趋势较稳定，长期预测不宜作为强结论。

对后继 Task 的建议：
Task C 可以使用短期增长率，但不要直接使用 K 作为确定参数。

相关文件：

- work/fit.py
- work/result.csv
- work/fit.png
```

---

# 11. Explorer：研究支持 Agent

## 11.1 定位

Explorer 是贯穿整个 Case 的研究支持能力。

它不占据固定的业务阶段。

它可以在任何时候被 Main Session 或 Solver 调用。

Explorer 负责：

- 阅读赛题附件；
- 梳理本地材料；
- 搜索论文；
- 搜索公开数据；
- 查找官方资料；
- 查标准与技术文档；
- 检索 Knowledge；
- 浏览 HMML；
- 整理来源；
- 形成 Research Memo。

## 11.2 Explorer 的核心职责

Explorer 回答的是：

> 当前问题需要哪些可靠的外部知识、数据、方法和证据？

它可以提出方法建议，但最终模型选择仍由 Main Session 或 Solver 决定。

---

# 12. Explorer 的研究来源层次

```text
Research Question
        ↓
System Knowledge
        ↓
Case Library
        ↓
External World
```

优先级可以理解为：

1. 先检查系统长期 Knowledge 是否已经包含相关方法或经验；
2. 再检查当前 Case 是否已经收集过相关材料；
3. 仍然不足时，再进行外部检索。

---

# 13. HMML 的新定位

HMML 不再作为一个依赖 embedding model 的特殊检索服务。

它被纳入系统 Knowledge：

```text
knowledge/
└── hmml/
    ├── INDEX.md
    ├── optimization/
    │   ├── INDEX.md
    │   ├── linear-programming.md
    │   ├── integer-programming.md
    │   └── ...
    ├── statistics/
    ├── time-series/
    └── ...
```

Explorer 通过：

```text
Hierarchical Browse
        +
Full Text Search
```

进行检索。

例如：

```text
Research Question
      ↓
阅读 HMML 根 INDEX
      ↓
定位可能领域
      ↓
全文搜索关键词
      ↓
形成候选方法集合
      ↓
深入阅读
      ↓
Research Memo
```

这样可以避免：

- 大型 embedding model 依赖；
- 向量索引维护；
- embedding cache；
- 相似度 top-k 的黑箱行为。

同时保留 HMML 作为数学建模知识地图的价值。

---

# 14. Research Memo

Explorer 的主要输出是 Research Memo。

它使用自然语言 Markdown，不做固定 schema。

Research Memo 应尽量说明：

- 研究问题是什么；
- 搜索了哪些方向；
- 找到了什么；
- 哪些来源最可信；
- 这些信息对当前 Case 有什么意义；
- 有什么冲突或不确定性；
- 仍然缺什么。

例如：

```markdown
# 小样本时间序列方法调研

当前 Task 只有 7 个年度观测点。

我重点查看了：

- GM(1,1)
- Holt Trend
- ARIMA

HMML 中 GM(1,1) 明确适用于小样本、贫信息序列。

ARIMA 虽然理论上可用，但当前样本量不足以支持稳定参数估计。

进一步检索了相关论文与官方资料……

当前建议：
优先尝试 GM(1,1) 与 Holt Trend，
并把 ARIMA 作为不推荐方案说明原因。

仍未解决：
没有找到与当前具体行业高度一致的公开 benchmark。
```

---


# 15. Main Session 的持续整合

Integration 不单独设为固定 Agent。

Main Session 每收到一份新的 Task Memory，都可以持续整合：

```text
Task A Memory
      ↓
Main 更新理解
      ↓
Task B Memory
      ↓
Main 再更新理解
      ↓
可能修改 Task Graph
      ↓
继续派发 Task
```

因此 Integration 是持续发生的全局认知活动。

所有核心 Task 完成后，Main Session 再进行一次全局收束：

- 所有问题是否都已回答；
- 不同 Task 的假设是否一致；
- 变量含义是否一致；
- 单位是否冲突；
- 上游结果是否被下游正确使用；
- 是否存在互相矛盾的结论；
- 是否缺关键实验；
- 是否需要补做敏感性分析；
- 是否能形成统一的数学建模故事。

---

# 16. STATE.md：主会话的笔记本

`STATE.md` 是 Main Session 的 external working memory。

它不是 Runtime 状态机。

它用于保存：

- Main 当前对问题的理解；
- 已完成的重要工作；
- 当前可信结论；
- 关键 limitation；
- 当前 Task Graph 的变化；
- 下一步判断。

例如：

```markdown
# Current State

当前问题被拆为 A、B、C。

Task A 已完成，结果可靠。

Task B 已完成。
短期预测可信，但长期参数 K 对最后两个观测点高度敏感。
最终论文必须披露这一限制。

Task C 尚未开始，依赖 A 和 B。

最新判断：
原计划中的 Task D 已无必要，因为 A 已直接回答对应问题。

下一步：
运行 Task C。
完成后重新检查三个子问题是否能够共同回答原题。
```

如果主会话被压缩、终止或更换：

```text
New Session
    ↓
读取 STATE.md
    ↓
读取 Task Graph
    ↓
读取必要 Memories
    ↓
继续
```

---

# 17. 三层知识与记忆体系

整个 MM-Agent 外部认知系统分为三层。

```text
┌──────────────────────────────┐
│          Knowledge           │
│ 系统长期资产，跨 Case 复用    │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│        Case Library          │
│ 当前 Case 收集的外部事实材料  │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│       Working Memory         │
│ 当前 Case 中形成的认知产物    │
└──────────────────────────────┘
```

---

# 18. Knowledge

## 18.1 定义

Knowledge 是：

> MM-Agent 在开始任何一道新题之前，就已经拥有的长期事实、方法、经验和资产。

它随系统分发，并随着版本长期演化。

## 18.2 Knowledge 可以包含什么

```text
knowledge/
│
├── hmml/
│   ├── INDEX.md
│   ├── optimization/
│   ├── statistics/
│   ├── time-series/
│   └── ...
│
├── competitions/
│   ├── CUMCM/
│   │   ├── guide.md
│   │   └── templates/
│   │       └── CUMCMThesis/
│   │           ├── main.tex
│   │           ├── cumcmthesis.cls
│   │           ├── *.sty
│   │           └── ...
│   │
│   └── MCM-ICM/
│       ├── guide.md
│       └── templates/
│           └── mcmthesis/
│               ├── example.tex
│               ├── mcmthesis.cls
│               └── ...
│
├── recipes/
│   ├── statistics/
│   ├── optimization/
│   ├── visualization/
│   └── data-processing/
│
├── research/
│   ├── literature-search.md
│   ├── source-quality.md
│   └── public-data-guide.md
│
└── experience/
    ├── small-sample-modeling.md
    ├── sensitivity-analysis.md
    ├── numerical-instability.md
    └── ...
```

文件类型不决定它属于哪一层。

`.md`、`.py`、`.tex`、`.cls`、`.sty` 都可以属于 Knowledge。

关键标准是：

> 这个资产是否属于系统长期维护，并且可以跨 Case 复用。

---

# 19. Case Library

## 19.1 定义

Case Library 是：

> 为当前具体问题才进入系统的外部事实与材料。

包括：

- 赛题正文；
- 官方附件；
- Excel / CSV；
- 图片；
- PDF；
- Explorer 找到的论文；
- 公开数据；
- 官方网页；
- 技术报告；
- 当前 Case 的引用库。

例如：

```text
case/
└── library/
    ├── problem/
    ├── attachments/
    ├── papers/
    ├── datasets/
    ├── webpages/
    └── references.bib
```

---

# 20. Working Memory

Working Memory 是当前 Case 内 Agent 思考后形成的认知产物。

包括：

```text
STATE.md
Task Memories
Research Memos
Task Graph
Retrospective
```

它和 Case Library 的区别是：

```text
Case Library
= 外部世界给了我们什么

Working Memory
= Agent 根据这些材料理解出了什么
```

---

# 21. 参考文献与来源追溯

研究内容允许使用自然语言 Markdown。

但来源本身属于客观 provenance，应保留可靠的标准表示。

例如：

```text
references.bib
```

最终论文中的参考文献原则上应来自：

```text
Explorer 发现来源
      ↓
核验来源
      ↓
加入 Case Library
      ↓
形成 Research Memo
      ↓
进入 references.bib
      ↓
Task / Main 实际使用
      ↓
最终论文引用
```

Main Session 和 Reporter 不应凭模型记忆临场编造引用。

---

# 22. Runtime 边界

Runtime 应保持薄。

Runtime 负责：

```text
文件读写
目录创建
进程执行
Python / Shell
stdout / stderr
exit code
LaTeX 编译
PDF 是否存在
必要的文件锁
下载或缓存资源
全文搜索
```

Runtime 不负责：

```text
这个模型是否合理
这个 Task 是否完成
这个结果是否可信
现在是否应该回到上游
Task Graph 是否要修改
应该派哪个 Agent
论文是否已经足够自洽
```

这些属于 LLM 的语义判断。

设计原则：

> 让 Artifact 承载事实，让 LLM 解释事实，让 Runtime 只负责真正需要确定性的事情。

---

# 23. 文件系统提供边界，Markdown 提供语义

整个系统优先采用：

```text
文件系统
+
Markdown
```

作为跨 Agent、跨 context、跨 session 的主要通信层。

可以形成类似：

```text
case/
│
├── library/
│   ├── problem/
│   ├── attachments/
│   ├── papers/
│   ├── datasets/
│   └── references.bib
│
├── STATE.md
├── task-graph.md
│
├── research/
│   ├── memo-001.md
│   └── memo-002.md
│
├── tasks/
│   ├── task-a/
│   │   ├── memory.md
│   │   └── work/
│   ├── task-b/
│   │   ├── memory.md
│   │   └── work/
│   └── ...
│
├── retrospective.md
│
└── report/
    ├── main.tex
    ├── figures/
    ├── compile.log
    └── report.pdf
```

`work/` 内部允许 Agent 自由组织：

```text
.py
.csv
.xlsx
.png
.json
.md
...
```

不要求统一 schema。

---

# 24. 自迭代机制

MM-Agent 可以通过真实 Case 持续形成长期经验。

但 Case 不应直接修改正式 Knowledge。

推荐过程：

```text
Real Case
   ↓
Retrospective
   ↓
Candidate Knowledge
   ↓
审查 / 整理 / 合并
   ↓
Global Knowledge
   ↓
未来 Case 使用
```

## 24.1 Case Retrospective 可以记录

- 哪些方法有效；
- 哪些模型失败；
- 为什么失败；
- 哪些 Task 后来被重新拆分；
- 哪些假设被推翻；
- 哪些代码容易出错；
- 哪些数据源最可靠；
- 哪些论文检索路径有效；
- 哪些论文写作环节发生返工；
- 哪些经验值得跨 Case 保留。

## 24.2 防止知识污染

不允许：

```text
某个 Case 中的一次偶然经验
↓
直接变成系统长期事实
```

必须经过一次 promotion / curation。

这样可以避免 Agent 自己产生错误知识，再在后续 Case 中自我引用、自我强化。

---

# 25. 两个循环

整个系统可以被理解为两个嵌套循环。

## 25.1 单 Case 求解循环

```text
Main Session
   ↕
Explorer
   ↕
Solver
   ↕
Case Artifacts
   ↓
Paper
```

目标：

> 解决当前问题。

## 25.2 跨 Case 学习循环

```text
Case
 ↓
Retrospective
 ↓
Candidate Knowledge
 ↓
Curate
 ↓
Knowledge
 ↓
未来 Case
```

目标：

> 让系统越来越会解决问题。

---

# 26. 典型运行过程

```text
Problem Input
      ↓
Main Session 阅读赛题与附件
      ↓
必要时调用 Explorer 做材料梳理
      ↓
Grounding / Abstraction / Decomposition
      ↓
建立 Initial Task Graph
      ↓
选择可执行 Task
      ↓
spawn fresh Solver
      ↓
Solver 完成一次 Episode
      ↓
写 Task Memory
      ↓
Main Session 阅读并更新 STATE.md
      ↓
判断：
  继续后继 Task？
  修改 Task Graph？
  调 Explorer？
  重跑某个 Task？
      ↓
不断循环
      ↓
Main 完成全局整合
      ↓
Reporting
      ↓
Compile
      ↓
Paper
      ↓
Retrospective
```

---

# 27. 典型返工路径

数学建模中存在不同层次的错误。

```text
Computation 失败
→ Solver 内部回 Formulation / Computation
```

```text
Evaluation 发现模型表现差
→ Solver 内部调整模型
```

```text
Interpretation 发现结果违反现实约束
→ Solver 回查假设和 Formulation
```

```text
Solver 发现缺关键上游信息
→ 写入 Task Memory
→ Main Session 判断是否修改 Task Graph
```

```text
Main Session 发现 Task 间矛盾
→ 回对应 Task
```

```text
Reporting 发现缺关键证据
→ Main Session 决定补实验 / 补 Task / 调 Explorer
```

返工路径由 LLM 根据 Artifact 自主判断，不由固定 enum 状态机决定。

---

# 28. Host-Agnostic 实现要求

这份设计不依赖具体宿主。

任何宿主只要能够提供下列能力，就可以实现 MM-Agent。

## 28.1 必要能力

### 主会话

宿主需要允许一个持续存在的 Main Session：

- 可以读取项目文件；
- 可以调用工具；
- 可以启动 subagent / task；
- 可以持续维护上下文。

### Fresh Subagent

宿主需要提供某种机制实现：

```text
spawn fresh context
+
提供 prompt / skill / task context
+
等待结果
```

具体机制可以不同。

顶层设计只要求语义等价。

### 文件系统

需要支持：

- 读文件；
- 写文件；
- 创建目录；
- 保存 Markdown；
- 保存代码和数据 Artifact。

### 确定性工具

至少应能提供：

- shell / process；
- Python；
- 文件操作；
- LaTeX compile；
- 必要的数据处理能力。

### Research

Explorer 最好能够访问：

- 本地 Knowledge；
- Case Library；
- 全文搜索；
- Web / Academic Search；
- 文件读取。

网络能力不可用时，Explorer 仍可退化为本地资料研究模式。

---

# 29. Host Adapter 的职责边界

具体宿主适配层只解决：

```text
如何注册 Agent
如何加载 Skill
如何 spawn fresh subagent
如何暴露工具
如何找到项目目录
如何调用 shell / Python / compile
如何读取和写入 Artifact
```

它不应该重新实现一套宿主专属的数学建模业务流程。

因此：

```text
MM-Agent Core Design
        ↓
Host Adapter A
Host Adapter B
Host Adapter C
```

不同宿主只负责机制映射。

业务语义保持一致。

---

# 30. 设计原则总结

## 原则 1：Main Session 是主导者

最强模型用于全局理解、判断、整合和动态决策。

## 原则 2：Task 是主要卸载边界

局部复杂工作进入 fresh Solver Episode。

## 原则 3：Task 内允许自治迭代

Formulation、Computation、Evaluation、Interpretation 可以自由回环。

## 原则 4：Task Memory 是语义接口

Agent 之间通过自包含 Markdown 交接。

## 原则 5：Explorer 是横向科研能力

论文、数据、附件、HMML、公开资料都由 Explorer 按需研究。

## 原则 6：Task Graph 是 living plan

允许随着新结果动态修改。

## 原则 7：STATE.md 是主会话自己的笔记本

用于持久化当前全局理解。

## 原则 8：Knowledge 是系统长期资产

包含 HMML、模板、代码 recipe、经验、研究规范等。

## 原则 9：Case Library 保存当前 Case 的外部事实

题目、附件、论文、数据和引用都进入 Case Library。

## 原则 10：Working Memory 保存当前 Case 的认知产物

Task Memory、Research Memo、Task Graph、STATE.md 属于 Working Memory。

## 原则 11：Runtime 保持薄

确定性工作交给 Runtime，开放式判断交给 LLM。

## 原则 12：不使用重型语义状态机

避免把 Agent 变成填表工具。


## 原则 13：真实 Case 可以反哺 Knowledge

通过 Retrospective 与 Knowledge Promotion 形成跨 Case 自迭代。

---

# 31. 最终心智模型

```text
                         MM-Agent
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
          ↓                 ↓                 ↓
       Harness          Knowledge         Runtime
   如何组织认知协作      已经知道什么       确定性能力
          │                 │                 │
          └─────────────────┼─────────────────┘
                            ↓
                       Main Session
                     最强模型 / 主导者
                            │
                   ┌────────┴────────┐
                   ↓                 ↓
               Explorer         Solver
                   │                 │
                   ↓                 ↓
             Research Memo       Task Memory
                   │                 │
                   └────────┬────────┘
                            ↓
                     Main 持续理解整合
                            ↓
                        STATE.md
                            ↓
                    Living Task Graph
                            ↓
                          Paper
                            ↓
                     Retrospective
                            ↓
                    Candidate Knowledge
                            ↓
                       Knowledge
```

---

# 32. 这套设计真正希望实现的东西

MM-Agent 的核心价值不在于把数学建模拆成更多 Agent。

它希望构建的是：

> 一个能够利用 LLM 的开放推理能力，同时通过文件、工具、Fresh Context、长期 Knowledge 和真实 Case 经验保持可靠性的数学建模工作环境。

这个系统应该允许解题过程发生变化。

允许：

- 修改任务；
- 推翻假设；
- 换模型；
- 补资料；
- 重做实验；
- 增加验证；
- 调整论文主线。

最终所有机制都服务于同一个目标：

> 得到一套合理、可信、可解释、可复现、可以被清楚表达为论文的数学建模解决方案。
