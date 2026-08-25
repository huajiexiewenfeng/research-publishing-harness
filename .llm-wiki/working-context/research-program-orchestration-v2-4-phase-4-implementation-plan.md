# Research Program Orchestration V2.4 Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The confirmed collaboration mode is inline execution on the current branch; do not dispatch subagents unless the user explicitly changes that decision.

**Goal:** Implement deterministic Weekly publication closure and a bounded AI research-partner loop that converts one completed Publication Bundle into auditable Outcome, Research Memory candidates, two Publication Expressions, terminal Evidence, honest AI Synthesis and optional continuation options without automatic semantic promotion.

**Architecture:** Gate A installs one create-only `WeeklyPublicationOutcomeV1`, releases the selected Topic through a deterministic revision, records a rebuildable closure marker, and projects the Weekly Cycle to `published`. Gate B independently projects Package Claims into Memory-candidate statuses, creates one working Increment, assembles Article and Single Expressions with terminal Evidence, freezes bounded Synthesis Input Snapshots, and records immutable AI Synthesis revisions plus optional proposals. Existing Query and Delta/Review/Promotion services remain the only Runtime read and long-term semantic-write boundaries.

**Tech Stack:** TypeScript 6, Node.js 20.19+, AJV 2020-12, Vitest 4, existing `WorkspaceStore`, `PublicationBundleService` artifacts, Research Program V1, Research Memory V2.3, `llm-wiki-runtime` 0.2.0 through the existing adapter, Markdown/YAML Skill assets.

## Global Constraints

- Approved specification: `.llm-wiki/requirements/research-program-orchestration-v2-4-phase-4.md`, confirmed source digest `sha256:674847eb5582837cba20195eb1ed15a204335f24cf84b942d085bae4cc23fbd5`.
- Planning baseline: current `main` at `0a80293`; record the actual HEAD and clean/dirty state again before Task 1.
- Execute inline on the current branch. Do not create a branch or dispatch subagents unless the user explicitly changes that decision.
- Every implementation task follows RED → GREEN → REFACTOR, stages only its declared paths, runs `git diff --cached --check`, and ends in a focused commit.
- Gate A and Gate B are independent success lines. A truthful Outcome is never deleted, downgraded or rolled back because Bridge, AI, Query or Runtime work is unavailable.
- Only a completed, freshly revalidated Publication Bundle may create an Outcome. Callers cannot supply URLs, publication timestamps, Claim statuses, replacement refs, Topic state or Track identity.
- Publication closes a Weekly Cycle but does not complete its Topic. The deterministic projection is `reserved` → `available`; semantic continue/reframe/pause/split/merge/complete/retire decisions remain Human-controlled.
- The default binding is exactly one new working Increment per Outcome under `one-outcome-one-increment/v1`. Derive `track_id` from the contained Roadmap revision's `primary_track_id`; never infer it from a project name.
- Package-to-Memory Claim mapping is exact: `validated→verified`, `shipped→observed`, `observed→observed`, `exploring→hypothesis`, `planned→planned`, `hypothesis→hypothesis`. No source status maps automatically to `inferred`.
- Projected Claims are candidates referenced by the working Increment. This phase does not create accepted `ClaimVersionV1` records or bypass Semantic Delta, Human Review, Promotion Plan or Promotion confirmation.
- Synthesis is checkpoint-driven or explicitly requested. `no_material_change` and `insufficient_evidence` are successful outcomes; zero Insights are valid and novelty count is never a quality KPI.
- Synthesis stores concise rationale, evidence, uncertainty and falsification conditions, never hidden chain-of-thought or token-by-token reasoning.
- Runtime Query is read-only and degradable. `runtime_unavailable`, `index_unavailable` and empty context must remain explicit limitations; no new Runtime protocol or Runtime source change is permitted.
- External metrics remain secondary signals. Only Human-selected Feedback Snapshots may enter the bounded Synthesis Snapshot, and they remain independently unverified until review or reproduction.
- No operation performs a real Browser, X, GitHub, Runtime write or user Wiki write in tests or acceptance. Use temporary Workspaces and Fake AI only.
- Preserve all Phase 1–3 direct Program, publication, Browser and V2.3 Memory CLI behavior.

## Delivery Gates

| Gate | Tasks | Independently testable result |
|---|---|---|
| A — Program Closure | 1–3 | completed Bundle → immutable Outcome → Topic `available` → Cycle `published` |
| B1 — Research Bridge | 4–5 | Outcome → Claim Projection → working Increment → Article/Single Expressions and terminal Evidence |
| B2 — AI Research Partner | 6–8 | bounded Snapshot → immutable Synthesis revision → optional non-authoritative proposal |
| Phase 4 acceptance | 9 | Fake full loop, security/backward-compatibility verification and lifecycle handoff |

Gate A must pass before Gate B1 uses a Weekly Outcome. Gate B2 may also run at a pre-Outcome checkpoint when its exact Snapshot inputs exist. Gate B1 or B2 failure never invalidates Gate A.

## File Structure Map

| File | Responsibility |
|---|---|
| `harnesses/research-publishing/core/weekly-outcome-types.ts` | Closed Outcome, closure marker, status and service input types |
| `harnesses/research-publishing/core/weekly-outcome-contracts.ts` | Outcome constructors, self-digests, deterministic ref derivation and exact invariants |
| `harnesses/research-publishing/core/weekly-outcome-service.ts` | Bundle verification, Outcome installation, Topic release, recovery and closure projection |
| `harnesses/research-publishing/core/weekly-research-cycle-service.ts` | Rebuild `published` only from valid Outcome plus closure marker |
| `harnesses/research-publishing/core/research-bridge-types.ts` | Claim Projection, Increment Binding and Bridge status contracts |
| `harnesses/research-publishing/core/research-bridge-contracts.ts` | Conservative Claim mapping, deterministic ids and bridge digests |
| `harnesses/research-publishing/core/weekly-research-bridge-service.ts` | Outcome-to-Increment, Expression and terminal Evidence orchestration |
| `harnesses/research-publishing/core/artifact-admission-policy.ts` | Shared secret/path/privacy admission rules for Evidence and Synthesis context |
| `harnesses/research-publishing/core/research-synthesis-types.ts` | Snapshot, Candidate, Attempt, Revision, Proposal and status contracts |
| `harnesses/research-publishing/core/research-synthesis-contracts.ts` | Closed constructors and disposition/Insight/ref invariants |
| `harnesses/research-publishing/core/research-synthesis-service.ts` | Bounded Snapshot planning, attempt recording, immutable revisions and proposals |
| `harnesses/research-publishing/core/types.ts` | AJV contract-name registration for all Phase 4 schemas |
| `harnesses/research-publishing/cli/index.ts` | Eleven JSON-only Outcome/Bridge/Synthesis/Continuation operations |
| `skills/research-synthesis-copilot/` | Thin semantic Skill, Runtime-query sequence, SCP and Harness invocation |
| `tools/build-manifest.ts` and `registry/harnesses.json` | Package/discover the third first-party Skill |
| `tests/fixtures/phase-4-research-loop.ts` | One real local Phase 1–3 fixture extended through Phase 4; no external effects |

---

### Task 1: Weekly Outcome Contracts, Closure Marker, and Phase 4 Fixture

**Files:**
- Create: `harnesses/research-publishing/core/weekly-outcome-types.ts`
- Create: `harnesses/research-publishing/core/weekly-outcome-contracts.ts`
- Create: `harnesses/research-publishing/contracts/weekly-publication-outcome.schema.json`
- Create: `harnesses/research-publishing/contracts/weekly-outcome-closure.schema.json`
- Create: `harnesses/research-publishing/contracts/weekly-outcome-status.schema.json`
- Modify: `harnesses/research-publishing/core/types.ts`
- Create: `tests/program/weekly-outcome-contracts.test.ts`
- Modify: `tests/contracts/contracts.test.ts`
- Create: `tests/fixtures/phase-4-research-loop.ts`

**Interfaces:**
- Consumes: `ResearchArtifactRefV1`, `ResearchStreamId`, `ClaimBoundaryStatus`, `PublicationBundleReceiptV1`, exact child Plan/Receipt file refs and existing Phase 1–3 fixture helpers.
- Produces: `WeeklyPublicationOutcomeV1`, `WeeklyOutcomeClosureV1`, `WeeklyOutcomeStatusV1`, `createWeeklyPublicationOutcome`, `createWeeklyOutcomeClosure`, `createWeeklyOutcomeStatus`, and a completed local Bundle fixture used by Tasks 2–9.

- [ ] **Step 1: Write failing closed-contract and digest tests**

Add tests that require create-only source facts and reject caller mutation:

