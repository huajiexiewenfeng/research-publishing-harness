# X Article Materialization V3.2 Browser Host Protocol

Use this reference only for an execution created by `x-article browser prepare`. It binds the Browser Host to protocol `x-article-materialization/v3.2`, strategy `rich_text_anchor_import/v1`, the packaged manifest, and one explicit existing Chrome session.

## Release and capability gate

Before `prepare` or any Chrome Draft mutation, verify all of the following:

- `registry/manifests/research-publishing.json` declares protocol `x-article-materialization/v3.2`, default strategy `rich_text_anchor_import/v1`, page contract `x-article-web/2026-08`, and the compatible runtime/Skill/manifest/Browser Host release set.
- The Browser Host release declares the semantic transactions `import_article_document` and `replace_article_visual_anchor` plus the wait behavior `materialization_progress`.
- The JSON passed to CLI `--capabilities` is the exact Chrome command-capability manifest: `executor=codex-chrome`, a nonblank `executor_version`, `browser_family=chrome`, unique supported command kinds, and an ISO `observed_at`. It includes `import_article_document` and `replace_article_visual_anchor` plus every command kind required by the Plan.

`materialization_progress` is a Host release-set behavior and persists as `x-article-materialization-progress/v1`; it is not an X Article Browser command kind. Do not add it to the CLI `capabilities` array and do not invent an `x-article browser progress` command.

If the runtime, packaged Skill, registry manifest, Page Contract, or Browser Host release is not the same compatible V3.2 set, stop before `prepare` and surface `ARTICLE_RUNTIME_VERSION_MISMATCH`. If the CLI command-capability manifest lacks `import_article_document` or `replace_article_visual_anchor`, `prepare` fails before Draft mutation with `ARTICLE_BULK_IMPORT_REQUIRED`. Do not create, type into, upload to, or navigate a Draft after either error.

`block_materialization/v1` is a separately planned compatibility strategy with a different locked digest. During a prepared V3.2 execution, never switch to `block_materialization/v1`, `insert_article_block`, or legacy incremental recovery.

## Exact CLI surface

Invoke the packaged Harness through `node skills/x-publishing-copilot/scripts/invoke.mjs`. Use only the implemented flags:

```text
x-article browser prepare --workspace <path> --plan <plan.json> --capabilities <capabilities.json> --output json
x-article browser materialization-status --workspace <path> --execution <id> --output json
x-article browser next --workspace <path> --execution-id <id> --output json
x-article browser claim --workspace <path> --execution-id <id> --command-id <command_id> --output json
x-article browser report --workspace <path> --input <report.json> --output json
x-article browser resume-editor --workspace <path> --execution <id> --output json
x-article browser confirm-publish --workspace <path> --execution <id> --confirmation <confirmation.json> --output json
```

`resume-editor --execution-id <id>` is a compatibility alias, not the stable V3.2 spelling. `next` and `claim` still use their implemented `--execution-id` flags. `report` receives the execution identity inside its exact input and takes no invented `--execution` flag.

`materialization-status` is redacted and read-only. Its result has outer fields `ok`, `operation`, `artifact`, and `state`; `artifact` contains only `execution_id`, `phase`, `publication_plan_digest`, `materialization_digest`, `receipt`, `confirmation`, and `publication_status`. It does not expose the strategy or Browser command. Verify the protocol from the packaged manifest and the strategy/digest from the locked materialization Plan; never infer or add fields to the status response.

`next` returns `artifact.snapshot` and `artifact.command`. A non-null command uses the exact `x-article-browser-command/1.0` envelope fields:

```text
schema_version, execution_id, run_id, draft_id, kind, purpose,
expected_page_revision, allowed_origin, side_effect, payload,
command_id, payload_digest, issued_at
```

The schema field is `payload_digest`, which must equal the digest of the exact payload. There is no `command_digest` field in this command schema. Treat the persisted full envelope as immutable and echo that exact command in the report.

`claim` returns `artifact` with exactly `schema_version`, `execution_id`, `command_id`, `claimed=true`, and `claimed_at`. Execute only when those identities equal the pending command.

The report JSON has exactly three top-level fields:

```json
{
  "command": "the exact command object returned by next",
  "status": "success | transient_failure | uncertain | rejected",
  "observation": "one normalized x-article-browser-observation/1.0 object, or null"
}
```

Do not add progress, diagnostics, screenshots, DOM, or a second observation to the report. `report` returns the updated execution snapshot as `artifact` and repeats its execution state in outer `state`.

## Executable Host loop

For one prepared execution:

