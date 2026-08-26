# Cover Progress / Preview Receipt Regression

## Status

- flow_id: `x-article-v3-2-cover-progress-receipt`
- status: COMPLETE / APPROVED
- base: `3577ba0f7aa9acafa2981ab8a1b87d98889d81d1`
- fix commit: `8a84bec602e916baee46fd780dbabbc0cda98a9d`
- independent review: APPROVED with no findings; 150 focused tests, Task9 history/authority, typecheck, direct-dist parity, and manifest/Task10 isolation verified
- date: 2026-08-27

## Symptom and Root Cause

A prepared V3.2 execution with a locked cover correctly issued `upload_article_cover` and projected the cover asset id into the durable materialization progress ledger. At Preview, `progressSummary()` in `harnesses/research-publishing/core/x-article-materialization.ts` built its allowed asset set only from `plan.visual_anchors`, which intentionally contains inline anchors only. The exact planned cover was therefore rejected as `X Article materialization progress is unordered or foreign`.

## Scope

- active: materialization receipt input/progress validation, the adapter Preview receipt call, Task9's independent receipt reconstruction, direct generated dist, and focused X Article/Publication Bundle tests
- excluded and untouched: Task10-owned integration/security changes and docs, registry manifest, Browser Host companion implementation, approval/confirmation authority
- approved scope escalation: `publication-bundle-service.ts` must pass the same locked cover id when independently recreating the Preview receipt; otherwise a cover-inclusive prepared child cannot bind to its Bundle

## RED Evidence

- Full prepared V3.2 flow (body import, cover upload, uncertain report, exact recovery observation, Preview report) failed at `progressSummary()` with `CONTRACT_INVALID: X Article materialization progress is unordered or foreign`.
- Pure cover-plus-inline receipt validation failed at the same boundary.
- A cover id colliding with an inline anchor was accepted before the new boundary validation.
- Omitting the new validation-only input initially produced a raw `TypeError`; the focused regression requires stable `CONTRACT_INVALID` instead.
- Temporarily removing the Task9 reconstruction input made the new cover-inclusive Bundle binding test fail in receipt recreation; the production line was restored before GREEN.

## Fix

- Added required validation-only `cover_asset_id: string | null` to `CreateXArticleMaterializationReceiptInput`. It is not persisted in the receipt and does not affect receipt schema or digest bytes.
- `progressSummary()` adds only that exact non-empty cover id to the allowed progress set and rejects omission, invalid identity, or collision with any inline anchor.
- The adapter and Publication Bundle verifier obtain the value from their already-validated immutable `context.plan.intent.document.cover_asset_id`.
- `inline_image_count`, `body_block_count`, budget math, command/observation timing, retry/recovery totals, and approval/Publish authority remain unchanged.

## Regression Coverage

- Zero-inline prepared cover completes through Preview receipt after an uncertain-effect recovery; receipt reports one body block, zero inline images, six commands, five observations, and one recovery.
- Cover plus one inline progress event is accepted in order while the receipt still reports exactly one inline image and preserves per-stage seconds.
- Foreign/tampered cover id, omitted cover boundary, and cover-inline identity collision fail closed.
- Existing disordered/foreign/unknown progress and duplicate durable-command projection tests remain green.
- Publication Bundle independently recreates the same cover-inclusive Preview receipt and rejects a tampered cover progress id.
- CLI exercises the rebuilt direct dist artifacts; source/dist context parity remains green.

## Verification

- New focused cases: 2 files / 4 tests PASS.
- Full materialization + adapter: 2 files / 110 tests PASS.
- Task9 focused: 4 files / 33 tests PASS.
- Adjacent Publication Bundle: 19 files / 74 tests PASS.
- Broader X Article + V3.1 cover recovery + integration/security/schema: 17 files / 324 tests PASS.
- CLI source/dist: 1 file / 22 tests PASS.
- Full Vitest: 165 files / 1006 tests PASS, 1 skipped; sole failure is the documented pre-existing `tests/tools/acceptance-output.test.ts` stall at `published_unverified`.
- `pnpm lint`: PASS.
- `tsc -p tsconfig.json --noEmit`: PASS.
- `pnpm build`: PASS; direct dist generated and registry manifest unchanged.

## Flow Record

| Step | Status | Evidence | Updated |
|---|---|---|---|
| source | done | Controller report and current Task7 implementation | 2026-08-27 |
| design | done | Root cause traced to receipt asset allow-list boundary | 2026-08-27 |
| plan | done | Validation-only cover input with exact locked callers | 2026-08-27 |
| development | done | Core, adapter, Task9 reconstruction, direct dist | 2026-08-27 |
| testing | done | RED→GREEN plus focused, adjacent, build, and full gates | 2026-08-27 |
| archive | done | Independent reviewer approved `8a84bec` with no findings | 2026-08-27 |

## Residual Risk

- The known offline acceptance baseline remains outside this fix and Task10 owns its Browser Host companion gate.
- Independent review found no remaining cover-progress receipt issues.
