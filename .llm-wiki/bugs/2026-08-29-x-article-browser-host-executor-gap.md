# Bug Brief: X Article Browser Host has no executable media transaction

## Summary

- title: X Article Fast Path emits media commands but has no reusable executable Chrome transaction
- status: implemented; live primitive verified; installed end-to-end deferred to the next article
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
- next_gate: separately approved Draft-only smoke on an allowed HTTPS page
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
- On 2026-08-30 the same planned PNG uploaded successfully through Chrome's native picker, while Browser `filechooser.setFiles()` either produced no visual effect or remained at `Uploading media...` until cancelled.
- Chrome profile evidence confirms the ChatGPT extension has `newAllowFileAccess: true`; the documented file-URL permission is not the current blocker.
- Packaged V3.8 removed the V3.5 post-selection `input.files[0]` byte-length and MIME binding check, even though the Host protocol still requires selected-input verification.
- Current X inline media uses `Add Media -> Media -> Insert` and a scoped `input[type=file]` with `multiple=true`; the packaged Inline Host still treats the `Media` menu item as the chooser trigger and rejects a multiple-capable chooser.
- Planned image paths are 306-315 characters; the direct recovery attempt bypassed short-path staging and used the 310-character source path.
- The exact 04 PNG was staged from a 308-character planned path to `C:\Users\admin\Documents\New project 2\.tmp-upload-test\x-article-04.png` (72 characters, 221636 bytes, SHA-256 `43da063797255010783991b06b5a2c57dbb6c85895f1b9650c9b2519713bec38`). Selecting that file through the visible `Insert` dialog's actual scoped input succeeded within seconds.
- The successful 04 transaction increased the article image count from two to three, persisted the approved Alt text exactly, removed only the 04 marker, and reached `Last saved just now`; Preview and Publish were not touched.

## Reproduction

- status: reproduced
- command_or_steps: prepare an existing-Draft Fast Path with one cover and three inline images; claim and attempt the first `upload_article_cover` command twice
- observed: `Cover 0/1`, `Inline images 0/3`, no page media effect, non-terminal state after the time budget
- expected: one verified cover or a terminal bounded failure
- limitation: the combined failure was reproduced and isolated, but the newly deployed helper was not rerun against the already-complete article because that would create a duplicate image

## Scope

- active: `x-article-host-common.mjs`, `x-article-inline-image-host.mjs`, focused Host tests, and one approved Draft-only 04 upload A/B using the exact planned asset
- read_only: current V3.8 cover helper, existing V3.2/V3.3 command and observation schemas, Chrome upload documentation, preserved execution reports
- candidate: cover helper alignment only if the common transport fix proves it is required
- excluded: Article text/title, visual bytes, Preview, Publish, Draft cleanup, approval/digest models, Subagents, broad Fast Path redesign
- escalation_history: 2026-08-30 user continued the fix after live 03 manual success; inline file delivery and one 04 Draft-only A/B moved from candidate/read-only into active scope

## Diagnosis

V3.4 implemented a stronger control plane without packaging the media mutation as executable Host code. The Skill therefore leaves the highest-risk step to turn-specific agent code. Failure reports trigger reconciliation, but the next-command path can emit another cover command whenever the cover is still absent. The 900-second value is currently projected as status data rather than enforced as a terminal deadline.

The live failure was localized to three interacting Browser file-delivery assumptions: the direct recovery bypassed existing long-path staging, the Inline Host treated the `Media` menu item as the chooser trigger instead of opening `Insert` and targeting its actual input, and the common Host rejected X's valid `multiple=true` input even though the transaction submits exactly one file. The successful A/B used the existing short-path strategy and the actual scoped input. The input may detach immediately after selection, so `input.files` cannot be a universal hard gate; the durable success evidence remains the bounded X page observation, image count/anchor replacement, exact Alt readback, and autosave state.

## External Findings

None. The Codex Chrome host is an environment boundary, not another project contract. The public repository cannot import the machine-specific browser runtime directly, so the executable helper must accept an already selected Chrome tab/session port and run inside that host.

## Fix Plan