1. Run `materialization-status` with `--execution`. Bind the returned execution, publication Plan digest, materialization digest, phase, receipt state, and confirmation state to the locked local evidence.
2. Run `next` with `--execution-id`. If `artifact.command` is null and `artifact.snapshot.state` is `confirmation_pending`, stop. Any other null command is a status/recovery condition, not permission to improvise a browser action.
3. Before claim, verify the exact protocol and strategy; target account from the locked Plan and current Chrome session; `allowed_origin=https://x.com`; current page kind; command and URL Draft identity; `expected_page_revision` when non-null; immutable full command envelope; and `payload_digest`. Reject a mismatch without Chrome mutation.
4. Run `claim` with the exact execution and command IDs. Verify the returned claim identities and `claimed=true`.
5. Execute the complete claimed semantic transaction in the selected Chrome binding. A claim authorizes no other command or page action.
6. During each bounded stability wait, emit `materialization_progress` at 20 seconds and every further 20 seconds only while the same wait remains active. Keep the same Chrome binding and transaction. Do not emit timer progress before a wait, after it completes, or while waiting for the Human.
7. At transaction completion or bounded failure, capture exactly one normalized post-transaction `x-article-browser-observation/1.0`. Its `execution_id` and `command_id` must match the claim; `origin` is `https://x.com`; `page_revision` covers the normalized observation; account, page kind, Draft, editor/Preview state, controls, and timestamps must match the observed page.
8. Write one report JSON with the exact command, one status, and that observation (or `null` only when no trustworthy observation is available), then run `report`.
9. Return to step 1. Never type, choose a file, click, navigate, retry, reimport, reconcile, or perform recovery between reports unless a new claimed command authorizes it.
10. When `report` or `next` returns execution state `confirmation_pending`, stop the loop. Show the verified Preview confirmation card and wait for the Human.

## Complete claimed Draft transactions

The checks below are live checks against the selected explicit Chrome binding. A prior smoke, fixture, screenshot, log, or remembered page state is not evidence for the current command. Record a checklist result only from the current page and the exact immutable command, claim, locked publication Plan, materialization Plan, and Package.

### Body import checks

`import_article_document` is one semantic transaction. Immediately before focusing the body target or pasting, all of these preconditions must be true:

- `origin = https://x.com`: the active URL origin equals both `command.allowed_origin` and the observation contract origin.
- `account = Plan target`: the current account equals `materialization_plan.target_account` and the publication Plan target.
- `URL Draft ID = command Draft ID`: the numeric Draft ID parsed from the active editor URL equals non-null `command.draft_id` and `editor.draft_id`.
- `page revision = command expected revision`: the freshly normalized current-page revision equals non-null `command.expected_page_revision`.
- `title = approved title`: `editor.title` equals the title locked by the publication Plan.
- `body blocks = 0`: `editor.blocks.length` is zero.
- `inline visuals = 0`: no `editor.visuals` entry has `kind=inline`.
- `unknown content = false`: `editor.has_unknown_content=false`, and `editor.import_state=null`.
- `command claim exists`: the persisted claim has the same `execution_id` and `command_id` as the exact pending `import_article_document` command and says `claimed=true`.
- The command payload is exact: `payload.kind=import_article_document`; `payload.target_ref` is the body target; `payload.package_root` and `payload.package_digest` equal the locked Package; `payload.template.source_document_digest` equals `materialization_plan.document_digest`; `payload.template.template_digest` equals `materialization_plan.import_template_digest`; and `command.payload_digest` is the digest of that unchanged payload.

If any precondition is false or cannot be observed uniquely, do not focus, paste, type, upload, or otherwise mutate the Draft. Report the claimed command truthfully and stop for adapter reconciliation.

When every precondition passes, focus only `payload.target_ref`, paste `payload.template` exactly once, wait at most 45 seconds for editor stability and at most 30 seconds for autosave, then capture one normalized post-transaction observation. `status=success` is permitted only when:

- observation, execution, command, origin, account, Draft, and freshly computed `page_revision` are mutually consistent;
- `editor.import_state.template_digest` equals `payload.template.template_digest` and `materialization_plan.import_template_digest`;
- `editor.import_state.source_document_digest` equals `payload.template.source_document_digest` and `materialization_plan.document_digest`;
- `editor.import_state.unresolved_anchors` exactly equals `payload.template.anchors` in its original order, and those identities/ordinals correspond to the ordered `materialization_plan.visual_anchors`;
- `editor.visuals` contains no inline visual, `editor.has_unknown_content=false`, and `editor.autosave_state=saved`.

The transaction uploads no image, issues no second paste, and performs no Publish.

### Image replacement checks

`replace_article_visual_anchor` is one semantic transaction for one asset. Repeat the origin, account, URL Draft ID, page-revision, title, and exact-claim checks immediately before opening a picker or selecting a file. Then require all of these image preconditions:

- `one target anchor`: `editor.import_state.unresolved_anchors` contains exactly one entry matching every field of `command.payload.anchor`; duplicate, missing, reordered, or otherwise ambiguous matches fail closed.
- The command anchor and asset equal one ordered `materialization_plan.visual_anchors` entry: `anchor_id`, `asset_id`, `block_ordinal`, `asset.digest=asset_digest`, `asset.alt_text=alt_text`, and the planned `context_digest`; `payload.package_digest` equals the locked Package digest.
- The file resolved from the locked Package root plus `payload.asset.relative_path` remains inside that Package, is a regular non-symlink file, has the exact `payload.asset.digest`, and has the declared `payload.asset.mime_type`. Re-resolve containment and recompute the digest immediately before upload.
- There is no completed target media: no existing `editor.visuals` entry already claims this execution-owned asset at the target ordinal, and no duplicate or ambiguous media could be mistaken for it.

