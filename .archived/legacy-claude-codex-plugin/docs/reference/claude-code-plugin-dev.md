# Claude Code 插件开发指南

> Claude Code 插件系统的完整开发指南，包括架构、开发规范、工具声明、子智能体机制、权限系统和分发机制。

## 目录

1. [概述](#概述)
2. [快速开始](#快速开始)
3. [插件结构](#插件结构)
4. [插件清单](#插件清单)
5. [Skills 开发](#skills-开发)
6. [Sub-agents 开发](#sub-agents-开发)
7. [Agent Teams](#agent-teams)
8. [Hooks 系统](#hooks-系统)
9. [工具与权限](#工具与权限)
10. [MCP/LSP 服务器](#mcplsp-服务器)
11. [插件市场与分发](#插件市场与分发)
12. [调试与故障排除](#调试与故障排除)
13. [实践案例](#实践案例)

---

## 概述

### 插件 vs 独立配置

| 方法 | Skill 名称 | 最适合 |
|------|-----------|--------|
| **独立** (`.claude/`) | `/hello` | 个人工作流、快速实验 |
| **插件** (含 `plugin.json`) | `/plugin:hello` | 团队共享、社区分发、版本控制 |

**何时使用插件：**
- 与团队或社区共享功能
- 需要在多个项目中使用相同的 skills/agents
- 通过市场分发
- 需要版本控制和自动更新

### 插件组件

- **Skills**: 自定义命令和 agent skills
- **Agents**: 专门的 subagents
- **Hooks**: 事件处理程序
- **MCP servers**: 外部工具集成
- **LSP servers**: 语言服务器协议支持

---

## 快速开始

### 创建第一个插件

```bash
# 1. 创建目录结构
mkdir my-first-plugin/.claude-plugin
mkdir my-first-plugin/skills/hello

# 2. 创建 plugin.json
cat > my-first-plugin/.claude-plugin/plugin.json << 'EOF'
{
  "name": "my-first-plugin",
  "description": "A greeting plugin",
  "version": "1.0.0"
}
EOF

# 3. 创建 SKILL.md
cat > my-first-plugin/skills/hello/SKILL.md << 'EOF'
---
description: Greet the user warmly
---

Greet the user named "$ARGUMENTS" warmly.
EOF

# 4. 测试
claude --plugin-dir ./my-first-plugin
/plugin:hello World
```

### 本地测试

```bash
# 加载多个插件
claude --plugin-dir ./plugin-one --plugin-dir ./plugin-two

# 会话内重新加载
/reload-plugins
```

---

## 插件结构

### 标准布局

```
my-plugin/
├── .claude-plugin/           # 元数据目录（仅含 plugin.json）
│   └── plugin.json
├── skills/                   # Skills 目录
│   ├── skill-one/
│   │   ├── SKILL.md       # 必需
│   │   └── scripts/       # 可选
│   └── skill-two/
├── agents/                   # Agents 目录
│   └── specialized-agent.md
├── hooks/                    # Hooks 配置
│   ├── hooks.json
│   └── scripts/
├── commands/                 # Commands（遗留）
├── .mcp.json               # MCP 配置
├── .lsp.json               # LSP 配置
├── settings.json            # 默认设置
└── README.md
```

**警告**: `.claude-plugin/` 只包含 `plugin.json`，其他目录在根目录。

### 文件位置参考

| 组件 | 默认位置 | 目的 |
|------|---------|------|
| 清单 | `.claude-plugin/plugin.json` | 元数据和配置 |
| Skills | `skills/<name>/SKILL.md` | 技能定义 |
| Agents | `agents/*.md` | Subagent 定义 |
| Hooks | `hooks/hooks.json` | 事件处理 |
| MCP | `.mcp.json` | 服务器配置 |
| LSP | `.lsp.json` | 语言服务器 |

### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 插件名称 | kebab-case | `my-awesome-plugin` |
| Skill 名称 | kebab-case | `code-review` |
| Agent 名称 | kebab-case | `security-reviewer` |

---

## 插件清单

### plugin.json 完整架构

```json
{
  "name": "plugin-name",
  "version": "1.2.0",
  "description": "Brief description",
  "author": {
    "name": "Author Name",
    "email": "author@example.com"
  },
  "homepage": "https://docs.example.com",
  "repository": "https://github.com/user/plugin",
  "license": "MIT",
  "keywords": ["keyword1", "keyword2"],
  "commands": ["./custom/commands/"],
  "agents": "./custom/agents/",
  "skills": "./custom/skills/",
  "hooks": "./hooks.json",
  "mcpServers": "./mcp-config.json",
  "lspServers": "./.lsp.json"
}
```

### 字段说明

**必需字段：**

| 字段 | 类型 | 描述 |
|------|------|------|
| `name` | string | 唯一标识符（kebab-case） |

**元数据字段：**

| 字段 | 类型 | 描述 |
|------|------|------|
| `version` | string | 语义版本 |
| `description` | string | 简要说明 |
| `author` | object | 作者信息 |
| `license` | string | MIT、Apache-2.0 等 |

### 环境变量

- `${CLAUDE_PLUGIN_ROOT}`: 插件安装目录
- `${CLAUDE_PLUGIN_DATA}`: 持久化数据目录（更新后保留）

### 版本管理

遵循语义版本控制：

```
MAJOR.MINOR.PATCH

- MAJOR: 破坏性更改
- MINOR: 新功能（向后兼容）
- PATCH: 错误修复
```

---

## Skills 开发

### Skill 结构

```
my-skill/
├── SKILL.md           # 必需：入口文件
├── reference.md        # 可选：参考文档
├── examples/          # 可选：示例
└── scripts/          # 可选：支持脚本
```

### SKILL.md 格式

```yaml
---
name: my-skill
description: What this skill does
argument-hint: [filename]
disable-model-invocation: false
allowed-tools: Read, Grep
model: sonnet
effort: medium
context: fork
agent: Explore
---

Your skill instructions here...
```

### Frontmatter 参考

| 字段 | 描述 |
|------|------|
| `name` | Skill 显示名称 |
| `description` | 功能描述，Claude 据此决定何时使用 |
| `disable-model-invocation` | `true` 时仅用户可调用 |
| `user-invocable` | `false` 时从 `/` 菜单隐藏 |
| `allowed-tools` | 无需权限的工具列表 |
| `model` | 使用的模型 |
| `effort` | 努力级别：`low`、`medium`、`high`、`max` |
| `context` | `fork` 时在 subagent 中运行 |
| `agent` | `context: fork` 时的代理类型 |
| `hooks` | 限定于 skill 的 hooks |
| `paths` | Glob 模式，限制激活条件 |

### 字符串替换

| 变量 | 描述 |
|------|------|
| `$ARGUMENTS` | 调用时传递的所有参数 |
| `$ARGUMENTS[N]` | 按索引访问参数 |
| `$N` | `$ARGUMENTS[N]` 的简写 |
| `${CLAUDE_SESSION_ID}` | 当前会话 ID |
| `${CLAUDE_SKILL_DIR}` | SKILL.md 所在目录 |

### 动态上下文注入

```yaml
---
name: pr-summary
description: Summarize PR changes
---

## Pull request context
- PR diff: !`gh pr diff`
- Changed files: !`gh pr diff --name-only`

Summarize this pull request...
```

---

## Sub-agents 开发

### Agent 文件结构

```markdown
---
name: code-reviewer
description: Reviews code for best practices
tools: Read, Grep, Glob, Bash
disallowedTools: Write, Edit
model: sonnet
effort: high
maxTurns: 30
permissionMode: auto
skills:
  - api-conventions
memory: user
background: false
isolation: worktree
color: red
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./validate.sh"
---

你是代码审查专家...
```

### Frontmatter 字段

| 字段 | 必需 | 描述 |
|------|------|------|
| `name` | 是 | 唯一标识符 |
| `description` | 是 | Claude 据此决定何时调用 |
| `tools` | 否 | 允许的工具列表 |
| `disallowedTools` | 否 | 禁止的工具列表 |
| `model` | 否 | `sonnet`、`opus`、`haiku`、`inherit` |
| `permissionMode` | 否 | `default`、`auto`、`bypassPermissions` 等 |
| `maxTurns` | 否 | 最大代理轮数 |
| `skills` | 否 | 预加载的 skills |
| `mcpServers` | 否 | 可用的 MCP 服务器 |
| `memory` | 否 | `user`、`project`、`local` |
| `background` | 否 | `true` 时后台运行 |
| `isolation` | 否 | `worktree` 时隔离运行 |

### 内置 Agents

| Agent | Model | 用途 |
|-------|-------|------|
| **Explore** | Haiku | 快速只读探索 |
| **Plan** | 继承 | 规划研究 |
| **General-purpose** | 继承 | 复杂多步骤任务 |

### 生命周期

```
1. 启动 (SubagentStart hook)
   ↓
2. 加载上下文 (CLAUDE.md, skills, MCP)
   ↓
3. 执行任务
   ↓
4. 压缩 (如需要)
   ↓
5. 完成 (SubagentStop hook)
   ↓
6. 返回结果
```

### 持久内存

| 范围 | 位置 | 用途 |
|------|------|------|
| `user` | `~/.claude/agent-memory/<name>/` | 跨项目学习 |
| `project` | `.claude/agent-memory/<name>/` | 项目特定 |
| `local` | `.claude/agent-memory-local/<name>/` | 本地临时 |

---

## Agent Teams

### 团队架构

```
┌─────────────────────────────────────────┐
│           Team Lead (主会话)              │
│  - 创建团队、分配任务、综合结果               │
└─────────────────────────────────────────┘
         ↑ 消息传递 ↓ 任务列表
    ┌─────┴─────┬─────────────┐
    ↓           ↓             ↓
┌────────┐ ┌────────┐ ┌──────────┐
│队友 A   │ │队友 B  │ │  队友 C   │
└────────┘ └────────┘ └──────────┘
```

### Subagent vs Agent Teams

| 特性 | Subagents | Agent Teams |
|------|-----------|------------|
| Context | 自己的 context | 完全独立 |
| 通信 | 仅向主代理报告 | 队友直接通信 |
| 令牌成本 | 较低 | 较高 |
| 最适合 | 专注任务 | 需要协作的复杂工作 |

### 创建团队

```text
创建一个 agent team 来设计 CLI 工具：
- 一个负责 UX
- 一个负责技术架构
- 一个扮演魔鬼代言人
```

### 团队控制

| 命令 | 描述 |
|------|------|
| `/team create` | 创建团队 |
| `/team assign` | 分配任务 |
| `/team shutdown` | 关闭队友 |
| `/team cleanup` | 清理团队 |

### 团队 Hooks

| Hook | 触发时机 |
|------|----------|
| `SubagentStart` | 队友开始 |
| `SubagentStop` | 队友完成 |
| `TeammateIdle` | 队友空闲 |
| `TaskCreated` | 任务创建 |
| `TaskCompleted` | 任务完成 |

---

## Hooks 系统

### 完整事件列表

| 事件 | 触发时机 |
|------|---------|
| `SessionStart` | 会话开始/恢复 |
| `UserPromptSubmit` | 用户提交提示 |
| `PreToolUse` | 工具执行前 |
| `PermissionRequest` | 权限请求 |
| `PermissionDenied` | 权限被拒绝 |
| `PostToolUse` | 工具执行后 |
| `PostToolUseFailure` | 工具失败 |
| `Notification` | 通知 |
| `SubagentStart/Stop` | Subagent 生命周期 |
| `TaskCreated/Completed` | 任务管理 |
| `Stop` | Claude 停止响应 |
| `InstructionsLoaded` | CLAUDE.md 加载 |
| `ConfigChange` | 配置更改 |
| `CwdChanged` | 工作目录更改 |
| `FileChanged` | 文件更改 |
| `PreCompact/PostCompact` | 压缩生命周期 |
| `SessionEnd` | 会话结束 |

### hooks.json 配置

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "npx prettier --write"
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npm install"
          }
        ]
      }
    ]
  }
}
```

### Hook 输入架构

**PreToolUse：**

```json
{
  "session_id": "abc123",
  "cwd": "/path/to/project",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "npm test"
  }
}
```

### Hook 输出

```json
// 允许
{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "allow"}}

// 阻止
{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": "Not allowed"}}

// 注入上下文
{"additionalContext": "上下文内容..."}
```

### 退出码

| 退出码 | 行为 |
|--------|------|
| 0 | 继续/附加上下文 |
| 2 | 阻止操作 |
| 其他 | 继续，记录 stderr |

### Hook 类型

| 类型 | 描述 |
|------|------|
| `command` | 执行 shell 命令 |
| `http` | POST JSON 到 URL |
| `prompt` | 单轮 LLM 评估 |
| `agent` | 多轮验证代理 |

### 高级配置

**基于提示的 Hook：**

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "检查所有任务是否完成",
            "model": "haiku"
          }
        ]
      }
    ]
  }
}
```

**HTTP Hook：**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:8080/hooks",
            "headers": {"Authorization": "Bearer $TOKEN"},
            "allowedEnvVars": ["TOKEN"]
          }
        ]
      }
    ]
  }
}
```

### 实用案例

**保护敏感文件：**

```bash
#!/bin/bash
# protect-files.sh
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

