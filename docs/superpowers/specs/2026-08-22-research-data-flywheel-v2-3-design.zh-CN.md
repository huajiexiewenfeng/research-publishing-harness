# Research Publishing Harness V2.3：研究数据飞轮设计规格

- 日期：2026-08-22
- 状态：已批准
- 批准日期：2026-08-22
- 批准依据：用户在本任务中明确回复 `确认 V2.3 设计规格`
- 批准边界：批准设计规格，不包含实现计划或代码开发授权
- 目标版本：V2.3
- 上一版本：V2.2 LLM Wiki Memory Adapter
- 外部运行时：`llm-wiki-runtime 0.2.x`
- 主要领域：`enterprise-agent-runtime`

## 1. 结论

V2.3 不把 Research Publishing Harness 扩展成第二套知识库，也不把所有历史文件直接塞进 Query。

本版本选择 **Evidence-backed Research Increment Graph**：

1. 本地 Canonical Research/Article Package 是事实源；
2. 每次可识别的研究进展形成一个 `Research Increment`；
3. 完整、不可变的证据自动归档到 Evidence Layer；
4. 可查询的语义记录由证据派生，但只有经过一次 Human Confirmation 后才进入默认研究记忆；
5. `llm-wiki-runtime` 继续拥有确定性存储、索引、权限、上下文加载和日志；
6. Query 采用“摘要索引逐层召回，再精确加载正文”的渐进形式，默认不会加载整个目录；
7. 文章、X Article、Thread、Single、Reply、Gist 和 GitHub 文档只是同一研究增量的不同 `Publication Expression`；
8. 人工筛选的公开反馈可形成候选洞察和下一轮研究问题，但互动数据本身不构成技术事实。

V2.3 的核心产物不是“更多内容”，而是一个可追溯、可修订、可复利的研究系统。

## 2. North Star

英文：

> Turn continuous AI systems research into a governed, compounding body of knowledge—where every validated research increment, article, post, and human-selected feedback becomes traceable input to the next research cycle.

中文：

> 把持续的 AI 系统研究沉淀为一个受治理、可复利的知识体系，让每次研究增量、文章、推文和人工筛选的反馈，都成为下一轮研究可追溯的输入。

North Star 的判断标准不是发布数量或互动量，而是：

- 新研究是否建立在可追溯的旧研究之上；
- 旧结论发生变化时，系统能否说明变化关系和依据；
- 文章和推文是否可以回到同一个 Canonical Research Increment；
- 下一次写作或研究是否能只加载相关摘要和证据；
- 未经审阅的推断是否被挡在默认记忆之外。

## 3. 背景与问题

### 3.1 V2.2 已经解决的问题

V2.2 已经完成：

- Harness 到 `llm-wiki-runtime` 的受限 Adapter；
- Profile、SCP、Ingest Mapping 与 Runtime 版本绑定；
- Memory Plan、Approval、Receipt、Resume 和 fail-closed；
- Publication Receipt、Feedback Snapshot、Candidate Insight 的受控写入；
- 确定性 Query 与 Context Snapshot；
- Harness 不直接写 `.llm-wiki` 的边界。

这些能力证明了“可审计地写入和读取长期记录”是可行的。

### 3.2 V2.2 的不足

V2.2 的首个真实记录主要回答：

- 某次发布是否发生；
- Receipt、URL、digest 和验证强度是什么；
- 某条反馈是否被人工选择；
- 某个候选洞察来自哪条反馈。

它还不能完整回答：

- 这次研究到底提出了什么问题；
- 哪些 claim 已验证、观察、推断、假设或仅是计划；
- 文章全文、本地母稿、图片、来源和边界说明在哪里；
- X Thread 与母稿之间是什么派生关系；
- 新结论是细化、验证、反驳还是取代旧结论；
- 哪些开放问题应该进入下一次研究；
- 为什么某个历史结论会被当前 Query 召回。

如果只继续增加 Publication Receipt，系统会变成发布审计库，而不是研究数据飞轮。

### 3.3 关键修正：Query 不是整目录加载

`llm-wiki-runtime` 的读取能力分为两步：

1. `find-records` 只对 Profile 声明的 frontmatter 字段做精确匹配，返回受限记录引用；
2. `load-context-pack` 按精确 `path/ref` 加载需要的正文。

V2.3 在其上增加受控的研究摘要索引记录。默认 Query 使用：

```text
Track/View 精确定位
→ 加载小型 Index Catalog 摘要
→ 选择少量 Index Shards
→ 选择少量语义记录
→ 仅在确有需要时加载证据正文
```

因此：

- `find-records` 即使需要检查允许范围内的 frontmatter，也不会把这些 Markdown 正文全部送入上下文；
- 默认 Query 禁止对研究记录目录使用宽泛 `glob`；
- 数据量增长时，索引按确定性规则分片，而不是让单个 Index 无限增长；
- Active View 是索引可见性规则，不是“把活动目录一次性加载”的同义词。

## 4. 目标与非目标

### 4.1 目标

1. 把 Research Increment 建模为研究飞轮的第一等聚合单元。
2. 保存完整、不可变、可校验的 Canonical Evidence。
3. 生成紧凑、可查询、证据可追溯的 Semantic Memory。
4. 以一次 Human Confirmation 同时确认语义选择和授权 Runtime 晋升。
5. 支持 Working、Accepted、Published 三个研究可见区。
6. 支持版本演进、取代、细化、反驳、验证和撤回。
7. 把同一研究的文章、图片、X 表达、发布回执和反馈连接起来。
8. 用分层摘要索引控制 Query 上下文规模。
9. 在故障、重试和外部状态不确定时保持 fail-closed。
10. 为下一轮研究输出有来源的开放问题，而不是自动把互动指标变成结论。

### 4.2 非目标

V2.3 不做：

- 向量数据库或新的语义搜索引擎；
- 把 Harness 变成 `llm-wiki-runtime` 的替代品；
- 自动选择全部 X 回复或互动作为记忆；
- 自动把高互动内容提升为“真相”；
- 自动修改研究代码、Skills 或运行时；
- 自动发布，或绕过现有 Publication Plan/Approval；
- 把 Working 草稿加入默认 Query；
- 静默批量迁移历史材料；
- 跨用户、跨 workspace 的隐式知识合并；
- 云端同步和多人并发编辑协议。

## 5. 已确认的设计决策

| 决策 | 结论 |
| --- | --- |
| 事实源 | 本地 Canonical Research/Article Package |
| 记忆结构 | Evidence Layer + Semantic Memory Layer |
| 证据归档 | Finalized/Accepted 终态自动归档 |
| 语义晋升 | Human Review 后进入默认 Query |
| 聚合单位 | Research Increment |
| 默认可见区 | Accepted + Published |
| Working | 保存，但仅显式回顾时读取 |
| 演进模型 | 不可变 revision + 显式 evolution edge |
| 发布模型 | Publication Expression，不把平台版本当事实源 |
| 发布内容 | `intended_content` 与 `observed_content` 分离 |
| Query | 摘要索引逐层召回，再精确加载 |
| Runtime 边界 | Harness/Skill 永不直接写 `.llm-wiki` |
| 人工门 | 每次语义晋升一次确认 |
| 反馈 | 只接收人工选择，默认 `data_only` |
| Track 策略 | `enterprise-agent-runtime` 是默认主线；`agent-skills`、`thinking-skills` 可作为支线 |

