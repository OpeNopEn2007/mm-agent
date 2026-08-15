# 多宿主安装与分发架构

状态：Design（仅文档，不触代码；v2 实施时按本文重构 install.js）  
范围：`@mm-agent`（发布名为 `mm-agent`，无作用域）npm 包如何在多宿主 AI 编程助手中分发  
基线：本文件落稿时的实现状态；`src/install.ts` 当前只支持 OpenCode 一宿主

本文只固定多宿主分发的架构设计。Canonical Core（`canonical-core.md`）、Artifact 协议（`../context/artifact-protocol.md`）和 OpenCode Adapter 接口（`opencode-plugin-harness.md`）继续是各自机制的权威来源；本文新增的内容只覆盖"包如何被发现、安装、卸载和升级"这一层。

## 一句话定位

一个 npm 包 `mm-agent`，由一个 `mm-agent` 命令分发，安装器扫描用户机器上已装的、MM-Agent 支持的宿主，按各宿主原生路径与文件格式分发；`install.js` 单包存全部宿主的安装器，宿主枚举在一组 Host Adapter 模块里。不是每宿主一个 npm 包，不是 GSD 的纯 Markdown 文本适配。

跟 GSD 的对比见末节"跟 GSD 的取舍"。差异不在分发层（一包多宿主这一思路有重叠），而在 Adapter 层：GSD runtime 是纯 Markdown，能靠工具名映射表直接跨宿主；MM-Agent 的 Adapter 是 TypeScript 代码、依赖宿主 Plugin API（OpenCode 走 `@opencode-ai/plugin`），每个新宿主都要写一份完整 Adapter。

## 设计基线

| 项 | 决定 |
|---|---|
| 发布名 | `mm-agent` 无作用域（当前 npm registry 可用） |
| 全局命令名 | `mm-agent`（`package.json` 的 `bin`） |
| CLI 入口 | `dist/mm-agent.js` |
| 安装凭据路径 | `~/.config/mm-agent/receipt/<host>.json`，每 host 一份 |
| 安装基准目录 | `~/.config/mm-agent/`（mm-agent 自己的 config 子树，不寄生 opencode/） |
| 分发粒度 | 同源 + 宿主专属：Skill 内容同源，Adapter 代码每宿主一份 |
| 用户命令 | `npx mm-agent install` 无参扫描全发；有参显式 host，支持多个 |

## 包交付内容（`package.json` 的 `files`）

`package.json` 的 `files` 数组声明 `npm pack` 打进 tarball 的目录。当前基线的交付物在未来增加宿主时需要在**代码内**扩展，`files` 字段本身可保持稳定（因为我们按目录走，不按宿主拆包）：

| 目录 | 内容 | 谁用 |
|---|---|---|
| `dist` | `tsc` 编译产物：`mm-agent.js`（CLI）、`index.js`（OpenCode plugin default export）、`agents.js`、Core 与 Tools 编译产物 | CLI、宿主 Adapter（通过 plugin entry）、require |
| `skills` | `skills/{mm-agent,mm-hmml,mm-compute,mm-report}/SKILL.md` | 所有支持宿主的 slash command / skill 发现 |
| `hosts` | 每宿主一份 Adapter 代码组织在 `hosts/<host>/` 下（OpenCode 当前住在 `src/index.ts`，v2 重构时迁过来） | 各宿主 runtime 自取 |
| `rubrics` | 4 阶段 Critic 验收标准 `.md` | `mm_agent_prepare` 固化进 Case 快照 |
| `runtime` | Python 3.12 HMML/Compute runtime（根级 `runtime/`） | `mm_agent_compute`/`mm_agent_hmml` 用 `uv run` 调 |
| `knowledge` | HMML catalog + GTE 索引、写作风格指南 | HMML 检索、Writer |
| `templates/cumcmthesis`、`templates/mcmthesis` | 建模论文 LaTeX 模板 | Writer 经 `mm_agent_compile` 编译 |
| `THIRD_PARTY_NOTICES.md` | 第三方 notices | 许可合规 |

