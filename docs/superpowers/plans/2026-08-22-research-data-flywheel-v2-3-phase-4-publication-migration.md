# Research Data Flywheel V2.3 Phase 4: Publication Flywheel and Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Article、X Article、Thread、Single、Reply、Gist 和 GitHub Article 固化为同一 Research Increment 的不同 Publication Expressions，接入终态 Evidence Capture/反馈闭环，并通过显式 Import Promotion 建立首个真实研究增量。

**Architecture:** 发布 Intent 和公开 Observed evidence 永远分离，均由现有 Plan/Approval/Receipt 事实驱动。终态 Hook 只自动捕获 Evidence 和提出 Delta，不自动晋升语义；旧 V2.2 records 通过只读 adapter 映射，真实历史内容通过一次独立 Import Plan 和 Human Confirmation 进入 V2.3。

**Tech Stack:** TypeScript 6, Node.js 20.19+, AJV 2020-12, Vitest 4, existing Article/X Browser adapters, `llm-wiki-runtime` 0.2.0.

## Global Constraints

- Phase 3 gate must be green before starting.
- Publication Expression cannot strengthen Claim status or replace immutable Increment revision.
- `intended_content` derives from approved local Plan/package; `observed_content` derives from terminal Receipt, public verifier or explicit user assertion and never overwrites intent.
- Only Human-selected feedback enters Evidence; metrics remain context signals, never technical evidence.
- Automatic terminal hooks may capture local Evidence and draft a Delta, but cannot approve/execute Promotion or modify code/Skills.
- Import is one explicit Increment only; do not silently batch other historical posts.
- Real URLs may appear in user-owned import input/receipt, but CI uses stable synthetic fixtures and performs no network access.
- Skills remain thin: semantic framing/selection in Skills, contracts/state/digests/files/Runtime calls in Harness.

---

### Task 1: Publication Expression Assembly from Existing Plans and Receipts

**Files:**
- Create: `harnesses/research-publishing/core/publication-expression-service.ts`
- Create: `harnesses/research-publishing/core/publication-evidence-reader.ts`
- Modify: `harnesses/research-publishing/core/research-memory-contracts.ts`
- Create: `tests/memory/publication-expression-service.test.ts`
- Create: `tests/fixtures/publication-expression-evidence.ts`
- Create: `tests/security/publication-expression-security.test.ts`

**Interfaces:**
- Consumes: frozen Article Package refs, X/X Article approved Plans, V1/V2/V2.1/X Article terminal Receipts, Gist/GitHub explicit evidence and Phase 1 Evidence service.
- Produces: immutable `PublicationExpressionV1` candidates with separate intended/observed blocks and Evidence Snapshot refs.

- [x] **Step 1: Write failing cross-channel and evidence-strength tests**

```ts
it.each(['article', 'x_article', 'x_thread', 'x_single', 'x_reply', 'gist', 'github_article'])
  ('assembles %s without changing source claim status', async (channel) => {
    const expression = await service.assemble(fixtures[channel]);
    expect(expression.channel).toBe(channel);
    expect(expression.claim_refs).toEqual(fixtures[channel].claim_refs);
    expect(expression.verification_level).toBe(fixtures[channel].expected_verification);
  });

it('preserves intended truth when public verification conflicts', async () => {
  const expression = await service.assemble(conflictingReceiptFixture);
  expect(expression.intended_content.content_digest).toBe(approvedDigest);
  expect(expression.observed_content?.unexpected_content).not.toEqual([]);
  expect(expression.verification_level).toBe('conflict');
});
```

- [x] **Step 2: Run RED**

Run: `pnpm vitest run tests/memory/publication-expression-service.test.ts tests/security/publication-expression-security.test.ts`

Expected: FAIL because expression assembly is absent.

- [x] **Step 3: Implement version-dispatched evidence readers**

