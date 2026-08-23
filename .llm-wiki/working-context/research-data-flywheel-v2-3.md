# Working Context: Research Data Flywheel V2.3

## Flow

- flow_id: `research-data-flywheel-v2-3`
- status: complete
- active_phase: `complete`
- active_task: `none`
- active_plan: `docs/superpowers/plans/2026-08-22-research-data-flywheel-v2-3-phase-4-publication-migration.md`

## Scope Lock

- completed: Phase 1 policy/contracts/lifecycle, Evidence Object Store, canonical document projection,
  local Working Increment assembly and CLI/acceptance coverage.
- completed: Phase 2 Semantic Delta, reviewed promotion, Runtime-backed immutable records and Catalog-last Index visibility.
- completed: Phase 3 Catalog-first progressive query and exact Runtime reads.
- completed: Phase 4 Publication Flywheel and bounded historical migration.
- read-only: V2.2 implementation and `llm-wiki-runtime` source referenced by `edge-001`.
- excluded: autonomous promotion/publication, automatic feedback selection, broad V2.3 Query and bulk historical migration.

## Implementation Rules

- Inline on current `main` by explicit user authorization and standing preference.
- No subagents.
- Test-first for every production behavior.
- Preserve V2.2 schema and runtime behavior.
- Harness/Skills never write `.llm-wiki` directly; Phase 2 Runtime writes must use the verified Adapter.
- Use `research-memory-policy/v1` fixed values from the approved overview.

## Current Checkpoint

- Baseline commit: `20aea25`.
- Change Brief created before production edits.
- Task 1 verification: 4 test files / 45 tests passed; TypeScript and focused ESLint passed.
- Task 2 verification: 4 test files / 24 tests passed; TypeScript and focused ESLint passed.
- Task 3 verification: 2 test files / 11 tests passed; TypeScript and focused ESLint passed.
- Task 4 verification: 4 test files / 17 tests passed; TypeScript and focused ESLint passed.
- Task 4 implements local Working Increment assembly, Evidence/Increment/Lineage CLI routes,
  explicit cross-track predecessor validation and offline Evidence foundation acceptance.
- Phase 1 gate: `pnpm check` passed with 346 tests passed and 1 skipped; offline acceptance passed.
- One existing long X Browser integration test received an explicit 15-second budget after it
  reproducibly exceeded the default 5 seconds only under the full parallel suite; isolated behavior passed.
- Next action: re-read the Runtime dependency boundary and execute Phase 2 Task 1 with RED tests.
- Runtime boundary re-verified at local `llm-wiki-runtime` 0.2.0 commit `1ebcb04`;
  its unrelated untracked assessment document was preserved.
- Phase 2 Task 1 verification: 4 test files / 49 tests passed; TypeScript and focused ESLint passed.
- Next action: Task 2 Runtime Profile, fixed Adapter writes and deterministic record renderer RED tests.
- Phase 2 Task 2 verification: 4 test files / 17 tests passed; TypeScript passed.
- Runtime Profile now exposes eleven V2.3 record types, Catalog exact lookup and a 12,000-char
  per-record ceiling while preserving Runtime 0.2.0 and V2.2 record routes.
- Next action: Task 3 deterministic five-view generation Index projector RED tests.
- Phase 2 Task 3 verification: projector + contract suites, 48 tests passed; TypeScript passed.
- Five Views share one deterministic generation; Shards are quarter/budget bounded and content-addressed;
  Catalog contains promoted summaries only and retracted records remain outside Mainline.
- Next action: Task 4 exact Plan/Approval, write-ahead Catalog-last execution and safe resume RED tests.
- Phase 2 Task 4 verification: 5 test files / 14 tests passed; TypeScript and focused ESLint passed.
- Promotion binds one confirmation to the exact reviewed/staged bytes, persists step-start before Runtime calls,
  rechecks the base Catalog under the Track lock and commits Catalog last.
- Register/Catalog uncertainty is terminal pending reconciliation; safe partial writes resume idempotently.
- Phase 2 Task 5 verification: CLI/acceptance suite 3 files / 12 tests passed; Phase 2 gate
  29 files / 147 tests passed.
- Full repository gate: 87 test files passed plus 1 skipped; 377 tests passed plus 1 skipped;
  offline acceptance reported `research_promotion: simulated_complete`.
- Phase 2 completed in commit `6a18180`; one confirmation now governs the exact reviewed/staged
  Promotion Plan, with runtime-required execution/resume and local status inspection.
- Phase 3 Task 1 completed in commit `346d09a`: the Adapter now supports declared exact
  frontmatter lookup and caller-bounded exact path loading while preserving the V2.2 broad Query adapter.
- Task 1 verification: Fake/security/real Runtime suites 3 files / 24 tests passed; TypeScript and lint passed.
- Runtime 0.2.0 scalar `--lookup-value-json` behavior is source- and integration-verified; the Adapter
  accepts the semantic `{ index_id }` lookup and translates it at the process boundary.
