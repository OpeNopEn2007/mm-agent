# Requirements: MM-Agent in Claude Code

**Defined:** 2026-04-10
**Core Value:** 输入非结构化赛题 → 自动化数学建模全流程 → 输出符合要求的论文报告

## v1 Requirements

自动化数学建模系统的初始版本需求。每项映射到 roadmap phases。

### Problem Analysis

- [ ] **PROB-01**: 系统可接收 PDF 格式赛题文件并解析提取文本内容
- [ ] **PROB-02**: 系统可接收 Markdown/TXT 格式赛题文件
- [ ] **PROB-03**: 系统可从赛题中提取问题背景、目标、约束条件
- [ ] **PROB-04**: 系统可输出结构化 problem.md 文件（包含 title, background, questions, constraints, objectives, keywords, summary）

### Task Decomposition

- [ ] **TASK-01**: 系统可识别赛题中的多个子问题
- [ ] **TASK-02**: 系统可分析子问题间的依赖关系并构建 DAG
- [ ] **TASK-03**: 系统可对 DAG 进行拓扑排序确定执行顺序
- [ ] **TASK-04**: 系统可检测 DAG 中的循环依赖并报错
- [ ] **TASK-05**: 系统可输出 dag.json 和 execution-order.txt

### Knowledge Retrieval

- [x] **KNOW-01**: 系统可加载预计算的 HMML embedding 文件
- [x] **KNOW-02**: 系统可根据任务描述检索相关建模方法（Top-K）
- [x] **KNOW-03**: 系统可输出检索结果到 retrieved-methods.json

### Mathematical Modeling

- [x] **MODEL-01**: 系统可基于任务描述和检索方法生成建模方案
- [x] **MODEL-02**: 系统可输出 model.md（包含建模方法、公式、变量、假设）
- [x] **MODEL-03**: 系统可输出 formulas.json（结构化公式定义）
- [x] **MODEL-04**: 系统可实施 Actor-Critic 迭代改进（max_rounds=3）
- [x] **MODEL-05**: 系统可在建模方案达到质量阈值后停止迭代

### Code Generation & Execution

- [x] **CODE-01**: 系统可基于建模方案生成可执行 Python 代码
- [x] **CODE-02**: 系统可执行生成的 Python 代码
- [x] **CODE-03**: 系统可捕获代码执行输出（stdout/stderr）
- [x] **CODE-04**: 系统可在执行失败时自动重试（最多 5 次）
- [x] **CODE-05**: 系统可输出 results.json 和可视化图表
- [x] **CODE-06**: 系统可实施执行超时保护（300s）

### Memory System

- [ ] **MEM-01**: 系统可在任务开始时加载依赖任务的 Memory
- [ ] **MEM-02**: 系统可在任务完成时写入 Memory 文件（task-{id}.json）
- [x] **MEM-03**: 系统可传递上下文信息给后续任务

### Report Generation

- [ ] **RPT-01**: 系统可基于建模过程和结果生成 LaTeX 报告
- [ ] **RPT-02**: 系统可输出 PDF 格式论文报告
- [ ] **RPT-03**: 报告使用固定大纲结构 + 动态 Task 章节（IDEA.md §11.2）
- [ ] **RPT-04**: 系统支持 mcmthesis（美赛）和 cumcmthesis（国赛）模板切换（IDEA.md §11.6）
- [ ] **RPT-05**: 系统使用精细化章节依赖图进行上下文传递（IDEA.md §11.3）
- [ ] **RPT-06**: LaTeX 生成遵循科学语言规范（无 Markdown，连贯叙事，学术风格）

### Claude Code Integration

- [ ] **INTG-01**: 用户可通过 /mm-agent --problem <file> 启动工作流
- [ ] **INTG-02**: 系统继承 Claude Code 的模型配置，无需单独 API Key
- [x] **INTG-03**: 系统使用 Claude Code Skills 定义工作流入口
- [ ] **INTG-04**: 系统使用 Claude Code Agents 执行各阶段任务

## v2 Requirements

推迟实现的功能。已追踪但不包含在当前 roadmap。

### Advanced Features

- **HMML-ADV-01**: 完整 98+ 方法节点的 HMML 知识库构建
- **HMML-ADV-02**: 问题感知和方案感知双向检索
- **ACTR-ADV-01**: Modeler + Critic 双 Agent 架构（替代内部迭代）
- **ACTR-ADV-02**: 质量评分自动判断（替代固定 max_rounds）
- **EXEC-ADV-01**: Pyodide 浏览器沙盒执行
- **EXEC-ADV-02**: 高级错误恢复（代码自动修复而非重试）
- ~~**RPT-ADV-01**: 竞赛特定格式模板（MCM/ICM, CUMCM）~~ → 升级为 RPT-04
- **RPT-ADV-02**: 多语言报告支持

### Multi-Model Support

- **MMOD-01**: 支持 DeepSeek 等其他模型
- **MMOD-02**: 模型路由策略（不同阶段使用不同模型）

## Out of Scope

明确排除的功能，防止范围蔓延。

| Feature | Reason |
|---------|--------|
| Web UI (Django/Flask) | CLI-first 定位，v1 专注命令行交互 |
| 独立 Python CLI | 集成而非独立，Claude Code 插件是目标 |
| 100% MM-Agent 功能对齐 | 复刻核心流水线，不追求全面对齐 |
| 数据库持久化 | JSON 文件足够，避免额外依赖 |
| LangGraph/LangChain 编排 | GSD 框架已提供更好的 phase/plan/execute 模式 |
| 实时可视化界面 | 静态图表足够，复杂度高 |
| OAuth 登录 | 无用户系统，单用户 CLI 工具 |
| 多用户协作 | 单用户场景，竞赛参与者个人使用 |

## Traceability

哪些 phases 覆盖哪些 requirements。在 roadmap 创建时更新。

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROB-01 | Phase 2 | Pending |
| PROB-02 | Phase 2 | Pending |
| PROB-03 | Phase 2 | Pending |
| PROB-04 | Phase 2 | Pending |
| TASK-01 | Phase 3 | Pending |
| TASK-02 | Phase 3 | Pending |
| TASK-03 | Phase 3 | Pending |
| TASK-04 | Phase 3 | Pending |
| TASK-05 | Phase 3 | Pending |
| KNOW-01 | Phase 4 | Complete |
| KNOW-02 | Phase 4 | Complete |
| KNOW-03 | Phase 4 | Complete |
| MODEL-01 | Phase 5 | Complete |
| MODEL-02 | Phase 5 | Complete |
| MODEL-03 | Phase 5 | Complete |
| MODEL-04 | Phase 5 | Complete |
| MODEL-05 | Phase 5 | Complete |
| CODE-01 | Phase 6 | Complete |
| CODE-02 | Phase 6 | Complete |
| CODE-03 | Phase 6 | Complete |
| CODE-04 | Phase 6 | Complete |
| CODE-05 | Phase 6 | Complete |
| CODE-06 | Phase 6 | Complete |
| MEM-01 | Phase 3 | Pending |
| MEM-02 | Phase 3 | Pending |
| MEM-03 | Phase 3 | Complete |
| RPT-01 | Phase 7 | Pending |
| RPT-02 | Phase 7 | Pending |
| RPT-03 | Phase 7 | Pending |
| RPT-04 | Phase 7 | Pending |
| RPT-05 | Phase 7 | Pending |
| RPT-06 | Phase 7 | Pending |
| INTG-01 | Phase 1 | Pending |
| INTG-02 | Phase 1 | Pending |
| INTG-03 | Phase 1 | Complete |
| INTG-04 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-10*
*Last updated: 2026-04-10 after initial definition*