## 6. 方案比较

### 6.1 方案 A：只保存 Artifact

优点：

- 最完整；
- 最接近原始事实；
- 实现简单。

缺点：

- Query 噪音和 token 成本持续增长；
- 缺少 claim、问题和演进关系；
- 很难直接回答“当前主线是什么”。

结论：Artifact 必须保留，但不能独立承担语义记忆。

### 6.2 方案 B：只保存 Semantic Graph

优点：

- Query 紧凑；
- 关系清晰；
- 适合持续研究。

缺点：

- 容易丢失原文、图片、边界和发布现场；
- 语义压缩错误难以审计；
- 可能把模型总结误当事实。

结论：不能牺牲证据完整性换取查询便利。

### 6.3 方案 C：Evidence-backed Research Increment Graph

优点：

- 证据完整；
- 语义记录可查询；
- 每条记录可回到证据；
- 研究演进和多渠道发布能统一建模；
- 可通过摘要索引控制 Query 成本；
- 与现有 Runtime/Approval 边界一致。

代价：

- 契约和生命周期比 V2.2 更严格；
- 需要设计 Index、Delta、Promotion 和 Evolution；
- 需要处理历史迁移与索引重建。

结论：选择方案 C。增加的复杂度位于确定性 Harness 契约层，而不是散落到各个 Skill。

## 7. 总体架构

V2.3 分为四个平面。

### 7.1 Evidence Plane

职责：

- 捕获终态研究资产；
- 保存原始 workspace-relative path、digest、media type、角色和来源；
- 将文件复制到内容寻址对象存储，避免 Canonical Package 清理后证据丢失；
- 生成不可变 Evidence Snapshot；
- 不产生新的技术结论。

### 7.2 Knowledge Plane

职责：

- 表达 Research Increment、Claim Version、Decision、Open Question；
- 表达 Publication Expression 和 Evolution Edge；
- 生成受控摘要字段；
- 构建 Mainline/History/Working/Publication/Feedback 索引；
- 每条语义记录必须引用 Evidence Snapshot。

### 7.3 Control Plane

职责：

- 生成 Semantic Memory Delta；
- 执行确定性校验；
- 形成 Promotion Plan；
- 接受一次 Human Confirmation；
- 生成 Approval 和 Receipt；
- 管理 stale、partial、resume 与 reconciliation。

### 7.4 Runtime Plane

职责：

- `resolve-config`；
- `find-records`；
- `load-context-pack`；
- `copy-source`；
- `write-record`；
- `register-artifact`；
- `append-log`；
- Profile、SCP、Mapping 和路径权限；
- 锁、原子写和 Runtime envelope。

Harness 不复制这些职责。

### 7.5 逻辑数据流

```text
Working Research
  → Finalized Canonical Research/Article Package
  → Immutable Evidence Snapshot
  → Semantic Delta + Human Confirmation
  → Accepted Research Increment + Summary Index
  → Canonical Visual / X Expressions
  → Published Evidence
  → Human-selected Feedback
  → Candidate Insight
  → Semantic Memory Delta
  → Human Confirmation
  → Runtime Semantic Records + Summary Index
  → Next Research Context / Next Open Question
```

这是一条研究自我改进循环，但不是无人监督的自修改系统。任何进入默认长期语义记忆的变化仍需 Human Confirmation。

## 8. 身份与不可变性

### 8.1 Workspace Identity

所有本地引用绑定：

- `workspace_id`；
- `workspace_root_fingerprint`；
- `profile_id`；
- `scope_id`；
- `domain_id`；
- `track_id`。

序列化记录不保存绝对路径。绝对路径只在当前执行中通过已确认 Workspace Identity 解析。

### 8.2 Stable ID 与 Revision

`increment_id` 是跨版本稳定身份，例如：

```text
inc_enterprise_agent_runtime_memory_boundary
```

`revision` 是不可变内容版本，例如 `1`、`2`。

所有进入路径模板的 ID 必须是 Harness 生成或校验的 ASCII safe ID，满足 `[a-z0-9][a-z0-9_-]{0,95}`。不得把标题、URL、平台文本或用户输入原样拼入路径。

每个 Research Increment 必须且只能声明一个 primary `track_id`。跨 Track 影响通过显式 `informed_by/refines/...` Edge 表达，不复制同一 Increment，也不把支线记录静默混入 `enterprise-agent-runtime` 的 Mainline Index。

以下变化必须产生新 revision：

- thesis 或 research question 实质变化；
- claim statement/status/evidence 变化；
- boundary 改变；
- canonical article 内容改变；
- 来源集合改变；
- 新增会影响结论的实验结果。

以下变化不产生新内容 revision：

- 新增一个 Publication Expression；
- Publication 从 intended 变为 observed；
- 新增反馈；
- 发布状态变化；
- 索引重建。

这些变化通过独立事件或记录附着到已有 revision。

### 8.3 Digest

所有 V2.3 JSON 契约使用规范化 JSON 计算 digest：

- UTF-8；
- key 确定性排序；
- 数组保持契约顺序；
- digest 字段本身不参与自己的 digest；
- 统一格式 `sha256:<64 lowercase hex>`。

## 9. 生命周期与可见区

### 9.1 Working

定义：正在形成、尚未被接受为当前研究上下文的材料。

规则：

- 可显式保存 Evidence Snapshot；
- 自动保存的 Working Evidence 只存在于本地 Evidence Plane，不因此进入 Runtime 语义记录；
- 若要让 Working 摘要可被 `view=working` 检索，也必须经过同一套 Semantic Promotion 和 Human Confirmation，但只更新 Working Index；
- 不自动进入 `mainline` 索引；
- 默认 Query 不读取；
- 标准 Memory Query 只有在 `view=working` 或明确 retrospective 时才读取已经晋升的 Working 摘要；
- 尚未晋升的 Working Evidence 只能在用户给出明确 artifact/package 引用时作为本地材料检查，不能被普通记忆召回发现；
- Working 内容不能被 Publication Skill 当成已验证事实。

### 9.2 Accepted

定义：通过 RCP gate、边界检查，并由 Human-confirmed Promotion Plan 接受为当前研究上下文的 revision。

规则：

- 进入默认 `mainline` 索引；
- 可作为文章/X 表达的 Canonical Source；
- claim status 仍保持 `verified/observed/inferred/hypothesis/planned`，Accepted 不等于全部 verified；
- 必须能回到 Evidence Snapshot。

