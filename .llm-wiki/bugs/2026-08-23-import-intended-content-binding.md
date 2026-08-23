# Bug Brief: Import Intended Content Binding

## Identity

- bug_id: `import-intended-content-binding-2026-08-23`
- flow_id: `research-data-flywheel-v2-3-first-import`
- status: fixed-and-verified-agent-local
- discovered_at: 2026-08-23

## Symptom and Reproduction

- Semantic Review of the first real Import Delta found that its X Thread Publication Expression bound `intended_content.local_content_path/content_digest` to the long-form mother article.
- The exact six X items live in the digest-bound Import Manifest, not in the mother article bytes.
- The Delta remains unreviewed and unapproved; no Promotion Plan or Runtime write exists.

## Expected Behavior

For a legacy Thread Import, Publication Expression intended content must bind the local artifact that contains the exact ordered Thread text. The mother article remains canonical source material, while the Import Manifest is the content-bearing publication plan/artifact.

## Scope

- active: Import Publication Expression construction and focused regression test
- read-only: first unapproved real Delta
- excluded: deleting audit artifacts, Runtime writes, Review/Promotion

## Root Cause

The Import adapter reused `mother_article.path/digest` for publication intended content even though the Manifest owns the six-item adaptation.

## Fix Plan

1. Add a regression assertion for Manifest path/digest binding.
2. Bind intended local content to the persisted Import Manifest artifact.
3. Run focused and full verification before generating a superseding unapproved Delta.

## Verification Plan

- Focused test must fail against the old mother-article binding.
- Focused test and full `pnpm check` must pass after the fix.

## Fix

- Bind `intended_content.local_content_path/content_digest` to the persisted, digest-bound Import Manifest containing the exact six ordered Thread items.
- Preserve the mother article as a separate canonical source artifact in the Evidence Snapshot.

## Verification

- RED: focused test observed the old mother article path/digest instead of the Import Manifest artifact.
- GREEN: focused Import suite passed 3/3 with exact Manifest path/digest assertions.
- Test-integrity check: assertion resolves actual WorkspaceStore artifact bytes and inspects the real proposed Publication Expression; no behavior mock is involved.
- Fresh `pnpm check` passed lint, typecheck, build, 108 test files / 458 tests, one opt-in skip, and offline AC1–38 acceptance with `network: unused`.
- Trust level: `passed-agent-local`.

## Residual Risk

The imported Manifest is JSON rather than a standalone Thread Markdown artifact, but it is immutable, local, digest-bound, and contains the exact ordered text.
