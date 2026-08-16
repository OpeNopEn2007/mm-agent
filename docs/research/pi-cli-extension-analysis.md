# Pi CLI Extension 调研报告

> 调研日期：2026-06-15  
> 本机验证：Windows / PowerShell 7.6.2 / Node.js v24.8.0 / npm 11.9.0  
> 目标：为 `mm-agent v1.0.0` 的 Pi CLI Extension + MM-Agent Harness 建立工程事实

---

## 1. 结论摘要

Pi CLI 可以作为 `mm-agent v1.x` 的执行底座。它的价值不是替我们完成 MM-Agent，而是提供一个足够薄、足够透明、可通过 TypeScript extension 扩展的 agent harness。

对本项目最关键的结论：

| 结论 | 置信度 | 判断 |
|------|--------|------|
| Pi CLI 官方 npm 包是 `@earendil-works/pi-coding-agent`，bin 为 `pi`。 | High | 采用 |
| Pi Extension 是 TypeScript 模块，可注册 tools、commands、flags、事件 hook、UI 和资源发现。 | High | 采用 |
| Pi Package 可通过 npm/git/local path 分发 extension、skills、prompts、themes。 | High | 采用 |
| Project-local `.pi/` 资源需要 trust；`AGENTS.md` / `CLAUDE.md` 不受 project trust 限制。 | High | 采用 |
| Pi 没有内建 sandbox；extension 和工具以启动用户权限运行。 | High | 采用并约束 |
| v1 不需要自研 TUI 或 Pi SDK runtime；Extension + 本地 artifacts 足够先跑闭环。 | Medium | 采用 |
| `oh-pi`、`pi-mcp-adapter`、`pi-subagents`、`pi-goals` 可作为生态参考，但不应成为 v1 必需依赖。 | Medium | 观察 |

`v1.0.0` 的合理路径是：先做一个 Pi package，提供一个 MM-Agent coordinator extension、少量命令、必要的 tools，以及复用现有 `knowledge/`、`prompts/`、`scripts/`、`templates/` 的 artifact 协议。

---

## 2. 本机安装验证

### 2.1 安装前状态

本机初始状态：

```text
Get-Command pi -> 未找到
node --version -> v24.8.0
npm --version -> 11.9.0
pnpm --version -> 10.17.0
```

官方 npm 元数据：

```json
{
  "name": "@earendil-works/pi-coding-agent",
  "version": "0.79.4",
  "bin": { "pi": "dist/cli.js" },
  "engines": { "node": ">=22.19.0" }
}
```

本机 Node 版本满足 Pi CLI 要求。

### 2.2 安装过程

直接安装到当前 npm global prefix 失败：

```text
npm install -g @earendil-works/pi-coding-agent@0.79.4 --ignore-scripts
EPERM: operation not permitted, mkdir 'E:\Study\Tools\Node.js\node_global\node_modules\@earendil-works'
```

原因是 `E:\Study\Tools\Node.js\node_global\node_modules` 属主为 `BUILTIN\Administrators`，普通用户只有读执行权限。

采用用户级 prefix 安装成功：

```powershell
$prefix = Join-Path $env:APPDATA 'npm'
npm install -g @earendil-works/pi-coding-agent@0.79.4 --ignore-scripts --prefix "$prefix"
```

`C:\Users\OpeNopEn\AppData\Roaming\npm` 已在 PATH 中，因此安装后 `pi` 可直接解析。

### 2.3 验证结果

```text
Get-Command pi -> C:\Users\OpeNopEn\AppData\Roaming\npm\pi.ps1
pi --version -> 0.79.4
pi --help -> 正常输出 CLI 帮助
pi list -> No packages installed.
```

`pi --help` 显示核心能力：

- `pi install/remove/update/list/config`
- `--extension`
- `--skill`
- `--prompt-template`
- `--no-context-files`
- `--approve` / `--no-approve`
- `--offline`
- `--no-session`
- `--session-dir`
- 内置工具：`read`、`bash`、`edit`、`write`、`grep`、`find`、`ls`

运行 `pi list` 后，本机生成了用户级目录：

```text
~/.pi/agent/
├── auth.json
└── sessions/
```

没有在当前仓库生成 `.pi/`：

```text
Test-Path .pi -> False
git status --short --branch -> main...origin/main [ahead 1]
```

---

## 3. 官方资料来源

