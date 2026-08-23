# Research Publishing Harness

> **Pre-alpha / V1 stable + V2.3 research data flywheel available** — local-first infrastructure for turning ongoing AI systems research into evidence-backed public artifacts and technical conversations.

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

## Available in V2.2

- Optional, deterministic Memory Query before a new Research Content Package is built
- Research Content Package `1.1` binding only Human-reviewed Context Snapshot refs; `1.0` remains read-only compatible
- `research-publishing` Domain Profile/SCP/Mapping with per-`research_track` isolation
- Explicit `publication_checkpoint` and Human-selected `feedback_insight` Ingest plans
- Preview plus one digest-bound Human Approval before any memory write
- Partial-failure Receipt and stepwise resume without replaying completed writes
- Restricted `llm-wiki-runtime` 0.2.0 process adapter: fixed executable/argv, JSON envelope, timeout and output cap

## Available in V2.3

- Immutable Research Increment revisions, evidence objects, canonical documents and lifecycle lineage
- Human-reviewed Semantic Delta with one digest-bound Promotion confirmation and Catalog-last visibility
- Catalog-first progressive Query through exact Catalog, Shards, records and bounded document Chunks
- Intended/observed Publication Expressions for Article, X and durable-link channels
- Write-ahead terminal Evidence hooks with explicit pending status and safe resume
- Read-only V2.2 compatibility and one-Increment, six-item historical Import with explicit gaps

## Explicit non-capabilities

V1 does **not** call a model, choose topics autonomously, schedule posts, open a browser, use X OAuth/API, or claim that a manual handoff was published. It never stores publishing credentials.

The Browser Adapters do not store credentials, read Browser storage, switch Browser surfaces, use X OAuth/API, schedule posts, select images automatically, or support GIF/video/multiple images. V3 adds new-publication X Articles through the Premium Chrome editor; editing, deleting, unpublishing, subscriber-only Articles, and arbitrary rich HTML remain out of scope. V2.2 does not monitor X, select feedback, perform semantic/vector search, ingest without approval, or provide cloud/team memory. CI and automated acceptance never publish to a real X account or write a user Wiki.

## Architecture

```text
Reviewed Context Snapshot ─┐
Candidate ─────────────────┴→ Research Content Package 1.1 → Review → Frozen Package
                                               ├─ Article Harness → Canonical Article Package
                                               └─ X Harness → PublicationPlan
                                                                → Approval
                                                                ├─ Manual Copy Package
                                                                └─ Browser Host Bridge → Public verification → Receipt

Receipt → Human-selected Feedback → Candidate Insight → exact Ingest Approval
        → llm-wiki-runtime → next reviewed Context Snapshot
```

The Research Content Package is the shared fact source. Article and X are independent optional outputs; an article is never automatically split into a thread.

## Install and verify

Requires Node.js 20.19+ and pnpm 11.19.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` runs lint, type checking, all tests, build, and offline Article/X/Visual/X Article/Memory acceptance. No account, credential, user Wiki, or network publication access is needed.

Build and inspect the CLI:

```bash
pnpm build
node dist/harnesses/research-publishing/cli/index.js doctor --workspace ./publishing-workspace --output json
```

See the [Quickstart](docs/guides/quickstart.md) for publication flows, the [V2.3 Memory Loop](docs/guides/memory-loop.md) for the governed research flywheel, and the [Chinese Skill + Harness integration guide](docs/guides/skill-harness-llm-wiki-runtime-integration.zh-CN.md) for a reusable Domain onboarding method.

## Security boundary

- Source text is untrusted data; instruction-like attempts cannot disable Gates.
- `internal_only` sources cannot support public Claims.
- workstation paths, token-like values, and cookies block review.
- `planned` and `hypothesis` Claims cannot be upgraded to shipped behavior.
- Approval binds exact ordered content, account, adapter, Reply snapshot, and expiration.
- The Manual Adapter creates copy/paste artifacts only; verification remains explicitly manual.
- The Browser Adapter accepts semantic, X-origin commands only; it stores no Cookie, token, password, full DOM, timeline, or private-message data.
- Browser failure never silently switches to Manual; fallback requires a new Plan and Approval.
- A finalized Article Package can use `x-article plan|approve|browser ...`; it is never silently converted into a Thread.
- Skill and Harness code cannot read or write `.llm-wiki`; only the explicitly configured Runtime may do so.
- Query may degrade to `memory_unavailable`; Ingest always fails closed without the exact Runtime, Plan and Approval.
- Public feedback is `data_only` evidence. It can become a Candidate Insight, never an automatic verified conclusion.

## Design and contracts

- [Chinese architecture and product design](docs/architecture/research-publishing-harness-design.zh-CN.md)
- [V1 implementation plan](docs/superpowers/plans/2026-08-18-research-publishing-harness-v1.md)
- [V2 Browser Adapter design](docs/superpowers/specs/2026-08-19-x-browser-adapter-v2-design.zh-CN.md)
- [V2 implementation plan](docs/superpowers/plans/2026-08-19-x-browser-adapter-v2.md)
- [V2.1 Visual Publishing design](docs/superpowers/specs/2026-08-20-visual-publishing-v2-1-design.zh-CN.md)
- [V2.1 implementation plan](docs/superpowers/plans/2026-08-20-visual-publishing-v2-1.md)
- [V3 X Article Browser design](docs/superpowers/specs/2026-08-21-x-article-browser-publishing-v3-design.zh-CN.md)
- [V3 implementation plan](docs/superpowers/plans/2026-08-21-x-article-browser-publishing-v3.md)
- [V2.2 governed memory design](docs/superpowers/specs/2026-08-22-llm-wiki-memory-adapter-v2-2-design.zh-CN.md)
- [V2.2 implementation plan](docs/superpowers/plans/2026-08-22-llm-wiki-memory-adapter-v2-2.md)
- [V2.3 research data flywheel design](docs/superpowers/specs/2026-08-22-research-data-flywheel-v2-3-design.zh-CN.md)
- [JSON contracts](harnesses/research-publishing/contracts)
- [Synthetic public fixtures](harnesses/research-publishing/examples/synthetic)

Licensed under Apache-2.0.
