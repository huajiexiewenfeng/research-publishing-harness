# Change Brief: Research Data Flywheel V2.3

## Summary

- title: Build an evidence-backed research increment graph and governed publication flywheel
- status: in-progress
- flow_id: `research-data-flywheel-v2-3`
- parent_flow_id: `llm-wiki-memory-adapter-v2-2`

## Why

V2.2 can audit publication and selected feedback, but it cannot represent the research question, claims, canonical article evidence, immutable evolution, publication derivations, or bounded progressive retrieval as one governed research increment.

## What Changes

- Add immutable Research Increment revisions, Claims, Decisions, Open Questions, Evolution Edges and Lifecycle Events.
- Capture finalized local artifacts into a content-addressed Evidence Plane.
- Project approved canonical text into deterministic Manifest/Chunks.
- Add Human-reviewed Semantic Delta and one-confirmation Promotion with Catalog-last visibility.
- Replace broad V2.2 body loading for V2.3 with Catalog → Shard → exact record → bounded Chunk retrieval.
- Connect Article/X/Gist/GitHub expressions and selected feedback to the same Increment.

## Scope

- active: Phase 1 files listed in `docs/superpowers/plans/2026-08-22-research-data-flywheel-v2-3-phase-1-evidence-foundation.md`.
- read-only: current V2.2 contracts and `llm-wiki-runtime` 0.2.0 via source-verified `edge-001`.
- candidate: none.
- excluded for current phase: Promotion/Index, Progressive Query, Publication Flywheel and historical import.

## Non-Goals

- No vector database or replacement knowledge runtime.
- No automatic semantic promotion, claim strengthening, code/Skill modification or publication.
- No direct Harness/Skill writes to `.llm-wiki/**`.
- No broad default research-directory body load.
- No silent bulk migration of historical content.

## Acceptance Criteria

1. Canonical Package remains the first-class fact source and all persistent paths are workspace-relative.
2. Research Increment uses stable identity plus immutable revision.
3. Evidence Snapshot preserves verified text/binary bytes in content-addressed objects.
4. Approved canonical text has deterministic create-only Manifest/Chunks and lossless normalized reconstruction.
5. Evidence Capture is separate from semantic Promotion; Working is not default-queryable.
6. Lifecycle uses monotonic sequence and previous-event chain; publication/supersede/retract do not mutate revisions.
7. Default Track is `enterprise-agent-runtime`; side tracks are isolated and cross-track relationships explicit.
8. V2.2 contracts, tests and CLI behavior do not regress.
9. Later phases satisfy the approved design AC 8–35 and 37 through their linked plans.

## Active Sources

- `docs/superpowers/specs/2026-08-22-research-data-flywheel-v2-3-design.zh-CN.md`
- `docs/superpowers/plans/2026-08-22-research-data-flywheel-v2-3-overview.md`
- `docs/superpowers/plans/2026-08-22-research-data-flywheel-v2-3-phase-1-evidence-foundation.md`
- Current source and tests under `harnesses/research-publishing/` and `tests/`.

## External Dependencies

- project_id: `llm-wiki-runtime`
- edge_id: `edge-001`
- scope: read-only
- required_contract: Runtime 0.2.0 JSON CLI and Profile/SCP/Mapping behavior
- verification_status: source-verified at the current V2.2 boundary; re-read current source before Phase 2/3 Adapter changes
- impact: Phase 1 writes only Harness-local Evidence and does not call Runtime writes

## Plan

- suite: `docs/superpowers/plans/2026-08-22-research-data-flywheel-v2-3-overview.md`
- active_plan: `docs/superpowers/plans/2026-08-22-research-data-flywheel-v2-3-phase-1-evidence-foundation.md`
- execution_mode: inline on current `main`, explicitly authorized by the user

## Verification Plan

- Per-task RED → GREEN → REFACTOR with focused Vitest commands.
- Phase 1 contract, memory, security, CLI and integration suites.
- `pnpm typecheck`, `pnpm lint`, then `pnpm check` at the Phase gate.
- `git diff --check`, clean worktree and requirements/verification sync through `project-finish`.

## Flow Record

| Step | Status | Evidence | Updated |
|---|---|---|---|
| source | done | approved V2.3 design and current V2.2 source/tests | 2026-08-23 |
| design | done-approved | design commit `1948aeb`; user confirmation recorded in the spec | 2026-08-23 |
| plan | done | plan-suite commit `20aea25` | 2026-08-23 |
| development | in-progress | Phase 1 Task 1 starting with TDD | 2026-08-23 |
| testing | pending | focused RED/GREEN and Phase 1 gate | 2026-08-23 |
| archive | pending | verification and handoff after all V2.3 phases | 2026-08-23 |
