# Bug Brief: X Article Browser Host has no executable media transaction

## Summary

- title: X Article Fast Path emits media commands but has no reusable executable Chrome transaction
- status: Thin Host Adapter offline verification done; page evidence replaces transient file-input binding, verified short-path staging is implemented, and one fresh Draft-only verification remains
- flow_id: `x-article-browser-host-executor-gap-2026-08-29`
- severity: high
- owner: Research Publishing Harness
- updated_at: 2026-08-30

## Routing

- intent: fix a live X Article cover-upload regression without expanding the publication protocol
- primary_stage: project-fix
- secondary_bridges: brainstorming, test-driven-development, verification-before-completion
- confidence: high
- reason: current source and live execution evidence agree that the Harness persists commands while Codex performs media actions ad hoc
- next_gate: digest-bound action-time confirmation for one 15-minute Draft-only smoke
- routed_at: 2026-08-29

## Source

- path/url/log/user_report: user report and preserved Draft-only Fast Path execution `x_article_execution_9d597a21-ab41-447f-8ed8-acc1c2283117`
- source_proxy: local execution reports and current source
- sensitivity: no credentials; do not copy browser session data

## Symptom

The earlier direct Chrome workflow completed slowly, but the V3.4 Fast Path remains at `Cover 0/1`. One cover command reported `uncertain`, a second reported `transient_failure`, and the execution continued to project `materialization_reconciling` after its 900-second budget.

## Expected

One approved Draft-only execution should run a reusable, deterministic cover-upload transaction inside the Codex Chrome host, verify its actual page effect, and either advance once or stop terminally. The Host must not improvise file-upload API calls, and the Harness must not reissue media writes beyond the bounded attempt policy or continue past its deadline.

## Evidence

- `XArticleCommandBroker.issue()` validates and persists semantic commands; it does not execute Chrome.
- Repository TypeScript contains no `filechooser`, `setFiles`, or equivalent live browser executor.
- Live execution reports contain `upload_article_cover: uncertain` followed by `upload_article_cover: transient_failure`, with zero observed visuals.
- Fast Path status exceeded 900 seconds while remaining non-terminal.
- The installed and repository Skill digests match; active Skill deployment drift is not the demonstrated cause.
- A fresh V3.4 execution, `x_article_execution_105d34cd-44ce-478c-bc58-a2630a16c74b`, verified the exact account, Draft ID, title, 76 canonical body blocks, three ordered unresolved anchors, zero media, and saved autosave state from the live Chrome page.
- The approved cover is a valid 1600x900, 8-bit RGBA PNG whose SHA-256 exactly matches the claimed command.
- The chooser opened and `setFiles` returned, but a fresh page read showed zero cover and zero inline images.
- The turn-specific Observation callback failed because its execution environment does not expose `process`; the Cover Host therefore returned `uncertain` even though a later fresh Observation proved zero effect.
- The hard deadline stopped the execution at 905.985 seconds with zero duplicate media writes and zero Preview/Publish actions.
- The merged TypeScript source exposed V3.4 while the committed `dist` CLI initially rejected `x-article fast-path audit` as an unknown operation; a local build made it available, proving packaged-output drift.
- V3.5 now packages the bounded Editor Extractor, deterministic dual-Revision Observation Builder, runtime observer, reasoned cover and inline transactions, and the Draft-only Host Bridge dispatcher.
- The pre-build parity gate first rejected the old CLI because `x-article-host-bridge/v3.5` was absent. A selective rebuild then exposed a second real failure: the new Adapter imported `createXArticleFastPathResult` from an old packaged dependency. Commit `802d14c` includes the minimal executable CLI dependency closure and the gate now passes before any build-capable test.
- Live retry `x_article_execution_021cdc3b-2d86-47b3-8e02-9a23b5611ca7` proved that the scoped cover `input[type=file]` is only about `0.09 x 0.09` pixels and has no label; its same-parent visible button is the actual chooser trigger (`aria-label="Add photos or video"`).
- The Cover Host incorrectly used the hidden binding input as `causalTrigger`. The chooser therefore never opened and the Host correctly reported `file_transfer_missing` with no possible selection and no X effect.
- The first Cover Host correction used the unique visible/enabled sibling button to open the chooser but still kept the scoped file input as a post-selection binding gate. Live evidence showed that this gate was not a reliable page contract.
- Fresh execution `x_article_execution_ac58f8ca-8350-4fed-a427-dcb545cdd7c6` reached the exact Draft and saved editor state, then both forward-slash and canonical Windows forms of the same 304-character cover path returned `file_transfer_missing`; fresh observations proved zero cover, zero inline images, and no Preview/Publish effect.
- Node and the visual verifier read the approved PNG successfully, so missing/corrupt source bytes are excluded. A local transport check now stages that exact 304-character source to a 63-character temporary path, preserves digest `sha256:0e68a95438ece1a67a0285d24dd3ae870ddfa5e66fbec0c59f4e16a9416f5306` byte-for-byte, and removes the temporary copy after the transaction.
- Cover RED proved that empty `input.files` forced `file_transfer_missing` even when the Editor Observation contained the uploaded cover; commit `411c663` makes the stable page visual and autosave state authoritative.
- Inline RED reproduced the same failure despite complete visual, anchor, Alt, and autosave evidence; commit `a2d11e9` removes the binding gate from the inline transaction.
- The legacy binding helper is removed. `deliverOneFile` performs one chooser delivery, while Cover and Inline independently verify the real Editor result. Commit `4484ab0` also keeps the verified short-path copy alive for the whole transaction and cleans it after success or exceptions.