不在包内：`tests/`、`scripts/`、`docs/`、源码 `src/`（只发 `dist` 编译产物）、`.archived/`、模型权重、`.venv`。生产 runtime 只装能跑的东西。

## Host Adapter 表

多宿主的核心抽象。每个支持宿主是一组声明：

```ts
type HostAdapter = {
  id: string                              // 'opencode' | 'claude' | 'codex' | ...
  detect(): Promise<HostDetection>         // 看这台机器装没装、可用版本
  install(ctx: InstallContext): Promise<InstallOutcome>   // 分发到该宿主原生路径
  update(ctx: UpdateContext): Promise<UpdateOutcome>
  remove(ctx: RemoveContext): Promise<RemoveOutcome>
}
```

Host Adapter 模块住在 `hosts/<host>/` 下（v2 重构时 OpenCode Adapter 从当前 `src/index.ts`+`src/install.ts` 的混合体迁出整理过去）。每宿主单独实现 `detect/install/update/remove`，不共享 mutable 状态。

宿主枚举是封闭还是开放：v2 实施时定。倾向封闭——MM-Agent 自己维护几个宿主，避免第三方往 `hosts/` 放东西带来的供应链风险。开放形态（允许用户/第三方扩展新 Host Adapter）作为 v2 之后再议的可选项。

## Skill 同源约束（硬约束）

Skill 内容（`skills/*/SKILL.md`）是宿主无关的，所有支持宿主按同一个源分发，不按宿主改写。这是"求同存异"中"求同"的那半边。

为了这条成立，新宿主 Adapter 必须**自己**把 SKILL.md 里出现的 mm_agent_* 工具名按原样暴露给宿主——**不允许**因为宿主没有原生等价机制就修改 SKILL.md 里的工具名来迁就宿主。这是 Skill 同源的硬约束，写进本文档作为 Adapter 评审标准。

如果遇到宿主真的无法实现某工具的同名等价物，按 SKILL.md 原名落不了地，则走显式变更流程：本文档记录该宿主例外、列名为什么必要改、从哪个 SKILL 文件改哪一行——不默认隐式改名。

这条把 GSD 那种"运行时工具名映射表（`claudeToCopilotTools`）"排除在外：我们用"宿主自己实现同名工具"代替"运行时把抽象名翻译到宿主真名"。代价是每个宿主 Adapter 有更多代码、每个宿主都要实现已知工具。收益是 SKILL 永远同源、用户和贡献者只读一套指令、不需要记一张抽象名字到各宿主真名的映射。

## Receipt 结构（每 host 一份）

`~/.config/mm-agent/` 是 mm-agent 自己的配置子树，不寄生在任何宿主自己的 config 目录下。安装凭据落在：

```
~/.config/mm-agent/
└── receipt/
    ├── opencode.json
    ├── claude.json
    ├── codex.json
    └── ...
```

每个 host 一份独立 receipt。同一台机器装多个宿主时，各 receipt 互不知晓、互不依赖。

每份 receipt 至少记录：

```json
{
  "package": "mm-agent",
  "version": "1.0.0",
  "host": "opencode",
  "plugin_entry": "file:///...",
  "installed_skills": ["mm-agent", "mm-hmml", "mm-compute", "mm-report"],
  "files": [
    { "path": "skills/mm-agent/SKILL.md", "sha256": "..." },
    ...
  ]
}
```

### 为什么每 host 一份独立 receipt（备选方案落选理由）

可替代方案是所有 host 共用一份 receipt、里面一个 `hosts` 数组。视觉上更省一个文件，但 `mm-agent remove opencode` 这种命令做起来麻烦：要读大 receipt、改数组里某项、再写回整份 JSON、还要同时改 `opencode.json` 的 plugin 数组、删 `~/.config/opencode/skills/` 里的文件。涉及多个写半路失败时回滚要跨多个文件、跨不同 mutation kinds 的"半改对象复原"，比当前 `applyTransaction` 已验证的单文件原子切换复杂度高。

