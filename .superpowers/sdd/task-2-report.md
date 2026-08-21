# Task 2 Report — X Article Document Import v3.1

Status: DONE

Commit: `3349fbca98a7ec04cd4de10c56110401a93c8d3b` (`feat: add X Article import command contracts`)

Summary: Added versioned `import_article_document` and
`replace_article_visual_anchor` command contracts, nullable editor import state,
strict schema validation for safe IDs, relative paths, and digests, plus exact
duplicate-anchor rejection. Compatibility observations now explicitly use
`import_state: null`.

Test summary: 18 focused/compatibility tests passed; full TypeScript check,
ESLint, and `git diff --check` passed.

Verification:

- `vitest run tests/x-article/article-editor-protocol.test.ts tests/security/x-article-browser-security.test.ts` — 15 passed
- `vitest run tests/x-article/article-browser-adapter.test.ts tests/integration/x-article-browser-workflow.test.ts` — 3 passed
- `tsc -p tsconfig.json --noEmit` — passed
- `eslint .` — passed
- `git diff --check` — passed

Concerns: none. Schema deliberately does not enforce anchor identity/order or
anchor-to-marker/asset/ordinal cross-field semantics; those are owned by Task 3.

## Important-finding fix — 2026-08-21

Status: DONE

Summary: Made each new write command a single discriminated TypeScript and JSON
Schema variant binding envelope `kind`, `payload.kind`, and `side_effect`.
Added an AJV contract refinement requiring anchor arrays to have unique
`anchor_id` values and strictly increasing `block_ordinal` values in both import
templates and editor import observations.

TDD RED evidence:

- `.\node_modules\.bin\vitest.CMD run tests/x-article/article-editor-protocol.test.ts tests/security/x-article-browser-security.test.ts` — 8 expected failures and 18 passes before the implementation: hidden new payloads under legacy envelopes, wrong new-command side effects, reversed ordinals, and same-ID/different-object anchors were accepted.
- `pnpm typecheck` — failed with unused `@ts-expect-error` directives before the TypeScript command input became discriminated, proving the old construction type accepted mismatched envelope/payload pairs.
- After discriminating the input type, `pnpm typecheck` failed at `article-editor-protocol.ts:119` because its existing helper constructed `kind`, `payload`, and `side_effect` independently. The task owner authorized adding `harnesses/research-publishing/adapters/x/article-browser/article-editor-protocol.ts`; the helper was changed to a correlated discriminated argument tuple without runtime behavior changes.

Final verification:

- `$env:PATH=((Resolve-Path -LiteralPath 'node_modules\.bin').Path + ';' + $env:PATH); pnpm vitest run tests/x-article/article-editor-protocol.test.ts tests/security/x-article-browser-security.test.ts` — 2 files passed, 26 tests passed.
- `pnpm typecheck` — passed (`tsc -p tsconfig.json --noEmit`, exit 0).
- `pnpm lint` — passed (`eslint .`, exit 0).
- `git diff --check` — passed with no whitespace errors; Git emitted only LF-to-CRLF working-copy notices.

Concerns: The managed fallback `pnpm` command did not automatically place the
workspace `node_modules/.bin` directory on `PATH`, so the prescribed Vitest
command was run with that directory explicitly prepended. The test command and
arguments were otherwise unchanged.