## Reproduction

- status: reproduced
- command_or_steps: prepare an existing-Draft Fast Path with one cover and three inline images; claim the first cover command; attempt the approved 304-character asset path once in each supported path spelling; reconcile after each attempt
- observed: both path spellings returned `file_transfer_missing`; `Cover 0/1`, `Inline images 0/3`, saved autosave, and fresh live page evidence proved no media effect before terminal `materialization_blocked`
- expected: one verified cover or a terminal bounded failure
- limitation: path length is the only demonstrated boundary difference and is now handled defensively, but browser policy prevented an isolated long-vs-short local-page experiment; only a fresh digest-bound Draft execution can prove the external transport hypothesis

## Scope

- active: thin Cover and Inline Host transactions under `x-publishing-copilot`, page-result verification, media attempt budget, and Fast Path hard deadline
- read_only: preserved live Draft, existing V3.2/V3.3 command and observation schemas, Codex Chrome runtime documentation
- candidate: one fresh cover-plus-three-inline Draft-only live verification after deployment
- excluded: Article content, visual bytes, Preview, Publish, Draft cleanup, standalone browser profile, new approval or digest models, Subagents
- escalation_history: none

## Diagnosis

The original failure had three independent layers: no packaged live Editor Observer, no deterministic Host-to-Harness Observation bridge, and no pre-build check for stale executable output. V3.5 closes those repository-owned gaps. The first live retry exposed a fourth mismatch: X separates the visible chooser button from the tiny file input. The next live run exposed a fifth boundary risk: the approved package path is 304 characters long. The attempted optimization also introduced a sixth design error: transient `input.files` state was promoted to a success contract even though X can clear or replace that input during ingestion. The Thin Host Adapter now verifies approved bytes, delivers one file through a short path when required, and decides success only from stable cover/inline visual, anchor, Alt, and autosave evidence.

## External Findings

None. The Codex Chrome host is an environment boundary, not another project contract. The public repository cannot import the machine-specific browser runtime directly, so the executable helper must accept an already selected Chrome tab/session port and run inside that host.

## Fix Plan

1. [done] Package a bounded Chrome Editor Extractor.
2. [done] Build deterministic dual-Revision Observations with legacy `page_revision` compatibility and semantic `page_state_revision`.
3. [done] Add file-binding evidence, bounded stability waits, and stable cover outcome reasons.
4. [done] Add single-anchor inline replacement with exact Alt write/readback and ordinal verification.
5. [done] Route navigate, observe, cover, and inline commands through one Draft-only Host Bridge.
6. [done] Preserve the attempt budget and shared hard deadline; Host code never retries locally.
7. [done] Run packaged CLI parity before any build can mask stale `dist` artifacts.
8. [done] Run the first 15-minute Draft-only live smoke and prove the cover chooser trigger mismatch without producing any media effect.
9. [done] Separate the visible cover chooser trigger from the scoped binding input and add RED/GREEN regression coverage.
10. [done] Run one fresh bounded Draft-only execution and prove that both spellings of the 304-character approved cover path fail before file binding with zero X effect.
11. [done] Add digest-preserving short-path transport staging at the Host Bridge boundary, with transaction-lifetime cleanup and RED/GREEN coverage.
12. [done] Remove `input.files` from the media state machine; use one-file delivery plus page-result authority for Cover and Inline.
13. [done] Pass packaged CLI, lint, typecheck, 1291-test aggregate verification, and all 0/1/3/10/disconnect Fast Path acceptance cases.
14. [pending deployment and external confirmation] Deploy the four changed Skill scripts, generate a new Audit, and run one fresh bounded Draft-only execution; never reuse the terminal command.

## RED / GREEN Ledger