PROTECTED=(".env" "credentials.json" ".git/")

for pattern in "${PROTECTED[@]}"; do
  if [[ "$FILE_PATH" == *"$pattern"* ]]; then
    echo "Blocked: $FILE_PATH" >&2
    exit 2
  fi
done
exit 0
```

---

## 工具与权限

### 完整工具列表

| 工具 | 描述 | 权限 |
|------|------|------|
| `Agent` | 生成 subagent | 否 |
| `AskUserQuestion` | 多选问题 | 否 |
| `Bash` | 执行命令 | **是** |
| `Edit` | 编辑文件 | **是** |
| `Read` | 读取文件 | 否 |
| `Write` | 创建文件 | **是** |
| `Glob` | 查找文件 | 否 |
| `Grep` | 搜索内容 | 否 |
| `Skill` | 执行 skill | **是** |
| `WebFetch` | 获取网页 | **是** |
| `WebSearch` | 网络搜索 | **是** |
| `TaskCreate/List/Get/Update` | 任务管理 | 否 |
| `TeamCreate/Delete` | 团队管理 | 否 |
| `SendMessage` | 发送消息 | 否 |

### 权限模式

| 模式 | 描述 |
|------|------|
| `default` | 标准权限检查 |
| `acceptEdits` | 自动接受文件编辑 |
| `plan` | 只读规划模式 |
| `auto` | 自动批准+后台检查 |
| `bypassPermissions` | 跳过所有提示 |

### 权限规则语法

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run *)",
      "Read(*.md)"
    ],
    "deny": [
      "Bash(git push *)",
      "Read(./.env)"
    ]
  }
}
```

