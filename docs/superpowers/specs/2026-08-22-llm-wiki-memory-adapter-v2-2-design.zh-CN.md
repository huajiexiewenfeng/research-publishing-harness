# LLM Wiki Memory Adapter V2.2 设计规格

## 文档状态

- 日期：2026-08-22
- 状态：书面规格已确认；是否进入实施计划由用户另行授权
- 确认日期：2026-08-22
- 适用仓库：`research-publishing-harness`
- 外部运行时：`llm-wiki-runtime`
- 前置基线：Visual Publishing V2.1、X Article Browser Publishing V3
- 首版范围：受控 Query → Publication → Human-selected Feedback → Approved Ingest 研究记忆闭环

## 1. 摘要

Research Publishing Harness 已经能将研究内容组织为可审查、可冻结、可发布和可验证的 Article、X Post/Thread/Reply 与 X Article，但每一轮内容形成仍主要依赖当前输入。V2.2 增加长期研究记忆，使历史研究上下文可以进入下一轮内容形成，公开发布和人工挑选的反馈也可以成为后续研究候选。

这不是“让 Skill 自己存点东西”。V2.2 维持三个清晰责任面：

> Skill 拥有领域语义；Harness 拥有计划、摘要、状态、人类闸门与审计；Runtime 拥有确定性知识访问和写入。

公开反馈不会直接成为事实，记忆也不能静默改写已经冻结或批准的发布内容。V2.2 实现的是一个受控、自省且可追溯的研究改进循环，而不是无人监管的自修改系统。

## 2. 背景与问题证据

### 2.1 已有稳定连接点

Visual Publishing V2.1 已经明确保留：

- Research Package 的 Claim、Evidence 和 Lineage。
- `claim_refs`。
- Article Package、Visual Manifest 和 Publication Receipt digest。
- 未来 Runtime 可以返回的 `context_refs`。
- “新记忆不能修改冻结 Publication Plan”的不变量。

V3 又完成了 Canonical Article Package 到 X Article Publication Receipt 的闭环。因此 V2.2 不需要改变发布事实源，只需在 Package 冻结前增加 Query，并在 Receipt 之后增加显式 Feedback/Ingest 分支。

### 2.2 当前重复基础设施问题

领域 Skill 如果自己保存记忆，通常会逐渐重复实现：

- 存储路径和文件命名。
- provenance、checksum 和 source copy。
- context budget、排序和截断。
- 私密路径过滤。
- 原子写入、幂等和失败恢复。
- 跨 Domain 读取和写入策略。

这些属于确定性基础设施，不应散落在 Article/X Skills 中。`llm-wiki-runtime` 已经提供 Profile、SCP、Ingest Mapping 与 JSON CLI，可以作为共享 Runtime。

### 2.3 RSI 边界

发布后的反馈可能影响下一轮研究，但影响必须经过：

1. 人工选择公开反馈。
2. Skill 提出 Candidate Insight。
3. 证据与边界审查。
4. 与精确内容绑定的人类批准。
5. Runtime 确定性写入。
6. 下一轮 Query 时才重新进入内容形成。

因此该闭环具有 RSI 的“观察—反思—记忆—再行动”结构，但没有跳过人的自动自修改权力。

## 3. 目标

V2.2 必须实现：

1. 在 Research Content Package 冻结前，从 LLM Wiki 查询与当前 research track 有关的长期上下文。
2. 将 Query 输入、输出、排序、预算、风险和 checksum 冻结为可审计快照。
3. 将审查通过的 `context_refs` 绑定到新的 Content Package。
4. 在发布完成后，从 Publication Receipt 创建显式 Feedback Snapshot。
5. 从 Feedback Snapshot 产生可审查而非自动成立的 Candidate Insight。
6. 经 Evidence、Boundary 和 Human Gate 后，通过 Runtime 写入长期记忆。
7. 对 already-exists、partial failure 和恢复提供诚实、幂等的 Receipt。
8. 保持 Article、Visual、X 与 X Article 现有冻结、审批、at-most-once 和公开验证语义。

## 4. 非目标

V2.2 不实现：

