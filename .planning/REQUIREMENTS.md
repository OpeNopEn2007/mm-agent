# Requirements: MM-Agent in Claude Code

**Defined:** 2026-04-10
**Core Value:** 输入非结构化赛题 → 自动化数学建模全流程 → 输出符合要求的论文报告

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation

- [ ] **FND-01**: Claude Code Skill 框架可正确加载和执行 mm-agent 工作流
- [ ] **FND-02**: .planning/ 目录结构按照 GSD 规范创建和管理
- [ ] **FND-03**: 配置文件 (config.json) 正确设置工作流参数（granularity、parallelization、verification）
- [ ] **FND-04**: Git 追踪规划文档，阶段输出可回溯

### Problem Input

- [ ] **PROB-01**: 用户可通过 Skill 命令启动数学建模工作流
- [ ] **PROB-02**: 系统可接收非结构化赛题文本并解析为结构化问题描述
- [ ] **PROB-03**: 问题解析结果存储为 problem.md 供后续阶段使用
- [ ] **PROB-04**: 上下文传递机制确保问题信息在各阶段间传递

### Agent Coordination

- [ ] **AGNT-01**: Planner Agent 可分析问题并生成建模规划 (plan.md)
- [ ] **AGNT-02**: Modeler Agent 可根据规划推导数学模型 (model.md)
- [ ] **AGNT-03**: Programmer Agent 可将模型转换为可执行 Python 代码
- [ ] **AGNT-04**: Reviewer Agent 可验证结果是否符合预期
- [ ] **AGNT-05**: 智能体间通过文件传递上下文，实现阶段隔离
- [ ] **AGNT-06**: 设置最大迭代限制防止无限循环

### Simulation

- [ ] **SIM-01**: Python 运行时环境可正确执行生成的代码
- [ ] **SIM-02**: 数值模拟结果以结构化格式存储 (results.json)
- [ ] **SIM-03**: 模拟输出包含可视化图表 (plots/figures)
- [ ] **SIM-04**: 代码验证子流程在模拟前检查代码正确性

### Report Generation

- [ ] **RPT-01**: 系统可基于模板生成结构化报告
- [ ] **RPT-02**: 报告包含标准章节（摘要、模型、结果、结论、参考文献）
- [ ] **RPT-03**: 格式验证智能体检查报告符合提交规范
- [ ] **RPT-04**: 最终输出为 PDF 格式（通过 Pandoc/LaTeX）

### Verification

- [ ] **VRF-01**: 每阶段结束有验证门控，确认输出质量
- [ ] **VRF-02**: 验证失败时提供明确错误信息和建议
- [ ] **VRF-03**: 用户可选择跳过验证（YOLO 模式）

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Interactive Features

- **INT-01**: 用户可在阶段间干预和调整方向
- **INT-02**: 支持用户反馈循环，修正智能体输出
- **INT-03**: 进度实时显示，用户可见当前阶段状态

### Templates

- **TMP-01**: 预置数学建模模板库（优化类、预测类、评价类等）
- **TMP-02**: 用户可自定义模板

### Extended Outputs

- **EXT-01**: 支持多种报告格式（Word、HTML）
- **EXT-02**: 支持多语言报告（中英文）

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Web UI | Claude Code 是 CLI 工具，优先 CLI 原生集成 |
| 团队实时协作 | 上下文同步复杂度高，优先单用户 |
| 外部模型 API 调用 | 优先本地执行，控制成本和延迟 |
| 数据库持久化 | 文件系统足够，避免额外依赖 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FND-01 | Phase 1 | Pending |
| FND-02 | Phase 1 | Pending |
| FND-03 | Phase 1 | Pending |
| FND-04 | Phase 1 | Pending |
| PROB-01 | Phase 1 | Pending |
| PROB-02 | Phase 1 | Pending |
| PROB-03 | Phase 1 | Pending |
| PROB-04 | Phase 1 | Pending |
| AGNT-01 | Phase 2 | Pending |
| AGNT-02 | Phase 2 | Pending |
| AGNT-03 | Phase 3 | Pending |
| AGNT-04 | Phase 4 | Pending |
| AGNT-05 | Phase 1 | Pending |
| AGNT-06 | Phase 1 | Pending |
| SIM-01 | Phase 3 | Pending |
| SIM-02 | Phase 3 | Pending |
| SIM-03 | Phase 3 | Pending |
| SIM-04 | Phase 3 | Pending |
| RPT-01 | Phase 4 | Pending |
| RPT-02 | Phase 4 | Pending |
| RPT-03 | Phase 4 | Pending |
| RPT-04 | Phase 4 | Pending |
| VRF-01 | Phase 1 | Pending |
| VRF-02 | Phase 1 | Pending |
| VRF-03 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-10*
*Last updated: 2026-04-10 after initial definition*