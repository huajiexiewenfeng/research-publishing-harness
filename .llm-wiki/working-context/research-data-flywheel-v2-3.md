# Working Context: Research Data Flywheel V2.3

## Flow

- flow_id: `research-data-flywheel-v2-3`
- status: in-progress
- active_phase: `phase-1-evidence-foundation`
- active_task: `task-2-evidence-object-store`
- active_plan: `docs/superpowers/plans/2026-08-22-research-data-flywheel-v2-3-phase-1-evidence-foundation.md`

## Scope Lock

- active: V2.3 policy/types/contracts/lifecycle, Evidence Object Store, canonical document projection, increment assembly, Phase 1 CLI/tests.
- read-only: V2.2 implementation and `llm-wiki-runtime` source referenced by `edge-001`.
- excluded: Phase 2–4 production behavior until Phase 1 gate passes.

## Implementation Rules

- Inline on current `main` by explicit user authorization and standing preference.
- No subagents.
- Test-first for every production behavior.
- Preserve V2.2 schema and runtime behavior.
- Phase 1 never invokes Runtime writes and never writes `.llm-wiki` research storage.
- Use `research-memory-policy/v1` fixed values from the approved overview.

## Current Checkpoint

- Baseline commit: `20aea25`.
- Change Brief created before production edits.
- Task 1 verification: 4 test files / 45 tests passed; TypeScript and focused ESLint passed.
- Next action: write Task 2 Evidence Object Store and capture-service failing tests.
