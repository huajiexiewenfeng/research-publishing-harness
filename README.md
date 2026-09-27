# Research Publishing Harness

English | [简体中文](README.zh-CN.md)

> **Pre-alpha** — A local-first, human-governed workflow for turning ongoing technical research into evidence-backed articles, X publications, and reusable research memory.

Research Publishing Harness is a deterministic control layer around AI-assisted research and writing. Models can help investigate, frame a thesis, and draft; the Harness owns what counts as evidence, which Human Gates must pass, the exact approved content, publication state, Receipts, and durable knowledge promotion.

## Why this exists

AI-assisted research crosses three boundaries that generation alone cannot prove:

- a draft is not a verified Claim;
- a submit action is not verified publication;
- feedback is not automatically durable knowledge.

The Harness makes those boundaries explicit with Claim/Evidence lineage, Human Gates, immutable artifacts, content-bound Approval, and recoverable Receipts. It keeps a useful distinction between what a model proposes, what a human confirms, what an adapter does, and what the system can prove afterward.

## How it works

```text
Optional governed Query
          ↓
Research → Evidence → Human Review → Frozen Content Package
                                       ├→ Canonical Markdown Article
                                       ├→ X Single / Thread / Reply
                                       └→ X Article
Publication → Public Verification → Immutable Receipt
                                            ↓
                         Human-selected feedback or evidence
                                            ↓
                       Digest-bound Semantic Promotion
                                            ↓
                                 Next governed Query
```

The optional Query supplies bounded, reviewable context before a new package is built. Models may assist with investigation, thesis framing, and drafting, but the Harness owns state, Digest, Approval, publication state, and Receipt. Durable research knowledge changes only through a controlled Runtime path with explicit human confirmation.

## Responsibilities

| Layer | Owns |
| --- | --- |
| Domain Skills | Domain semantics and task method: how a research task is framed, what inputs are useful, and which Harness workflow to invoke. |
| Harness | Deterministic orchestration, state transitions, Digest calculation, Approval, Receipt, contract validation, and recovery boundaries. |
| Adapters | Bounded manual or browser handoff. They expose only the semantic actions needed by the Harness and do not become a general browser or social-media client. |
| `llm-wiki-runtime` | Deterministic Query, validation, controlled copying, record writes, indexes, and logs for governed-memory workflows. |
| Humans | Content, privacy, visual, publication, and semantic review, plus exact confirmations for the content and Digest being authorized. |

## What you can do today

### Research packaging and review

- Capture and qualify research Candidates, build versioned Research Content Packages, and keep Claim/Evidence, source lineage, privacy, editorial, and publication checks explicit.
- Review and freeze immutable package versions. An optional governed Query can provide Human-reviewed Context refs before a new package is built; it cannot patch a frozen package afterward.

### Article and X outputs

- Produce canonical Markdown Article Packages with Claim maps, source lineage, Boundary notes, and relative asset references.
- Prepare X Single, Thread, Reply, and new-publication X Article workflows with weighted character validation, exact ordered content, digest-bound Approval, and thin Skills that delegate enforcement to one CLI.
- Single posts have no Harness-imposed length cap, including Singles materialized with an Article URL. Empty/invalid text is still rejected and weighted character counting is retained. Thread items and Replies keep the standard 280-weighted-character limit. Local acceptance does not establish long-post account eligibility or platform acceptance: composer, Submit, Approval, and public-verification checks still apply.
- Article and X branches are independent optional outputs; an Article is never silently converted into a Thread.

### Visual publishing

- Attach required or optional Article Visual Slots after Content Review, normalize PNG, JPEG, and static WebP metadata, and generate a self-contained Package with a Visual Manifest and asset-covered Package Digest.
- Hand off an explicit `asset_id` to X with at most one image on Thread Post 1, including the approved Alt Text and ordinal in the Approval binding.

### Manual and Browser execution

- Create an offline Manual copy package and record a human-supplied publication URL, post IDs, and publication time; the Manual Adapter does not access X.
- Use a bounded Browser Host Bridge for an explicitly selected, already logged-in Chrome session, with account, draft, composer, fresh Submit-barrier, and public verification checks. Real browser actions require that explicit session selection and are never part of CI acceptance.
- Run the default X Article control flow as `prepare → materialize → verified Preview → confirm-publish`; no Publish command exists before the exact Preview-bound confirmation is attached.
- A compatible Chrome Host imports one digest-bound structured X Article document and then replaces its ordered temporary visual anchors. V3.2 requires both bulk capabilities and fails closed when either is absent; `block_materialization/v1` is an explicitly locked compatibility mode, never a silent fallback.
- Recovery observes the saved Editor and durable checkpoint before continuing. It never pastes raw Markdown, reimports observed content, overwrites unknown Human edits, changes strategy, or enters Preview while an anchor remains unresolved.

