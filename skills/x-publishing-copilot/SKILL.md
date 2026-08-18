---
name: x-publishing-copilot
description: Use when developing an evidence-backed X single post, thread, or reply from a frozen research package or an explicit article handoff.
---

# X Publishing Copilot

Use the repository Harness as the deterministic boundary. The agent may discuss positioning and draft language; it does not reproduce character, evidence, privacy, state, Approval, or publication logic.

## Required flow

1. Locate a compatible runtime with `scripts/invoke.mjs doctor --workspace <path> --output json`. If discovery or compatibility fails, stop and report it.
2. Confirm the user-selected research track, Frozen Research Content Package, target account, and `single`, `thread`, or `reply` format. A Reply also needs an immutable target post snapshot.
3. Run `x prepare`, draft one complete X Candidate from its Generation Task, then run `x accept-draft`, `x review`, and `x plan`.
4. If any Gate blocks, show the findings and return to the draft. Do not bypass, weaken, or reimplement a Gate.
5. Show the exact Preview: account, Reply target when present, ordered post text, weighted lengths, and publication digest.
6. Ask for content-specific approval of that exact Preview. Only after explicit approval run `x approve`, followed by `x handoff` with the unchanged PublicationPlan and Approval.
7. Return the Manual Copy Package and `handed_off` receipt. Run `x record-manual` only with the user's public URL, post ids, and publication time.

The Harness owns the Publish Gate. Approval is single-publication, digest-bound, account-bound, target-bound, and expires. Any content or target change requires a new review, plan, Preview, and approval.

## Invocation

```text
node skills/x-publishing-copilot/scripts/invoke.mjs x prepare --workspace <path> --input <json> --output json
```

V1 is manual-only. Never claim Browser/API publication, request X credentials, or treat `handed_off` as public verification.
