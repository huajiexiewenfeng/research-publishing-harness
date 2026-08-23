# Research Data Flywheel V2.3 Phase 1: Evidence Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 V2.3 的版本化契约、content-addressed Evidence Object Store、Canonical Document Manifest/Chunks、Research Increment revision 与 lifecycle event 基础。

**Architecture:** 所有终态源 Artifact 先经 WorkspaceStore containment、privacy/secret 和 digest 校验，再复制到 Harness 本地 Evidence Plane；Capture 不写 Runtime。文本 Evidence 经过确定性规范化和分块形成待 Promotion 的 Manifest/Chunk 投影，Research Increment 内容修订与生命周期事件分别保持 immutable。

**Tech Stack:** TypeScript 6, Node.js 20.19+, AJV 2020-12, Vitest 4, YAML 2.

## Global Constraints

- 先阅读批准规格和 plan-suite overview；仅实现 Phase 1，不提前实现 Promotion 或 Query。
- 使用 `research-memory-policy/v1` 的全部固定参数，不从环境变量静默覆盖。
- Evidence Capture 只写 `memory/evidence/**`；本阶段不得调用 Runtime write commands。
- 同 digest 对象重用必须重新读取 bytes 并验证 digest，不能只因路径存在就成功。
- Snapshot 仅在所有 allow-listed Artifact 成功后创建；失败不能留下宣称完整的 manifest。
- 所有 schema `additionalProperties: false`，digest 对不含自身 digest 字段的 canonical value 计算。
- Preserve V2.2 contracts and behavior; add V2.3 as sibling types/services.

---

### Task 1: Versioned V2.3 Policy, Core Contracts, and State Guards

**Files:**
- Create: `harnesses/research-publishing/core/research-memory-policy.ts`
- Create: `harnesses/research-publishing/core/research-memory-types.ts`
- Create: `harnesses/research-publishing/core/research-memory-contracts.ts`
- Create: `harnesses/research-publishing/core/research-lifecycle.ts`
- Modify: `harnesses/research-publishing/core/types.ts`
- Create: `harnesses/research-publishing/contracts/artifact-ref-v2.schema.json`
- Create: `harnesses/research-publishing/contracts/research-evidence-snapshot.schema.json`
- Create: `harnesses/research-publishing/contracts/research-increment-revision.schema.json`
- Create: `harnesses/research-publishing/contracts/claim-version.schema.json`
- Create: `harnesses/research-publishing/contracts/research-decision.schema.json`
- Create: `harnesses/research-publishing/contracts/open-question-version.schema.json`
- Create: `harnesses/research-publishing/contracts/research-evolution-edge.schema.json`
- Create: `harnesses/research-publishing/contracts/publication-expression.schema.json`
- Create: `harnesses/research-publishing/contracts/queryable-canonical-document.schema.json`
- Create: `harnesses/research-publishing/contracts/research-lifecycle-event.schema.json`
- Test: `tests/contracts/contracts.test.ts`
- Create: `tests/memory/research-memory-contracts.test.ts`
- Create: `tests/memory/research-lifecycle.test.ts`

**Interfaces:**
- Consumes: `sha256`, `validateContract`, `HarnessError`, V2.2 `Digest`.
- Produces: policy constant and exact V2.3 value objects from design sections 10.1–10.8, 10.14, 10.15.

- [ ] **Step 1: Write failing schema and digest tests**

```ts
it('rejects absolute Artifact paths and digest self-reference', () => {
  expect(() => createArtifactRefV2({ ...input, workspace_relative_path: 'C:\\secret.md' }))
    .toThrowError(/workspace-relative/);
  expect(createResearchIncrementRevision(increment).content_digest)
    .toBe(sha256(unsigned(increment, 'content_digest')));
});

it('keeps lifecycle sequence independent from revision timestamps', () => {
  expect(() => appendLifecycleEvent(previous, { event_seq: 3, previous_event_ref: previous.event_id }))
    .toThrowError(/monotonic/);
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run tests/contracts/contracts.test.ts tests/memory/research-memory-contracts.test.ts tests/memory/research-lifecycle.test.ts`

Expected: FAIL because V2.3 schemas, policy and constructors do not exist.

- [ ] **Step 3: Implement exact types and constructors**

```ts
export function createArtifactRefV2(input: ArtifactRefV2Input): ArtifactRefV2;
export function createResearchIncrementRevision(input: ResearchIncrementRevisionInput): ResearchIncrementRevisionV1;
export function createClaimVersion(input: ClaimVersionInput): ClaimVersionV1;
export function createResearchLifecycleEvent(input: ResearchLifecycleEventInput): ResearchLifecycleEventV1;
export function deriveResearchLifecycle(events: readonly ResearchLifecycleEventV1[]): ResearchLifecycleState;
```