### Verification and recovery

- Produce immutable Final, Partial, and Unknown Receipts, rebuild the ledger, resume read-only verification, and retain only bounded artifacts.
- Treat an uncertain publication as a reconciliation state: do not blindly retry, silently fall back between adapters, or issue a second Submit/Publish command.

### Governed research memory

- Run deterministic Runtime Query before package construction and explicit `publication_checkpoint` or Human-selected `feedback_insight` Ingest plans after publication.
- Build Research Increments and evidence objects, review Semantic Deltas, and promote through a digest-bound Human Gate with Catalog-last visibility and Catalog-first progressive Query.
- Keep historical research Import bounded and explicit. Context and external feedback remain `data_only`; a feedback item can inform a Candidate Insight but cannot become a verified conclusion automatically.

## Core guarantees and Human Gates

- `Context` and external feedback are always `data_only`; they are inputs for review, not verified Claims by themselves.
- Working material is excluded from the default Mainline Query. A new package can use only the Context refs a human reviewed and bound.
- Content, Privacy, Visual, Publish, and Semantic Promotion each have an explicit Human Gate. Approval binds the exact ordered content, account, mode, adapter, Digest, and expiry where those fields apply.
- Skill and Harness code cannot write `.llm-wiki`; only the explicitly configured `llm-wiki-runtime` may perform governed Runtime operations.
- Publication uncertainty is never blindly retried. Recovery distinguishes safe resume, checksum reconciliation, and actions that require a human decision.
- Catalog-last keeps a partial Promotion invisible to the default Query until its complete, validated projection is reachable from the active Catalog.
- CI and automated acceptance use temporary workspaces and fake browser hosts. They do not publish to a real account, use stored credentials, or write a user Wiki.

## Quick start

Requires Node.js `20.19+` and pnpm `11.19`.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm build
node dist/harnesses/research-publishing/cli/index.js doctor \
  --workspace ./publishing-workspace \
  --output json
```

`pnpm check` is offline verification: it runs lint, type checking, tests, build, and Article/X/Visual/X Article/Memory acceptance without an account, credentials, real-browser publication, network publication, or user Wiki write. The `doctor` command inspects a local publishing workspace after the CLI is built.

The stable X Article V3.2 control routes are `x-article browser prepare`, `resume-editor`, `materialization-status`, and `confirm-publish`. Automated tests use temporary workspaces and fake Hosts; real Chrome performance remains a separate Browser Host verification activity.

## Choose a starting point

- [Quickstart](docs/guides/quickstart.md) — install, run acceptance, and walk through the Article, X, Browser, Visual, and Memory flows.
- [V2.3 Memory Loop](docs/guides/memory-loop.md) — follow the governed evidence, Promotion, Catalog-last, and progressive Query loop.
- [Domain Skill + Harness + Runtime integration guide](docs/guides/skill-harness-llm-wiki-runtime-integration.zh-CN.md) — reuse the Runtime boundary when onboarding a Domain Skill.
- [Architecture design](docs/architecture/research-publishing-harness-design.zh-CN.md) — read the system intent, contracts, and trust boundaries.
- [JSON contracts](harnesses/research-publishing/contracts) — inspect the versioned schemas used by the Harness.

## Repository map

```text
.
├── harnesses/research-publishing/  # deterministic domain Harness and CLI
├── skills/                         # thin Agent Skill entry points
├── tests/                          # unit, integration, security, and acceptance tests
├── docs/
│   ├── guides/                     # onboarding and reusable workflow guides
│   └── superpowers/                # design and implementation records
└── registry/                       # verifiable manifests and Harness registration
```

## Project evolution

| Stage | Main addition |
| --- | --- |
| V1 | Content packages and Manual publication |
| V2 | Bounded Browser publishing and immutable Receipts |
| V2.1 | Visual packaging and review |
| V2.2 | Governed Runtime Query/Ingest |
| V2.3 | Evidence flywheel and Catalog-first Query |
| V3 | New-publication X Article workflow |
| V3.1 | Digest-bound X Article document import and visual-anchor recovery |
| V3.2 | Resumable bulk materialization, Preview-bound one-time Publish confirmation, and performance receipts |

The stages explain where the current capabilities came from; the workflow groups above are the recommended way to use the repository.

## Explicit non-goals

This project does not autonomously select topics, schedule posts, store publishing credentials, bypass Approval or Human Gates, promote Claims automatically, blindly retry uncertain publication, support arbitrary rich HTML, provide cloud or team memory, or perform real publication from CI. It is not a generic social-media scheduler, and a manual handoff is never presented as proof of publication without a human-supplied receipt.

## Requirements and license

- Node.js `20.19+`
- pnpm `11.19`
- Optional `llm-wiki-runtime` `0.2.0` for governed-memory workflows
- Apache-2.0 License

Licensed under Apache-2.0.
