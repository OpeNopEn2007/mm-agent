---
name: mm-compute
description: 在当前 Solver Attempt 内运行可复算的求解代码。
---

# 可复算 Compute

只把代码写到当前 Solver Manifest 声明的 `code/` 允许写目录下。用那个确切的代码目录和直接入口脚本调用 `mm_agent_compute`。把返回的 Runtime Evidence 引用写进 `execution-result.json`，随后写一份完整的 Task Memory，包含：任务描述、建模方法、结果解读、执行结果、代码输出和图表。不要写持久态的 `tasks/` 路径。