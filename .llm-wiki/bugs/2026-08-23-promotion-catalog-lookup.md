# Bug Brief: Promotion Catalog Lookup

## Identity

- bug_id: `promotion-catalog-lookup-2026-08-23`
- flow_id: `research-data-flywheel-v2-3-first-import`
- status: resolved-and-verified-runtime-local
- discovered_at: 2026-08-23

## Symptom and Reproduction

- Corrected Import Delta and Review were created successfully.
- `memory promotion plan` stopped during the read-only Runtime Catalog lookup with `MEMORY_RUNTIME_PROTOCOL_ERROR: Runtime record lookup was not exact`.
- No Promotion Plan, Approval, Runtime write, or X action was created.

## Expected Behavior

The Adapter must interpret the pinned Runtime 0.2.0 exact `research_index_catalog` lookup correctly and either return exactly one current Catalog or an honest not-found result.

## Scope

- active: Runtime lookup envelope diagnosis; Adapter only if current source evidence proves a compatibility defect
- read-only external: local pinned `llm-wiki-runtime` 0.2.0 and Publishing Workspace Catalog records
- excluded: Runtime source edits, direct Wiki repair, Promotion execution

## Evidence / Reproduction Status

- Harness error is reproduced through the real CLI and real Publishing Workspace.
- Raw Runtime envelope is `validation_error: record lookup is not declared: research_index_catalog`.
- No Catalog file currently exists, so duplicate cardinality is not the cause.
- Packaged V2.3 Profile declares `research_index_catalog` write and lookup rules.
- Active Workspace `.llm-wiki/.meta/profile.yml` is the older V2.2 snapshot and lacks all V2.3 rules.

## Root Cause

The durable Publishing Workspace was initialized during V2.2 and its active Profile snapshot was not refreshed after V2.3 shipped. Plan generation correctly consulted the Runtime’s active snapshot, not the newer packaged file.

## Fix Plan

1. Preserve the old Profile snapshot as a versioned local backup.
2. Refresh the active snapshot atomically through Runtime `init-profile` using the packaged V2.3 Profile.
3. Re-run Runtime lookup/doctor and retry Plan generation without executing Promotion.

## Verification Plan

- Exact Runtime lookup must change from undeclared validation error to `not_found` for the first Catalog.
- Runtime doctor and real Plan generation must succeed before asking for confirmation.

## Resolution

- Preserved the old V2.2 snapshot at `memory/runtime/profile-snapshots/research-publishing-v2.2-before-v2.3-4759ed1f.yml` with SHA-256 `4759ed1f148d6a8fb66a7c022fc2bfe351670217b54464210cea60f697424676`.
- Refreshed the active snapshot atomically through Runtime `init-profile`, preserving scope id `research-publishing-main`.
- Runtime recorded `profile_snapshot_refreshed`; active and packaged Profile bytes now share SHA-256 `ff4a6926abe263b850cb067b1d1f80f85421d1ae0ed24fe96ca7ef23bc8f8e6e`.

## Verification

- Exact `research_index_catalog` lookup now returns `not_found` with zero matches, the correct first-Catalog state.
- Harness `memory doctor` returns `status: ok`, Runtime `0.2.0`, configured Profile and Mapping.
- Real Promotion Plan generation succeeded and stopped before Approval/execute.
- Plan id: `promotion_plan_d48de57241b34ea5981bd69629d38ea7`.
- Plan digest: `sha256:00652a0191193e044d28ef0697152879867817ac8979fd9ea7801af16545d8d6`.

## Residual Risk

Profile refresh is currently an explicit operational migration step; Harness Doctor does not yet auto-refresh durable Runtime snapshots.
