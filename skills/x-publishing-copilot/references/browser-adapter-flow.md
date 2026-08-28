# Browser Adapter Host Flow

Use the first section only after a V2.0 or V2.1 Single, Thread, or Reply Browser Plan and its digest-bound Approval exist. Prepared X Article V3.2 executions use the version-bound section below.

```text
Harness next
→ verify the command envelope and exact https://x.com origin
→ Harness claim
→ execute exactly one documented Chrome action
→ collect only the schema-approved semantic Observation fields
→ Harness report
→ discard old tab target references
→ repeat
```

The Host reuses the explicit Chrome Browser binding and its existing login. If the bound tab becomes stale, reacquire only the X tab and obtain a fresh Harness Observation before continuing. Read no Browser storage and persist no credentials, unrelated tabs, timelines, or private messages.

`next → claim → execute → report` is the only Single, Thread, or Reply action loop. Never make a second Submit claim. A claimed Submit with an uncertain result permanently switches the workflow to read-only verification; call `resume-verification` rather than attempting another write.

Execute only the command kind and target reference in the claimed envelope. Reject a changed page revision, non-X origin, unknown command kind, unsupported Browser family, or extra Host payload. When the Chrome binding is unavailable, report `BROWSER_EXECUTOR_UNAVAILABLE` and stop instead of switching surfaces.

For V2.1, the only additional commands are `upload_attachment` and `set_attachment_alt_text`. Re-resolve Package containment, reject directory/symlink/escape, and recompute source digest and MIME before upload. Upload no arbitrary Host path. Re-observe attachment count, ordinal, type, state, Alt Text, and unchanged text before Submit.

## X Article V3.2 materialization

Read [the complete V3.2 Host protocol](x-article-materialization-v3-2.md) before any X Article Chrome action. Its loop is version-bound to `x-article-materialization/v3.2` and `rich_text_anchor_import/v1`.

```text
materialization-status
→ next
→ verify the exact release, Plan, account, origin, Draft, revision, payload digest, and strategy
→ claim
→ execute the complete claimed semantic Chrome transaction
→ emit materialization_progress every 20 seconds only during a bounded wait
→ capture one normalized post-transaction observation
→ report
→ repeat until confirmation_pending
```

One V3.2 claim authorizes one complete semantic transaction, which may contain the bounded local UI substeps needed to finish that command. It does not authorize a second command, a second report, or unrelated typing, file selection, navigation, observation, or recovery. The only local file allowed during a claimed asset command is the exact Package-contained, digest-matching asset in its payload.

The observed X Article editor has no `.md` upload path. `import_article_document` imports the structured template once into the claimed empty titled Draft and verifies its template/source digests, ordered anchors, unknown-content flag, and autosave state. `replace_article_visual_anchor` replaces exactly one named anchor with the one claimed asset, restores its planned ordinal, writes and reads back inline Alt, removes the anchor, and waits for autosave before the single observation.

After bulk import starts, never use `insert_article_block`, reimport, or change strategy. Recovery begins with `resume-editor` and a newly issued observe/reconcile command; never perform an unclaimed recovery action. Stop at `confirmation_pending`, display the verified Preview card, and wait for the Human. `confirm-publish` and the later at-most-once Publish loop are outside the Draft materialization transaction.

## X Article V3.3 existing Draft media completion

Use [the complete V3.3 media-completion protocol](x-article-existing-draft-media-completion-v3-3.md) only when the normalized source Observation proves that the selected existing Draft already has the exact title, complete body, every locked visual anchor, and zero media. Enter through `prepare-existing-media`; never substitute the new-Draft `prepare` route.

The command loop remains status → next → verify → claim → one semantic Chrome transaction → one normalized observation → report. It may navigate to and re-observe the bound Draft, upload the planned cover, replace one locked inline anchor, set and read back Alt text, checkpoint progress, and reconcile the final Draft. It must not create a Draft, rewrite title/body, open Preview, or Publish. Stop at `draft_reconciled`.