- Phase 3 Task 2 completed in commit `2321a4c`: versioned Plan/Snapshot/Review contracts bind
  every selection layer, the fixed memory policy, Working opt-in and explicit full-document intent.
- Task 2 verification: 3 files / 55 tests passed; TypeScript and lint passed. Pure selectors are
  deterministic under shuffled candidates and fail closed above 4 Shards, 12 Records or 6 Chunks.
- Phase 3 Task 3 completed in commit `1d34380`: staged exact traversal verifies Catalog, Shards,
  semantic records, optional Manifests and bounded Chunks before freezing a V2 Context Snapshot.
- Task 3 verification: 6-file combined regression / 20 tests passed before final hardening; final focused
  service/security/package suite 4 files / 12 tests passed; TypeScript and lint passed.
- Runtime unavailable and missing Index remain honest non-broad outcomes; full reconstruction requires
  `full_explicit`, every Manifest Chunk and a matching full-content digest.
- Phase 3 Task 4 completed in commit `22f1d81`: exact-ref Doctor reports healthy, legacy-only or
  rebuild-required state; Rebuild produces a digest-bound approval-required Plan without writing Runtime.
- Task 4 verification: 4 files / 57 tests passed; TypeScript and lint passed. Rebuild generations bind
  the prior Catalog digest so recovery does not collide with corrupt create-only Shard paths.
- Phase 3 Task 5 completed in commit `a81b2fe`: CLI version-dispatches V2.2/V2.3 Query artifacts,
  exposes explicit V2 Review and Index maintenance routes, and statically prohibits broad V2.3 query paths.
- Phase 3 focused gate: 45 files / 227 tests passed. Full `pnpm check`: 96 files passed plus
  1 skipped; 415 tests passed plus 1 skipped; offline acceptance reported
  `progressive_query: simulated_complete` with network unused.
- Phase 4 Task 1 completed in commit `b115fb1`: seven publication channels now assemble into one
  immutable Publication Expression with separate approved intent, terminal observation and Evidence refs.
- Task 1 verification: 4 files / 68 tests passed across contract regression and focused behavior;
  TypeScript and lint passed. Receipt V1/V2/V2.1/X Article dispatch, privacy downgrade, stale bytes,
  claim escalation and public verification conflicts are fail-closed.
- Phase 4 Task 2 completed in commit `18f9219`: write-ahead terminal Hooks now capture Evidence
  idempotently for Package, Article, Plan, Post/X Article Receipt, selected Feedback and Candidate Insight.
- Existing terminal writers persist their own facts before invoking an optional bound Notifier; failures are
  recorded as `evidence_capture_pending` and never rewrite publication/package outcomes.
- The supervised Flywheel proposes `attach_publication` plus a Receipt/verification-bound
  `publication_attached` lifecycle event and data-only next questions, ending at an unapproved Delta.
- Task 2 verification: 10 files / 80 tests passed; TypeScript and lint passed.
- Phase 4 Task 3 completed in commit `7a9c3a4`: V2.2 publication, feedback and insight
  records load through one exact Runtime path and remain supporting-only data.
- Legacy path/digest/content and Runtime sanitization/risk flags are preserved; no mutation API exists,
  and every binding is ineligible for Mainline without an ordinary Import Promotion.
- Task 3 verification: 5 files / 57 tests passed across legacy adapter, contract and V2.2 loop
  regressions; TypeScript and lint passed.
- Phase 4 Task 4 completed in commit `399f786`: a bounded `single_increment` Import captures
  one canonical mother article, one Receipt, Gist lineage and exactly six ordered Thread items.
- Missing per-item IDs/URLs/metrics remain explicit unrecoverable gaps; user assertions stay
  `manual_recorded`. The imported Working Increment and Publication Expression produce a normal
  Semantic Delta that passed Review and generated the existing approval-required Promotion Plan.
- Task 4 verification: 6 files / 68 tests passed across Import, Evidence and contract regression;
  TypeScript and lint passed; all fixtures were local and network-free.
- Phase 4 Task 5 completed: CLI adds terminal-hook status/resume and Import inspect/capture/propose;
  both Skills route Catalog-first Query, terminal Evidence and one exact Promotion confirmation through Harness.
- Operator/architecture docs and a complete bounded Import example are shipped in the deterministic manifest.
- Full `pnpm check` passed: 108 test files / 457 tests, 1 explicit opt-in test skipped; offline
  acceptance executed Promotion crash/resume, Catalog-last, progressive Query Package binding,
  terminal Evidence crash/resume and a next unapproved publication Delta with AC 1–38 mapping.
- Security audit found only intentional secret detectors and documented V2.2 broad-glob compatibility;
  no V2.3 broad Query, credential, user absolute path, real Chrome/X/Wiki access or direct `.llm-wiki` write.
- Verification authority remains `passed-agent-local`; no CI or independent reviewer result is claimed.
- Final Task 5 implementation commit: `304cfa8`.
- Archive: `.llm-wiki/handoff/research-data-flywheel-v2-3-handoff.md`.
