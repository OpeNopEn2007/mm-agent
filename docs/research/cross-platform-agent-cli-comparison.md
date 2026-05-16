# 跨平台 Agent CLI 插件系统对比报告

> 调研日期：2026-05-15
> 目标：为 mm-agent 跨平台适配提供技术参考

---

## 1. 平台总览

| 平台 | 插件/Skill 系统 | Hook 系统 | 子代理系统 | 成熟度 |
|------|----------------|-----------|-----------|--------|
| **Claude Code** | `.claude-plugin/plugin.json` + SKILL.md | 3 事件 | Agent tool (命名 subagent) | ★★★★★ |
| **OpenAI Codex CLI** | `.codex-plugin/plugin.json` + SKILL.md | 6 事件 | spawn_agent/wait_agent/close_agent | ★★★★★ |
| **Gemini CLI** | `gemini-extension.json` + SKILL.md | 11 事件 | invoke_agent + A2A 协议 | ★★★★☆ |
| **GitHub Copilot CLI** | Agent Skills 标准 + SKILL.md | 8 事件 | 6 个内置 agent | ★★★★☆ |
| **OpenCode / Crush** | crush.json + SKILL.md | 初步支持 | agent tool | ★★★☆☆ |
| **Cursor** | `.cursor/rules/` + MCP | 无 | 无自定义 agent | ★★☆☆☆ |
| **DeepSeek TUI** | **不存在** | N/A | N/A | ★☆☆☆☆ |

**结论：** DeepSeek 无 CLI 工具，从调研范围中剔除。Cursor 无 hooks/agent 系统，适配价值有限。重点适配 Codex、Gemini、Copilot CLI、OpenCode/Crush 四个平台。

---

## 2. Skill/Plugin 发现与加载

### 2.1 Skill 文件格式

所有支持 Skill 的平台均使用 **SKILL.md** 文件 + YAML frontmatter：

```yaml
---
name: skill-name
description: 一行描述（用于自动匹配用户意图）
---
# Skill 标题
自然语言指令...
```

| 平台 | Skill 目录 | 分发格式 | 加载策略 |
|------|-----------|---------|---------|
| **Claude Code** | `skills/<name>/SKILL.md` | `.claude-plugin/plugin.json` | 全量加载 |
| **Codex CLI** | `.agents/skills/<name>/SKILL.md` | `.codex-plugin/plugin.json` | Progressive disclosure（仅 name+desc 初始加载，按需展开全文） |
| **Gemini CLI** | `.agents/skills/<name>/SKILL.md` | `gemini-extension.json` | activate_skill 按需加载 |
| **Copilot CLI** | `.github/skills/<name>/SKILL.md` | Agent Skills 标准 | description 自动匹配 + `/skill-name` 强制调用 |
| **OpenCode/Crush** | `.crush/skills/<name>/SKILL.md` | crush.json plugin 数组 | native `skill` 工具加载 |

### 2.2 Skill 发现路径（优先级从低到高）

| 平台 | 路径 |
|------|------|
| **Claude Code** | 项目 `skills/` → 插件注册 |
| **Codex CLI** | `$CWD/.agents/skills` → 向上扫描到 repo root → `$HOME/.agents/skills` → `/etc/codex/skills` → 内置 |
| **Gemini CLI** | 内置 → 扩展 → 用户 skills → 用户 agent skills → 工作区 skills → 工作区 agent skills |
| **Copilot CLI** | `.github/skills/` → `.claude/skills/` → `.agents/skills/` → `~/.copilot/skills/` → `~/.agents/skills/` |
| **OpenCode/Crush** | `~/.config/crush/skills/` → `.crush/skills` → `.claude/skills/` → `$CRUSH_SKILLS_DIR` |

### 2.3 关键发现

**Agent Skills 标准（agentskills.io）** 是一个新兴的跨平台标准，Copilot CLI 和 Crush 已采用。核心约定：
- 目录结构：`<name>/SKILL.md`（必需）+ `scripts/` + `references/` + `assets/`（可选）
- Frontmatter：`name`（必需）、`description`（必需）、`allowed-tools`（可选）
- 发现：从约定路径扫描

---

## 3. 工具系统对比

### 3.1 核心工具名映射

