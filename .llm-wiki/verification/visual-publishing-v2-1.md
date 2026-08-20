# Visual Publishing V2.1 Verification

## Provenance

- executor: Codex agent in the target local repository
- authority: agent-local, not CI and not an independent reviewer
- trust_level: `passed-agent-local`
- complete command: `pnpm check`
- scope: ESLint, TypeScript typecheck, production build, full Vitest suite, offline acceptance
- required safety checks: `pnpm manifest`, `git diff --check`, changed-path/privacy/scope scan
- raw output: current task terminal transcript; final fresh counts are recorded after the last code change
- limitation acceptor: none; no functional limitation is self-accepted

## Test Integrity

- Production code and tests/fixtures/expected values changed together, so assertion integrity was reviewed.
- Visual tests execute real Sharp decoding/encoding, metadata inspection, byte digests and WorkspaceStore operations.
- Browser tests execute the real CommandBroker, execution store, composer protocol, Submit Barrier, public verifier and Receipt builder. Fake observations replace only the external X page/Host; they do not mock Digest, Approval, path containment, replay protection or at-most-once state.
- The legacy Article artifact expectation was strengthened to the exact V2.1-compatible list; no assertion was weakened to bypass a failure.
- Security tests directly mutate the issued asset on disk and prove claim-time rejection, rather than only testing a helper in isolation.

## Design §25 Evidence Audit

| # | Result | Direct implementation evidence | Direct automated evidence |
|---|---|---|---|
| 1 | pass | `ArticleDraft.visual_slots`, `VisualSlot.required` | `tests/article/article-visual-service.test.ts` required block and optional warning |
| 2 | pass | `VisualAssetImporter.attach` accepts semantic input while Harness assigns staged/package paths | `tests/core/visual-assets.test.ts`; Article attach lifecycle test |
| 3 | pass | Sharp full decode plus deterministic re-encode without metadata | EXIF removal and stable normalization tests |
| 4 | pass | Atomic directory install contains Markdown, manifest, normalized asset and optional `assets/editable/` source | Article visual happy path and WorkspaceStore atomic-directory test |
| 5 | pass | `renderVisual` uses `VisualAssetRef.relative_path`; undeclared Markdown images are rejected | Article relative-link and undeclared-image assertions |
| 6 | pass | Slot/candidate Claim checks plus five-flag Visual Review | invalid Claim schema/service tests and semantic-review failure test |
| 7 | pass | sorted package digest entries include article, manifest (Alt/placement/order) and every asset/editable digest | Article finalization/digest tests; Plan digest mutation tests |
| 8 | pass | same `VisualAssetRef` flows Manifest → XHandoff → Plan attachment | Article handoff and `tests/x/x-service.test.ts` equality assertions |
| 9 | pass | V2.1 attachment authorization enforces total 0/1 and Thread ordinal 1 | `tests/x/publication-plan-v2-1.test.ts` multi/later/unauthorized cases |
| 10 | pass | Plan digest binds account/mode/text/order/attachment/Alt/claims/ordinal/action; Approval binds full Plan | V2.1 Plan and Approval stale/mutation tests plus CLI version dispatch |
| 11 | pass | Broker authorizes exact Plan payload and revalidates Package identity, root, regular file, MIME and digest at claim | browser security forged-command/source-replacement tests; visual traversal tests |
| 12 | pass | composer protocol re-reads text/account/revision, attachment count/type/ordinal/status/Alt before existing barrier | composer mismatch tests and visual Browser happy path |
| 13 | pass | existing write-ahead Submit marker, execution attempt and consumed-command replay controls unchanged | Browser adapter/broker duplicate claim/result/Submit tests; acceptance counts 1/1 |
| 14 | pass | Receipt V2.1 separates source, composer and public media booleans and documents byte incomparability | `tests/x/receipt-v2-1.test.ts`; public verifier tests |
| 15 | pass | missing public media fields maps to `published_media_unverified`, never finalized | public verifier, outcome resolver and honest degraded Receipt tests |
| 16 | pass | additive schemas/unions; V2.0 and V1 code paths retained | full legacy suite plus offline acceptance Article/Manual/text Browser scenarios |
| 17 | pass | attachment plans require upload/Alt capabilities and fail `BROWSER_FILE_UPLOAD_UNAVAILABLE`; no surface switch command | visual Browser missing-capability test and browser security family/origin tests |
| 18 | pass | happy, format failure, conflict, replay, uncertain upload present/absent/bounded retry, post-submit recovery and security cases are automated | full Vitest suites under `tests/core`, `tests/article`, `tests/x`, `tests/security`, `tests/integration` |
| 19 | pass | acceptance uses synthetic bytes and Fake Browser; tool reports `network:"unused"` | `tools/acceptance.ts` output, Submit command/claim both exactly 1 |
| 20 | pass | MIME allowlist/static pages check and product/Skill boundaries exclude GIF/video/animation/multi-image/X Articles/V2.2 | GIF/animated WebP/multiple-image tests and README/Skill boundary text |

## Material Self-Review

- fixed: upload uncertainty now forces re-observation and permits one retry only after explicit absence.
- fixed: claim-time source replacement and forged upload commands are rejected.
- fixed: zero-attachment V2.1 does not require media capabilities or invent media evidence.
- fixed: optional editable sources cannot collide with normalized publication assets.
- fixed: strict nested Receipt schema, Canonical Package root enforcement and selected-path collision rejection.
- scope drift: none found; no network publisher, real-account action, V2.2, dynamic media, multi-image or automatic selection was added.
- residual risk: external X UI drift and real Chrome behavior are intentionally not exercised by CI/acceptance; a separate test-account smoke must stop at `submit_armed` unless a human separately authorizes Submit.

## Final Command Record

- `pnpm manifest`: exit 0; `files:64`; output `registry/manifests/research-publishing.json`.
- `pnpm check`: exit 0; ESLint clean; TypeScript clean; build clean; 40 test files / 188 tests passed; offline acceptance returned Article/Manual/Browser/Visual complete, `network:"unused"`, `submit_commands:1`, `submit_claims:1`.
- `git diff --check`: final fresh result is required immediately before commit.