### 受保护目录

即使 `bypassPermissions`，以下目录仍需确认：
- `.git/`、`.claude/`、`.vscode/`、`.idea/`、`.husky/`

豁免目录：
- `.claude/commands/`、`.claude/agents/`、`.claude/skills/`

---

## MCP/LSP 服务器

### MCP 配置 (.mcp.json)

```json
{
  "mcpServers": {
    "database-tools": {
      "command": "${CLAUDE_PLUGIN_ROOT}/servers/db-server",
      "args": ["--config", "${CLAUDE_PLUGIN_ROOT}/config.json"],
      "env": {
        "DB_PATH": "${CLAUDE_PLUGIN_DATA}/db"
      }
    }
  }
}
```

### MCP CLI 命令

```bash
# 添加服务器
claude mcp add --transport http notion https://mcp.notion.com/mcp
claude mcp add --transport stdio --env API_KEY=xxx github -- npx -y @github/mcp-server

# 管理
claude mcp list
claude mcp get <name>
claude mcp remove <name>
```

### MCP 范围

| 范围 | 位置 | 用途 |
|------|------|------|
| `local` | `~/.claude.json` | 个人实验 |
| `project` | `.mcp.json` | 团队共享 |
| `user` | `~/.claude.json` | 跨项目 |

### LSP 配置 (.lsp.json)

