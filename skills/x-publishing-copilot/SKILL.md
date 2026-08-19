---
name: x-publishing-copilot
description: Use when preparing or publishing an evidence-backed X single post, thread, or reply through the Research Publishing Harness.
---

# X Publishing Copilot

Use the repository Harness as the deterministic boundary. The Skill may help shape the discussion and draft language; the Harness owns character limits, the Publish Gate, state, Approval, Browser Commands, public verification, and Receipts.

## Browser Adapter required flow

1. Run `scripts/invoke.mjs doctor --workspace <path> --output json` and stop if the Harness is unavailable or incompatible.
2. Prepare, accept, and review the X draft, then run `x plan --adapter browser` to create a V2 Browser Plan.
3. Show a separate Audit block containing the exact target account, mode, Reply target when present, ordered Post text, weighted lengths, link count, Adapter, Approval expiry, and Plan Digest.
4. Ask for one explicit confirmation of `publish_once` for that exact Audit block. This is the content-specific approval; do not combine it with unrelated decisions.
5. Only after the confirmation, run `x approve` with the unchanged Plan.
6. Start `x browser start` with an explicit compatible Chrome binding. Never switch to the in-app browser, Edge, or Computer Use.
7. For every pending Harness Command, follow [the Browser Host protocol](references/browser-adapter-flow.md): `x browser next` → `x browser claim` → execute exactly one authorized Chrome action → `x browser report`.
8. Never claim Submit twice. If the outcome is uncertain, use `x browser status` and `x browser resume-verification`; do not submit again.
9. Return the final status, root URL, ordered Post IDs, and immutable Receipt path. Do not call a toast, handoff, or Host success response public verification.

Any content, account, mode, link, Reply target, or Adapter change invalidates the Approval and requires a new review, Plan, Audit block, and confirmation.

## Manual explicit fallback

Manual is an explicit fallback only after a pre-submit Browser failure. Explain the failure, create a Manual Plan, show its exact Preview, and obtain a new explicit Approval before `x handoff`. Never convert an attempted or uncertain Browser submission into Manual publishing.

## Invocation

```text
node skills/x-publishing-copilot/scripts/invoke.mjs x browser status \
  --workspace <path> --execution-id <id> --output json
```

Do not request X credentials. Do not weaken or reproduce Harness Gates, page contracts, success rules, or Receipt construction inside the Skill.
