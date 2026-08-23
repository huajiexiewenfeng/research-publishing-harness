# Bug Brief: Import Publication Time Binding

## Identity

- bug_id: `import-publication-time-binding-2026-08-23`
- flow_id: `research-data-flywheel-v2-3-first-import`
- status: fixed-and-verified-agent-local
- discovered_at: 2026-08-23

## Symptom and Reproduction

- The V2.3 Import Manifest carries only `imported_at` at the top level.
- `ResearchImportService.createExpression()` writes that value into `PublicationExpression.published_at`.
- Publication Index records also derive `published_at` from the same import timestamp.
- A real legacy Receipt preserves an earlier actual X publication timestamp, so importing it would silently rewrite publication history.

## Expected Behavior

Import time and historical publication time are independent facts. The Manifest must carry the Thread publication timestamp explicitly; Publication Expression and publication Index records must preserve it, while import lifecycle and update timestamps continue to use `imported_at`.

## Scope

- active: Import Manifest type/schema/examples/fixtures, `ResearchImportService`, focused Import tests and documentation
- read-only: existing legacy Receipt and real first-Increment source artifacts
- excluded: Runtime source, Promotion execution, direct `.llm-wiki` Runtime records

## Root Cause

The initial V2.3 Import contract overloaded `imported_at` for both historical publication and current import activity. The helper used for Index records also accepted one timestamp for update, acceptance, and publication semantics.

## Fix Plan

1. Add required `thread.published_at` with `date-time` validation.
2. Add a regression test that fails while Publication Expression and Index use `imported_at`.
3. Bind expression and publication Index `published_at` to `thread.published_at`; preserve `imported_at` for import lifecycle/update fields.
4. Update fixtures, example Manifest, and operator guidance.

## Verification Plan

- Watch focused regression and schema tests fail for the expected timestamp mismatch/missing field.
- Run focused tests after the minimal fix.
- Run full `pnpm check` before committing or using the contract for the real Import.

## Fix

- Added required `thread.published_at` to the TypeScript and JSON Schema contracts.
- Bound Publication Expression and publication Index `published_at` to the historical Thread timestamp.
- Kept lifecycle `occurred_at` plus Index `updated_at` and `accepted_at` bound to `imported_at`.
- Updated the fixture, complete example Manifest, and operator guide.

## Verification

- RED: focused Import tests failed because the old schema rejected `/thread/published_at`.
- GREEN: focused Import/security suite passed 7/7 after the contract and service change.
- Test-integrity check: assertions traverse real schema validation, WorkspaceStore persistence, Delta construction, and Publication Index output; no behavior was mocked.
- Fresh `pnpm check` passed lint, typecheck, build, 108 test files / 458 tests, one explicit opt-in test skipped, and offline AC1–38 acceptance with `network: unused`.
- Trust level: `passed-agent-local`.

## Residual Risk

Historical publication time remains evidence-classified by the supplied source; this fix preserves the supplied fact but does not independently prove it.