```ts
it('derives one immutable factual Outcome from exact contained refs', () => {
  const outcome = createWeeklyPublicationOutcome(outcomeInput);
  expect(outcome).toMatchObject({
    schema_version: 'weekly-publication-outcome/v1',
    public_urls: [articleUrl, singleUrl],
    research_stream_ids: ['knowledge_runtime_governance']
  });
  expect(outcome.outcome_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
});

it('rejects a changed URL, status, timestamp or child ref', () => {
  const outcome = createWeeklyPublicationOutcome(outcomeInput);
  expect(() => assertWeeklyPublicationOutcome({
    ...outcome,
    article: { ...outcome.article, public_url: 'https://x.com/other/article/1' }
  })).toThrowError(/Outcome digest|public URL/);
});

it('binds the released Topic revision before closure is complete', () => {
  const closure = createWeeklyOutcomeClosure({
    outcome_ref: ref('program/weeks/week_01_2026/outcome.json', 'a'),
    released_topic_ref: ref('program/backlog/topics/topic_b/revisions/3.json', 'b'),
    closed_at: now
  });
  expect(closure.status).toBe('complete');
});
```

- [ ] **Step 2: Run RED**

Run:

```text
pnpm vitest run tests/program/weekly-outcome-contracts.test.ts tests/contracts/contracts.test.ts
```

Expected: FAIL because the three schemas, constructors and registered names do not exist.

- [ ] **Step 3: Define exact Outcome and projection types**

Create these public shapes in `weekly-outcome-types.ts`:

```ts
export interface WeeklyPublishedChildV1 {
  readonly plan_ref: ResearchArtifactRefV1;
  readonly receipt_ref: ResearchArtifactRefV1;
  readonly public_url: string;
  readonly published_at: string;
  readonly verification_status: string;
  readonly limitations: readonly string[];
}

export interface WeeklyPublicationOutcomeV1 {
  readonly schema_version: 'weekly-publication-outcome/v1';
  readonly outcome_id: string;
  readonly cycle_ref: ResearchArtifactRefV1;
  readonly roadmap_ref: ResearchArtifactRefV1;
  readonly topic_ref: ResearchArtifactRefV1;
  readonly selection_ref: ResearchArtifactRefV1;
  readonly research_content_package_ref: ResearchArtifactRefV1;
  readonly weekly_article_ref: ResearchArtifactRefV1;
  readonly article_package_ref: ResearchArtifactRefV1;
  readonly bundle_plan_ref: ResearchArtifactRefV1;
  readonly bundle_approval_ref: ResearchArtifactRefV1;
  readonly bundle_receipt_ref: ResearchArtifactRefV1;
  readonly article: WeeklyPublishedChildV1;
  readonly single: WeeklyPublishedChildV1;
  readonly public_urls: readonly [string, string];
  readonly research_stream_ids: readonly ResearchStreamId[];
  readonly package_claim_refs: readonly string[];
  readonly package_evidence_refs: readonly string[];
  readonly package_boundary_refs: readonly string[];
  readonly package_open_question_refs: readonly string[];
  readonly issued_at: string;
  readonly outcome_digest: `sha256:${string}`;
}

export interface WeeklyOutcomeClosureV1 {
  readonly schema_version: 'weekly-outcome-closure/v1';
  readonly outcome_ref: ResearchArtifactRefV1;
  readonly released_topic_ref: ResearchArtifactRefV1;
  readonly status: 'complete';
  readonly closed_at: string;
  readonly closure_digest: `sha256:${string}`;
}

export interface WeeklyOutcomeStatusV1 {
  readonly schema_version: 'weekly-outcome-status/v1';
  readonly cycle_id: string;
  readonly phase: 'pending' | 'complete' | 'conflict';
  readonly outcome_ref: ResearchArtifactRefV1 | null;
  readonly released_topic_ref: ResearchArtifactRefV1 | null;
  readonly blocked_reason: string | null;
  readonly updated_at: string;
  readonly projection_digest: `sha256:${string}`;
}
```

`AssembleWeeklyOutcomeInput` contains only `cycle_id`. `ResumeWeeklyOutcomeInput` contains only `cycle_id`. URLs, timestamps, refs, statuses and actor values are never public inputs.

- [ ] **Step 4: Implement constructors and schemas**

Use self-excluding bodies and exact tuple/ref invariants:

```ts
export function createWeeklyPublicationOutcome(
  input: Omit<WeeklyPublicationOutcomeV1, 'schema_version' | 'public_urls' | 'outcome_digest'>
): WeeklyPublicationOutcomeV1 {
  const body = {
    schema_version: 'weekly-publication-outcome/v1' as const,
    ...input,
    public_urls: [input.article.public_url, input.single.public_url] as const
  };
  return validateContract('weekly-publication-outcome', {
    ...body,
    outcome_digest: sha256(body)
  });
}

export function assertWeeklyPublicationOutcome(value: WeeklyPublicationOutcomeV1): void {
  const { outcome_digest, public_urls: _publicUrls, ...input } = value;
  const recreated = createWeeklyPublicationOutcome(input);
  if (recreated.outcome_digest !== outcome_digest) {
    throw new HarnessError('CONTRACT_INVALID', 'Weekly Outcome digest mismatch');
  }
}
```

Every schema uses draft 2020-12, `additionalProperties: false`, exact schema-version constants, canonical digest patterns, contained relative paths, unique refs and ISO date-time formats. `weekly-publication-outcome` requires exactly two ordered HTTPS URLs. Register all three names in `CONTRACT_NAMES`.

- [ ] **Step 5: Create one full local Phase 4 fixture**

Build `createCompletedPhase4BundleFixture()` by composing real Roadmap/Backlog/Weekly services with the existing Publication Bundle fixture logic. It must create a real Topic revision, reserve it through the real Human Selection flow, complete both child publications with local receipts, and return:

```ts
export interface CompletedPhase4BundleFixture {
  readonly store: WorkspaceStore;
  readonly roadmaps: ResearchRoadmapService;
  readonly backlog: ResearchBacklogService;
  readonly weeks: WeeklyResearchCycleService;
  readonly bundles: PublicationBundleService;
  readonly cycle_id: string;
  readonly topic_id: string;
  readonly bundle_id: string;
  readonly bundle_receipt: PublicationBundleReceiptV1;
  readonly workspace_identity_digest: `sha256:${string}`;
}
```

The fixture uses temporary files and real Harness services but Fake/locally installed child Receipts. It exposes no network or Browser Host.

- [ ] **Step 6: Run GREEN and commit Task 1**

Run:

```text
pnpm vitest run tests/program/weekly-outcome-contracts.test.ts tests/contracts/contracts.test.ts
pnpm typecheck
git diff --check
```

Expected: selected tests and typecheck pass. Stage only Task 1 paths, run `git diff --cached --check`, and commit:

```text
git commit -m "feat: add weekly outcome contracts"
```

---

### Task 2: Weekly Outcome Service, Topic Release, and Recovery

**Files:**
- Create: `harnesses/research-publishing/core/weekly-outcome-service.ts`
- Modify: `harnesses/research-publishing/core/weekly-research-cycle-service.ts`
- Create: `tests/program/weekly-outcome-service.test.ts`
- Create: `tests/program/weekly-outcome-recovery.test.ts`
- Create: `tests/security/weekly-outcome-security.test.ts`
- Modify: `tests/program/weekly-research-cycle-service.test.ts`

**Interfaces:**
- Consumes: Task 1 contracts/fixture, `PublicationBundleReceiptV1`, `VersionedPublicationEvidenceReader`, `ResearchBacklogService.release`, current Roadmap/Topic/Package/Bundle schemas and `WorkspaceStore` create-only/atomic primitives.
- Produces: `WeeklyOutcomeService.assemble`, `.resume`, `.status`, deterministic Topic release evidence and `WeeklyResearchCycleService.status` projection to `published`.

- [ ] **Step 1: Write failing closure, idempotency and fail-closed tests**

