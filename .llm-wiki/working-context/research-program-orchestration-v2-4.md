# Working Context: Research Program Orchestration V2.4

## Flow

- flow_id: `research-program-orchestration-v2-4`
- status: executing
- active_phase: `phase-1-roadmap-backlog`
- active_task: `lifecycle-anchor-and-context-recovery`
- active_plan: external plan-suite commit `38a3efb`, Phase 1

## Context Handoff

- user_intent: implement the confirmed Phase 1 inline
- active_sources: approved V2.4 design and plan, current V2.3 source/tests, V2.3 Change Brief and verification record
- active_scope: Research Program policy/contracts/schemas, Roadmap service, Backlog service, Monthly Review, Program Status, Program CLI, focused tests, current flow Wiki records
- read_only_scope: existing V1–V2.3 behavior and `llm-wiki-runtime` 0.2.0
- candidate_scope: none
- excluded_scope: Phase 2–4, Article/X/Browser modifications, Runtime source, real external writes, article bodies/assets/publication plans
- current_gate: Scope Lock Gate
- requested_stage_or_bridge: executing-plans with test-driven-development
- constraints: current `main`, inline, no subagents, immutable revisions, closed schemas, deterministic digests, no automatic research choice

## Scope Lock

- locked_active_scope: only files named by Phase 1 Tasks 1–4 plus this Change Brief, working context, and Phase 1 handoff
- locked_read_only_scope: V1–V2.3 source/tests and Runtime `edge-001`
- locked_candidate_scope: none
- locked_excluded_scope: Phase 2–4 and all external side effects
- accepted_assumptions: target baseline `2f581c1`; Runtime `1ebcb04` / 0.2.0; external plan-suite commit `38a3efb`
- escalation_rule: stop before modifying any excluded/read-only scope or changing an approved public contract

## Implementation Rules

- Execute Task 1 through Task 4 in order.
- Write the failing behavior test before production code and record the expected RED reason.
- Preserve all existing contract names and CLI routes.
- Use `WorkspaceStore` containment, locks, atomic writes, and create-only behavior; do not add bypass APIs.
- Stage and commit only each task's exact pathset.
- Do not generate the public twenty-four-slot bootstrap content in Phase 1; Phase 4 owns it.

## Current Checkpoint

- Repository: `research-publishing-harness`
- Branch: `main`
- Baseline: `2f581c1`
- Worktree at entry: clean
- Runtime boundary: source-verified read-only at `1ebcb04`, version 0.2.0; unrelated Runtime untracked assessment preserved
- Next action: inspect current contract/schema patterns, then begin Task 1 with failing tests

## Verification Plan

- Task 1: contract tests plus typecheck.
- Task 2: Roadmap and workspace containment tests.
- Task 3: Backlog behavior/security tests plus typecheck.
- Task 4: monthly review, CLI, integration, lint, typecheck, and full test suite.
- Final: `git diff --check`, scoped status audit, verification record, and Phase 1 handoff.

## Escalation Log

- 2026-08-23: No scope escalation. External V2.4 plan documents remain temporary local sources; compact lifecycle links are stored here instead of duplicating the full plan suite.