Require stable IDs matching `[a-z0-9][a-z0-9_-]{0,95}`; require `revision/version/event_seq >= 1`; enforce no-fork `previous_event_ref`; enforce allowed state transitions and Human approval bindings for `accepted/retracted`.

- [ ] **Step 4: Run GREEN and V2.2 contract regression**

Run: `pnpm vitest run tests/contracts tests/memory/research-memory-contracts.test.ts tests/memory/research-lifecycle.test.ts`

Expected: PASS, including all existing V2.2 schemas.

- [ ] **Step 5: Commit Task 1**

```text
git add harnesses/research-publishing/core harnesses/research-publishing/contracts tests/contracts tests/memory
git commit -m "feat: add V2.3 research memory contracts"
```

---

### Task 2: Content-addressed Evidence Object Store

**Files:**
- Create: `harnesses/research-publishing/core/evidence-object-store.ts`
- Create: `harnesses/research-publishing/core/research-evidence-service.ts`
- Modify: `harnesses/research-publishing/core/workspace-store.ts`
- Create: `tests/memory/evidence-object-store.test.ts`
- Create: `tests/memory/research-evidence-service.test.ts`
- Create: `tests/security/research-evidence-security.test.ts`

**Interfaces:**
- Consumes: Task 1 `ArtifactRefV2`, `ResearchEvidenceSnapshotV1`, existing contained `resolveExistingArtifact/readBytes/writeNewBytes/writeNewDirectory`.
- Produces: immutable object bytes at `memory/evidence/objects/sha256/<first2>/<hex>` and append-only snapshots at `memory/evidence/snapshots/<snapshot_id>/manifest.json`.

- [ ] **Step 1: Write failing object reuse, atomic snapshot and security tests**

```ts
it('revalidates bytes when a digest-addressed object already exists', async () => {
  await store.replaceAtomic(objectPath, Buffer.from('tampered'));
  await expect(objects.put(sourceRef)).rejects.toMatchObject({ code: 'MEMORY_EVIDENCE_CORRUPT' });
});

it.each(['../outside', 'C:\\absolute', 'receipts/link/secret.json'])
  ('rejects unsafe capture path %s', async (path) => {
    await expect(evidence.capture({ ...input, artifacts: [{ ...artifact, path }] }))
      .rejects.toMatchObject({ code: 'WORKSPACE_PATH_INVALID' });
  });
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run tests/memory/evidence-object-store.test.ts tests/memory/research-evidence-service.test.ts tests/security/research-evidence-security.test.ts`

Expected: FAIL because the Evidence services are absent.

- [ ] **Step 3: Implement byte-first object storage**

```ts
export interface EvidenceObjectStore {
  put(input: ContainedArtifactInput): Promise<ArtifactRefV2 & { status: 'created' | 'already_exists' }>;
  verify(ref: ArtifactRefV2): Promise<void>;
}

export class ResearchEvidenceService implements EvidenceCapturePort {
  capture(input: CaptureResearchEvidenceInput): Promise<ResearchEvidenceSnapshotV1>;
  status(evidenceSnapshotId: string): Promise<ResearchEvidenceCaptureStatusV1>;
}
```

Read contained source bytes once, compute digest and byte size, scan text/config artifacts for configured secret patterns, write object create-only, then read it back and verify. Write the Snapshot directory only after every object succeeds; serialize no absolute paths.

- [ ] **Step 4: Add capture policy and privacy tests**

Cover all seven `capture_event` values, the explicit role/media allow-list, `public|internal|restricted|data_only`, browser-state rejection, and failure without a complete Snapshot.

- [ ] **Step 5: Run GREEN**

Run: `pnpm vitest run tests/memory/evidence-object-store.test.ts tests/memory/research-evidence-service.test.ts tests/security/research-evidence-security.test.ts`

Expected: PASS; captured object paths are digest-derived and snapshots contain only relative paths.

- [ ] **Step 6: Commit Task 2**

```text
git add harnesses/research-publishing/core tests/memory tests/security
git commit -m "feat: add immutable research evidence store"
```

---

### Task 3: Deterministic Canonical Text Normalization and Chunking

**Files:**
- Create: `harnesses/research-publishing/core/canonical-document-service.ts`
- Create: `harnesses/research-publishing/core/markdown-chunker.ts`
- Create: `tests/memory/canonical-document-service.test.ts`
- Create: `tests/memory/markdown-chunker.test.ts`
- Create: `tests/fixtures/canonical-documents.ts`

**Interfaces:**
- Consumes: verified text `ArtifactRefV2`, Evidence Object bytes, `RESEARCH_MEMORY_POLICY_V1.max_chars_per_chunk`.
- Produces: `QueryableCanonicalDocumentV1` manifest plus lossless ordered local chunk artifacts under `memory/evidence/documents/<document_id>/`.

