# Research Publishing Harness

> **Pre-alpha / V1** — local-first infrastructure for turning ongoing AI systems research into evidence-backed public artifacts and technical conversations.

Research Publishing Harness separates generative work from deterministic publication controls. An agent can help frame a thesis and draft prose; the Harness owns versioned contracts, Claim/Evidence boundaries, privacy review, weighted X character validation, immutable artifacts, content-specific Approval, and manual receipts.

The initial research line is enterprise AI agent runtime. The architecture is domain-neutral enough to support other technical research without becoming a generic social-media scheduler.

## Implemented in V1

- Versioned Candidate and Research Content Package lifecycle
- Research, Evidence, Privacy, Editorial, and Publish Gates
- Canonical Markdown Article Package with Claim map and source lineage
- X Single, Thread, and Reply planning with `twitter-text` weighted limits
- Digest-bound, expiring, single-publication Approval
- Fully offline Manual X copy package and user-recorded receipt
- Thin Article and X Skills that invoke one CLI
- Synthetic examples, deterministic manifest, adversarial tests, and offline acceptance

## Explicit non-capabilities

V1 does **not** call a model, choose topics autonomously, schedule posts, open a browser, use X OAuth/API, or claim that a manual handoff was published. It never stores publishing credentials. Browser and API adapters are future work, not partially implemented features.

## Architecture

```text
Candidate → Research Content Package → Review → Frozen Package
                                               ├─ Article Harness → Canonical Article Package
                                               └─ X Harness → PublicationPlan
                                                                → Approval
                                                                → Manual Copy Package
```

The Research Content Package is the shared fact source. Article and X are independent optional outputs; an article is never automatically split into a thread.

## Install and verify

Requires Node.js 20.19+ and pnpm 11.19.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` runs lint, type checking, all tests, build, and both offline synthetic workflows. No account, credential, or network publication access is needed.

Build and inspect the CLI:

```bash
pnpm build
node dist/harnesses/research-publishing/cli/index.js doctor --workspace ./publishing-workspace --output json
```

See the [Quickstart](docs/guides/quickstart.md) for the complete Candidate → Article and Manual X flow.

## Security boundary

- Source text is untrusted data; instruction-like attempts cannot disable Gates.
- `internal_only` sources cannot support public Claims.
- workstation paths, token-like values, and cookies block review.
- `planned` and `hypothesis` Claims cannot be upgraded to shipped behavior.
- Approval binds exact ordered content, account, adapter, Reply snapshot, and expiration.
- The Manual Adapter creates copy/paste artifacts only; verification remains explicitly manual.

## Design and contracts

- [Chinese architecture and product design](docs/architecture/research-publishing-harness-design.zh-CN.md)
- [V1 implementation plan](docs/superpowers/plans/2026-08-18-research-publishing-harness-v1.md)
- [JSON contracts](harnesses/research-publishing/contracts)
- [Synthetic public fixtures](harnesses/research-publishing/examples/synthetic)

Licensed under Apache-2.0.