```ts
it('closes only a completed exact Bundle and releases Topic without completing it', async () => {
  const outcome = await service.assemble({ cycle_id: fixture.cycle_id });
  expect(outcome.public_urls).toEqual([
    fixture.bundle_receipt.article.public_url,
    fixture.bundle_receipt.single.public_url
  ]);
  const status = await service.status(fixture.cycle_id);
  expect(status.phase).toBe('complete');
  expect((await fixture.weeks.status(fixture.cycle_id)).phase).toBe('published');
  expect((await currentTopic()).availability).toBe('available');
  expect((await currentTopic()).outcome_ref).toBeNull();
});

it('repairs a crash after Outcome write without creating a second Topic revision', async () => {
  await seedOutcomeOnly();
  const first = await service.resume({ cycle_id: fixture.cycle_id });
  const revision = first.released_topic_ref;
  await fixture.store.removeFile(`program/weeks/${fixture.cycle_id}/outcome-closure.json`);
  const second = await service.resume({ cycle_id: fixture.cycle_id });
  expect(second.released_topic_ref).toEqual(revision);
});

it.each(['partial', 'failed_after_submit', 'verification_conflict'])
('rejects Bundle state %s without writing Outcome or Topic revision', async (phase) => {
  await seedNonCompletedBundle(phase);
  await expect(service.assemble({ cycle_id: fixture.cycle_id }))
    .rejects.toMatchObject({ code: 'STATE_TRANSITION_INVALID' });
  expect(await fixture.store.exists(`program/weeks/${fixture.cycle_id}/outcome.json`)).toBe(false);
});
```

- [ ] **Step 2: Run RED**

Run:

```text
pnpm vitest run tests/program/weekly-outcome-service.test.ts tests/program/weekly-outcome-recovery.test.ts tests/security/weekly-outcome-security.test.ts tests/program/weekly-research-cycle-service.test.ts
```

Expected: FAIL because the Outcome service and `published` rebuild path do not exist.

- [ ] **Step 3: Implement strict Bundle-to-Outcome verification**

Define the public service boundary:

```ts
export class WeeklyOutcomeService {
  constructor(
    private readonly store: WorkspaceStore,
    private readonly roadmaps: ResearchRoadmapService,
    private readonly backlog: ResearchBacklogService,
    private readonly weeks: WeeklyResearchCycleService,
    options: { readonly now?: () => Date } = {}
  ) {}

  async assemble(input: { readonly cycle_id: string }): Promise<WeeklyPublicationOutcomeV1>;
  async resume(input: { readonly cycle_id: string }): Promise<WeeklyOutcomeStatusV1>;
  async status(cycleId: string): Promise<WeeklyOutcomeStatusV1>;
}
```

Under `program/weeks/<cycle-id>/outcome.lock`, `assemble` must:

1. re-read Cycle, Candidate Set, Human Selection, selected Topic revision, Roadmap revision, Package V1.2, finalized Article ref, weekly Bundle binding, Bundle Plan/Approval and joint Receipt;
2. verify file-byte refs and every contained semantic digest independently;
3. require Bundle status `completed`, exact Cycle/Selection/Package/Article lineage and two valid child Plan/Receipt pairs;
4. use `VersionedPublicationEvidenceReader` to derive child public URLs, timestamps, verification levels and limitations;
5. derive Package Claim/Evidence/Boundary/Open Question refs by Package id and ordinal; and
6. write exactly `program/weeks/<cycle-id>/outcome.json` with `writeNew` before calling `resume`.

The method never reads public facts from input and never accepts replacement refs.

- [ ] **Step 4: Implement deterministic Topic release and closure marker**

Use a release reason that binds the already computed Outcome:

```ts
export function outcomeReleaseReason(outcome: WeeklyPublicationOutcomeV1): string {
  return `released after Weekly Outcome ${outcome.outcome_id}@${outcome.outcome_digest}`;
}
```

`resume` verifies the installed Outcome, then:

- if the selected Topic is still `reserved` at the exact selected revision, call `backlog.release` with the deterministic reason and `changed_by: 'research-publishing-harness/weekly-outcome-service'`;
- if it is already `available`, scan immutable revisions for exactly one release whose `previous_revision_ref` equals the selected Topic ref and whose reason equals `outcomeReleaseReason(outcome)`;
- if it is `completed`, `retired`, belongs to another selection, or no exact release can be proven, return/throw `conflict` without rewriting history;
- write `outcome-closure.json` create-only with the exact Outcome and released Topic refs; and
- rebuild `outcome-status.json` atomically from source artifacts.

This marker is a rebuildable projection receipt; it is not a semantic Topic decision and contains no accepted Claim.

- [ ] **Step 5: Project Weekly Cycle `published` only from valid closure**

Extend `WeeklyResearchCycleService.status` to prefer a valid `outcome-closure.json` over `publication-bundle-binding.json`. Re-read Outcome and released Topic bytes, verify closure digest and exact cycle identity, then call `createWeeklyCycleStatus` with:

```ts
{
  phase: 'published',
  bundle_ref: currentPublicationBundleBindingRef,
  outcome_ref: exactOutcomeFileRef,
  blocked_reason: null,
  updated_at: closure.closed_at
}
```

An Outcome without a valid closure remains `publication_planned`; a closure mismatch fails closed. Deleting only `status.json` must rebuild the same `published` projection without creating a Topic revision.

- [ ] **Step 6: Run GREEN and commit Task 2**

Run:

```text
pnpm vitest run tests/program/weekly-outcome-service.test.ts tests/program/weekly-outcome-recovery.test.ts tests/security/weekly-outcome-security.test.ts tests/program/weekly-research-cycle-service.test.ts tests/publication-bundle/publication-bundle-status.test.ts
pnpm typecheck
git diff --check
```

Expected: all selected tests pass and existing Bundle status still ends at its own `completed` state. Commit exact Task 2 paths:

```text
git commit -m "feat: close published weeks with immutable Outcomes"
```

---

### Task 3: Program Outcome CLI and Gate A Acceptance

**Files:**
- Modify: `harnesses/research-publishing/cli/index.ts`
- Modify: `tests/cli/cli.test.ts`
- Create: `tests/integration/weekly-outcome-closure.test.ts`
- Create: `tests/security/weekly-outcome-path-boundary.test.ts`

**Interfaces:**
- Consumes: Task 2 `WeeklyOutcomeService` and existing Program service construction.
- Produces: three JSON-only operations and an independently passing Gate A integration suite.

- [ ] **Step 1: Write failing CLI-discovery and full Gate A tests**

Require these exact operations:

```ts
const operations = [
  'program week outcome assemble',
  'program week outcome status',
  'program week outcome resume'
];
```

The integration test runs the completed local Bundle fixture through Outcome assembly and asserts one Outcome, one Topic release revision, one closure marker, Cycle `published`, no `memory/promotions`, and no network/Browser/Runtime call.

- [ ] **Step 2: Run RED**

```text
pnpm build
pnpm vitest run tests/cli/cli.test.ts tests/integration/weekly-outcome-closure.test.ts tests/security/weekly-outcome-path-boundary.test.ts
```

Expected: FAIL because the three routes are absent.

- [ ] **Step 3: Add exact JSON-only routes**

Inside the existing `operation.startsWith('program ')` branch, construct one shared `WeeklyOutcomeService` and add:

```ts
if (operation === 'program week outcome assemble') {
  const artifact = await outcomes.assemble(
    await readInput<{ readonly cycle_id: string }>(options)
  );
  return { ok: true, operation, artifact, state: 'outcome_created' };
}
if (operation === 'program week outcome status') {
  const { cycle_id } = await readInput<{ readonly cycle_id: string }>(options);
  const artifact = await outcomes.status(cycle_id);
  return { ok: true, operation, artifact, state: artifact.phase };
}
if (operation === 'program week outcome resume') {
  const artifact = await outcomes.resume(
    await readInput<{ readonly cycle_id: string }>(options)
  );
  return { ok: true, operation, artifact, state: artifact.phase };
}
```

No route accepts a URL, timestamp, Topic availability, digest override, actor override, shell string or auto-confirm flag.

- [ ] **Step 4: Run Gate A GREEN and regressions**

```text
pnpm vitest run tests/program/weekly-outcome-contracts.test.ts tests/program/weekly-outcome-service.test.ts tests/program/weekly-outcome-recovery.test.ts tests/program/weekly-research-cycle-service.test.ts tests/security/weekly-outcome-security.test.ts tests/security/weekly-outcome-path-boundary.test.ts tests/integration/weekly-outcome-closure.test.ts tests/publication-bundle tests/cli/cli.test.ts
pnpm lint
pnpm typecheck
```

Expected: Gate A and all Publication Bundle regressions pass. Stage exact Task 3 paths, run `git diff --cached --check`, and commit:

```text
git commit -m "feat: expose resumable Weekly Outcome closure"
```

Gate A is now independently reviewable. Do not start Gate B1 during execution if Gate A review finds unresolved Outcome or Topic-history risk.

---

### Task 4: Claim Projection and Research Bridge Contracts

