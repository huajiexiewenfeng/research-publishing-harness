# Bug Brief: X Article Browser Host has no executable media transaction

## Summary

- title: X Article Fast Path emits media commands but has no reusable executable Chrome transaction
- status: V3.5 development and offline verification done; separately approved Draft-only smoke pending
- flow_id: `x-article-browser-host-executor-gap-2026-08-29`
- severity: high
- owner: Research Publishing Harness
- updated_at: 2026-08-29

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

## Reproduction

- status: reproduced
- command_or_steps: prepare an existing-Draft Fast Path with one cover and three inline images; claim and attempt the first `upload_article_cover` command twice
- observed: `Cover 0/1`, `Inline images 0/3`, fresh live page evidence proved no media effect, and the hard deadline stopped further writes at 905.985 seconds
- expected: one verified cover or a terminal bounded failure
- limitation: the first chooser call returned without a visible X effect, but the exact transport-layer cause is not yet proven

## Scope

- active: executable cover-upload helper under `x-publishing-copilot`, focused Host tests, media attempt budget, Fast Path hard deadline
- read_only: preserved live Draft, existing V3.2/V3.3 command and observation schemas, Codex Chrome runtime documentation
- candidate: inline-image executable transaction after the cover slice passes
- excluded: Article content, visual bytes, Preview, Publish, Draft cleanup, standalone browser profile, new approval or digest models, Subagents
- escalation_history: none

## Diagnosis

The original failure had three independent layers: no packaged live Editor Observer, no deterministic Host-to-Harness Observation bridge, and no pre-build check for stale executable output. V3.5 closes those repository-owned gaps. It preserves legacy `page_revision` for command compatibility while adding semantic `page_state_revision` so consecutive equivalent reads remain stable across execution metadata changes. Media outcomes now persist stable reason codes, and one Draft-only dispatcher owns all allowed browser transactions. The remaining uncertainty is external: Chrome may still fail to bind the selected local file or X may reject the asset, which only the separately approved live smoke can distinguish.

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
8. [pending external confirmation] Run one 15-minute Draft-only live smoke.

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

## Verification

- status: offline_done
- commands_or_checks: pre-build `pnpm check:packaged-cli`; full lint and typecheck; 16-file focused V3.5 suite; `pnpm acceptance:x-article-fast-path`; complete `pnpm check`; final `git diff --check`
- result_summary: packaged CLI parity passed against `x-article-host-bridge/v3.5`; Skill/manifest validation passed 10/10; focused regression passed 16/16 files and 238/238 tests in 110.00 seconds; complete check passed 184 files with 1 skipped and 1280 tests with 1 skipped, with Vitest duration 180.09 seconds and end-to-end command time about 224 seconds; full acceptance passed with network unused
- draft_only_command_set: `navigate`, `observe_article_page`, `upload_article_cover`, `replace_article_visual_anchor`; Host Bridge rejects Preview and Publish before dispatch
- fast_path_acceptance: 0, 1, 3, 10 inline-image cases plus one disconnect recovery all reached `draft_reconciled`; duplicate Draft/upload/write counts were zero; Preview and Publish command counts were zero; exact inline Alt verification was complete
- limitation: offline tests cannot prove that the installed Chrome extension can bind an approved local file or that X accepts it. If Chrome reports missing file binding, enable **Allow access to file URLs** for the ChatGPT browser extension before a later separately approved attempt.
- residual_risk: one digest-bound, separately confirmed 15-minute Draft-only smoke remains necessary; no X navigation or mutation occurred during this offline verification

## Flow Record

| Step | Status | Evidence | Updated |
|---|---|---|---|
| source | done | preserved execution reports and source inspection | 2026-08-29 |
| design | done | Complete Host Bridge confirmed and written to `docs/superpowers/specs/2026-08-29-x-article-complete-host-bridge-design.zh-CN.md` | 2026-08-29 |
| plan | done | Inline implementation plan completed through Task 9 offline packaging | 2026-08-29 |
| development | done | V3.5 Complete Host Bridge and packaged CLI parity gate implemented | 2026-08-29 |
| testing | offline_done | 238 focused and 1280 aggregate tests passed; five Draft-only Fast Path acceptance scenarios passed | 2026-08-29 |
| archive | pending |  |  |

## Artifacts

- `docs/superpowers/specs/2026-08-29-x-article-browser-host-executor-repair-design.zh-CN.md`
- `docs/superpowers/specs/2026-08-29-x-article-complete-host-bridge-design.zh-CN.md`
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

Whether Chrome bound the selected file but X rejected it cannot be proven by the current Host. V3.5 must expose file-input binding evidence and distinguish it from an absent X media effect.

## Residual Risk

The Codex Chrome runtime and its **Allow access to file URLs** setting remain environment dependencies. V3.5 can diagnose this boundary but cannot change extension permissions or guarantee that X accepts an asset.