- 自动定时监控 X 回复、Quote、Like、Bookmark 或 View。
- 自动决定哪条反馈有价值。
- 无人批准的自动 Ingest。
- 向量数据库、Embedding 或语义检索。
- 后台 daemon、云服务、团队同步或多用户 ACL。
- 跨 Domain 写入。
- 自动修改既有知识记录或研究结论。
- 冻结后修改 Content Package、Publication Plan 或 Approval。
- 通过 X API 获取完整分析指标。
- 自动回复、编辑、删除或重新发布公开内容。

## 5. 已确认设计决策

| 主题 | 决策 |
|---|---|
| 首版范围 | 最小完整闭环，不只做 Query-only |
| Primary Domain | `research-publishing` |
| 研究隔离 | 所有长期记录包含 `research_track` |
| 首个 track | `enterprise-agent-runtime` |
| 领域语义 | Article/X Skill 拥有 |
| 计划与审计 | Research Publishing Harness 拥有 |
| 确定性读写 | `llm-wiki-runtime` 拥有 |
| 集成方式 | 受限 Runtime Adapter，不允许直接写 `.llm-wiki` |
| Query Gate | 已启用 Domain 后默认只读执行；应用上下文时审查 |
| Feedback 来源 | Human 显式选择的公开条目 |
| 外部内容 | 始终 `data_only` |
| Ingest Gate | preview + exact plan digest + Human Approval |
| 结论强度 | Feedback 只能产生 Candidate Insight |
| 冻结不变量 | 新记忆不能改变已冻结 Package/Plan/Approval |
| 失败语义 | Query 可诚实降级；Ingest partial 不得称为成功 |

## 6. 总体架构

```text
Article Skill / X Skill
        │
        │ domain semantics, claims, candidate insight
        ▼
Research Publishing Harness
        │
        │ Memory Plan, Digest, State, Gate, Receipt
        ▼
Restricted LLM Wiki Runtime Adapter
        │
        │ fixed executable + argv + JSON envelope
        ▼
llm-wiki-runtime
        │
        │ deterministic query / copy / write / log
        ▼
Publishing Workspace/.llm-wiki
```

### 6.1 为什么选择 Runtime Adapter

候选方案有三种：

1. Skill 直接运行 Runtime CLI：接入简单，但审计、超时、版本和失败恢复会散落在多个 Skill。
2. Harness 直接写 `.llm-wiki`：表面确定性，实质上复制 Runtime 并破坏边界。
3. Harness 通过受限 Adapter 调用 Runtime：集中计划、审计、安全和恢复，同时保留 Runtime 的存储所有权。

V2.2 采用第三种。它与已有 Browser Adapter 的思想一致：Harness 不拥有外部系统内部实现，只拥有一个窄、版本化、可验证的协议边界。

## 7. 端到端数据流

```text
Candidate
→ Memory Query Plan
→ Context Snapshot
→ Research Content Package(context_refs)
→ Human Review / Freeze
→ Article / Visual / X / X Article
→ Publication Receipt
├→ Publication Checkpoint Ingest Plan
└→ Human-selected Feedback Snapshot
   → Candidate Insight Proposal
   → Evidence + Boundary Review
   → Feedback Insight Ingest Plan
→ Human Approval
→ llm-wiki-runtime
→ Memory Ingest Receipt
→ Next Candidate
```

### 7.1 不变量

- Query 必须发生在 Content Package 冻结前。
- Context Snapshot 必须先审查，才能绑定 Package。
- Package 只绑定引用、checksum 和 snapshot digest，不复制私密原文到公开 artifacts。
- 任何受记忆影响的 Claim 或 Evidence 都必须通过 `source_ref` 回指已应用的 `context_ref`，不能形成不可追溯的隐性影响。
- Package、Publication Plan 或 Approval 冻结后，新记忆只能进入新的 Package。
- Publication Receipt 是 Feedback Snapshot 的父事实源。
- 外部反馈只能产生 Candidate Insight Proposal。
- Ingest 必须由 Runtime 完成；任何 direct write 均为协议违规。

## 8. Domain、Profile 与记录模型

### 8.1 Domain 与 track

