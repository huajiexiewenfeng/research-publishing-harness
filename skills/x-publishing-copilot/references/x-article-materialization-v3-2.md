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

`import_article_document` is one semantic transaction. Verify an empty titled target Draft with no body blocks, visuals, anchors, or unknown content; focus the claimed body target; paste the exact structured template once; wait at most 45 seconds for editor stability and at most 30 seconds for autosave; then read one normalized import projection. Success requires the exact template/source digests, ordered unresolved anchors, `has_unknown_content=false`, and `autosave_state=saved`. It uploads no image and performs no Publish.

`replace_article_visual_anchor` is one semantic transaction for one asset. Verify exactly one claimed anchor, Package containment, a regular non-symlink file, Package/asset digest, MIME, ordinal, context, and no completed target media; select only that payload asset; wait at most 60 seconds for media readiness; move the media to the claimed block ordinal if X grouped it elsewhere; write and read back the exact inline Alt; remove the anchor; and wait at most 30 seconds for autosave. The single observation must show the anchor absent, one execution-owned uploaded inline visual at the approved ordinal, exact Alt/context, and saved autosave state.

For `open_article_preview`, wait at most 45 seconds and report one normalized Preview observation. Never enter Preview with any unresolved anchor, unknown content, duplicate body/image, unverified inline Alt, or unsaved Editor state.

A timeout, partial effect, unknown effect, disconnect, or revision drift ends the bounded transaction. Emit the due progress first, capture the best single normalized observation, and report `transient_failure`, `uncertain`, or `rejected` as truthful. Do not retry locally. Recovery starts only through `resume-editor`, followed by a new `next` and claimed observe/reconcile transaction; it never reimports a body that may already exist.

## Preview confirmation boundary

At `confirmation_pending`, the Draft loop has zero Publish commands. Present a confirmation card bound to the exact target account, Draft ID, title, audience `everyone`, action `publish_article_once`, cover and ordered inline asset digests, Article Document digest, publication Plan digest, and Preview revision.

Stop. Do not run `confirm-publish`, claim `publish_article_once`, or click Publish as part of Draft materialization. After one explicit Human confirmation of that exact card, the caller may supply the schema-valid confirmation file to the implemented `confirm-publish` route. Any content, asset, account, Draft, audience, Plan, or Preview revision change invalidates the card and requires a newly verified Preview.