**Files:**
- Create: `harnesses/research-publishing/core/research-bridge-types.ts`
- Create: `harnesses/research-publishing/core/research-bridge-contracts.ts`
- Create: `harnesses/research-publishing/contracts/claim-projection.schema.json`
- Create: `harnesses/research-publishing/contracts/weekly-research-increment-binding.schema.json`
- Create: `harnesses/research-publishing/contracts/weekly-research-bridge-status.schema.json`
- Modify: `harnesses/research-publishing/core/types.ts`
- Create: `tests/memory/research-bridge-contracts.test.ts`
- Create: `tests/memory/claim-projection.test.ts`
- Modify: `tests/contracts/contracts.test.ts`

**Interfaces:**
- Consumes: `WeeklyPublicationOutcomeV1`, Package V1.2 Claim fields, `LegacyClaimStatus`, `ResearchArtifactRefV1` and existing working Increment refs.
- Produces: `ClaimProjectionV1`, `WeeklyResearchIncrementBindingV1`, `WeeklyResearchBridgeStatusV1`, `projectPackageClaimStatus`, deterministic bridge ids and constructors consumed by Task 5.

- [ ] **Step 1: Write failing table, digest and no-strengthening tests**

```ts
it.each([
  ['validated', 'verified'],
  ['shipped', 'observed'],
  ['observed', 'observed'],
  ['exploring', 'hypothesis'],
  ['planned', 'planned'],
  ['hypothesis', 'hypothesis']
] as const)('projects %s to %s', (source, projected) => {
  expect(projectPackageClaimStatus(source)).toBe(projected);
});

it('never produces inferred automatically', () => {
  for (const status of packageStatuses) {
    expect(projectPackageClaimStatus(status)).not.toBe('inferred');
  }
});

it('binds the exact Outcome, Projection and working Increment revision', () => {
  const binding = createWeeklyResearchIncrementBinding(bindingInput);
  expect(binding.binding_policy).toBe('one-outcome-one-increment/v1');
  expect(binding.track_id).toBe('enterprise-agent-runtime');
});
```

- [ ] **Step 2: Run RED**

```text
pnpm vitest run tests/memory/research-bridge-contracts.test.ts tests/memory/claim-projection.test.ts tests/contracts/contracts.test.ts
```

Expected: FAIL because the bridge contracts do not exist.

- [ ] **Step 3: Define exact candidate projection and bridge types**

```ts
export interface ClaimProjectionItemV1 {
  readonly source_claim_ref: string;
  readonly source_claim_id: string;
  readonly statement_digest: `sha256:${string}`;
  readonly source_status: ClaimBoundaryStatus;
  readonly candidate_claim_ref: string;
  readonly candidate_status: LegacyClaimStatus;
  readonly evidence_refs: readonly string[];
  readonly projection_rule: 'package-to-memory-claim/v1';
  readonly loss_note: string;
}

export interface ClaimProjectionV1 {
  readonly schema_version: 'claim-projection/v1';
  readonly projection_id: string;
  readonly outcome_ref: ResearchArtifactRefV1;
  readonly package_ref: ResearchArtifactRefV1;
  readonly items: readonly ClaimProjectionItemV1[];
  readonly projected_at: string;
  readonly projection_digest: `sha256:${string}`;
}

export interface WeeklyResearchIncrementBindingV1 {
  readonly schema_version: 'weekly-research-increment-binding/v1';
  readonly cycle_id: string;
  readonly outcome_ref: ResearchArtifactRefV1;
  readonly claim_projection_ref: ResearchArtifactRefV1;
  readonly track_id: string;
  readonly increment_id: string;
  readonly increment_ref: string;
  readonly increment_revision_ref: ResearchArtifactRefV1;
  readonly binding_policy: 'one-outcome-one-increment/v1';
  readonly bound_at: string;
  readonly binding_digest: `sha256:${string}`;
}

export interface WeeklyResearchBridgeStatusV1 {
  readonly schema_version: 'weekly-research-bridge-status/v1';
  readonly cycle_id: string;
  readonly phase: 'pending' | 'in_progress' | 'complete' | 'blocked';
  readonly outcome_ref: ResearchArtifactRefV1;
  readonly claim_projection_ref: ResearchArtifactRefV1 | null;
  readonly increment_binding_ref: ResearchArtifactRefV1 | null;
  readonly article_expression_ref: ResearchArtifactRefV1 | null;
  readonly article_evidence_ref: string | null;
  readonly single_expression_ref: ResearchArtifactRefV1 | null;
  readonly single_evidence_ref: string | null;
  readonly blocked_reason: string | null;
  readonly updated_at: string;
  readonly projection_digest: `sha256:${string}`;
}
```

Projected candidate refs use `claim-candidate:<projection-id>:<source-claim-id>`. They are not `claim:<id>@<version>` and cannot be mistaken for accepted `ClaimVersionV1` records.

- [ ] **Step 4: Implement the locked mapping and deterministic identities**

```ts
const CLAIM_PROJECTION: Readonly<Record<ClaimBoundaryStatus, LegacyClaimStatus>> = {
  validated: 'verified',
  shipped: 'observed',
  observed: 'observed',
  exploring: 'hypothesis',
  planned: 'planned',
  hypothesis: 'hypothesis'
};

export function projectPackageClaimStatus(status: ClaimBoundaryStatus): LegacyClaimStatus {
  return CLAIM_PROJECTION[status];
}

export function incrementIdForOutcome(outcome: WeeklyPublicationOutcomeV1): string {
  return `weekly_${outcome.outcome_id}_${outcome.outcome_digest.slice(7, 19)}`;
}
```

Constructors sort neither Claims nor evidence silently: they preserve Package order, require unique source/candidate refs, require non-empty loss notes, calculate self-excluding digests and reject any candidate status that differs from the locked table. Register all three schemas.

- [ ] **Step 5: Run GREEN and commit Task 4**

```text
pnpm vitest run tests/memory/research-bridge-contracts.test.ts tests/memory/claim-projection.test.ts tests/contracts/contracts.test.ts
pnpm typecheck
git diff --check
```

Expected: all selected tests pass. Commit exact Task 4 paths:

```text
git commit -m "feat: add weekly research bridge contracts"
```

---

### Task 5: Outcome-to-Increment Bridge, Two Expressions, and Terminal Evidence

**Files:**
- Create: `harnesses/research-publishing/core/weekly-research-bridge-service.ts`
- Create: `tests/memory/weekly-research-bridge-service.test.ts`
- Create: `tests/memory/weekly-research-bridge-recovery.test.ts`
- Create: `tests/security/weekly-research-bridge-security.test.ts`
- Create: `tests/integration/weekly-research-bridge.test.ts`

**Interfaces:**
- Consumes: Task 4 contracts, `ResearchEvidenceService`, `ResearchIncrementService`, `PublicationExpressionService`, `VersionedPublicationEvidenceReader`, exact Outcome/Package/Bundle/child artifacts.
- Produces: `WeeklyResearchBridgeService.assemble`, `.resume`, `.status`, one working Increment, two observed Expressions and two terminal Evidence Snapshots.

- [ ] **Step 1: Write failing assembly, independence and recovery tests**

```ts
it('assembles one working Increment and two independent Expressions', async () => {
  const status = await bridge.assemble({
    cycle_id: fixture.cycle_id,
    workspace_identity_digest: fixture.workspace_identity_digest
  });
  expect(status.phase).toBe('complete');
  const binding = await readIncrementBinding();
  expect(binding.track_id).toBe('enterprise-agent-runtime');
  expect(binding.binding_policy).toBe('one-outcome-one-increment/v1');
  expect((await readExpression('x-article')).channel).toBe('x_article');
  expect((await readExpression('x-single')).channel).toBe('x_single');
});

it('resumes one missing Single Expression without replacing Article evidence', async () => {
  await assembleThroughArticleEvidence();
  const articleEvidence = (await bridge.status(fixture.cycle_id)).article_evidence_ref;
  const final = await bridge.resume({ cycle_id: fixture.cycle_id });
  expect(final.phase).toBe('complete');
  expect(final.article_evidence_ref).toBe(articleEvidence);
});

it('does not roll back a truthful Outcome when Bridge assembly is blocked', async () => {
  await corruptExpressionIntentRef();
  await expect(bridge.resume({ cycle_id: fixture.cycle_id })).rejects.toBeDefined();
  expect((await outcomes.status(fixture.cycle_id)).phase).toBe('complete');
  expect((await weeks.status(fixture.cycle_id)).phase).toBe('published');
});
```

- [ ] **Step 2: Run RED**

```text
pnpm vitest run tests/memory/weekly-research-bridge-service.test.ts tests/memory/weekly-research-bridge-recovery.test.ts tests/security/weekly-research-bridge-security.test.ts tests/integration/weekly-research-bridge.test.ts
```

Expected: FAIL because the Bridge service does not exist.

