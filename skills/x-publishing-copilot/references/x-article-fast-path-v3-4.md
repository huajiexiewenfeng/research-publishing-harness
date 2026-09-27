# X Article Fast Path V3.4 Host Protocol

Use this protocol only after `x-article fast-path audit` has selected the compatible existing-Draft or new-Draft mode and the Human has granted one confirmation for the exact `materialize_draft_once` Audit digest. The protocol is `x-article-materialization/v3.4`; the mode is `fast_path_v3_4` while the underlying V3.2 and V3.3 compatibility modes remain unchanged.

The confirmation authorizes deterministic Draft materialization only. It does not authorize Preview or Publish. The terminal state is `draft_reconciled`.

## Continuous Host loop

Await browser work inside the same Node REPL call: `const outcome = await runXArticleHostBridge(input)`. Do not start a background browser promise and return to poll it in another call: the Chrome execution context does not survive that boundary. Keep the tool call alive until its awaited transaction returns; a lost context requires read-only reconciliation, not re-upload. Keep progress messages in the existing callback rather than detaching the browser operation.

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

The author's Markdown is the position source of truth. Preserve each inline image at its actual source location: after a heading, between paragraphs, or at a section end. During Article Draft preparation, replace each image at that location with a standalone `<!-- rph-visual:SLOT_ID -->` block and declare its Visual Slot as `{kind:"in_place"}`. Keep surrounding prose, captions and image order; import the image as a reviewed canonical asset. Finalization replaces the marker in place, and X compilation derives the existing block ordinal from the resulting document. Do not relocate images to satisfy a heading or section-end convention. Preserve legacy `after_section` packages; changing an approved image position requires a new content-bound Audit. Covers remain separate from inline images.

The bridge uses a local probe for the current marker-adjacent image, checking its locked canonical ordinal so an older neighboring image cannot masquerade as success. If that evidence is unavailable, use the bounded full observer. Final Alt, heading position, content and autosave checks still use a complete observation. Do not repeatedly extract the whole article between clicks.

Operating targets: one inline image within 90 seconds; one cover plus seven inline images within 15 minutes. These are targets awaiting live measurement, not measured guarantees. If the page/Host contract fails, save the blocked checkpoint and return the exact last verified stage. Perform debugging/build/deployment in a separate development phase; do not modify tools while consuming a publishing claim.

- All inline image formats, including PNG, default to standard file-chooser upload inside the Complete Host Bridge. PNG clipboard paste is available only when explicitly selected with `transport: 'clipboard'`; it verifies the exact bytes, focuses the locked marker and pastes once. Clipboard availability is not a prerequisite for standard upload. Never switch transports automatically after uncertain delivery.
- Wait for the marker-adjacent image to finish loading before editing Alt. A missing Edit panel does not mean the paste failed: inspect the page and retry only the bounded Edit/focus completion, never paste again. A lost paste response is uncertain and requires read-only reconciliation. Existing images beside the same marker also block another paste.
- For a cover, resolve and operate only controls inside the cover region. Never reuse an inline-image control or an element inferred from screen coordinates.
- Execute only the claimed transaction. Never combine cover upload, another image, navigation, Preview, or Publish in the same claim.
- Report only the normalized semantic observation accepted by the Harness, then discard stale element references.

### Complete Host Bridge binding

For `navigate`, `observe_article_page`, `upload_article_cover`, and `replace_article_visual_anchor`, import `scripts/x-article-host-bridge.mjs` and call `runXArticleHostBridge` with the selected Chrome tab, exact claimed command and claim, verified Host context, and at most one verified absolute asset path. Do not call Cover or Inline Host modules directly. Do not handwrite `evaluate`, `filechooser`, or `setFiles` logic. Report `outcome.report` exactly once, then discard all page locators.

For standard cover and inline uploads, use one scoped `filechooser` delivery. Inline flow: focus the exact marker → Add Media → Media → the Insert dialog's Add photos or video control → chooser `setFiles`. Register the chooser before its causal click. Prefer the already-visible dialog-scoped control over waiting for a missing dialog name; never use the page-wide cover upload button. The existing named-dialog file-input locator remains a compatibility fallback, not a direct `setInputFiles` API. Verify the saved editor result, exact Alt and planned position; transient `input.files` is not success evidence. Never directly call `runCoverUpload` or `runInlineImageUpload`; only `runXArticleHostBridge` may dispatch those helpers. Do not locally retry file selection in the same claim.

The Inline Host clicks the exact marker and verifies selection there. Marker cleanup uses current-focus keyboard input (`tab.cua.keypress`), never `locator.press` that can refocus elsewhere between selection verification and deletion. It reads Alt through bounded read-only DOM inspection, not unsupported locator `inputValue()`. A Save timeout is not a failed upload: wait for dialog closure and verify persisted Alt; never click Save or upload again merely because the click timed out.

The Inline Host owns one bounded completion recovery inside the same live claimed transaction. Once delivery is dispatched, completion recovery cannot paste or select a file again. A fresh marker-local probe identifies the existing image and its persisted Alt; matching Alt skips editing and proceeds to marker cleanup. After Save, require exact persisted Alt before clearing the recovery marker. A timed-out Edit click is followed by inspection of the existing dialog. Exact selected-marker verification remains required before deletion. Capture that block's identity, delete its selected text, then remove the resulting empty block only when the collapsed caret is still inside that same block, the previous block is text rather than media, and the next block contains the inserted image. Otherwise retain it for explicit final review; never delete arbitrary blank paragraphs or issue a blind second Backspace. The extractor's spacer normalization is compatibility behavior, not visual proof that no extra line remains.

## Inspection budget and final review

- Prepare each command with its own immutable asset path and marker; never let a shared mutable “current image” variable select another image. Reuse the unchanged approved package rather than rebuilding an Audit for routine UI transitions.
- Between actions, inspect only the current control, focus, image or dialog. Do not add manual whole-document extraction, screenshots, source rehashes or repeated status calls around every click when the Host already provides that evidence.
- Wait for actual UI readiness, not fixed sleeps. When the local image is already uploaded, do not wait for a nonexistent crop dialog; still complete Apply if that dialog is actually present.
- Keep the cheap pre-delivery existing-image check for both transports and the exact-selection check before deletion. An uncertain response is not evidence that delivery failed.
- Current compatibility contracts still require each image's Alt, marker cleanup, saved observation and report before the next command. This revision does not implement a two-pass “upload all, then clean all” workflow.
- At completion, verify the bound account and draft, title, cover, every inline asset and its source position, exact Alt, unchanged prose and heading hierarchy, no remaining markers, and saved state. Check image identity against the planned asset, not image count alone. If a field cannot be observed, disclose it rather than mark it verified. Draft completion never implies permission to Publish.

Consume the Host transaction as one awaited operation rather than orchestrating individual image clicks through separate conversation turns. Its `recovery_count`, `diagnostics` and `stage_errors` expose the completion attempt and original failure. This recovery is not permission to replay an already-reported or interrupted claim: process loss, an unresolved Save, uncertain file delivery, or exhausted recovery still requires read-only reconciliation. Final content, Alt, heading, account and saved-state verification remain mandatory. No live latency improvement is claimed by unit tests.

## Recovery and stop conditions

The Fast Path permits one recovery after a disconnect. Invoke `x-article fast-path recover` only when status requires it; recovery is read-only reconciliation and does not grant another write, reimport, or confirmation. If recovery is exhausted or the visible page cannot satisfy the scoped command, stop as blocked.

Stop immediately when status is `draft_reconciled`. The Host must ban both Preview and Publish in this workflow. Preview review and publication require their later, separately authorized workflows.
