# Research Publishing Harness

> **Pre-alpha / V1 stable + V2.1 Visual Publishing available** — local-first infrastructure for turning ongoing AI systems research into evidence-backed public artifacts and technical conversations.

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

## Available in V2

- Deterministic Browser Host Bridge for one explicitly selected, already logged-in Chrome session
- Stable V2 Plan plus one digest-bound `publish_once` Approval
- Account, empty-draft, composer count/order/text, and fresh Submit-barrier verification
- At-most-once Submit command and durable claim, with no blind retry after uncertainty
- Read-only public Thread reconstruction and immutable Final/Partial/Unknown Receipts
- Ledger rebuild, read-only verification resume, and bounded artifact retention
- Network-free fake-browser acceptance; real Chrome smoke remains a separately approved local action

## Available in V2.1

- Required/optional Article Visual Slots and Human Visual Review after Content Review
- Metadata-stripping normalization for PNG, JPEG, and static WebP
- Self-contained Article Packages with relative image links, Visual Manifest, and asset-covered Package Digest
- Explicit `asset_id` Article-to-X handoff; at most one image and Thread Post 1 only
- One Approval binding account, mode, text, image, Alt Text, ordinal, Adapter, and `publish_once`
- Restricted Package-contained Browser upload and Source/Composer/Public media evidence

## Explicit non-capabilities

V1 does **not** call a model, choose topics autonomously, schedule posts, open a browser, use X OAuth/API, or claim that a manual handoff was published. It never stores publishing credentials.

The V2.1 Browser Adapter does not store credentials, read Browser storage, switch Browser surfaces, use X OAuth/API, schedule posts, select images automatically, or support GIF/video/multiple images. CI and automated acceptance never publish to a real X account. A real Chrome smoke requires a separate test-account Plan and Human confirmation and stops at `submit_armed` by default.

## Architecture

```text
Candidate → Research Content Package → Review → Frozen Package
                                               ├─ Article Harness → Canonical Article Package
                                               └─ X Harness → PublicationPlan
                                                                → Approval
                                                                ├─ Manual Copy Package
                                                                └─ Browser Host Bridge → Public verification → Receipt
```

The Research Content Package is the shared fact source. Article and X are independent optional outputs; an article is never automatically split into a thread.

## Install and verify

Requires Node.js 20.19+ and pnpm 11.19.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` runs lint, type checking, all tests, build, and Article, Manual X, and simulated Browser X acceptance. No account, credential, or network publication access is needed.

Build and inspect the CLI:

```bash
pnpm build
node dist/harnesses/research-publishing/cli/index.js doctor --workspace ./publishing-workspace --output json
```

See the [Quickstart](docs/guides/quickstart.md) for the Candidate → Article, Manual X, and Browser X flows.

## Security boundary

- Source text is untrusted data; instruction-like attempts cannot disable Gates.
- `internal_only` sources cannot support public Claims.
- workstation paths, token-like values, and cookies block review.
- `planned` and `hypothesis` Claims cannot be upgraded to shipped behavior.
- Approval binds exact ordered content, account, adapter, Reply snapshot, and expiration.
- The Manual Adapter creates copy/paste artifacts only; verification remains explicitly manual.
- The Browser Adapter accepts semantic, X-origin commands only; it stores no Cookie, token, password, full DOM, timeline, or private-message data.
- Browser failure never silently switches to Manual; fallback requires a new Plan and Approval.

## Design and contracts

- [Chinese architecture and product design](docs/architecture/research-publishing-harness-design.zh-CN.md)
- [V1 implementation plan](docs/superpowers/plans/2026-08-18-research-publishing-harness-v1.md)
- [V2 Browser Adapter design](docs/superpowers/specs/2026-08-19-x-browser-adapter-v2-design.zh-CN.md)
- [V2 implementation plan](docs/superpowers/plans/2026-08-19-x-browser-adapter-v2.md)
- [V2.1 Visual Publishing design](docs/superpowers/specs/2026-08-20-visual-publishing-v2-1-design.zh-CN.md)
- [V2.1 implementation plan](docs/superpowers/plans/2026-08-20-visual-publishing-v2-1.md)
- [JSON contracts](harnesses/research-publishing/contracts)
- [Synthetic public fixtures](harnesses/research-publishing/examples/synthetic)

Licensed under Apache-2.0.
