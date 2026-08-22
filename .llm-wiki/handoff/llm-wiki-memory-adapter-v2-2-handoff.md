# LLM Wiki Memory Adapter V2.2 Handoff

## Result

- flow_id: `llm-wiki-memory-adapter-v2-2`
- branch: `main` (inline by explicit user decision; normal repository, no worktree)
- implementation commits: `f8cc624` through `76992a7`, plus this Task 8 verification closeout
- status: implemented and verified agent-locally
- trust: `passed-agent-local`; no CI or independent reviewer authority claimed

## Delivered

- Research Content Package 1.1 with immutable reviewed memory provenance and 1.0 compatibility.
- `research-publishing` Profile/SCP/Mapping and per-`research_track` Query scope.
- Restricted `llm-wiki-runtime` 0.2.0 Adapter with fixed executable/argv, JSON protocol, timeout/output cap and honest Query degradation.
- Receipt-bound Human-selected Feedback Snapshot, typed Candidate Insight and immutable Evidence Review.
- `publication_checkpoint` and `feedback_insight` preview/Plan/exact Approval/write sequence/Receipt.
- Stepwise recovery for confirmed or idempotent work, plus fail-closed reconciliation for uncertain non-idempotent artifact registration.
- Complete CLI surface, Article/X Skill routing, registry/manifest, offline acceptance, Quickstart and architecture updates.

## Verification

- `pnpm check`: lint/typecheck/build, 69 test files / 297 tests and offline acceptance passed; one explicit-path real Runtime test skipped by default.
- explicit local Runtime 0.2.0 integration: 1/1 passed in a disposable temporary Workspace.
- acceptance: Query, checkpoint, feedback insight and resume all `simulated_complete`; `network:"unused"`.
- deterministic manifest: 112 files; `git diff --check` passed.
- detailed evidence: `.llm-wiki/verification/llm-wiki-memory-adapter-v2-2.md`.
- wiki doctor: unavailable because `.llm-wiki/tools/llm_wiki_doctor.py` is absent; no doctor result claimed.

## Runtime Compatibility Findings

- Runtime 0.2.0 accepts only controlled excerpt fields in `copy-source.metadata`; Harness keeps complete ingest provenance in its immutable source bundle and passes no unsupported metadata.
- Runtime validates every `write-record.source_id` against its source registry. Harness deterministically freezes the Runtime-equivalent `src-<checksum-prefix>` in the approved Plan.
- Runtime 0.2.0 emits raw 64-character checksums. The Adapter canonicalizes them to the Harness `sha256:<hex>` Digest contract for copy/write envelopes and Query items.
- Runtime `register-artifact` has no idempotency key. An uncertain result never auto-replays; the operator must inspect the artifact index and then choose a separately designed reconciliation action.

## Continuation

- Persistent Workspace initialized at `D:\workspaces\research-publishing`; `research-publishing` Domain and `memory doctor` are enabled/healthy.
- First empty Query, exact Human-approved publication checkpoint, partial/resume and loaded next Query completed.
- Continue with Human-reviewed Context selection for the next Package 1.1 or capture explicitly selected public feedback before proposing Candidate Insights.
- No push, PR or real X action was performed. One exact Human-approved checkpoint was written through Runtime to the dedicated Publishing Workspace.
