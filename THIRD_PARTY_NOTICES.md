# Third-Party Notices

The MIT License in this repository applies to the original `mm-agent` code and documentation. It does not replace the terms attached to third-party assets.

## MM-Agent research

- Paper: [MM-Agent: LLM-based Multi-Agent Systems for Mathematical Modeling](https://arxiv.org/abs/2505.14148)
- Reference implementation: [usail-hkust/LLM-MM-Agent](https://github.com/usail-hkust/LLM-MM-Agent)

The paper and reference implementation informed the four-stage workflow, HMML retrieval, task memory, Actor-Critic review, computation, and reporting design. This repository is an independent engineering implementation.

## OpenCode

- Project: [anomalyco/opencode](https://github.com/anomalyco/opencode)
- Documentation: [opencode.ai/docs](https://opencode.ai/docs/)

OpenCode is the v1 Agent host. Its code and packages remain under their own terms.

## LaTeX templates

- `templates/cumcmthesis/` comes from [latexstudio/CUMCMThesis](https://github.com/latexstudio/CUMCMThesis). The bundled upstream material does not contain an explicit license file. Its presence in this unpublished local release candidate is not a claim that public redistribution is authorized.
- `templates/mcmthesis/` comes from [latexstudio-org/mcmthesis](https://github.com/latexstudio-org/mcmthesis) and retains its bundled LaTeX Project Public License v1.3c-or-later notice.

## HMML and embedding model

- The checked-in HMML catalog and derived index record their content hashes and evaluation provenance under `knowledge/hmml/` and `runtime/evaluation/`. The catalog does not carry a separate upstream license notice in this repository. Public redistribution of that content therefore remains an explicit release-review item.
- The selected embedding model is [Alibaba-NLP/gte-multilingual-base](https://huggingface.co/Alibaba-NLP/gte-multilingual-base) at the pinned revision recorded in `runtime/hmml-manifest.json`. Its model card identifies the license as Apache-2.0.
- Model weights are not redistributed in this npm package. Downloaded model files remain in the user's external MM-Agent cache and retain their own upstream terms.
- The npm package includes only the derived GTE index needed at runtime. The GTE/BGE candidate evaluation corpus remains in Git and is excluded from the package.

## Benchmark input

MM-Bench problem statements and datasets used by the Golden Case are kept outside the repository and npm package. Their provenance files explicitly set `redistribution: false`.
