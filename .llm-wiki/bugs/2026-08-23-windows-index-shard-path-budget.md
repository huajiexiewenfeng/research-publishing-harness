# Bug Brief: Windows Index Shard Path Budget

## Identity

- bug_id: `windows-index-shard-path-budget-2026-08-23`
- flow_id: `research-data-flywheel-v2-3-first-import`
- status: fixed-and-verified-agent-local
- discovered_at: 2026-08-23

## Symptom and Reproduction

- Confirmed Promotion wrote all six immutable semantic records, then stopped safely at `write_index_shards` with `MEMORY_RUNTIME_FAILED`.
- Catalog was not committed; default Query visibility remains unchanged.
- Isolated Runtime reproduction returned `io_error` for the atomic temporary shard path.
- Real final shard path length is 259 characters; Runtime atomic temporary path is approximately 296 characters on Windows.

## Expected Behavior

Content-addressed shard paths must retain track/generation/view isolation and digest identity while leaving enough Windows path budget for Runtime atomic-write suffixes.

## Scope

- active: shard path projection, packaged Profile path template, contract tests and operational documentation
- read-only external: pinned Runtime atomic-write behavior
- excluded: OS registry long-path changes, Runtime source changes, direct Wiki writes, mutation of the confirmed Plan

## Root Cause

The shard path redundantly included `indexes/generations`, `shards`, `shard_id`, and the full digest. With the real Workspace root and Runtime `.uuid.tmp` suffix, the path exceeded the Windows legacy 260-character boundary.

## Fix Plan

1. Add a failing Windows atomic-path budget regression.
2. Shorten the canonical shard path to keep track, generation, view, and digest while removing redundant segments.
3. Update the packaged Profile contract and projector together.
4. Run focused/full verification and isolated Runtime write.
5. Generate a new Plan; the old Approval must remain stale and must not be resumed.

## Verification Plan

- Focused projector/domain-contract tests pass with an explicit 48-character Runtime-root plus 37-character atomic-suffix budget.
- Full `pnpm check` passes.
- Isolated Runtime writes a real projected shard successfully.
- A new Plan requires a new exact user confirmation before Runtime execution.

## Fix

- Shortened the content-addressed shard path to `domains/research-publishing/tracks/{research_track}/i/{generation}/{view}/{digest_hex}.md`.
- Removed redundant `indexes/generations`, `shards`, and filename `shard_id` segments; shard identity remains in frontmatter while track/generation/view/digest remain in the path.
- Updated the Projector and packaged Runtime Profile in lockstep.
- Backed up the previous active Profile and refreshed the Runtime snapshot atomically.

## Verification

- RED: focused regression measured 301 characters against a 260-character Windows atomic-write budget.
- GREEN: projector/Profile/Promotion tests passed 11/11; new budget is within 260 for a 48-character Runtime root plus 37-character atomic suffix.
- Isolated real Runtime write succeeded at the shortened path with the planned shard checksum.
- Fresh `pnpm check`: 108 test files / 459 tests passed, one opt-in skipped; AC1–38 offline acceptance passed with `network: unused`.
- Active/packaged Profile SHA-256: `21fa376879323e04bc9f184f66eab45582af290287b36969f542e29b06cda894`.
- Harness `memory doctor`: healthy against Runtime `0.2.0`.
- Trust level: `passed-agent-local` plus isolated real Runtime write.

## Residual Risk

Workspaces with Runtime roots longer than the explicit 48-character regression budget may still require OS long-path support or a shorter workspace root.
