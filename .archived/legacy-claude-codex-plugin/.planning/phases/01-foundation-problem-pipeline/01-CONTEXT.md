# Phase 1: Foundation & Problem Pipeline - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

建立工作流基础设施和问题输入流程。交付 Skill 框架、问题解析能力、上下文传递机制、验证门控。

**不包含：** 建模智能体实现（Phase 2）、模拟执行（Phase 3）、报告生成（Phase 4）

**Requirements covered:** FND-01~04, PROB-01~04, AGNT-05~06, VRF-01~03

</domain>

<decisions>
## Implementation Decisions

### Skill Entry Point Design
- **D-01:** 使用 `/mm-agent` 作为主入口命令，符合 Claude Code skill 命名惯例
- **D-02:** 支持可选参数：`--problem <path>` 直接指定问题文件，`--interactive` 进入交互模式
- **D-03:** 无参数运行时显示帮助信息和使用示例

### Problem Input Format
- **D-04:** 问题通过文件路径参数提供（支持长文本，适合数学建模场景）
- **D-05:** 支持的文件格式：`.md`, `.txt`, `.pdf`（Markdown 优先，PDF 需要解析）
- **D-05a:** **重要提醒：** 赛题、论文与参考资料多为 PDF 格式，需要支持 PDF 文件读取和解析
- **D-06:** 问题文件可以是原始赛题文本或 PDF，不需要预处理

### Problem Parsing Output Structure
- **D-07:** `problem.md` 标准结构包含以下字段：
  - `title`: 问题标题
  - `background`: 问题背景描述
  - `questions`: 具体问题列表（可能多个子问题）
  - `constraints`: 已知条件和约束
  - `objectives`: 建模目标
  - `keywords`: 问题关键词（用于后续智能体定位）
  - `raw_text`: 原始问题文本（保留完整信息）
- **D-08:** 解析后生成摘要字段 `summary`，供后续阶段快速理解问题

### Verification Gate Design
- **D-09:** 每阶段验证检查：
  - 输出文件存在性
  - 必填字段完整性
  - 格式正确性（Markdown 语法）
- **D-10:** 验证失败时输出明确错误信息和修复建议
- **D-11:** 支持 YOLO 模式（`--skip-verify`）跳过验证

### Context Passing Mechanism
- **D-12:** 阶段间通过文件传递上下文（GSD 模式）
- **D-13:** 每个阶段输出文件包含 `context_summary` 字段，摘要关键信息
- **D-14:** 后续阶段读取前一阶段的输出文件作为输入

### Claude's Discretion
- Skill 文件的具体结构和组织方式
- 问题解析 LLM prompt 的具体设计
- 验证门控的错误消息措辞
- .planning/ 目录的子目录命名规范

</decisions>

<specifics>
## Specific Ideas

- 参考 GSD 框架的 `/gsd:new-project` 命令设计，作为 Skill 入口参考
- 问题解析应该像 MM Agent 论文中的 "Problem Understanding" 阶段
- 验证门控参考 GSD 的 verification agent 模式，但简化为规则检查（Phase 1 不需要 LLM 验证）

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — 项目愿景、约束、关键决策
- `.planning/REQUIREMENTS.md` — Phase 1 覆盖的需求：FND-01~04, PROB-01~04, AGNT-05~06, VRF-01~03
- `.planning/ROADMAP.md` — Phase 1 详细描述和成功标准
- `.planning/research/SUMMARY.md` — 研究摘要，推荐技术栈和架构

### External References
- MM Agent Paper: https://arxiv.org/abs/2505.14148 — Problem Understanding 阶段设计参考
- LLM-MM-Agent repo: https://github.com/usail-hkust/LLM-MM-Agent — 工程实现参考
- GSD Framework: https://github.com/gsd-build/get-shit-done — Skill/Hook/Agent 模式参考

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- GSD Framework 的 Skill 模板和命令结构可作为参考
- `.planning/` 目录已创建，config.json 已配置

### Established Patterns
- GSD 使用文件进行阶段间上下文传递
- Skills 使用 markdown frontmatter 定义元数据
- 验证门控在阶段转换时执行

### Integration Points
- 新 Skill 将安装在 `.claude/skills/mm-agent/`
- 阶段输出将写入 `.planning/phases/01-*/`

</code_context>

<deferred>
## Deferred Ideas

- 交互式问题输入模式（用户逐步回答问题）— 可考虑作为 v2 功能
- 多语言问题支持 — 当前版本仅中文
- 问题模板库（预定义问题类型）— Phase 2 或以后

</deferred>

---

*Phase: 01-foundation-problem-pipeline*
*Context gathered: 2026-04-10*