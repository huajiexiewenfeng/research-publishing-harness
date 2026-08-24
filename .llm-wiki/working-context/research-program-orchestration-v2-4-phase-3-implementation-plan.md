# Research Program Orchestration V2.4 Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement one exact Human-confirmed Publication Bundle that publishes an X Article first, materializes its verified canonical URL into one English X Single, binds both Browser executions, and produces one auditable joint Receipt without replaying Submit.

**Architecture:** `PublicationBundleService` is a deterministic control plane above the existing X Article Browser V3 and X Browser V2/V2.1 adapters. It freezes a complete Bundle Plan and TTL, derives both child approvals from one Bundle Approval, binds each child execution before any Host command, reads child status through narrow read-only inspectors, and only materializes the Single after verified Article evidence. Existing Browser Adapters remain the sole owners of page commands, Submit barriers, public verification and child Receipts.

**Tech Stack:** TypeScript 6, Node.js 20.19+, AJV 2020-12, Vitest 4, existing `WorkspaceStore`, existing X Article Browser V3, existing X Browser V2/V2.1, `twitter-text` through `validatePostText`.

## Global Constraints

- Approved specification: `.llm-wiki/requirements/research-program-orchestration-v2-4-phase-3.md`.
- Implementation baseline is current `main`; record the actual HEAD and clean/dirty status before Task 1. The design baseline is `f44c672` plus the child Plan/Receipt traceability clarification committed with this plan.
- Execute inline on the current branch. Do not create a branch or dispatch subagents unless the user explicitly changes that decision.
- Every task follows RED → GREEN → REFACTOR and ends with an exact-path commit.
- One Weekly Cycle binds one immutable Bundle. One Bundle contains one X Article Plan and one English X Single template.
- The template contains exactly one `{{X_ARTICLE_URL}}`; the only substitution rule is `verified-x-article-canonical-url/v1`.
- Default `authorization_ttl_ms` is `7_200_000`; schema range is `600_000..86_400_000`. Approval accepts no TTL input and never extends an installed Approval.
- Browser `start` is a local setup operation. Bind its execution immediately; do not call `next`, `claim` or `report` before the binding exists.
- `outcome_unknown` permits only the existing child `resume-verification` path. Never create or replay a second Submit.
- `verification_conflict`, `partial`, `failed_after_submit`, Article terminal failure and approval expiry cannot produce a completed Bundle Receipt.
- Existing Browser page contracts, command brokers, Submit barriers, child approval verification and public verifiers are read-only behavior in this phase.
- Phase 3 may project Weekly Cycle `publication_planned`; it must not create Weekly Outcome, mark Topic complete, mark Cycle `published`, create Publication Expression or approve Memory Promotion.
- CI and acceptance use temporary Workspaces and Fake Browser Hosts only. Never access real Chrome, X, GitHub, Runtime or a user Wiki.
- Preserve direct legacy X Article and X Single/Thread/Reply behavior.
- Program refs bind their declared semantic digests. Child publication Plan/Receipt refs passed to `VersionedPublicationEvidenceReader` bind contained file-byte digests; keep child `plan_digest`/`receipt_digest` as separate semantic fields.

## File Structure Map

| File | Responsibility |
|---|---|
| `harnesses/research-publishing/core/publication-bundle-types.ts` | Closed public Bundle, binding, status, authorization and Receipt types |
| `harnesses/research-publishing/core/publication-bundle-contracts.ts` | Constructors, digest verification, token/TTL/ref invariants |
| `harnesses/research-publishing/core/publication-bundle-state.ts` | Explicit Bundle transition table and terminal-state predicates |
| `harnesses/research-publishing/core/publication-bundle-publish-gate.ts` | Bundle-specific fifth Publish Gate |
| `harnesses/research-publishing/core/publication-bundle-audit.ts` | Honest pre-confirmation Audit rendering |
| `harnesses/research-publishing/core/publication-child-execution-inspector.ts` | Narrow read-only child execution identity/status adapter |
| `harnesses/research-publishing/core/x-article-url-materializer.ts` | Strict verified Article URL validation and one-token replacement |
| `harnesses/research-publishing/core/publication-bundle-service.ts` | Plan, approval, binding, recovery projection, materialization and joint Receipt orchestration |
| `harnesses/research-publishing/branches/article-harness/article-package-verifier.ts` | Shared read-only finalized Article Package verifier |
| `harnesses/research-publishing/core/research-program-types.ts` | `WeeklyPublicationBundleBindingV1` and related input type |
| `harnesses/research-publishing/core/research-program-contracts.ts` | Week-to-Bundle binding constructor/verification |
| `harnesses/research-publishing/core/weekly-research-cycle-service.ts` | Rebuild `publication_planned` from create-only week binding |
| `harnesses/research-publishing/core/types.ts` | Contract registry and `PublicationBundlePort` export |
| `harnesses/research-publishing/cli/index.ts` | Eleven JSON-only `publication bundle` operations |
| `skills/x-publishing-copilot/references/publication-bundle-flow.md` | One-confirmation Skill sequence and stop/recovery rules |

---

### Task 1: Bundle Contracts, Locked TTL, Week Binding, and State Machine

**Files:**
- Create: `harnesses/research-publishing/core/publication-bundle-types.ts`
- Create: `harnesses/research-publishing/core/publication-bundle-contracts.ts`
- Create: `harnesses/research-publishing/core/publication-bundle-state.ts`
- Modify: `harnesses/research-publishing/core/research-program-types.ts`
- Modify: `harnesses/research-publishing/core/research-program-contracts.ts`
- Modify: `harnesses/research-publishing/core/types.ts`
- Create: `harnesses/research-publishing/contracts/publication-bundle-plan.schema.json`
- Create: `harnesses/research-publishing/contracts/publication-bundle-approval.schema.json`
- Create: `harnesses/research-publishing/contracts/publication-bundle-status.schema.json`
- Create: `harnesses/research-publishing/contracts/publication-bundle-execution-binding.schema.json`
- Create: `harnesses/research-publishing/contracts/publication-bundle-receipt-binding.schema.json`
- Create: `harnesses/research-publishing/contracts/weekly-publication-bundle-binding.schema.json`
- Create: `harnesses/research-publishing/contracts/materialized-single-publication.schema.json`
- Create: `harnesses/research-publishing/contracts/derived-article-authorization.schema.json`
- Create: `harnesses/research-publishing/contracts/derived-single-authorization.schema.json`
- Create: `harnesses/research-publishing/contracts/publication-bundle-receipt.schema.json`
- Create: `tests/publication-bundle/publication-bundle-contracts.test.ts`
- Create: `tests/publication-bundle/publication-bundle-state.test.ts`
- Modify: `tests/contracts/contracts.test.ts`

