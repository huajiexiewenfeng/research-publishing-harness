# Research Data Flywheel V2.3 Phase 2: Promotion and Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Evidence → Semantic Delta → Human Review → 一次确认 → resumable Promotion，并以 generation-addressed Shards + Catalog-last 建立五个原子切换的摘要 View。

**Architecture:** Harness 固化 Delta/Review/Plan/Approval，持有 workspace/track lock，使用 Runtime 写 immutable semantic/document/index records。新 Shards 在旧 Catalog 下不可见；稳定 Catalog 是全部 View 唯一活动 generation 指针且最后提交。任何 stale、partial 或 uncertain 状态都生成诚实 Receipt 并保持旧 Catalog。

**Tech Stack:** TypeScript 6, Node.js 20.19+, AJV 2020-12, Vitest 4, YAML 2, `llm-wiki-runtime` 0.2.0.

## Global Constraints

- Phase 1 gate must be green before starting.
- 一个 Promotion Plan 只作用于一个 Track；跨 Track edge 必须作为显式已审阅 record，而不能跨锁隐式更新两个 Catalog。
- 一次确认文本严格为 `确认 Research Promotion Plan sha256:<digest>`；Approval 绑定 Review、Evidence、Workspace、Profile、SCP、Mapping、Runtime、base Catalog 和全部 staged bytes。
- 所有 semantic/document/lifecycle/shard records `create_only`；`research_index_catalog` only `update_allowed`.
- `already_exists` 只有在 Runtime returned checksum 与 Plan expected digest 相同时才是幂等成功。
- `register-artifact` uncertain window 必须停止并要求 reconciliation；不得提交 Catalog。
- Catalog commit 前在锁内再次 exact-load 并核对 base digest。
- V2.2 Ingest remains available and unchanged; V2.3 Promotion is a sibling workflow.

---

### Task 1: Semantic Delta, Review, Promotion Contracts, and State Machine

**Files:**
- Modify: `harnesses/research-publishing/core/research-memory-types.ts`
- Modify: `harnesses/research-publishing/core/research-memory-contracts.ts`
- Create: `harnesses/research-publishing/core/research-promotion-state.ts`
- Create: `harnesses/research-publishing/contracts/semantic-memory-delta.schema.json`
- Create: `harnesses/research-publishing/contracts/semantic-promotion-review.schema.json`
- Create: `harnesses/research-publishing/contracts/memory-promotion-plan-v2.schema.json`
- Create: `harnesses/research-publishing/contracts/memory-promotion-approval-v2.schema.json`
- Create: `harnesses/research-publishing/contracts/memory-promotion-receipt-v2.schema.json`
- Modify: `tests/contracts/contracts.test.ts`
- Create: `tests/memory/research-promotion-contracts.test.ts`
- Create: `tests/memory/research-promotion-state.test.ts`

**Interfaces:**
- Consumes: Phase 1 V2.3 records and canonical digest functions.
- Produces: `SemanticMemoryDeltaV1`, `SemanticPromotionReviewV1`, `MemoryPromotionPlanV2`, `MemoryPromotionApprovalV2`, `MemoryPromotionReceiptV2` and transition guards.

- [x] **Step 1: Write failing contract and transition tests**

```ts
it('cannot strengthen a claim during review without new evidence', () => {
  expect(() => reviewDelta(deltaWithObservedClaim, {
    replacements: [{ operation_id: 'op_1', claim_status: 'verified' }]
  })).toThrowError(/strengthen/);
});

it('does not allow complete before catalog commit', () => {
  expect(() => transitionPromotion(stateBeforeCatalog, 'complete'))
    .toThrowError(/catalog/);
});
```

- [x] **Step 2: Run RED**

Run: `pnpm vitest run tests/contracts/contracts.test.ts tests/memory/research-promotion-contracts.test.ts tests/memory/research-promotion-state.test.ts`

Expected: FAIL because Promotion contracts and state transitions are absent.

- [x] **Step 3: Implement exact schemas and guards**

```ts
export function createSemanticMemoryDelta(input: SemanticMemoryDeltaInput): SemanticMemoryDeltaV1;
export function createSemanticPromotionReview(delta: SemanticMemoryDeltaV1, input: ReviewDeltaInput): SemanticPromotionReviewV1;
export function transitionResearchPromotion(from: ResearchPromotionState, event: ResearchPromotionEvent): ResearchPromotionState;
```

