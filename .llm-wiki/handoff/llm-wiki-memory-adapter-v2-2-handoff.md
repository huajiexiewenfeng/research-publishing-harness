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

- `pnpm check`: lint/typecheck/build, 69 test files / 296 tests and offline acceptance passed; one explicit-path real Runtime test skipped by default.
- explicit local Runtime 0.2.0 integration: 1/1 passed in a disposable temporary Workspace.
- acceptance: Query, checkpoint, feedback insight and resume all `simulated_complete`; `network:"unused"`.
- deterministic manifest: 112 files; `git diff --check` passed.
- detailed evidence: `.llm-wiki/verification/llm-wiki-memory-adapter-v2-2.md`.
- wiki doctor: unavailable because `.llm-wiki/tools/llm_wiki_doctor.py` is absent; no doctor result claimed.

## Runtime Compatibility Findings

- Runtime 0.2.0 accepts only controlled excerpt fields in `copy-source.metadata`; Harness keeps complete ingest provenance in its immutable source bundle and passes no unsupported metadata.
- Runtime validates every `write-record.source_id` against its source registry. Harness deterministically freezes the Runtime-equivalent `src-<checksum-prefix>` in the approved Plan.
- Runtime `register-artifact` has no idempotency key. An uncertain result never auto-replays; the operator must inspect the artifact index and then choose a separately designed reconciliation action.

## Continuation

- Choose a dedicated persistent Publishing Workspace outside this repository.
- Use `llm-wiki-core` / `llm-wiki-init` to initialize the `research-publishing` Domain with explicit Human consent.
- Run `memory doctor` with explicit Runtime executable/launcher, then perform the first real Query.
- The first real Ingest must still show `preview.md` and the exact Plan digest for one Human Approval; this handoff does not authorize it.
- No push, PR, real X action or user-Wiki write was requested or performed.
