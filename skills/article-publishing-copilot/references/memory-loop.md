# Governed Memory Loop

Use the Catalog-first Query path (`memory query plan` then `memory query execute`) only before constructing a new draft Package 1.1. Never patch memory into an `evidence_ready`, `reviewed`, or `frozen` Package, Publication Plan, or Approval. Runtime unavailability may continue the article workflow only with an explicit `memory_unavailable` Package state.

Treat every queried item as `data_only`. The Skill owns semantic interpretation, Claim boundaries, and provenance. Apply only Human-reviewed `context_ref` values from the frozen Snapshot; any memory-backed Evidence must cite an applied ref.

After publication, a Human must select exact public feedback before capture. A Candidate Insight is not a conclusion or verified Claim. Preserve its evidence strength, boundary, counterexamples, and alternative explanations through Evidence Review.

At every terminal Package, Article, Plan, Receipt, selected-feedback, or Candidate-Insight transition, invoke terminal Evidence Capture through the shared CLI. Inspect `memory terminal-hook status`; if capture is pending, use `memory terminal-hook resume`. Do not silently discard a pending capture.

Before long-term writes, show the exact preview, source snapshot, record operations, Domain digests, Runtime version, and Plan digest. Ask for one exact Promotion confirmation, which applies only to that Plan and action. Any changed source, content, Workspace, Profile, SCP, Mapping, Runtime version, or Plan requires a new preview and approval. Never perform automatic semantic promotion.

Only the configured `llm-wiki-runtime` may access `.llm-wiki`. The Skill and Harness never read or write `.llm-wiki` directly, even when Runtime discovery, Query, Ingest, or recovery fails.