| 功能 | Claude Code | Codex CLI | Gemini CLI | Copilot CLI | OpenCode/Crush |
|------|------------|-----------|------------|-------------|---------------|
| 文件读取 | `Read` | 原生文件工具 | `read_file` | `view` | `view` |
| 文件写入 | `Write` | 原生文件工具 | `write_file` | `create` | `write` |
| 文件编辑 | `Edit` | `apply_patch` | `edit` / `replace` | `edit` | `edit` / `patch` |
| Shell 执行 | `Bash` | `shell` / `unified_exec` | `run_shell_command` | `bash` | `bash` |
| 内容搜索 | `Grep` | 通过 shell | `grep_search` | 通过 bash | `grep` |
| 文件查找 | `Glob` | 通过 shell | `glob` | 通过 bash | `glob` |
| 目录列表 | `Bash` (ls) | 通过 shell | `list_directory` | 通过 bash | `ls` |
| Web 搜索 | `WebSearch` | `web_search` | `google_web_search` | 无内置 | `fetch` |
| Web 抓取 | `WebFetch` | 通过 MCP | `web_fetch` | `web_fetch` | `fetch` |
| 任务跟踪 | `TodoWrite` | `update_plan` | `write_todos` | 通过 sql/内置 | 无 |
| Skill 调用 | `Skill` 工具 | 原生加载 | `activate_skill` | `skill` 工具 | `skill` 工具 |
| 子代理 | `Agent` 工具 | `spawn_agent` | `invoke_agent` / `@agent` | `task` 工具 | `agent` 工具 |

### 3.2 子代理系统对比

| 平台 | 调用方式 | 并发控制 | 嵌套深度 | 特殊能力 |
|------|---------|---------|---------|---------|
| **Claude Code** | `Agent` tool + `subagent_type` | 无显式限制 | 1 层 | worktree 隔离、background 模式 |
| **Codex CLI** | `spawn_agent` → `wait_agent` → `close_agent` | `max_threads=6` | `max_depth=1` | **CSV 批量处理**（spawn_agents_on_csv） |
| **Gemini CLI** | `invoke_agent` 工具 / `@agent-name` | agent-scheduler 调度 | 可配置 | **A2A 协议**（agent-to-agent 通信） |
| **Copilot CLI** | `task` 工具 + `agent_type` | 无显式限制 | 1 层 | 6 个内置 agent 类型 |
| **OpenCode/Crush** | `agent` 工具 | 无显式限制 | 1 层 | 子任务委托 |

---

## 4. Hook/生命周期系统

### 4.1 Hook 事件对比

| 事件 | Claude Code | Codex CLI | Gemini CLI | Copilot CLI |
|------|------------|-----------|------------|-------------|
| 会话启动 | `SessionStart` | `SessionStart` | `SessionStart` | `sessionStart` |
| 会话结束 | - | - | `SessionEnd` | `sessionEnd` |
| 工具执行前 | `PreToolUse` | `PreToolUse` | `BeforeTool` | `preToolUse` |
| 工具执行后 | `PostToolUse` | `PostToolUse` | `AfterTool` | `postToolUse` |
| 权限请求 | - | `PermissionRequest` | - | - |
| Agent 启动前 | - | - | `BeforeAgent` | - |
| Agent 结束后 | - | - | `AfterAgent` | `agentStop` |
| 模型调用前 | - | - | `BeforeModel` | - |
| 模型选择 | - | - | `BeforeToolSelection` | - |
| 模型调用后 | - | - | `AfterModel` | - |
| 用户提交 | - | `UserPromptSubmit` | - | `userPromptSubmitted` |
| 停止 | `Stop` | `Stop` | - | - |
| 通知 | - | - | `Notification` | - |
| 上下文压缩 | - | - | `PreCompress` | - |
| 错误发生 | - | - | - | `errorOccurred` |
| 子 Agent 停止 | - | - | - | `subagentStop` |

**Gemini CLI 的 hook 最丰富**（11 个事件），覆盖 Agent/Model/Tool/Session 全生命周期。

### 4.2 Hook 格式

| 平台 | 配置位置 | 格式 | 阻断能力 |
|------|---------|------|---------|
| **Claude Code** | `hooks/hooks.json` | JSON + bash 脚本 | PreToolUse 可拒绝 |
| **Codex CLI** | `~/.codex/hooks.json` 或 `config.toml` | JSON + command | PreToolUse 可拒绝，Stop 可强制继续 |
| **Gemini CLI** | `settings.json` 的 hooks 对象 | JSON + stdin/stdout JSON | BeforeTool 可阻断（exit code 2） |
| **Copilot CLI** | `.github/hooks/*.json` | JSON + bash/powershell | preToolUse 可批准/拒绝 |