```json
{
  "go": {
    "command": "gopls",
    "args": ["serve"],
    "extensionToLanguage": {
      ".go": "go"
    }
  }
}
```

### 官方 LSP 插件

| 插件 | 语言服务器 | 安装命令 |
|------|-----------|---------|
| `pyright-lsp` | Pyright | `pip install pyright` |
| `typescript-lsp` | TypeScript | `npm install -g typescript-language-server` |
| `rust-lsp` | rust-analyzer | 见官方文档 |

---

## 插件市场与分发

### Marketplace 结构

```
my-marketplace/
├── .claude-plugin/
│   └── marketplace.json
└── plugins/
    └── my-plugin/
        ├── .claude-plugin/
        │   └── plugin.json
        └── skills/
            └── my-skill/
                └── SKILL.md
```

### marketplace.json 架构

```json
{
  "name": "my-plugins",
  "owner": {
    "name": "Team Name",
    "email": "team@example.com"
  },
  "plugins": [
    {
      "name": "code-formatter",
      "source": "./formatter",
      "version": "2.1.0",
      "description": "自动代码格式化"
    },
    {
      "name": "github-integration",
      "source": {
        "source": "github",
        "repo": "owner/plugin-repo",
        "ref": "v2.0.0"
      }
    }
  ]
}
```

### Plugin 源类型

| 类型 | 配置 | 说明 |
|------|------|------|
| 相对路径 | `"./my-plugin"` | 同仓库 |
| GitHub | `{source: "github", repo: "owner/repo"}` | GitHub 仓库 |
| Git URL | `{source: "url", url: "..."}` | 任意 git |
| 子目录 | `{source: "git-subdir", url: "...", path: "..."}` | Monorepo |
| npm | `{source: "npm", package: "@scope/pkg"}` | npm 包 |

### 发布流程

```bash
# 1. 创建发布
git tag v1.0.0
git push origin v1.0.0

# 2. 用户安装
/plugin install my-plugin@my-marketplace

# 3. 自动更新
/plugin update my-plugin@my-marketplace
```

