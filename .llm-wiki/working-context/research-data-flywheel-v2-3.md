# Working Context: Research Data Flywheel V2.3

## Flow

- flow_id: `research-data-flywheel-v2-3`
- status: in-progress
- active_phase: `phase-2-promotion-index`
- active_task: `phase-2-task-2-runtime-projection`
- active_plan: `docs/superpowers/plans/2026-08-22-research-data-flywheel-v2-3-phase-2-promotion-index.md`

## Scope Lock

- completed: Phase 1 policy/contracts/lifecycle, Evidence Object Store, canonical document projection,
  local Working Increment assembly and CLI/acceptance coverage.
- active: Phase 2 Semantic Delta, reviewed promotion, Runtime-backed immutable records and Catalog-last Index visibility.
- read-only: V2.2 implementation and `llm-wiki-runtime` source referenced by `edge-001`.
- excluded: Phase 3 Progressive Query and Phase 4 Publication Flywheel until their preceding gates pass.

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