- [ ] **Step 1: Write failing normalization and reconstruction tests**

```ts
it.each(['lf', 'crlf', 'utf8-bom'])('normalizes %s deterministically', async (fixture) => {
  const document = await service.project(fixtures[fixture]);
  expect(await reconstruct(document)).toBe(fixtures.canonicalLf);
  expect(document.chunks.every((chunk, index) => chunk.ordinal === index + 1)).toBe(true);
});

it('does not create chunks for lossy or binary input', async () => {
  await expect(service.project(binaryArtifact)).resolves.toMatchObject({ status: 'evidence_only' });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run tests/memory/markdown-chunker.test.ts tests/memory/canonical-document-service.test.ts`

Expected: FAIL because deterministic normalization/chunking is absent.

- [ ] **Step 3: Implement versioned lossless chunking**

```ts
export function normalizeCanonicalUtf8(bytes: Uint8Array, declaredMediaType: string): CanonicalTextResult;
export function chunkCanonicalMarkdown(text: string, maxChars: 3000): readonly CanonicalTextChunk[];
export class CanonicalDocumentService {
  project(input: ProjectCanonicalDocumentInput): Promise<QueryableCanonicalDocumentV1>;
  reconstruct(manifest: QueryableCanonicalDocumentV1): Promise<string>;
}
```

Prefer heading/block boundaries, split oversized blocks deterministically, preserve exact normalized slices with contiguous `char_start/char_end`, and require `chunks.join('') === normalizedText`. Manifest stores descriptors only; binary visuals may contribute reviewed Alt Text refs but never binary body.

- [ ] **Step 4: Run GREEN and determinism matrix**

Run: `pnpm vitest run tests/memory/markdown-chunker.test.ts tests/memory/canonical-document-service.test.ts`

Expected: PASS for LF/CRLF/BOM, headings, long blocks, CJK, empty trailing line and corrupted input.

- [ ] **Step 5: Commit Task 3**

```text
git add harnesses/research-publishing/core tests/memory tests/fixtures
git commit -m "feat: project canonical evidence documents"
```

---

### Task 4: Increment Assembly, Evidence CLI, and Foundation Acceptance

**Files:**
- Create: `harnesses/research-publishing/core/research-increment-service.ts`
- Modify: `harnesses/research-publishing/cli/index.ts`
- Modify: `tests/cli/cli.test.ts`
- Create: `tests/integration/research-evidence-foundation.test.ts`
- Create: `tests/security/research-memory-paths.test.ts`
- Modify: `tools/acceptance.ts`

**Interfaces:**
- Consumes: Tasks 1–3 services.
- Produces: `memory evidence capture/status`, `memory increment assemble/status`, `memory lineage show`; local working revision and lifecycle chain artifacts only.

- [ ] **Step 1: Write failing CLI and integration tests**

Assert the six new operations are registered, JSON input/output is deterministic, `enterprise-agent-runtime` is the default Track, side tracks remain isolated, and cross-track predecessor/evolution refs require explicit validated refs.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run tests/cli/cli.test.ts tests/integration/research-evidence-foundation.test.ts tests/security/research-memory-paths.test.ts`

Expected: FAIL because routes and Increment assembly are absent.

- [ ] **Step 3: Implement local assembly without semantic promotion**

```ts
export class ResearchIncrementService {
  assemble(input: AssembleResearchIncrementInput): Promise<ResearchIncrementRevisionV1>;
  status(incrementId: string): Promise<ResearchIncrementStatusV1>;
  lineage(incrementId: string): Promise<ResearchIncrementLineageV1>;
}
```

Require research question, thesis, Human-authored/promoted summary, at least one valid Evidence Snapshot for an Accepted candidate, and resolvable claim/decision/question refs. `assemble` remains Working and writes no Runtime record.

- [ ] **Step 4: Run focused GREEN and Phase 1 acceptance**

Run: `pnpm vitest run tests/contracts tests/memory tests/security/research-evidence-security.test.ts tests/security/research-memory-paths.test.ts tests/cli/cli.test.ts tests/integration/research-evidence-foundation.test.ts`

Run: `pnpm typecheck && pnpm lint`

Expected: PASS; Phase 1 proves AC 1–7, 36 and 38 without regressing V2.2.

- [ ] **Step 5: Commit Task 4**

```text
git add harnesses/research-publishing/core harnesses/research-publishing/cli tests tools/acceptance.ts
git commit -m "feat: assemble evidence-backed research increments"
```

- [ ] **Step 6: Run the Phase 1 gate**

Run: `pnpm check && git diff --check && git status --short`

Expected: PASS; status contains no uncommitted Phase 1 source or test artifacts.