首版 Profile：

```yaml
domain: research-publishing
primary_research_track: enterprise-agent-runtime
```

Domain 表示“研究发布”这一类知识的政策和记录模型；`research_track` 表示具体长期研究主线。后续可以增加 `thinking-skills`、`agent-memory`、`ai-project-harness` 或 `pdc`，但不得把不同 track 的观点默认混合。

### 8.2 记录类型

| record type | policy | purpose |
|---|---|---|
| `publication_evidence` | create-only | 已发布内容、Package 与 Receipt 的可追溯证据 |
| `feedback_snapshot` | create-only | Human 选择的公开反馈快照 |
| `candidate_insight` | create-only | 尚待后续研究验证的候选洞察 |
| `memory_event` | append-only log | Query、Apply、Ingest、Recovery 事件 |

首版不覆盖旧记录。观点演化通过新记录的 `supersedes` 或 `challenges` 引用表达。

### 8.3 建议路径

```text
.llm-wiki/domains/research-publishing/
  tracks/{research_track}/
    publications/{publication_id}.md
    feedback/{feedback_id}.md
    insights/{insight_id}.md
```

Profile 必须校验 `research_track` 和 record id 为安全 slug，拒绝路径分隔符、绝对路径、父目录和保留名称。

### 8.4 SCP

Article 与 X Skills 均声明：

- primary domain: `research-publishing`
- query context: 当前 `research_track`
- produces: `publication_evidence`, `feedback_snapshot`, `candidate_insight`
- supporting domains: 首版为空
- fallback: Runtime 不可用时继续原工作流并记录未应用记忆

## 9. Workspace 隔离

仓库中已经存在项目开发用 `.llm-wiki`。V2.2 的最终用户研究记忆不能默认写进源码仓库。

必须区分：

```text
research-publishing-harness/.llm-wiki
  = 源码、需求、验证和交接的项目开发 Wiki

<publishing-workspace>/.llm-wiki
  = 用户长期研究、发布证据和候选洞察
```

Adapter 每次调用必须显式携带：

```text
--workspace <publishing-workspace>
--profile research-publishing
```

安全规则：

- Workspace 必须解析为绝对、规范路径。
- 默认拒绝 Harness 源码根目录。
- Runtime staging、source copy 和 record path 均必须包含在 Workspace 中。
- 测试只能使用临时 Workspace。
- Receipt 保存 Workspace identity digest，而不是泄露不必要的用户绝对路径。

### 9.1 Harness artifacts 与 Runtime records

现有 `WorkspaceStore` 只允许显式顶层目录，且不访问 `.llm-wiki`。V2.2 延续这一隔离：

```text
<publishing-workspace>/memory/**
  = Harness 的 Query Plan、Snapshot、Ingest Plan、Approval、Receipt 与恢复状态

<publishing-workspace>/.llm-wiki/**
  = 只由 llm-wiki-runtime 管理的长期记录、source registry 与日志
```

实施时需要把 `memory` 加入 `WorkspaceStore` 顶层 allow-list；`feedback/**` 继续保存 Human 选择的 Feedback Snapshot。Harness 可以管理 `memory/**`，但其 `WorkspaceStore` API 不得开放 `.llm-wiki/**`。

## 10. Runtime Adapter 协议

### 10.1 启动边界

Adapter 必须：

- 从显式配置或注册 dependency 发现 executable。
- 校验 runtime version/capabilities。
- 使用 process spawn，不启用 shell。
- 只允许固定 command 与 argv schema。
- stdout 使用 Runtime 现有的版本化 JSON response envelope；结构化输入只通过 allow-list argv JSON 字段或 Workspace 内受控 staging file 传递。
- 限制执行时间、输出字节数和并发数。
- 将 stderr 视为诊断信息并脱敏。
- 拒绝 malformed JSON、额外未知 success 字段和版本不兼容。

禁止：

- `cmd /c`、PowerShell 字符串执行或 shell interpolation。
- 将用户内容拼成 executable、command、flag 名称或 shell fragment；确需传递的 JSON 值只能进入对应固定 argv value。
- 允许 Runtime 从任意 cwd 推断 Workspace。
- 将非零 exit 或部分结果解释为成功。