| Task | RED evidence | GREEN checkpoint |
|---|---|---|
| 1 | Editor extractor module and bounded snapshot contract absent | `bbd1d43` |
| 2 | Deterministic Observation Builder and stable semantic Revision absent; legacy-only observations needed compatibility | `497c3fa` |
| 3 | Packaged runtime observer absent | `98f3c0a` |
| 4 | Cover transaction could not distinguish file binding from no X effect | `9432f10` |
| 5 | Adapter did not persist stable Host outcome reasons | `008a547` |
| 6 | Single-anchor inline replacement and Alt readback dispatcher absent | `b47da97` |
| 7 | No complete Draft-only dispatcher; acceptance lacked complete Host dispatch evidence | `5ac8623` |
| 8 | parity tool absent; old `dist` lacked V3.5, then selective output failed on a stale runtime export | `802d14c` |
| 9 | Skill fallback/authority language and generated manifest were stale | this `chore: package complete X Article Host Bridge` packaging commit |
| 10 | Live X DOM placed the cover input and causal button beside each other; the Host clicked the binding input | focused RED showed input click, GREEN uses the visible `Add photos or video` button; 17/17 cover tests and 49/49 Host tests pass |
| 11 | Bridge passed the approved 304-character package path directly to Chrome; RED proved no alternate transport path existed | Bridge stages identical verified bytes only when the path exceeds 240 characters; focused Common + Bridge tests pass 20/20 and the real asset stages 304 → 63 characters with exact digest and cleanup |
| 12 | Cover and Inline RED cases returned `file_transfer_missing` despite complete page evidence when `input.files` was empty | `79118c6`, `411c663`, `a2d11e9`, and `4484ab0`; five focused Host files pass 52/52 and runtime source has no binding helper |

## Verification

- status: offline_done_live_verification_pending
- commands_or_checks: pre-build `pnpm check:packaged-cli`; full lint and typecheck; 16-file focused V3.5 suite; `pnpm acceptance:x-article-fast-path`; complete `pnpm check`; final `git diff --check`
- result_summary: packaged CLI parity passed against `x-article-host-bridge/v3.5`; lint, typecheck, and build passed; the latest complete Vitest run passed 184 files with 1291 tests passed, 1 file and 1 test skipped, and 0 failed; the focused Host suite passed 52/52; Fast Path acceptance passed all five 0/1/3/10/disconnect-recovery scenarios with network unused
- draft_only_command_set: `navigate`, `observe_article_page`, `upload_article_cover`, `replace_article_visual_anchor`; Host Bridge rejects Preview and Publish before dispatch
- fast_path_acceptance: 0, 1, 3, 10 inline-image cases plus one disconnect recovery all reached `draft_reconciled`; duplicate Draft/upload/write counts were zero; Preview and Publish command counts were zero; exact inline Alt verification was complete
- limitation: the short-path transport adaptation is verified offline but has not yet completed a fresh live X transaction
- residual_risk: one fresh digest-bound Draft-only execution remains necessary; the terminal execution produced no X media effect and issued no Preview or Publish command

## Flow Record

| Step | Status | Evidence | Updated |
|---|---|---|---|
| source | done | preserved execution reports and source inspection | 2026-08-29 |
| design | done | Thin Host Adapter confirmed in `docs/superpowers/specs/2026-08-30-x-article-thin-host-adapter-design.zh-CN.md` | 2026-08-30 |
| plan | done | Five-Task Inline plan in `docs/superpowers/plans/2026-08-30-x-article-thin-host-adapter.md` | 2026-08-30 |
| development | done | one-file delivery, page-authoritative Cover/Inline, and verified long-path staging implemented | 2026-08-30 |
| testing | offline_done_live_verification_pending | focused Host 52/52; aggregate 1291 passed and 1 skipped; all five Fast Path cases passed; real cover stages 304 → 63 characters with exact bytes and cleanup | 2026-08-30 |
| archive | pending |  |  |

## Artifacts

- `docs/superpowers/specs/2026-08-29-x-article-browser-host-executor-repair-design.zh-CN.md`
- `docs/superpowers/specs/2026-08-29-x-article-complete-host-bridge-design.zh-CN.md`
- `docs/superpowers/specs/2026-08-30-x-article-thin-host-adapter-design.zh-CN.md`
- `docs/superpowers/plans/2026-08-30-x-article-thin-host-adapter.md`
- `docs/superpowers/plans/2026-08-29-x-article-browser-host-executor-repair.md`
- `skills/x-publishing-copilot/scripts/x-article-cover-host.mjs`
- `skills/x-publishing-copilot/scripts/x-article-editor-extractor.mjs`
- `skills/x-publishing-copilot/scripts/x-article-host-runtime.mjs`
- `skills/x-publishing-copilot/scripts/x-article-host-common.mjs`
- `skills/x-publishing-copilot/scripts/x-article-inline-image-host.mjs`
- `skills/x-publishing-copilot/scripts/x-article-host-bridge.mjs`
- `tools/check-packaged-x-article-cli.ts`
- `tests/fixtures/x-article/file-upload-probe.html`
- `harnesses/research-publishing/adapters/x/article-browser/article-media-attempt-policy.ts`
- `harnesses/research-publishing/core/x-article-fast-path-deadline.ts`

## Open Questions

Will the thin visible-button transaction deliver the exact cover through the verified 63-character transport path and produce stable X media evidence in one fresh bounded execution?

## Residual Risk

The Thin Host transaction and short-path staging are verified offline, but live X acceptance remains external until one fresh bounded execution reaches `draft_reconciled`.