### CLI 命令

```bash
# 插件管理
claude plugin install <plugin> --scope <user|project|local>
claude plugin uninstall <plugin>
claude plugin enable/disable <plugin>
claude plugin update <plugin>
claude plugin validate <path>

# 市场管理
claude plugin marketplace add <source>
claude plugin marketplace list
claude plugin marketplace update <name>
```

### 私有市场

```json
// .claude/settings.json
{
  "extraKnownMarketplaces": {
    "company-tools": {
      "source": {
        "source": "github",
        "repo": "my-org/claude-plugins"
      }
    }
  },
  "enabledPlugins": {
    "code-formatter@company-tools": true
  }
}
```

---

## 调试与故障排除

### 调试命令

```bash
claude --debug
```

显示：插件加载状态、清单错误、组件注册、MCP 初始化

### 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| Plugin 未加载 | 无效 `plugin.json` | `claude plugin validate` |
| 命令未出现 | 目录结构错误 | 确保在根目录 |
| Hooks 未触发 | 脚本不可执行 | `chmod +x script.sh` |
| MCP 失败 | 缺少路径变量 | 使用 `${CLAUDE_PLUGIN_ROOT}` |
| LSP `not found` | 语言服务器未安装 | 安装二进制文件 |

### Auto Mode 配置

```json
{
  "autoMode": {
    "environment": [
      "Source control: github.com/my-org",
      "Trusted cloud buckets: s3://my-builds"
    ],
    "allow": [
      "Deploying to staging is allowed"
    ],
    "soft_deny": [
      "Never push directly to main"
    ]
  }
}
```

---

## 实践案例

### 案例 1：代码审查插件

**结构：**
```
code-review-plugin/
├── .claude-plugin/plugin.json
├── skills/
│   ├── quick-review/SKILL.md
│   └── deep-review/SKILL.md
├── agents/
│   ├── security-reviewer.md
│   └── performance-reviewer.md
└── hooks/hooks.json
```

**security-reviewer.md：**
```markdown
---
name: security-reviewer
description: Reviews code for security vulnerabilities
tools: Read, Grep, Glob
model: sonnet
---

你是安全审查专家。检查：
1. SQL 注入风险
2. XSS 漏洞
3. 敏感数据暴露
4. 认证/授权问题
```

### 案例 2：部署自动化

**hooks.json：**
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash(deploy *)",
        "hooks": [
          {
            "type": "command",
            "command": "./hooks/validate-deploy.sh"
          }
        ]
      }
    ]
  }
}
```

**validate-deploy.sh：**
```bash
#!/bin/bash
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

if echo "$COMMAND" | grep -q "deploy --prod"; then
  echo "Error: Production deploy requires confirmation" >&2
  exit 2
fi
exit 0
```

### 案例 3：数学建模 Agent Team

```text
创建数学建模团队：
- 问题解析 Agent → 理解问题
- 建模 Agent → 构建模型
- 仿真 Agent → 执行计算
- 报告 Agent → 生成论文
```

**problem-parser.md：**
```markdown
---
name: problem-parser
description: 解析数学建模问题
tools: Read, Grep, Glob
model: sonnet
memory: project
---

你是问题解析专家：
1. 读取并理解问题描述
2. 提取数学模型类型
3. 识别数据需求
4. 定义优化目标
5. 列出约束条件
```

### 案例 4：CI/CD 集成

**pre-commit-check.sh：**
```bash
#!/bin/bash
set -e

echo "Running pre-commit checks..."

# Lint
npx eslint src/ --max-warnings 0

# Test
npm test -- --coverage

# Type check
npx tsc --noEmit

# Security
npm audit --audit-level=high

echo "All checks passed!"
```

### 案例 5：数据分析 Skill

```yaml
---
name: data-analysis
description: 执行完整数据分析
context: fork
agent: general-purpose
allowed-tools: Read, Write, Bash(python *), Glob
---

执行数据分析：

1. 数据探索
   - 读取数据文件
   - 检查数据质量
   - 统计摘要

2. 数据预处理
   - 缺失值处理
   - 特征工程

3. 建模分析
   - 选择模型
   - 训练和评估

4. 可视化报告
   - 生成图表
   - 创建报告
```

---

## 参考资源

- [Claude Code 官方文档](https://code.claude.com/docs)
- [完整文档索引](https://code.claude.com/docs/llms.txt)
- [Agent Skills 开放标准](https://agentskills.io)
- [MCP 协议](https://modelcontextprotocol.io)
- [LSP 协议](https://microsoft.github.io/language-server-protocol/)

---

*本指南基于 Claude Code 官方文档整理。*
