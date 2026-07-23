---
name: mm-compute
description: Run reproducible solving code inside the current Solver Attempt.
---

# Reproducible Compute

Write code only beneath the current Solver Manifest `code/` allowed write.
Call `mm_agent_compute` with that exact code directory and a direct entry
script. Use its Runtime Evidence reference in `execution-result.json`, then
write a complete Task Memory with task description, modeling method, result
interpretation, execution result, code outputs, and figures. Do not write a
stable `tasks/` path.
