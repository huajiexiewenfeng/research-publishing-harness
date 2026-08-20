# Working Context: Visual Publishing V2.1

## Scope Lock

- active: Core minimal visual contract and importer; Article slots/review/finalize/handoff; X V2.1 plan/approval; Browser upload/observation/public evidence/receipt; CLI, contracts, skills, fixtures, docs and tests.
- read-only: approved V2.1 spec, V2 Browser baseline, architecture baseline and existing V2 implementation plan.
- candidate: one exact-version image decoding/normalization dependency.
- excluded: worktrees/branches/subagents, V2.2, GIF/video/animation/multiple images/X Articles/automatic asset selection/hosting/general media platform/real X submit.

## Accepted Decisions

- Canonical Markdown Article Package is the visual fact source and uses package-relative paths.
- `VisualAssetRef` is the only shared visual abstraction.
- Only PNG, JPEG and static WebP are publishable.
- X handoff requires explicit `asset_id`; no selection heuristic exists.
- One Plan has zero or one attachment; Thread attachment is only on item 1.
- Approval binds the full normalized V2.1 intent including attachment evidence and `publish_once`.
- Browser host re-resolves containment and recomputes digest before upload.
- Public evidence never equates transformed public bytes with source bytes.
- V2.0 text-only Browser, existing Article and V1 Manual remain compatible.

## Escalation Rule

Stop and record a real blocker if implementation would require weakening a deterministic gate, publishing to a real account, expanding to excluded media, or treating unverified public media as verified. Do not shrink acceptance scope to avoid the blocker.

## TDD and Verification

- Each behavior starts with a failing focused Vitest test and expected failure.
- Run related suites after each green phase.
- Run full `pnpm check`, `git diff --check`, and an explicit 20-item acceptance evidence audit before commit.
- Commit only after fresh complete verification; then verify clean worktree.

## Plan Status

- `confirmed`: user explicitly authorized immediate inline execution on the current `main`.

## Completion Snapshot

- exact dependency: `sharp@0.34.4`; supported output is PNG/JPEG/static WebP only.
- implementation: minimal visual contracts, safe normalization, atomic Canonical Package, explicit X asset handoff, V2.1 Plan/Approval, restricted Browser upload/Alt, media-aware public verification and Receipt V2.1.
- compatibility: V2.0 text Browser, legacy Article, and V1 Manual paths remain exercised in the full suite and acceptance.
- material self-review fixes: bounded uncertain-upload recovery, claim-time source replacement detection, zero-attachment V2.1 totality, editable-source path collision, Package root/path collision hardening, strict nested Receipt schema.
- verification trust: `passed-agent-local`; raw command evidence is summarized in `.llm-wiki/verification/visual-publishing-v2-1.md`.