### 10.2 允许调用的 Runtime 能力

首版 allow-list：

- `version`
- `resolve-config`
- `load-context-pack`
- `find-records`
- `validate-mapping`
- `prepare-excerpt`
- `copy-source`
- `write-record`
- `register-artifact`
- `append-log`

`scan-scp` 仅用于 doctor/validation，不参与普通发布路径。

## 11. Query 契约

### 11.1 `MemoryQueryPlanV1`

必要字段：

```yaml
schema_version: memory-query-plan/v1
query_id:
run_id:
research_track:
purpose: candidate_enrichment | feedback_followup
primary_domain: research-publishing
allowed_paths: []
query_terms: []
context_budget:
  max_items:
  max_chars:
  max_item_chars:
ordering_policy:
profile_digest:
scp_digest:
runtime_requirement:
action: query_once
plan_digest:
```

`plan_digest` 覆盖除自身外全部确定性字段。Query terms 是数据，不得成为 command-line flag fragment。

### 11.2 `ContextSnapshotV1`

```yaml
schema_version: context-snapshot/v1
snapshot_id:
query_plan_digest:
runtime_version:
status: loaded | empty | unavailable | failed
items:
  - ordinal:
    context_ref:
    relative_path:
    content_checksum:
    excerpt_checksum:
    classification:
    risk_flags: []
excluded_count:
truncated_count:
total_chars:
snapshot_digest:
```

排序、去重和截断必须确定。相同 Workspace、Plan 和 record checksums 应产生相同 Snapshot digest。

### 11.3 Context Review 与 Package 绑定

当前 `ResearchContentPackage` 是 `schema_version: 1.0` 且 `additionalProperties: false`。V2.2 不得在 1.0 上静默增加字段，而是增加 `research-content-package/1.1`：

- 新创建的 V2.2 Package 一律使用 `schema_version: 1.1`。
- 1.1 必须包含 `memory_context`，即使状态是 `not_configured`。
- 既有 1.0 artifacts 保持可读、可用于既有发布流程，但不允许原地升级或重写。
- Contract Registry 对同一逻辑类型执行明确的 1.0/1.1 version dispatch；未知版本 fail closed。

`ResearchContentPackage 1.1` 增加：

```yaml
memory_context:
  query_plan_digest:
  context_snapshot_digest:
  context_refs: []
  status: applied | reviewed_not_applied | memory_unavailable | not_configured
  reviewer:
  reviewed_at:
```

为保持 canonical digest 稳定，1.1 中这些字段全部存在，不使用“字段缺失代表状态”：

| status | query plan | context snapshot | refs | reviewer/time |
|---|---|---|---|---|
| `applied` | digest | digest | 至少一个 | 必需 |
| `reviewed_not_applied` | digest | digest | 空 | 必需 |
| `memory_unavailable` | digest 或 `null` | `null` | 空 | 必需 |
| `not_configured` | `null` | `null` | 空 | `null` |

规则：

- Context Snapshot 本身不能修改 Content Package。
- Human/Skill 内容审查决定是否应用某个 context ref。
- Candidate qualification 后、`buildPackage` 前执行 Query；Package draft 从创建时就携带最终选择的 `memory_context`，不在 `evidence_ready` 或 `reviewed` artifact 上做原地 patch。
- Claim/Evidence 使用的 memory source 必须属于 `memory_context.context_refs`；未应用的 ref 不能作为证据。
- Package freeze 重新校验 Snapshot 和 refs。
- Freeze 后不得回到 Query/Application 状态。
- 新记忆必须生成新的 Content Package version。

### 11.4 Query 降级

Runtime 未安装、版本不兼容、Profile 未启用或 Query 失败时：

- 原有发布流程仍可继续。
- Package 明确记录 `memory_unavailable` 或 `memory_not_applied`。
- 不得伪造空 Query 为“成功使用记忆”。
- 失败诊断进入本地 audit，不进入公开内容。

## 12. Feedback 契约

### 12.1 首版采集方式