每 host 一份独立 receipt 的语义优势：**单个 host 的故障或 receipt 损坏不牵连其他 host**。卸 `opencode` 时不读 `claude.json`、不写 `claude.json`、不可能误删 Claude 装的文件。各宿主 receipt 之间真隔板。代价是"卸所有 mm-agent"要遍历所有 receipt 文件——这等价于 for-loop 跑 N 次 `mm-agent remove <host>`，是线性代码，不是架构负担。

mm-agent 在 `~/.config/` 下有自己的子树是有意为之：跟宿主自己的 `~/.config/opencode/`、`~/.config/cursor/` 等解耦，不寄生在某个宿主目录下。当前 `src/install.ts` 把 receipt 写到 `~/.config/opencode/mm-agent/receipt.json`（寄生在 opencode 自己的 config 目录下），v2 重构时挪到 `~/.config/mm-agent/receipt/<host>.json`。

## 安装事务（Host Adapter 间共享底座）

事务化写入、realpath 防符号链接逃逸、sha256 防静默覆盖——这些是已验证的 install.ts 安全基础，v2 重构时抽成共享底座供所有 Host Adapter 复用，不是每宿主另写一份。一个 Host Adapter 只声明**写哪些文件、写到哪个 config root**；事务执行、回滚、receipt 校验、conflict 检测由底座统一负责。

当前 `src/install.ts` 的 `applyTransaction`（backup → 临时文件 → rename → 失败按相反顺序回滚）和 `assertRealPathBoundary`（逐段 realpath 防符号链接逃逸）继续是底座实现。`validateReceipt` 的严格 schema 校验在 v2 加 host 维度后继续保留（只是每份 receipt 多一个 `host` 字段）。

v2 重构方向：install.ts 从"单一 host 实现"重构为"Host Registry + 共享底座 + 各 Host Adapter 声明数据"。当前 install.ts 表面上只有一个 `install`/`update`/`remove` 三元函数 + CLI 入口混在一个文件，v2 改为 cli.js（入口+解析+分发）+ commands/（每个子命令逻辑）+ hosts/<host>/（每宿主声明），底座抽到 hosts/shared/ 下。

## 用户命令接口

bin 暴露全局命令：

```json
{
  "bin": {
    "mm-agent": "./dist/mm-agent.js"
  }
}
```

`dist/mm-agent.js` 顶部 `#!/usr/bin/env node`，作为可执行 Node 脚本。CLI 入口自己解析 `process.argv`（子命令模式，不用 npm 的什么特殊"子命令"机制——npm `bin` 只暴露"命令名 → 入口脚本"，子命令分发是入口脚本自己用 argv 做的）。框架用 commander/yargs/clipanion 或手写裸 argv 解析，v2 实施时看复杂度选。

### 命令文法

```bash
npx mm-agent install                          # 扫描全发
npx mm-agent install opencode                 # 显式单个 host
npx mm-agent install opencode claude          # 显式多个 host
npx mm-agent update                           # 按 receipt 扫描更新所有已装 host
npx mm-agent update opencode                  # 显式更新单个 host
npx mm-agent remove                           # 卸所有已装 host
npx mm-agent remove opencode                  # 卸单个 host
npx mm-agent list                             # 列出已装 host 和各自的 installed_skills
npx mm-agent --yes install                    # 跳过 npx 提示
```

文法约束：

- 无参 `install` = 扫描用户机器上已装的、MM-Agent 支持的宿主，逐一执行分发。
- 有参 `install <host...>` = 显式参数 host，不做扫描。用户写几个就装几个。
- `update`/`remove` 默认按 receipt 目录下的已有 receipt 走（已装什么就操作什么），有参则显式限制。
- `list` 只读，列出各 host receipt 的 installed_skills 和 plugin_entry，便于用户排查"装了什么、装到哪"。
- `npx` 在没装 `mm-agent` 时会先 `npm install` 再跑 bin——这就是"`npx mm-agent install`"一行兼顾下载、安装、分发三步的全部机制；CI/非交互环境加 `--yes` 跳过 npx 的 y 确认。

