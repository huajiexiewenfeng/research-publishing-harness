# Change Brief: V2.4 Phase 3 One-confirmation Publication Bundle

## Flow

- flow_id: `research-program-orchestration-v2-4-phase-3`
- parent_flow_id: `research-program-orchestration-v2-4`
- status: `implementation-in-progress`
- design_status: `confirmed`
- implementation_authorized: true
- source_head: `5c07034`
- trust: source-verified design; no implementation or external execution claimed

## Why

Phase 2 can produce a Human-selected, evidence-reviewed, finalized local Article Package, but it intentionally stops before publication authorization. Phase 3 must turn that package into one auditable publication unit: one X Article followed by one English X Single that links to the publicly verified Article URL, covered by one exact Human confirmation.

The original external Phase 3 plan has the correct Article-first direction, but current source verification exposed two gaps that must be corrected before implementation:

1. X Article `outcome_unknown` has an Execution Snapshot but no Receipt, so Receipt-only Bundle recovery cannot identify or resume the child execution.
2. The proposed Audit showed an expiry preview while the TTL remained a later free input, so the Human-confirmed Bundle digest did not bind the actual authorization window.

## Confirmed Design Decision

The Publication Bundle is an independent deterministic control plane. It stores create-only bindings for both child Browser executions and locks the authorization TTL in the Bundle Plan. The Skill carries semantic intent and invokes commands; the Bundle owns identity binding, state projection, approval derivation, recovery decisions and the joint Receipt.

## Active Sources

- Phase 2 handoff: `.llm-wiki/handoff/research-program-orchestration-v2-4-phase-2.md`.
- Parent Change Brief: `.llm-wiki/requirements/research-program-orchestration-v2-4.md`.
- Current Phase 2 Weekly Cycle, Package V1.2, Article Package and Claim Boundary source at `5c07034`.
- Current X Article Browser V3 and X Browser V2/V2.1 source, schemas and tests at `5c07034`.
- External Phase 3 plan suite commit `38a3efb`, treated as a planning source and corrected by this source-verified child specification.

## Scope

### Active

- Versioned Publication Bundle Plan, Approval, Status, two derived child authorizations, two Execution Bindings, Article/Single Receipt Bindings, Materialized Single and joint Receipt.
- Exact URL-token materialization for `{{X_ARTICLE_URL}}`.
- Bundle-specific Publish Gate and deterministic Audit.
- JSON-only `publication bundle` CLI routes.
- X Publishing Skill Bundle branch.
- Fake-Host integration and security tests.
- Weekly Cycle projection to `publication_planned` after an immutable Bundle Plan exists.

### Read-only

- Phase 2 Roadmap, Topic, Candidate Set, Human Selection, Package V1.2 and finalized Article artifacts.
- Existing X Article Plan/Approval/Browser execution/Receipt/public verifier.
- Existing X V2/V2.1 Plan/Approval/Browser execution/Receipt/public verifier.
- `llm-wiki-runtime` 0.2.0 and all V2.3 Memory behavior.

### Excluded

- Real Chrome or X execution, credentials, Browser page-contract changes and Submit-barrier weakening.
- Weekly Outcome, Topic completion, Publication Expression, Memory Promotion, Monthly Review and public bootstrap; Phase 4 owns these.
- Automatic topic selection, automatic semantic promotion or a second hidden approval.
- Changes to `llm-wiki-runtime`.
- Manual fallback under an existing Bundle Approval.

## Locked Publication Policy

1. One Bundle contains exactly one X Article Plan and one English X Single template.
2. The Single template contains exactly one `{{X_ARTICLE_URL}}` token and no other dynamic token.
3. The only substitution rule is `verified-x-article-canonical-url/v1`.
4. Execution order is exactly `x_article`, then `x_single`.
5. The Plan digest binds the complete X Article Plan, finalized Article Package, V1.2 Package ref, Weekly Selection ref, target account, Single template, Claim refs, optional exact Visual, execution order, policy version and `authorization_ttl_ms`.
6. `authorization_ttl_ms` is locked before confirmation. The default is `7_200_000` milliseconds, the accepted range is `600_000..86_400_000`, and Approval cannot supply or extend it.
7. The Human confirms one exact `bundle_digest`. Child approvals are deterministic derivatives and never trigger another prompt during the valid authorization window.
8. Expiry is checked before each child authorization and child Submit barrier. Read-only verification and Receipt attachment remain allowed after expiry for a Submit that occurred while authorized.
9. If the Bundle expires after Article publication but before Single authorization, the Bundle stops with `APPROVAL_EXPIRED`; the old approval cannot be extended. Any fallback requires a separately reviewed new publication plan.
10. Bundle Approval never authorizes Semantic Promotion.
11. One Weekly Cycle binds exactly one immutable Publication Bundle. A failed, conflicted or expired Bundle is not replaced inside that Cycle and cannot produce a completed Weekly Outcome.

