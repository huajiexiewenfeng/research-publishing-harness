# Bug Brief: Import Source Reference Deduplication

## Identity

- bug_id: `import-source-ref-deduplication-2026-08-23`
- flow_id: `research-data-flywheel-v2-3-first-import`
- status: fixed-and-verified-agent-local
- discovered_at: 2026-08-23

## Symptom and Reproduction

- Real `memory import inspect` succeeded with no blocking gaps.
- `memory import capture` stopped before Evidence creation with `research-evidence-snapshot: /source_refs must NOT have duplicate items`.
- Import had canonical Gist and Thread URLs in `increment.source_refs`; Capture prepended the same two URLs again.
- The Import Manifest and gap report were written locally; no Evidence Snapshot, Delta, Review, Promotion Plan, Runtime write, or X action occurred.

## Expected Behavior

Capture must preserve the ordered union of canonical Gist URL, Thread root URL, and Increment source refs without emitting duplicate contract values.

## Scope

- active: `ResearchImportService.capture`, Import fixture and focused regression test
- read-only: partially captured local Import directory in the Publishing Workspace
- excluded: input data deletion, Runtime source, Review/Promotion execution

## Root Cause

`source_refs` was constructed by raw array concatenation. The Import Manifest allows Increment-level provenance to include the same canonical URLs owned by the publication fields, while the Evidence Snapshot contract correctly requires uniqueness.

## Fix Plan

1. Reproduce with canonical URLs repeated in `increment.source_refs`.
2. Deduplicate the combined ordered source refs at the service boundary.
3. Verify focused and full checks, then resume Capture using the same digest-bound Import ID.

## Verification Plan

- Focused Import test must fail before the fix with the observed duplicate-items error.
- After the fix, assert the exact ordered unique source refs.
- Run full `pnpm check` before resuming the real Capture.

## Fix

- Construct Evidence `source_refs` as an insertion-ordered set across Gist URL, Thread root URL, and Increment source refs.
- Preserve the canonical publication URLs first and retain every additional unique Increment source.

## Verification

- RED: focused Import test reproduced the real duplicate-items contract failure.
- GREEN: focused Import suite passed 3/3 and asserted the exact ordered unique refs.
- Test-integrity check: the regression traverses the real Import and Evidence services plus schema validation and WorkspaceStore; no behavior mock is involved.
- Fresh `pnpm check` passed lint, typecheck, build, 108 test files / 458 tests, one opt-in skip, and offline AC1–38 acceptance with `network: unused`.
- Trust level: `passed-agent-local`.

## Residual Risk

None beyond the existing source classifications; ordered-set normalization changes representation only and does not strengthen evidence.