### 宿主检测

两层结合，不用单一手段：

1. **目录存在初筛**（快、不依赖 shell/PATH）：看 `~/.config/opencode/`、`~/.claude/`、`~/.codex/` 等是否真存在。跟 GSD 一致的 quick check。
2. **`<host> --version` + 预期正则确认**（准、防误判）：跑宿主自己的 `--version`，正则匹配输出格式。验证宿主真装了、能跑、版本在支持范围内。

两层都通过才认为该宿主"可用"，进入分发路径。任一失败跳过该 host 输出 skip 日志。

边角：用户在某些 shell（git-bash/WSL）里 PATH 可能不能直接找到宿主二进制——这种情况下 `--version` 会 fail，但目录在。v2 实施时具体 skip 策略要定：是"目录在但 CLI 不通就跳过"，还是"目录在就 install（信任用户会修 PATH）"。倾向前者，更保守。

### OpenCode 与其他宿主的区别

OpenCode 是目前唯一需要项目级 shim 的宿主：用户在某个题目项目里用就要那个项目有 `.opencode/plugins/mm-agent.js` 这层 re-export。这跟 OpenCode 的项目级 plugin 发现机制有关，不是 install.js 能避免的。

v2 设计取向：`mm-agent install` 默认只做全局分发（写 `~/.config/opencode/skills/` 和 `opencode.json` 的 plugin 数组），不触碰用户任意项目的 `.opencode/`。若 OpenCode Adapter 仍需要项目级 shim，未来加 `--target-project <path>` 选项让用户显式指定一个项目、install 把 shim 也写进去——但这是 OpenCode 这一宿主的特例，不是所有宿主都要的。其他宿主（Claude、Cursor 等）通常全局位置（`~/.claude/skills/` 等）足了。

当前 README 提到的"手动 PowerShell 写 shim"四行命令（`README.md:60-63`，PowerShell `Set-Content .opencode\plugins\mm-agent.js '...'` 那段）是 v0 RC 的临时 walkthrough，v2 全局 install 直接覆盖掉，README 重写（独立一轮）顺手清掉这条技术债。

## 跟 GSD 的取舍

GSD（`get-shit-done-cc`，分析见 `docs/research/gsd-project-analysis.md`）也是一包多宿主、`npx` 一行安装、`bin/install.js` 在安装时按宿主原生路径分流。本架构在分发层与之**思路同源**：一包多分支、按用户机器上已装宿主分发、不是 scope-per-adapter 拆包。

差异在 Adapter 层，也不只是"实现语言不同"那么表面：

- **GSD runtime 是纯 Markdown**（commands `.md` + agents `.md` + hooks 声明），任何 AI 助手都能读。它的"跨宿主"靠一张运行时工具名映射表（`claudeToCopilotTools`：`Read→read`、`Write→edit`、`Bash→execute` 等）把抽象名翻译到各宿主真名，SKILL prompt 一直同源。它没有 Core/Adapter 这条缝，全同。
- **MM-Agent 的 Canonical Core 是宿主无关的 TypeScript 模块**（`src/core/case-context-store.ts` 等），Adapter 是宿主专属 TypeScript 代码依赖宿主 Plugin API（OpenCode 走 `@opencode-ai/plugin`）。每个新宿主都要写一份完整 Adapter：注册工具、注册 Agent、实现 `tool.execute.before` 的等价 hook、翻译权限表。复制 SKILL.md 文件到 `~/.claude/skills/` 让用户敲 `/mm-agent` 在 Claude Code 里能跑——Agent 一调 `mm_agent_flow` 就死，因为没人替 Claude Code 实现过这个工具。

因此本架构**采纳** GSD 的"一包多宿主 + 安装时分支 + `npx` 一行"分发层模式，**不采纳**其"纯 Markdown runtime + 工具名映射表"做法——因为没有那条缝可走。本文档前文的"Skill 同源约束"显式拒绝了运行时映射表这条路：MM-Agent 用"宿主 Adapter 自己实现同名工具"代替"在运行时把抽象名翻译到宿主真名"，这是比 GSD 更结构化、也更高实施代价的多宿主方案。