Validate operation IDs, full target content/digests, Evidence lineage, index impact, privacy non-downgrade, lifecycle legality and edge endpoint resolvability. Rejected operations never enter Plan.

- [x] **Step 4: Run GREEN**

Run: `pnpm vitest run tests/contracts tests/memory/research-promotion-contracts.test.ts tests/memory/research-promotion-state.test.ts`

Expected: PASS with V2.2 schema regression.

- [x] **Step 5: Commit Task 1**

```text
git add harnesses/research-publishing/core harnesses/research-publishing/contracts tests/contracts tests/memory
git commit -m "feat: add semantic promotion contracts"
```

---

### Task 2: V2.3 Runtime Profile, Fixed Adapter Writes, and Deterministic Renderers

**Files:**
- Modify: `harnesses/research-publishing/memory/llm-wiki-profile.yml`
- Modify: `harnesses/research-publishing/memory/ingest-mapping.yml`
- Modify: `harnesses/research-publishing/memory/scp.yml`
- Modify: `skills/article-publishing-copilot/scp.yml`
- Modify: `skills/x-publishing-copilot/scp.yml`
- Modify: `harnesses/research-publishing/adapters/llm-wiki/runtime-protocol.ts`
- Modify: `harnesses/research-publishing/adapters/llm-wiki/runtime-adapter.ts`
- Create: `harnesses/research-publishing/core/research-record-renderer.ts`
- Modify: `tests/memory/domain-contracts.test.ts`
- Modify: `tests/memory/runtime-adapter.test.ts`
- Create: `tests/memory/research-record-renderer.test.ts`
- Modify: `tests/security/memory-runtime-security.test.ts`

**Interfaces:**
- Consumes: fixed Runtime `write-record/copy-source/register-artifact/append-log` commands.
- Produces: eleven new record types, `research_promotion` source type, exact rendered frontmatter/body bytes and normalized returned digests.

- [x] **Step 1: Write failing Profile, renderer and Adapter tests**

Assert all record paths from design section 12.1, create-only/update rules, required vars/refs, fixed argv, ASCII-safe variables, no shell, and no user-controlled command names.

- [x] **Step 2: Run RED**

Run: `pnpm vitest run tests/memory/domain-contracts.test.ts tests/memory/runtime-adapter.test.ts tests/memory/research-record-renderer.test.ts tests/security/memory-runtime-security.test.ts`

Expected: FAIL because V2.3 record types and renderers are absent.

- [x] **Step 3: Extend Profile and Adapter types**

```ts
export type ResearchRuntimeRecordType =
  | 'research_increment' | 'claim_version' | 'research_decision' | 'open_question'
  | 'publication_expression' | 'research_evolution_edge'
  | 'canonical_document_manifest' | 'canonical_document_chunk'
  | 'research_lifecycle_event' | 'research_index_catalog' | 'research_index_shard';

writeRecord(input: RuntimeWriteRecordInput & {
  record_type: LegacyRuntimeRecordType | ResearchRuntimeRecordType;
}): Promise<RuntimeWriteResult>;
```

Keep runtime requirement exactly `0.2.0`. Adapter must return normalized checksums and expose them to the Promotion service for equality checks.

Add exact Catalog lookup configuration under `read_rules.record_lookup`; Runtime 0.2.0 bounds results from this Profile declaration rather than from a CLI `--max-results` flag:

```yaml
record_lookup:
  research_index_catalog:
    identity_field: index_id
    display_field: index_id
    match_fields: [index_id]
    return_fields: [index_id, track_id, generation, catalog_digest]
    max_results: 1
```

Set `context_pack.max_chars_per_file: 12000` so one bounded Index record can be returned intact; V2.3 callers still pass exact paths and enforce their smaller per-stage counts and total budget.

- [x] **Step 4: Implement deterministic record rendering**

Render YAML frontmatter with lookup identities and data-only policy followed by bounded Markdown. Never synthesize a summary during projection: use only Human-promoted `summary/tags/status` fields from accepted operations.

- [x] **Step 5: Run GREEN**

