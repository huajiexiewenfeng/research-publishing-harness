# Research Data Flywheel V2.3 Phase 3: Progressive Query Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Catalog → bounded Shards → exact semantic records → exact Manifest → bounded Chunks 的渐进检索替换 V2.2 broad-track body loading，并把精确读取证据绑定回 Article Package。

**Architecture:** Runtime Adapter 只暴露 exact frontmatter lookup 与 exact path loading；Skill 根据 Catalog/Shard 摘要选择候选，Harness 把每一层选择固化为审计 Plan。默认只读 Mainline，Working 必须显式请求；索引缺失、损坏或超预算时 fail-closed，绝不回退为目录正文扫描。

**Tech Stack:** TypeScript 6, Node.js 20.19+, AJV 2020-12, Vitest 4, `llm-wiki-runtime` 0.2.0 `find-records` / `load-context-pack` JSON CLI.

## Global Constraints

- Phase 2 gate must be green before starting.
- Query identity always uses `index_id=<track_id>:research`; no graph page or filename guessing.
- Body loads must use non-empty exact `path_json`; Query code must not send a broad glob.
- Default view is `mainline`; `working` requires `include_working: true`; `feedback` remains supporting `data_only`.
- Budgets are locked by `research-memory-policy/v1`: 4 Shards, 12 semantic records, 6 document Chunks, 60,000 reconstructed document chars.
- Full-document reconstruction requires `document_mode: 'full_explicit'`; implicit full loading is forbidden.
- Runtime/config failure may return an honest unavailable snapshot; missing/corrupt Index returns `index_unavailable|index_rebuild_required`, not legacy broad Query.
- V2.2 query artifacts remain readable; new package binding uses `ResearchContextSnapshotV2` without mutating frozen Packages.

---

### Task 1: Exact Runtime Lookup and Path-loading Adapter

**Files:**
- Modify: `harnesses/research-publishing/adapters/llm-wiki/runtime-protocol.ts`
- Modify: `harnesses/research-publishing/adapters/llm-wiki/runtime-adapter.ts`
- Modify: `tests/memory/runtime-adapter.test.ts`
- Modify: `tests/memory/fake-runtime-process.ts`
- Modify: `tests/security/memory-runtime-security.test.ts`
- Modify: `tests/integration/llm-wiki-runtime.integration.test.ts`

**Interfaces:**
- Consumes: Runtime 0.2.0 `find-records` and `load-context-pack`.
- Produces: `findRecords(input)` for exact lookup metadata and `loadPaths(input)` for exact ordered body loading; preserves legacy `query(input)` only for V2.2 callers.

- [x] **Step 1: Write failing fixed-argv and response tests**

```ts
it('finds one Catalog by exact index_id without reading bodies', async () => {
  await adapter.findRecords({
    record_type: 'research_index_catalog',
    lookup: { index_id: 'enterprise-agent-runtime:research' }
  });
  expect(runner.calls.at(-1)?.args).toEqual([
    'find-records', '--scope-root', paths.workspace,
    '--record-type', 'research_index_catalog',
    '--lookup-value-json', '{"index_id":"enterprise-agent-runtime:research"}'
  ]);
});

it('loads only caller-supplied exact paths', async () => {
  await adapter.loadPaths({ paths: [catalogPath], max_items: 1, max_item_chars: 12_000 });
  expect(runner.calls.at(-1)?.args).toContain(JSON.stringify([catalogPath]));
  expect(runner.calls.at(-1)?.args).not.toContain('domains/research-publishing/**');
});
```

- [x] **Step 2: Run RED**

Run: `pnpm vitest run tests/memory/runtime-adapter.test.ts tests/security/memory-runtime-security.test.ts tests/integration/llm-wiki-runtime.integration.test.ts`

Expected: FAIL because `findRecords/loadPaths` are absent.

- [x] **Step 3: Implement exact Adapter methods**