---

## 5. 配置文件对比

### 5.1 项目级配置

| 平台 | 指令文件 | 插件配置 | MCP 配置 |
|------|---------|---------|---------|
| **Claude Code** | `CLAUDE.md` | `.claude-plugin/plugin.json` | `.mcp.json` |
| **Codex CLI** | `AGENTS.md` | `.codex-plugin/plugin.json` | `config.toml` 的 `mcp_servers` |
| **Gemini CLI** | `GEMINI.md` | `gemini-extension.json` | `settings.json` 的 `mcpServers` |
| **Copilot CLI** | `AGENTS.md` / `.github/copilot-instructions.md` | Agent Skills 目录 | `~/.copilot/mcp-config.json` |
| **OpenCode/Crush** | `.opencode/commands/*.md` | `crush.json` 的 plugin 数组 | `crush.json` 的 `mcpServers` |
| **Cursor** | `.cursor/rules/*.md` | 无 | `.cursor/mcp.json` |

### 5.2 用户级配置

| 平台 | 配置文件路径 |
|------|------------|
| **Claude Code** | `~/.claude/settings.json` |
| **Codex CLI** | `~/.codex/config.toml` |
| **Gemini CLI** | `~/.gemini/settings.json` |
| **Copilot CLI** | `~/.copilot/settings.json` |
| **OpenCode/Crush** | `$HOME/.crush.json` 或 `$XDG_CONFIG_HOME/crush/crush.json` |
| **Cursor** | `~/.cursor/permissions.json` + Settings UI |

---

## 6. mm-agent 适配可行性评估

### 6.1 当前 Claude Code 组件分析

mm-agent 的 Claude Code 特定组件：

| 组件 | 当前实现 | 跨平台挑战 |
|------|---------|-----------|
| `.claude-plugin/plugin.json` | 插件元数据 | 需为每个平台生成对应 manifest |
| `skills/mm-agent/SKILL.md` | 自然语言指令 | **可复用**，所有平台均支持 SKILL.md |
| `agents/*.md` | Agent 定义 | 格式基本兼容，调用方式不同 |
| `hooks/hooks.json` | 3 个 hook | 事件名和格式需适配 |
| `hooks/session-start` | SessionStart 脚本 | 可复用，输出格式需适配 |
| `$ARGUMENTS` | SKILL 参数传递 | 平台特定，需统一处理 |

### 6.2 平台适配矩阵

| 维度 | Codex CLI | Gemini CLI | Copilot CLI | OpenCode/Crush |
|------|-----------|------------|-------------|---------------|
| Skill 格式 | ✅ 完全兼容 | ✅ 完全兼容 | ✅ 完全兼容 | ✅ 完全兼容 |
| Hook 系统 | ✅ 6 事件 | ✅ 11 事件 | ✅ 8 事件 | ⚠️ 初步支持 |
| 子代理调用 | ✅ spawn_agent | ✅ invoke_agent | ✅ task 工具 | ✅ agent 工具 |
| 插件分发 | ✅ .codex-plugin | ✅ gemini-extension | ✅ Agent Skills | ✅ crush.json |
| MCP 支持 | ✅ | ✅ | ✅ | ✅ |
| 难度 | ★★☆ | ★★☆ | ★★☆ | ★★★ |

### 6.3 适配方案

#### 方案 A：superpowers 模式（推荐）

参考 superpowers 的跨平台架构：

```
mm-agent/
├── skills/mm-agent/
│   ├── SKILL.md              # 通用指令（使用 Claude Code 工具名）
│   └── references/
│       ├── codex-tools.md    # Codex 工具映射表
│       ├── gemini-tools.md   # Gemini 工具映射表
│       └── copilot-tools.md  # Copilot 工具映射表
├── CLAUDE.md                 # Claude Code 入口
├── AGENTS.md → CLAUDE.md     # Codex/Copilot 入口（符号链接）
├── GEMINI.md                 # Gemini 入口（引用 SKILL.md + gemini-tools.md）
├── .claude-plugin/           # Claude Code manifest
├── .codex-plugin/            # Codex manifest
├── gemini-extension.json     # Gemini manifest
├── hooks/
│   ├── hooks.json            # Claude Code hooks
│   ├── codex-hooks.json      # Codex hooks（事件名适配）
│   └── gemini-hooks.json     # Gemini hooks
└── scripts/                  # 跨平台 Python 脚本
```