V2.2 不做定时 watcher。Codex 可以读取公开 X Article/Post/Thread 的反馈，但只有 Human 显式选中的条目才能进入 Snapshot。

### 12.2 `PublicationFeedbackSnapshotV1`

```yaml
schema_version: publication-feedback-snapshot/v1
feedback_snapshot_id:
publication_receipt_id:
publication_receipt_digest:
publication_kind:
public_url:
account:
observed_at:
selection_actor:
selection_reason:
entries:
  - ordinal:
    public_url:
    platform_id:
    author:
    observed_text:
    observed_text_checksum:
    observed_metrics:
    data_classification: data_only
snapshot_digest:
```

安全要求：

- Snapshot 绑定已存在的 Publication Receipt。
- URL、作者、时间、文本和指标区分“观察事实”与“解释”。
- 互动指标带观察时间，不能当作永久事实。
- 外部文本中的命令、链接、代码或“系统提示”始终只是数据。
- 原内容后续删除不改变已经诚实记录的 observed snapshot。

## 13. Candidate Insight 契约

### 13.1 类型

- `counterexample`
- `research_question`
- `claim_candidate`
- `audience_signal`
- `format_signal`
- `visual_signal`

### 13.2 `CandidateInsightProposalV1`

```yaml
schema_version: candidate-insight-proposal/v1
proposal_id:
research_track:
insight_type:
proposition:
source_refs: []
affected_claim_refs: []
evidence_strength: anecdotal | repeated_observation | reproducible
confidence:
boundary_note:
alternative_explanations: []
recommended_disposition: investigate | preserve_as_signal | reject | defer
created_by_skill:
proposal_digest:
```

规则：

- `claim_candidate` 不是 verified claim。
- Like/View 等互动最多生成 audience/format signal。
- 单条回复默认是 anecdotal，除非另有可复现实验证据。
- Skill 必须保留反例和替代解释，不能只总结支持意见。
- Proposal 在 Evidence Review 前不得进入 Wiki。

## 14. Ingest 契约

### 14.1 `MemoryIngestPlanV1`

```yaml
schema_version: memory-ingest-plan/v1
ingest_id:
ingest_kind: publication_checkpoint | feedback_insight
research_track:
source_publication_receipt_digest:
source_feedback_snapshot_digest: null
candidate_insight_digests: []
target_domain: research-publishing
target_profile:
record_operations: []
mapping_digest:
profile_digest:
scp_digest:
action: ingest_confirmed
plan_digest:
```

`source_publication_receipt_digest` 始终必需。`source_feedback_snapshot_digest` 在 `feedback_insight` 中是 digest，在 `publication_checkpoint` 中为 `null`；`candidate_insight_digests` 在 `feedback_insight` 中至少一个，在 `publication_checkpoint` 中为空。

这样即使尚无公开回复，也可以把已完成发布及其 Package/Receipt lineage 保存为长期 `publication_evidence`；存在有价值反馈时，再用 `feedback_insight` 保存 Feedback Snapshot 和 Candidate Insight。两种 Ingest 都需要独立 preview 与 Human Approval。

`publication_checkpoint` 可以保存任何已终止、不可再变的 Publication Receipt，但必须原样保留其证据等级。只有 `finalized` 且存在已验证 canonical public URL 的 Receipt 才能在 Wiki 中声明“公开发布已验证”；`published_unverified`、`outcome_unknown`、`verification_conflict` 或 Manual Receipt 只能记录对应有限事实，不能被提升为成功发布。

`record_operations` 只描述经过 Mapping 校验的 create-only 或 append-only 操作，不能携带任意文件路径。

### 14.2 Preview

Human Approval 前必须展示：

- 将复制的 source snapshot。
- 将创建的 record type、ID 和安全相对路径。
- 核心 proposition、evidence strength 和 boundary。
- 将追加的 audit event。
- Profile、SCP、Mapping 和 Runtime version。
- Plan digest。

### 14.3 `MemoryIngestApprovalV1`

```yaml
schema_version: memory-ingest-approval/v1
approval_id:
ingest_plan_digest:
target_domain:
target_profile:
approved_action: ingest_confirmed
approved_by:
approved_at:
expires_at:
approval_digest:
```

