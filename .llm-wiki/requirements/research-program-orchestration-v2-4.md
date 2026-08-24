# Change Brief: Research Program Orchestration V2.4

## Summary

- title: Build the deterministic six-month research program control plane
- status: executing
- phase_1_status: implemented and passed-agent-local
- phase_2_status: implemented and passed-agent-local
- phase_3_status: implemented and passed-agent-local
- phase_4_status: design review pending
- flow_id: `research-program-orchestration-v2-4`

## Why

The repository already has V2.3 evidence, promotion, progressive query, and publication-memory capabilities, but it does not yet have a deterministic Roadmap, Topic Backlog, monthly editorial review, or program status layer that turns the confirmed six-month Enterprise AI Agent Runtime research direction into an auditable weekly operating system.

## What Changes

- Add versioned Research Program policy, Roadmap, Topic, Backlog Catalog, Monthly Editorial Review, and Program Status contracts.
- Add immutable Roadmap and Topic revision services with digest-bound projections and safe recovery.
- Add an Evidence Ready cadence guard without allowing Harness-owned topic selection.
- Add JSON-only `program` CLI routes for Roadmap, Backlog, Monthly Review, and status operations.
- Preserve the distinction between directional planning slots and real weekly Article production.

## Sources

- Approved Enterprise AI Agent Runtime six-month roadmap design, external planning workspace commit `0a6ed18`.
- Confirmed V2.4 implementation plan suite, external planning workspace commit `38a3efb`.
- Phase 1 plan: `2026-08-23-research-program-orchestration-v2-4-phase-1-roadmap-backlog.md` from that suite.
- Current V2.3 source, tests, and `.llm-wiki/requirements/research-data-flywheel-v2-3.md`.

The external planning documents were reviewed as temporary local sources and are not copied into this team-shared Wiki.

## Scope

- active: `harnesses/research-publishing/core/`, Research Program schemas, `harnesses/research-publishing/cli/index.ts`, focused contract/program/security/integration tests, and this flow's Wiki records.
- reference-only: existing V1–V2.3 contracts and services; `llm-wiki-runtime` 0.2.0 through `edge-001`.
- excluded: Phase 4 implementation, public bootstrap, real Browser execution, Runtime source changes, real X/GitHub/Wiki writes, and pre-writing the twenty-four articles.

## Acceptance

1. Five fixed Research Streams, four evidence-gated research windows, twenty-four directional Article Slots, six months, and four monthly layers are validated deterministically.
2. Every Article Slot contains only planning metadata, including a 40–600 code-point `planning_abstract`; no Article body, Evidence Package, Visual Manifest, or Publication Plan is created.
3. Roadmap and Topic revisions are immutable; `current.json`, Backlog Catalog, Monthly Review status, and Program Status are rebuildable projections.
4. Backlog supports `evidence_ready`, `researching`, and `long_term`; cadence readiness counts only available Evidence Ready topics and fails closed below two.
5. Harness never chooses a research topic or changes Stage/Claim state from a calendar date, title, engagement, or publication event.
6. Monthly cadence derives from contained Weekly Outcome refs; secondary signals never affect cadence or research-success booleans.
7. JSON-only Program CLI operations preserve V1–V2.3 behavior.
8. Focused tests, lint, typecheck, and the repository test suite pass before Phase 1 handoff.

## Non-Goals

- No article drafting, visuals, publication planning, X browser execution, or real external write.
- No `llm-wiki-runtime` change or direct `.llm-wiki` write path in Harness code.
- No Failure-derived Trace, Trace-backed Eval, Controlled Loop, or Domain Skill integration implementation.
- No automatic Roadmap revision, Topic selection, Claim promotion, or feedback promotion.

## Plan

- active_plan: external plan-suite commit `38a3efb`, Phase 1 Roadmap and Backlog Foundation
- status: confirmed
- evidence: user explicitly requested `开始 Phase 1 inline 实现` on 2026-08-23
- execution_mode: inline on current `main`; no worktree, branch, or subagent by explicit user decision