### 9.3 Published

定义：Accepted revision 至少绑定一个终态 Publication Expression。

规则：

- Published 是发布生命周期，不提升 claim 的证据等级；
- `finalized/published` Receipt 可建立 Published；
- `outcome_unknown/verification_conflict` 只能建立相应不确定表达，不能把 revision 标为已公开验证；
- 同一 revision 可绑定多个语言和渠道表达。

### 9.4 Superseded 与 Retracted

- Superseded 记录保留在 History Index，默认 Mainline 指向后继版本；
- Retracted 记录、撤回理由和证据永久保留；
- Retracted 不进入默认 Mainline；
- 如果用户显式询问历史或争议，Query 可加载；
- 任何 Index 都不能物理删除历史事实来表达撤回。

## 10. 核心契约

所有契约默认：

- `additionalProperties: false`；
- 含 `schema_version`；
- 含自己的 canonical digest；
- 时间使用 UTC ISO-8601；
- 引用使用 stable ID + revision/digest；
- 未知值显式为 `null` 或枚举状态，不用含糊字符串。

### 10.1 ArtifactRefV2

```json
{
  "schema_version": "2.3",
  "role": "canonical_article",
  "workspace_relative_path": "packages/pkg_123/article.md",
  "object_path": "memory/evidence/objects/sha256/ab/abcdef...",
  "digest": "sha256:abcdef...",
  "media_type": "text/markdown",
  "byte_size": 12345,
  "canonical": true,
  "privacy_classification": "internal"
}
```

约束：

- `workspace_relative_path` 只能位于 WorkspaceStore allow-list；
- 路径不得包含 `..`、符号链接或绝对路径；
- `object_path` 必须由 digest 确定；
- 同 digest 对象重复捕获返回 `already_exists`，但必须重新校验 bytes/digest；
- 二进制资产不会进入 Query 正文，除非有明确的文本化描述或 Alt Text。

### 10.2 ResearchEvidenceSnapshotV1

字段：

- `evidence_snapshot_id`；
- `increment_id`；
- `increment_revision`；
- `capture_event`；
- `capture_kind`；
- Workspace Identity；
- `artifact_refs[]`；
- `source_refs[]`；
- `privacy_classification`；
- `capture_policy_version`；
- `captured_at`；
- `snapshot_digest`。

`capture_event`：

- `working_checkpoint`；
- `research_package_finalized`；
- `article_finalized`；
- `publication_intent_approved`；
- `publication_receipt_terminal`；
- `feedback_selected`；
- `candidate_insight_created`。

Evidence Snapshot 是 append-only。后续修正创建新 Snapshot，不覆盖旧 Snapshot。

### 10.3 ResearchIncrementRevisionV1

字段：

- `increment_id`；
- `revision`；
- `track_id`；
- `title`；
- `research_question`；
- `thesis`；
- `summary`；
- `document_manifest_refs[]`；
- `tags[]`；
- `claim_refs[]`；
- `decision_refs[]`；
- `boundary_refs[]`；
- `open_question_refs[]`；
- `source_refs[]`；
- `evidence_snapshot_refs[]`；
- `predecessor_refs[]`；
- `created_at`；
- `content_digest`。

约束：

- `summary` 是 Human-promoted 语义摘要，供 Index 使用；
- `summary` 不能包含 Evidence 中没有支撑的新结论；
- `increment_id + revision` 唯一且 create-only；
- 每个 Accepted revision 至少有一个 Evidence Snapshot；
- research question 和 thesis 不允许为空。

### 10.4 ClaimVersionV1

字段：

- `claim_id`；
- `version`；
- `statement`；
- `claim_status`；
- `evidence_refs[]`；
- `boundary_refs[]`；
- `increment_ref`；
- `evolution_refs[]`；
- `summary`；
- `claim_digest`。

`claim_status` 沿用 RCP：

- `verified`；
- `observed`；
- `inferred`；
- `hypothesis`；
- `planned`。

Semantic Delta 不得将 claim 提升为高于 Canonical RCP 的状态。发布成功、点赞或回复数量都不能提升 claim status。

### 10.5 ResearchDecisionV1

记录研究中已经作出的架构或方法决定：

- `decision_id`；
- `statement`；
- `rationale`；
- `alternatives[]`；
- `evidence_refs[]`；
- `increment_ref`；
- `status: active|superseded|retracted`；
- `decision_digest`。

Decision 与 Claim 分离，因为“我们决定采用 X”不等同于“X 在所有环境下为真”。

### 10.6 OpenQuestionVersionV1

字段：

- `question_id`；
- `version`；
- `question`；
- `why_it_matters`；
- `origin_refs[]`；
- `candidate_next_actions[]`；
- `status: open|investigating|answered|deferred|closed`；
- `answered_by_ref`；
- `question_digest`。

只有 Human-promoted Open Question 进入 Mainline Index。模型自动生成的问题先留在 Delta。

### 10.7 ResearchEvolutionEdgeV1

关系类型：

- `supersedes`；
- `refines`；
- `contradicts`；
- `validates`；
- `retracts`；
- `informed_by`。

字段：

- `edge_id`；
- `from_ref`；
- `to_ref`；
- `relationship`；
- `rationale`；
- `evidence_refs[]`；
- `reviewed_by`；
- `reviewed_at`；
- `edge_digest`。

约束：

- `supersedes/retracts` 必须影响 Mainline Index；
- `contradicts` 不自动撤回任一方；
- `informed_by` 不能被当作验证关系；
- edge 的两端必须在 Promotion 前可解析。

### 10.8 PublicationExpressionV1

字段：

- `expression_id`；
- `increment_ref`；
- `channel`；
- `language`；
- `derivation_type`；
- `claim_refs[]`；
- `visual_refs[]`；
- `intended_content`；
- `observed_content`；
- `verification_level`；
- `platform_refs`；
- `publication_receipt_ref`；
- `published_at`；
- `expression_digest`。

`channel`：

- `article`；
- `x_article`；
- `x_thread`；
- `x_single`；
- `x_reply`；
- `gist`；
- `github_article`。

`derivation_type`：

- `original`；
- `translation`；
- `compression`；
- `adaptation`。

`intended_content` 至少包含：

- approved Plan ref/digest；
- 本地内容 path/digest；
- 预期 item 顺序；
- 链接与视觉资产引用。

`observed_content` 至少包含：

- 浏览器公开页或用户报告来源；
- 实际 URL/platform id；
- observed digest；
- 实际顺序；
- 媒体和链接验证；
- 未匹配、缺失或意外内容。

`verification_level`：

- `planned`；
- `manual_recorded`；
- `public_verified`；
- `outcome_unknown`；
- `conflict`。

约束：

- intended 与 observed 永不互相覆盖；
- public verified 只能来自满足现有发布验证契约的 Receipt；
- 翻译、压缩和改写不得提升原 claim status；
- 若表达引入新的 thesis，必须建立新 Increment revision，而不是伪装成派生表达。