```ts
export interface PublicationEvidenceReader {
  readIntent(input: PublicationIntentBinding): Promise<PublicationIntentEvidenceV1>;
  readObservation(input: PublicationReceiptBinding): Promise<PublicationObservedEvidenceV1>;
}

export class PublicationExpressionService {
  assemble(input: AssemblePublicationExpressionInput): Promise<PublicationExpressionV1>;
}
```

Resolve only contained artifacts, verify bytes/digests before and after parsing, map each existing Receipt schema to `planned|manual_recorded|public_verified|outcome_unknown|conflict`, preserve item order/link/media mismatches, and reject privacy downgrade or claim escalation.

- [x] **Step 4: Run GREEN**

Run: `pnpm vitest run tests/memory/publication-expression-service.test.ts tests/security/publication-expression-security.test.ts`

Expected: PASS for all channels, receipt versions, translation/compression/adaptation and verification conflicts.

- [x] **Step 5: Commit Task 1**

```text
git add harnesses/research-publishing/core tests/memory tests/fixtures tests/security
git commit -m "feat: model publication expressions as research evidence"
```

---

### Task 2: Terminal Evidence Hooks and Governed Research Feedback Loop

**Files:**
- Create: `harnesses/research-publishing/core/research-terminal-hooks.ts`
- Create: `harnesses/research-publishing/core/research-flywheel-service.ts`
- Create: `harnesses/research-publishing/contracts/research-terminal-hook-receipt.schema.json`
- Modify: `harnesses/research-publishing/core/package-service.ts`
- Modify: `harnesses/research-publishing/branches/article-harness/article-service.ts`
- Modify: `harnesses/research-publishing/core/memory-feedback-service.ts`
- Modify: `harnesses/research-publishing/core/memory-insight-service.ts`
- Modify: `harnesses/research-publishing/adapters/x/browser/browser-adapter.ts`
- Modify: `harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.ts`
- Create: `tests/memory/research-terminal-hooks.test.ts`
- Create: `tests/memory/research-flywheel-service.test.ts`
- Create: `tests/integration/research-publication-loop.test.ts`

**Interfaces:**
- Consumes: Phase 1 capture, Task 1 expression assembly, Phase 2 Delta service and existing terminal artifacts.
- Produces: idempotent terminal event queue/ledger, Evidence Snapshot and optional candidate Delta; never Promotion approval/execution.

- [x] **Step 1: Write failing terminal-hook idempotency tests**

Cover Package Finalized, Article Finalized, Publication Plan Approved, terminal Post Receipt, terminal X Article Receipt, Feedback Selected and Candidate Insight Created. Invoke every hook twice and assert one snapshot/event result with verified identical digest.

- [x] **Step 2: Run RED**

Run: `pnpm vitest run tests/memory/research-terminal-hooks.test.ts tests/memory/research-flywheel-service.test.ts tests/integration/research-publication-loop.test.ts`

Expected: FAIL because terminal hooks and flywheel orchestration are absent.

- [x] **Step 3: Implement explicit terminal event dispatch**

```ts
export type ResearchTerminalEvent =
  | PackageFinalizedEvent | ArticleFinalizedEvent | PublicationPlanApprovedEvent
  | PublicationReceiptTerminalEvent | FeedbackSelectedEvent | CandidateInsightCreatedEvent;

export class ResearchTerminalHooks {
  record(event: ResearchTerminalEvent): Promise<ResearchTerminalHookReceiptV1>;
  resume(eventId: string): Promise<ResearchTerminalHookReceiptV1>;
}
```

Use event ID + source digest idempotency. Persist a local write-ahead ledger before capture. A terminal adapter writes its own receipt first, then records the hook; hook failure must not falsify publication status and must expose resumable `evidence_capture_pending`.

- [x] **Step 4: Implement supervised flywheel proposal**