Approval 不能跨 Plan、Domain、Profile、Workspace 或 action 复用。任何内容、来源、mapping 或目标变化都必须重新 preview 和批准。

### 14.4 `MemoryIngestReceiptV1`

```yaml
schema_version: memory-ingest-receipt/v1
receipt_id:
ingest_plan_digest:
approval_digest:
runtime_version:
status: succeeded | already_exists | partial | failed
steps:
  - name:
    status:
    artifact_ref:
    checksum:
    error_code:
records: []
log_event_ref:
resume_cursor:
receipt_digest:
```

Receipt 是恢复事实源。`partial` 不产生“闭环完成”结论；只有所有必需步骤成功或幂等存在，状态才能 finalize。

## 15. 状态机

### 15.1 Query 状态

```text
created
→ config_resolved
→ query_planned
→ context_loaded
→ context_reviewed
→ package_bound
```

终止/降级：

```text
memory_unavailable
memory_not_applied
query_failed
```

一旦 Package 冻结，`package_bound` 不允许返回 Query 状态。

### 15.2 Feedback/Ingest 状态

```text
publication_captured
→ ingest_previewed
→ ingest_approved
→ source_copied
→ records_written
→ artifacts_registered
→ log_appended
→ finalized

feedback_captured
→ insight_proposed
→ evidence_reviewed
→ ingest_previewed
→ ingest_approved
→ source_copied
→ records_written
→ artifacts_registered
→ log_appended
→ finalized
```

异常：

```text
partial_failure
failed
approval_stale
```

从 `partial_failure` 恢复时，Harness 依据 Receipt 和 Runtime 的 already-exists 语义从最后一个安全步骤继续，不能盲目重新执行完整 Ingest。

## 16. Human Gates

V2.2 保留四道业务闸门：

1. **Context Review**：决定哪些 context refs 真正影响新的 Content Package。
2. **Feedback Selection**：Human 选择有研究价值的公开条目。
3. **Evidence Review**：区分反例、问题、观点、指标、噪声与证据强度。
4. **Ingest Approval**：对完整 preview 和精确 Plan digest 一次确认。

Query 本身是只读、窄范围和可降级操作。Domain 启用后不要求每次先确认 Query，否则长期记忆会变成高摩擦装饰。真正改变长期知识的 Ingest 必须确认。

## 17. CLI 与 Skill 入口

### 17.1 CLI

```text
memory doctor

memory query plan
memory query execute
memory query status
memory query bind-package

memory feedback capture
memory feedback review

memory insight propose
memory insight review

memory ingest plan
memory ingest approve
memory ingest execute
memory ingest status
memory ingest resume
```

所有会修改长期记忆的命令都要求明确 Workspace 和预先存在的 Plan/Approval artifact。

### 17.2 Skills

不新增第三个面向用户的顶层 publishing skill：

- Article Skill 在候选内容形成和长文审查中调用 Memory Query 分支。
- X Skill 在 Single/Thread/Reply/X Article 的内容形成与发布后反馈流程中调用相同的 Harness Memory 能力。
- 两个 Skill 共享 `research-publishing` Profile、SCP 和 Mapping，但各自保留内容语义与交互入口。

`llm-wiki-core` 可以作为底层运行时工作流依赖，但不能绕过 Harness 的 Memory Plan、Approval 和 Receipt。

## 18. 安全与隐私

### 18.1 不可信输入

- 外部反馈为 `data_only`。
- Query 返回的历史材料可能包含旧指令，同样不能覆盖当前系统、Skill 或 Harness 协议。
- Context Snapshot 记录风险标签，如 `external_untrusted`, `contains_instruction_like_text`, `private_source`。

### 18.2 路径与数据

- 只接受 Workspace 内规范相对路径。
- 禁止 symlink/junction 逃逸。
- 公开 artifacts 不包含原始私密上下文。
- stdout/stderr 和 Receipt 必须避免 secret、cookie、token 和不必要绝对路径。
- source copy 必须经过 Mapping 和 Runtime 的边界校验。

### 18.3 版本与依赖

