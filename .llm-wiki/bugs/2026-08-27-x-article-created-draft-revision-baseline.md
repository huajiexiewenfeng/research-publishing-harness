# Bug Brief: created Draft revision baseline is not checkpointed

- bug_id: `x-article-created-draft-revision-baseline-2026-08-27`
- status: fixed and offline-verified; independent review and fresh live smoke pending
- source: real Chrome Draft-only smoke
- execution: `x_article_execution_8a739b6d-6a40-4316-af0b-f5c31b80d929`
- draft_id: `2092793637604294656`
- expected: exact-titled empty Draft establishes a stable revision baseline, then bulk body import is issued
- actual: execution enters `materialization_blocked` before cover/import
- evidence: `reconciliation-evidence/7fd56854d69f9308e928fea0a7df451f6b84cb65d17289abfeb59fdd2bf50e2b.json`
- exact reason: `checkpoint has no stable editor revision for materialized draft content`

## Reproduction status

Reproduced once in the approved Task 4 live smoke. Runtime evidence shows the valid create observation revision in adapter context while materialization checkpoint `last_editor_revision` remains null.

## Root cause

Draft-ID binding omits null-only promotion of the validated create observation revision. The reconciler recognizes only empty-title empty shells, while X has already applied the approved title to the new Draft.

## Scope lock

Active: article browser adapter, Draft reconciler, their focused tests, generated parity artifacts, deterministic manifest.

Excluded: Chrome Host, schemas, protocols, Publish flow, cleanup, unrelated recovery design.

## Fix plan

Write failing regression tests first. Promote only a null checkpoint revision during Draft binding. Classify only a matching-revision, exact-approved-title, otherwise-empty pre-import Draft as importable. Preserve all drift and unknown-content failures.

## Implementation

- Draft binding now promotes a null `last_editor_revision` to the validated create observation revision and preserves any existing non-null revision.
- Reconciliation now classifies an empty-title or exact-approved-title bodyless shell as `empty` / `import_body` only when the revision matches and every pre-import checkpoint/editor invariant remains valid.
- No schema, protocol, store, command model, Browser Host, Chrome, Publish, cleanup, or unrelated fixture behavior changed.

## Verification plan

Focused and adjacent offline gates, independent review, then one fresh Draft-only smoke with zero Publish commands. The existing failed Draft remains unpublished and undeleted.

## Offline verification evidence

- RED adapter regression: `1 failed / 70 skipped`; real order returned `command=null` instead of `import_article_document` for the exact-titled empty saved created Draft.
- RED reconciler boundary table: `1 failed / 10 passed / 51 skipped`; only the matching-revision exact-title shell was wrongly `unverifiable`; every fail-closed row already passed.
- GREEN adapter regression: `1 passed / 70 skipped`; import command and checkpoint both bind the create observation revision.
- GREEN reconciler boundary table: `11 passed / 51 skipped`; null/stale/forged revision, changed title, unknown content, nonempty block/visual, non-null import state, phase drift, and checkpoint drift remain `unverifiable`.
- Focused adapter/reconciler files: `2 files / 133 tests passed`.
- Adjacent workflow/security files: `2 files / 63 tests passed`.
- Lint, typecheck, and build: exit `0`.
- Direct `dist` parity: exactly four expected generated JavaScript/source-map files; both JavaScript files pass `node --check`, and both source maps parse as JSON.
- Manifest: two generations produced identical SHA-256 `9CD7494CC4F1B40B17C1211F1F784B03CBBE83FD5B7CFDC2F368A1626868DFA3`, identical `52,557` bytes, and `252` files; manifest consistency test `3/3` passed.
- Full suite was not rerun for this bounded fix by integration direction; focused and adjacent offline gates are the recorded test authority.
- No Chrome, Draft, Preview, Publish, deletion, or cleanup action occurred during the fix.

Independent review is not self-approved here. After review, one fresh Draft-only smoke remains required; do not reuse or delete Draft `2092793637604294656`.