- [ ] **Step 3: Implement the deterministic service and artifact order**

```ts
export class WeeklyResearchBridgeService {
  constructor(
    private readonly store: WorkspaceStore,
    options: { readonly now?: () => Date } = {}
  ) {}

  async assemble(input: {
    readonly cycle_id: string;
    readonly workspace_identity_digest: `sha256:${string}`;
  }): Promise<WeeklyResearchBridgeStatusV1>;
  async resume(input: { readonly cycle_id: string }): Promise<WeeklyResearchBridgeStatusV1>;
  async status(cycleId: string): Promise<WeeklyResearchBridgeStatusV1>;
}
```

Under `program/weeks/<cycle-id>/research-bridge/bridge.lock`, `assemble`/`resume` process only missing steps in this order:

1. revalidate Outcome, closure, Roadmap, Package, Article Package, Bundle and child evidence;
2. create `claim-projection.json` from Package Claims;
3. capture deterministic initial Evidence from Package (`research_package`), Claim Projection (`claim_map`) and Outcome (`lineage`);
4. call `ResearchIncrementService.assemble` once with revision `1`, the Roadmap `primary_track_id`, candidate Claim refs, Package boundary/open-question/source refs and initial Evidence ref;
5. install `increment-binding.json` after re-reading the created Increment bytes;
6. assemble/persist X Article Expression, then capture its terminal Evidence;
7. assemble/persist X Single Expression, then capture its terminal Evidence; and
8. rebuild `status.json` from installed source artifacts.

Each Evidence id and lifecycle event id is deterministic from Cycle, Increment revision and capture kind. If an artifact already exists, revalidate it and continue; never call a create operation twice merely because a projection file is missing.

- [ ] **Step 4: Assemble exact observed Publication Expressions**

For Article, bind the exact child X Article Plan, canonical `article.md` bytes and child Receipt with `kind: 'x_article'`. For Single, write one deterministic `x-single.txt` from the already materialized child Plan, verify it equals the Plan item text, and bind the exact V2/V2.1 Plan and Receipt kind.

```ts
const expression = await expressions.assemble({
  expression_id: `${binding.increment_id}_${channel.replaceAll('-', '_')}`,
  increment_ref: binding.increment_ref,
  channel,
  language: 'en',
  derivation_type: channel === 'x_article' ? 'original' : 'compression',
  claim_refs: projection.items.map((item) => item.candidate_claim_ref),
  visual_refs: exactVisualRefs,
  evidence_snapshot_refs: [initialEvidenceRef],
  intent: exactIntentBinding,
  receipt: exactReceiptBinding,
  source_claim_statuses: candidateStatuses,
  expression_claim_statuses: candidateStatuses,
  target_privacy_classification: 'public'
});
```

Persist each Expression before passing its path plus the exact child Receipt to `ResearchEvidenceService.capture` with `capture_event: 'publication_receipt_terminal'`. Do not call `ResearchFlywheelService.proposeFromEvidence`; the working Increment and candidate Claims are not Human-accepted.

- [ ] **Step 5: Implement status and recovery without overwrite**

`status` validates every installed digest and derives the highest honest phase. `complete` requires both terminal Evidence refs. One missing Expression leaves `in_progress`; corrupt/stale refs return `blocked` and never recreate a different Increment id. `resume` repairs only projections or missing downstream artifacts.

- [ ] **Step 6: Run GREEN, Memory regressions, and commit Task 5**

```text
pnpm vitest run tests/memory/weekly-research-bridge-service.test.ts tests/memory/weekly-research-bridge-recovery.test.ts tests/security/weekly-research-bridge-security.test.ts tests/integration/weekly-research-bridge.test.ts tests/memory/research-increment-service.test.ts tests/memory/publication-expression-service.test.ts tests/memory/research-evidence-service.test.ts tests/memory/research-flywheel-service.test.ts
pnpm lint
pnpm typecheck
git diff --check
```

Expected: Bridge and existing Memory tests pass; no Delta or Promotion directory is created. Commit:

```text
git commit -m "feat: bridge Weekly Outcomes into research evidence"
```

---

### Task 6: Bounded Synthesis Contracts and Shared Artifact Admission

**Files:**
- Create: `harnesses/research-publishing/core/artifact-admission-policy.ts`
- Modify: `harnesses/research-publishing/core/evidence-object-store.ts`
- Create: `harnesses/research-publishing/core/research-synthesis-types.ts`
- Create: `harnesses/research-publishing/core/research-synthesis-contracts.ts`
- Create: `harnesses/research-publishing/contracts/synthesis-input-snapshot.schema.json`
- Create: `harnesses/research-publishing/contracts/research-synthesis-candidate.schema.json`
- Create: `harnesses/research-publishing/contracts/research-synthesis-attempt.schema.json`
- Create: `harnesses/research-publishing/contracts/research-synthesis-revision.schema.json`
- Create: `harnesses/research-publishing/contracts/research-continuation-proposal.schema.json`
- Create: `harnesses/research-publishing/contracts/research-synthesis-status.schema.json`
- Modify: `harnesses/research-publishing/core/types.ts`
- Create: `tests/memory/research-synthesis-contracts.test.ts`
- Create: `tests/security/synthesis-input-admission.test.ts`
- Modify: `tests/memory/evidence-object-store.test.ts`
- Modify: `tests/contracts/contracts.test.ts`

**Interfaces:**
- Consumes: `ResearchArtifactRefV1`, `PrivacyClassification`, existing Query V2 refs/status/context items, Feedback Snapshot refs and secret/path admission behavior.
- Produces: closed Snapshot/Candidate/Attempt/Revision/Proposal/status contracts, shared `assertArtifactAdmissible`, exact budget constants and constructors consumed by Task 7.

- [ ] **Step 1: Write failing no-novelty, closed-schema, budget and privacy tests**

```ts
it.each(['no_material_change', 'insufficient_evidence'] as const)
('accepts honest %s with zero Insights', (disposition) => {
  expect(createResearchSynthesisRevision({
    ...revisionInput,
    disposition,
    insights: []
  }).insights).toEqual([]);
});

it.each(['material_update', 'conflicting_evidence'] as const)
('requires evidence-backed Insights for %s', (disposition) => {
  expect(() => createResearchSynthesisRevision({
    ...revisionInput,
    disposition,
    insights: []
  })).toThrowError(/Insight/);
});

it('rejects hidden reasoning and unknown candidate fields', () => {
  expect(() => validateContract('research-synthesis-candidate', {
    ...candidate,
    chain_of_thought: 'private reasoning'
  })).toThrowError(/additional properties/);
});

it('rejects restricted, secret-bearing and over-budget context', async () => {
  await expect(planSnapshot(secretInput)).rejects.toMatchObject({ code: 'PRIVACY_GATE_BLOCKED' });
  await expect(planSnapshot(oversizedInput)).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
});
```

- [ ] **Step 2: Run RED**

```text
pnpm vitest run tests/memory/research-synthesis-contracts.test.ts tests/security/synthesis-input-admission.test.ts tests/memory/evidence-object-store.test.ts tests/contracts/contracts.test.ts
```

Expected: FAIL because Synthesis contracts and shared admission policy do not exist.

- [ ] **Step 3: Extract shared path/secret/privacy admission**

Move the existing sensitive-path and secret-pattern rules from `evidence-object-store.ts` into:

```ts
export function assertArtifactAdmissible(input: {
  readonly workspace_relative_path: string;
  readonly media_type: string;
  readonly privacy_classification: PrivacyClassification;
  readonly bytes: Uint8Array;
  readonly allow_restricted: boolean;
}): void;

export function privacyRank(value: PrivacyClassification): number;
```

`EvidenceObjectStore` calls this function with `allow_restricted: true` to preserve existing behavior. Synthesis calls it with `allow_restricted: false`. Existing Evidence tests must remain byte-for-byte compatible.

- [ ] **Step 4: Define bounded Snapshot and synthesis contracts**

Set exact V1 budgets:

```ts
export const SYNTHESIS_BUDGET_V1 = {
  max_items: 24,
  max_total_chars: 64_000,
  max_item_chars: 12_000
} as const;
```

Define the core types:

