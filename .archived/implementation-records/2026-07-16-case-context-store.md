# CaseContextStore Step 2 实施记录

本文件是历史记录，不是活跃实施指令。Step 2 的详细过程计划已从活跃文档删除；项目不使用 Superpowers，也不把 TDD、RED/GREEN 或逐步检查清单作为验收条件。

## 已接受结果

- acceptance commit：`cfda6ea feat: implement CaseContextStore contract`
- worktree/branch：`.worktrees/opencode-plugin-spike` / `feat/opencode-plugin-spike`
- public contract：`open`、`dispatch`、`gate`、`inspect`
- implementation surface：`src/core/schema.ts`、`paths.ts`、`migrations.ts`、`context-recipes.ts`、`case-context-store.ts`
- primary tests：`tests/core/case-context-store.test.ts` 与 `tests/fixtures/cases/`

Step 2 接受了 Case schema、immutable input/policy、Context Manifest、Attempt/Review、Gate CAS、promotion whitelist、revision budget、blocker、DAG/wave、Task Memory、Runtime Evidence、completion evidence、Case-relative path、跨 Store lock、durable transaction 和崩溃恢复。

## 收口证据

- 普通测试：81 passed、0 failed、5 个真实 OpenCode runtime tests 按设计 skipped。
- 真实 OpenCode Adapter regression：5 passed、0 failed、0 skipped；它验证 Adapter 回归，不冒充 CaseContextStore 直接 runtime exercise。
- TypeScript Build、npm package allowlist、diff checks 通过。
- 独立审查关闭全部 Critical/Important findings。
- 里程碑提交后工作区 clean、stash 空、未 push，且没有进入 Step 3。

## 当前事实来源

- 机制与不变量：`docs/architecture/canonical-core.md`
- Case 文件协议：`docs/context/artifact-protocol.md`
- Adapter 接口：`docs/architecture/opencode-plugin-harness.md`
- 当前里程碑与验收：根 `PLAN.md`
- 当前工作区状态：根 `HANDOFF.md`

需要查看旧的逐步实施细节时，应使用 Git 历史读取 `cfda6ea` 中原 `docs/superpowers/plans/2026-07-16-case-context-store.md`，不要把它恢复为活跃计划。
