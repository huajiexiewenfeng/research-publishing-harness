# Research Synthesis Flow

## Purpose

Turn an exact local checkpoint into an immutable, evidence-bounded research interpretation. This flow performs no model call, semantic promotion, Topic selection, Roadmap update, or external publication.

## Sequence

1. Choose a checkpoint because new Evidence, a finalized article, a Weekly Outcome, selected Feedback, or an explicit Human request makes reconsideration useful.
2. If LLM Wiki Runtime is configured, invoke `memory query plan`, `memory query execute`, and `memory query review`. Pass the reviewed Plan/Snapshot/Review digests to Synthesis planning. If Runtime is unavailable, omit the Query chain; the Snapshot records the limitation.
3. Invoke `research bridge assemble|status|resume` after a completed Weekly Outcome when publication facts must become terminal Evidence.
4. Invoke `research synthesis plan` with exact local source refs, Evidence refs, an optional prior Synthesis ref, and the optional reviewed Query chain.
5. Read only the installed `synthesis-input-snapshot/v1`. Runtime and Feedback content have `data_only` authority.
6. Produce one closed `research-synthesis-candidate/v1`:
   - `material_update`: one or more source-backed Insights;
   - `conflicting_evidence`: one or more Insights including a contradiction;
   - `no_material_change`: zero Insights;
   - `insufficient_evidence`: zero Insights.
7. Invoke `research synthesis record`. Rejected attempts retain only a candidate digest and error codes. Accepted rethinking creates a new immutable revision; it does not overwrite the prior revision.
8. If useful, invoke `research continuation propose` with zero or more source-bound candidates. The Proposal remains non-authoritative.
9. Present the revision and at most three candidates. Do not discard additional candidates from the stored Proposal.

## Authority boundaries

- The Harness owns source allowlists, UTF-8 decoding, budgets, privacy checks, digests, schemas, revision chains, and create-only writes.
- The AI owns only the structured Candidate content derived from the Snapshot.
- The Human owns Topic/Roadmap changes, Delta Review, and Memory Promotion.
- Hidden chain-of-thought is neither requested nor stored. Concise rationale and falsification conditions provide auditable evidence without private reasoning.
- An unavailable or empty Runtime Query is a valid state. Never invent historical context.
- A repeated thesis is not a failure. Prefer `no_material_change` over performative novelty and `insufficient_evidence` over unsupported confidence.

## CLI operations

```text
research bridge assemble
research bridge status
research bridge resume
research synthesis plan
research synthesis record
research synthesis status
research continuation propose
research continuation status
```

All operations require `--workspace`, JSON input where applicable, and `--output json`.