Run: `pnpm vitest run tests/memory/domain-contracts.test.ts tests/memory/runtime-adapter.test.ts tests/memory/research-record-renderer.test.ts tests/security/memory-runtime-security.test.ts`

Expected: PASS; all write modes and paths match the approved design.

- [x] **Step 6: Commit Task 2**

```text
git add harnesses/research-publishing/memory harnesses/research-publishing/adapters harnesses/research-publishing/core skills tests
git commit -m "feat: add V2.3 runtime record projection"
```

---

### Task 3: Deterministic Five-view Index Projector

**Files:**
- Create: `harnesses/research-publishing/core/research-index-types.ts`
- Create: `harnesses/research-publishing/core/research-index-projector.ts`
- Create: `harnesses/research-publishing/contracts/research-index-catalog.schema.json`
- Create: `harnesses/research-publishing/contracts/research-index-shard.schema.json`
- Create: `tests/memory/research-index-projector.test.ts`
- Create: `tests/fixtures/research-index-records.ts`

**Interfaces:**
- Consumes: reviewed operations, prior exact Catalog, active semantic/lifecycle states and policy thresholds.
- Produces: one candidate Catalog and immutable `mainline|history|working|publication|feedback` generation shards.

- [x] **Step 1: Write failing projection and threshold tests**

```ts
it('projects all views under one generation and leaves retracted records out of mainline', () => {
  const projection = projector.project(priorCatalog, records);
  expect(new Set(Object.values(projection.catalog.views).map((v) => v.generation))).toEqual(new Set([projection.generation]));
  expect(entries(projection, 'mainline')).not.toContainEqual(expect.objectContaining({ ref: retractedRef }));
  expect(entries(projection, 'history')).toContainEqual(expect.objectContaining({ ref: retractedRef }));
});
```

- [x] **Step 2: Run RED**

Run: `pnpm vitest run tests/memory/research-index-projector.test.ts`

Expected: FAIL because projector and index schemas do not exist.

- [x] **Step 3: Implement stable projection**

```ts
export class ResearchIndexProjector {
  project(input: ProjectResearchIndexInput): ResearchIndexProjectionV1;
}
```

Use `index_id=<track_id>:research`; bucket by view and calendar quarter, stable-sort refs, split at 64 entries or 96,000 UTF-8 bytes, render each index record at most 12,000 chars, derive generation from canonical projection content, and path shards by generation plus rendered digest. Catalog contains shard summaries only.

- [x] **Step 4: Add determinism and adversarial tests**

Shuffle input order, cross quarter boundaries, hit each threshold exactly, exceed by one, include CJK byte counts, superseded/retracted/working/publication/feedback states, and assert identical projection bytes for equivalent sets.

- [x] **Step 5: Run GREEN**

Run: `pnpm vitest run tests/memory/research-index-projector.test.ts tests/contracts/contracts.test.ts`

Expected: PASS; no Index body contains canonical article full text or unreviewed generated summaries.

- [x] **Step 6: Commit Task 3**

```text
git add harnesses/research-publishing/core harnesses/research-publishing/contracts tests
git commit -m "feat: project generation-addressed research indexes"
```

---

### Task 4: Exact Plan, One Approval, Catalog-last Execution, and Resume