**核心原则：**
1. SKILL.md 使用 Claude Code 工具名作为规范名
2. 每个平台一个 `references/*-tools.md` 映射表
3. 入口文件（CLAUDE.md / AGENTS.md / GEMINI.md）引用 SKILL.md + 映射表
4. Hook 文件分别维护（事件名不同）
5. Python 脚本完全跨平台（不依赖特定 CLI 工具）

#### 方案 B：Agent Skills 标准

采用 agentskills.io 标准，只维护一份 SKILL.md，各平台自动发现：

```
mm-agent/
├── skills/mm-agent/
│   ├── SKILL.md              # Agent Skills 标准格式
│   ├── scripts/              # 工具脚本
│   └── references/           # 平台映射参考
└── .agents/
    └── skills/
        └── mm-agent → ../../skills/mm-agent  # 符号链接
```

**优势：** 更简洁，Copilot/Crush 原生支持。
**劣势：** Claude Code / Codex 的 hook 和 plugin manifest 仍需单独维护。

### 6.4 推荐适配优先级

| 优先级 | 平台 | 理由 |
|--------|------|------|
| **P0** | Claude Code | 当前已完成，作为基准 |
| **P1** | OpenAI Codex CLI | 用户量大，插件系统最完善，SKILL.md 完全兼容 |
| **P1** | GitHub Copilot CLI | 原生支持 Agent Skills 标准，hook 系统完善 |
| **P2** | Gemini CLI | hook 最丰富，但用户量相对较小 |
| **P3** | OpenCode/Crush | 插件系统较新，用户量小 |
| **不做** | Cursor | 无 hook/agent 系统，只能通过 MCP 提供部分能力 |
| **不做** | DeepSeek TUI | 不存在 CLI 工具 |

---

## 7. 工具映射表（供适配使用）

### Claude Code → Codex CLI

```
Read      → 原生文件工具
Write     → 原生文件工具
Edit      → apply_patch
Bash      → shell
Agent     → spawn_agent + wait_agent
TodoWrite → update_plan
Skill     → 原生加载（跟随 SKILL.md 指令即可）
```

### Claude Code → Gemini CLI

```
Read        → read_file
Write       → write_file
Edit        → edit / replace
Bash        → run_shell_command
Grep        → grep_search
Glob        → glob
Agent       → invoke_agent / @generalist
TodoWrite   → write_todos
Skill       → activate_skill
WebSearch   → google_web_search
WebFetch    → web_fetch
```

### Claude Code → Copilot CLI

```
Read      → view
Write     → create
Edit      → edit
Bash      → bash
Grep      → grep（通过 bash）
Glob      → glob（通过 bash）
Agent     → task (agent_type: "general-purpose")
Skill     → skill 工具
```

### Claude Code → OpenCode/Crush

```
Read      → view
Write     → write
Edit      → edit / patch
Bash      → bash
Grep      → grep
Glob      → glob
Agent     → agent
Skill     → skill 工具
```

---

## 8. 待验证信息

以下信息来源于 superpowers 参考文件，需在实际适配时验证：

| 信息 | 来源 | 验证方式 |
|------|------|---------|
| Codex `spawn_agent` 需 `features.multi_agent = true` | superpowers codex-tools.md | 测试默认配置 |
| Gemini `@generalist` 可替代所有命名 agent | superpowers gemini-tools.md | 测试具体 agent 调用 |
| Copilot CLI `sql` 工具用于 todo 管理 | superpowers copilot-tools.md | 本次调研未找到官方文档支持 |
| Crush hook 系统完整度 | OpenCode 调研 | 需实际测试 |
| 各平台 `$ARGUMENTS` 传递方式 | 未调研 | 需逐平台测试 |

---

## 9. 参考资料

- [superpowers 跨平台实现](https://github.com/obra/superpowers) — 最成熟的跨平台 Agent 插件
- [Agent Skills 标准](https://agentskills.io) — 新兴跨平台 skill 标准
- [OpenAI Codex 文档](https://developers.openai.com/codex) — Codex CLI 官方文档
- [Gemini CLI 仓库](https://github.com/google-gemini/gemini-cli) — Gemini CLI 源码
- [GitHub Copilot CLI 文档](https://docs.github.com/copilot/concepts/agents/about-copilot-cli) — Copilot CLI 官方文档
- [OpenCode 仓库](https://github.com/opencode-ai/opencode) — 已归档，后续为 Crush
- [Crush 仓库](https://github.com/charmbracelet/crush) — OpenCode 继任者
