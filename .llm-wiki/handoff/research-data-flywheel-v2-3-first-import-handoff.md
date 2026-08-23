# Research Data Flywheel V2.3 First Import Handoff

- flow_id: `research-data-flywheel-v2-3-first-import`
- development: `done`
- testing: `passed-agent-local`
- archive: `done`

## Result

Before the first real legacy Import, the Manifest contract was corrected so historical Thread publication time is independent from the current import time. Publication Expression and publication Index records now preserve `thread.published_at`; lifecycle/update timestamps continue to use `imported_at`.

## Evidence

- Bug Brief: `.llm-wiki/bugs/2026-08-23-import-publication-time-binding.md`
- Focused RED then GREEN: `tests/memory/research-import-service.test.ts`, `tests/security/research-import-security.test.ts`
- Fresh full verification: `pnpm check`, exit 0; 108 test files / 458 tests passed, 1 opt-in skipped; AC1–38 offline acceptance; `network: unused`.
- Test integrity: real schema, WorkspaceStore, service persistence, Delta and Index output exercised; no behavior mocks.

## Boundary

The code fix is ready for the real first-Increment Import. Import capture/proposal may create local Harness evidence, but Runtime Promotion still requires the exact reviewed Promotion Plan confirmation.

## Residual Risk

The supplied historical timestamp retains its source classification; preserving it does not independently prove it.
