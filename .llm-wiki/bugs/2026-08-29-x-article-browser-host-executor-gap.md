# Bug Brief: X Article Browser Host has no executable media transaction

## Summary

- title: X Article Fast Path emits media commands but has no reusable executable Chrome transaction
- status: V3.4 live smoke failed safely; Complete Host Bridge design confirmed
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
- next_gate: user review of the written Complete Host Bridge specification
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

V3.4 now packages a bounded cover transaction and enforces the deadline, but it still lacks a packaged live Editor Observer and deterministic Host-to-Harness Observation bridge. The cover transaction must receive a turn-specific `observe` callback. In the live run that callback failed on an environment-specific assumption, converting a provable zero-effect result into `uncertain`. The browser transfer also produced no X media effect after `setFiles`; the current outcome has no stable reason field to distinguish a missing browser file binding from an accepted file with no X effect. Finally, source and committed `dist` can drift, allowing offline source tests to pass while the executable CLI remains old.

## External Findings

None. The Codex Chrome host is an environment boundary, not another project contract. The public repository cannot import the machine-specific browser runtime directly, so the executable helper must accept an already selected Chrome tab/session port and run inside that host.

## Fix Plan

1. Add a packaged Chrome Editor Extractor that returns only the bounded Article editor snapshot.
2. Add a deterministic TypeScript Observation Builder that owns normalization, identity checks, asset mapping, and `page_revision`.
3. Update the cover transaction to check file-input binding, wait through a bounded stability window, and return stable reason codes.
4. Add the corresponding single-anchor inline-image transaction with Alt readback and ordinal verification.
5. Add a Draft-only Host Bridge dispatcher for navigate, observe, cover, and inline commands.
6. Preserve the existing attempt budget and hard deadline; never retry inside Host code.
7. Add a packaged CLI parity gate that runs before build can mask stale `dist` artifacts.
8. Rerun a separately approved 15-minute Draft-only smoke after offline verification.

## Verification

- status: offline-pass
- commands_or_checks: RED/GREEN Host helper, media-attempt and deadline tests; `pnpm check`; 172-test planned suite; clean Skill/manifest validation; five Fast Path acceptance scenarios; Chrome local-page transport attempt
- result_summary: Task 1 Host helper 18/18 passed; Task 2 full Adapter regression 118/118 passed; Task 3 Adapter/CLI suite 151/151 passed; planned suite 172/172 passed; final aggregate check passed lint, typecheck, build, 177 test files with 1218 tests passing and 1 skipped, plus full offline acceptance; five Fast Path scenarios (0, 1, 3, 10 inline images and disconnect recovery) passed with zero duplicate writes and no Preview/Publish commands
- limitation: Chrome connected, but its URL safety policy rejected navigation to the local `file://` probe and explicitly forbade alternate-surface or local-server workarounds. The browser transport probe therefore remains unexecuted. No X navigation or mutation occurred.
- residual_risk: a local transport probe cannot prove X accepts a specific asset; one separately approved Draft-only smoke remains necessary

## Flow Record

| Step | Status | Evidence | Updated |
|---|---|---|---|
| source | done | preserved execution reports and source inspection | 2026-08-29 |
| design | review | Complete Host Bridge confirmed in conversation and written to `docs/superpowers/specs/2026-08-29-x-article-complete-host-bridge-design.zh-CN.md` | 2026-08-29 |
| plan | pending | Implementation plan begins only after written-spec Review | 2026-08-29 |
| development | pending | V3.4 remains the current implementation; V3.5 Host Bridge not started | 2026-08-29 |
| testing | reproduced | live V3.4 Draft-only smoke stopped safely at 905.985 seconds with no media effect | 2026-08-29 |
| archive | pending |  |  |

## Artifacts

- `docs/superpowers/specs/2026-08-29-x-article-browser-host-executor-repair-design.zh-CN.md`
- `docs/superpowers/specs/2026-08-29-x-article-complete-host-bridge-design.zh-CN.md`
- `docs/superpowers/plans/2026-08-29-x-article-browser-host-executor-repair.md`
- `skills/x-publishing-copilot/scripts/x-article-cover-host.mjs`
- `tests/fixtures/x-article/file-upload-probe.html`
- `harnesses/research-publishing/adapters/x/article-browser/article-media-attempt-policy.ts`
- `harnesses/research-publishing/core/x-article-fast-path-deadline.ts`

## Open Questions

Whether Chrome bound the selected file but X rejected it cannot be proven by the current Host. V3.5 must expose file-input binding evidence and distinguish it from an absent X media effect.

## Residual Risk

The Codex Chrome runtime and its **Allow access to file URLs** setting remain environment dependencies. V3.5 can diagnose this boundary but cannot change extension permissions or guarantee that X accepts an asset.
