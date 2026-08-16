---
name: doc-style
description: 在 MM-Agent 项目中编写、修改或审阅面向人的 Markdown 文档时使用。统一项目的中文技术写作风格、术语表达和排版习惯。
---

# MM-Agent 文档写作风格

本项目的面向人类阅读的文档以自然、克制、清晰的中文技术写作为主。

核心原则：

> 中文负责叙述，英文负责术语锚定。

能用准确、自然的中文表达时，使用中文。
只有当英文承担正式术语、角色标识、文件标识、接口名称或消歧作用时，才保留英文。

## 中文叙述优先

普通叙述不要无必要地夹入英文词。

推荐：

> 主会话持续保持当前数学建模问题的全局视角。

避免：

> Main Session 持续保持当前 Case 的全局视角。

推荐：

> 复杂、局部、可以隔离的问题，应适时卸载给子智能体。

避免：

> 复杂、局部、可以隔离的问题，应适时 offload 给 fresh subagent。

推荐：

> 子智能体拥有干净可控的上下文。

避免：

> subagent 拥有 fresh context。

`Main Session`、`Case`、`subagent`、`fresh context` 等词，如果不存在必要的术语区分，应使用自然中文表达。

普通叙述中的 `Case` 按语境写成“建模任务”“赛题”“本次求解”；`Case Library`、`runs/<case-id>/` 等复合标识保留英文。

## 保留必要的英文术语

正式认知术语、角色名称、正式认知产物名、文件名和代码标识可以保留英文。

例如：

- Grounding
- Abstraction
- Decomposition
- Living Task Graph
- Explorer
- Solver
- Research Memo
- Task Memory
- Candidate Knowledge
- Retrospective
- `SKILL.md`
- `STATE.md`
- `task-graph.md`
- `references/`

英文术语出现时，可以与简洁中文释义自然并列：

```text
Grounding 问题背景落地
Abstraction 问题数学抽象
Decomposition 具体任务分解
Living Task Graph 动态任务图
```

这种并列表达用于建立术语映射。

## 英文术语的资格判定

一个英文词能否作为正式术语保留，取决于它是否在项目架构文档（如 `docs/abstracted-design.md`）或运行时 Skill 中有明确概念定义：

- 正式角色名（Explorer、Solver）；
- 认知术语或架构概念（Grounding、Abstraction、Decomposition、Living Task Graph）；
- 正式认知产物名（Research Memo、Task Memory、Candidate Knowledge、Retrospective）；
- 文件名、路径、代码标识或接口名。

一个词在 Agent 或软件工程领域很常见，不自动赋予它正式术语资格。

判定的可操作标准：

- 能否在架构文档或 Skill 中找到它的概念定义？
- 翻译成中文后是否损失了稳定的、反复需要引用的精确语义？
- 去掉它之后，句子是否仍能用自然中文准确表达且无歧义？

仅当英文提供消歧价值或术语锚定价值时才保留；否则按语境使用自然中文。

## 识别伪术语

大写、反复出现、放在架构句子里的英文词，如果查不到概念定义，就是伪术语。

常见伪装者是通用名词：`Artifact`（文件、产物、资料）、`Core`（核心架构）、`Completion`（完成判断）、`Narrative`（叙事）、`Case`（当前建模问题、本次求解、这道赛题）。

判断伪术语的典型信号：

- 它在普通叙述里本可以被一个准确中文词替代；
- 它被大写使用，看起来像正式概念，但架构文档没有定义它；
- 它反复出现，仿佛暗示一种不存在的对象、层级或协议。

一旦识别为伪术语，应根据当前语境改写成准确的中文，而不是机械统一翻译成一个中文词。

## 不机械一对一翻译

同一个英文词在不同语境可能有不同准确中文，必须按实际语义选择。

例如 `Case`：

- “处理某个 Case” → “处理某个建模任务”；
- “Case 是否完成” → “本次求解是否完成”；
- “Case 材料” → “赛题材料”；
- 但 `Case Library`、`runs/<case-id>/`、`case-id` 是正式复合标识，保留英文。

`Artifact` 也类似：

- “读取对应 Artifact” → “读取对应文件”；
- “已有 Artifact” → “已有资料或认知产物”；
- “历史 Artifact” → “历史文件和认知产物”；
- 但 `case-artifacts.md` 作为文件名保留。

不要做全局机械替换，也不要为了追求“全中文”翻译正式标识、文件名、角色名或代码标识。

## 避免翻译腔

除非语义确有需要，不要把普通中文表达写成“中文（English）”式术语释义。

不优先：

```text
问题背景落地（Grounding）
数学抽象（Abstraction）
```

更偏好：

```text
Grounding 问题背景落地
Abstraction 问题数学抽象
```

## 避免字段化表达

文档是连续的技术叙述，不要无必要地写成表单、配置项或术语词典。

不优先：

```text
Grounding：问题背景落地
Abstraction：问题数学抽象
Decomposition：具体任务分解
```

更偏好：

```text
Grounding 问题背景落地
Abstraction 问题数学抽象
Decomposition 具体任务分解
```

冒号只在正常中文语法、定义、接口说明或确实需要字段结构时使用。

## 保持自然中文句法

不要为了保留英文术语破坏中文语序。

避免：

> Main 根据 Case 当前的 Task Graph 判断是否 spawn Explorer。

更自然：

> 主会话根据当前任务图和整体局势，判断是否需要调用 Explorer。

英文术语应嵌入自然中文，而不是让整句话围绕英文语法组织。

## 正式标识保持稳定

文件名、路径、角色正式名称和代码标识不要为了中文化而改写。

例如：

```text
Explorer
Solver
SKILL.md
STATE.md
references/delegation.md
```

正文可以使用中文描述这些对象，但涉及实际标识、路径或需要与实现对应时，应使用其正式名称。

## 术语使用保持一致

同一概念在同一份文档和相邻文档中应保持稳定表达。

不要在没有语义区别时交替使用：

```text
主会话
Main
Main Session
主 Agent
总控智能体
```

选择当前项目约定的表达后持续使用。

如果英文只用于第一次建立术语锚点，后续正文优先使用自然中文。

## 排版保持克制

使用 Markdown 层级帮助阅读，但不要过度结构化。

偏好：

- 短标题；
- 自然段落；
- 简单列表；
- 必要的代码块；
- 少量用于表达结构的 ASCII 图。

避免：

- 为一句话单独创建多级标题；
- 大量字段式列表；
- 为普通概念制作表格；
- 过度使用粗体、括号、冒号和装饰性格式；
- 为了“技术感”增加英文。

## 标题也要纳入审查

首字母大写的英文标题最容易看起来像“新架构概念”，实际上可能只是章节标签。

局部检查维度、章节标签的标题应中文化：

```text
### Problem Coverage      →   ### 问题覆盖
### Modeling Consistency  →   ### 建模一致性
### Research and Citations →  ### 研究与引用
## 4. Completion          →   ## 4. 完成判断
```

reference 文件主标题（与文件名对应的锚点，如 `# Reporting`、`# Delegation`）可以保留英文，正文中仍使用自然中文。

## 修改既有文档时

尊重文档已经建立的术语和语气。

修改时优先解决：

1. 无必要的中英混杂；
2. 不自然的中文语序；
3. 同一概念多种称呼；
4. 字段化、翻译腔或过度结构化表达；
5. 英文术语与项目正式标识不一致；
6. 伪术语被当作正式概念使用；
7. 过时的角色名或术语（如 `Task Solver` 已改名 `Solver`，`Research Gap` 已中文化为“研究信息缺口”）。

不要仅为了统一风格改变原文的技术语义。