### 10.9 SemanticMemoryDeltaV1

字段：

- `delta_id`；
- `increment_ref`；
- `base_catalog_digest`；
- `evidence_snapshot_refs[]`；
- `proposed_operations[]`；
- `generated_by`；
- `generated_at`；
- `policy_version`；
- `delta_digest`。

operation 类型：

- `add_record`；
- `add_revision`；
- `add_edge`；
- `change_lifecycle`；
- `attach_publication`；
- `attach_feedback`；
- `open_question`；
- `close_question`；
- `retract_record`。

每个 operation 必须：

- 列出目标 stable ID；
- 列出完整拟写入内容或其 digest；
- 列出 Evidence refs；
- 声明对 Mainline/History/Working 索引的影响；
- 通过 claim status、privacy、lineage 和 path 校验。

Delta 是 proposal，不是记忆。它不进入默认 Query。

### 10.10 SemanticPromotionReviewV1

字段：

- `review_id`；
- `delta_id`；
- `delta_digest`；
- `accepted_operation_ids[]`；
- `rejected_operation_ids[]`；
- `rejection_reasons[]`；
- `reviewer`；
- `reviewed_at`；
- `review_digest`。

Review 可以删除或降级 operation，不能在没有新 Evidence 的情况下强化 claim。

### 10.11 MemoryPromotionPlanV2

字段：

- `kind: research_increment_promotion`；
- Plan identity/digest；
- Workspace Identity；
- Profile/SCP/Mapping digests；
- Runtime requirement；
- Evidence Snapshot refs/digests；
- Delta/Review refs/digests；
- 当前 Catalog digest；
- 拟写入的 immutable records；
- 拟写入的新 generation Shards；
- 拟原子切换的 Catalog；
- 精确动作序列；
- 预期最终 Catalog/Shard digests；
- `planned_at`。

Plan 完整显示本次会进入默认记忆的内容。用户一次确认：

```text
确认 Research Promotion Plan sha256:<digest>
```

这一次确认同时表示：

1. 接受 Review 中选中的语义变化；
2. 授权 Harness 通过 Runtime 执行该 Plan。

Plan 任一绑定项变化，Approval 立即 stale。

### 10.12 MemoryPromotionReceiptV2

Receipt 记录：

- Approval；
- 每一步开始/完成/失败/不确定状态；
- Runtime envelope 摘要；
- create-only 与 already-exists 结果；
- 写入 record refs；
- 更新前后 Index digests；
- reconciliation requirement；
- terminal status；
- Receipt digest。

Receipt 不能把 partial 或 uncertain 描述成 complete。

### 10.13 ResearchContextSnapshotV2

字段：

- `query_id`；
- `query_intent`；
- `track_id`；
- `view`；
- `index_refs/digests`；
- `selected_summary_refs[]`；
- `selected_record_refs[]`；
- `selected_evidence_refs[]`；
- `context_items[]`；
- `risk_flags[]`；
- `token/record budgets`；
- `selection_rationale`；
- `query_status`；
- `snapshot_digest`。

Context Snapshot 允许后续文章 Package 绑定“当时究竟读取了哪些记忆”。

### 10.14 QueryableCanonicalDocumentV1

完整文章、研究说明和重要 Markdown 不能只剩摘要与路径。V2.3 将已批准进入 Runtime 的文本资产投影为一个 create-only Document Manifest 和若干 create-only Text Chunks。

Manifest 字段：

- `document_id`；
- `document_role`；
- `increment_ref`；
- 原始 `ArtifactRefV2`；
- `full_content_digest`；
- `chunk_policy_version`；
- `chunks[]`；
- `language`；
- `privacy_classification`；
- `instruction_policy`；
- `manifest_digest`。

每个 chunk descriptor 包含：

- `chunk_id`；
- `ordinal`；
- `record_path`；
- `chunk_digest`；
- `char_start/char_end`；
- `heading_path[]`；
- `byte_size`。

约束：

- `ArtifactRefV2.digest` 保留原始 bytes；`full_content_digest` 对按版本化策略解码为 UTF-8、移除可选 BOM 并统一换行为 LF 的文本计算；
- 无法按声明编码无损解码的资产只保留 Evidence Object，不生成 Text Chunks；
- 分块优先使用 Markdown heading/block 边界，再按确定性字符上限切分；
- chunks 按 ordinal 无丢失、无重复地重建规范化全文；
- chunk body 是 Canonical Evidence 的逐字确定性切片，不生成新结论；
- Manifest 本身不嵌入全文；
- 自动 Evidence Capture 只写本地对象；只有 Human-confirmed Promotion 才把 Manifest/Chunks 写入 Runtime；
- 默认 Query 先读 Manifest，再按 heading、chunk descriptor 和问题选择有限 chunks；
- 只有用户明确要求全文或任务确实需要全文时，才可在预算内加载全部 chunks；
- 视觉二进制不转成正文；Index/Manifest 只引用经过审阅的 Alt Text、visual purpose、claim refs 和 Evidence Object。

### 10.15 ResearchLifecycleEventV1

Lifecycle 与 content revision 分离。每个事件都是 create-only：

- `event_id`；
- `increment_ref`；
- `event_seq`；
- `previous_event_ref`；
- `event_type`；
- `prior_state`；
- `resulting_state`；
- `evidence_refs[]`；
- `approval_ref`；
- `receipt_ref`；
- `occurred_at`；
- `event_digest`。

`event_type`：

- `working_checkpointed`；
- `package_finalized`；
- `accepted`；
- `publication_attached`；
- `superseded`；
- `retracted`。

约束：

- `event_seq` 在同一 Increment 内从 1 单调递增，`previous_event_ref` 形成无分叉链；
- 当前 Working/Accepted/Published/Superseded/Retracted 状态按 event chain 确定性推导，时间戳不承担排序职责；
- Publication attachment、supersede 和 retract 不修改 `ResearchIncrementRevisionV1`；
- 非法状态转换 fail-closed；
- `accepted/retracted` 必须绑定 Human-confirmed Promotion Approval；
- `publication_attached` 必须绑定 terminal Publication Receipt，并保留其验证强度。

## 11. 本地 Evidence 存储

V2.3 继续使用 Publishing Workspace，不把用户研究记忆写入源码仓库。

```text
<publishing-workspace>/
  packages/
    <package_id>/...
  articles/
  x/
  receipts/
  feedback/
  memory/
    evidence/
      objects/
        sha256/
          <first-two-hex>/
            <full-hex>
      snapshots/
        <evidence_snapshot_id>/
          manifest.json
    increments/
      <increment_id>/
        lifecycle-events.jsonl
        revisions/
          <revision>/
            increment.json
    deltas/
    reviews/
    plans/
    approvals/
    receipts/
    queries/
  .llm-wiki/
```

