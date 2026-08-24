# Working Context: Research Program Orchestration V2.4

## Flow

- flow_id: `research-program-orchestration-v2-4`
- status: awaiting-next-phase
- active_phase: `phase-2-weekly-cycle-complete`
- active_task: `none`
- active_plan: external plan-suite commit `38a3efb`, Phase 2 Weekly Article Cycle

## Context Handoff

- user_intent: continue the confirmed V2.4 implementation with Phase 2 inline
- active_sources: approved V2.4 design and plan suite, Phase 1 handoff/current source/tests, current V2.3 Query/Package/Article behavior
- active_scope: Weekly Cycle contracts/service, Candidate Set, explicit Human Selection/cancellation, Package V1.2 and claim boundary semantics, four content gates, selected-Brief compiler, local Article finalization, weekly CLI/Article Skill, focused tests and Phase 2 handoff
- read_only_scope: Phase 1 truth/projections, existing V1.0/V1.1 package behavior, V2.3 Query artifacts and `llm-wiki-runtime` 0.2.0
- candidate_scope: none
- excluded_scope: Phase 3–4 Publication Bundle/Outcome/bootstrap, Browser/external writes, Runtime source, automatic Candidate ranking/selection, real publication or Promotion
- current_gate: Scope Lock Gate
- requested_stage_or_bridge: executing-plans with test-driven-development
- constraints: current `main`, inline, no subagents, immutable revisions, closed schemas, deterministic digests, no automatic research choice

## Scope Lock

- locked_active_scope: only files named by Phase 2 Tasks 1–5 plus this Change Brief, working context, verification and Phase 2 handoff
- locked_read_only_scope: Phase 1 sources of truth, V1.0/V1.1 compatibility behavior, V2.3 Query artifacts and Runtime `edge-001`
- locked_candidate_scope: none
- locked_excluded_scope: Phase 3–4 and all external side effects
- accepted_assumptions: target baseline `94f3c9e`; Runtime `1ebcb04` / 0.2.0 remains read-only; external plan-suite commit `38a3efb`; add the two overview-defined port interfaces omitted from the Phase 2 type snippet
- escalation_rule: stop before modifying any excluded/read-only scope or changing an approved public contract

## Implementation Rules

- Execute Phase 2 Task 1 through Task 5 in order.
- Write the failing behavior test before production code and record the expected RED reason.
- Preserve all existing contract names and CLI routes.
- Use `WorkspaceStore` containment, locks, atomic writes, and create-only behavior; do not add bypass APIs.
- Stage and commit only each task's exact pathset.
- Do not generate public bootstrap content, Publication Bundles, Weekly Outcomes or external publication artifacts; Phase 3–4 own them.
- Adapt plan examples to the existing lifecycle method names without bypassing Package/Article state transitions.

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
- Next action: review and explicitly authorize the confirmed Phase 3 Publication Bundle plan before implementation

## Verification Plan

- Task 1: weekly contract/schema tests plus typecheck.
- Task 2: Weekly Cycle behavior, security, recovery and Human Selection tests.
- Task 3: Package V1.2 compatibility, Context binding and partial-order Claim semantics.
- Task 4: selected-Brief compiler, four Gate coverage and Article/X compatibility.
- Task 5: weekly CLI, Article Skill boundary and local finalized-Article integration.
- Final: Phase 2 focused gate, lint, typecheck, repository test, `git diff --check`, verification record and Phase 2 handoff.

## Escalation Log

- 2026-08-23: No scope escalation. External V2.4 plan documents remain temporary local sources; compact lifecycle links are stored here instead of duplicating the full plan suite.
- 2026-08-23: Phase 1 stayed within scope. No Article/X/Browser or Runtime source was modified; no real external write occurred.
- 2026-08-24: User requested continuation. Phase 2 scope activated inline on current `main`; the two overview-defined ports omitted from the task type snippet will be included, with no scope expansion.

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
