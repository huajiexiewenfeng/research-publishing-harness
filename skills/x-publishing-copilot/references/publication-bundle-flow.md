# Publication Bundle Flow

Use this branch only for one Weekly Cycle whose locked output is one X Article followed by one English anchor Single containing that Article's verified canonical URL.

## Required sequence

```text
publication bundle plan → audit
Human gives one exact Bundle confirmation for the shown bundle_digest
publication bundle approve → article-authorization
x-article browser start → publication bundle bind-article-execution
x-article browser next/claim/report until terminal or recoverable
publication bundle attach-article-receipt when a Receipt exists
publication bundle materialize-single → single-authorization
x browser start → publication bundle bind-single-execution
x browser next/claim/report until terminal or recoverable
publication bundle attach-single-receipt → joint Receipt
```

Run `publication bundle status` before each child start. Install `bind-article-execution` before `x-article browser next`. Install `bind-single-execution` before `x browser next`. A binding retry may name only the already-bound execution.

The one exact Bundle confirmation covers the frozen Article Plan, tokenized Single intent, account, optional Visual, Article-first order, policy, and TTL. During a valid normal Bundle, do not ask for a second publication confirmation. Any changed content, URL policy, account, Visual, order, TTL, or child Plan requires a newly reviewed publication outside the old Approval.

## Recovery and stop rules

- For `outcome_unknown`, inspect Bundle and child status, then use only the existing child `resume-verification` path.
- Never replay Submit. Never start or bind a replacement execution after any Submit or Publish attempt.
- Article or Single verification conflict, terminal failure, or Bundle Approval expiry stops the Bundle.
- A superseding verified Single Receipt may follow an immutable unknown Receipt Binding; it must remain on the same bound execution.
- Manual fallback is a new, separately reviewed publication. It is never a continuation of the old Bundle Approval.
- The joint Receipt does not mark the Weekly Cycle `published` and does not authorize a Weekly Outcome.
- Memory Promotion requires a separate confirmation. Bundle Approval never authorizes semantic promotion or direct `.llm-wiki` writes.

Return the Bundle phase, both verified public URLs when completed, child Receipt limitations, and the immutable joint Receipt path. Treat `published_media_unverified` as a limitation, not full media proof.
