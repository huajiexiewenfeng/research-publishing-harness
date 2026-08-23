# Research Data Flywheel V2.3 Implementation Plan Suite

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Research Publishing Harness 从 V2.2 的“发布后记忆 Ingest”演进为 Evidence-backed Research Increment Graph，使研究证据、语义演进、发布表达和下一轮研究问题形成可审计的数据飞轮。

**Architecture:** Canonical Local Package 是一级事实源；Harness 将终态 Artifact 捕获到 content-addressed Evidence Plane，在一次 Human-confirmed Promotion 中写入 immutable semantic records 与 generation-addressed Index Shards，并最后原子切换单一 Catalog。`llm-wiki-runtime` 只负责 exact lookup/path loading 与受 Profile/SCP 约束的写入；Article/X Skills 负责语义选择，不直接访问 `.llm-wiki`。

**Tech Stack:** TypeScript 6, Node.js 20.19+, AJV 2020-12, Vitest 4, YAML 2, Python 3.10+ `llm-wiki-runtime` 0.2.0 JSON CLI.

## Global Constraints

- 按用户偏好在当前 `main` 分支 inline 执行；除非用户另行明确要求，不创建分支、不使用子代理。
- 每个实现任务执行 RED → GREEN → REFACTOR；每个阶段完成后保留可运行、可回滚的提交。
- Harness 和 Skills 永不直接读写 `.llm-wiki/**`；所有 Runtime 访问只能通过受限 Adapter 的固定命令和 argv。
- V2.2 `publication_evidence`、`feedback_snapshot`、`candidate_insight` 保持可读且不原地改写；旧 CLI 继续工作。
- Canonical Artifact、Evidence Snapshot、semantic revision、lifecycle event、Index Shard 都是 create-only；每个 Track 只有 `indexes/catalog.md` 使用 `update_allowed`。
- Semantic Promotion 的唯一可见性边界是 Catalog-last；partial、uncertain、stale 或 reconciliation-required 都不得改变默认 Mainline。
- 默认 Query 不使用 broad glob，不扫描整个 Track 正文；索引缺失或超预算时 fail-closed。
- 所有持久路径为 Workspace-relative ASCII-safe path；绝对路径、浏览器登录态、token/cookie/private key 不序列化。
- 外部网页与反馈保持 `data_only`；engagement metric 不提升 claim status；translation/compression 不强化原 Claim。
- CI 只使用临时 Workspace、Fake Runtime 和 synthetic publication receipt，不访问用户真实 Wiki、Chrome、X 或 GitHub。

---

## Locked V2.3 Policy Parameters

实现使用 `research-memory-policy/v1`，以下值进入 Query/Promotion Plan digest 与测试矩阵：

```ts
export const RESEARCH_MEMORY_POLICY_V1 = {
  policy_version: 'research-memory-policy/v1',
  default_track_id: 'enterprise-agent-runtime',
  max_chars_per_chunk: 3_000,
  max_chars_per_index_record: 12_000,
  max_shards_per_query: 4,
  max_semantic_records_per_query: 12,
  max_document_chunks_per_query: 6,
  max_reconstructed_document_chars: 60_000,
  shard_entry_threshold: 64,
  shard_byte_threshold: 96_000,
  runtime_requirement: { name: 'llm-wiki-runtime', version: '0.2.0' }
} as const;
```

分块先按 Markdown heading/block，再按 3,000 字符确定性切分；Shard 先按 `view + calendar quarter`，超过任一阈值后按 stable ref 排序确定性拆分。数值只影响预算和召回，不改变权限、生命周期、证据等级或 Human Gate。

---

## Plan Suite and Dependency Order

