# Single visuals, quoted articles, and manual completion

## Prepare one image without an Article workflow

Reuse the confirmed image or prepare a new one before the publication Plan. Use the available image skill for generation/editing; inspect the output, remove sensitive information when relevant, and write factual Alt text (up to 1000 characters). One useful diagram is the default for a research-sharing Single, not a mandatory decoration for every post.

After `x prepare`, `x accept-draft`, and `x review`, pass this input to `x plan --adapter browser --run-id <run> --input <file>`. The image's Claim references must exist in the frozen research package:

```json
{
  "single_visual": {
    "source_path": "C:/publication/team-diagram.png",
    "asset_id": "team-diagram",
    "alt_text": "A developer works with three teams, each with a Manager and Workers.",
    "claim_refs": ["team-workflow"]
  }
}
```

Do not supply `article_handoff` and `single_visual` together. The Harness validates and imports the file into a contained asset package and produces V2.1. The legacy field `article_package` is retained for compatibility; this path does not require an Article draft, Article review, or Article Handoff. Preview the packaged image, which may be normalized, and use the returned asset/digest for approval and upload.

## Quote an existing X Article

Use `format: single` with optional `quote_post` on the X draft. It has the same shape as a target snapshot: `id`, canonical `https://x.com/<author>/status/<id>` URL, `author` handle, and `snapshot_digest`. Obtain the article's public semantic observation and calculate its snapshot digest with the Harness's canonical `sha256` function. A plain URL in the text is not a verified Quote binding. Do not include a duplicate URL in the text solely to manufacture the card.

The Plan locks `intent.quote_post`. Its approval covers the quoted article along with the text and image. The existing Browser Adapter issues navigation to the article, a target-scoped Repost click, then the Quote menu item. Never click the Repost menu item itself. Once the Quote composer is open, the remaining sequence is normal text, one image upload, saved Alt, and final review.

Supply these additional semantic fields in Browser observations:

- On the target article: `quote_controls: { repost_ref, quote_ref }`, with null for an unavailable control. Refs must name actual observed nodes belonging to the target article/menu, not another timeline post. Include the locked article in `public_posts` for snapshot verification.
- In the open composer: `composer_quote_post_id` from the actual attached card; null if no card exists. Do not infer it from the planned URL. Scope `nodes` to the modal plus the account control; exclude the page's background Reply box.
- On the published Single: `quoted_post_id` from the attached article. Extract the Single's own text, links, and image separately from the nested article's title, cover, and body; do not count the article cover as the Single's attachment.

Use the existing claim/action/report loop. A missing/wrong Quote before submission stops execution; a missing/wrong Quote after submission prevents verified success. Do not resubmit on uncertain outcome. The expected visual order is text → attached image → quoted article card; verify the actual UI instead of assuming a pasted link created that layout.

## The Human has already published

Do not run `x approve`, start a Browser execution, or recreate a publish attempt just to record this event. Obtain the exact public URL, inspect it read-only, and compare it with the prepared V2.0/V2.1 Plan. If there was no Plan, prepare an unapproved evidence-matching Plan from the source; it grants no publishing authority.

Call `x record-observed --input <file>` with `{ "plan": <plan>, "observation": <BrowserObservation> }`. The observation must use the public root URL, exact author/text/links/Quote and visible image/Alt evidence, with the canonical `page_revision`. Only include the relevant publication, never the timeline or unrelated private data.

The command writes an immutable `manual-observed/v1` receipt and its Plan/observation evidence. It records `publication_actor: human`; `manual_verified` means the observed fields match, while `manual_media_unverified` preserves missing public media/Alt evidence. It neither fabricates automated submission evidence nor changes an existing Browser execution. If an older execution could still submit, inspect and cancel it before proceeding; if submission was attempted, only reconcile it read-only.

The receipt is local publication evidence, not an automatic LLM Wiki update. Continue the governed memory workflow separately; never report memory synchronization without its own result.
