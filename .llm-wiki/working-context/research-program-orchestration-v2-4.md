# Working Context: Research Program Orchestration V2.4

## Flow

- flow_id: `research-program-orchestration-v2-4`
- status: plan-ready
- active_phase: `phase-3-publication-bundle-plan`
- active_task: `execution-authorization`
- active_plan: external plan-suite commit `38a3efb`, calibrated by the Phase 3 child Change Brief

## Context Handoff

- user_intent: convert the confirmed Phase 3 design into a source-calibrated implementation plan
- active_sources: confirmed Phase 3 child Change Brief, Phase 2 handoff, current Bundle-adjacent source/tests at `5c07034`
- active_scope: Phase 3 implementation plan and lifecycle linkage only
- read_only_scope: all production source, Phase 1–2 truth/projections, existing X Article and X V2/V2.1 behavior, V2.3 Query artifacts and `llm-wiki-runtime` 0.2.0
- candidate_scope: none
- excluded_scope: Phase 3 implementation, Phase 4 Outcome/bootstrap, Browser/external writes, Runtime source, automatic Candidate ranking/selection, real publication or Promotion
- current_gate: Implementation Confirmation Gate
- requested_stage_or_bridge: executing-plans with test-driven-development after explicit authorization
- constraints: current `main`, design-only, no subagents, no production or test edits, no external side effects

## Scope Lock

- locked_active_scope: Phase 3 child Change Brief, source-calibrated implementation plan and parent lifecycle linkage
- locked_read_only_scope: all production source and tests, Phase 1–2 truth/projections, existing X Article and X V2/V2.1 contracts, V2.3 Query artifacts and Runtime `edge-001`
- locked_candidate_scope: none
- locked_excluded_scope: Phase 3 implementation, Phase 4 and all external side effects
- accepted_assumptions: design source HEAD `5c07034`; confirmed design commit `f44c672`; Runtime `1ebcb04` / 0.2.0 remains read-only; external plan-suite commit `38a3efb`; current child Browser protocols remain unchanged
- escalation_rule: obtain explicit design approval before writing an execution plan, and explicit implementation authorization before modifying production source or tests

## Implementation Rules

- Keep this stage planning-only; do not modify production source, tests, Skills or external systems.
- Treat the current source as authority when it conflicts with examples in the external Phase 3 plan.
- Preserve existing Browser page contracts, Submit barriers, public verification and direct publication compatibility.
- Require create-only execution bindings, a Plan-locked authorization TTL and a rebuildable week-to-Bundle link before Phase 3 can enter implementation planning.
- Execute the source-calibrated plan only after explicit implementation authorization.

## Current Checkpoint

- Repository: `research-publishing-harness`
- Branch: `main`
- Baseline: `94f3c9e`
- Worktree at entry: clean
- Runtime boundary: source-verified read-only at `1ebcb04`, version 0.2.0; unrelated Runtime untracked assessment preserved
- Phase 1 commits: lifecycle `30d801b`; contracts `923d914`; Roadmap `1b75f75`; Backlog `0c58ee6`; Review/Status/CLI `39b8269`
- Verification: focused Phase 1 gate 101/101; final repository test 500 passed, 1 skipped; lint and typecheck exit 0
- Phase 2 entry baseline: `94f3c9e`; worktree clean on `main`; plan reviewed with no blocking concern
- Phase 2 commits: lifecycle `cfc8e9a`; contracts `d5ee69c`; Weekly Cycle Service `bd87bd6`; Package V1.2 `2825454`; Compiler/Gates `753fff6`; CLI/Skill/integration `511ece8`
- Phase 2 verification: focused GREEN 27 files / 206 tests; repository 121 passed + 1 skipped files, 545 passed + 1 skipped tests; lint/typecheck/Skill validator passed
- Phase 2 external effects: none; integration stopped at a finalized local Article Package with empty `x/` and `receipts/`
- Phase 3 design correction: bind Article and Single Browser executions create-only because Article `outcome_unknown` has no Receipt; lock authorization TTL inside the confirmed Bundle Plan.
- Phase 3 child specification: `.llm-wiki/requirements/research-program-orchestration-v2-4-phase-3.md`.
- Phase 3 implementation plan: `.llm-wiki/working-context/research-program-orchestration-v2-4-phase-3-implementation-plan.md`.
- Next action: user explicitly authorizes Phase 3 implementation; then execute inline with TDD checkpoints.

## Verification Plan

- Verify every design claim against current Phase 2, X Article and X V2/V2.1 source/tests.
- Scan the child specification for placeholders, ambiguous ranges, contradictory state transitions and scope leakage.
- Verify the child Flow Record, parent link, implementation authorization flag and next Gate agree.
- Run `git diff --check`; no code tests are claimed for this design-only stage.

## Escalation Log

- 2026-08-23: No scope escalation. External V2.4 plan documents remain temporary local sources; compact lifecycle links are stored here instead of duplicating the full plan suite.
- 2026-08-23: Phase 1 stayed within scope. No Article/X/Browser or Runtime source was modified; no real external write occurred.
- 2026-08-24: User requested continuation. Phase 2 scope activated inline on current `main`; the two overview-defined ports omitted from the task type snippet will be included, with no scope expansion.
- 2026-08-24: Phase 3 design review found that Article `outcome_unknown` has no Receipt and that the external plan did not bind its displayed TTL. The child specification adds create-only child Execution Bindings, a Plan-locked TTL and a week-to-Bundle binding; production implementation remains unauthorized.

## Phase 1 Result

- Immutable Roadmap and Topic revisions are the sources of truth; current/Catalog/Review/Program Status are projections.
- Cadence readiness counts only available Evidence Ready Topics and fails closed below two.
- Monthly cadence uses distinct contained Outcome path/digest refs; engagement does not affect cadence or research progress.
- Ten JSON-only `program` operations are routed without changing existing V1–V2.3 routes.
- Detailed evidence: `.llm-wiki/verification/research-program-orchestration-v2-4-phase-1.md`.
- Continuation handoff: `.llm-wiki/handoff/research-program-orchestration-v2-4-phase-1.md`.

## Phase 2 Result

- Runtime-reviewed Context binds 2–3 immutable Candidate Briefs; only an explicit Human selection can reserve a Topic.
- Package V1.2 adds the six-status Claim Boundary and exact Roadmap/Topic/Candidate Set/Selection lineage without widening V1.0/V1.1.
- Selected-Brief compilation and four pre-publication content Gates end in a structured local Canonical Article Package.
- Six JSON-only Weekly CLI operations and the Article Skill route the same lifecycle; Article finalization is not publication authorization.
- Continuation handoff: `.llm-wiki/handoff/research-program-orchestration-v2-4-phase-2.md`.
