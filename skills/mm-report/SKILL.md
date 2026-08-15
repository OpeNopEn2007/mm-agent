---
name: mm-report
description: 从已接受的 Case 产物生成并编译一个报告候选。
---

# 报告

只读 Writer Manifest 声明的已接受产物。在当前 reporting Attempt 内写 outline、notation 和 `main.tex`。对该 Attempt 调用 `mm_agent_compile`；保留它生成的 `compile.log`、`report.pdf` 和 Compile Runtime Evidence 原样不变。没有成功的、哈希匹配的 Compile Evidence，PDF 不能通过 Reporting Gate。

## 编译契约（强制）

调用 `mm_agent_compile` 时必须：

- `case_id` — 当前 Case id，从 `context.json` 复制。
- `work_dir` — 精确为当前 Attempt 目录相对 Case 根的路径。若 `context.json` 位于 `attempts/reporting/002/context.json`，则 `work_dir` 就是字面字符串 `attempts/reporting/002`。不要传绝对路径、宿主系统路径、之前某个 reporting Attempt 的目录，或不是 `attempts/reporting/` 直接子目录的路径。
- `main_tex` — 字面字符串 `main.tex`（或省略；`main.tex` 是默认且唯一可接受的值）。

Writer 只在自己的当前 Attempt 目录下产出候选，且只对该 Attempt 调用 `mm_agent_compile`。它绝不调用 `mm_agent_case`，绝不调 Gate，绝不 dispatch 新 Attempt，绝不在同级或更早的 reporting Attempt 内编译，绝不通过 `task` 委派。