```ts
export interface RuntimeFindRecordsInput {
  readonly record_type: ResearchRuntimeRecordType;
  readonly lookup: Readonly<Record<string, string>>;
}

export interface RuntimeLoadPathsInput {
  readonly paths: readonly string[];
  readonly max_items: number;
  readonly max_item_chars: number;
  readonly max_total_chars: number;
}

findRecords(input: RuntimeFindRecordsInput): Promise<RuntimeFindRecordsResult>;
loadPaths(input: RuntimeLoadPathsInput): Promise<RuntimeContextResult>;
```

Validate record type allow-list, exact lookup key/value, ASCII-safe IDs, unique contained relative Runtime paths and positive budgets. Reject empty `paths`, globs, `..` and absolute paths. Runtime 0.2.0 receives `--max-files` and `--max-chars-per-file`; the Adapter enforces `max_total_chars` on the returned envelope before exposing it. Catalog lookup rejects zero or more than one result according to the Profile’s `max_results: 1` rule.

- [x] **Step 4: Run GREEN and real Runtime opt-in test**

Run: `pnpm vitest run tests/memory/runtime-adapter.test.ts tests/security/memory-runtime-security.test.ts`

Run: `$env:RPH_RUN_REAL_LLM_WIKI='1'; pnpm vitest run tests/integration/llm-wiki-runtime.integration.test.ts`

Expected: unit/security tests PASS; opt-in test PASS when the pinned local Runtime is configured, otherwise skip with its existing explicit reason.

- [x] **Step 5: Commit Task 1**

```text
git add harnesses/research-publishing/adapters tests/memory tests/security tests/integration
git commit -m "feat: add exact LLM Wiki lookup and path loading"
```

---

### Task 2: Query V2 Contracts and Auditable Selection Plan

**Files:**
- Modify: `harnesses/research-publishing/core/research-memory-types.ts`
- Modify: `harnesses/research-publishing/core/research-memory-contracts.ts`
- Create: `harnesses/research-publishing/core/research-query-types.ts`
- Create: `harnesses/research-publishing/core/research-query-selector.ts`
- Create: `harnesses/research-publishing/contracts/research-query-plan-v2.schema.json`
- Create: `harnesses/research-publishing/contracts/research-context-snapshot-v2.schema.json`
- Create: `harnesses/research-publishing/contracts/research-context-review-v2.schema.json`
- Modify: `tests/contracts/contracts.test.ts`
- Create: `tests/memory/research-query-contracts.test.ts`
- Create: `tests/memory/research-query-selector.test.ts`

**Interfaces:**
- Consumes: Phase 2 Catalog/Shard types and locked policy.
- Produces: `ResearchQueryPlanV2`, `ResearchContextSnapshotV2`, `ResearchContextReviewV2` and pure bounded selectors.

- [x] **Step 1: Write failing contract and selector tests**

```ts
it('binds every selection layer and policy limit into the Plan digest', () => {
  const plan = createResearchQueryPlan(input);
  expect(plan.index_id).toBe('enterprise-agent-runtime:research');
  expect(plan.budgets).toMatchObject({ max_shards: 4, max_records: 12, max_chunks: 6 });
  expect(plan.plan_digest).not.toBe(createResearchQueryPlan({ ...input, view: 'history' }).plan_digest);
});

it('fails closed when candidate shards exceed policy', () => {
  expect(() => selectShards(catalog, fiveShardRefs, policy))
    .toThrowError(/context_budget_exceeded/);
});
```

- [x] **Step 2: Run RED**

Run: `pnpm vitest run tests/contracts/contracts.test.ts tests/memory/research-query-contracts.test.ts tests/memory/research-query-selector.test.ts`

Expected: FAIL because V2 Query contracts/selectors are absent.

- [x] **Step 3: Implement exact Query values**

```ts
export type ResearchQueryView = 'mainline' | 'history' | 'working' | 'publication' | 'feedback';
export type DocumentLoadMode = 'none' | 'supporting_chunks' | 'full_explicit';

export function createResearchQueryPlan(input: PlanResearchQueryInput): ResearchQueryPlanV2;
export function selectIndexShards(input: SelectIndexShardsInput): readonly ResearchIndexShardRefV1[];
export function selectSemanticRecords(input: SelectSemanticRecordsInput): readonly ResearchRecordRefV1[];
export function selectDocumentChunks(input: SelectDocumentChunksInput): readonly CanonicalChunkRefV1[];
```

