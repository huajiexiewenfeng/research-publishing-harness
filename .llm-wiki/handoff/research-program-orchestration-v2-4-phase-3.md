# Handoff: Research Program Orchestration V2.4 Phase 3

## Status

- phase: `phase-3-one-confirmation-publication-bundle`
- result: `implemented-and-passed-agent-local`
- source_head_before_handoff: `a321c34`
- branch: `main`
- external_effects: none
- next_gate: explicit Phase 4 design and implementation authorization

## Delivered

Phase 3 turns one finalized Phase 2 Article Package into one deterministic publication unit: an X Article followed by one English X Single that links to the publicly verified Article URL. One Human confirmation covers the exact Bundle digest; it does not authorize a Weekly Outcome, Publication Expression, Memory Promotion or public bootstrap.

Implementation commits:

- `f664c02` — lifecycle start;
- `e81d604` — Bundle contracts, schemas and state;
- `4c8c2ed` — Plan, Audit, locked Approval and Publish Gate;
- `506e0eb` — Article execution binding, Receipt verification, URL materialization and Single authorization;
- `43b7e28` — Single execution binding, per-Receipt evidence, joint Receipt, status recovery and CLI;
- `b4b3562` — X Publishing Skill branch and Fake Browser Host acceptance;
- `a321c34` — stable budgets for process-heavy CLI acceptance tests.

## Locked Bundle and TTL Policy

- The Bundle Plan binds the exact Phase 2 Selection, Package V1.2, finalized Article Package, X Article Plan, English Single template, Claim refs, target account, optional Visual, Article-first order, policy and `authorization_ttl_ms`.
- The default TTL is `7_200_000` ms. Accepted Plans allow `600_000..86_400_000` ms. Approval cannot supply, extend or replace TTL.
- The template contains exactly one `{{X_ARTICLE_URL}}`; the only substitution rule is `verified-x-article-canonical-url/v1`.
- One Weekly Cycle has one immutable `program/weeks/<cycle_id>/publication-bundle-binding.json`. A failed, conflicted or expired Bundle cannot be replaced inside the same Cycle.

## Child Binding and Recovery Boundary

- Article execution: `runs/<bundle_id>/publication-bundle/article-execution-binding.json`.
- Single execution: `runs/<bundle_id>/publication-bundle/single-execution-binding.json`.
- Article Receipt binding: `runs/<bundle_id>/publication-bundle/article-receipt-binding.json`.
- Single Receipt bindings: `runs/<bundle_id>/publication-bundle/single-receipt-bindings/<receipt_id>.json`; this preserves unknown evidence and permits a protocol-valid superseding final Receipt without replacing prior bytes.
- The Skill must call child Browser `start`, bind that exact execution, and only then call the corresponding `next`. A second execution cannot replace the binding.
- Article `outcome_unknown` has no Article Receipt in the current child protocol. Bundle status derives it from the bound Article Execution Snapshot and permits only read-only `resume-verification`.
- Single `outcome_unknown` may later attach a superseding final Receipt on the same bound execution. Never replay Submit or start a replacement execution.

## Publish Gate and URL Rule

- The Bundle Publish Gate revalidates Plan, Approval, Package/Article bytes, Claim refs, target account, optional Visual and expiry before each derived child authorization.
- Article and Single child approvals are deterministic derivatives of the one Bundle Approval and its remaining lifetime; neither accepts replacement content, actor, account, Visual or TTL.
- Single materialization accepts only HTTPS URLs on host exactly `x.com`, with no credentials, port, query or fragment, and pathname exactly `/<approved-account>/(article|status)/<digits>` using case-insensitive account comparison.
- Redirects, shortened URLs, foreign accounts and caller-provided display URLs fail closed.

## Status and Joint Receipt

The rebuildable status path is:

```text
planned → approved → article_authorized → article_in_progress
→ article_verified → single_materialized → single_authorized
→ single_in_progress → completed
```

Unknown outcomes stop at the corresponding `*_outcome_unknown` and allow only verification resume. Verification conflict, terminal failure and approval expiry are terminal for the Bundle. `published_media_unverified` can complete only with strong public text/account/link identity and retains its limitation.

The joint `PublicationBundleReceiptV1` contains `status: completed`, exact Cycle/Bundle/Approval refs, separate Article and Single Plan/Receipt refs, honest child statuses, exactly two Article-first public URLs and a self-excluding digest. Phase 4 must consume the child Plan/Receipt pairs separately; it must not treat the joint Receipt as merged publication content.

Weekly status reconstruction stops at `publication_planned`. Phase 3 creates no `outcome_ref`, does not mark a Topic complete and does not create Publication Expression or Memory Promotion artifacts.

## Verification Evidence

- RED was observed before each of the five implementation increments; focused tests were turned GREEN incrementally.
- Phase 3 focused gate: 21 test files, 59 tests passed.
- Final repository gate: 141 test files and 611 tests passed; 1 file and 1 test explicitly skipped.
- ESLint, TypeScript typecheck, production build, `git diff --check` and `skill-creator quick_validate` passed.
- Fake Browser Host acceptance recorded exactly `publish_article_once` then `submit_once`, one Bundle Approval, a completed joint Receipt, two ordered public URLs, no `memory/promotions` artifacts and `network: unused`.
- Trust level is `passed-agent-local`; this is not external CI, independent review or live-X validation.

## External Effects and Residual Risk

- No real Chrome/X operation, GitHub publish/push, Runtime call, user Wiki write or Memory Promotion occurred.
- Fake Hosts validate protocol ordering and at-most-once evidence, not current live X DOM behavior. Page-contract drift remains a live smoke-test risk.
- Bind-before-next is enforced by the Bundle service and documented in the Skill, but an agent can still bypass the Bundle by invoking a child adapter directly. The orchestration boundary therefore remains partly agent-local.
- A corrupt child execution store is not repaired by Bundle status reconstruction; the Bundle only reconstructs its own projection from immutable bindings and narrow child status reads.

## Phase 4 Boundary

Phase 4 has not started. It alone may define and implement Weekly Outcome, Topic completion, Roadmap/month/cycle binding, Publication Expression, Memory Promotion and public bootstrap. Before implementation, Phase 4 must explicitly decide how it consumes the separate child Plan/Receipt evidence and how its own Human confirmation is separated from the Phase 3 publication confirmation.
