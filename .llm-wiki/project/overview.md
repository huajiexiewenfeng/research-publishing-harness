# 项目概览

Research Publishing Harness 是一个本地优先、证据驱动的研究发布系统。它通过共享 Research Content Package，为 Article 与 X 两个平级分支提供来源、Claim、Evidence、Lineage、Privacy、Review 和 Publish Gate。

当前仓库已实现 V1 本地发布主线、V2/V2.1 Post Browser Adapter、V3 X Article Browser Publishing，以及 V2.2 LLM Wiki Memory Adapter。V2.2 以 `research-publishing` Domain 和 `research_track` 隔离研究记忆，支持受审 Query → Package 1.1、Publication Checkpoint、Human-selected Feedback、Candidate Insight、精确批准 Ingest 与下一次 Query。真实 X 发布、X API、GIF/视频/动态图、多图、自动选图、自动反馈监控和云/团队记忆仍未实现。

## 已实现模块

- `contracts`：跨语言 JSON Schema。
- `core`：Package、Gate、状态、Artifact 与内容指纹。
- `article-harness`：Canonical Markdown Article 流程。
- `x-harness`：Single、Thread、Reply、Manual Adapter、Browser V2/V2.1 Plan 与 Approval。
- `skills`：Article 与 X 两个薄 Skill。
- `visual-publishing-v2-1`：Visual Slot、静态图片规范化、Manifest、Package Digest、受限上传、公开媒体证据。
- `x-article-harness`：受限 X Articles 文档、一次发布屏障与公开验证。
- `memory-v2-2`：Package 1.1、Query/Feedback/Insight/Ingest 契约、受限 Runtime Adapter 与可恢复 Receipt。

## 事实权威

1. 用户当前决策与确认。
2. 当前源码、测试和验证输出。
3. 已确认设计文档与实施计划。
4. `.llm-wiki` 生命周期索引。