**Interfaces:**
- Consumes: `ResearchArtifactRefV1`, `VisualAssetRef`, `XArticlePublicationPlanV1`, `XArticleApprovalV1`, `PublicationPlanV2`, `PublicationPlanV2_1`, `ApprovalV2`, `ApprovalV2_1`.
- Produces: all Bundle V1 contracts, `createPublicationBundlePlan`, `createPublicationBundleApproval`, `createWeeklyPublicationBundleBinding`, `transitionPublicationBundle`, and `PublicationBundlePort` signatures consumed by Tasks 2–5.

- [ ] **Step 1: Write the failing contract and transition tests**

Add tests that assert the exact token, TTL, self-digest and state boundaries:

```ts
it.each([
  'Read the article',
  'Read {{X_ARTICLE_URL}} and mirror {{X_ARTICLE_URL}}',
  'Read {{UNKNOWN_URL}}'
])('rejects invalid Single template %s', (text_template) => {
  expect(() => createPublicationBundlePlan({
    ...planInput,
    single_intent: { ...planInput.single_intent, text_template }
  })).toThrowError(/X_ARTICLE_URL/);
});

it.each([599_999, 86_400_001])('rejects authorization TTL %d', (authorization_ttl_ms) => {
  expect(() => createPublicationBundlePlan({ ...planInput, authorization_ttl_ms }))
    .toThrowError(/authorization TTL/);
});

it('binds Article, Single intent, account, visual, policy, order and TTL', () => {
  const plan = createPublicationBundlePlan(planInput);
  expect(plan.bundle_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(() => assertPublicationBundlePlan({
    ...plan,
    authorization_ttl_ms: plan.authorization_ttl_ms + 1
  })).toThrowError(/stale/);
});

it('does not advance an unknown Article outcome to Single materialization', () => {
  expect(() => transitionPublicationBundle('article_outcome_unknown', 'single_materialized'))
    .toThrowError(/invalid Publication Bundle transition/);
});

it('declares completed Receipt status and both child Plan and Receipt refs', () => {
  const receipt = createPublicationBundleReceipt(receiptInput);
  expect(receipt).toMatchObject({
    status: 'completed',
    article: { plan_ref: expect.any(Object), receipt_ref: expect.any(Object) },
    single: { plan_ref: expect.any(Object), receipt_ref: expect.any(Object) }
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```text
pnpm vitest run tests/publication-bundle/publication-bundle-contracts.test.ts tests/publication-bundle/publication-bundle-state.test.ts tests/contracts/contracts.test.ts
```

Expected: FAIL because Bundle contracts, schemas and state machine do not exist.

- [ ] **Step 3: Implement exact public types and ports**

Define these discriminated contracts in `publication-bundle-types.ts`:

```ts
export type BundleDigest = `sha256:${string}`;

export interface PublicationBundleSingleIntentV1 {
  readonly run_id: string;
  readonly target_account: string;
  readonly language: 'en';
  readonly content_type: 'anchor';
  readonly text_template: string;
  readonly claim_refs: readonly string[];
  readonly visual_asset: VisualAssetRef | null;
  readonly article_package: { readonly root: string; readonly digest: BundleDigest };
}

export interface PublicationBundlePlanV1 {
  readonly schema_version: 'publication-bundle-plan/v1';
  readonly bundle_id: string;
  readonly cycle_id: string;
  readonly cycle_ref: ResearchArtifactRefV1;
  readonly selection_ref: ResearchArtifactRefV1;
  readonly research_content_package_ref: ResearchArtifactRefV1;
  readonly canonical_article_package: {
    readonly root: string;
    readonly package_digest: BundleDigest;
    readonly package_ref: ResearchArtifactRefV1;
  };
  readonly article_plan: XArticlePublicationPlanV1;
  readonly single_intent: PublicationBundleSingleIntentV1;
  readonly substitution: {
    readonly token: '{{X_ARTICLE_URL}}';
    readonly rule: 'verified-x-article-canonical-url/v1';
  };
  readonly execution_order: readonly ['x_article', 'x_single'];
  readonly authorization_ttl_ms: number;
  readonly action: 'publish_bundle_once';
  readonly policy_version: 'research-program-policy/v1';
  readonly planned_at: string;
  readonly bundle_digest: BundleDigest;
}

export interface PublicationBundleApprovalV1 {
  readonly schema_version: 'publication-bundle-approval/v1';
  readonly approval_id: string;
  readonly bundle_id: string;
  readonly bundle_digest: BundleDigest;
  readonly target_account: string;
  readonly scope: 'publish_bundle_once';
  readonly approved_by: string;
  readonly approved_at: string;
  readonly expires_at: string;
  readonly approval_digest: BundleDigest;
}

export type PublicationBundlePhase =
  | 'planned' | 'approved' | 'article_authorized' | 'article_in_progress'
  | 'article_outcome_unknown' | 'article_verification_conflict' | 'article_terminal_failure'
  | 'article_verified' | 'single_materialized' | 'single_authorized' | 'single_in_progress'
  | 'single_outcome_unknown' | 'single_verification_conflict' | 'single_terminal_failure'
  | 'approval_expired' | 'completed';