```ts
export type SynthesisDisposition =
  | 'material_update'
  | 'conflicting_evidence'
  | 'no_material_change'
  | 'insufficient_evidence';

export interface SynthesisContextItemV1 {
  readonly ref: ResearchArtifactRefV1;
  readonly role: 'outcome' | 'package' | 'article' | 'expression' | 'evidence' | 'feedback' | 'prior_synthesis' | 'runtime_context';
  readonly media_type: string;
  readonly privacy_classification: Exclude<PrivacyClassification, 'restricted'>;
  readonly content: string;
  readonly original_chars: number;
  readonly included_chars: number;
  readonly truncated: boolean;
}

export interface SynthesisInputSnapshotV1 {
  readonly schema_version: 'synthesis-input-snapshot/v1';
  readonly snapshot_id: string;
  readonly trigger: { readonly kind: 'important_evidence' | 'article_finalized' | 'weekly_outcome' | 'selected_feedback' | 'human_request'; readonly reason: string };
  readonly source_items: readonly SynthesisContextItemV1[];
  readonly evidence_refs: readonly string[];
  readonly prior_synthesis_ref: ResearchArtifactRefV1 | null;
  readonly runtime_context: {
    readonly status: 'loaded' | 'empty' | 'unavailable';
    readonly query_plan_ref: ResearchArtifactRefV1 | null;
    readonly context_snapshot_ref: ResearchArtifactRefV1 | null;
    readonly review_ref: ResearchArtifactRefV1 | null;
    readonly selected_context_refs: readonly string[];
    readonly limitation: string | null;
  };
  readonly budgets: typeof SYNTHESIS_BUDGET_V1;
  readonly policy_version: 'research-synthesis-input/v1';
  readonly generator_request: { readonly purpose: 'research_synthesis'; readonly output_schema: 'research-synthesis-candidate/v1' };
  readonly created_at: string;
  readonly snapshot_digest: `sha256:${string}`;
}
```

`ResearchSynthesisInsightV1` contains exact `insight_id`, kind, epistemic status, statement, concise rationale, Evidence refs, prior semantic refs, confidence `0..1`, confidence rationale, falsification condition, missing evidence and potential mainline impact.

`ResearchSynthesisRevisionV1` contains revision chain, exact Snapshot ref, disposition, zero-or-more Insights, concise summary, limitations, memory-context status, generator provenance, record time and digest. `ResearchSynthesisAttemptV1` stores candidate digest and accepted/rejected validation result; a rejected attempt stores only digest/error codes, never unvalidated raw content. `ResearchContinuationProposalV1` allows zero-or-more candidates and never contains an accepted/selected flag.

- [ ] **Step 5: Enforce disposition and reference invariants**

Constructors must enforce:

```ts
if (
  ['material_update', 'conflicting_evidence'].includes(input.disposition) &&
  input.insights.length === 0
) {
  throw new HarnessError('CONTRACT_INVALID', 'material or conflicting Synthesis requires an Insight');
}
if (
  ['no_material_change', 'insufficient_evidence'].includes(input.disposition) &&
  input.insights.length !== 0
) {
  throw new HarnessError('CONTRACT_INVALID', 'honest no-change Synthesis must not disguise an Insight');
}
```

Every Insight Evidence ref must exist in the Snapshot `evidence_refs` or exact source-item refs. `material_update` requires at least one source-backed evidence delta, contradiction or new connection encoded in `kind`; rephrasing alone is invalid. Closed schemas reject unknown reasoning fields. Register all six schemas.

- [ ] **Step 6: Run GREEN and commit Task 6**

```text
pnpm vitest run tests/memory/research-synthesis-contracts.test.ts tests/security/synthesis-input-admission.test.ts tests/memory/evidence-object-store.test.ts tests/contracts/contracts.test.ts
pnpm lint
pnpm typecheck
git diff --check
```

Expected: Synthesis and existing Evidence admission tests pass. Commit:

```text
git commit -m "feat: add bounded research synthesis contracts"
```

---

### Task 7: Research Synthesis Service, Immutable Attempts, and Continuation Proposals

**Files:**
- Create: `harnesses/research-publishing/core/research-synthesis-service.ts`
- Create: `tests/memory/research-synthesis-service.test.ts`
- Create: `tests/memory/research-synthesis-recovery.test.ts`
- Create: `tests/security/research-synthesis-security.test.ts`
- Create: `tests/memory/research-continuation-proposal.test.ts`

**Interfaces:**
- Consumes: Task 6 contracts/admission policy, contained local artifacts, existing Query V2 Plan/Snapshot/Review chain, existing Feedback Snapshot and `WorkspaceStore`.
- Produces: `ResearchSynthesisService.plan`, `.record`, `.status`, `.proposeContinuation`; immutable attempts/revisions and non-authoritative proposal artifacts. It performs no model call and no semantic promotion.

- [ ] **Step 1: Write failing Snapshot, Runtime-degradation, attempt and proposal tests**

```ts
it('freezes only selected bounded context and a reviewed Runtime Query chain', async () => {
  const snapshot = await service.plan(planInputWithLoadedQuery);
  expect(snapshot.runtime_context.status).toBe('loaded');
  expect(snapshot.source_items.length).toBeLessThanOrEqual(24);
  expect(snapshot.source_items.reduce((sum, item) => sum + item.included_chars, 0))
    .toBeLessThanOrEqual(64_000);
});

it('continues locally when Runtime context is unavailable and records the limitation', async () => {
  const snapshot = await service.plan(planInputWithoutQuery);
  expect(snapshot.runtime_context).toMatchObject({
    status: 'unavailable',
    limitation: expect.stringMatching(/historical research context was not loaded/i)
  });
  const revision = await service.record({
    synthesis_id: 'synthesis_week_01',
    snapshot_id: snapshot.snapshot_id,
    candidate: noMaterialChangeCandidate,
    recorded_at: now
  });
  expect(revision.disposition).toBe('no_material_change');
});

it('records a rejected attempt digest without persisting hidden reasoning', async () => {
  await expect(service.record({
    ...recordInput,
    candidate: { ...materialCandidate, chain_of_thought: 'do not persist' }
  } as never)).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  const attempt = await readLatestAttempt();
  expect(attempt.status).toBe('rejected');
  expect(JSON.stringify(attempt)).not.toContain('do not persist');
});

it('stores zero continuation candidates without selecting the next Topic', async () => {
  const proposal = await service.proposeContinuation({
    proposal_id: 'continuation_week_01',
    synthesis_ref: exactSynthesisRef,
    candidates: [],
    proposed_at: now
  });
  expect(proposal.candidates).toEqual([]);
  expect(await topicDigest()).toBe(originalTopicDigest);
});
```

- [ ] **Step 2: Run RED**

```text
pnpm vitest run tests/memory/research-synthesis-service.test.ts tests/memory/research-synthesis-recovery.test.ts tests/security/research-synthesis-security.test.ts tests/memory/research-continuation-proposal.test.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement Snapshot planning with exact source allowlist**

Define:

```ts
export interface PlanResearchSynthesisInput {
  readonly snapshot_id: string;
  readonly trigger: SynthesisInputSnapshotV1['trigger'];
  readonly source_refs: ReadonlyArray<{
    readonly ref: ResearchArtifactRefV1;
    readonly role: SynthesisContextItemV1['role'];
    readonly media_type: string;
    readonly privacy_classification: Exclude<PrivacyClassification, 'restricted'>;
  }>;
  readonly evidence_refs: readonly string[];
  readonly prior_synthesis_ref: ResearchArtifactRefV1 | null;
  readonly runtime_query: {
    readonly query_id: string;
    readonly plan_digest: `sha256:${string}`;
    readonly snapshot_digest: `sha256:${string}`;
    readonly review_digest: `sha256:${string}`;
  } | null;
  readonly created_at: string;
}

export interface RecordResearchSynthesisInput {
  readonly synthesis_id: string;
  readonly snapshot_id: string;
  readonly candidate: unknown;
  readonly recorded_at: string;
}

export interface ProposeResearchContinuationInput {
  readonly proposal_id: string;
  readonly synthesis_ref: ResearchArtifactRefV1;
  readonly candidates: readonly ResearchContinuationCandidateV1[];
  readonly proposed_at: string;
}

