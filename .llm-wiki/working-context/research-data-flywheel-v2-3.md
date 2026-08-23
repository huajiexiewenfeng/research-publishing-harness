# Working Context: Research Data Flywheel V2.3

## Flow

- flow_id: `research-data-flywheel-v2-3`
- status: in-progress
- active_phase: `phase-3-progressive-query`
- active_task: `phase-3-task-3-progressive-query-service`
- active_plan: `docs/superpowers/plans/2026-08-22-research-data-flywheel-v2-3-phase-3-progressive-query.md`

## Scope Lock

- completed: Phase 1 policy/contracts/lifecycle, Evidence Object Store, canonical document projection,
  local Working Increment assembly and CLI/acceptance coverage.
- completed: Phase 2 Semantic Delta, reviewed promotion, Runtime-backed immutable records and Catalog-last Index visibility.
- active: Phase 3 Catalog-first progressive query and exact Runtime reads.
- read-only: V2.2 implementation and `llm-wiki-runtime` source referenced by `edge-001`.
- excluded: Phase 4 Publication Flywheel until the Phase 3 gate passes.

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
- Next action: Phase 3 Task 3 staged progressive Query service and reviewed Package binding.