Select only that Package-contained file. Wait at most 60 seconds for media readiness; if X groups it elsewhere, move that exact execution-owned media to `payload.anchor.block_ordinal`; set and read back exactly `payload.asset.alt_text`; remove only the claimed anchor; wait at most 30 seconds for autosave; then capture one normalized post-transaction observation. `status=success` is permitted only when:

- the target anchor is absent, while every remaining unresolved anchor preserves the exact planned suffix order;
- exactly one `editor.visuals` entry has `asset_id=payload.asset.asset_id`, `kind=inline`, `block_ordinal=payload.anchor.block_ordinal`, `alt_text=payload.asset.alt_text`, `status=uploaded`, and `owned_by_execution=true`;
- the normalized blocks surrounding that ordinal and the claimed anchor recompute the exact `materialization_plan.visual_anchors[].context_digest`; do not invent a `context_digest` property in the observation or adapter report;
- `editor.has_unknown_content=false` and `editor.autosave_state=saved`.

Any timeout, partial effect, unknown effect, disconnect, or revision drift ends the bounded transaction. Emit the due progress first, capture the best single normalized observation, and report `transient_failure`, `uncertain`, or `rejected` as truthful. Do not retry locally. Recovery starts only through `resume-editor`, followed by a new `next` and newly claimed observe/reconcile transaction; it never reimports a body that may already exist.

## Structured failure record and recovery rules

The Host may render one operator-facing failure record beside the exact adapter report. This record is not a new contract, is not an `x-article-browser-observation/1.0`, and must never be added to the exact `{command,status,observation}` JSON accepted by `x-article browser report`:

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

Use the claimed command purpose for `stage`, its payload asset ID or `null` for `asset_id`, the bounded-wait clock for `elapsed_seconds`, the current wait reason or `null` for `waiting_for`, and the existing progress value `none | partial | complete | unknown` for `observed_effect`. The result is deterministic:

| Failure | Adapter report | `safe_next_action` | `retry_authorized` |
|---|---|---|---|
| page drift: current normalized revision differs from `expected_page_revision` | `rejected`, with the best trustworthy observation | `report_and_reconcile` | `false` |
| anchor ambiguity: the claimed anchor is missing, duplicated, reordered, or not unique | `rejected`, with the best trustworthy observation | `report_and_reconcile` | `false` |
| upload uncertainty: a chooser/upload/media-processing effect may have occurred but one exact completed visual cannot be proved | `uncertain`, with the best trustworthy observation or `null` | `report_and_reconcile` | `false` |
| autosave failure: `autosave_state=failed` after a mutation | `transient_failure`; use `uncertain` instead if the resulting content cannot be trusted | `report_and_reconcile` | `false` |
| Chrome disconnect: the binding is lost during a claimed transaction | `uncertain` when any effect may have occurred; only a provable pre-effect disconnect is `transient_failure` | `report_and_reconcile` | `false` |
| Preview mismatch: Preview differs from the locked title, document, visuals, Alt, order, account, Draft, audience, or revision | `rejected`, with the normalized Preview observation | `report_and_reconcile` | `false` |
| Publish outcome unknown: a separately authorized Publish effect may have occurred but its outcome is not observable | `uncertain`, with the best trustworthy observation or `null` | `report_and_wait_for_read_only_command` | `false` |

`retry_authorized` is always `false` in a failure record. Time passing, a still-visible button, the old claim, a local refresh, or an operator guess never changes it. After the report, stop. Only a later exact adapter command returned by `next` and successfully claimed may authorize its own stated action. A read-only reconcile command may observe; it does not authorize repeating an import, upload, Preview mutation, or Publish.

These live checklists are Draft-only: they authorize zero `publish_article_once` commands, zero Publish clicks, and zero deletion or cleanup of diagnostic Drafts. Preserve uncertain external state, never fabricate live evidence, and never claim a check passed unless it was observed in the current explicit Chrome session.

For `open_article_preview`, wait at most 45 seconds and report one normalized Preview observation. Never enter Preview with any unresolved anchor, unknown content, duplicate body/image, unverified inline Alt, or unsaved Editor state.

## Preview confirmation boundary

At `confirmation_pending`, the Draft loop has zero Publish commands. Present a confirmation card bound to the exact target account, Draft ID, title, audience `everyone`, action `publish_article_once`, cover and ordered inline asset digests, Article Document digest, publication Plan digest, and Preview revision.

Stop. Do not run `confirm-publish`, claim `publish_article_once`, or click Publish as part of Draft materialization. After one explicit Human confirmation of that exact card, the caller may supply the schema-valid confirmation file to the implemented `confirm-publish` route. Any content, asset, account, Draft, audience, Plan, or Preview revision change invalidates the card and requires a newly verified Preview.