说明：

- `packages/articles/x/receipts/feedback` 保持现有 Canonical/Execution 资产职责；
- `memory/evidence/objects` 是内容寻址、write-once 的证据对象；
- Snapshot manifest 保存原始 workspace-relative path 与对象路径；
- 文本、JSON、Markdown、YAML 和视觉二进制均可归档；
- Query 默认只读取晋升后的语义记录，不直接遍历 Evidence Object Store；
- `.llm-wiki` 仍只允许 Runtime 管理。

## 12. Runtime 记录与摘要索引

### 12.1 语义记录路径

```text
.llm-wiki/domains/research-publishing/
  tracks/<track_id>/
    increments/<increment_id>/revisions/<revision>/summary.md
    increments/<increment_id>/lifecycle/<event_id>.md
    documents/<document_id>/manifest.md
    documents/<document_id>/chunks/<ordinal>-<digest-hex>.md
    claims/<claim_id>/versions/<version>.md
    decisions/<decision_id>.md
    questions/<question_id>/versions/<version>.md
    publications/<expression_id>.md
    evolution/<edge_id>.md
    indexes/
      catalog.md
      generations/<generation>/
        mainline/shards/<shard_id>-<digest-hex>.md
        history/shards/<shard_id>-<digest-hex>.md
        working/shards/<shard_id>-<digest-hex>.md
        publication/shards/<shard_id>-<digest-hex>.md
        feedback/shards/<shard_id>-<digest-hex>.md
```

### 12.2 新增 Profile record types

- `research_increment`；
- `claim_version`；
- `research_decision`；
- `open_question`；
- `publication_expression`；
- `research_evolution_edge`；
- `canonical_document_manifest`；
- `canonical_document_chunk`；
- `research_lifecycle_event`；
- `research_index_catalog`；
- `research_index_shard`。

业务语义记录全部 `create_only`。

Index Catalog/Shard 是由已晋升记录确定性投影出的可再生派生记录，但两者的写策略不同：

- Shard 使用 generation/digest 寻址并保持 `create_only`；
- 每个 track 只有一个稳定路径 Catalog；它使用 `update_allowed`，并同时指向该 track 所有 View 的活动 generation；
- Catalog 更新必须绑定前置 digest，并在 Promotion 最后提交；
- 旧 Catalog 始终指向旧 generation 的 immutable Shards，因此新 Shard 写入不会提前改变 Query 可见内容。

### 12.3 Index 摘要结构

Catalog 只保存：

- `index_id`，规范形式为 `<track_id>:research`；
- `track_id`；
- 当前 `generation`；
- `views`，其中每个 View 只包含 shard id/path/digest、主题摘要、时间范围、entry count 和 status/category tags；
- generation/digest。

Shard 只保存每条记录的：

- stable ref；
- record path/digest；
- title；
- Human-promoted summary；
- tags；
- claim status 摘要；
- lifecycle status；
- evolution target；
- updated/accepted/published time；
- evidence availability；
- document manifest availability。

Index 不复制文章全文或完整 Evidence。

Shard/Catalog 的摘要只能：

- 由已晋升记录中的 Human-promoted summary、tags 和状态字段确定性聚合；或
- 作为显式 Semantic Delta 内容接受 Human Confirmation。

Index 投影阶段不得临时生成未经审阅的新语义总结。

### 12.4 分片与增长控制

分片规则必须确定性、可测试并写入 Index Policy Version。建议 V2.3 默认：

- 在同一 track generation 内，按 `view + calendar quarter` 建基础 shard；
- 单 shard 达到 entry 数或 byte 上限时，按 stable ID 排序后确定性拆分；
- 每次投影使用新的 generation，并将 Shard 写入 generation/digest 寻址的 create-only 路径；
- Catalog 只含 shard 级摘要；
- Query 每次最多选择配置允许的 shard 数；
- 超预算时返回 `context_budget_exceeded`，不退化成全目录加载。

具体阈值是实现配置，不改变上述架构约束。阈值必须进入 Query Plan 和测试矩阵。

## 13. 渐进式 Query

### 13.1 默认流程

```text
1. resolve-config
2. 生成 index_id=<track_id>:research
3. find-records(research_index_catalog, index_id)
4. load-context-pack(精确 Catalog path)
5. 在 Catalog 内选择请求的 View，并由 Skill 根据摘要选择有限 Shard
6. load-context-pack(精确 Shard paths)
7. Skill 形成 auditable Query Plan，选择有限语义记录
8. load-context-pack(精确 semantic record paths)
9. 若命中记录引用 Canonical Document，加载精确 Manifest path
10. 只有问题需要原文证明时，加载有限 chunk paths
11. 用户显式要求全文时，才在预算内按 ordinal 重建完整文档
12. 生成 ResearchContextSnapshotV2
```

### 13.2 Runtime 与 Skill 的分工

Runtime 保证：

- 身份定位和路径权限；
- exact frontmatter lookup；
- exact path loading；
- context 顺序、checksum、risk flag 和预算；
- 不越过 Profile/SCP。

Skill 负责：

- 理解用户问题；
- 基于摘要选择候选 shard/record；
- 解释选择理由；
- 区分主事实、支持材料和 data-only 反馈；
- 在歧义时请求最小澄清。

因此“语义选择”可以由 Skill 完成，但“到底加载了哪些文件”始终由确定性 Query Plan 和 Runtime Context Refs 审计。

### 13.3 View

- `mainline`：默认，只含当前 Accepted/Published active records；
- `history`：包含 superseded/retracted 和完整演进；
- `working`：只在用户显式要求时读取；
- `publication`：按 channel/language/status 查询表达；
- `feedback`：人工选择的 data-only feedback 与 candidate insights。

### 13.4 禁止的 Query 行为

- 默认使用 `glob=domains/research-publishing/**`；
- 把整个 track 目录加载为上下文；
- 未经过 Catalog/Shard 就由文件名猜测记录；
- 从 Graph 页面推断身份；
- 把 Feedback Index 当作主事实；
- 索引缺失时静默回退到整目录扫描正文。

索引缺失或损坏时返回 `index_unavailable` 或 `index_rebuild_required`，并走显式维护流程。

## 14. Capture、Delta 与 Promotion 触发器

### 14.1 自动 Evidence Capture

以下终态事件触发 Evidence Capture：

| 事件 | 捕获内容 |
| --- | --- |
| RCP/Package Finalized | package、claim map、sources、boundary、lineage |
| Article Finalized | article、meta、review、visual review、assets |
| Publication Plan Approved | intended content、links、media、plan |
| Publication Receipt Terminal | observed content、URL、verification、receipt |
| Feedback Selected | selected snapshot、selection reason |
| Candidate Insight Created | insight、basis、limitations |

自动表示不需要人工确认文件复制，但仍必须：