```ts
export class ResearchFlywheelService {
  proposeFromEvidence(snapshotId: string): Promise<SemanticMemoryDeltaV1>;
  proposeNextQuestions(incrementRef: StableRevisionRef): Promise<readonly OpenQuestionCandidateV1[]>;
}
```

Candidate questions and feedback-derived operations carry evidence strength, limitations and `data_only` lineage. Service may propose but cannot call `approve`, `execute`, modify repositories, edit Skills or raise claim status.

For a terminal publication, the proposed Delta contains both `attach_publication` and a `publication_attached` lifecycle event bound to the terminal Receipt and its verification strength. It does not rewrite the immutable Increment revision.

- [x] **Step 5: Run GREEN**

Run: `pnpm vitest run tests/memory/research-terminal-hooks.test.ts tests/memory/research-flywheel-service.test.ts tests/integration/research-publication-loop.test.ts`

Expected: PASS; the loop ends at an unapproved Delta and preserves existing publication outcomes.

- [x] **Step 6: Commit Task 2**

```text
git add harnesses/research-publishing/core harnesses/research-publishing/adapters tests
git commit -m "feat: connect publication evidence to supervised research loop"
```

---

### Task 3: V2.2 Read-only Legacy Adapter

**Files:**
- Create: `harnesses/research-publishing/core/legacy-memory-adapter.ts`
- Create: `harnesses/research-publishing/contracts/legacy-research-record.schema.json`
- Create: `tests/memory/legacy-memory-adapter.test.ts`
- Create: `tests/integration/v2-2-memory-compatibility.test.ts`

**Interfaces:**
- Consumes: V2.2 `publication_evidence|feedback_snapshot|candidate_insight` exact refs and Runtime Adapter exact loading.
- Produces: read-only `LegacyResearchRecordV1` labeled `legacy_publication_evidence|legacy_feedback_snapshot|legacy_candidate_insight`; never fabricates a complete Increment.

- [x] **Step 1: Write failing preservation and non-upgrade tests**

Assert legacy files remain byte-identical, can be explicitly loaded as supporting records, cannot independently satisfy an Increment’s required research question/thesis/Evidence, and never enter Mainline without an Import Promotion.

- [x] **Step 2: Run RED**

Run: `pnpm vitest run tests/memory/legacy-memory-adapter.test.ts tests/integration/v2-2-memory-compatibility.test.ts`

Expected: FAIL because the legacy adapter is absent.

- [x] **Step 3: Implement exact read-only mapping**

```ts
export class LegacyMemoryAdapter {
  load(ref: LegacyRuntimeRecordRef): Promise<LegacyResearchRecordV1>;
  attachAsSupportingEvidence(refs: readonly LegacyRuntimeRecordRef[]): Promise<readonly LegacyEvidenceBindingV1[]>;
}
```

Preserve original path/digest and Runtime risk flags. Reject write/update methods by exposing none; conversion into V2.3 semantic records is only possible through Task 4 Import Delta/Review/Promotion.

- [x] **Step 4: Run GREEN and V2.2 loop regression**

Run: `pnpm vitest run tests/memory/legacy-memory-adapter.test.ts tests/integration/v2-2-memory-compatibility.test.ts tests/integration/memory-loop.test.ts tests/integration/memory-ingest-workflow.test.ts`

Expected: PASS and legacy source bytes are unchanged.

- [x] **Step 5: Commit Task 3**

```text
git add harnesses/research-publishing/core harnesses/research-publishing/contracts tests
git commit -m "feat: preserve V2.2 memory through read-only adapter"
```

---

### Task 4: Explicit First-increment Import Promotion

**Files:**
- Create: `harnesses/research-publishing/core/research-import-service.ts`
- Create: `harnesses/research-publishing/contracts/research-import-manifest.schema.json`
- Create: `harnesses/research-publishing/contracts/research-import-gap-report.schema.json`
- Create: `docs/examples/research-import-manifest.example.json`
- Create: `tests/fixtures/first-increment-import.ts`
- Create: `tests/memory/research-import-service.test.ts`
- Create: `tests/integration/first-increment-import-promotion.test.ts`
- Create: `tests/security/research-import-security.test.ts`

