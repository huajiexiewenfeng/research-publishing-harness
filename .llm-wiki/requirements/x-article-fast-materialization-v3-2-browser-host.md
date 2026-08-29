# X Article Fast Materialization V3.2 Browser Host Contract

## Metadata

- flow_id: `x-article-fast-materialization-v3-2-browser-host`
- parent_flow_id: `x-article-fast-materialization-v3-2`
- status: `implemented-document-contract`
- live_verification: `pending`
- owner: Research Publishing Harness
- protocol: `x-article-materialization/v3.2`
- strategy: `rich_text_anchor_import/v1`

## Purpose and authority

This is the durable Browser Host contract for the live-Chrome boundary. It consumes only the exact immutable command returned by `x-article browser next`, its successful claim, the locked publication and materialization Plans, the locked Package, and one explicit existing Chrome session. It does not create a second approval path and does not change the Task 1 Host loop: status → next → verify → claim → one complete semantic transaction → one normalized observation → report.

The Host follows adapter state and issued commands; it does not interpret approval authority. Publication Bundle-derived child authorization remains the single action-time authority. These checks cover Draft materialization only and authorize zero Publish actions.

## Title materialization contract

A newly created empty Draft with an empty title is not yet body-importable. The adapter must issue `set_article_title` bound to the locked publication Plan. Before typing, the Host proves the exact claim, origin, account, URL Draft ID, expected revision, empty title, empty body, zero visuals, null import state, no unknown content, and one unique title control. It writes only the approved title, waits for editor stability and autosave, and reports success only from a fresh normalized observation containing the exact approved title and an otherwise empty saved Draft.

The title report updates the stable editor revision but leaves checkpoint body status pending. It neither proves body import nor authorizes a paste. Only a later exact `import_article_document` command returned by `next` and successfully claimed authorizes body mutation.

## Body import contract

Before `import_article_document` changes the page, the Host must prove from the current Chrome page and exact artifacts:

```text
origin = https://x.com
account = Plan target
URL Draft ID = command Draft ID
page revision = command expected revision
title = approved title
body blocks = 0
inline visuals = 0
unknown content = false
command claim exists
```

The claim identities must equal the command identities and `claimed=true`. The unchanged payload must have `kind=import_article_document`, its claimed `target_ref`, locked `package_root` and `package_digest`, `template.source_document_digest=materialization_plan.document_digest`, `template.template_digest=materialization_plan.import_template_digest`, and an exact `command.payload_digest`. A false, missing, stale, or ambiguous check stops before mutation.

After exactly one structured paste and the bounded stability/autosave waits, success requires one normalized observation bound to the command, origin, account, Draft, and current page revision; exact template/source digests; `editor.import_state.unresolved_anchors` equal to the command template anchors in order and consistent with the materialization Plan; no inline visual; `editor.has_unknown_content=false`; and `editor.autosave_state=saved`. The Host must not paste again, upload during import, or infer success from a partial projection.

## Image replacement contract

Before `replace_article_visual_anchor` opens a picker or selects a file, the Host repeats the common origin/account/Draft/revision/title/claim checks and proves:

- `one target anchor` matches every field of `command.payload.anchor`; missing, duplicate, reordered, or ambiguous anchors fail closed;
- command anchor and asset fields match one ordered materialization Plan anchor: `anchor_id`, `asset_id`, `block_ordinal`, `asset.digest=asset_digest`, `asset.alt_text=alt_text`, and planned `context_digest`;
- the locked Package digest is exact; the package-relative asset resolves inside the locked Package as a regular non-symlink file; recomputed bytes match `payload.asset.digest`; MIME matches `payload.asset.mime_type`;
- no completed or ambiguous target media already exists.

After upload, placement correction if required, exact inline Alt set/readback, anchor removal, and autosave, success requires the target anchor absent; remaining anchors in exact planned suffix order; exactly one execution-owned uploaded inline visual at `payload.anchor.block_ordinal` with the exact asset ID and Alt; surrounding normalized content recomputing the Plan `context_digest`; `has_unknown_content=false`; and `autosave_state=saved`. The observation and adapter report gain no invented context-digest field.

## Failure record

One operator-facing record may accompany, but never be inserted into, the exact adapter report:

```json
{
  "stage": "replace_article_visual_anchor",
  "asset_id": "bottom-up-extraction",
  "elapsed_seconds": 61,
  "waiting_for": "x_media_processing",
  "observed_effect": "partial",
  "safe_next_action": "report_and_reconcile",
  "retry_authorized": false
}
```

This is a presentation shape, not a schema or new persisted fault model. The adapter report remains exactly `{command,status,observation}`.

| Condition | Required handling | `safe_next_action` | `retry_authorized` |
|---|---|---|---|
| page drift | `rejected`; best trustworthy observation | `report_and_reconcile` | `false` |
| anchor ambiguity | `rejected`; best trustworthy observation | `report_and_reconcile` | `false` |
| upload uncertainty | `uncertain`; best trustworthy observation or `null` | `report_and_reconcile` | `false` |
| autosave failure | `transient_failure`, or `uncertain` if post-state is untrustworthy | `report_and_reconcile` | `false` |
| Chrome disconnect | `uncertain` if any effect may exist; `transient_failure` only when no effect is provable | `report_and_reconcile` | `false` |
| Preview mismatch | `rejected`; normalized Preview observation | `report_and_reconcile` | `false` |
| Publish outcome unknown | `uncertain`; never resubmit Publish | `report_and_wait_for_read_only_command` | `false` |

## Deterministic recovery and safety

- Every failure record has `retry_authorized=false`. An old claim, elapsed time, page refresh, visible control, or local judgment cannot authorize retry.
- After one truthful report, the Host stops. Only a later exact command returned by `next` and successfully claimed authorizes its own stated action.
- `resume-editor` requests adapter reconciliation; it does not authorize a Host mutation. A newly claimed observe/reconcile command may be read-only and never authorizes reimport, reupload, Preview mutation, or Publish.
- Draft materialization is Draft-only: zero `publish_article_once` commands, zero Publish clicks, and no deletion or cleanup of diagnostic or uncertain Drafts.
- The Host never fabricates current Chrome state. Offline fixtures, earlier smoke evidence, screenshots, logs, or blank checklist slots are not live evidence.

## Acceptance

1. The packaged reference exposes every pre/post import and image check using real V3.2 fields.
2. The seven named failure conditions produce deterministic report status, safe next action, and retry denial.
3. The exact three-field adapter report and Task 1 claim/execute/report loop remain unchanged.
4. Single Bundle approval authority remains unchanged; Draft checks add no approval or confirmation.
5. Verification truthfully remains `live smoke pending` until a separately authorized current-Chrome run fills every evidence slot.
6. Final packaging refreshes the generated registry manifest digest for the modified packaged reference.
