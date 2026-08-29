# X Article Browser flow

Use this branch only for a finalized Article Package and a Premium account whose target handle is explicit.

## Prepared V3.2 flow

1. Run `x-article plan` with `package_ref` and `target_account`.
2. Verify the installed manifest and Browser Host release against `x-article-materialization/v3.2`; then run `x-article browser prepare` with the unchanged Plan file and Chrome command-capability file. V3.2 must select `rich_text_anchor_import/v1` or stop before Draft mutation.
3. Follow [the V3.2 materialization Host protocol](x-article-materialization-v3-2.md): status → next → verify → claim → one complete claimed semantic Chrome transaction → one normalized observation → report.
4. Repeat until the report or next result returns `confirmation_pending`. The final Draft must be reconciled, Preview-verified, marker-free, and have zero Publish commands.
5. Show the exact Preview confirmation card: account, Draft, title, audience `everyone`, action `publish_article_once`, cover and ordered inline assets, Article Document digest, Plan digest, and Preview revision. Stop and wait for one explicit Human confirmation.
6. Only after that confirmation, pass the exact schema-valid confirmation file to `x-article browser confirm-publish`. Continue the claim loop for the isolated at-most-once Publish command and public verification.
7. Return the public URL, verification status, and immutable Receipt path only after public verification.

Prepared V3.2 Draft work is bounded reversible preparation; it does not authorize Publish. The Preview-bound confirmation is the sole action-time Publish confirmation. Never publish twice. After a Publish command is issued, use `x-article browser resume-verification`; do not retry Publish or fall back to a Thread.

`x-article browser cancel-before-publish` remains available only before the final Publish barrier. `block_materialization/v1` is explicit compatibility selected before execution with a different locked digest; it is never a runtime fallback. Never type, upload, click, navigate, or recover outside a claimed semantic command. Never read cookies, credentials, localStorage, a full DOM, timelines, or private messages.

## Legacy preapproved compatibility

A content or Draft approval alone is not publication authority. Only an execution explicitly locked as `legacy_preapproved` and carrying a control-plane-verified publication approval may use the older `x-article plan` → `x-article approve` → `x-article browser start` → `x-article browser next` → `x-article browser claim` → `x-article browser report` flow.

For a non-Bundle legacy execution, use the existing `XArticleApprovalV1` contract. It binds the immutable Plan and approval digests, run, target account, `browser` adapter, `everyone` audience, `publish_once` scope, and expiry. The adapter validates that approval at execution start and again at the final Publish boundary; the Host does not invent or request another confirmation route.

When that approval is Bundle-derived, follow [the Publication Bundle flow](publication-bundle-flow.md): the exact child authorization derived from the one Bundle confirmation is the single action-time approval and publication authority; do not ask for a second publication confirmation.

The Browser Host never interprets approval authority. It follows only adapter state and issued commands; no issued command means no Chrome action. Never enter this flow from a prepared V3.2 execution, and never use it as recovery from V3.2.