export class ResearchSynthesisService {
  constructor(private readonly store: WorkspaceStore) {}
  async plan(input: PlanResearchSynthesisInput): Promise<SynthesisInputSnapshotV1>;
  async record(input: RecordResearchSynthesisInput): Promise<ResearchSynthesisRevisionV1>;
  async status(synthesisId: string): Promise<ResearchSynthesisStatusV1>;
  async proposeContinuation(input: ProposeResearchContinuationInput): Promise<ResearchContinuationProposalV1>;
  async continuationStatus(synthesisId: string, proposalId: string): Promise<ResearchContinuationProposalV1>;
}
```

Allowed source roots are exactly `program/weeks/`, `articles/`, `memory/evidence/`, `memory/queries-v2/`, `feedback/` and `research/syntheses/`. Re-read bytes, require exact file digest, run shared admission, decode only UTF-8 text/JSON/YAML/Markdown, preserve source order and apply the fixed item/per-item/total budgets. Truncation is explicit in each item and never changes the source digest.

For `runtime_query !== null`, independently validate local Query Plan/Snapshot/Review file bytes, their semantic digests, exact query identity, selected refs and Runtime version `0.2.0 | null`. Map Query statuses:

```ts
const runtimeContextStatus = {
  loaded: 'loaded',
  empty: 'empty',
  runtime_unavailable: 'unavailable',
  index_unavailable: 'unavailable',
  index_rebuild_required: 'unavailable',
  context_budget_exceeded: 'unavailable',
  failed: 'unavailable'
} as const;
```

With no query, record `unavailable` and the required historical-context limitation. Never call Runtime or read `.llm-wiki` directly.

- [ ] **Step 4: Record immutable validation attempts and revisions**

Under `research/syntheses/<synthesis-id>/record.lock`:

1. read and validate `research/synthesis-inputs/<snapshot-id>.json`;
2. allocate deterministic attempt ordinal from installed attempt directories;
3. calculate the raw Candidate digest before validation;
4. on rejection, store only `ResearchSynthesisAttemptV1` with digest/error codes, then rethrow;
5. on acceptance, validate disposition, refs, privacy and Runtime limitation, store accepted Attempt, then create the next immutable revision; and
6. replace only `status.json` with the latest revision ref.

Paths:

```text
research/synthesis-inputs/<snapshot-id>.json
research/syntheses/<synthesis-id>/attempts/<ordinal>/attempt.json
research/syntheses/<synthesis-id>/revisions/<revision>/revision.json
research/syntheses/<synthesis-id>/status.json
research/syntheses/<synthesis-id>/continuations/<proposal-id>.json
```

The same Snapshot may have multiple attempts. A second accepted rethinking creates a new revision whose `previous_revision_ref` binds the prior bytes; no file is overwritten except status projection.

- [ ] **Step 5: Implement non-authoritative Continuation Proposal validation**

Every proposal re-reads the exact Synthesis revision and validates candidate origin refs against that revision's Snapshot/Insights. Candidate kinds are exactly `deepen_question`, `test_hypothesis`, `address_contradiction`, `revise_thesis`, `continue_topic`, `reframe_topic`, `split_topic`, `merge_topic`, `pause_topic`, `run_experiment`, `inspect_code`, `draft_article_direction`. The schema permits zero candidates and has no accepted/selected/applied field.

`proposeContinuation` writes one create-only proposal and never instantiates Roadmap, Backlog, Weekly Cycle, Delta or Promotion services.

- [ ] **Step 6: Run GREEN and commit Task 7**

```text
pnpm vitest run tests/memory/research-synthesis-service.test.ts tests/memory/research-synthesis-recovery.test.ts tests/security/research-synthesis-security.test.ts tests/memory/research-continuation-proposal.test.ts tests/memory/progressive-research-query-service.test.ts tests/memory/memory-feedback-service.test.ts
pnpm lint
pnpm typecheck
git diff --check
```

Expected: selected tests pass with loaded/empty/unavailable Query contexts and no Runtime write. Commit:

```text
git commit -m "feat: record bounded AI research synthesis"
```

---

### Task 8: Research CLI, `research-synthesis-copilot`, and Package Registration

**Files:**
- Modify: `harnesses/research-publishing/cli/index.ts`
- Modify: `tests/cli/cli.test.ts`
- Create: `skills/research-synthesis-copilot/SKILL.md`
- Create: `skills/research-synthesis-copilot/references/research-synthesis-flow.md`
- Create: `skills/research-synthesis-copilot/scripts/invoke.mjs`
- Create: `skills/research-synthesis-copilot/scp.yml`
- Create: `skills/research-synthesis-copilot/agents/openai.yaml`
- Modify: `tests/skills/skill-boundary.test.ts`
- Modify: `tests/memory/domain-contracts.test.ts`
- Modify: `tests/integration/llm-wiki-runtime.integration.test.ts`
- Modify: `tools/build-manifest.ts`
- Modify: `registry/harnesses.json`
- Modify: `tools/acceptance.ts`

**Interfaces:**
- Consumes: Tasks 5 and 7 services, existing `memory query plan|execute|review|status`, existing Skill invocation/discovery format and SCP v0.1.
- Produces: eight JSON-only `research` operations, three Outcome operations already added in Task 3, one thin first-party Skill and package discovery for all three Skills.

- [ ] **Step 1: Write failing CLI and Skill boundary tests**

Require these operations in CLI discovery:

```ts
const researchOperations = [
  'research bridge assemble',
  'research bridge status',
  'research bridge resume',
  'research synthesis plan',
  'research synthesis record',
  'research synthesis status',
  'research continuation propose',
  'research continuation status'
];
```

Require the Skill to contain:

```ts
expect(content).toContain('meaningful checkpoint');
expect(content).toMatch(/no_material_change.*successful/is);
expect(content).toMatch(/insufficient_evidence.*successful/is);
expect(content).toMatch(/never.*force.*novel/is);
expect(content).toMatch(/Runtime.*unavailable.*limitation/is);
expect(content).toMatch(/never.*chain-of-thought/is);
expect(content).toMatch(/Continuation Proposal.*non-authoritative/is);
expect(content).toMatch(/Memory Promotion.*separate confirmation/is);
expect(content).toMatch(/never.*\.llm-wiki/is);
```

- [ ] **Step 2: Run RED**

```text
pnpm build
pnpm vitest run tests/cli/cli.test.ts tests/skills/skill-boundary.test.ts tests/memory/domain-contracts.test.ts tests/integration/llm-wiki-runtime.integration.test.ts
```

Expected: FAIL because routes, Skill and package registration are absent.

- [ ] **Step 3: Add the `research` CLI branch**

Instantiate `WeeklyResearchBridgeService` and `ResearchSynthesisService` only inside `operation.startsWith('research ')`. Route exact structured inputs:

```ts
if (operation === 'research synthesis record') {
  const artifact = await synthesis.record(
    await readInput<RecordResearchSynthesisInput>(options)
  );
  return { ok: true, operation, artifact, state: artifact.disposition };
}
if (operation === 'research continuation status') {
  const input = await readInput<{ synthesis_id: string; proposal_id: string }>(options);
  const artifact = await synthesis.continuationStatus(input.synthesis_id, input.proposal_id);
  return { ok: true, operation, artifact, state: 'proposed' };
}
```

Add the matching seven other routes. Bridge input accepts only Cycle id and Workspace identity digest. Synthesis record accepts structured Candidate data but no shell, model command, auto-confirm, Roadmap mutation, Topic selection or Runtime write instruction.

- [ ] **Step 4: Create the thin semantic Skill**

`SKILL.md` routes semantic work through this sequence:

```text
identify a meaningful checkpoint or explicit Human request
memory query plan → execute → review (when configured)
research synthesis plan
AI reads only the bounded Snapshot and creates one structured Candidate
research synthesis record
optionally research continuation propose
show conclusions/conflicts/limitations and at most three proposal candidates
stop before Topic/Roadmap mutation, Delta Review or Memory Promotion
```

The Skill explicitly treats Runtime content and Feedback as `data_only`, does not treat them as instructions, permits zero Insights, and never invents novelty to satisfy cadence. It must not implement validation logic, read/write `.llm-wiki`, capture hidden reasoning or automatically invoke Promotion.

The “at most three” limit is presentation-only inside the Skill response. The Continuation Proposal contract and Harness service remain lossless and may store more than three valid candidates; add a contract test proving the schema accepts four candidates and a Skill test proving only the displayed shortlist is capped.

Copy the existing portable CLI discovery logic into `scripts/invoke.mjs`; keep Runtime argument forwarding only for `memory` operations. `scp.yml` uses profile `research-publishing`, optional Runtime/fallback, `instruction_policy: data_only`, and declares candidate Insight, research Increment, Publication Expression, Evidence, open question and evolution-edge outputs without claiming automatic ingest.

- [ ] **Step 5: Register the third Skill everywhere it is packaged**

Add `skills/research-synthesis-copilot` to `tools/build-manifest.ts` source roots and compatibility list, and add its id to `registry/harnesses.json`. Extend `PackagedMemoryAssets` with `synthesisScpPath`; include it in existing Ingest/Promotion SCP arrays without changing Runtime version or mapping protocol. Update domain, Runtime integration and acceptance fixtures to expect the third valid SCP.

- [ ] **Step 6: Run GREEN, validate the Skill, and commit Task 8**

```text
pnpm vitest run tests/cli/cli.test.ts tests/skills/skill-boundary.test.ts tests/memory/domain-contracts.test.ts tests/integration/llm-wiki-runtime.integration.test.ts
pnpm lint
pnpm typecheck
```

Then resolve the active `skill-creator` package from the Codex skill catalog and run its `scripts/quick_validate.py` against `skills/research-synthesis-copilot` with UTF-8 enabled. The durable command label is:

```text
skill-creator quick_validate skills/research-synthesis-copilot
```

Expected: selected tests pass and the validator prints `Skill is valid!`. Commit exact Task 8 paths:

```text
git commit -m "feat: add research synthesis copilot"
```

---

### Task 9: Fake-AI Full Loop, Security Gate, Full Verification, and Handoff

**Files:**
- Create: `tests/integration/phase-4-research-loop.test.ts`
- Create: `tests/security/phase-4-research-loop-security.test.ts`
- Modify: `tests/tools/manifest-content.test.ts`
- Modify: `registry/manifests/research-publishing.json`
- Modify: `.llm-wiki/requirements/research-program-orchestration-v2-4-phase-4.md`
- Modify: `.llm-wiki/requirements/research-program-orchestration-v2-4.md`
- Modify: `.llm-wiki/working-context/research-program-orchestration-v2-4.md`
- Modify: `.llm-wiki/log.md`
- Create: `.llm-wiki/handoff/research-program-orchestration-v2-4-phase-4.md`

**Interfaces:**
- Consumes: all Gate A/B services and CLI routes, real local Query artifacts, Fake AI Candidate JSON and existing Delta/Review/Promotion directories as negative boundaries.
- Produces: end-to-end local evidence, security/backward-compatibility evidence, regenerated package manifest and Phase 4 lifecycle handoff.

- [ ] **Step 1: Write the failing full-loop and boundary acceptance tests**

The full loop must use the real Phase 4 fixture and services:

```ts
it('closes publication and records an honest Fake-AI research checkpoint', async () => {
  const outcome = await outcomes.assemble({ cycle_id: fixture.cycle_id });
  const bridgeStatus = await bridge.assemble({
    cycle_id: fixture.cycle_id,
    workspace_identity_digest: fixture.workspace_identity_digest
  });
  const snapshot = await synthesis.plan(fakeLoadedQueryInput(outcome, bridgeStatus));
  const revision = await synthesis.record({
    synthesis_id: 'synthesis_week_01',
    snapshot_id: snapshot.snapshot_id,
    candidate: fakeMaterialUpdateCandidate(snapshot),
    recorded_at: now
  });
  const continuation = await synthesis.proposeContinuation(
    fakeContinuationInput(revision)
  );

  expect((await weeks.status(fixture.cycle_id)).phase).toBe('published');
  expect((await outcomes.status(fixture.cycle_id)).phase).toBe('complete');
  expect(bridgeStatus.phase).toBe('complete');
  expect(revision.disposition).toBe('material_update');
  expect(continuation.candidates.length).toBeLessThanOrEqual(3);
  expect(await workspaceFiles('memory/promotions')).toEqual([]);
  expect(await workspaceFiles('program/roadmaps')).toEqual(originalRoadmapFiles);
  expect(network).toBe('unused');
});
```

Add a second flow for `no_material_change` with zero Insights and Runtime unavailable. Security cases cover stale digests, absolute/traversal paths, caller URL/status/Track injection, privacy downgrade, secret-bearing source, unknown Candidate fields, unresolved Evidence refs, fake material update with no delta, proposal-driven Topic mutation, duplicate revision, and uncertain Promotion replay. Every case must prove no real external side effect.

- [ ] **Step 2: Run RED**

```text
pnpm vitest run tests/integration/phase-4-research-loop.test.ts tests/security/phase-4-research-loop-security.test.ts tests/tools/manifest-content.test.ts
```

Expected: FAIL until the complete loop and generated manifest are wired.

- [ ] **Step 3: Run the focused Phase 4 acceptance gate**

```text
pnpm vitest run tests/program/weekly-outcome-contracts.test.ts tests/program/weekly-outcome-service.test.ts tests/program/weekly-outcome-recovery.test.ts tests/memory/research-bridge-contracts.test.ts tests/memory/claim-projection.test.ts tests/memory/weekly-research-bridge-service.test.ts tests/memory/weekly-research-bridge-recovery.test.ts tests/memory/research-synthesis-contracts.test.ts tests/memory/research-synthesis-service.test.ts tests/memory/research-synthesis-recovery.test.ts tests/memory/research-continuation-proposal.test.ts tests/security/weekly-outcome-security.test.ts tests/security/weekly-outcome-path-boundary.test.ts tests/security/weekly-research-bridge-security.test.ts tests/security/synthesis-input-admission.test.ts tests/security/research-synthesis-security.test.ts tests/security/phase-4-research-loop-security.test.ts tests/integration/weekly-outcome-closure.test.ts tests/integration/weekly-research-bridge.test.ts tests/integration/phase-4-research-loop.test.ts tests/skills/skill-boundary.test.ts tests/cli/cli.test.ts
```

Expected: all focused Phase 4 tests pass with Fake AI/local artifacts only. Record exact file/test/skip counts.

- [ ] **Step 4: Regenerate package manifest and run complete verification**

```text
pnpm manifest
pnpm lint
pnpm typecheck
pnpm test
pnpm acceptance
git diff --check
```

Expected: all commands exit 0 except already documented opt-in skips. Confirm the regenerated manifest contains Harness contracts plus all three Skills and still declares `llm_wiki_runtime: '0.2.0'`. Record exact counts; do not describe agent-local checks as CI or independent review.

- [ ] **Step 5: Commit implementation/acceptance paths**

Stage only Task 9 production-test/manifest paths, excluding `.llm-wiki`, run `git diff --cached --check`, and commit:

```text
git commit -m "feat: complete the Phase 4 research partner loop"
```

- [ ] **Step 6: Sync lifecycle truth and write the handoff**

Update the confirmed child and parent Change Briefs, working context and log with actual commit ids and fresh verification counts. The handoff records:

- Outcome/closure paths and Topic-release proof;
- default Outcome-to-Increment identity and Track derivation;
- exact Claim Projection mapping and candidate-only boundary;
- Article/Single Expression and terminal Evidence refs;
- Snapshot budgets, Runtime degradation and no-chain-of-thought boundary;
- all four dispositions, zero-Insight success and attempt recovery;
- Continuation Proposal non-authority;
- unchanged Human Delta/Review/Promotion gates;
- no real Browser/X/GitHub/Runtime/Wiki action; and
- residual agent-local and real-model-quality risks.

Stage only the five lifecycle files, run `git diff --cached --check`, and commit:

```text
git commit -m "docs: hand off V2.4 adaptive research closure"
```

## Acceptance Traceability

| Confirmed specification criteria | Primary task |
|---|---|
| AC 1–3: completed Bundle only, exact child facts, create-only Outcome | Tasks 1–2 |
| AC 4–7: Cycle `published`, Topic release/no completion, no semantic mutation, cadence | Tasks 2–3 |
| AC 8–10: one Outcome/Increment, Roadmap-derived Track, conservative Claim Projection | Tasks 4–5 |
| AC 11–13: two exact Expressions, Outcome independence, terminal Evidence | Task 5 |
| AC 14–16: bounded Snapshot, four dispositions, resolvable/uncertain/falsifiable Insights | Tasks 6–7 |
| AC 17–21: no direct semantic mutation, optional proposals, Runtime limitation, feedback boundary, Human gates | Tasks 6–9 |
| AC 22–24: recovery, backward compatibility and no external effects | Tasks 2, 5, 7 and 9 |
| AC 25–27: no novelty KPI, valid zero Insights, no relabeled paraphrase | Tasks 6–9 |

## Plan Self-Review Checklist

- Every one of the 27 confirmed acceptance criteria maps to at least one RED/GREEN task above.
- Gate A and Gate B have independent fixtures, status projections, recovery tests and commits.
- Every new contract name has a JSON Schema, TypeScript type/constructor, contract-registration change and contract test.
- Later-task signatures use the exact types produced by earlier tasks.
- No task creates accepted Claim/Decision/Edge records, selects a Topic, revises Roadmap truth or invokes Memory Promotion automatically.
- Runtime access remains through existing Query V2 commands/adapters; no `.llm-wiki` direct access or Runtime protocol change is planned.
- All production code steps name exact files, public methods, artifact paths, test commands, expected failures/passes and commit boundaries.

## Execution Gate

This plan is proposed for Human review. Implementation must not begin until the user explicitly confirms this exact plan and then authorizes inline execution. Plan confirmation does not authorize real Browser/X/GitHub/Runtime/Wiki actions; those remain outside Phase 4 local acceptance.
