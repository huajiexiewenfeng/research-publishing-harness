# Working Context: LLM Wiki Memory Adapter V2.2

## Flow

- flow_id: `llm-wiki-memory-adapter-v2-2`
- status: done
- active_plan: `docs/superpowers/plans/2026-08-22-llm-wiki-memory-adapter-v2-2.md`

## Context Summary

- The approved design requires the complete Query → Package → Publication → Feedback/Insight → Approved Ingest → Next Query loop.
- Existing Package schema 1.0 is strict and immutable; V2.2 adds explicit 1.1 dispatch.
- Existing `WorkspaceStore` has a top-level allow-list and must add `memory`, while continuing to reject `.llm-wiki`.
- Runtime dependency `edge-001` is source-verified against `llm-wiki-runtime` 0.2.0 commit `1ebcb04b9cb6ecd129af0386f59e469a2f2853ac`.
- Runtime input is fixed argv JSON/staging files and stdout JSON envelope; no shell or direct Wiki access is allowed.
- Current work executes inline on `main` by explicit user request and standing branch preference; no subagents.

## Scope Lock

- active: Contracts/Core/Memory Adapter/Package/Feedback/Ingest/CLI/Article and X Skills/tests/docs/registry/project lifecycle.
- read-only: remote Runtime source and stable contracts.
- excluded: automatic monitoring, vector/semantic search, autonomous Ingest, cross-Domain writes, daemon/cloud/team sync, post-freeze mutation and X API analytics.

## Verification Strategy

- One RED/GREEN cycle per implementation task.
- Fake process tests isolate the external Runtime process only; core digests, state, approvals and recovery use real Harness code.
- Real Runtime integration uses an explicit Python executable/source and a temporary Publishing Workspace.
- Completion requires `pnpm check`, real Runtime integration, `git diff --check`, 22-item evidence audit and clean worktree.

## External Dependency

- project_id: `llm-wiki-runtime`
- edge_id: `edge-001`
- status: source-verified, fresh
- expected_version: `0.2.0`
- fallback: Query records unavailable; Ingest fails closed; no direct-write fallback.

## Completion Evidence

- `pnpm check`: exit 0; lint/typecheck/build, 69 test files / 296 tests passed, one opt-in real Runtime test skipped, offline acceptance passed.
- explicit Runtime integration: Python module mode against `llm-wiki-runtime` 0.2.0 source, isolated temporary Workspace, 1/1 passed.
- acceptance: Query, publication checkpoint, feedback insight and resume all `simulated_complete`; `network: unused`.
- deterministic manifest: 112 files; `git diff --check` exit 0.
- detailed audit: `.llm-wiki/verification/llm-wiki-memory-adapter-v2-2.md`.

## Residual Boundary

- Runtime 0.2.0 `register-artifact` is not idempotent. If interruption leaves that step active with no confirmed result, Harness stops with `MEMORY_INGEST_RECONCILIATION_REQUIRED` and never blindly replays it.
- A real persistent Publishing Workspace has not been chosen or initialized; this remains a separate Human-authorized action.