| Order | Executable plan | Outcome | Depends on |
| --- | --- | --- | --- |
| 1 | [Phase 1 — Evidence Foundation](2026-08-22-research-data-flywheel-v2-3-phase-1-evidence-foundation.md) | V2.3 contracts、content-addressed Evidence、canonical document chunks、increment/lifecycle foundation | V2.2 baseline |
| 2 | [Phase 2 — Promotion and Index](2026-08-22-research-data-flywheel-v2-3-phase-2-promotion-index.md) | Delta/Review、一次确认、resumable promotion、Catalog-last multi-view index | Phase 1 |
| 3 | [Phase 3 — Progressive Query](2026-08-22-research-data-flywheel-v2-3-phase-3-progressive-query.md) | Catalog → Shard → semantic record → Manifest → bounded Chunks exact retrieval | Phase 2 |
| 4 | [Phase 4 — Publication Flywheel and Migration](2026-08-22-research-data-flywheel-v2-3-phase-4-publication-migration.md) | intended/observed expression、feedback loop、legacy adapter、首个真实 Increment import、Skills/docs/acceptance | Phase 3 |

不得并行执行 Phase 1–4：后续阶段会消费前一阶段稳定的 public interfaces 和 schemas。

---

## Shared Public Interfaces

所有阶段只通过以下公共边界连接；服务内部不得绕开这些边界共享未校验对象：

```ts
export interface EvidenceCapturePort {
  capture(input: CaptureResearchEvidenceInput): Promise<ResearchEvidenceSnapshotV1>;
  status(evidenceSnapshotId: string): Promise<ResearchEvidenceCaptureStatusV1>;
}

export interface ResearchPromotionPort {
  plan(deltaId: string, reviewId: string): Promise<MemoryPromotionPlanV2>;
  approve(planId: string, confirmedPlanDigest: Digest, actor: string, ttlMs: number): Promise<MemoryPromotionApprovalV2>;
  execute(planId: string, approval: MemoryPromotionApprovalV2): Promise<MemoryPromotionReceiptV2>;
  resume(planId: string, approval: MemoryPromotionApprovalV2): Promise<MemoryPromotionReceiptV2>;
}

export interface ProgressiveResearchQueryPort {
  plan(input: PlanResearchQueryInput): Promise<ResearchQueryPlanV2>;
  execute(queryId: string): Promise<ResearchContextSnapshotV2>;
  review(queryId: string, input: ReviewResearchContextInput): Promise<ResearchContextReviewV2>;
  bindPackage(queryId: string, draft: ResearchContentPackageV1_1): Promise<ResearchContentPackageV1_1>;
}
```

---

## Acceptance Ownership

| Design acceptance | Primary plan |
| --- | --- |
| AC 1–7, 36, 38 | Phase 1 |
| AC 8–11, 17–21, 26–30, 35 | Phase 2 |
| AC 22–25, 31 | Phase 3 |
| AC 12–16, 32–34, 37 | Phase 4 |

Phase 4 的 full-loop acceptance 必须再次覆盖全部 AC 1–38，而不是只运行其本阶段用例。

---

## Execution Gates

- [ ] **Gate 1: Establish baseline**

Run: `pnpm check`

Expected: PASS on the unmodified V2.2 baseline; record the commit SHA in the Phase 1 handoff.

- [ ] **Gate 2: Execute Phase 1 and verify its focused suite**

Run the exact commands in the Phase 1 plan, then `pnpm check`.

Expected: Evidence and canonical document capabilities pass without changing V2.2 query/ingest behavior.

- [x] **Gate 3: Execute Phase 2 and verify atomic visibility**

Run the exact commands in the Phase 2 plan, including crash-window and Catalog-last tests, then `pnpm check`.

Expected: only a complete Promotion can switch the active Catalog generation.

- [ ] **Gate 4: Execute Phase 3 and prove no broad loading**

Run the exact commands in the Phase 3 plan, including Adapter argv assertions and adversarial budget tests, then `pnpm check`.

Expected: all Runtime body loads use exact `--path-json`; unavailable indexes fail closed.

- [ ] **Gate 5: Execute Phase 4 and close V2.3**

Run: `pnpm manifest && pnpm check`

Expected: full-loop acceptance covers AC 1–38; generated manifest is current; CI evidence contains no real account, browser session, absolute user path, or secret.

- [ ] **Gate 6: Run project finish**

Follow `$project-finish`: sync actual implementation evidence into the project-local LLM Wiki, update requirement traceability, inspect `git diff --check` and `git status --short`, then create the final handoff commit.
