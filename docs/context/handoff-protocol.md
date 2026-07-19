# Handoff 协议

Handoff 的目标是让任何智能体都能从仓库文件恢复项目真相，而不是依赖上一段私人对话。

本项目把仓库视为共享记忆总线。聊天只是传输通道，持久状态必须落到文件里。

## 文件分工

| 文件 | 职责 |
|------|------|
| `HANDOFF.md` | 当前交接状态。记录 workspace、阶段、已接受事实、进行中任务和下一位 commander 的动作。 |
| `AGENTS.md` | 通用智能体入口。说明项目方向、必读顺序和工作规则。 |
| `CLAUDE.md` | Claude 系智能体入口。内容与 `AGENTS.md` 保持同步。 |
| `README.md` | 项目结构和入口。 |
| `PLAN.md` | 结果导向的里程碑契约：预期结果、交付边界和验收证据。 |
| `docs/context/` | 项目级协议。 |

`HANDOFF.md` 是活文件，只记录当前状态；本文件是协议文件，记录如何交接。

## 角色边界

| 角色 | 负责 | 不负责 |
|------|------|--------|
| Commander | 恢复上下文、确认范围、做架构判断、写 worker prompt、验收结果、维护 Handoff 状态 | 盲信 worker 结论、把项目真相留在聊天里 |
| Worker | 完成窄任务、运行指定验证、提交实现报告 | 决定产品方向、扩大范围、修改 Handoff 结论 |
| User | 最终产品判断、跨工具消息传递、外部账号或云端动作 | 反复复述已经应该写进仓库的项目状态 |

Commander 可以直接实现小而低风险的改动，但仍要先恢复文件真相，再编辑，再验证，再更新交接状态。

## 接手流程

新智能体接手前，先做最小现场恢复：

```powershell
git status --short --branch
git branch --show-current
git rev-parse --show-toplevel
```

然后读取 `AGENTS.md` 或 `CLAUDE.md`，并遵循其中统一维护的完整必读顺序；本文件不保存第二份易漂移的阅读清单。

接手摘要应回答：

- 当前阶段是什么。
- 哪些事实已经被接受，有什么证据。
- 是否有 worker 任务正在进行。
- 下一步最小动作是什么。
- 当前是否适合 commit。

## `HANDOFF.md` 结构

`HANDOFF.md` 使用固定结构，避免写成流水账：

```markdown
## 当前交接状态

### Workspace

- worktree:
- branch:
- dirty state:

### Current Phase

- phase:
- step:
- phase spec:
- latest report:

### Accepted

- item:
- evidence:

### In Flight

- owner:
- task:
- expected output:
- next commander should wait for:

### Next Commander Action

1. read:
2. verify:
3. accept by writing:
4. reject by writing:
```

如果没有 worker 进行中，也要明确写出来，避免两个智能体同时改同一批文件。

## Worker Prompt 结构

委派给其他智能体时，prompt 必须可独立复制：

```markdown
## Required Reading

1. AGENTS.md or CLAUDE.md, including its required reading sequence
2. task-specific source or docs files

## Goal

一句话描述精确目标。

## Scope

- 允许修改的文件或模块
- 允许改变的行为

## Non-goals

- 不允许触碰的文件或模块
- 不由 worker 决定的产品或架构问题
- 已知未来工作

## Acceptance

- 必须运行的命令
- 必须产生的文件
- 必须更新的文档

## Report Requirements

- changed files
- design notes
- validation output
- unresolved risks
- points needing commander review
```

与具体工具、模型、TDD 顺序或聊天窗口有关的操作建议，应放在 prompt 外面，避免把一种执行过程误写成项目验收条件。

## 验收 Worker 输出

不能只读 worker 的最终回答就接受变更。Commander 必须：

1. 读取 worker 报告。
2. 运行 `git status --short`。
3. 检查实际改动和邻近文件。
4. 运行 worker 声称通过的验证命令。
5. 对照代码、文档和报告是否一致。
6. 更新 `HANDOFF.md`，记录接受、带风险接受、拒绝或阻塞。

拒绝时保留有价值的进展，写窄修复任务，不要无理由推倒重来。

## 脏工作区规则

接手脏工作区时，先分类：

- 当前任务变更
- 生成产物
- 本地配置或密钥
- 用户无关改动
- 陈旧调试残留

不要为了交接方便而随手 commit。commit 只发生在用户要求或明确里程碑切口上。

## 完成交接前检查

- `HANDOFF.md` 已更新。
- 当前阶段或任务文档已同步。
- `CHANGELOG.md` 已记录结构性变化。
- 没有把运行产物、密钥或机器本地配置写入提交。
- 已说明是否有 worker 进行中。
- 已说明当前是否适合 commit。
