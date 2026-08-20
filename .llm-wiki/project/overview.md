# 项目概览

Research Publishing Harness 是一个本地优先、证据驱动的研究发布系统。它通过共享 Research Content Package，为 Article 与 X 两个平级分支提供来源、Claim、Evidence、Lineage、Privacy、Review 和 Publish Gate。

当前仓库已实现 V1 本地发布主线、V2 text-only Browser Adapter，以及 V2.1 Visual Publishing。V2.1 以 Canonical Markdown Article Package 为图片事实源，支持静态 PNG/JPEG/WebP 的确定性规范化、显式 X Asset Handoff、受限 Browser 上传和 Source/Composer/Public 分层 Receipt 证据。真实 X 发布、X API、GIF/视频/动态图、多图、自动选图与 LLM Wiki V2.2 Adapter 均未实现。

## 已实现模块

- `contracts`：跨语言 JSON Schema。
- `core`：Package、Gate、状态、Artifact 与内容指纹。
- `article-harness`：Canonical Markdown Article 流程。
- `x-harness`：Single、Thread、Reply、Manual Adapter、Browser V2/V2.1 Plan 与 Approval。
- `skills`：Article 与 X 两个薄 Skill。
- `visual-publishing-v2-1`：Visual Slot、静态图片规范化、Manifest、Package Digest、受限上传、公开媒体证据。

## 事实权威

1. 用户当前决策与确认。
2. 当前源码、测试和验证输出。
3. 已确认设计文档与实施计划。
4. `.llm-wiki` 生命周期索引。