**Interfaces:**
- Consumes: user-supplied mother article path/digest, Gist URL, six ordered Thread items, existing publication receipt, claim/evidence/boundary data and explicit assertions.
- Produces: Import Evidence Snapshot, gap report, imported Working Increment, Publication Expression, Semantic Delta and ordinary Phase 2 Promotion Plan; no special write bypass.

- [ ] **Step 1: Write failing import/gap/provenance tests**

The synthetic fixture represents exactly one mother article and six Thread items. Assert missing platform IDs/metrics appear as unrecoverable gaps, user assertions remain `manual_recorded`, receipt-backed fields use their actual verification strength, item order is preserved, and extra historical posts are rejected from the same manifest.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run tests/memory/research-import-service.test.ts tests/integration/first-increment-import-promotion.test.ts tests/security/research-import-security.test.ts`

Expected: FAIL because Import contracts/service are absent.

- [ ] **Step 3: Implement bounded Import preparation**

```ts
export class ResearchImportService {
  inspect(input: ResearchImportManifestV1): Promise<ResearchImportGapReportV1>;
  capture(input: ResearchImportManifestV1): Promise<ResearchEvidenceSnapshotV1>;
  propose(input: ResearchImportManifestV1, snapshotId: string): Promise<SemanticMemoryDeltaV1>;
}
```

Require `import_scope: 'single_increment'`, exact six-item order for this migration template, explicit source classification per field, contained local paths and HTTPS public URLs. `propose` uses the normal Review → Promotion Plan → confirmation → Catalog-last path.

- [ ] **Step 4: Add first real migration operator runbook**

Document these operator inputs in the example without embedding machine-specific paths:

```text
Mother article: user-selected local canonical Markdown + exact digest
Gist: https://gist.github.com/huajiexiewenfeng/a507a4b080bdbd2e30cf8a05556b3f15
Thread root: https://x.com/Glen56121/status/2089976025677725798
Thread shape: exactly 6 ordered items
Track: enterprise-agent-runtime
Open questions: Trace, Eval, Controlled Loop remain planned research
```

The real run happens only after the user supplies/resolves the local artifact/receipt bindings and confirms the generated Import Promotion Plan digest.

- [ ] **Step 5: Run GREEN**

Run: `pnpm vitest run tests/memory/research-import-service.test.ts tests/integration/first-increment-import-promotion.test.ts tests/security/research-import-security.test.ts`

Expected: PASS; test proves AC 33 without network, Chrome or real Wiki access.

- [ ] **Step 6: Commit Task 4**

```text
git add harnesses/research-publishing/core harnesses/research-publishing/contracts docs/examples tests
git commit -m "feat: add explicit first research increment import"
```

---

### Task 5: CLI, Thin Skills, Documentation, Manifest, and Full Acceptance

**Files:**
- Modify: `harnesses/research-publishing/cli/index.ts`
- Modify: `skills/article-publishing-copilot/SKILL.md`
- Modify: `skills/article-publishing-copilot/references/memory-loop.md`
- Modify: `skills/x-publishing-copilot/SKILL.md`
- Modify: `skills/x-publishing-copilot/references/memory-loop.md`
- Create: `docs/guides/memory-loop.md`
- Modify: `docs/guides/quickstart.md`
- Modify: `docs/architecture/research-publishing-harness-design.zh-CN.md`
- Modify: `README.md`
- Modify: `tests/cli/cli.test.ts`
- Modify: `tests/skills/skill-boundary.test.ts`
- Modify: `tests/tools/manifest-content.test.ts`
- Create: `tests/integration/research-data-flywheel-v2-3.test.ts`
- Create: `tests/security/research-data-flywheel-v2-3-security.test.ts`
- Modify: `tools/acceptance.ts`
- Modify: `registry/manifests/research-publishing.json` via generator

**Interfaces:**
- Produces: terminal-hook status/resume and import inspect/capture/propose routes; Article/X Skills route to the shared V2.3 CLI without duplicating Harness logic.

- [ ] **Step 1: Write failing CLI/Skill/manifest tests**

Assert all V2.3 commands from design section 18 are visible; Skills describe Catalog-first Query, terminal Evidence Capture, one Promotion confirmation and prohibition on direct `.llm-wiki` writes/automatic semantic promotion. Manifest must include every new shipped source/schema/reference.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run tests/cli/cli.test.ts tests/skills/skill-boundary.test.ts tests/tools/manifest-content.test.ts tests/integration/research-data-flywheel-v2-3.test.ts tests/security/research-data-flywheel-v2-3-security.test.ts`