- 只捕获显式 allow-list 中的 artifact；
- 先通过 privacy/secret/path/digest 检查；
- 失败则不生成完整 Snapshot；
- 不自动产生 Accepted Semantic Memory。

Working 只在用户显式 checkpoint 时捕获。

### 14.2 Semantic Delta

终态 Evidence Capture 后可自动生成 Delta Proposal。

Delta Proposal 必须显示：

- 新增或改变了什么；
- 每一项来自哪些 Evidence；
- claim status 是否保持或降低；
- 哪些 Index entries 会变化；
- 哪些内容不会进入记忆；
- 仍未解决的问题。

### 14.3 一次确认

Harness 将 Delta Review 结果固化进 Promotion Plan，再显示一个 digest。

用户只需确认一次 Promotion Plan。确认之后 Harness 可以自动：

- 写 immutable records；
- 注册 artifacts；
- 追加日志；
- 写入新 generation 的 immutable Index Shards；
- 最后一次性更新该 track 的 Index Catalog；
- 生成 Receipt。

任何内容变化都要求新 Plan 和新确认。

## 15. Promotion 顺序与原子可见性

Promotion 在读取 `base_catalog_digest` 前获取 workspace/track 级互斥锁，并一直持有到 terminal Receipt 落盘。系统内所有语义晋升必须经过 Harness；直接调用 Runtime 修改这些记录属于不受支持的外部写入。

执行顺序：

```text
validate workspace/profile/scp/mapping/runtime
→ validate evidence objects and snapshot digests
→ acquire promotion lock and validate base catalog digest
→ persist approved local promotion assets
→ copy-source
→ write immutable semantic records
→ write immutable document manifests/chunks
→ register artifacts
→ append promotion log
→ write new generation-addressed index shards
→ commit index catalog LAST
→ finalize receipt
```

“单 Catalog last”是 V2.3 的原子可见性边界：

- 新语义记录即使已经写入，只要 Catalog 尚未提交，就不会进入默认摘要检索；
- 新 generation 的 Shard 已写但 Catalog 尚未引用时属于不可见 staged projection；
- 旧 Catalog 继续引用旧 immutable Shards，不会观察到新 generation 的半成品；
- Mainline/History/Working/Publication/Feedback 五个 View 随同一个 Catalog 一次切换，不存在部分 View 提前可见；
- Catalog 的前置 digest 与 Plan 不一致时，Approval stale；
- Harness 在最终写 Catalog 前再次校验旧 digest；如果锁规则被外部写入破坏则 fail-closed；
- Catalog 提交成功后，Receipt 才能标记 semantic promotion complete。

### 15.1 幂等与恢复

- `write-record create_only + already_exists`：重新校验 digest 后视为幂等成功；
- Evidence object 已存在：必须校验对象 digest/bytes；
- 已确认完成的 step 在 Resume 时跳过；
- step 未开始可安全重放；
- step 成功但本地状态未落盘的窄窗口按 Runtime 命令语义处理。

### 15.2 register-artifact 不确定窗口

Runtime 0.2.x 的 `register-artifact` 尚无强 idempotency key。

如果进程在 Runtime 成功后、本地 step 状态写入前崩溃：

- 状态标记 `MEMORY_INGEST_RECONCILIATION_REQUIRED`；
- 不更新 Index Catalog；
- 不声称 complete；
- 人工核对 Artifact Index 后再生成 reconciliation decision；
- 后续可建议 Runtime 增加 idempotent registration key，但 V2.3 不自行绕过 Runtime。

## 16. Publication Expression 与发布闭环

### 16.1 同一研究，多种表达

一个 Research Increment revision 可以派生：

- 中文母稿；
- 英文长文；
- X Article；
- 6 条 Thread；
- 单条观点；
- 针对他人观点的 Reply；
- Gist/GitHub 长期链接；
- 架构图和解释图。

它们共享 claim refs 和 evidence refs，但保留各自语言、压缩程度、发布验证与实际内容。

### 16.2 Intended 与 Observed

发布前：

- Publication Plan 是 intended truth；
- 本地 article/thread 文本是 intended content；
- media manifest 是 intended visual。

发布后：

- Browser Public Verification 或 user report 形成 observed content；
- URL、平台 ID、顺序、媒体和内容匹配分别记录；
- observed 不一致时建立 `conflict`，不覆盖 intended；
- 后续修复发布形成新的 Receipt/Expression observation。

### 16.3 反馈

反馈进入飞轮前必须人工选择，且记录：

- 为什么值得保留；
- 原文与公开 URL；
- 作者和观测时间；
- 可用指标；
- data-only 分类；
- 对应的 Publication Expression；
- 它可能影响的 claim/question。

反馈可以生成 `candidate insight` 或 `open question proposal`，但不能直接改变 verified claim。

## 17. Skills 与 Harness 边界

### 17.1 Article Skill

负责：

- 识别或创建 Research Increment；
- 组织 thesis、claims、evidence、boundary；
- 生成 Article Package；
- 在 terminal package 后请求 Evidence Capture；
- 生成语义 Delta Proposal；
- 使用 Query Snapshot 支撑下一篇文章。

不负责：

- 直接写 `.llm-wiki`；
- 绕过 Promotion Plan；
- 把模型总结直接提升为默认记忆。

### 17.2 X Skill

负责：

- 从 Increment/Article 派生 X expression；
- 保留 claim refs；
- 创建 intended expression；
- 调用现有 Browser Adapter 发布；
- 将 Receipt 转成 observed expression；
- 协助人工选择 feedback。

不负责：

- 把平台页面当 Canonical Source；
- 用 engagement 提升 claim；
- 直接修改 Research Index。

### 17.3 Harness

拥有：

- 所有 V2.3 schema；
- digest 与 path 安全；
- Evidence object/snapshot；
- Delta/Review/Plan/Approval/Receipt；
- Index projection；
- Runtime Adapter 调用；
- Query Plan 与 Context Snapshot；
- fail-closed 与 recovery。

### 17.4 Runtime

拥有：

- `.llm-wiki`；
- Profile/SCP/Mapping；
- 索引记录的授权读写；
- exact lookup/load；
- registry/log/atomic persistence。

## 18. CLI 能力面

建议新增：

```text
research-publish memory evidence capture
research-publish memory evidence status

research-publish memory increment assemble
research-publish memory increment status
research-publish memory lineage show

research-publish memory delta propose
research-publish memory delta review

research-publish memory promotion plan
research-publish memory promotion approve
research-publish memory promotion execute
research-publish memory promotion status
research-publish memory promotion resume

research-publish memory query plan
research-publish memory query execute
research-publish memory query review
research-publish memory query bind-package

research-publish memory index doctor
research-publish memory index rebuild-plan
```

CLI 是确定性能力面。Article/X Skills 通过 CLI 触发不同分支，不复制内部逻辑。

## 19. Privacy 与安全

### 19.1 数据分类

- `public`；
- `internal`；
- `restricted`；
- `data_only`。