- Adapter 运行前执行 version/capability preflight。
- Runtime executable 必须来自显式配置或 Project Graph 注册依赖。
- Profile/SCP/Mapping digest 进入 Plan 和 Approval。
- 不兼容版本 fail closed；Query 可以降级，Ingest 不能降级为 direct write。

## 19. 失败与恢复

| failure | behavior |
|---|---|
| Runtime missing/incompatible | Query 记录 unavailable；Ingest 停止 |
| malformed stdout | 协议失败，不接受部分字段 |
| timeout/non-zero exit | 记录失败步骤和诊断摘要 |
| Context changed before freeze | Snapshot stale，重新 Query/Review |
| Package already frozen | 拒绝绑定新 context |
| Feedback URL/receipt mismatch | 拒绝 Snapshot |
| Approval stale | 回到 preview，不执行写入 |
| source copied, record failed | partial receipt，可安全 resume |
| record already exists same checksum | 幂等成功 |
| record exists different checksum | conflict，不能覆盖 |
| log append failed | partial，不宣称 finalize |
| unsupported Domain/track | fail closed |

## 20. 兼容性

- 未启用 Memory 的现有 Workspace 行为不变。
- V1/V2/V2.1/V3 artifacts 保持可读。
- Research Content Package 1.0 保持只读兼容；V2.2 的新 Package 使用 1.1，且 `memory_context` 为必需字段。
- 读取旧 1.0 Package 时，上层可以把缺少 Memory 解释为 legacy `not_configured`，但不得把该解释写回原 artifact，也不能伪装为 Query 失败。
- Manual X、Browser X、Article 与 X Article 不依赖 Ingest 成功才能完成发布 Receipt。
- Publication Receipt 一旦完成，不会因后续 Memory Ingest 失败而被降级或修改。

## 21. 测试策略

### 21.1 Contract 与 Unit

- Research Content Package 1.0/1.1 version dispatch、未知版本拒绝和 legacy 只读行为。
- 所有 V1 schema 的必需字段、未知字段策略和 canonical digest。
- research track、record id、path 和 Workspace 校验。
- 确定性排序、去重、预算和截断。
- Package freeze 与 stale Context Snapshot。
- Approval 绑定、过期和失效。
- 状态机非法跳转和 Receipt canonicalization。

### 21.2 Fake Runtime

- 正常 Query 和 Ingest。
- empty、unavailable、timeout、non-zero、malformed JSON。
- already_exists、conflict、partial write、resume 和 log failure。
- Runtime 输出额外路径、超预算或错误 checksum。

### 21.3 真实 Runtime Integration

在临时 Publishing Workspace 使用真实本地 `llm-wiki-runtime` 验证：

1. `version` / `resolve-config`。
2. Profile/SCP 解析。
3. context pack 加载和 record 查询。
4. mapping validate/preview。
5. source copy。
6. record write。
7. artifact register。
8. log append。
9. already-exists 和 partial recovery。

测试不得接触用户真实 `.llm-wiki`。

### 21.4 安全测试

- executable/argv/shell 注入。
- path traversal、symlink/junction 和源码仓库误用。
- 跨 Domain 写入和未声明支持读取。
- 外部反馈 prompt injection。
- private context 泄露到公开 Package/Receipt。
- Profile/SCP/Mapping drift 后重用 Approval。

### 21.5 端到端验收

```text
seed research memory
→ query and review
→ bind new content package
→ synthetic publication receipt
├→ publication checkpoint approval and ingest
└→ human-selected feedback fixture
   → candidate insight
   → review and exact approval
   → feedback insight ingest
→ next query returns new context ref
```

该测试证明闭环，而不对真实 X 或真实研究 Wiki 产生副作用。

## 22. 可观察性与 Receipt

Harness audit 必须能回答：

- 本轮是否查询过记忆。
- 哪些 context refs 被应用或拒绝。
- 哪个 Package/Publication 产生了反馈。
- Human 选择了哪些反馈以及为什么。
- Skill 提出了什么 Candidate Insight。
- 哪个 Plan 被谁、何时批准。
- Runtime 实际写了哪些 record、artifact 和 log。
- 失败后从哪个步骤恢复。