```

Define one closed execution-binding schema with `child_kind: 'x_article' | 'x_single'`, and TypeScript aliases `ArticleExecutionBindingV1` and `SingleExecutionBindingV1`. Include the Bundle Plan/Approval refs, child Authorization ref, execution/run/plan ids, plan digest, installed Plan/Approval refs, `bound_at`, and `binding_digest`.

Define one closed receipt-binding schema with child kind, Execution Binding ref, child Plan ref, child Receipt ref, parsed child status, canonical public URL when known, `bound_at`, and `binding_digest`.

Define `PublicationBundleReceiptV1` with `status: 'completed'`, exact Cycle/Bundle Plan/Approval refs, exact Article Plan/Receipt file refs, exact Single Plan/Receipt file refs, ordered `[articleUrl, singleUrl]`, honest child statuses, issue time, and `receipt_digest`. Child file refs use `readContainedArtifact().digest`; the parsed child semantic digests remain separate fields.

Define `PublicationBundleAuditV1` in this file so `PublicationBundlePort` typechecks before Task 2. It contains the exact fields shown in Task 2 Step 4 and fixes `final_single_bytes_known: false`.

Add this port to `core/types.ts` using type-only imports from `publication-bundle-types.ts`:

```ts
export interface PublicationBundlePort {
  plan(input: PlanPublicationBundleInput): Promise<PublicationBundlePlanV1>;
  audit(bundleId: string): Promise<PublicationBundleAuditV1>;
  approve(input: ApprovePublicationBundleInput): Promise<PublicationBundleApprovalV1>;
  articleAuthorization(bundleId: string): Promise<DerivedArticleAuthorizationV1>;
  bindArticleExecution(input: BindArticleExecutionInput): Promise<ArticleExecutionBindingV1>;
  attachArticleReceipt(input: AttachArticleReceiptInput): Promise<PublicationBundleStatusV1>;
  materializeSingle(bundleId: string): Promise<MaterializedSinglePublicationV1>;
  singleAuthorization(bundleId: string): Promise<DerivedSingleAuthorizationV1>;
  bindSingleExecution(input: BindSingleExecutionInput): Promise<SingleExecutionBindingV1>;
  attachSingleReceipt(input: AttachSingleReceiptInput): Promise<PublicationBundleReceiptV1 | PublicationBundleStatusV1>;
  status(bundleId: string): Promise<PublicationBundleStatusV1>;
}
```

- [ ] **Step 4: Implement constructors, exact digest rules and state table**

Use self-excluding digest bodies and fixed TTL constants:

```ts
export const PUBLICATION_BUNDLE_TTL = {
  default_ms: 7_200_000,
  minimum_ms: 600_000,
  maximum_ms: 86_400_000
} as const;

export function createPublicationBundleApproval(
  plan: PublicationBundlePlanV1,
  input: ApprovePublicationBundleInput,
  now: Date,
  approvalId: string
): PublicationBundleApprovalV1 {
  if (input.confirmed_bundle_digest !== plan.bundle_digest || input.approved_by.trim() === '') {
    throw new HarnessError('APPROVAL_STALE', 'Bundle confirmation does not match the installed Plan');
  }
  const approved_at = now.toISOString();
  const base = {
    schema_version: 'publication-bundle-approval/v1' as const,
    approval_id: approvalId,
    bundle_id: plan.bundle_id,
    bundle_digest: plan.bundle_digest,
    target_account: plan.article_plan.intent.target_account,
    scope: 'publish_bundle_once' as const,
    approved_by: input.approved_by,
    approved_at,
    expires_at: new Date(now.getTime() + plan.authorization_ttl_ms).toISOString()
  };
  return validateContract('publication-bundle-approval', {
    ...base,
    approval_digest: sha256(base)
  });
}
```

Enumerate every allowed edge in `publication-bundle-state.ts`. `article_outcome_unknown` may return only to `article_in_progress`; `single_outcome_unknown` may return only to `single_in_progress`; all conflict/failure/expired/completed phases are terminal. Do not export a generic state setter.

Register all ten new schema names in `CONTRACT_NAMES`. Every JSON Schema uses draft 2020-12, `additionalProperties: false`, exact `const` schema versions, safe-id patterns, canonical digest patterns, ISO date-time formats, tuple lengths and the numeric TTL range.

- [ ] **Step 5: Run GREEN and typecheck**

Run:

```text
pnpm vitest run tests/publication-bundle/publication-bundle-contracts.test.ts tests/publication-bundle/publication-bundle-state.test.ts tests/contracts/contracts.test.ts
pnpm typecheck
```

Expected: all selected tests pass and typecheck exits 0.

- [ ] **Step 6: Commit Task 1**

Stage only the Task 1 paths, run `git diff --cached --check`, and commit:

```text
git commit -m "feat: add publication bundle contracts"
```

---

### Task 2: Bundle Plan, Week Binding, Audit, Publish Gate, and Article Authorization

**Files:**
- Create: `harnesses/research-publishing/core/publication-bundle-publish-gate.ts`
- Create: `harnesses/research-publishing/core/publication-bundle-audit.ts`
- Create: `harnesses/research-publishing/core/publication-bundle-service.ts`
- Create: `harnesses/research-publishing/branches/article-harness/article-package-verifier.ts`
- Modify: `harnesses/research-publishing/branches/x-article-harness/x-article-service.ts`
- Modify: `harnesses/research-publishing/core/weekly-research-cycle-service.ts`
- Create: `tests/publication-bundle/publication-bundle-service.test.ts`
- Create: `tests/publication-bundle/publication-bundle-audit.test.ts`
- Create: `tests/publication-bundle/publication-bundle-publish-gate.test.ts`
- Create: `tests/program/weekly-publication-bundle-binding.test.ts`
- Create: `tests/security/publication-bundle-approval.test.ts`

**Interfaces:**
- Consumes: Task 1 contracts, stored Phase 2 Cycle/Selection/Package V1.2, finalized Article `package-ref.json`, stored X Article Plan, existing four content Gates and existing `approveXArticlePublication`.
- Produces: `PublicationBundleService.plan`, `.audit`, `.approve`, `.articleAuthorization`, the create-only week binding and `publication_planned` projection.

- [ ] **Step 1: Write failing lineage, Audit, TTL, Gate and stale-approval tests**

```ts
it('plans one exact Article plus one tokenized Single and installs the week binding', async () => {
  const plan = await service.plan(planInput);
  expect(plan.execution_order).toEqual(['x_article', 'x_single']);
  expect(plan.authorization_ttl_ms).toBe(7_200_000);
  await expect(store.readJson(`program/weeks/${plan.cycle_id}/publication-bundle-binding.json`))
    .resolves.toMatchObject({ bundle_plan_ref: { digest: plan.bundle_digest } });
  expect((await weeks.status(plan.cycle_id)).phase).toBe('publication_planned');
});