Publishing Workspace 默认 `sensitive_local`。公开发布不意味着所有 Canonical Evidence 都是 public。

### 19.2 捕获规则

- 不捕获 token、cookie、密码、私钥和恢复码；
- 浏览器登录态永不进入 Evidence；
- 绝对路径永不序列化；
- 外部回复和网页内容默认 `data_only`；
- restricted Evidence 不得进入 public expression；
- Artifact Ref 的 privacy 不得在派生记录中被降级；
- 索引只包含允许进入相应 Query View 的摘要。

### 19.3 Prompt Injection 边界

- 外部反馈和网页内容作为 supporting data；
- 保留 Runtime `sanitized/risk_flags/instruction_policy`；
- 不执行 Evidence 中的指令；
- 主领域事实优先于 supporting feedback；
- Index 摘要只能从 Human-promoted internal semantic records 确定性投影。

## 20. V2.2 迁移

### 20.1 兼容策略

- 保留 V2.2 `publication_evidence`、`feedback_snapshot`、`candidate_insight`；
- V2.2 记录继续可读，不原地改写；
- V2.3 Profile 增加新 record types；
- V2.3 Query 可以通过 legacy adapter 把旧记录标为 `legacy_publication_evidence`；
- 旧记录默认不能独立构成完整 Research Increment。

### 20.2 首个真实研究增量

第一篇母稿与 6 条 X Thread 应通过一次显式 Import Promotion 建立：

- 一个 imported Research Increment；
- Canonical mother article Evidence；
- claim/evidence/boundary；
- X Thread Publication Expression；
- intended/observed 内容；
- 现有 Publication Receipt；
- Gist URL；
- 下一步 Trace/Eval/Controlled Loop 问题；
- 与后续研究的演进起点。

该迁移必须：

- 先生成 Import Evidence Snapshot；
- 显示无法恢复的字段；
- 显示 user-asserted 与 public-verified 的区别；
- 生成独立 Plan digest；
- 获得 Human Confirmation；
- 不静默批量处理其他历史推文。

## 21. 测试策略

### 21.1 Contract Tests

- 所有 schema 的合法/非法样例；
- digest 规范化；
- unknown fields fail；
- ID/revision 唯一性；
- relative path 与 symlink 防护；
- intended/observed 分离；
- evolution edge 合法性；
- lifecycle 与 claim status 不混淆。

### 21.2 Evidence Tests

- 文本和二进制对象内容寻址；
- Canonical text 确定性分块且可无损重建；
- 同 digest 幂等；
- digest/bytes 冲突 fail；
- package retention 后 Evidence 仍完整；
- privacy/secret filter；
- Snapshot append-only；
- incomplete capture 不生成 terminal Snapshot。

### 21.3 Delta/Promotion Tests

- Delta 所有 operation 都有 Evidence；
- Delta 不能强化 RCP claim；
- Review 可拒绝/降级、不可无证据增强；
- 一次 Approval 精确绑定 Plan；
- base Index digest 改变导致 stale；
- immutable records 先写、Catalog 最后；
- partial records 不进入 Mainline；
- uncertain registration 触发 reconciliation；
- Resume 跳过已确认 step。

### 21.4 Index/Query Tests

- Profile 通过 `index_id=<track_id>:research` exact lookup 找到唯一 Catalog；
- Catalog 只包含摘要和 shard refs；
- Shard 确定性分片、generation/digest 寻址并保持 create-only；
- 默认 Query 不产生 broad glob；
- Catalog → Shard → Record 两阶段/三阶段加载；
- Record → Document Manifest → limited Chunks 渐进加载；
- token、record、shard budget；
- index missing/corrupt fail-closed；
- Working 默认不可见；
- Superseded/Retracted 只在显式 View 可见；
- data-only Feedback 不覆盖主事实；
- Query Snapshot 可绑定 Article Package。

### 21.5 End-to-End

```text
RCP/Article terminal
→ Evidence Capture
→ Increment Assemble
→ Delta Proposal
→ Human-confirmed Promotion
→ Runtime Records + Index
→ Query
→ X Publication Expression
→ Receipt
→ Selected Feedback
→ Candidate Insight/Open Question
→ Next Increment
```

真实 Runtime integration 只使用临时 workspace；CI 不访问用户真实 `.llm-wiki`、Chrome 或 X。

## 22. 成功指标

V2.3 的成功指标：

1. 100% finalized Publication Expression 能定位到 Increment revision。
2. 100% 默认 Query 语义记录能追溯到 Evidence Snapshot。
3. 100% 已晋升 Canonical Text 能通过 Manifest/Chunks 校验并重建原文。
4. 100% Mainline Index entry 来自 Human-promoted semantic record。
5. 100% Query 通过 Index + exact paths，不默认整目录加载。
6. 任何 claim 的当前版本、历史版本和演进关系可重建。
7. 任何文章或 X 表达可区分 intended 与 observed。
8. Working、unreviewed Delta、retracted record 不进入默认 Mainline。
9. partial/uncertain Promotion 不会产生可见 Index 提交。
10. 下一轮文章可以绑定精确 ResearchContextSnapshot。
11. 系统不会把点赞、浏览量或回复数量当作技术真值。

发布频率、followers 和 engagement 可以作为内容运营观测，但不是本版本的正确性指标。

## 23. 风险与依赖

### 23.1 Index 摘要漂移

风险：Index summary 与正文不一致。

控制：

- summary 来自 Human-promoted semantic record；
- Index 由已晋升字段确定性投影；
- Index entry 绑定 record digest；
- Query 加载正文时校验 digest；
- Doctor 可重建并比较 Index。

### 23.2 Index 持续增长

风险：摘要也可能积累成大上下文。

控制：

- Catalog/Shard 分层；
- immutable generation Shards + 单 Track Catalog 原子切换；
- 确定性分片；
- shard/record/token budget；
- view、track、时间和状态过滤；
- 禁止超预算后退化为全目录加载。

### 23.3 人工确认疲劳

风险：每天多次小更新导致频繁确认。

控制：

- Evidence Capture 自动；
- 同一 Increment 的相关 semantic operations 合并为一个 Promotion Plan；
- 一次确认同时完成 Review 和执行授权；
- 不将发布 Receipt 的每个技术步骤都暴露为确认。

### 23.4 语义压缩造成过度结论

控制：

- claim status ceiling；
- source-backed refs；
- boundary 保留；
- Delta 显示变更；
- feedback 仅 data-only；
- Human Confirmation。

### 23.5 Runtime 依赖

V2.3 依赖 Runtime 0.2.x 的：

- exact `find-records`；
- exact `load-context-pack`；
- Profile record lookup；
- create-only/update-allowed；
- checksums、policy 和 JSON envelope。

推荐的后续 Runtime 0.3 能力：

- `register-artifact` idempotency key；
- first-class conditional update / expected prior digest；
- 可选的 Index projection helper。

