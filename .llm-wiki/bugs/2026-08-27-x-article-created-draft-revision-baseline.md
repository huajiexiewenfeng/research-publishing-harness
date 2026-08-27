# Bug Brief: created Draft shell is not fully materialized before body import

- bug_id: `x-article-created-draft-revision-baseline-2026-08-27`
- status: reopened title-stage fix offline-verified; fresh live smoke pending
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

The post-fix live smoke disproved the second assumption for the real Host. Draft creation produced a saved, bodyless editor whose title remained empty. The prepared V3.2 decision path treated that shell as immediately importable and skipped the existing `set_article_title` command used by the legacy editor path. A title-only success report must also preserve the body as pending; title text alone is not evidence that document import occurred.

## Scope lock

Active: prepared article editor decision, prepared checkpoint projection, their focused tests, generated parity artifacts, deterministic manifest.

Excluded: Chrome Host, schemas, protocols, Publish flow, cleanup, unrelated recovery design.

## Fix plan

Write failing regression tests first. For a validated empty-title shell, issue `set_article_title`; require a saved observation with the exact approved title before issuing `import_article_document`. Keep the body pending after title-only reports. Preserve all drift, replay, and unknown-content failures.

## Post-fix live evidence

- execution: `x_article_execution_86e4c8d6-28b9-42f0-8c4c-25883dd295f4`
- draft_id: `2092809957653753856`
- live DOM: `(Needs title)` and an empty `Add a title` textbox
- create report: normalized title empty, autosave saved; no title write attempted
- next command: body import was issued but not claimed because the exact-title Host precondition failed
- effects: body import `0`, images `0`, Publish `0`; old Draft unchanged

## Reopened fix implementation

- Prepared V3.2 now issues a separately claimed `set_article_title` command when the validated new Draft shell has an empty title.
- The title command is bound to the locked publication Plan and is included in prepared capability, effect/recovery, receipt-trust, and Host protocol checks.
- A title-only observation updates the stable editor revision while leaving checkpoint body status pending and the phase at `article_shell_ready`.
- Only a later exact-titled, otherwise empty, saved observation can lead to `import_article_document`.
- The offline Host fixture now executes the real title command; its former implicit metadata substage was removed.

## Reopened fix offline verification

- RED: the focused regression received `import_article_document` instead of `set_article_title` (`1 failed / 70 skipped`).
- GREEN: the same regression proves `create -> set title -> saved exact-title observation -> import`, with body still pending before import (`1 passed / 70 skipped`).
- Adapter suite: `71/71` passed.
- Integration and security suites: `63/63` passed after adding the one explicit title transaction to measured command and observation counts.
- Manifest and targeted X Article CLI/package checks: `6/6` passed.
- Lint and typecheck: exit `0`; build: exit `0` after rerunning outside the restricted filesystem sandbox.
- Manifest: two final generations produced identical SHA-256 `683381F01F508EE5B7B77CF0611C3FF818399FA460596EC5F4BEDF1D86E99689`, `52,557` bytes, and `252` files.
- Fresh real-Chrome Draft-only verification remains pending. Publish, deletion, and cleanup are not authorized.

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
