---
name: article-publishing-copilot
description: Use when turning an evidence-backed Research Content Package into a technical article, architecture note, engineering retrospective, or research proposal.
---

# Article Publishing Copilot

Use the repository Harness as the deterministic boundary. The agent may help shape the brief and draft prose; it does not reproduce validation, state, privacy, or publication logic.

## Required flow

1. Locate a compatible runtime with `scripts/invoke.mjs doctor --workspace <path> --output json`. If discovery or compatibility fails, stop and report it.
2. Confirm the user-selected research track and a Frozen Research Content Package. Run `article prepare`; use its Generation Task as the complete Claim, Boundary, and allowed-source envelope.
3. Draft one Article Candidate, preserving `verified`, `hypothesis`, and `planned` language. Submit it through `article accept-draft` and `article review`.
4. If any Gate blocks, show the findings and return to the draft. Do not bypass, weaken, or reimplement a Gate.
5. After the user chooses the reviewed final content, run `article finalize` and return the Canonical Article Package paths and digest.

The Harness owns the Publish Gate. Article finalization does not authorize external publication.

## X boundary

An article never automatically triggers X generation or publication. Run `article handoff-x` only when the user explicitly requests that separate artifact; then use `x-publishing-copilot` for the X branch.

## Invocation

Pass CLI arguments unchanged through:

```text
node skills/article-publishing-copilot/scripts/invoke.mjs article prepare --workspace <path> --input <json> --output json
```

All source discovery is read-only unless the user explicitly supplies a publishing workspace. Never request credentials: V1 has no Browser or X API adapter.