这些不是引入第二套搜索引擎的理由。

## 24. 验收标准

1. Canonical Research/Article Package 被定义为一级事实源。
2. Research Increment 是稳定聚合身份，并支持 immutable revision。
3. Evidence Snapshot 能完整保存文本与二进制资产。
4. 已晋升 Canonical Text 拥有 create-only Manifest/Chunks，并可按 digest 无损重建。
5. 所有持久引用只保存 workspace-relative path。
6. Evidence Capture 与 Semantic Promotion 明确分离。
7. Finalized Evidence 可以自动归档。
8. 未经 Human Confirmation 的语义 Delta 不进入 Mainline。
9. 一次确认同时绑定 Review 选择和 Promotion 执行。
10. Working 默认不可查询。
11. Accepted 与 Published 不改变 claim status 语义。
12. Publication Expression 同时保存 intended 和 observed。
13. 发布验证冲突不会覆盖 intended truth。
14. Translation/Compression 不得增强 claim。
15. Feedback 只有人工选择后才能进入 Evidence。
16. Engagement metric 不构成技术证据。
17. Evolution 支持 supersedes/refines/contradicts/validates/retracts/informed_by。
18. Retracted/Superseded 记录可审计但不在默认 Mainline。
19. Runtime 语义业务记录 create-only。
20. Index 是可再生派生记录，绑定 semantic record digest。
21. Index Shard 按 generation/digest create-only，每个 Track 的单一 Catalog 是所有 View 的唯一活动 generation 指针。
22. Query 先加载 Catalog 摘要，再加载有限 Shard 和精确记录。
23. Query 只在命中后加载 Document Manifest 和有限 Chunks，全文加载必须显式且受预算约束。
24. 默认 Query 不使用整个研究目录的 broad glob。
25. Index 超预算时 fail-closed，不回退成整目录正文加载。
26. Catalog 在 Promotion 中最后提交。
27. Partial/uncertain execution 不产生 Mainline 可见性。
28. Approval 在 Workspace/Profile/SCP/Mapping/Runtime/Evidence/Index 任一变化后 stale。
29. Resume 对已确认步骤幂等。
30. register-artifact 不确定窗口进入 reconciliation。
31. ResearchContextSnapshot 能绑定回 Article Package。
32. V2.2 legacy records 保留、可读且不原地改写。
33. 首篇母稿与 6 条 Thread 可通过显式 Import Promotion 建立首个完整 Increment。
34. CI 不访问用户真实 Wiki、Chrome 或 X。
35. Harness 和 Skills 永不直接写 `.llm-wiki`。
36. Lifecycle Events 使用单调 sequence 和 previous-event chain，发布、取代或撤回不修改 immutable revision。
37. 系统可以提出下一轮问题和 Delta，但不得自动修改研究代码、Skills、claim status 或绕过既有发布/晋升确认门。
38. 默认主研究 Track 是 `enterprise-agent-runtime`；Skills/Thinking Skills 支线拥有独立 Index，跨 Track 关系必须显式。

## 25. 需求—设计—验收追踪

| ID | 已确认需求 | 设计落点 | 验收证据 |
| --- | --- | --- | --- |
| R1 | 研究数据飞轮 North Star，而不是发布计数器 | 第 2、3、22 节 | AC 1–3、31 |
| R2 | Canonical Local Package 是事实源 | 第 5、8、11 节 | AC 1、3–5 |
| R3 | Evidence 完整归档，Semantic Memory 紧凑可查 | 第 7、10、11 节 | AC 3–9 |
| R4 | Research Increment 是第一等聚合单位 | 第 8、9、10.3 节 | AC 2、11、17 |
| R5 | Working/Accepted/Published 分区 | 第 9、12、13.3 节 | AC 10–11、18 |
| R6 | immutable revision + 显式演进和撤回 | 第 8.2、9.4、10.7、10.15 节 | AC 17–18、36 |
| R7 | 文章、X、Gist、GitHub 是同一研究的不同表达 | 第 10.8、16 节 | AC 12–14、33 |
| R8 | intended content 与 observed content 分离 | 第 10.8、16.2 节 | AC 12–13 |
| R9 | 保存全文、本地路径、图片和来源，但 Query 不膨胀 | 第 10.1、10.14、11、13 节 | AC 3–5、22–25 |
| R10 | `llm-wiki-runtime` 的摘要索引式渐进检索 | 第 3.3、12、13 节 | AC 20–25 |
| R11 | Skill 有语义，Harness 有治理，Runtime 有确定性访问 | 第 7、17 节 | AC 19–21、35 |
| R12 | Semantic Memory 经一次 Human Confirmation 晋升 | 第 10.9–10.12、14.3 节 | AC 8–9、28 |
| R13 | 人工筛选反馈，互动指标不是真值 | 第 10.8、16.3、19 节 | AC 15–16 |
| R14 | 原子可见、stale、幂等、resume 和 reconciliation | 第 15 节 | AC 26–30 |
| R15 | 首篇母稿和 6 条 Thread 进入首个真实 Increment | 第 20.2 节 | AC 33 |
| R16 | Loop 具有研究自我改进能力，但不是无人监督自修改 | 第 7.5、14、16.3 节 | AC 37 |
| R17 | Enterprise Agent Runtime 是主线，Skills/Thinking Skills 是独立支线 | 第 1、5、8.2、12 节 | AC 38 |

### 25.1 有意留到实现计划的参数

以下项目不改变架构语义，可在实现计划中根据现有 Runtime 限制和测试数据确定具体数值：

- `max_chars_per_chunk`；
- `max_chars_per_index_record`；
- `max_shards_per_query`；
- `max_semantic_records_per_query`；
- `max_document_chunks_per_query`；
- Shard 的 entry/byte threshold；
- V2.3 实现实际锁定的 Runtime patch version。

约束已经确定：

- 所有数值进入版本化 Policy、Plan digest 和测试；
- 超预算必须 fail-closed；
- 不允许以“数值尚未确定”为由回退到整目录正文加载；
- Runtime patch version 变化会使旧 Approval stale；
- 参数只能影响性能和召回范围，不能改变生命周期、证据等级、权限或 Human Gate。

除这些实现期参数外，本规格没有尚未选择的架构分支。

## 26. 完整性结论

本设计把 V2.2 的“可审计发布记忆”扩展为 V2.3 的“研究数据飞轮”，同时守住四条边界：

1. **证据不丢失**：完整资产进入不可变 Evidence Plane；
2. **语义不失控**：只有 Human-promoted records 进入默认记忆；
3. **Query 不膨胀**：摘要 Index Catalog/Shard 逐层召回，正文精确加载；
4. **Runtime 不复制**：Harness 管治理和业务契约，`llm-wiki-runtime` 管确定性知识访问。

本规格已经过用户明确批准，V2.3 设计阶段正式关闭。实现计划和代码开发属于下一阶段，只有在用户另行授权后才能开始。