it('renders unknown final URL honestly before confirmation', async () => {
  const audit = await service.audit(bundleId);
  expect(audit.single_template).toContain('{{X_ARTICLE_URL}}');
  expect(audit.final_single_bytes_known).toBe(false);
  expect(audit.authorization_ttl_ms).toBe(7_200_000);
});

it('takes no TTL at approval and derives the locked expiry', async () => {
  const approval = await service.approve({
    bundle_id: bundleId,
    confirmed_bundle_digest: plan.bundle_digest,
    approved_by: 'human'
  });
  expect(Date.parse(approval.expires_at) - Date.parse(approval.approved_at)).toBe(7_200_000);
});

it('fails the fifth Gate before exact Bundle approval', async () => {
  await expect(service.articleAuthorization(bundleId))
    .rejects.toMatchObject({ code: 'PUBLISH_GATE_BLOCKED' });
});

it('rejects a second Bundle for the same Weekly Cycle', async () => {
  await service.plan(planInput);
  await expect(service.plan({ ...planInput, bundle_id: 'bundle_second' }))
    .rejects.toMatchObject({ code: 'STATE_TRANSITION_INVALID' });
});
```

- [ ] **Step 2: Run RED**

Run:

```text
pnpm vitest run tests/publication-bundle/publication-bundle-service.test.ts tests/publication-bundle/publication-bundle-audit.test.ts tests/publication-bundle/publication-bundle-publish-gate.test.ts tests/program/weekly-publication-bundle-binding.test.ts tests/security/publication-bundle-approval.test.ts
```

Expected: FAIL because Bundle planning, week binding, Audit, Gate and service do not exist.

- [ ] **Step 3: Implement exact source revalidation and atomic planning**

`PublicationBundleService.plan` must:

1. Validate the requested closed Plan input.
2. Read `program/weeks/<cycle>/cycle.json`, `selection.json`, `package.json` and current `status.json` through contained artifact reads.
3. Validate Package V1.2 and exact `research_program_binding` refs.
4. Read finalized Article `package-ref.json` and verify its package digest/artifact list with a new shared `verifyFinalizedArticlePackage(store, packageRef)` helper extracted from the current private `XArticleService.verifyPackageDigest` logic. Refactor `XArticleService` to call the helper without changing its public behavior.
5. Read `runs/<article-run-id>/x-article/publication-plan-v1.json`, call `assertXArticlePublicationPlan`, and require its Article Package root/digest and account to match the Bundle.
6. Verify Single Claim refs are non-empty, unique and present in Package V1.2; verify optional Visual is the exact Package-relative manifest asset and current bytes match its digest.
7. Run Lineage, Evidence, Claim Boundary and Privacy Gates again.
8. Write `runs/<bundle>/publication-bundle/plan.json`, read it back, then write `program/weeks/<cycle>/publication-bundle-binding.json` under a cycle lock.
9. If either create-only write already exists, accept only byte-identical retry; reject any conflicting retry.
10. Rebuild Weekly status to `publication_planned` with exact Package, Article and Bundle refs.

Use one focused service with private readers; do not copy Browser Adapter command logic into it.

- [ ] **Step 4: Implement Audit and fifth Publish Gate**

Render the Task 1 `PublicationBundleAuditV1` exactly:

```ts
export function renderPublicationBundleAudit(
  plan: PublicationBundlePlanV1
): PublicationBundleAuditV1 {
  const visual = plan.single_intent.visual_asset;
  return {
    target_account: plan.article_plan.intent.target_account,
    article_title: plan.article_plan.intent.document.title,
    article_plan_digest: plan.article_plan.plan_digest,
    article_package_digest: plan.canonical_article_package.package_digest,
    single_template: plan.single_intent.text_template,
    final_single_bytes_known: false,
    substitution_rule: 'verified-x-article-canonical-url/v1',
    visual: visual === null ? null : {
      asset_id: visual.asset_id,
      digest: visual.digest,
      alt_text: visual.alt_text
    },
    claim_refs: plan.single_intent.claim_refs,
    execution_order: ['x_article', 'x_single'],
    authorization_ttl_ms: plan.authorization_ttl_ms,
    bundle_digest: plan.bundle_digest
  };
}
```

The Bundle Publish Gate returns `GateResult` named `publish`. It requires the installed Plan and exact unexpired Bundle Approval, recomputes both self-digests, verifies the target account and all frozen refs, and rechecks optional Visual bytes. Convert any Gate failure to `PUBLISH_GATE_BLOCKED`; preserve `APPROVAL_STALE` for changed installed artifacts.

- [ ] **Step 5: Implement create-only Approval and derived Article authorization**

`approve` reads the installed Plan, derives expiry only from its locked TTL, writes `approval.json`, and returns an existing byte-identical Approval for an exact retry. It never accepts `ttl_ms`.

`articleAuthorization` runs the Publish Gate, then derives the child Approval with the remaining Bundle lifetime and a deterministic id:

```ts
const remainingTtl = Date.parse(bundleApproval.expires_at) - now.getTime();
if (remainingTtl <= 0) throw new HarnessError('PUBLISH_GATE_BLOCKED', 'Bundle Approval expired');
const approval = approveXArticlePublication(
  plan.article_plan,
  bundleApproval.approved_by,
  remainingTtl,
  now,
  () => `x_article_approval_${plan.bundle_id}`
);
```

Persist `article-authorization.json` with exact Bundle Plan/Approval refs and its own digest. An installed Authorization must be byte-identical on retry.

- [ ] **Step 6: Run GREEN and Phase 2 regressions**

Run:

```text
pnpm vitest run tests/publication-bundle/publication-bundle-service.test.ts tests/publication-bundle/publication-bundle-audit.test.ts tests/publication-bundle/publication-bundle-publish-gate.test.ts tests/program/weekly-publication-bundle-binding.test.ts tests/security/publication-bundle-approval.test.ts tests/integration/weekly-article-cycle.test.ts tests/x-article/x-article-service.test.ts tests/x-article/publication-plan.test.ts
```

Expected: all selected tests pass; direct X Article planning remains unchanged.

- [ ] **Step 7: Commit Task 2**

Stage only Task 2 files plus required Task 1 type imports, run `git diff --cached --check`, and commit:

```text
git commit -m "feat: plan and approve publication bundles"
```

---

### Task 3: Article Execution Binding, Receipt Verification, URL Materialization, and Single Authorization

**Files:**
- Create: `harnesses/research-publishing/core/publication-child-execution-inspector.ts`
- Create: `harnesses/research-publishing/core/x-article-url-materializer.ts`
- Modify: `harnesses/research-publishing/core/publication-bundle-service.ts`
- Create: `tests/publication-bundle/publication-child-execution-inspector.test.ts`
- Create: `tests/publication-bundle/publication-bundle-article-binding.test.ts`
- Create: `tests/publication-bundle/publication-bundle-article-receipt.test.ts`
- Create: `tests/publication-bundle/x-article-url-materializer.test.ts`
- Create: `tests/publication-bundle/publication-bundle-materialization.test.ts`
- Create: `tests/security/publication-bundle-execution-binding.test.ts`
- Create: `tests/security/publication-bundle-url-security.test.ts`

**Interfaces:**
- Consumes: Task 2 Article authorization, installed Article Browser Plan/Approval/context, `XArticlePublishReceiptV1`, existing X Article public-verifier invariants, `createPublicationPlanV2`, `createPublicationPlanV2_1`, `approvePublicationV2`, `approvePublicationV2_1`, and `validatePostText`.
- Produces: read-only child inspector, `.bindArticleExecution`, `.attachArticleReceipt`, `.materializeSingle`, `.singleAuthorization`.

- [ ] **Step 1: Write failing bind-before-next, unknown-without-Receipt, Receipt and URL tests**

```ts
it('binds the exact started Article execution before any Host command', async () => {
  const snapshot = await articleBrowser.start(plan.article_plan, child.approval, capabilities);
  const binding = await service.bindArticleExecution({
    bundle_id: bundleId,
    execution_id: snapshot.execution_id,
    bound_at: now.toISOString()
  });
  expect(binding).toMatchObject({
    child_kind: 'x_article',
    execution_id: snapshot.execution_id,
    plan_digest: child.child_plan_digest
  });
});