`docs/architecture/formal-runtime-convergence.md:204` 写过："GSD Core 的共同形状是薄 Orchestrator、fresh specialised agents、文件系统状态和明确 Verify；其 wave lock、hooks、安装兼容层服务更广的多 runtime/并发范围，不应整体复制到首条数学建模链。"本架构是对"不应整体复制"的具体取舍：**复制分发层**（一包多宿主、安装时分支、`npx` 一行——这些跟 MM-Agent v1 单宿主范围正交、不增加运行时复杂度），**不复制运行时层**（wave lock、并发、多 runtime 编排等驱动 v1 复杂度的部分继续推迟或不要）。

## v2 实施项清单

本架构在 v2 落地时的工作，按依赖顺序：

1. **receipt 迁移**。把 `src/install.ts:71` 的 `receiptFilePath`（当前 `mm-agent/receipt.json` 寄生在 `~/.config/opencode/` 下）挪到 `~/.config/mm-agent/receipt/opencode.json`。`validateReceipt` 加 `host` 字段。已有 receipt 要写一个一次性迁移：读旧 opencode receipt 路径，挪到新路径，写 `host: "opencode"`。
2. **包名对账（已完成）**。`package.json` 已从 `@mm-agent/opencode@1.0.0` 降到 `mm-agent@0.1.0`（无作用域），`src/install.ts` 里 hardcoded 的 `"@mm-agent/opencode"` 已同步对账（`ReceiptBase`、`Receipt`、`validateReceipt` 的严格匹配几处），`tests/plugin-spike.test.ts` 已对账包名和版本。当前 npm registry `mm-agent` 无作用域名可用（已验证 404），但尚未 `npm publish`。
3. **bin 改名**。`package.json` 的 `bin` 当前是 `{ "mm-agent-opencode": "./dist/install.js" }`，改为 `{ "mm-agent": "./dist/mm-agent.js" }`。源文件从 `src/install.ts` 的 CLI 部分（末尾 `runCli` + main 守卫那段）拆成独立的 `src/mm-agent.ts`（CLI 入口，只解析 + 分发），`tsc` build 映射到 `dist/mm-agent.js`。`main` 仍指 `dist/index.js` 给 import 用，`bin` 指 `dist/mm-agent.js` 给命令行用，两角色分离。
4. **Host Adapter 抽象**。在 `src/hosts/` 下建 `HostAdapter` 接口和 `opencode/` 一份实现（OpenCode Adapter 从 `src/index.ts` + `src/install.ts` 混合体迁出整理）。Single-source-of-truth 的事务底座（`applyTransaction`、`assertRealPathBoundary`、`validateReceipt` 骨架）抽到 `src/hosts/shared/`。
5. **多 host CLI**。`mm-agent.ts` 解析 `process.argv`，分 `install`/`update`/`remove`/`list` 子命令，每个子命令接零个或多个 `<host>` 参数。无参 `install` 跑扫描路径，走"目录存在初筛 + `<host> --version` 确认"两步 detection。
6. **registry 表**。`src/hosts/index.ts` 导出一张 `HostAdapter` 表，CLI dispatcher 遍历它。封闭枚举（只含 MM-Agent 自维护的宿主），不可由第三方动态扩展。
7. **README 重写**（独立一轮，不全跟 v2 绑）。`README.md:49-77` 的"安装"和"跑一道题"段重写：用户入口改为 `npx --yes mm-agent install opencode` 一行，诶掉手动 shim walkthrough。当前 README 与 v2 命令一致的版本作为这一轮的产物。

以上 7 项不按全序硬绑：1 和 3 可以并行，4 在 3 之前先有 Host Adapter 抽象才有 bin 拆分落点，5 在 4 和 6 之后，7 在 5 之后（README 写的是 CLI 最终文法）。包名对账（#2）已完成、不再占执行槽。本文件只锁架构，不规定执行序——里程碑与验收契约以 `PLAN.md` 为准。