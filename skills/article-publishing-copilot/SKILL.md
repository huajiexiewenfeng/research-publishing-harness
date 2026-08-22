---
name: article-publishing-copilot
description: Use when turning an evidence-backed Research Content Package into a technical article, architecture note, engineering retrospective, or research proposal.
---

# Article Publishing Copilot

Use the repository Harness as the deterministic boundary. The agent may help shape the brief and draft prose; it does not reproduce validation, state, privacy, or publication logic.

For durable research context and post-publication learning, follow [the governed Memory loop](references/memory-loop.md). Memory Query is optional and degradable; Memory Ingest is approval-gated and fail-closed.

## Required flow

1. Locate a compatible runtime with `scripts/invoke.mjs doctor --workspace <path> --output json`. If discovery or compatibility fails, stop and report it.
2. Confirm the user-selected research track and a Frozen Research Content Package. Run `article prepare`; use its Generation Task as the complete Claim, Boundary, and allowed-source envelope.
3. Draft one Article Candidate, preserving `verified`, `hypothesis`, and `planned` language. Submit it through `article accept-draft` and `article review`.
4. If any Gate blocks, show the findings and return to the draft. Do not bypass, weaken, or reimplement a Gate.
5. After Content Review, inspect `article visual status`. The Visual Skill may create candidates and submit a chosen file, Alt Text, provenance, and Claim refs through `article visual attach`; it never chooses the Package path.
6. Run `article visual review` only after Human selection and checks for Claim alignment, Boundary alignment, mobile legibility, single-message focus, and privacy. Required unresolved Slots block Finalize; optional unresolved Slots are warnings.
7. Run `article finalize` and return the self-contained Canonical Article Package paths, Visual Manifest digest, and Package digest.

The Harness owns the Publish Gate. Article finalization does not authorize external publication.

## X boundary

An article never automatically triggers X generation or publication. A visual `article handoff-x` must include the exact user-selected `asset_id`; never choose a cover or other image automatically.

## Invocation

Pass CLI arguments unchanged through:

```text
node skills/article-publishing-copilot/scripts/invoke.mjs article prepare --workspace <path> --input <json> --output json
```

Only PNG, JPEG, and static WebP are supported. Do not bypass normalization, copy original bytes into the final Package, or introduce absolute/remote Markdown image paths. Never request credentials.
