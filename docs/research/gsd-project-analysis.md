# GSD (Get Shit Done) 项目深度剖析

> 源码: https://github.com/gsd-build/get-shit-done
> 版本: v1.35.0 (2026-04-11)
> 提交数: 1,895 次 | 时间跨度: ~4 个月 (2025-12-14 → 2026-04-11)
> 平均迭代速度: 约 15 commits/天

---

## 目录

1. [项目是什么](#1-项目是什么)
2. [技术栈总览](#2-技术栈总览)
3. [项目结构](#3-项目结构)
4. [核心工作流：Phase/Plan/Execute](#4-核心工作流phaseplanexecute)
5. [多智能体编排机制](#5-多智能体编排机制)
6. [状态管理与持久化](#6-状态管理与持久化)
7. [开发历史演化](#7-开发历史演化)
8. [npx 一键分发的实现原理](#8-npx-一键分发的实现原理)
9. [跨 AI 编程助手兼容性](#9-跨-ai-编程助手兼容性)
10. [插件/技能系统](#10-插件技能系统)
11. [测试基础设施](#11-测试基础设施)
12. [GSD 对 mm-agent 的借鉴意义](#12-gsd-对-mm-agent-的借鉴意义)

---

## 1. 项目是什么

**GSD (Get Shit Done)** 是一个**元提示工程（meta-prompting）、上下文工程（context engineering）和规格驱动开发（spec-driven development）系统**。

它的核心价值是：让 AI 编程助手（Claude Code、Cursor、Copilot 等）从"不可靠的代码生成器"变成"可信赖的软件工程合作伙伴"。

解决的核心问题：**上下文衰减（Context Rot）** — 随着对话进行，AI 质量会逐渐下降。GSD 通过严格的状态管理、多智能体编排和质量门控来对抗这个问题。

用户通过 `npx get-shit-done-cc@latest` 安装后，获得一套 slash 命令：

```
/gsd-new-project     # 初始化项目
/gsd-discuss-phase N # 捕获实施决策
/gsd-plan-phase N    # 研究 + 创建已验证的计划
/gsd-execute-phase N # 并行波次执行计划
/gsd-verify-work N   # 人工验收测试
/gsd-ship N          # 从已验证工作创建 PR
/gsd-quick           # 快速 ad-hoc 任务
```

---

## 2. 技术栈总览

| 类别 | 技术 | 说明 |
|------|------|------|
| **运行时** | Node.js >= 22.0.0 | 必须 |
| **SDK 语言** | TypeScript | SDK (`@gsd-build/sdk`) |
| **核心逻辑** | JavaScript (CJS) | 23 个 `.cjs` 核心模块 |
| **命令定义** | Markdown | 80+ `.md` 命令文件 |
| **智能体定义** | Markdown + YAML frontmatter | 25+ agent 文件 |
| **测试 (SDK)** | Vitest | `/sdk/vitest.config.ts` |
| **测试 (Core)** | Node.js 内置 `node:test` | 不使用 Jest/Mocha |
| **覆盖率** | c8 | 要求 70% 以上 |
| **构建** | esbuild | 打包 hooks |
| **包管理器** | npm | 发布到 npm registry |

---

## 3. 项目结构

```
get-shit-done/
├── bin/
│   ├── install.js                 # ⭐ CLI 入口 (npx 触发)
│   └── hooks/                    # 编译后的 hooks 输出
├── get-shit-done/                # GSD-1 核心系统 (bundled tools)
│   ├── bin/
│   │   ├── gsd-tools.cjs         # 状态管理 CLI (45KB)
│   │   └── lib/                  # 23 个 .cjs 核心模块
│   │       ├── commands.cjs      # 命令执行
│   │       ├── state.cjs        # 状态读写
│   │       ├── phase.cjs        # 阶段管理
│   │       └── ...
│   ├── contexts/                # 阶段上下文模板
│   ├── references/               # 35+ 参考文档 (TDD、checkpoint 等)
│   ├── templates/                # 项目模板 (AI-SPEC, UAT 等)
│   │   ├── codebase/
│   │   └── research-project/
│   └── workflows/                # 40+ 工作流定义 (.md)
│
├── agents/                       # 25+ 智能体定义 (.md)
│   ├── gsd-executor.md           # 主执行智能体 (610 行)
│   ├── gsd-verifier.md          # 验证智能体
│   ├── gsd-planner.md           # 规划智能体
│   ├── gsd-phase-researcher.md  # 研究智能体
│   ├── gsd-debugger.md          # 调试智能体
│   └── ...
│
├── commands/gsd/                # 80+ slash 命令 (.md)
│   ├── new-project.md
│   ├── discuss-phase.md
│   ├── plan-phase.md
│   ├── execute-phase.md
│   ├── verify-work.md
│   ├── ship.md
│   ├── quick.md
│   └── ... (75+)
│
├── hooks/                        # 生命周期钩子
│   ├── gsd-workflow-guard.js   # 工作流守卫
│   ├── gsd-prompt-guard.js      # 提示注入检测
│   ├── gsd-context-monitor.js   # 上下文监控
│   ├── gsd-statusline.js        # 状态行显示
│   ├── gsd-session-state.sh     # 会话持久化
│   └── ...
│
├── sdk/                          # TypeScript SDK (@gsd-build/sdk)
│   ├── src/
│   │   ├── index.ts              # 主类 GSD (API 入口)
│   │   ├── phase-runner.ts       # 阶段生命周期状态机 (1164 行)
│   │   ├── session-runner.ts     # SDK query() 编排
│   │   ├── plan-parser.ts        # PLAN.md 解析
│   │   ├── context-engine.ts     # 上下文文件解析
│   │   ├── gsd-tools.ts          # gsd-tools.cjs 桥接
│   │   ├── event-stream.ts       # 事件总线 (30+ 事件类型)
│   │   ├── cli-transport.ts     # CLI 传输层
│   │   ├── ws-transport.ts       # WebSocket 传输层
│   │   ├── config.ts             # 配置加载/合并
│   │   ├── cli.ts               # CLI 入口 (run/auto/init)
│   │   ├── init-runner.ts       # 项目初始化工作流
│   │   └── types.ts             # 完整类型定义
│   ├── prompts/                 # headless 版 agent prompts
│   └── test-fixtures/
│
├── scripts/
│   ├── build-hooks.js           # hooks 构建脚本
│   └── run-tests.cjs            # 测试运行器
│
├── tests/                        # 200+ 核心测试 (.test.cjs)
│   └── helpers.cjs              # 测试辅助函数
│
├── docs/                         # 多语言文档
│   ├── zh-CN/, ja-JP/, ko-KR/, pt-BR/
│   ├── AGENTS.md, ARCHITECTURE.md, COMMANDS.md
│   └── FEATURES.md, CONFIGURATION.md, USER-GUIDE.md
│
├── package.json                  # ⭐ npm 发布配置 (bin 入口)
└── .github/workflows/           # CI/CD (test.yml 等)
```

---

## 4. 核心工作流：Phase/Plan/Execute

### 4.1 阶段（Phase）生命周期

GSD 的核心是把软件开发拆成**严格有序的阶段**，每个阶段有质量门控：

```
Discuss → Research → Plan → Execute → Verify → Advance
```

**PhaseRunner** (`sdk/src/phase-runner.ts`, 1164 行) 实现这个状态机：

```typescript
async run(phaseNumber: string): Promise<PhaseRunnerResult>
```

阶段顺序执行（伪代码）：

```
1. Discuss     — 捕获实施决策（可 AI self-discuss 或人工讨论）
2. Research    — 调研技术方案（可跳过 via config）
3. Research Gate — 检查 RESEARCH.md 中的 open questions
4. Plan        — 创建可执行计划
5. Plan Check  — 验证计划质量（失败则重新规划）
6. Execute     — 按波次并行执行计划
7. Verify      — 验证结果（gap closure 循环）
8. Advance     — 仅在 verify 通过后推进到下一阶段
```

### 4.2 计划（Plan）结构

每个计划是一个 Markdown 文件，包含 **YAML frontmatter + XML task 块**：

```yaml
---
name: 01-auth-01-setup
type: Execute
wave: 1          # 并行波次编号
depends_on: []  # 依赖关系（支持 DAG）
---

## 目标
实现 JWT 认证系统

## 上下文引用
- STATE.md
- REQUIREMENTS.md

## 任务

### Task 1: 安装依赖
<task name="install-deps">
执行: npm install jsonwebtoken bcryptjs
</task>

### Task 2: 创建 auth 中间件
<task name="create-middleware" depends_on="install-deps">
<execute>
编写 `src/middleware/auth.ts`，实现 JWT 验证逻辑。
</execute>
</task>
```

### 4.3 波次（Wave）并行执行

关键创新：**同一 wave 的任务并行执行，不同 wave 顺序执行**。

```typescript
// phase-runner.ts: wave 执行逻辑
const plansByWave = groupBy(waveNumber, plans);
for (const [wave, wavePlans] of Object.entries(plansByWave)) {
  await Promise.allSettled(wavePlans.map(runPlanSession));
}
```

每个 plan 由独立的 subagent 执行，拥有**全新的 200K token 上下文**。这解决了"上下文污染"问题。

---

## 5. 多智能体编排机制

### 5.1 专用智能体（25+）

| 智能体 | 文件 | 职责 |
|--------|------|------|
| gsd-executor | agents/gsd-executor.md | 计划执行 + 原子提交 |
| gsd-planner | agents/gsd-planner.md | 创建可执行计划 |
| gsd-verifier | agents/gsd-verifier.md | 目标反向验证 |
| gsd-phase-researcher | agents/gsd-phase-researcher.md | 阶段技术调研 |
| gsd-project-researcher | agents/gsd-project-researcher.md | 项目初始化调研 |
| gsd-debugger | agents/gsd-debugger.md | 调试诊断 |
| gsd-executor | agents/gsd-executor.md | ... |

### 5.2 Agent 定义格式

每个 agent 是一个 Markdown 文件，带 YAML frontmatter：

```yaml
---
name: gsd-executor
description: Executes GSD plans with atomic commits and checkpoint protocols
tools: Read, Write, Edit, Bash, Grep, Glob, mcp__context7__*
color: yellow
---

<role>
You are a GSD plan executor...
</role>

<documentation_lookup>
[如何查找库文档]
</documentation_lookup>

<project_context>
[如何加载项目上下文]
</project_context>

<execution_flow>
<step name="load_project_state">...</step>
<step name="execute_tasks">...</step>
</execution_flow>

<deviation_rules>
RULE 1: Auto-fix bugs without asking
RULE 2: Auto-add missing critical functionality
...
</deviation_rules>
```

### 5.3 工具作用域（Tool Scoping）

每个阶段只能使用特定工具集，防止 AI 越界：

```typescript
// sdk/src/tool-scoping.ts
const PHASE_DEFAULT_TOOLS: Record<PhaseType, string[]> = {
  [PhaseType.Research]: ['Read', 'Grep', 'Glob', 'Bash', 'WebSearch'],
  [PhaseType.Execute]:  ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
  [PhaseType.Verify]:   ['Read', 'Bash', 'Grep', 'Glob'],
  [PhaseType.Plan]:     ['Read', 'Write', 'Bash', 'Glob', 'Grep', 'WebFetch'],
};
```

### 5.4 Subagent 隔离与 Checkpoint

```typescript
// session-runner.ts: 使用 @anthropic-ai/claude-agent-sdk
query({
  systemPrompt: { preset: 'claude_code' },
  append: executorPrompt,
  permissionMode: 'bypassPermissions',
  allowDangerouslySkipPermissions: true,
});
```

Checkpoint 支持：subagent 可暂停/恢复，状态保存到 `.planning/`。

---

## 6. 状态管理与持久化

### 6.1 文件树

`.planning/` 目录是 GSD 的"记忆"：

```
.planning/
├── STATE.md          # 当前阶段、决策、blockers
├── ROADMAP.md        # 里程碑和成功标准
├── config.json       # 工作流配置
├── CONTEXT.md        # 实施决策
├── RESEARCH.md       # 研究发现 + open questions
├── REQUIREMENTS.md   # 可追溯需求
└── phases/
    └── 01-auth/
        ├── STATE.md
        ├── CONTEXT.md
        ├── RESEARCH.md
        ├── REQUIREMENTS.md
        └── plans/
            ├── 01-auth-01-PLAN.md
            └── 02-auth-02-PLAN.md
```

### 6.2 状态管理 CLI

所有状态操作通过 `gsd-tools.cjs`（45KB CJS 模块）执行：

```typescript
// gsd-tools.ts (SDK bridge)
export class GSDTools {
  async stateLoad(): Promise<string>
  async roadmapAnalyze(): Promise<RoadmapAnalysis>
  async phaseComplete(phase: string): Promise<string>
  async commit(message: string, files?: string[]): Promise<string>
  async initPhaseOp(phaseNumber: string): Promise<PhaseOpInfo>
  async phasePlanIndex(phaseNumber: string): Promise<PhasePlanIndex>
}
```

### 6.3 上下文截断（Context Truncation）

当上下文快满时，`context-truncation.ts` 会智能精简：

- 每个 section 保留标题 + 第一段
- 里程碑信息从 ROADMAP.md 提取

---

## 7. 开发历史演化

### 7.1 关键里程碑

| 版本 | 日期 | 重大特性 |
|------|------|----------|
| **v1.0.0** | 2025-12-14 | 初始发布，NPX 分发，slash 命令 |
| **v1.1.0** | 2025-12-15 | 预研工作流 `/gsd:research-phase` |
| **v1.3.0** | 2025-12-17 | Brownfield 支持 + `/gsd:map-codebase` |
| **v1.4.0** | 2026-01-13 | **波次并行执行** + Checkpoint |
| **v1.5.0** | 2026-01-14 | 需求可追溯性 |
| **v1.10.0** | 2026-01-26 | **Autopilot** + TUI |
| **v1.20.0** | 2026-02-27 | Codex 多智能体对齐 |
| **v1.22.0** | 2026-02-27 | 分析瘫痪防护 |
| **v1.27.0** | 2026-03-24 | **安全强化层** (提示注入检测等) |
| **v1.30.0** | 2026-03-26 | **GSD SDK** 发布 |
| **v1.33.0** | 2026-04-05 | 可查询 Intel 系统 |
| **v1.35.0** | 2026-04-10 | Cline/CodeBuddy/Qwen 支持 + TDD 模式 |

### 7.2 技术演进路径

```
Phase 1 (12月): 基础框架
  → 单文件 meta-prompt
  → 基础 slash 命令集

Phase 2 (12月底): 核心工作流
  → Pre-roadmap research
  → Brownfield (存量项目) 支持
  → 4 并行 researcher 架构

Phase 3 (1月): 并行化与状态
  → 波次并行执行
  → Checkpoint pause/resume
  → YAML frontmatter + 依赖图

Phase 4 (1-2月): 质量门控
  → 验证系统 (gsd-verifier)
  → 执行器 (gsd-executor)
  → 里程碑审计

Phase 5 (2-3月): SDK + 自主执行
  → GSD SDK (TypeScript)
  → Headless CLI
  → Autopilot 模式

Phase 6 (3-4月): 多运行时 + 安全
  → 14 种 AI 编程助手支持
  → 安全-first  enforcement
  → TDD 管道模式
```

### 7.3 开发哲学

- **Atomic commits** — 每个任务独立 commit，方便 AI 追溯
- **No enterprise theater** — 独立开发者工具，无 sprint 仪式
- **Context engineering** — 复杂性在系统，不在工作流
- **Parallel-first** — 独立任务同时运行
- **Verification at every step** — 质量门控防止失败扩散
- **Multi-runtime** — 一套系统，14 种 AI 编程工具
- **~15 commits/day** — 4 个月内 1,895 次提交

---

## 8. npx 一键分发的实现原理

### 8.1 package.json 配置

```json
{
  "name": "get-shit-done-cc",
  "version": "1.35.0",
  "bin": {
    "get-shit-done-cc": "bin/install.js"
  },
  "files": [
    "bin",
    "commands",
    "get-shit-done",
    "agents",
    "hooks",
    "scripts"
  ]
}
```

当用户运行 `npx get-shit-done-cc` 时，npm 会下载包并执行 `bin/install.js`。

### 8.2 bin/install.js — 安装器

这个文件是 GSD 分发的核心（~400 行），负责：

1. **运行时检测** — 检测用户在使用哪种 AI 编程助手
2. **安装目录选择** — 全局 (`~/.claude/`) 或本地 (`./.claude/`)
3. **文件复制** — 根据运行时类型，复制对应格式的文件

支持的运行时（14 种）：

| 运行时 | 安装目录 | 格式 |
|--------|----------|------|
| Claude Code 2.1.88+ | `~/.claude/skills/` | Skills (SKILL.md) |
| Claude Code (legacy) | `~/.claude/commands/` | Commands (.md) |
| Codex | `~/.codex/skills/` | Skills |
| Cline | `~/.cline/` | .clinerules |
| Cursor | `~/.cursor/` | Skills |
| Windsurf | `~/.windsurf/` | Skills |
| Copilot | `~/.copilot/` | Skills |
| ... | ... | ... |

### 8.3 Claude Code Skill 安装格式

```javascript
// Claude Code 2.1.88+ 使用 Skills 格式
// 安装到 ~/.claude/skills/gsd-xxx/SKILL.md
// 每个命令是独立 .md 文件
// Skills 系统会自动发现 ~/.claude/skills/ 下的 SKILL.md
```

### 8.4 Shell Hooks 的安装

Shell hooks 通过在 `~/.claude/settings.json` 中配置注入：

```json
{
  "hooks": {
    "PreToolUse": [
      "path/to/gsd-workflow-guard.js",
      "path/to/gsd-prompt-guard.js"
    ]
  }
}
```

---

## 9. 跨 AI 编程助手兼容性

### 9.1 工具映射表

不同 AI 助手使用不同工具名，GSD 建立了映射：

```javascript
// Claude Code → Copilot
const claudeToCopilotTools = {
  Read: 'read',
  Write: 'edit',
  Edit: 'edit',
  Bash: 'execute',
  Grep: 'search',
  Glob: 'search',
  Task: 'agent',
  WebSearch: 'web',
  WebFetch: 'web',
  TodoWrite: 'todo',
  AskUserQuestion: 'ask_user',
  SlashCommand: 'skill',
};
```

### 9.2 运行时兼容块

在 `execute-phase.md` 等命令文件中，使用 XML 块声明兼容性：

```markdown
<runtime_compatibility>
**Subagent spawning is runtime-specific:**
- **Claude Code:** Uses `Task(subagent_type="gsd-executor", ...)`
- **Copilot:** Sequential inline execution
- **Other runtimes:** Check for tool availability at runtime
</runtime_compatibility>
```

### 9.3 Cross-AI 执行（v1.35+）

```yaml
# workflow.frontmatter
workflow:
  cross_ai_execution: true
  cross_ai_command: "claude --print"
  cross_ai_timeout: 300
```

允许把计划执行委托给不同的 AI 运行时。

---

## 10. 插件/技能系统

### 10.1 GSD 没有传统插件系统

GSD **不是**传统的插件架构。它采用的是：

- **命令文件** (`.md`) — 定义 slash 命令
- **Agent 文件** (`.md`) — 定义 AI 行为
- **Hook 文件** (`.js/.sh`) — 拦截工具调用
- **Reference 文件** (`.md`) — 知识库

### 10.2 Agent 技能注入

在 `gsd-executor.md` 中定义了技能加载规则：

```markdown
**Project skills:** Check `.claude/skills/` or `.agents/skills/`:
1. List available skills (subdirectories)
2. Read `SKILL.md` for each skill (~130 lines index)
3. Load specific `rules/*.md` as needed
4. Do NOT load full `AGENTS.md` (100KB+ context cost)
```

### 10.3 SDK API

GSD 提供了正式的 TypeScript SDK：

```typescript
import { GSD } from '@gsd-build/sdk';

const gsd = new GSD({ projectDir: '/path/to/project' });
const result = await gsd.executePlan('.planning/phases/01-auth/01-PLAN.md');
```

SDK 导出了完整的事件系统：

```typescript
const stream = new GSDEventStream();
stream.addTransport(new CLITransport()); // 彩色 ANSI 输出
stream.addTransport(new WSTransport());  // WebSocket 广播
```

### 10.4 Hook 系统

9 个 Hook 分两类：

**JS Hooks (PreToolUse/PostToolUse):**

| Hook | 职责 |
|------|------|
| `gsd-workflow-guard.js` | 检测 GSD 工作流外的文件编辑 |
| `gsd-prompt-guard.js` | 提示注入模式检测 |
| `gsd-context-monitor.js` | 上下文窗口监控 |
| `gsd-statusline.js` | 状态行显示 |
| `gsd-read-guard.js` | 读操作守卫 |

**Shell Hooks (opt-in):**

| Hook | 职责 |
|------|------|
| `gsd-session-state.sh` | 会话持久化 |
| `gsd-validate-commit.sh` | 提交信息验证 |
| `gsd-phase-boundary.sh` | 阶段边界检查 |

---

## 11. 测试基础设施

### 11.1 测试框架策略

GSD 采用**双轨测试**：

- **Core 测试**: Node.js 内置 `node:test` + `node:assert`（不用 Jest/Vitest）
- **SDK 测试**: Vitest（TypeScript 项目标准）

> 来自 CONTRIBUTING.md:
> "All tests use Node.js built-in test runner (`node:test`) and assertion library (`node:assert`). **Do not use Jest, Mocha, Chai, or any external test framework.**"

### 11.2 测试文件位置

```
tests/                         # 200+ Core 测试 (.test.cjs)
├── helpers.cjs               # 测试辅助函数
└── *.test.cjs                # 按功能分类

sdk/src/                       # SDK 测试 (Vitest)
├── *.test.ts
├── e2e.integration.test.ts
├── init-e2e.integration.test.ts
└── lifecycle-e2e.integration.test.ts
```

### 11.3 测试辅助函数

```javascript
// tests/helpers.cjs
const { createTempProject, cleanup, runGsdTools } = require('./helpers.cjs');

describe('featureName', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempProject(); });
  afterEach(() => { cleanup(tmpDir); });

  test('handles normal case', async () => {
    const result = await runGsdTools(['state', 'load']);
    assert.equal(result.exitCode, 0);
  });
});
```

### 11.4 CI/CD

GitHub Actions (`test.yml`)：
- **矩阵**: Ubuntu + Node 22/24, macOS-latest + Node 24
- **覆盖率门控**: 70% 以上
- **命令**: `npm run test:coverage`

其他 workflow：
- `pr-gate.yml` — PR 大小标签
- `release.yml` — 发布自动化
- `security-scan.yml` — 安全扫描
- `hotfix.yml` — 热修复分支处理

---

## 12. GSD 对 mm-agent 的借鉴意义

### 12.1 可以直接借鉴的核心机制

| GSD 特性 | mm-agent 可借鉴方式 | 优先级 |
|----------|-------------------|--------|
| **Phase/Plan/Execute 模式** | 数学建模的阶段划分（问题解析→建模→求解→验证→报告） | ⭐⭐⭐ |
| **Wave 并行执行** | 模型实验中可并行的参数搜索、敏感性分析并行化 | ⭐⭐⭐ |
| **文件状态持久化** | `.planning/` → `.modeling/` 目录存放建模状态 | ⭐⭐⭐ |
| **子智能体 fresh context** | 每个建模阶段使用独立 subagent，避免上下文污染 | ⭐⭐⭐ |
| **Slash 命令分发** | 实现 `/mm-plan`, `/mm-execute`, `/mm-report` 命令 | ⭐⭐ |
| **质量门控（Verify）** | 模型验证结果需要通过门控才能推进到报告阶段 | ⭐⭐ |
| **Context truncation** | 长建模过程需要上下文截断策略 | ⭐ |

### 12.2 可参考但不完全复制

| GSD 机制 | mm-agent 的适配思路 |
|----------|-------------------|
| 25+ 专用 Agent | 精简为 4-5 个核心 Agent：modeler, solver, reviewer, reporter |
| 14 种运行时支持 | 聚焦 Claude Code + 可选的 Copilot/Cursor |
| SDK (TypeScript) | 直接使用 Claude Code Skills/Agents 体系 |
| Hook 系统 | 复用 Claude Code Hooks，不需要自研 |
| npm 分发 (`npx`) | 通过 `npx mm-agent` 分发 |

### 12.3 差异化方向

mm-agent 相比 GSD 的独特价值：

1. **数学专业性** — 符号推导、方程求解、统计检验不是通用能力
2. **LaTeX 报告生成** — 学术论文格式是强需求
3. **数值仿真集成** — Python/NumPy/SciPy 执行环境
4. **论文模板继承** — 支持 CUMCM、中文期刊等模板

### 12.4 建议的技术路线

```
mm-agent/
├── commands/
│   ├── problem-parse.md      # /mm-parse — 解析赛题
│   ├── model-plan.md        # /mm-plan — 规划建模方案
│   ├── model-execute.md     # /mm-execute — 执行建模
│   ├── model-verify.md      # /mm-verify — 验证模型
│   └── report-generate.md   # /mm-report — 生成论文
│
├── agents/
│   ├── mm-modeler.md        # 数学建模智能体
│   ├── mm-solver.md         # 数值求解智能体
│   ├── mm-reviewer.md       # 模型审查智能体
│   └── mm-reporter.md       # 报告生成智能体
│
├── templates/
│   └── cumcmthesis/         # CUMCM 论文模板
│
└── hooks/
    └── mm-context-monitor.js # 上下文监控
```

---

## 附录：关键文件索引

| 文件 | 行数 | 职责 |
|------|------|------|
| `sdk/src/phase-runner.ts` | 1164 | 阶段生命周期状态机 |
| `agents/gsd-executor.md` | ~610 | 主执行智能体定义 |
| `bin/install.js` | ~400 | CLI 入口 + 多运行时安装器 |
| `sdk/src/session-runner.ts` | ~200 | SDK subagent query 编排 |
| `sdk/src/plan-parser.ts` | ~427 | PLAN.md 解析器 |
| `sdk/src/index.ts` | ~285 | GSD 主类 API |
| `get-shit-done/bin/gsd-tools.cjs` | ~1000 | 状态管理 CLI |
| `hooks/gsd-workflow-guard.js` | ~97 | 工作流守卫 |

---

*报告生成时间: 2026-04-12*
*数据来源: 4 个并行 agent 深度调研 + 1895 次提交历史分析*