it('rejects a second Article execution binding', async () => {
  await bindFirstArticleExecution();
  await expect(bindSecondArticleExecution())
    .rejects.toMatchObject({ code: 'STATE_TRANSITION_INVALID' });
});

it('projects Article outcome_unknown from the bound snapshot without a Receipt', async () => {
  await seedBoundArticleExecution({ state: 'outcome_unknown', latest_receipt_path: null });
  expect(await service.status(bundleId)).toMatchObject({ phase: 'article_outcome_unknown' });
});

it.each([
  ['outcome_unknown', 'https://x.com/Glen56121/article/2091000000000000000'],
  ['verification_conflict', 'https://x.com/Glen56121/article/2091000000000000000'],
  ['published', 'https://evil.example/article/2091000000000000000'],
  ['published', 'https://x.com/OtherUser/article/2091000000000000000']
])('blocks Single materialization for %s and %s', async (status, canonicalUrl) => {
  await seedArticleEvidence({ status, canonicalUrl });
  await expect(service.materializeSingle(bundleId)).rejects.toMatchObject({
    code: expect.stringMatching(/ARTICLE_PUBLICATION_CONFLICT|CONTRACT_INVALID|STATE_TRANSITION_INVALID/)
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```text
pnpm vitest run tests/publication-bundle/publication-child-execution-inspector.test.ts tests/publication-bundle/publication-bundle-article-binding.test.ts tests/publication-bundle/publication-bundle-article-receipt.test.ts tests/publication-bundle/x-article-url-materializer.test.ts tests/publication-bundle/publication-bundle-materialization.test.ts tests/security/publication-bundle-execution-binding.test.ts tests/security/publication-bundle-url-security.test.ts
```

Expected: FAIL because child inspection, execution binding, Receipt binding and materialization do not exist.

- [ ] **Step 3: Implement narrow read-only child inspection and Article binding**

Define an inspector that cannot mutate child execution:

```ts
export interface PublicationChildExecutionInspector {
  inspectArticle(executionId: string): Promise<{
    readonly snapshot: XArticleExecutionSnapshotV1;
    readonly installed_plan_ref: ResearchArtifactRefV1;
    readonly installed_approval_ref: ResearchArtifactRefV1;
    readonly plan: XArticlePublicationPlanV1;
    readonly approval: XArticleApprovalV1;
  }>;
  inspectSingle(runId: string, executionId: string): Promise<{
    readonly snapshot: BrowserExecutionSnapshot;
    readonly installed_plan_ref: ResearchArtifactRefV1;
    readonly installed_approval_ref: ResearchArtifactRefV1;
    readonly plan: PublicationPlanV2 | PublicationPlanV2_1;
    readonly approval: ApprovalV2 | ApprovalV2_1;
    readonly latest_receipt_path: string | null;
  }>;
}
```

The implementation reads only contained installed artifacts. For Article, use `runs/<execution-id>/x-article/browser/plan.json` and `approval.json`; for Single, validate the locator `x/browser-executions/<execution-id>.json` and derive `runs/<run-id>/x/browser/<execution-id>/publication-plan-<version>.json` and Approval path. It must not expose `next`, `claim`, `report`, `resume` or Submit.

`bindArticleExecution` revalidates the derived Authorization and installed Plan/Approval, requires `publish_command_count === 0`, writes one create-only binding, and rejects a different execution forever.

- [ ] **Step 4: Implement honest Article Receipt binding**

Read the Receipt through `readContainedArtifact`, verify the caller's file digest, validate `x-article-publish-receipt`, recompute `receipt_digest`, and require exact execution id, Plan id/digest, Article Package/document/asset evidence and canonical URL identity.

Handle statuses exactly:

- `published` → `article_verified`;
- `published_media_unverified` → `article_verified` while retaining media limitation;
- `verification_conflict` → terminal `article_verification_conflict`;
- caller-supplied `outcome_unknown` Receipt → reject because current Article Adapter does not create one.

Persist a create-only Article Receipt Binding before projecting status.

- [ ] **Step 5: Implement strict URL materialization and child Single Plan**

```ts
export function materializeXArticleUrl(
  template: string,
  canonicalUrl: string,
  targetAccount: string
): string {
  const matches = template.match(/\{\{X_ARTICLE_URL\}\}/g) ?? [];
  if (matches.length !== 1) throw new HarnessError('CONTRACT_INVALID', 'Single template requires one Article URL token');
  const url = new URL(canonicalUrl);
  const account = targetAccount.slice(1);
  const path = url.pathname.match(/^\/([^/]+)\/(article|status)\/(\d+)$/);
  if (
    url.protocol !== 'https:' || url.hostname !== 'x.com' || url.port !== '' ||
    url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '' ||
    path === null || path[1]!.toLowerCase() !== account.toLowerCase()
  ) {
    throw new HarnessError('CONTRACT_INVALID', 'Article canonical URL is outside the approved X account');
  }
  const text = template.replace('{{X_ARTICLE_URL}}', canonicalUrl);
  if (!validatePostText(text).valid) throw new HarnessError('CHARACTER_LIMIT_EXCEEDED', 'Materialized Single exceeds X weighted length');
  return text;
}
```

`materializeSingle` requires valid Article Receipt Binding and unexpired Bundle Approval. Construct V2 text-only with `adapter: 'browser'`, `mode: 'single'`, zero media and one item. Construct V2.1 only for the exact locked Visual, one attachment on ordinal 1 and the same Article Package root/digest. Use deterministic child Plan/run ids derived from Bundle id and provenance containing Bundle Plan, Article Receipt Binding and substitution rule digests. Persist `materialized-single.json` create-only.

- [ ] **Step 6: Derive exact Single authorization**

Run the Bundle Publish Gate again. Use remaining Bundle lifetime, same Human actor and deterministic approval id. Dispatch to `approvePublicationV2` or `approvePublicationV2_1` by child schema version, wrap it with Bundle Approval and Materialization refs, and persist `single-authorization.json` create-only. No method accepts replacement text, actor, target account, Visual or TTL.

- [ ] **Step 7: Run GREEN and child Plan regressions**

Run:

```text
pnpm vitest run tests/publication-bundle/publication-child-execution-inspector.test.ts tests/publication-bundle/publication-bundle-article-binding.test.ts tests/publication-bundle/publication-bundle-article-receipt.test.ts tests/publication-bundle/x-article-url-materializer.test.ts tests/publication-bundle/publication-bundle-materialization.test.ts tests/security/publication-bundle-execution-binding.test.ts tests/security/publication-bundle-url-security.test.ts tests/x/publication-plan-v2.test.ts tests/x/publication-plan-v2-1.test.ts tests/x-article/article-receipt.test.ts tests/x-article/article-public-verifier.test.ts
```

Expected: all selected tests pass; no Single Plan exists before verified Article evidence.

- [ ] **Step 8: Commit Task 3**

Stage exact Task 3 paths, run `git diff --cached --check`, and commit:

```text
git commit -m "feat: bind Article execution and materialize verified Singles"
```

---

### Task 4: Single Execution Binding, Joint Receipt, Status Recovery, and CLI

**Files:**
- Modify: `harnesses/research-publishing/core/publication-bundle-service.ts`
- Modify: `harnesses/research-publishing/cli/index.ts`
- Modify: `tests/cli/cli.test.ts`
- Create: `tests/publication-bundle/publication-bundle-single-binding.test.ts`
- Create: `tests/publication-bundle/publication-bundle-receipt.test.ts`
- Create: `tests/publication-bundle/publication-bundle-status.test.ts`
- Create: `tests/security/publication-bundle-replay.test.ts`
- Create: `tests/integration/publication-bundle-workflow.test.ts`

**Interfaces:**
- Consumes: Task 3 Materialized Single and Authorization, installed X Browser V2/V2.1 execution artifacts and Receipts.
- Produces: `.bindSingleExecution`, `.attachSingleReceipt`, `.status`, joint Receipt and eleven JSON-only CLI routes.

- [ ] **Step 1: Write failing Single binding, terminal-status, recovery and CLI tests**

```ts
it('binds one Single execution before next and rejects rebinding', async () => {
  await service.bindSingleExecution({
    bundle_id: bundleId,
    execution_id: singleExecutionId,
    bound_at: now.toISOString()
  });
  await expect(service.bindSingleExecution({
    bundle_id: bundleId,
    execution_id: 'single_execution_second',
    bound_at: now.toISOString()
  })).rejects.toMatchObject({ code: 'STATE_TRANSITION_INVALID' });
});

it('completes only after exact Article and Single child evidence', async () => {
  const receipt = await service.attachSingleReceipt({
    bundle_id: bundleId,
    receipt_path: singleReceiptPath,
    receipt_digest: singleReceiptDigest
  });
  expect(receipt).toMatchObject({ status: 'completed' });
  expect(receipt.public_urls).toEqual([articleUrl, singleUrl]);
});

it.each(['outcome_unknown', 'verification_conflict', 'partial', 'failed_after_submit'])
('does not complete from Single status %s', async (status) => {
  await seedSingleReceipt(status);
  const result = await service.attachSingleReceipt(singleReceiptInput);
  expect(result).not.toHaveProperty('status', 'completed');
  await expect(service.singleAuthorization(bundleId))
    .rejects.toMatchObject({ code: 'STATE_TRANSITION_INVALID' });
});

it('rebuilds deleted Bundle and Weekly status projections', async () => {
  await store.removeFile(`runs/${bundleId}/publication-bundle/status.json`);
  await store.removeFile(`program/weeks/${cycleId}/status.json`);
  expect((await service.status(bundleId)).phase).toBe('completed');
  expect((await weeks.status(cycleId)).phase).toBe('publication_planned');
});
```

- [ ] **Step 2: Run RED**

Run:

```text
pnpm build
pnpm vitest run tests/publication-bundle/publication-bundle-single-binding.test.ts tests/publication-bundle/publication-bundle-receipt.test.ts tests/publication-bundle/publication-bundle-status.test.ts tests/security/publication-bundle-replay.test.ts tests/integration/publication-bundle-workflow.test.ts tests/cli/cli.test.ts
```

Expected: FAIL because Single binding, joint Receipt, recovery and Bundle CLI routes are absent.

- [ ] **Step 3: Implement Single execution binding**

`bindSingleExecution` uses the read-only inspector, verifies exact V2/V2.1 child Plan and Approval against `single-authorization.json`, requires `submit_command_count === 0`, and writes one create-only binding. Status before binding is `single_authorized`; after binding it follows the actual child state. A retry for the same binding returns the installed bytes; any other execution id fails.

- [ ] **Step 4: Verify Single Receipt and issue joint Receipt**

For V2 Receipt require `status === 'finalized'` and call `assertFinalReceiptV2`. For V2.1 independently require exact Plan/Approval identity, one Submit, public-browser-verified account/content/order/reply/link evidence and exact media evidence. Accept `published_media_unverified` only when text/account/link evidence is strong and retain limitations.

Map terminal outcomes exactly:

```ts
const terminalPhase = {
  outcome_unknown: 'single_outcome_unknown',
  verification_conflict: 'single_verification_conflict',
  partial: 'single_terminal_failure',
  failed_after_submit: 'single_terminal_failure'
} as const;
```

Only `finalized` or valid `published_media_unverified` creates `receipt.json`. The joint Receipt binds Cycle, Bundle Plan/Approval, both child Plan/Receipt refs and ordered public URLs. Re-read and validate every artifact before return.

- [ ] **Step 5: Rebuild Bundle and Weekly status projections**

`status` derives the highest honest phase from create-only Bundle artifacts in order, then consults only the execution named by each binding through `PublicationChildExecutionInspector`. It repairs `status.json` with `replaceAtomic`; conflict/failure/completed phases never move backward.

Extend `WeeklyResearchCycleService.status` to read and validate `program/weeks/<cycle>/publication-bundle-binding.json`. When present, rebuild `publication_planned` with exact Package/Article/Bundle refs. Do not infer `published` from a completed Bundle because Phase 4 still owns `outcome_ref`.

- [ ] **Step 6: Add all eleven exact CLI operations**

Add one `operation.startsWith('publication bundle ')` branch and instantiate the Bundle service with the read-only inspector. Routes:

```text
publication bundle plan
publication bundle audit
publication bundle approve
publication bundle article-authorization
publication bundle bind-article-execution
publication bundle attach-article-receipt
publication bundle materialize-single
publication bundle single-authorization
publication bundle bind-single-execution
publication bundle attach-single-receipt
publication bundle status
```

Every mutation reads structured `--input`; audit/status read `{ "bundle_id": "..." }`. Every response is JSON with `artifact` and an honest phase. No route accepts free-form shell, account override, URL override, `--auto-confirm`, TTL at approval or a Browser command.

- [ ] **Step 7: Run GREEN and Browser regressions**

Run:

```text
pnpm vitest run tests/publication-bundle tests/security/publication-bundle-approval.test.ts tests/security/publication-bundle-execution-binding.test.ts tests/security/publication-bundle-url-security.test.ts tests/security/publication-bundle-replay.test.ts tests/integration/publication-bundle-workflow.test.ts tests/integration/x-browser-workflow.test.ts tests/integration/x-article-browser-workflow.test.ts tests/cli/cli.test.ts
```

Expected: all selected tests pass; existing child Browser workflows and replay guards remain unchanged.

- [ ] **Step 8: Commit Task 4**

Stage exact Task 4 paths, run `git diff --cached --check`, and commit:

```text
git commit -m "feat: complete publication bundles with joint receipts"
```

---

### Task 5: X Publishing Skill Branch, Fake-Host Acceptance, Verification, and Handoff

**Files:**
- Modify: `skills/x-publishing-copilot/SKILL.md`
- Create: `skills/x-publishing-copilot/references/publication-bundle-flow.md`
- Modify: `tests/skills/skill-boundary.test.ts`
- Create: `tests/integration/publication-bundle-browser-acceptance.test.ts`
- Modify: `.llm-wiki/requirements/research-program-orchestration-v2-4-phase-3.md`
- Modify: `.llm-wiki/requirements/research-program-orchestration-v2-4.md`
- Modify: `.llm-wiki/working-context/research-program-orchestration-v2-4.md`
- Modify: `.llm-wiki/log.md`
- Create: `.llm-wiki/handoff/research-program-orchestration-v2-4-phase-3.md`

**Interfaces:**
- Consumes: all Task 4 CLI operations and existing child Browser Host protocols.
- Produces: one-confirmation Skill branch, Fake-Host full Phase 3 evidence and a continuation handoff to Phase 4.

- [ ] **Step 1: Write failing Skill-boundary and Fake-Host acceptance tests**

The Skill test must require all of these literal boundaries:

```ts
expect(reference).toContain('one exact Bundle confirmation');
expect(reference).toContain('bind-article-execution');
expect(reference).toContain('before `x-article browser next`');
expect(reference).toContain('bind-single-execution');
expect(reference).toContain('before `x browser next`');
expect(reference).toContain('resume-verification');
expect(reference).toContain('Never replay Submit');
expect(reference).toContain('Memory Promotion requires a separate confirmation');
```

The integration acceptance must build a real temporary Phase 2 Cycle/Package/Article, use real Bundle/child service code, replace only external page actions with Fake Hosts, and assert:

```ts
expect(host.submitKinds).toEqual(['publish_article_once', 'submit_once']);
expect(host.submitKinds).toHaveLength(2);
expect(bundleApprovalCount).toBe(1);
expect(finalReceipt.status).toBe('completed');
expect(finalReceipt.public_urls).toEqual([articleUrl, singleUrl]);
expect(await workspaceFiles('memory/promotions')).toEqual([]);
expect(network).toBe('unused');
```

- [ ] **Step 2: Run RED**

Run:

```text
pnpm vitest run tests/skills/skill-boundary.test.ts tests/integration/publication-bundle-browser-acceptance.test.ts
```

Expected: FAIL because the Bundle Skill branch and full Fake-Host acceptance do not exist.

- [ ] **Step 3: Document the exact Skill sequence and stop rules**

Add a short route from `SKILL.md` to `references/publication-bundle-flow.md`. The reference must contain this exact order:

```text
publication bundle plan → audit
Human confirms the exact bundle_digest once
publication bundle approve → article-authorization
x-article browser start → publication bundle bind-article-execution
x-article browser next/claim/report until terminal or recoverable
publication bundle attach-article-receipt when a Receipt exists
publication bundle materialize-single → single-authorization
x browser start → publication bundle bind-single-execution
x browser next/claim/report until terminal or recoverable
publication bundle attach-single-receipt → joint Receipt
```

State explicitly:

- check Bundle status before each child start;
- binding must exist before child `next`;
- unknown uses status/resume-verification only;
- conflict/failure/expiry stops the Bundle;
- no second confirmation during a valid normal Bundle;
- fallback is a new separately reviewed publication outside the old Approval;
- Bundle Approval does not authorize Weekly Outcome or Memory Promotion.

- [ ] **Step 4: Run the Phase 3 focused gate**

Run:

```text
pnpm vitest run tests/publication-bundle tests/program/weekly-publication-bundle-binding.test.ts tests/security/publication-bundle-approval.test.ts tests/security/publication-bundle-execution-binding.test.ts tests/security/publication-bundle-url-security.test.ts tests/security/publication-bundle-replay.test.ts tests/integration/publication-bundle-workflow.test.ts tests/integration/publication-bundle-browser-acceptance.test.ts tests/skills/skill-boundary.test.ts
```

Expected: every Phase 3 test passes with Fake Hosts only and exactly two ordered Submit commands.

- [ ] **Step 5: Validate the modified Skill**

Run the repository's Skill boundary tests, then resolve the active `skill-creator` package from the current Codex skill catalog and invoke its `scripts/quick_validate.py` against `skills/x-publishing-copilot` with UTF-8 enabled. Do not persist a workstation-specific validator path in the team-shared Wiki.

```text
pnpm vitest run tests/skills/skill-boundary.test.ts
skill-creator quick_validate skills/x-publishing-copilot
```

Expected: tests pass and the resolved validator prints `Skill is valid!`. The second line is the durable workflow label, not a literal shell binary; the executing agent must use the active catalog's actual validator resource.

- [ ] **Step 6: Run full repository verification**

Run fresh commands after all implementation edits:

```text
pnpm lint
pnpm typecheck
pnpm test
git diff --check
```

Expected: all commands exit 0 except existing explicitly opt-in skipped tests; record exact file/test counts and skipped counts. Do not call the result CI or independent review.

- [ ] **Step 7: Commit Task 5 implementation paths**

Stage only the Skill reference, `SKILL.md`, Skill boundary test and Fake-Host acceptance, run `git diff --cached --check`, and commit:

```text
git commit -m "feat: add one-confirmation X publication bundle flow"
```

- [ ] **Step 8: Sync lifecycle evidence and write the Phase 3 handoff**

Update the child and parent Change Briefs, working context and log with actual commits and exact verification counts. The handoff must record:

- Bundle and TTL policy;
- child Execution Binding paths and bind-before-next rule;
- URL rule and Article-no-unknown-Receipt fact;
- Publish Gate and derived child approvals;
- status/recovery table;
- child Plan/Receipt refs in joint Receipt;
- Weekly status boundary at `publication_planned`;
- no external Browser/X/Runtime/Wiki action;
- Phase 4 dependency and residual agent-local risk.

Stage only the five `.llm-wiki` files, run `git diff --cached --check`, and commit:

```text
git commit -m "docs: hand off V2.4 publication bundles"
```

## Acceptance Traceability

| Approved specification criteria | Primary task |
|---|---|
| AC 1–5: exact source inputs, token, digest, Audit and locked TTL | Tasks 1–2 |
| AC 6–7: fifth Gate and derived approvals | Task 2 |
| AC 8–13: bind-before-next, recovery, replay and terminal failure | Tasks 3–4 |
| AC 14–17: verified URL, Receipt identity and media honesty | Tasks 3–4 |
| AC 18: joint status, Plan/Receipt refs and ordered URLs | Task 4 |
| AC 19 and 23: Weekly projection and create-only week binding | Tasks 2 and 4 |
| AC 20: exactly two ordered Fake-Host Submits from one Approval | Task 5 |
| AC 21–22: backward compatibility and no external effects | Tasks 4–5 |

## Execution Gate

This plan is complete only when its incomplete-marker scan, type/signature consistency review, spec coverage table and `git diff --check` pass. Implementation does not begin until the user explicitly authorizes Phase 3 execution. The default execution mode is inline on current `main` with `executing-plans` and TDD checkpoints.
