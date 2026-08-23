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

The user confirmed Plan `sha256:00652a...`. Execution wrote the six immutable semantic records but stopped before Catalog visibility at `write_index_shards`. Isolated reproduction proved a Windows atomic-path overflow (259-character target, ~296-character temporary path). The shard path was shortened and verified through the real Runtime. The confirmed Plan became stale by design because its Profile/path digest changed.

The user then confirmed the Windows-safe superseding Plan `sha256:eedf7b0c...`. Promotion completed: the six existing semantic records reconciled as `already_exists`, three index shards were written, and Catalog was committed last. Independent read-back found one exact Catalog with content checksum `sha256:dc761be5...`. A real progressive mainline Query loaded `increment_skill_runtime_boundary@1`, and Index Doctor verified all three shards and six semantic records with status `healthy`.

## Evidence

- Bug Brief: `.llm-wiki/bugs/2026-08-23-import-publication-time-binding.md`
- Bug Brief: `.llm-wiki/bugs/2026-08-23-import-source-ref-deduplication.md`
- Bug Brief: `.llm-wiki/bugs/2026-08-23-import-intended-content-binding.md`
- Focused RED then GREEN: `tests/memory/research-import-service.test.ts`, `tests/security/research-import-security.test.ts`
- Fresh full verification after each fix: `pnpm check`, exit 0; latest run 108 test files / 459 tests passed, 1 opt-in skipped; AC1–38 offline acceptance; `network: unused`.
- Test integrity: real schema, WorkspaceStore, service persistence, Delta and Index output exercised; no behavior mocks.
- Complete Promotion Receipt: `promotion_receipt_a3dcd1257f774f62b696a6e15fded5ca_1`, digest `sha256:0fd4a2fd1cbd4d0f8b20c858183a4b0eef595822a5c144aedb5554f9ec5d0785`.
- Final Catalog content checksum: `sha256:dc761be59746d413cb26d84f3f1db37b5e2207501b019ad29017adfefed9518f`.
- Progressive Query: `query_first_runtime_boundary_acceptance_20260823`, status `loaded`, Snapshot digest `sha256:80646deaab1ff436174a7d08abb68078f6b905c8e43d201c4b101a56f736d2ff`.
- Index Doctor: `healthy`, report digest `sha256:031cc4dac7cce826e4c167e4b7a5457af795c6ec11a4f15f5a84aa1f68b59dfd`.

## Boundary

The first real V2.3 historical Import is complete and visible through the default `enterprise-agent-runtime` mainline Query path. No X/Gist mutation occurred during Import or verification.

## Residual Risk

The supplied historical timestamp retains its source classification; preserving it does not independently prove it. Historical Thread metrics remain intentionally absent rather than inferred.