| 来源 | 用途 |
|------|------|
| [Pi monorepo README](https://github.com/earendil-works/pi) | 包名、monorepo 结构、权限模型总览 |
| [quickstart.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/quickstart.md) | 安装、认证、内置工具、上下文文件 |
| [extensions.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md) | Extension API、事件、工具、命令、资源发现 |
| [packages.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md) | Pi package 分发、安装、资源声明 |
| [skills.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md) | Agent Skills 标准与 Pi 加载规则 |
| [prompt-templates.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/prompt-templates.md) | Prompt 模板机制 |
| [settings.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/settings.md) | 全局/项目设置、trust、sessionDir、资源路径 |
| [security.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md) | 无内建 sandbox、project trust 边界 |
| [windows.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/windows.md) | Windows bash shell 要求 |
| [examples/extensions](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions) | 可运行 extension 示例 |

---

## 4. Pi CLI 是什么

Pi monorepo 包含三个核心层：

| 包 | 职责 |
|----|------|
| `@earendil-works/pi-coding-agent` | 交互式 coding agent CLI，提供 `pi` 命令 |
| `@earendil-works/pi-agent-core` | agent runtime、tool calling、状态管理 |
| `@earendil-works/pi-ai` | 多 provider LLM API |
| `@earendil-works/pi-tui` | 终端 UI 库 |

`mm-agent v1` 应直接面向 `@earendil-works/pi-coding-agent` 的 extension/package 机制，而不是直接基于 `pi-agent-core` 或 `pi-tui` 做 runtime。后者更适合未来大版本。

Pi 默认工作方式：

- 在当前工作目录运行。
- 可读取 `AGENTS.md` / `CLAUDE.md` 作为上下文文件。
- 默认给模型 `read`、`write`、`edit`、`bash` 四个工具。
- `grep`、`find`、`ls` 是可启用的只读工具。
- session 自动保存到 `~/.pi/agent/sessions/`，可 `/resume`、`/tree`、`/fork`、`/compact`。

---

## 5. Extension 机制

Pi Extension 是 TypeScript 模块，默认导出一个接收 `ExtensionAPI` 的函数：

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("hello", {
    description: "Say hello",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Hello", "info");
    },
  });
}
```

Extension 可做的事情：

| 能力 | 对 mm-agent 的意义 |
|------|-------------------|
| `registerCommand()` | 提供 `/mm-agent`、`/mm-feedback`、`/mm-status` 等入口 |
| `registerTool()` | 暴露 deterministic local tools，如创建 case、写 artifact、编译 LaTeX |
| `on("tool_call")` | 做权限/路径保护，阻止写入不该写的地方 |
| `on("before_agent_start")` | 注入当前 Case 上下文、阶段状态、artifact 摘要 |
| `on("resources_discover")` | 动态加载项目 skills、prompts、themes |
| `appendEntry()` | 把 extension 状态写入 session branch，支持 `/tree` 和恢复 |
| `ctx.ui.*` | 在 TUI 中提示、确认、展示状态 |

Extension 位置：

| 位置 | 作用 |
|------|------|
| `~/.pi/agent/extensions/*.ts` | 全局 extension |
| `~/.pi/agent/extensions/*/index.ts` | 全局目录式 extension |
| `.pi/extensions/*.ts` | 项目 extension，需 trust |
| `.pi/extensions/*/index.ts` | 项目目录式 extension，需 trust |
| `pi -e ./path.ts` | 临时加载，适合实验 |

对 `mm-agent` 来说，v1 不应把项目运行过程藏在用户全局 extension 中。更好的分发形态是 Pi package：安装后提供 extension、skills、prompts，并由项目或用户显式启用。

---

## 6. Pi Package 机制

Pi package 可通过 npm、git 或 local path 安装：

```bash
pi install npm:@scope/pkg@1.0.0
pi install git:github.com/user/repo@v1
pi install ./relative/path/to/package
```

默认写入用户设置 `~/.pi/agent/settings.json`；加 `-l` 写入项目设置 `.pi/settings.json`。项目设置可共享，但会触发 project trust。

Package 可在 `package.json` 里声明资源：

```json
{
  "name": "mm-agent-pi",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

如果没有 `pi` manifest，Pi 会按约定目录发现：

- `extensions/`
- `skills/`
- `prompts/`
- `themes/`

v1 建议采用显式 `pi` manifest，减少目录猜测。

---

## 7. Skills 与 Prompt Templates

Pi 支持 Agent Skills 标准，并使用 progressive disclosure：

1. 启动时扫描 skill 名称和描述。
2. 系统提示只放可用 skill 摘要。
3. 任务匹配时，agent 读取完整 `SKILL.md`。
4. 相对路径用于引用 scripts、references、assets。

Skill 来源包括：

- `~/.pi/agent/skills/`
- `~/.agents/skills/`
- `.pi/skills/`
- `.agents/skills/`
- package `skills/`
- settings `skills`
- CLI `--skill`

Prompt template 是 Markdown 片段，可通过 `/name` 调用，支持 `$1`、`$@`、默认值和参数提示。v1 可以用 prompt template 提供高层入口，但核心流水线不应只靠 prompt template 驱动。

建议：

- 用 Extension 承担编排和 artifact 纪律。
- 用 Skills 承担阶段说明和操作准则。
- 用 Prompt Templates 承担快捷入口。
- 用本地 scripts 承担确定性执行。

---

## 8. Trust 与安全边界

Pi 的 project trust 是资源加载保护，不是 sandbox。

需要 trust 的项目资源：

- `.pi/settings.json`
- `.pi/extensions`
- `.pi/skills`
- `.pi/prompts`
- `.pi/themes`
- `.pi/SYSTEM.md`
- `.pi/APPEND_SYSTEM.md`
- 项目 `.agents/skills`

不受 project trust 限制的上下文：

- `AGENTS.md`
- `CLAUDE.md`

Pi 没有内建 sandbox。内置工具和 extension 以启动 Pi 的用户权限运行，可读写文件、执行 shell、访问环境变量和本地凭据。

对本项目的约束：

- v1 默认不能假设 Pi 会保护项目安全。
- MM-Agent Extension 必须自己约束写入路径，只允许写入 `runs/<case-id>/` 和明确的项目资产。
- 涉及 `.env`、密钥、`node_modules/`、`.git/`、`.archived/` 等路径时应拒绝或要求确认。
- 长时间无人值守运行应留到后续版本，或明确建议容器/沙箱。

---

## 9. Windows 兼容性

官方 Windows 文档要求 Pi 在 Windows 上需要 bash shell。查找顺序：

1. `~/.pi/agent/settings.json` 中的 `shellPath`
2. Git Bash：`C:\Program Files\Git\bin\bash.exe`
3. PATH 上的 `bash.exe`

本机 PATH 中已有 Git 相关路径，但后续实现前仍应运行：

```powershell
where.exe bash
```

本轮验证结果：

```text
C:\Windows\System32\bash.exe
E:\Study\AI\Git\bin\bash.exe
C:\Users\OpeNopEn\AppData\Local\Microsoft\WindowsApps\bash.exe
```

这里存在一个需要注意的点：PATH 上第一个 `bash.exe` 是 Windows/WSL 入口，而 Git Bash 位于第二位。官方文档会优先检查常规 Git Bash 路径 `C:\Program Files\Git\bin\bash.exe`，但本机 Git 安装在 `E:\Study\AI\Git\bin\bash.exe`，不在官方默认路径。

因此，正式运行 Harness 前建议在 `~/.pi/agent/settings.json` 显式配置：

```json
{
  "shellPath": "E:\\Study\\AI\\Git\\bin\\bash.exe"
}
```

这属于用户级环境配置，不应写入仓库。

---

## 10. Extension 示例对 v1 的启发

官方 examples 中，以下示例对本项目最有价值：

| 示例 | 可借鉴点 |
|------|----------|
| `dynamic-resources/` | 用 `resources_discover` 动态加载 skills、prompts、themes |
| `todo.ts` | 用 `appendEntry()` 将状态持久化到 session branch |
| `tools.ts` | 用 `setActiveTools()` 管理可用工具 |
| `permission-gate.ts` / `protected-paths.ts` | 做路径和危险命令保护 |
| `plan-mode/` | 读写工具切换、阶段进度展示、flag/command 组合 |
| `subagent/` | 通过独立 `pi` 进程实现隔离上下文和并发任务 |
| `handoff.ts` | 从 session branch 生成自包含 handoff prompt |
| `structured-output.ts` | 让工具返回终止信号，适合最终报告产物交付 |

v1 最应该先借鉴的是：

- resources discovery
- custom command
- custom tools
- path guard
- state persistence

v1 暂缓：

- overlay UI
- game/UI demo
- custom provider
- subagent 并发
- 自定义 compaction

---

## 11. 生态包分析

| 包 | 当前版本 | 描述 | 建议 |
|----|----------|------|------|
| `oh-pi` | `0.1.85` | Pi 一键配置工具，类似 oh-my-zsh for pi | 观察，不纳入 v1 必需依赖 |
| `pi-mcp-adapter` | `2.10.0` | MCP adapter extension | 观察，可作为后续 MCP 接入参考 |
| `pi-subagents` | `0.28.0` | subagents、chains、parallel execution | 暂缓，v1 先跑单主线闭环 |
| `pi-goals` | `0.5.1` | 持久 goal tracking、budgets、churn monitoring | 观察，后续监督迭代机制可参考 |

这些包体现 Pi 生态的组合能力，但 v1 不应依赖它们才能启动。`mm-agent` 应先拥有自己的最小 Harness，再决定是否吸收生态包能力。

---

## 12. 与 MM-Agent 四阶段的映射

| MM-Agent 阶段 | Pi v1 承载方式 |
|---------------|----------------|
| Problem Analysis | `/mm-agent` 命令创建 Case；读取赛题；写入 `runs/<case-id>/analysis/` artifacts |
| Mathematical Modeling | Extension 注入 HMML 检索结果；阶段 skill 指导 Actor-Critic 迭代；写入模型方案 |
| Computational Solving | custom tools 调用本地 scripts，执行代码、保存 stdout/stderr、图表和数据结果 |
| Solution Reporting | custom tool 生成 LaTeX；调用 TeX 编译；失败时记录 repair loop；最终产出 PDF |

关键原则：

- Pi 提供 agent loop，不提供数学建模流程。
- 本项目提供 Harness、artifact 协议、阶段控制和报告终点。
- 每个阶段必须把结果写到 `runs/<case-id>/`，不能只留在 Pi session 中。

---

## 13. v1 Harness 可行方案

建议 v1 最小结构：

```text
mm-agent/
├── package.json          # Pi package manifest
├── extensions/
│   └── mm-agent.ts       # coordinator extension
├── skills/
│   └── mm-agent/
│       └── SKILL.md      # 阶段工作流说明
├── prompts/
│   └── mm-agent.md       # 快捷入口模板
├── scripts/              # 复用现有确定性工具
├── templates/            # LaTeX 模板
└── runs/                 # Case 运行产物，gitignored
```

最小命令面：

| 命令 | 作用 |
|------|------|
| `/mm-agent <problem-file>` | 创建并运行一个 Case |
| `/mm-status [case-id]` | 查看 Case 阶段状态 |
| `/mm-feedback <case-id>` | 记录人类反馈 |

最小 tools：

| Tool | 作用 |
|------|------|
| `mm_create_case` | 创建 `runs/<case-id>/` 目录和 metadata |
| `mm_write_artifact` | 写阶段 artifacts |
| `mm_read_artifact` | 读取阶段 artifacts |
| `mm_run_solver` | 调用本地求解脚本 |
| `mm_compile_latex` | 编译 LaTeX 并返回错误摘要 |
| `mm_record_feedback` | 记录人类监督反馈 |

这些名字只是研究建议，正式接口应在实现计划中再固定。

---

## 14. 风险与未知项

| 风险 | 影响 | 处理 |
|------|------|------|
| Pi extension API 活跃变化 | v1 代码可能跟随版本调整 | 固定 `@earendil-works/pi-coding-agent@0.79.4` 开发 |
| Windows bash 路径不稳定 | `bash` tool 或 shell 命令失败 | 实现前验证 `where.exe bash`，必要时记录用户级 `shellPath` |
| Project `.pi/` 是否入库 | 影响 trust 和团队共享 | v1 初期优先 Pi package，不把运行状态放 `.pi/` |
| 无内建 sandbox | 工具误写风险 | Extension 做路径白名单与危险命令保护 |
| 生态包质量未知 | 引入额外复杂度 | v1 不把生态包作为必需依赖 |
| LaTeX 编译失败循环复杂 | 最终产物不可用 | `mm_compile_latex` 必须结构化返回日志和错误摘要 |

---

## 15. 对当前项目的建议

采用：

- 固定 Pi CLI 版本 `0.79.4` 开始 v1 开发。
- 在本机显式配置 Pi 的 `shellPath` 指向 Git Bash，避免误用 WSL bash。
- 使用 Pi package 形式组织 extension、skills、prompts。
- 使用 Extension 管编排，tools 管确定性动作，skills/prompts 管说明和入口。
- `runs/<case-id>/` 作为唯一 Case artifact 目录。
- 保持 `AGENTS.md` / `CLAUDE.md` 作为跨 agent 入口。

观察：

- `pi-goals` 的 goal/budget/churn 思路，可作为后续监督迭代参考。
- `pi-subagents` 的并发/链式执行，可作为四阶段质量提升后的扩展。
- `pi-mcp-adapter` 可作为后续外部工具接入参考。

暂缓：

- Pi SDK runtime。
- 自定义 TUI。
- 自定义 provider。
- 大规模 subagent 并行。

不采用：

- 把旧 Claude/Codex 插件结构迁回主线。
- 把 Pi session 当作唯一项目记忆。
- 把 `.pi/` 运行产物混进仓库上下文。

---

## 16. 下一步验证任务

1. 验证 Windows bash 解析：

   ```powershell
   where.exe bash
   ```

2. 用最小临时 extension 验证：

   ```powershell
   pi -e <temp-extension> --no-session --offline --help
   ```

3. 设计正式 v1 package 结构。
4. 固定 `/mm-agent` 命令和 tool I/O。
5. 跑一个最小 Case，不追求质量，只验证 artifact 和 PDF 闭环。
