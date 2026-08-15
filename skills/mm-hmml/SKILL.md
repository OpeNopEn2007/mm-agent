---
name: mm-hmml
description: 为当前建模 Attempt 检索 HMML 方法候选。
---

# HMML 检索

只在当前 Modeler Manifest 声明的 retrieved-methods 路径下调用 `mm_agent_hmml`。原样记录它返回的 provenance。相似度排序候选；在 modeling 候选中说明所选方法的假设、变量、方程和被否决的替代方案。BM25 结果是有效的降级证据，但必须保留降级标注，不得冒充稠密检索结果。