Expected: FAIL because final routes/docs/manifest and full-loop evidence are absent.

- [ ] **Step 3: Add thin CLI and Skill routing**

Expose `memory evidence`, `increment`, `lineage`, `delta`, `promotion`, `query`, `index`, terminal-hook and import operations. Skills choose semantic inputs and ask for the single exact Promotion confirmation; they invoke CLI for all files, digests, Runtime access and state transitions.

- [ ] **Step 4: Update operator and architecture documentation**

Document the North Star, planes, lifecycle, intended/observed split, five Views, Catalog-last guarantee, exact progressive Query, feedback evidence limits, V2.2 compatibility, first Import runbook and failure/reconciliation responses. State Phase 3/4 product claims only after the corresponding tests pass.

- [ ] **Step 5: Build full offline acceptance**

Acceptance must execute: finalized synthetic Package → automatic Evidence → canonical document reconstruction → Delta/Review → exact Approval → injected mid-Promotion crash → safe resume → Catalog-last → progressive Query → Package binding → synthetic Article/Thread expressions → selected feedback → next unapproved Delta. Map each assertion to AC 1–38 in the acceptance output.

- [ ] **Step 6: Run focused GREEN and regenerate manifest**

Run: `pnpm vitest run tests/cli/cli.test.ts tests/skills/skill-boundary.test.ts tests/tools/manifest-content.test.ts tests/integration/research-data-flywheel-v2-3.test.ts tests/security/research-data-flywheel-v2-3-security.test.ts`

Run: `pnpm manifest`

Expected: PASS; manifest includes final V2.3 production/contracts/Skill/reference files with current hashes.

- [ ] **Step 7: Run fresh full verification**

Run: `pnpm check`

Expected: lint, typecheck, all Vitest suites and offline acceptance PASS; no test accesses real Wiki, Chrome, X, Gist or GitHub.

Acceptance output explicitly proves Phase 4 ownership of AC 12–16, 32–34 and 37, then reports the consolidated AC 1–38 result.

- [ ] **Step 8: Audit safety and repository cleanliness**

Run: `rg -n -i "cookie|password|private[_ -]?key|recovery[_ -]?code|C:\\\\Users\\\\admin|domains/research-publishing/\\*\\*" memory receipts registry docs/examples harnesses/research-publishing skills`

Expected: no generated secret/user-absolute-path evidence; any broad-glob match is confined to documented V2.2 compatibility declarations, never V2.3 Query execution.

Run: `git diff --check && git status --short`

Expected: only intended final Task 5 files are uncommitted.

- [ ] **Step 9: Commit Task 5**

```text
git add harnesses/research-publishing skills docs README.md tests tools registry
git commit -m "feat: complete V2.3 research data flywheel"
```

- [ ] **Step 10: Close with project-finish**

Use `$project-finish` to sync actual files/tests/acceptance evidence to the project-local LLM Wiki and requirements traceability. Do not mark V2.3 complete until `pnpm check`, manifest verification and AC 1–38 audit all pass.
