# Task 4 Report: End-to-end workflow, CLI, and acceptance evidence

## Status

DONE_WITH_CONCERNS

The Task 4 source workflow and offline acceptance path are complete. Generated `dist/**` remains unchanged by design, so the pre-existing generated-dist doctor subtest is still stale and the exact combined focused suite is not wholly green until Task 5 regenerates `dist`.

## Scope

Changed only the six Task 4 implementation files:

- `tests/fixtures/x-article-browser-observations.ts`
- `tests/integration/x-article-browser-workflow.test.ts`
- `tests/cli/cli.test.ts`
- `tools/acceptance.ts`
- `harnesses/research-publishing/cli/index.ts`
- `registry/manifests/research-publishing.json`

This report is orchestration evidence. No `dist/**`, progress-ledger, diagnostic-draft cleanup, or unrelated operation was changed.

## RED evidence

1. The requested `pnpm vitest run tests/integration/x-article-browser-workflow.test.ts tests/cli/cli.test.ts` command did not reach Vitest in this environment because the bundled fallback `pnpm` reported `'vitest' is not recognized as an internal or external command`.
2. Running the same suites through the local Vitest entry point outside the sandbox produced the behavioral RED:
   - integration failed with `editor inline visual count differs from resolved import anchors`, proving the old synthetic Host did not model import state or anchor replacement;
   - the X Article CLI assertion failed because `x-article browser start` did not expose the unchanged capability manifest;
   - the already-known generated-dist doctor subtest also failed with exit status `10`.
   - result: 2 files failed, 3 tests failed, 5 passed.

## GREEN evidence

- Integration workflow: 1 file passed, 1 test passed.
- Source-backed X Article CLI test: 1 file passed, 1 test passed, 6 skipped.
- Combined focused suite: 1 file passed, 1 file failed; 7 tests passed and only the stale generated-dist doctor subtest failed.
- `pnpm acceptance`: exit 0 and printed:

```json
{"ok":true,"article":"complete","manual_x":"complete","browser_x":"simulated_complete","visual_v2_1":"simulated_complete","x_article":"simulated_complete","network":"unused","submit_commands":1,"submit_claims":1,"x_article_publish_commands":1,"x_article_import_commands":1,"x_article_anchor_replacement_commands":3}
```

- `pnpm typecheck`: exit 0.
- `pnpm lint`: exit 0.
- `git diff --check`: exit 0.

## Acceptance coverage

- Exactly one `import_article_document` command.
- Exactly three `replace_article_visual_anchor` commands in approved block-ordinal order.
- Zero `insert_article_block` commands in bulk mode.
- Exactly one Preview and one at-most-once Publish command.
- Publish remains uncertain first, then resumes through read-only public verification.
- The final editor/public projection equals the approved `XArticleDocumentV1` and contains no temporary anchor marker.
- The published Receipt is read back with `status: published`; an overwrite attempt is rejected with `ARTIFACT_EXISTS`.
- The source CLI accepts both advertised bulk-import capabilities, echoes the unchanged JSON capability manifest, and persists it unchanged.
- The registry manifest describes the command and observation contracts and both new capability meanings.

## Concern carried to Task 5

`dist/**` was intentionally not generated or modified. The generated-dist doctor test continues to return exit status `10`; Task 5 must rebuild the generated runtime and rerun the full CLI suite. No Task 4 source or acceptance failure remains.

## Review-fix evidence: reproducible registry metadata

### Scope and provenance

The independent review correctly identified that the original manifest generator did not emit the Task 4 `interfaces.x_article_browser` registry contract and would remove it on regeneration. This resumed repair preserves the interrupted implementation and regression-test edits in `tools/build-manifest.ts` and `tests/tools/manifest-content.test.ts`, regenerates `registry/manifests/research-publishing.json`, and adds this append-only evidence. No `dist/**` file or progress ledger was changed.

The interrupted agent left no independently verifiable RED execution for this review fix. Per the review, the demonstrated pre-fix behavior was that the generator constructed only `schema_version`, `harness`, `compatibility`, and `files`, so regeneration removed interface metadata and left stale file evidence. This report does not claim a new RED run.

### Contract verification

The generated metadata exactly emits the Task 4 registry contract:

- `command_contract`: `x-article-browser-command/1.0`
- `observation_contract`: `x-article-browser-observation/1.0`
- `import_article_document`: `Import one deterministic Article Document template bound to the approved Article Package and document digests.`
- `replace_article_visual_anchor`: `Replace one verified temporary visual anchor with its approved digest-bound inline asset at the planned block ordinal.`

The focused regression test checks that exact object after invoking the real generator and recalculates canonical byte counts and SHA-256 digests for every manifest entry.

### Commands and results

1. `pnpm vitest run tests/tools/manifest-content.test.ts`
   - Environment limitation: exit 1 before Vitest because the bundled fallback `pnpm` reported `'vitest' is not recognized as an internal or external command`.
2. `node --import tsx node_modules/vitest/vitest.mjs run tests/tools/manifest-content.test.ts`
   - Restricted-shell limitation: exit 1 while loading Vite config because local helper spawning was blocked with `Error: spawn EPERM`.
3. The same direct Vitest command run with the needed local-spawn permission:
   - exit 0; 1 test file passed, 3 tests passed.
4. `pnpm manifest` run twice, with `git diff --no-ext-diff --binary | git hash-object --stdin` captured before, after the first generation, and after the second:
   - each generation reported `{"ok":true,"files":87,"output":"registry\\manifests\\research-publishing.json"}`;
   - before: `7d8bf8005adf7844ad53c5a97745c740e37afbe9`;
   - after first: `7d8bf8005adf7844ad53c5a97745c740e37afbe9`;
   - after second: `7d8bf8005adf7844ad53c5a97745c740e37afbe9`.
   - The unchanged hash proves the second run is idempotent and the first regeneration introduced no additional diff beyond the preserved repair.
5. `pnpm acceptance`
   - exit 0; output included `"x_article":"simulated_complete"`, `"x_article_publish_commands":1`, `"x_article_import_commands":1`, and `"x_article_anchor_replacement_commands":3`.
6. `pnpm typecheck`
   - exit 0.
7. `pnpm lint`
   - exit 0.
8. `git diff --check`
   - exit 0.

### Self-review

- The generator owns the registry metadata, so regeneration cannot erase the two Task 4 capability descriptions.
- The regression test exercises the real generator, asserts the exact metadata contract, and recalculates all generated-file byte counts and SHA-256 digests.
- The manifest preserves all protocol boundaries: the two capabilities only describe a digest-bound Article Document import and a planned-ordinal, digest-bound inline visual replacement. It does not alter Article Package, Plan, Approval, Browser Command, Preview, at-most-once Publish, public verification, Receipt, incremental insertion, temporary-anchor, or diagnostic-draft behavior.
- Residual concern: the known generated `dist/**` doctor gap remains owned by Task 5; this repair intentionally does not regenerate `dist/**`.