**Files:**
- Create: `harnesses/research-publishing/core/semantic-delta-service.ts`
- Create: `harnesses/research-publishing/core/memory-promotion-service.ts`
- Create: `harnesses/research-publishing/core/promotion-lock.ts`
- Create: `tests/memory/semantic-delta-service.test.ts`
- Create: `tests/memory/memory-promotion-fixture.ts`
- Create: `tests/memory/memory-promotion-service.test.ts`
- Create: `tests/security/memory-promotion-security.test.ts`
- Create: `tests/integration/research-promotion-workflow.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3 contracts, renderer/projector and Runtime Adapter.
- Produces: `delta propose/review`, exact Plan/Approval, write-ahead execution state, terminal Receipt, safe resume.

- [x] **Step 1: Write failing stale, ordering, crash-window and idempotency tests**

Assert exact call order; Catalog is last; base Catalog is rechecked in lock; mismatched existing checksum fails; crash after shard keeps old Catalog; crash after register marks reconciliation; resume skips confirmed steps; approval becomes stale after any bound digest changes.

- [x] **Step 2: Run RED**

Run: `pnpm vitest run tests/memory/semantic-delta-service.test.ts tests/memory/memory-promotion-service.test.ts tests/security/memory-promotion-security.test.ts tests/integration/research-promotion-workflow.test.ts`

Expected: FAIL because Promotion orchestration does not exist.

- [x] **Step 3: Implement Delta and Review artifacts**

```ts
export class SemanticDeltaService {
  propose(input: ProposeSemanticDeltaInput): Promise<SemanticMemoryDeltaV1>;
  review(deltaId: string, input: ReviewDeltaInput): Promise<SemanticPromotionReviewV1>;
}
```

Write immutable artifacts under `memory/deltas/<delta_id>/` and include explicit non-memory content, unresolved questions, index impacts and evidence refs.

- [x] **Step 4: Implement exact Promotion Plan and approval**

```ts
export class MemoryPromotionService implements ResearchPromotionPort {
  plan(deltaId: string, reviewId: string): Promise<MemoryPromotionPlanV2>;
  approve(planId: string, confirmedPlanDigest: Digest, actor: string, ttlMs: number): Promise<MemoryPromotionApprovalV2>;
  execute(planId: string, approval: MemoryPromotionApprovalV2): Promise<MemoryPromotionReceiptV2>;
  resume(planId: string, approval: MemoryPromotionApprovalV2): Promise<MemoryPromotionReceiptV2>;
  status(planId: string): Promise<MemoryPromotionStatusV2>;
}
```

Plan persists every staged byte/digest and exact action sequence. Approval only accepts the exact confirmation digest and expires fail-closed.

- [x] **Step 5: Implement locked write-ahead execution**

Persist step `started` before Runtime call and terminal result after. Hold `memory/promotions/locks/<track_id>.lock` from base Catalog validation until Receipt. Sequence exactly: validate → Evidence → local assets → copy source → semantic records → document records → register → log → Shards → recheck old Catalog → Catalog last → Receipt.

- [x] **Step 6: Run GREEN**

Run: `pnpm vitest run tests/memory/semantic-delta-service.test.ts tests/memory/memory-promotion-service.test.ts tests/security/memory-promotion-security.test.ts tests/integration/research-promotion-workflow.test.ts`

Expected: PASS; partial/uncertain states never issue a complete Receipt or switch Catalog.

- [x] **Step 7: Commit Task 4**

```text
git add harnesses/research-publishing/core tests/memory tests/security tests/integration
git commit -m "feat: add atomic resumable research promotion"
```

---

### Task 5: Promotion CLI and Phase 2 Acceptance

**Files:**
- Modify: `harnesses/research-publishing/cli/index.ts`
- Modify: `tests/cli/cli.test.ts`
- Modify: `tools/acceptance.ts`
- Create: `tests/integration/research-promotion-cli.test.ts`

**Interfaces:**
- Produces: `memory delta propose/review`, `memory promotion plan/approve/execute/status/resume`.

- [ ] **Step 1: Write failing CLI routing tests**

Assert all seven operations consume JSON artifacts, produce machine-readable state, require explicit approval for execute/resume, and preserve legacy `memory ingest *` routes.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run tests/cli/cli.test.ts tests/integration/research-promotion-cli.test.ts`

Expected: FAIL because V2.3 CLI routes are absent.

- [ ] **Step 3: Add thin CLI routing**

CLI constructs the same services used by tests; it performs no duplicate digest, projection or approval logic.

- [ ] **Step 4: Run Phase 2 verification**

Run: `pnpm vitest run tests/contracts tests/memory tests/security/memory-promotion-security.test.ts tests/integration/research-promotion-workflow.test.ts tests/integration/research-promotion-cli.test.ts tests/cli/cli.test.ts`

Run: `pnpm check`

Expected: PASS and acceptance proves AC 8–11, 17–21, 26–30 and 35.

- [ ] **Step 5: Commit Task 5**

```text
git add harnesses/research-publishing/cli tests tools/acceptance.ts
git commit -m "feat: expose governed research promotion workflow"
```

- [ ] **Step 6: Inspect repository state**

Run: `git diff --check && git status --short`

Expected: clean Phase 2 handoff.