## External Dependencies

- project-id: `llm-wiki-runtime`
- edge_id: `edge-001`
- dependency_type: read-only deterministic Runtime CLI dependency inherited from V2.3
- required_contract: Runtime version 0.2.0 at source commit `1ebcb04`; Phase 1 adds no Runtime calls
- evidence: `pyproject.toml` version and current Git HEAD re-read on 2026-08-23
- verification_status: source-verified
- derived_staleness: fresh
- impact_on_change: no remote source or protocol mutation; existing V2.3 boundaries remain reference-only
- fallback_or_handoff: stop and request scope escalation if Phase 1 tests require a Runtime contract change

## Verification Plan

- Follow each Phase 1 task with RED → GREEN → REFACTOR.
- Run the focused Vitest commands named by each task.
- Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` at the Phase 1 gate.
- Run exact-path `git diff --check` before every scoped commit.
- Record verification provenance and residual risk in the Phase 1 handoff.

## Flow Record

| Step | Status | Evidence | Updated |
|---|---|---|---|
| source | done | approved design `0a6ed18` and current V2.3 source/tests | 2026-08-23 |
| design | done | approved six-month roadmap design; Phase 4 design review is tracked by its child Flow | 2026-08-24 |
| plan | done | confirmed plan-suite commit `38a3efb`; Phase 1 selected | 2026-08-23 |
| development | active | Phases 1–3 implemented; Phase 3 commits `e81d604` through `b4b3562`; Phase 4 remains | 2026-08-24 |
| testing | active | Phase 3 passed-agent-local: focused 21 files / 59 tests; repository 141 files / 611 tests passed, 1/1 skipped | 2026-08-24 |
| archive | active | Phase 1–3 handoffs archived; full V2.4 closure remains pending on Phase 4 | 2026-08-24 |

## Open Questions

- Phase 4 written design awaits explicit review. Implementation planning and development remain unauthorized; public bootstrap and Runtime protocol changes are excluded.

## Notes

- The research execution clock is evidence-gated; week ranges are target windows only.
- Roadmap bootstrap stores titles and short planning abstracts, not twenty-four finished articles.
- Phase 1 is complete within its locked scope. Monthly Review verifies contained opaque Outcome bytes in this phase; Phase 4 owns Outcome schema and Roadmap/month/cycle binding.
- Phase 2 is authorized from the confirmed plan-suite commit `38a3efb`. It owns Weekly Cycle, 2–3 Candidate Briefs, explicit Human Selection, Research Content Package V1.2, four pre-publication content gates, local Article finalization, weekly CLI and the Article Skill route.
- Phase 2 does not own Publication Bundle approval/execution, Browser writes, Weekly Outcome, Memory Promotion, public bootstrap content, or Runtime source changes.
- Phase 2 is complete within that boundary. It delivered Weekly Cycle, explicit Human Selection/cancellation, Package V1.2, selected-Brief compilation, four local content Gates, structured Article finalization, CLI and Skill orchestration.
- Phase 3 source-calibrated child specification is confirmed: `.llm-wiki/requirements/research-program-orchestration-v2-4-phase-3.md`. The user authorized inline implementation on 2026-08-24.
- Phase 3 is complete within its local deterministic boundary: one exact Bundle confirmation derives Article-first child approvals, binds both executions before continuation, materializes only a publicly verified X Article URL, and ends in a joint Receipt while Weekly status remains `publication_planned`.
- Phase 3 continuation handoff: `.llm-wiki/handoff/research-program-orchestration-v2-4-phase-3.md`.
- Phase 4 proposed child design: `.llm-wiki/requirements/research-program-orchestration-v2-4-phase-4.md`. It treats AI as a research partner, separates Outcome facts from generated Synthesis, keeps Topic/Roadmap flexible and reuses the existing confirmed Promotion boundary.
