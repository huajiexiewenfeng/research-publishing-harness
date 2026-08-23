# Research Data Flywheel V2.3 First Import Handoff

- flow_id: `research-data-flywheel-v2-3-first-import`
- development: `done`
- testing: `passed-agent-local`
- archive: `done`

## Result

Before the first real legacy Import, the Manifest contract was corrected so historical Thread publication time is independent from the current import time. Publication Expression and publication Index records now preserve `thread.published_at`; lifecycle/update timestamps continue to use `imported_at`.

The first real Capture then exposed duplicate provenance refs when canonical Gist/Thread URLs also appeared in Increment sources. Capture now emits their insertion-ordered union. The partial attempt created only the local Import Manifest/gap report and stopped before Evidence, Delta, Review, Promotion, Runtime, or X effects.

Semantic Review of the first unapproved Delta then found that X Thread intended content pointed to the mother article rather than the content-bearing Import Manifest. The binding is corrected and verified; the first Delta remains unreviewed/unapproved as audit evidence and must be superseded before Promotion.

The corrected V2 Delta was reviewed with all six operations retained. Initial Plan generation exposed a stale V2.2 active Runtime Profile; it was backed up and atomically refreshed to the packaged V2.3 Profile. Runtime lookup/doctor then passed and the exact Plan was generated. Work is stopped at the one-confirmation gate.

The user confirmed Plan `sha256:00652a...`. Execution wrote the six immutable semantic records but stopped before Catalog visibility at `write_index_shards`. Isolated reproduction proved a Windows atomic-path overflow (259-character target, ~296-character temporary path). The shard path is now shortened and verified through the real Runtime. The confirmed Plan is stale by design because its Profile/path digest changed; a new Plan and confirmation are required. Existing semantic records will be reconciled as `already_exists`.

## Evidence

- Bug Brief: `.llm-wiki/bugs/2026-08-23-import-publication-time-binding.md`
- Bug Brief: `.llm-wiki/bugs/2026-08-23-import-source-ref-deduplication.md`
- Bug Brief: `.llm-wiki/bugs/2026-08-23-import-intended-content-binding.md`
- Focused RED then GREEN: `tests/memory/research-import-service.test.ts`, `tests/security/research-import-security.test.ts`
- Fresh full verification after each fix: `pnpm check`, exit 0; latest run 108 test files / 458 tests passed, 1 opt-in skipped; AC1–38 offline acceptance; `network: unused`.
- Test integrity: real schema, WorkspaceStore, service persistence, Delta and Index output exercised; no behavior mocks.

## Boundary

Runtime Promotion has not been approved or executed. Pending exact confirmation:

The prior confirmation MUST NOT be reused. Pending exact confirmation for the Windows-safe superseding Plan:

`确认 Research Promotion Plan sha256:eedf7b0c36cff855deeb573ba484ae3bb2b82ddc24ee84cc633534c00f68acaf`

## Residual Risk

The supplied historical timestamp retains its source classification; preserving it does not independently prove it.