## Public Contracts

### PublicationBundlePlanV1

The Plan uses schema `publication-bundle-plan/v1` and contains:

- stable `bundle_id` and `cycle_id`;
- exact Selection and Research Content Package refs;
- exact finalized Canonical Article Package ref;
- complete `XArticlePublicationPlanV1`;
- `single_intent` with language `en`, content type `anchor`, one-token template, Claim refs, target account and optional `VisualAssetRef`;
- substitution token/rule;
- exact execution order;
- `authorization_ttl_ms`;
- action `publish_bundle_once` and policy `research-program-policy/v1`;
- `planned_at` and self-excluding `bundle_digest`.

### PublicationBundleApprovalV1

The Approval uses schema `publication-bundle-approval/v1`. Its digest includes Bundle id/digest, account, scope, actor, approval time and expiry. `expires_at` is derived only from the Plan's locked TTL. A retry is idempotent only when all bytes match; a changed actor, digest or time creates neither a replacement nor an extension.

### Derived Child Authorizations

`DerivedArticleAuthorizationV1` and `DerivedSingleAuthorizationV1` bind:

- exact Bundle Plan ref;
- exact Bundle Approval artifact ref;
- child Plan digest;
- existing child Approval object;
- for Single, the Materialized Single ref;
- a self-excluding authorization digest.

The Bundle Approval artifact digest is distinct from the existing child `approval_digest`, which is a child Plan authorization fingerprint. The two values must not be conflated.

### Child Execution Bindings

`ArticleExecutionBindingV1` and `SingleExecutionBindingV1` are create-only. Each binds:

- Bundle Plan and Approval refs;
- derived child authorization ref;
- child kind, execution id, run id, plan id and plan digest;
- the create-only Plan and Approval artifacts installed by the child Browser Adapter;
- `bound_at` and a self-excluding binding digest.

Binding happens immediately after Browser `start` and before `next`, `claim` or any Host command. The service verifies the current child snapshot identity, but does not bind a mutable snapshot digest. A second execution cannot replace the first binding. On restart, the Skill reads the existing binding instead of starting another child execution.

### Receipt Bindings and Joint Receipt

Receipt Bindings are create-only and contain the file-byte digest plus parsed identity evidence. They never trust a caller-provided status.

`PublicationBundleReceiptV1` includes the previously omitted field `status: 'completed'`, the exact Cycle ref, both child Plan refs, both child Receipt refs, ordered public URLs, honest child statuses, issue time and self-excluding Receipt digest. Phase 4 consumes the child Plan/Receipt pairs separately; it never treats the Bundle Receipt as merged publication content.

Program refs use their contract-declared semantic digest. Child publication Plan/Receipt refs consumed by `VersionedPublicationEvidenceReader` use the exact contained file-byte digest returned by `WorkspaceStore.readContainedArtifact`; their separate `plan_digest` or `receipt_digest` fields retain semantic identity. Implementations must not substitute one digest class for the other.

## Artifact Layout

```text
runs/<bundle_id>/publication-bundle/
  plan.json
  approval.json
  status.json                         # rebuildable projection
  article-authorization.json
  article-execution-binding.json
  article-receipt-binding.json
  materialized-single.json
  single-authorization.json
  single-execution-binding.json
  single-receipt-binding.json
  receipt.json

program/weeks/<cycle_id>/
  publication-bundle-binding.json      # create-only cycle → Bundle link
```

The deterministic Audit is a rendered view of the installed Plan, not a second source of truth. No absolute path, credential, cookie or browser-login state may enter a Bundle artifact.

## Components

### PublicationBundleContracts

- Validate closed schemas, exact token count, stable ids, contained refs and self-excluding digests.
- Enumerate all allowed phases and transitions; expose no generic `setState` API.

### PublicationBundlePublishGate

- Revalidate the installed Plan, V1.2 Claim refs, four Phase 2 content Gates, target account, optional Visual bytes and exact Bundle Approval.
- Fail before Approval with `APPROVAL_REQUIRED`.
- Fail on Plan, Article, Package, template, Claim, Visual, account, policy or TTL drift with `APPROVAL_STALE`.
- Run before each derived authorization. It does not call a Browser Adapter.

### PublicationBundleService

Public surface:

