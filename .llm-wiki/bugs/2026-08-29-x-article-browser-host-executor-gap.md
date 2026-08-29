# Bug Brief: X Article Browser Host has no executable media transaction

## Summary

- title: X Article Fast Path emits media commands but has no reusable executable Chrome transaction
- status: planned
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
- next_gate: implementation plan review
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

## Reproduction

- status: reproduced
- command_or_steps: prepare an existing-Draft Fast Path with one cover and three inline images; claim and attempt the first `upload_article_cover` command twice
- observed: `Cover 0/1`, `Inline images 0/3`, no page media effect, non-terminal state after the time budget
- expected: one verified cover or a terminal bounded failure
- limitation: the first chooser call returned without a visible X effect, but the exact transport-layer cause is not yet proven

## Scope

- active: executable cover-upload helper under `x-publishing-copilot`, focused Host tests, media attempt budget, Fast Path hard deadline
- read_only: preserved live Draft, existing V3.2/V3.3 command and observation schemas, Codex Chrome runtime documentation
- candidate: inline-image executable transaction after the cover slice passes
- excluded: Article content, visual bytes, Preview, Publish, Draft cleanup, standalone browser profile, new approval or digest models, Subagents
- escalation_history: none

## Diagnosis

V3.4 implemented a stronger control plane without packaging the media mutation as executable Host code. The Skill therefore leaves the highest-risk step to turn-specific agent code. Failure reports trigger reconciliation, but the next-command path can emit another cover command whenever the cover is still absent. The 900-second value is currently projected as status data rather than enforced as a terminal deadline.

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

## Verification

- status: not-run
- commands_or_checks: RED/GREEN focused Host helper tests; adapter retry/deadline tests; typecheck; focused X Article suite; Skill validation; local non-X upload probe
- result_summary: pending implementation
- limitation: no new live X mutation is authorized by this Bug Brief
- residual_risk: a local transport probe cannot prove X accepts a specific asset; one separately approved Draft-only smoke remains necessary

## Flow Record

| Step | Status | Evidence | Updated |
|---|---|---|---|
| source | done | preserved execution reports and source inspection | 2026-08-29 |
| design | done | `docs/superpowers/specs/2026-08-29-x-article-browser-host-executor-repair-design.zh-CN.md` | 2026-08-29 |
| plan | active | `docs/superpowers/plans/2026-08-29-x-article-browser-host-executor-repair.md` awaiting execution choice | 2026-08-29 |
| development | pending |  |  |
| testing | pending |  |  |
| archive | pending |  |  |

## Artifacts

- `docs/superpowers/specs/2026-08-29-x-article-browser-host-executor-repair-design.zh-CN.md`
- `docs/superpowers/plans/2026-08-29-x-article-browser-host-executor-repair.md`

## Open Questions

None blocking for the cover-only slice. Inline images remain explicitly deferred.

## Residual Risk

The Codex Chrome runtime remains an environment dependency. The repair makes its transaction reusable and testable but does not turn the public npm CLI into a standalone browser automation product.
