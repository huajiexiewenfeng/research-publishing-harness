# Task 3 Report: Capability-negotiated editor state machine

## Status

`DONE_WITH_CONCERNS`

## Commit

- `db3e892ea75a00fdf7fd1ae6ca8470a17baf8142` — `feat: orchestrate bulk X Article imports`

## Result

- Persisted `bulk_document` or `incremental_blocks` strategy at Adapter start.
- Selected bulk mode only when both `import_article_document` and `replace_article_visual_anchor` are advertised; either capability alone fails with `BROWSER_EXECUTOR_INCOMPATIBLE`.
- Kept the existing incremental title, cover, block/image insertion, autosave, and Preview path behind the strategy switch.
- Added fail-closed bulk transitions for empty-editor import, digest and ordered-anchor verification, exact replacement-prefix recovery, first-unresolved-anchor replacement bound to the matching Plan visual, final document/visual verification, import-state clearance, autosave, and Preview.
- Added Page Contract access to the validated editor import state without weakening final document projection or existing digest boundaries.

## TDD Evidence

### Baseline

- Focused baseline before Task 3 edits: 2 files passed, 12 tests passed.

### RED

- Added focused state-machine and capability tests before production edits.
- Tightened RED run: 2 files failed; 11 expected failures and 15 existing passes.
- Expected missing behaviors observed: no persisted strategy, one-capability manifests accepted, bulk context still emitted incremental commands, import preconditions were not enforced, import digests/anchors were ignored, replacement-prefix recovery was absent, and Preview could open while import state remained.

### GREEN

- Focused final: 2 files passed, 26 tests passed, 0 failed.
- `pnpm typecheck`: exit 0.
- `pnpm lint`: exit 0.
- `git diff --check`: exit 0.

## Test Summary

Focused Task 3 tests are GREEN at 26/26; typecheck, lint, and diff checks are clean.

## Concerns

- Optional full Vitest regression run: 51 files passed and 2 files failed; 265 tests passed and 2 failed.
- `tests/tools/acceptance-output.test.ts` fails because out-of-scope `tools/acceptance.ts` observations do not yet include Task 2's now-required nullable `editor.import_state`.
- `tests/cli/cli.test.ts` exercises the pre-existing generated `dist` CLI and returns status 10; the source doctor command returns success. Refreshing `dist` belongs to a later task and was outside Task 3 ownership.
- No diagnostic draft deletion, generated artifact refresh, progress-ledger edit, merge, push, or worktree cleanup was performed.

## Important-review fix addendum

### Status

`DONE`

### Fixes

- Added a monotonic `bulk_import_issued` flag to the persisted Adapter context. It is initialized false, set true at the `import_article_document` issue boundary, retained by every subsequent context update, and supplied to the editor decision protocol after Adapter resumption.
- An empty editor with null import state can issue bulk import only before that flag is set. Once set, a zero-block Plan continues through exact final document/visual/autosave verification, while a nonzero Plan still observed empty fails closed with `ARTICLE_CONTENT_MISMATCH`.
- A planned cover must now be execution-owned and match the approved asset ID, reach `uploaded`, and have exact approved alt text before Preview. `processing` emits a read-only editor observation; `failed` blocks with `ARTICLE_ASSET_MISMATCH`.

### TDD and verification evidence

- Initial requested invocation, `pnpm vitest run tests/x-article/article-editor-protocol.test.ts tests/x-article/article-browser-adapter.test.ts`: exit 1 before test startup because the fallback pnpm runner did not place the worktree-local `vitest` executable on `PATH`.
- RED invocation, `pnpm exec vitest run tests/x-article/article-editor-protocol.test.ts tests/x-article/article-browser-adapter.test.ts`: exit 1; 4 expected regressions failed and 26 existing tests passed. The failures covered missing persisted issuance, nonzero empty post-import handling, processing-cover waiting, and failed-cover blocking.
- GREEN invocation, `pnpm exec vitest run tests/x-article/article-editor-protocol.test.ts tests/x-article/article-browser-adapter.test.ts`: exit 0; 2 files passed and 30/30 tests passed.
- Requested covering form, `$env:Path = "$(Resolve-Path -LiteralPath '.\\node_modules\\.bin');$env:Path"; pnpm vitest run tests/x-article/article-editor-protocol.test.ts tests/x-article/article-browser-adapter.test.ts`: exit 0; 2 files passed and 30/30 tests passed.
- `pnpm typecheck`: exit 0.
- `pnpm lint`: exit 0.
- `git diff --check`: exit 0; only Git's existing LF-to-CRLF working-copy warnings were printed.

### Regression coverage

- Adapter-level title-only import proves the issued marker is persisted before reporting success, survives construction of a new Adapter instance, and advances to Preview without issuing a second import.
- Protocol-level regression proves a nonzero expected document still observed empty after issuance fails closed.
- Protocol-level cover regressions prove `processing` waits/observes and `failed` blocks before Preview.
