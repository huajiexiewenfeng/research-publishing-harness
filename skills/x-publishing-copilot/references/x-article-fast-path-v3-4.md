# X Article Fast Path V3.4 Host Protocol

Use this protocol only after `x-article fast-path audit` has selected the compatible existing-Draft or new-Draft mode and the Human has granted one confirmation for the exact `materialize_draft_once` Audit digest. The protocol is `x-article-materialization/v3.4`; the mode is `fast_path_v3_4` while the underlying V3.2 and V3.3 compatibility modes remain unchanged.

The confirmation authorizes deterministic Draft materialization only. It does not authorize Preview or Publish. The terminal state is `draft_reconciled`.

## Continuous Host loop

Run one continuous command consumption loop in the current task:

1. Run Fast Path `status`.
2. Obtain the existing atomic `next` command.
3. Verify the visible X page, bound account, Draft revision, command envelope, and scoped control.
4. `claim` that command.
5. Complete exactly one semantic Chrome transaction.
6. Normalize one post-transaction observation and `report` it.
7. Immediately continue from `status` unless the Harness is terminal, blocked, or explicitly requires recovery.

There is no per-image `continue` prompt; the one confirmation covers the complete digest-bound Draft materialization. Display only stage progress, not a second approval surface. Do not pause merely because one cover or inline image transaction completed.

No Subagent is created for the Host loop. Keep page ownership, command state, and recovery in the current task so that time and scope remain observable.

## Scoped Chrome transactions

- For an inline image, start at the current editor insertion point and use `Insert -> Media`; upload only the claimed digest-matching asset, restore its locked ordinal, set and read back Alt text, then wait for the bounded autosave observation.
- For a cover, resolve and operate only controls inside the cover region. Never reuse an inline-image control or an element inferred from screen coordinates.
- Execute only the claimed transaction. Never combine cover upload, another image, navigation, Preview, or Publish in the same claim.
- Report only the normalized semantic observation accepted by the Harness, then discard stale element references.

### Complete Host Bridge binding

For `navigate`, `observe_article_page`, `upload_article_cover`, and `replace_article_visual_anchor`, import `scripts/x-article-host-bridge.mjs` and call `runXArticleHostBridge` with the selected Chrome tab, exact claimed command and claim, verified Host context, and at most one verified absolute asset path. Do not call Cover or Inline Host modules directly. Do not handwrite `evaluate`, `filechooser`, or `setFiles` logic. Report `outcome.report` exactly once, then discard all page locators.

Prefer the actual scoped `input[type=file]`. Register the chooser before its causal click, verify the selected input binding without exposing a local path, and never use `locator.setInputFiles`. Do not locally retry a chooser or file selection in the same claim.

## Recovery and stop conditions

The Fast Path permits one recovery after a disconnect. Invoke `x-article fast-path recover` only when status requires it; recovery is read-only reconciliation and does not grant another write, reimport, or confirmation. If recovery is exhausted or the visible page cannot satisfy the scoped command, stop as blocked.

Stop immediately when status is `draft_reconciled`. The Host must ban both Preview and Publish in this workflow. Preview review and publication require their later, separately authorized workflows.