Plan stores query intent, track/view, selection terms, rationale, exact refs/digests at each completed layer, policy version, budgets and `document_mode`. Selectors are pure, stable-order, deduplicate refs and throw stable budget errors.

- [x] **Step 4: Run GREEN**

Run: `pnpm vitest run tests/contracts/contracts.test.ts tests/memory/research-query-contracts.test.ts tests/memory/research-query-selector.test.ts`

Expected: PASS for all views, shuffled candidates, exact limits, over-limit and Working opt-in.

- [x] **Step 5: Commit Task 2**

```text
git add harnesses/research-publishing/core harnesses/research-publishing/contracts tests/contracts tests/memory
git commit -m "feat: add progressive research query contracts"
```

---

### Task 3: Progressive Research Query Service and Package Binding

**Files:**
- Create: `harnesses/research-publishing/core/progressive-research-query-service.ts`
- Modify: `harnesses/research-publishing/core/memory-package.ts`
- Modify: `harnesses/research-publishing/core/types.ts`
- Create: `tests/memory/progressive-research-query-service.test.ts`
- Create: `tests/memory/progressive-query-fixture.ts`
- Modify: `tests/memory/package-memory-binding.test.ts`
- Create: `tests/integration/progressive-research-query.test.ts`
- Create: `tests/security/progressive-query-security.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2 Adapter/selectors and Package 1.1 lifecycle.
- Produces: `ProgressiveResearchQueryService implements ProgressiveResearchQueryPort`; Package `memory_context` may bind a reviewed V2 snapshot while retaining V1 compatibility.

- [ ] **Step 1: Write failing traversal and fail-closed tests**

Use a Fake Runtime call ledger and assert exact sequence:

```text
find Catalog → load Catalog → load selected Shards → load selected semantic records
→ optional load Manifests → optional load selected Chunks
```

Also assert corrupt/missing Catalog, digest mismatch, Shard overflow, record overflow, chunk overflow, implicit full-document request and a broad path returned by Runtime all fail without a later load.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run tests/memory/progressive-research-query-service.test.ts tests/memory/package-memory-binding.test.ts tests/integration/progressive-research-query.test.ts tests/security/progressive-query-security.test.ts`

Expected: FAIL because the progressive service is absent.

- [ ] **Step 3: Implement staged exact traversal**

```ts
export class ProgressiveResearchQueryService implements ProgressiveResearchQueryPort {
  plan(input: PlanResearchQueryInput): Promise<ResearchQueryPlanV2>;
  execute(queryId: string): Promise<ResearchContextSnapshotV2>;
  review(queryId: string, input: ReviewResearchContextInput): Promise<ResearchContextReviewV2>;
  bindPackage(queryId: string, draft: ResearchContentPackageV1_1): Promise<ResearchContentPackageV1_1>;
  status(queryId: string): Promise<ResearchQueryStatusV2>;
}
```

Persist each layer under `memory/queries-v2/<query_id>/`, verify every returned checksum against referenced digest, mark external/feedback content `data_only`, preserve risk flags, and construct Snapshot only from exact loaded refs. `full_explicit` reconstructs by ordinal and enforces 60,000 normalized chars.

- [ ] **Step 4: Extend package memory binding without changing frozen boundaries**

Add a version-dispatched `MemoryContextV2` reference containing `research_query_plan_digest`, `research_context_snapshot_digest`, selected context refs, reviewer and reviewed time. Reject refs absent from the frozen Snapshot and reject binding to `evidence_ready|reviewed|frozen` packages.

- [ ] **Step 5: Run GREEN**

Run: `pnpm vitest run tests/memory/progressive-research-query-service.test.ts tests/memory/package-memory-binding.test.ts tests/integration/progressive-research-query.test.ts tests/security/progressive-query-security.test.ts`

Expected: PASS; test ledger contains no broad glob or unplanned body path.

- [ ] **Step 6: Commit Task 3**

```text
git add harnesses/research-publishing/core tests/memory tests/integration tests/security
git commit -m "feat: add bounded progressive research query"
```

---

### Task 4: Index Doctor and Explicit Rebuild Plan