1. Add a reusable JavaScript Host helper shipped with `x-publishing-copilot` for the exact cover transaction.
2. Accept the selected tab/session and immutable command inputs; do not discover profiles, cookies, or credentials.
3. Use the exact visible cover control, arm the chooser with `{timeoutMs}`, call `setFiles([absolutePath])`, and classify the observed effect.
4. Add a deterministic local upload-transport fixture test before any live Draft smoke.
5. Persist and enforce one initial attempt plus at most one adapter-authorized retry per media asset.
6. Turn the Audit deadline into a hard terminal stop in command issuance and status/recovery paths.
7. Keep inline-image execution as a separate follow-on slice.

2026-08-30 minimal continuation:

8. Run one A/B with the planned 04 asset staged to a short path and selected through the current `Insert` dialog's actual input.
9. Allow a multiple-capable chooser while continuing to call `setFiles()` with exactly one verified asset path.
10. Open `Insert`, resolve its unique actual `input[type=file]`, and make that input the causal chooser trigger; do not make a detached transient input a false failure after selection.
11. Do not change the Fast Path state machine, approval model, Preview, or Publish behavior.

## Verification

- status: implementation-pass; live primitive-pass
- commands_or_checks: RED/GREEN for multiple-capable one-file delivery and current `Add Media -> Media -> Insert -> input[type=file]` interaction; focused Host regression; focused ESLint; `git diff --check`; source/installed SHA-256 parity; exact 04 Draft-only live A/B
- result_summary: the new tests first failed on both obsolete assumptions, then passed after the minimal code change; 2 focused files passed 21/21 tests and the complete X Article Host set passed 63/63 tests across 6 files; focused ESLint and `git diff --check` passed; installed `x-article-host-common.mjs` matches source at `7BE0D4FB0DCC216089B0422F8695B528C459AB768BBEE1822EC04F032EBD45B1`, and installed `x-article-inline-image-host.mjs` matches source at `647C337973F0F66EEA232188F0B536D44C8998445E5D8915AA314FAAE574B578`; the exact 04 live transaction completed with three images, exact Alt, marker removal, and autosave
- limitation: the unrelated full Vitest suite produced no verifiable progress for about 90 seconds and was intentionally interrupted; the newly installed helper was not invoked again on the complete Draft to avoid duplicate mutation
- residual_risk: the next article should provide the first installed-helper end-to-end confirmation; if X changes the accessible name of the `Insert` dialog, the scoped locator will fail closed rather than improvising

## Flow Record

| Step | Status | Evidence | Updated |
|---|---|---|---|
| source | done | preserved execution reports and source inspection | 2026-08-29 |
| design | done | `docs/superpowers/specs/2026-08-29-x-article-browser-host-executor-repair-design.zh-CN.md` | 2026-08-29 |
| plan | done | Inline Execution selected; no Subagent used | 2026-08-29 |
| development | done | prior Host bridge plus minimal current-X delivery repair committed as `96a067ec13b015e04f3d3f4bb5d9ddc109296cdb`; installed source hashes match | 2026-08-30 |
| testing | done | current 04 live A/B succeeded; focused 21/21 and complete Host 63/63 tests passed; ESLint and diff checks passed | 2026-08-30 |
| archive | pending |  |  |

## Artifacts

- `docs/superpowers/specs/2026-08-29-x-article-browser-host-executor-repair-design.zh-CN.md`
- `docs/superpowers/plans/2026-08-29-x-article-browser-host-executor-repair.md`
- `skills/x-publishing-copilot/scripts/x-article-cover-host.mjs`
- `skills/x-publishing-copilot/scripts/x-article-host-common.mjs`
- `skills/x-publishing-copilot/scripts/x-article-inline-image-host.mjs`
- `tests/skills/x-article-host-common.test.mjs`
- `tests/skills/x-article-inline-image-host.test.mjs`
- rollback backup: `C:\Users\admin\Documents\New project 2\.skill-backups\x-publishing-copilot-20260830-2039`
- `tests/fixtures/x-article/file-upload-probe.html`
- `harnesses/research-publishing/adapters/x/article-browser/article-media-attempt-policy.ts`
- `harnesses/research-publishing/core/x-article-fast-path-deadline.ts`

## Open Questions

None blocking. The next article is the appropriate non-duplicate installed-helper end-to-end check.

## Residual Risk

The Codex Chrome runtime and X's accessible UI names remain environment dependencies. The repair now matches the interaction proven on the current Draft and fails closed if that UI changes, but it does not turn the public npm CLI into a standalone browser automation product.
