# V2.3 Research Data Flywheel

The North Star is to turn ongoing AI systems research into evidence-backed public artifacts and technical conversations without losing lineage, boundaries, privacy, or human control.

## Governed loop

```text
Catalog-first Query → reviewed Context Snapshot → Package
→ terminal Evidence Capture → Working Increment → Semantic Delta
→ Human Review → exact Promotion Plan → one confirmation
→ Runtime writes immutable records → Index Shards → Catalog last
→ Article/X Publication Expression → selected feedback → next unapproved Delta
```

The Evidence Plane preserves verified bytes. The Semantic Plane represents Claims, Questions, Decisions, lifecycle and publication derivations. The Index Plane exposes five bounded views: `mainline`, `history`, `working`, `publication`, and `feedback`. Working material is not default-queryable.

Publication Plans describe intended content. Terminal Receipts and public/user observations describe observed content. A mismatch creates evidence; it never rewrites the intention. Feedback is `data_only`, remains supporting evidence, and cannot strengthen a Claim automatically.

## CLI routes

All commands take an explicit `--workspace`, JSON `--input`, and `--output json`.

```text
memory evidence capture|status
memory terminal-hook status|resume
memory increment assemble|status
memory lineage show
memory delta propose|review
memory promotion plan|approve|execute|status|resume
memory query plan|execute|review|bind-package
memory index doctor|rebuild-plan
memory import inspect|capture|propose
```

`memory import inspect` and `capture` receive a complete Import Manifest. `memory import propose` receives `{ "manifest": <manifest>, "evidence_snapshot_id": "..." }`. Import is bounded to one Increment and exactly six ordered Thread items; missing platform IDs, URLs, and metrics stay explicit gaps. `thread.published_at` preserves the historical publication time, while top-level `imported_at` records when the legacy material entered the Harness; these timestamps must not be substituted for each other.

Review the generated Import Delta with `review_id: "review_<import_id>"`. The imported `accepted` lifecycle event is pre-bound to that exact Human Review; a different Review id makes Promotion planning fail closed.

The example manifest is structurally complete but its workspace identity and artifact digests are placeholders. Copy the mother article and existing Receipt into contained workspace-relative paths, replace their exact digests, then recompute `manifest_digest` over every field except `manifest_digest`. Inspect before Capture.

## Failure and reconciliation

- Terminal hook failure records `evidence_capture_pending`; inspect and resume it.
- Runtime unavailable means honest Query degradation and fail-closed Promotion.
- A changed source, Review, Plan, Workspace, Profile, SCP, Mapping, Runtime version or Catalog makes approval stale.
- Promotion writes the Catalog last. A partial promotion is invisible to default Mainline Query.
- An uncertain Runtime artifact registration requires Human reconciliation; it is never blindly replayed.
- V2.2 records remain exact-path, read-only supporting evidence until an explicit Import Promotion.

Only `llm-wiki-runtime` may access `.llm-wiki`. Skills and Harness code never write it directly and never perform automatic semantic promotion.
