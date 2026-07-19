# HMML Runtime

本目录保存 HMML 的可复算离线评测、索引构建与 dense 检索程序。Python 3.12、uv cache 和 Hugging Face 权重只存在于 MM-Agent 专用 cache；仓库和 npm package 只发布运行程序、评测证据与唯一选中索引，不发布模型权重。

## 固定输入

- 知识源：`knowledge/hmml/hmml.json`，以递归 depth-first 顺序提取全部 method node。
- GTE：`Alibaba-NLP/gte-multilingual-base@f48be033386d222715f74de68ba1d31b51f19f3a`。
- GTE 官方代码：`Alibaba-NLP/new-impl@40ced75c3017eb27626c9d4ea981bde21a2662f4`。
- BGE-M3：`BAAI/bge-m3@6892b95fed65c899a30896eb40d619ae284d0455`。
- 编码协议：tokenizer 截断至 8192 token，取最后一层首 token（CLS），L2 归一化，保存 `float32` 矩阵；这与原 MM-Agent GTE 实现一致，并对两个候选模型保持相同评测协议。

`hmml_download.py` 只下载 JSON、tokenizer、SentencePiece、Python remote code 和 safetensors；它排除 ONNX、重复 PyTorch `.bin`、图片及文档，并输出逐文件 SHA-256 清单。

## 标签与评测

`evaluation/hmml-eval.json` 的初稿保持 `label_status: "proposed"`，不能用于正式 benchmark。最终标签必须由两个与生成会话不同的强模型 session 独立逐项复核；任一 reviewer 提出的 Important 问题都按保守原则修正，两者再对修订后的固定内容 hash 做最终确认。复核工件、模型/effort/session、固定内容 hash、逐项结论和修改记录全部保存在 `evaluation/reviews/` 与 `hmml-adjudication.json`，最终状态诚实记录为 `ai-adjudicated`。只改 status 字符串、复用生成会话或缺少逐项证据均会被 `hmml_benchmark.py` 拒绝。完整协议见 `evaluation/REVIEW.md`。

`evaluation/hmml-smoke.json` 是经过人工审阅但仍保持 `proposed` 的回归烟雾集，只验证典型方法能否被召回。它的单目标、语言分布和强方法线索使其不具备模型选型效力；正式 benchmark 必须使用独立的双语配对、多相关概念和 hard-negative 数据集。

正式模型选型集至少包含 15 组同义中英查询（即至少 30 条 query）、45 个不同的相关方法概念和 20 组真正多相关的方法集合；每组必须有一个主方法和 hard negative。只有真正能完成该子任务的方法才计为 relevant，仅可作松弛、上界、诊断或基线的方法不能为了扩大 Recall 分母而加入；因此个别查询允许只有一个 relevant。benchmark 对每个 query 保存完整概念排名和 score，`hmml_recalculate.py` 可直接从已提交 ranking 重新计算 Recall@5、MRR、主方法命中率与 hard-negative 误命中率；汇总报告另记录首次模型加载加首个 query 的冷启动、模型 cache 字节数和逐 query 延迟分布。两个报告必须引用同一个评测文件 SHA-256，`hmml_select.py` 才允许选择与发布。

选择规则固定为：若 GTE Recall@5 距两个模型中的最佳结果不超过 0.03，选择 GTE；否则选择 BGE-M3。选择程序将胜出报告的三个索引文件原子复制到 `knowledge/hmml/`，并生成 `evaluation/summary.json` 与 `hmml-manifest.json`。

本次真实评测结果为：GTE Recall@5 `0.8125`、MRR `0.7660268`、冷启动 `7.800 s`、模型与固定代码共 `627,912,706` bytes、平均查询延迟 `74.646 ms`；BGE-M3 Recall@5 `0.6875`、MRR `0.6984718`、冷启动 `13.316 s`、模型 `2,293,234,427` bytes、平均查询延迟 `158.242 ms`。最终选择 GTE，发布 768 维、132-row、`float32` 层级索引；完整精度和逐查询排名以 `evaluation/summary.json` 与 `evaluation/results/` 为准。

## 专用环境与复算

Windows 默认 cache 根为 `%LOCALAPPDATA%\mm-agent`，其中：

- `python\`：uv 管理的项目外 Python 环境；
- `python-installations\`：uv 管理的 Python 3.12；
- `uv\`：uv package cache；
- `huggingface\hub\`：固定 revision 的模型快照；
- `model-manifests\`：逐文件下载 hash 清单。

运行命令必须设置 `UV_PROJECT_ENVIRONMENT`、`UV_PYTHON_INSTALL_DIR` 与 `UV_CACHE_DIR` 到上述专用目录，并从 `runtime/` 执行 `uv run --locked --no-sync pytest`。不得激活或读取用户项目 `.venv`。

`hmml_build.py` 可从固定 snapshot 重建索引；`hmml_review.py prepare` 输出独立复核所需的固定 hash 与完整 query ID；`hmml_review.py validate` 校验最终复核证据。`hmml_benchmark.py` 强制将候选索引目录与可提交 evidence 目录分离：两套候选 `.npy` 只写入 MM-Agent 专用 cache，仓库只保存 `query-results.json` 与 `model-report.json`。`hmml_select.py` 只接受两个真实报告和通过证据校验的 `ai-adjudicated` 数据集，并从外部候选目录原子发布胜出的三件套。各脚本的 `--help` 是参数的可执行定义。

## 在线检索与降级

`mm_agent_hmml` 先验证知识源、索引 tuple、模型 revision/hash、可选 remote-code revision/hash 和 embedding 维度，再调用 `hmml_retrieve.py`。每次调用写出 `retrieved-methods.json`，包含：

- knowledge source path、version/hash；
- 原始 query 与 retrieval mode；
- model/revision、index revision/hash 和 embedding 维度；
- 按 rank 排列的候选方法与 score；
- `degraded_reason`。

如果专用 Python、模型 snapshot 或 remote-code snapshot 不可用，Tool 不下载、不读取项目虚拟环境，也不阻塞建模，而是执行本地 BM25 加中英文关键词扩展，并明确写入 `retrieval_mode: "bm25"` 与降级原因。检索候选是 Modeler 的证据，不是自动方法结论。