Audit 不得把“运行成功”扩大为“研究结论正确”。

## 23. Project Graph 依赖

V2.2 引入真实跨项目依赖：

```text
research-publishing-harness
    --consumes stable JSON CLI/Profile/SCP/Mapping-->
llm-wiki-runtime
```

设计阶段已经从本地源仓库核对依赖契约。规格确认后、实施前，应通过 Project Graph human-edge 流程登记：

- source project identity
- target runtime identity
- relationship and contract surface
- verified source path/remote
- version pin or compatible range
- last verification evidence

没有注册依赖时不得默默从 PATH 选择任意同名 Runtime。

## 24. 实施依赖顺序

本节只表达技术依赖，不构成实施计划或授权：

1. Domain Profile、SCP、Mapping 和跨项目 dependency pin。
2. Runtime Adapter doctor、spawn 和 JSON protocol。
3. Research Content Package 1.1、Query Plan、Context Snapshot 与 Package binding。
4. Feedback Snapshot 与 Candidate Insight。
5. Ingest Plan、Preview、Approval、Receipt 和 Resume。
6. Article/X Skills 路由与 CLI。
7. Fake/real runtime tests、E2E、文档和 compatibility audit。

## 25. 验收标准

V2.2 只有满足全部条件才能称为实现完成：

1. `research-publishing` Domain 和 `research_track` 隔离生效。
2. 项目 Wiki 与用户研究 Wiki 明确隔离。
3. Runtime 只通过受限 fixed-argv JSON Adapter 调用。
4. Skill/Harness 不直接写 `.llm-wiki`。
5. Query Plan digest 绑定读取范围、预算、Profile 与 SCP。
6. Context Snapshot 包含有序 refs、checksum、风险和截断证据。
7. 只有审查后的 Snapshot 可以进入新建的 Research Content Package 1.1；1.0 保持只读兼容且不得原地升级。
8. Query 故障可以诚实降级且不破坏原发布流程。
9. Feedback Snapshot 绑定 Publication Receipt 和 Human 选择。
10. 所有外部反馈按 `data_only` 处理。
11. Feedback 只能产生 Candidate Insight，不能自动成为 verified conclusion。
12. Insight 类型、证据强度、边界和替代解释可审计。
13. `publication_checkpoint` 和 `feedback_insight` Ingest 都必须经过 preview 和 exact-digest Human Approval。
14. Plan/Profile/SCP/Mapping/Workspace 变化使 Approval 失效。
15. Runtime 通过稳定 copy/write/register/log 契约完成写入。
16. already-exists、partial、conflict 和 resume 语义正确。
17. Receipt 能证明每个步骤，partial 不伪装成功。
18. 跨 Domain 写入和未声明读取被拒绝。
19. 现有 Article、Visual、X、X Article 和 Browser 安全语义不回归。
20. Fake Runtime 与真实本地 Runtime integration 均通过。
21. CI 不访问真实 X 或真实研究 Wiki。
22. Skills、CLI、README、Quickstart、架构和 registry 同步。

## 26. 完整性结论

本设计已经确定：

- 长期研究记忆的 Domain、track 和 Workspace 边界。
- Skill、Harness、Runtime 与 Human 的责任划分。
- 受限 Runtime Adapter 的命令、安全和版本边界。
- Query Plan、Context Snapshot 和 Package freeze 语义。
- Feedback Snapshot、Candidate Insight 与 Evidence Review。
- Ingest Plan、Approval、Receipt、幂等和恢复。
- 外部反馈不可信、研究结论不自动升级的安全边界。
- 与 V2.1/V3 的兼容、不回归和端到端验收要求。
- `llm-wiki-runtime` 的跨项目依赖和后续登记要求。

设计的最终不变量是：

> Memory may influence the next research cycle, but it may never silently rewrite the current publication.

用户已于 2026-08-22 确认本书面规格。本次确认只完成设计门，不构成实施授权：在用户另行明确要求前，不创建实施计划、不修改生产代码，也不登记会改变项目关系状态的跨项目依赖。
