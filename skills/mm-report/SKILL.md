---
name: mm-report
description: Produce and compile a reporting candidate from accepted Case artifacts.
---

# Reporting

Read only accepted artifacts declared by the Writer Manifest. Write outline,
notation, and `main.tex` in the current reporting Attempt. Call
`mm_agent_compile` for that Attempt; retain its generated `compile.log`,
`report.pdf`, and Compile Runtime Evidence unchanged. A PDF without successful,
hash-matching Compile Evidence cannot pass the Reporting Gate.