**Files:**
- Create: `harnesses/research-publishing/core/research-index-maintenance-service.ts`
- Create: `harnesses/research-publishing/contracts/research-index-doctor-report.schema.json`
- Create: `harnesses/research-publishing/contracts/research-index-rebuild-plan.schema.json`
- Create: `tests/memory/research-index-maintenance-service.test.ts`
- Create: `tests/integration/research-index-rebuild.test.ts`

**Interfaces:**
- Consumes: exact Adapter reads, semantic record refs from Catalog generations and Phase 2 projector.
- Produces: read-only doctor report and an approval-required rebuild Plan; never silently repairs during Query.

- [ ] **Step 1: Write failing doctor and rebuild tests**

Cover missing Catalog, duplicate exact lookup, bad Catalog digest, missing/corrupt Shard, semantic digest drift, orphan staged generation, valid legacy-only workspace and healthy multi-view index.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run tests/memory/research-index-maintenance-service.test.ts tests/integration/research-index-rebuild.test.ts`

Expected: FAIL because maintenance services/schemas are absent.

- [ ] **Step 3: Implement read-only diagnosis and rebuild planning**

```ts
export class ResearchIndexMaintenanceService {
  doctor(trackId: string): Promise<ResearchIndexDoctorReportV1>;
  rebuildPlan(trackId: string): Promise<ResearchIndexRebuildPlanV1>;
}
```

Doctor only follows exact Catalog refs. Rebuild Plan enumerates exact source semantic refs, proposed generation Shards and final Catalog digest; execution reuses Phase 2 Promotion approval and Catalog-last mechanics rather than adding a second write path.

- [ ] **Step 4: Run GREEN**

Run: `pnpm vitest run tests/memory/research-index-maintenance-service.test.ts tests/integration/research-index-rebuild.test.ts`

Expected: PASS; damaged indexes report `index_rebuild_required` and no repair occurs before approval.

- [ ] **Step 5: Commit Task 4**

```text
git add harnesses/research-publishing/core harnesses/research-publishing/contracts tests
git commit -m "feat: diagnose and plan research index rebuilds"
```

---

### Task 5: Query CLI, Broad-load Prohibition, and Phase 3 Acceptance

**Files:**
- Modify: `harnesses/research-publishing/cli/index.ts`
- Modify: `tests/cli/cli.test.ts`
- Modify: `tools/acceptance.ts`
- Create: `tests/integration/progressive-query-cli.test.ts`
- Create: `tests/security/no-broad-memory-query.test.ts`

**Interfaces:**
- Produces: V2 behavior for `memory query plan/execute/review/bind-package`, plus `memory index doctor/rebuild-plan`; preserves `memory query status` and V2.2 artifact reads.

- [ ] **Step 1: Write failing CLI and source-policy tests**

Assert CLI exposes all specified routes and scan production query code for forbidden broad values such as `domains/research-publishing/**`; allow the string only in V2.2 compatibility code explicitly named by the test allow-list.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run tests/cli/cli.test.ts tests/integration/progressive-query-cli.test.ts tests/security/no-broad-memory-query.test.ts`

Expected: FAIL because V2 routes and prohibition evidence are absent.

- [ ] **Step 3: Route CLI to progressive and maintenance services**

Require explicit `view`, `document_mode`, selection refs/rationale between stages and Human review before package binding. `memory query execute` must not invent Skill selections; it consumes the staged Plan selections.

- [ ] **Step 4: Run Phase 3 verification**

Run: `pnpm vitest run tests/contracts tests/memory tests/security tests/integration/progressive-research-query.test.ts tests/integration/research-index-rebuild.test.ts tests/integration/progressive-query-cli.test.ts tests/cli/cli.test.ts`

Run: `pnpm check`

Expected: PASS; acceptance proves AC 22–25 and 31, and V2.2 regression remains green.

- [ ] **Step 5: Commit Task 5**

```text
git add harnesses/research-publishing/cli tests tools/acceptance.ts
git commit -m "feat: expose progressive research memory query"
```

- [ ] **Step 6: Inspect repository state**

Run: `git diff --check && git status --short`

Expected: clean Phase 3 handoff.