```ts
interface PublicationBundlePort {
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

`attachSingleReceipt` returns the joint Receipt only for a completed pair. Unknown, conflict, partial or failed child outcomes return the honest Bundle Status and never synthesize success.

### ChildExecutionInspector

The Bundle depends on narrow read-only child status interfaces rather than duplicating Browser state machines. The inspector verifies the installed child Plan/Approval artifacts and obtains the current Article or Single execution status. It cannot issue, claim, report, resume or submit a Browser command. Existing Browser Adapters remain the only owners of child execution transitions.

### XArticleUrlMaterializer

- Parse with `URL` and require HTTPS, host exactly `x.com`, no credentials, port, query or fragment.
- Require pathname exactly `/<approved-account>/(article|status)/<digits>` with case-insensitive account equality.
- Replace exactly one token, normalize text and run the existing X weighted-length validation.
- Reject redirects, shortened URLs, foreign accounts and caller-supplied display URLs.

## State and Recovery Model

Bundle Status is a rebuildable projection from immutable Bundle artifacts plus the bound child execution ledger/projection.

| Phase | Authoritative evidence | Allowed next action |
|---|---|---|
| `planned` | Plan | Audit or exact Human approval |
| `approved` | Approval | Derive Article authorization |
| `article_authorized` | Article authorization | Start and bind Article execution |
| `article_in_progress` | Article Execution Binding + active child state | Continue existing child commands |
| `article_outcome_unknown` | Bound child state | Read-only Article `resume-verification` only |
| `article_verification_conflict` | child conflict evidence | Terminal for this Bundle |
| `article_terminal_failure` | bound terminal child failure | Terminal for this Bundle |
| `article_verified` | valid Article Receipt Binding | Materialize Single while Approval is valid |
| `single_materialized` | exact verified URL substitution | Derive Single authorization |
| `single_authorized` | Single authorization | Start and bind Single execution |
| `single_in_progress` | Single Execution Binding + active child state | Continue existing child commands |
| `single_outcome_unknown` | unknown Receipt/bound child state | Read-only Single `resume-verification` only |
| `single_verification_conflict` | child conflict Receipt | Terminal for this Bundle |
| `single_terminal_failure` | `partial` or `failed_after_submit` Receipt | Terminal for this Bundle |
| `approval_expired` | locked Approval expiry reached before the next child authorization | Terminal for this Bundle |
| `completed` | valid joint Receipt | No further mutation |

`published_media_unverified` is not treated as conflict when public author, content, links and post identity are strongly verified. The limitation is preserved in the joint Receipt. `outcome_unknown` never permits another Submit. A superseding child Receipt must reference the prior Receipt where that child protocol supports Receipt supersession.

## Receipt Verification

### Article

- Current source creates no Article Receipt for `outcome_unknown`; Bundle derives that phase from the exact bound Execution Snapshot.
- `published`, `published_media_unverified` and `verification_conflict` Receipts may be bound.
- The Bundle verifies schema, file bytes, receipt digest, execution id, Plan id/digest, Article Package digest, document digest, assets, canonical URL, author/content/link booleans and public-verification kind.
- Only `published` and `published_media_unverified` permit Single materialization.

### Single

- Verify schema version against the materialized V2 or V2.1 child Plan.
- Require execution id, run id, Plan digest, Approval evidence, exactly one Submit, target/observed account, one public post, content/link match and canonical root URL.
- `finalized` completes text-only or fully verified Visual publication.
- `published_media_unverified` may complete only when text/link/account evidence is public-browser-verified and the exact media limitation is retained.
- `outcome_unknown` is resumable read-only; `verification_conflict`, `partial` and `failed_after_submit` are terminal for the Bundle.

## Weekly Cycle Projection

Creating an immutable Bundle Plan also creates `program/weeks/<cycle_id>/publication-bundle-binding.json`. The binding contains the exact Cycle, Selection, V1.2 Package, finalized Article `package-ref.json` and Bundle Plan refs. It makes the cycle-to-Bundle relationship discoverable without relying on `status.json` and rejects a second Bundle for the same Cycle.

Weekly Cycle status rebuild reads this create-only binding and projects `publication_planned`. Phase 3 does not mark the cycle `published`, complete the Topic or create an Outcome. Phase 4 creates the Weekly Outcome and is the only stage that may supply `outcome_ref` and advance the Weekly Cycle to `published`.

## Human Audit

Before confirmation, render:

- target account and Article title;
- Article Plan and Article Package digests;
- exact English Single template;
- explicit statement that the final Article URL is currently unknown;
- unique token and substitution rule;
- optional Visual preview identity, digest and Alt Text;
- Claim refs, execution order and locked authorization TTL;
- Bundle digest.

The Audit must never claim the final Single bytes are known before Article verification.

## CLI and Skill Flow

JSON-only CLI operations:

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

The X Publishing Skill sequence is:

```text
bundle plan → audit
Human confirms exact bundle_digest once
bundle approve → article-authorization
x-article browser start → bind-article-execution
child next/claim/report until terminal or recoverable state
attach-article-receipt when one exists
materialize-single → single-authorization
x browser start → bind-single-execution
child next/claim/report until terminal or recoverable state
attach-single-receipt → joint Receipt
```

The Skill checks Bundle status before every child `start`. It never keeps the only copy of an execution id, never asks for a second confirmation during a valid normal flow, never replays Submit and never converts an attempted Browser publication to Manual fallback under the old Approval.

## Acceptance Criteria

1. A Plan cannot be created without the exact Phase 2 Selection, V1.2 Package, finalized Article Package and stored X Article Plan.
2. Plan validation rejects zero, duplicate or foreign dynamic tokens.
3. Bundle digest changes for any Article, template, Claim, account, Visual, order, policy or TTL change.
4. Audit states that final Single bytes are unknown and displays the locked TTL.
5. Approval takes no caller-supplied TTL and is create-only/idempotent for exact retries.
6. Publish Gate fails closed before Approval and on any drift or expiry.
7. Each child authorization is deterministically derived from the same Bundle Approval artifact.
8. Browser `start` must be followed by exact execution binding before any next Host command.
9. A second child execution cannot replace a binding.
10. Bundle status recovers after its own status deletion or corruption from immutable Bundle artifacts plus the narrow child status interfaces; it does not claim to repair a corrupt child execution store.
11. Article `outcome_unknown` is represented from its bound Execution Snapshot without inventing a Receipt.
12. Unknown outcomes allow only the existing read-only verification path and never a second Submit.
13. Conflict, partial and failed-after-submit outcomes cannot produce a joint success Receipt.
14. Single is absent before a verified Article URL exists.
15. URL materialization accepts only the two canonical X Article URL forms already accepted by the verifier.
16. Article and Single Receipt Bindings verify exact Plan, execution, authorization and public evidence.
17. `published_media_unverified` remains visible in the joint Receipt and is never upgraded to fully media-verified.
18. Joint Receipt contains `status: 'completed'`, exact Article/Single Plan and Receipt refs, and exactly two ordered public URLs.
19. Weekly Cycle advances only to `publication_planned`; Phase 3 creates no Outcome or Memory Promotion.
20. Fake-Host acceptance observes exactly two Submit commands in Article-first order, derived from one Bundle Approval.
21. Existing direct X Article and X Single/Thread/Reply flows remain backward compatible.
22. Tests and acceptance perform no real Browser, X, GitHub, Runtime or Wiki write.
23. A create-only Weekly Bundle Binding makes status reconstruction deterministic and rejects a second Bundle for the same Cycle.

## Verification Plan

- Contract and state-table tests for all valid/invalid edges and digest drift.
- Security tests for token injection, URL/account mismatch, path escape, Approval expiry, execution rebinding and replay.
- Receipt tests for every current child terminal status and superseding verification Receipt.
- Status rebuild tests from immutable artifacts and child execution ledgers.
- CLI tests for all eleven exact routes and JSON-only inputs.
- Skill-boundary tests for one confirmation, bind-before-next and recovery-only behavior.
- Fake Browser Host end-to-end test with exactly two ordered Submit commands.
- Existing X Article, X V2/V2.1, Weekly Cycle, Package V1.2 and Claim Boundary regressions.
- Final `pnpm lint`, `pnpm typecheck`, `pnpm test` and `git diff --check`.

## Implementation Shape

After explicit implementation authorization, execute five TDD increments:

1. Bundle contracts, locked TTL, state machine and schemas.
2. Plan, Audit, Publish Gate, Approval and Article authorization.
3. Article Execution Binding, Receipt verification, URL materialization and Single authorization.
4. Single Execution Binding, joint Receipt, status rebuild and Weekly Cycle projection.
5. CLI, X Publishing Skill branch, Fake-Host acceptance and Phase 3 handoff.

This is decomposition only, not implementation authorization. A source-calibrated execution plan must be written after the user approves this specification.

## Flow Record

| Step | Status | Evidence | Updated |
|---|---|---|---|
| source | done | Phase 2 handoff and current child publication source at `5c07034` | 2026-08-24 |
| design | done | user confirmed `确认 Phase 3 设计规格`; child brief corrects Receipt-only recovery and unlocked TTL | 2026-08-24 |
| plan | done | `.llm-wiki/working-context/research-program-orchestration-v2-4-phase-3-implementation-plan.md` | 2026-08-24 |
| development | in_progress | user confirmed `开始 Phase 3 inline 实现`; Task 1 TDD checkpoint active | 2026-08-24 |
| testing | pending | acceptance criteria defined above | 2026-08-24 |
| archive | pending | Phase 3 handoff after verified implementation | 2026-08-24 |

## Open Questions

- None. The next gate is explicit Phase 3 implementation authorization for the source-calibrated plan.
