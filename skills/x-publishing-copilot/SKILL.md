---
name: x-publishing-copilot
description: Use when preparing or publishing an evidence-backed X single post, thread, reply, long-form X Article, or Article-first Publication Bundle through the Research Publishing Harness.
---

# X Publishing Copilot

Use the repository Harness as the deterministic boundary. The Skill may help shape the discussion and draft language; the Harness owns character limits, the Publish Gate, state, Approval, Browser Commands, public verification, and Receipts.

For research context and Human-selected discussion feedback, follow [the governed Memory loop](references/memory-loop.md). It applies equally to Single, Thread, Reply, and X Article branches.

For V2.3, use Catalog-first Query, route terminal Plan/Receipt/feedback Evidence through `memory terminal-hook status|resume`, and keep every resulting Delta unapproved until one exact Promotion confirmation. Never write `.llm-wiki`, strengthen a Claim from engagement, or perform automatic semantic promotion.

Choose the branch from the requested artifact. A Single, Thread, or Reply uses `x ...`. A finalized long-form Article Package uses `x-article ...` and [the X Article Browser flow](references/x-article-browser-flow.md), including `x-article browser next` → `x-article browser claim` → one Chrome action → `x-article browser report`. Never convert an X Article to a Thread.

When one Human-confirmed weekly publication must publish the X Article first and then materialize its verified URL into one English Single, read [the Publication Bundle flow](references/publication-bundle-flow.md). The Bundle is the approval and evidence boundary; the two existing Browser Adapters remain the only page-action owners.

For X Articles, use bulk import only when the bound Host advertises both `import_article_document` and `replace_article_visual_anchor`. The observed editor has no `.md` upload path: execute the claimed digest-bound structured-document import once, verify its template digest and ordered temporary anchors, then replace each approved anchor at its planned block ordinal. Never paste raw or unplanned Markdown, reimport during recovery, switch to incremental insertion after bulk import starts, or open Preview while an anchor remains. Hosts without both capabilities use the existing incremental `insert_article_block` path from the start. Action-time confirmation before real asset upload and the final `publish_once` command is unchanged.

## Browser Adapter required flow

1. Run `scripts/invoke.mjs doctor --workspace <path> --output json` and stop if the Harness is unavailable or incompatible.
2. Prepare, accept, and review the X draft, then run `x plan --adapter browser`. Text-only uses V2.0. Visual V2.1 requires an Article Handoff that already names one exact `asset_id`; never select an image automatically.
3. Show the exact account, mode, Reply target, ordered text, Adapter, expiry, and Plan Digest. For V2.1 also show image preview, target ordinal, Alt Text, MIME, asset id, source digest, and Article Package digest.
4. Ask for one explicit confirmation of `publish_once` for that exact Audit block. This is the content-specific approval; do not combine it with unrelated decisions.
5. Only after the confirmation, run `x approve` with the unchanged Plan.
6. Start `x browser start` with an explicit compatible Chrome binding. Never switch to the in-app browser, Edge, or Computer Use.
7. For every pending Harness Command, follow [the Browser Host protocol](references/browser-adapter-flow.md): `x browser next` → `x browser claim` → execute exactly one authorized Chrome action → `x browser report`.
8. Never claim Submit twice. If the outcome is uncertain, use `x browser status` and `x browser resume-verification`; do not submit again.
9. Return the final status, root URL, ordered Post IDs, and immutable Receipt path. Do not call a toast, handoff, or Host success response public verification.

Any content, account, mode, link, Reply target, Adapter, image bytes, asset id, Alt Text, Claim refs, or attachment ordinal change invalidates Approval.

V2.1 requires `file_upload` and `attachment_alt_text`. Execute only the Package-relative asset in the claimed command. Receipt Source, Composer, and Public evidence are separate; `published_media_unverified` is honest when X hides public fields. Never claim that X-transcoded bytes equal the source digest.

## Manual explicit fallback

Manual is an explicit fallback only after a pre-submit Browser failure. Explain the failure, create a Manual Plan, show its exact Preview, and obtain a new explicit Approval before `x handoff`. Never convert an attempted or uncertain Browser submission into Manual publishing.

## Invocation

```text
node skills/x-publishing-copilot/scripts/invoke.mjs x browser status \
  --workspace <path> --execution-id <id> --output json
```

Do not request X credentials. Do not weaken or reproduce Harness Gates, page contracts, success rules, or Receipt construction inside the Skill.
