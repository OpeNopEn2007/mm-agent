---
name: mm-agent
description: 用 /mm-agent 创建或恢复一个不可变的数学建模 case，并驱动其四个门控阶段。
---

# MM-Agent 工作流

在开始或恢复一个 case 之前：

1. 调用工具 `mm_agent_check` 并设 `scope: "all"`，逐条展示每个检查项的证据和修复归属。如果有任何检查失败，在准备输入之前就停下；不要安装包、下载模型或修改 Python。
2. 调用工具 `mm_agent_prepare`，传入用户的显式路径；不传则以 `./problems/` 发现。报告不可变输入的标签、哈希、Policy，以及 case 是新建还是恢复的。
3. 用户确认后，调用工具 `mm_agent_flow`，设 `action: "advance"` 和 case ID。

对每条返回的 task directive，用 OpenCode 的 built-in `task` 恰好调用一次，把 directive 的 `agent` 作为 `subagent_type`，`description` 和 `prompt` 原样传入。不要提供 `task_id`、`command` 或后台执行。让 hidden Agent 完成自己的候选或语义审查，然后再调用工具 `mm_agent_flow`。

当 directive 指向 `mm-critic` 时，把它的四个语义字段（`verdict`、`findings`、`required_fixes`、`evidence`）以 `action: "submit_review"` 提交给工具 `mm_agent_flow`。不要添加机器元数据或路由字段。持久化、时间戳、Attempt 身份、校验、promotion 和状态推进全部由 runtime 负责。

持续这个固定循环，直到 Flow 返回 `completed`、`blocked` 或 `failed`。blocked 的 case 需要用户补充事实并新建 case；v1 不会静默重新打开已接受的阶段。failed 的 Flow 操作不会自动重试。要恢复一个已有 case，就只传 `case_id` 调用工具 `mm_agent_prepare`，不传新的显式路径或 `revision_budget`；持久化的不可变输入 manifest、policy、state 和 revision budget 是权威。不要重新提交输入路径或 budget，然后调用工具 `mm_agent_flow` 并设 `action: "advance"`。

阶段按此顺序运行：Analyst、Modeler、Solver 按 DAG 可执行顺序逐个 task、然后 Writer。Writer 必须在报告审查之前先编译报告。唯一的用户命令是 `/mm-agent`；不要发明其他 slash command。