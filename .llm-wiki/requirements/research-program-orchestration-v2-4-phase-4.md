# Change Brief: V2.4 Phase 4 Adaptive Research Closure and AI Synthesis

## Flow

- flow_id: `research-program-orchestration-v2-4-phase-4`
- parent_flow_id: `research-program-orchestration-v2-4`
- status: `plan-confirmed-awaiting-implementation`
- design_status: `confirmed`
- plan_status: `confirmed`
- implementation_authorized: false
- source_head: `1eab543`
- confirmed_source_digest: `sha256:674847eb5582837cba20195eb1ed15a204335f24cf84b942d085bae4cc23fbd5`
- confirmed_by: `human`
- confirmed_at: `2026-08-24`
- confirmed_plan_digest: `sha256:9fe9cae3ddb6d07a9d4422d11ab2c43411fd31529c81c9d26cbf967f23c20891`
- plan_confirmed_by: `human`
- plan_confirmed_at: `2026-08-25`
- trust: source-calibrated design; no implementation or external execution claimed

## Why

Phase 3 can publish one verified X Article followed by one English X Single and issue a joint Receipt, but the Weekly Cycle intentionally stops at `publication_planned`. The repository still needs a safe way to record the published week, connect it to the Research Data Flywheel and let AI act as a genuine research partner.

That partner must be allowed to derive new conclusions, hypotheses, contradictions and cross-project connections. It must not be forced to invent novelty, silently rewrite evidence, freeze the six-month Roadmap, choose the next article, or promote generated ideas into accepted long-term memory without Human review.

## North Star

> 固化已经发生的事实，保留未来研究方向的调整权；让 AI 主动产生知识候选，但不把候选伪装成已验证事实。

Phase 4 therefore separates four concerns:

1. publication facts;
2. research-memory expressions and evidence;
3. AI-generated synthesis and continuation options;
4. Human-accepted semantic promotion.

## Confirmed Product Decisions

- AI is a research partner, not only a publishing assistant or summarizer.
- Article order, Topic direction and Roadmap timing remain revisable; publication does not prove that a Topic is complete.
- A completed Weekly publication releases the selected Topic back to `available`; only an explicit Human decision may later complete, reframe, pause, split, merge or retire research directions.
- AI Synthesis may produce new conclusions and ideas, but it may also honestly return no material change or insufficient evidence.
- Synthesis runs at meaningful checkpoints and on explicit request, not after every note or conversation.
- External engagement counts remain secondary signals. A substantive reply, reproduction, Issue, source discussion or counterexample enters as an Evidence Candidate and remains unverified until reviewed or reproduced.
- Weekly Outcome stores facts. AI Synthesis and Continuation Proposal are separate first-class artifacts.
- Phase 4 V1 includes the 4A Program Closure and 4B Research Flywheel/Synthesis layers. 4C reuses the existing Delta → Review → Promotion Plan → confirmation → Runtime workflow. `public bootstrap` is excluded until separately defined.

## Scope

### Active

- `WeeklyPublicationOutcomeV1` and deterministic Program Closure.
- Weekly Cycle projection from `publication_planned` to `published`.
- Topic release from `reserved` to `available` through an immutable Topic revision.
- One default Research Increment per Weekly Outcome and an explicit Outcome-to-Increment binding.
- A loss-aware Claim Projection between Package V1.2 Claim Boundary and the existing Research Increment vocabulary.
- Two independent Publication Expressions: X Article and X Single.
- Terminal Evidence capture for both Expressions.
- Bounded Synthesis Input Snapshot, AI Research Synthesis revisions and optional Continuation Proposals.
- JSON-only local operations, a thin `research-synthesis-copilot` Skill branch, recovery and Fake-AI acceptance.
- Bridge into existing Semantic Delta/Review/Promotion without bypassing its confirmation.

### Read-only

- Phase 1 Roadmap, Topic Backlog, Monthly Review and Program Status contracts.
- Phase 2 Weekly Cycle, Selection, Package V1.2 and finalized Article Package.
- Phase 3 Publication Bundle, child Plan/Receipt evidence and Browser protocols.
- V2.3 Research Increment, Publication Expression, Evidence, Delta, Review and Promotion behavior.
- `llm-wiki-runtime` 0.2.0 Query/Promotion dependency through existing adapters.

### Excluded

- Real Browser/X/GitHub publication or any new public write.
- Automatic Roadmap revision, Topic selection, Topic completion, Claim promotion or Memory Promotion.
- Forced weekly novelty, fixed candidate counts, engagement-based research decisions or article-body pre-generation.
- Hidden chain-of-thought capture or complete Runtime-directory loading.
- New Runtime protocol or source change.
- Trace/Eval/Controlled Learning Loop implementation.
- Public bootstrap.

## Architecture

```text
completed Publication Bundle
        |
        v
4A Program Closure
  Weekly Outcome -> Cycle published -> Topic available
        |
        v
4B Research Flywheel Bridge
  Outcome -> Claim Projection -> Research Increment
          -> Article Expression + Single Expression
          -> terminal Evidence
        |
        v
AI Research Partner
  bounded Input Snapshot -> Synthesis revision
                         -> optional Continuation Proposal
        |
        v
Human-controlled semantics
  Topic/Roadmap revision or existing Delta/Review/Promotion
```

Program Closure and the Research Flywheel are separate success lines. A truthful published Outcome must not be rolled back because Expression assembly, AI generation or Runtime access is temporarily unavailable.

## 4A: Weekly Publication Outcome

### `WeeklyPublicationOutcomeV1`

The create-only Outcome contains:

- stable Outcome and Cycle identity;
- exact Cycle, Roadmap revision, selected Topic revision and Human Selection refs;
- Package V1.2 and finalized Article Package refs;
- exact Bundle Plan, Approval and joint Receipt refs;
- separate Article Plan/Receipt and Single Plan/Receipt refs;
- ordered public URLs, published timestamps, verification statuses and limitations;
- Research Stream coverage;
- original Package Claim, Evidence, Boundary and Open Question refs;
- issue time and a self-excluding Outcome digest.

The service reads all contained artifacts and verifies file bytes, semantic digests and cross-identities. It never accepts a caller-supplied URL, publication status, timestamp, Claim status or replacement ref.

Only a valid completed Bundle may create an Outcome. Unknown, conflict, partial, failed or expired Bundle states fail closed.

### Program state effects

After the Outcome exists:

- Weekly Cycle projects `published` with exact `outcome_ref`;
- the selected Topic receives a new immutable revision with `availability: available` and an explicit reason that the published cycle closed while future research remains undecided;
- Topic is not marked `completed` and Roadmap is not revised;
- Monthly Review may count the contained Outcome ref, independent of engagement metrics.

Continue/reframe/pause/split/merge remain ordinary Human-controlled operations:

- continue: select the available Topic again;
- reframe: revise the Topic thesis, boundary or streams;
- pause: revise `backlog_state` to `long_term`;
- split: add related Topics while preserving the source Topic;
- merge: revise a target Topic and optionally retire obsolete Topics;
- complete: explicitly complete with a selected Outcome ref.

No new Topic lifecycle enum is introduced.

## Outcome-to-Increment Identity

Phase 2 Package V1.2 carries Program refs but no Research Increment identity, while existing Publication Expressions require `increment_ref`. Phase 4 resolves that gap with one default new Research Increment per Weekly Outcome.

`WeeklyResearchIncrementBindingV1` binds the exact Outcome, generated Increment revision, Claim Projection and binding policy. The default policy is `one-outcome-one-increment/v1`. The stable Increment id is derived deterministically from the Outcome identity with a bounded digest suffix.

The Increment `track_id` is derived from the exact contained Roadmap revision's `primary_track_id`; callers cannot supply or replace it. Research Stream coverage is copied as lineage metadata and does not create a second Track identity. Supporting additional project or research Tracks later requires an explicit Roadmap revision or a versioned binding policy, not heuristic project-name matching.

Research continuity is expressed with reviewed Evolution Edges such as `refines`, `informed_by`, `contradicts` or `validates`; it is not forced into one lifelong Topic-bound Increment. A later policy version may support explicit continuation of an existing Increment without changing historical bindings.

## Claim Projection

Package V1.2 and V2.3 Research Memory use different Claim vocabularies. Phase 4 must not silently coerce them.

`ClaimProjectionV1` records each source Claim ref/status, projected Memory-candidate status, Evidence refs, projection rule, loss/weakening note and digest.

The locked conservative mapping is:

| Package status | Increment candidate status | Rule |
|---|---|---|
| `validated` | `verified` | validation Gate already requires test or usage-observation evidence |
| `shipped` | `observed` | implementation existence is not proof of validation |
| `observed` | `observed` | preserve observation strength |
| `exploring` | `hypothesis` | exploration is not automatically inferred knowledge |
| `planned` | `planned` | preserve planned status |
| `hypothesis` | `hypothesis` | preserve hypothesis status |

No Phase 2 status automatically maps to `inferred`. Outcome always preserves the original Package status. Any AI-proposed strengthening, weakening or correction enters a Semantic Delta and requires existing Human Review before Promotion.

## 4B: Publication Expressions and Evidence

Phase 4 reuses `PublicationExpressionV1` rather than creating a merged publication model.

- X Article is an `x_article` Expression bound to its own approved Plan, canonical Article bytes, Receipt and public URL.
- X Single is an `x_single` Expression bound to its materialized text/Visual, approved Plan, Receipt and public URL.
- Both Expressions bind the same weekly Increment but remain independent content and evidence records.
- Expression assembly cannot strengthen source Claim status or lower privacy classification.
- The joint Bundle Receipt is lineage evidence, not a replacement for child Plan/Receipt pairs.

Each terminal Expression is captured through the existing Evidence mechanism. A partial failure leaves a resumable bridge state; it never causes a second external Submit or changes the Outcome.

## AI Research Synthesis

### Checkpoint policy

Synthesis is available at meaningful checkpoints:

- new important Evidence, implementation result or counterexample;
- finalized Article Package;
- completed Weekly Outcome;
- selected substantive Reply, reproduction, Issue or source discussion;
- explicit Human request such as “重新思考这条主线”.

Ordinary notes and every conversation do not trigger mandatory Synthesis.

### `SynthesisInputSnapshotV1`

Before model execution, Harness freezes a bounded, privacy-filtered Snapshot containing:

- trigger kind and reason;
- exact Cycle/Outcome/Increment/Package/Article/Expression refs available at that checkpoint;
- Claim Boundary, Evidence, Open Questions and selected Feedback Candidates;
- prior Synthesis ref when available;
- bounded `llm-wiki-runtime` Query Snapshot or an explicit unavailable/empty status;
- context budget, policy version, source digests and generator request metadata;
- Snapshot digest.

The Snapshot contains only selected context. It never copies a full Runtime directory or stores credentials, cookies, private raw material or hidden model reasoning.

### `ResearchSynthesisRevisionV1`

The AI-generated revision contains:

- Synthesis identity, revision chain and exact Input Snapshot ref;
- overall disposition:
  - `material_update`;
  - `conflicting_evidence`;
  - `no_material_change`;
  - `insufficient_evidence`;
- zero or more Insight items;
- concise synthesis summary, limitations and generator provenance;
- revision digest.

Each Insight carries:

- kind: conclusion, hypothesis, correction, contradiction, architecture connection, proposed decision or open question;
- epistemic status: observation, inference, hypothesis or proposed decision;
- statement and concise rationale;
- exact Evidence refs and relation to prior Claim/Decision refs;
- confidence and confidence rationale;
- falsification condition and missing evidence;
- potential mainline impact without applying it.

There is no minimum Insight count. `no_material_change` and `insufficient_evidence` are successful, honest outputs. The system must not optimize for novelty count or suggestion adoption.

Novelty is therefore conditional, not mandatory. At each checkpoint the Skill first judges whether the bounded Snapshot contains a meaningful evidence delta, contradiction or cross-project connection. It creates Insight items only when that judgment is supportable. Reconfirming an existing conclusion, identifying an evidence gap, or reporting that the current thesis still stands can be the correct research result; routine paraphrase must not be relabeled as a new conclusion.

The Harness validates structure, references, privacy and status boundaries; it does not claim the generated reasoning is true. AI output may create knowledge candidates but cannot directly mutate Claim, Decision, Topic, Roadmap or Runtime.

The same Snapshot may have multiple immutable attempts. A later successful synthesis creates a new revision; old attempts are not overwritten. Hidden chain of thought and token-by-token reasoning are never requested or persisted.

### Runtime degradation

Runtime Query unavailable does not block local Synthesis. The result must retain `memory_context_status: unavailable` and a limitation that historical research context was not loaded. It cannot claim comprehensive cross-history synthesis.

## Continuation Proposal

`ResearchContinuationProposalV1` is independent from Outcome and Synthesis. It references one Synthesis revision and may contain zero or more non-authoritative candidates:

- deepen the current question;
- test or falsify a hypothesis;
- address a contradiction;
- revise a thesis;
- continue, reframe, split, merge or pause a Topic;
- run an experiment, inspect code or draft an article direction.

The schema imposes no mandatory candidate count. The Skill may display up to three by default as an editorial policy, not a permanent contract. Proposals may expire, be regenerated, be ignored or be superseded. They never create Topic/Roadmap revisions or select the next weekly candidate automatically.

## External Feedback Boundary

- Impressions, likes, replies, followers, stars and similar counts remain secondary signals.
- Ordinary feedback may be retained as a source/link summary but is not Evidence by default.
- Counterexamples, reproductions, Issues, source discussions and technical critiques become Evidence Candidates with provenance and privacy classification.
- AI may immediately use a Candidate in Synthesis only when it labels the source as external and independently unverified.
- Formal Evidence strength changes require reproduction, source verification or Human Review.
- Engagement never upgrades a Claim, completes a Topic or changes Roadmap alignment.

## Components

### `WeeklyOutcomeService`

- verify completed Bundle and all exact child evidence;
- create/read/rebuild Outcome;
- project Cycle `published`;
- release Topic through one immutable revision;
- expose idempotent status/resume;
- perform no Browser, model or Runtime action.

### `WeeklyResearchBridgeService`

- create/read Outcome-to-Increment and Claim Projection bindings;
- assemble the weekly Increment and two Expressions;
- capture terminal Evidence;
- recover partial local steps without recreating completed artifacts;
- perform no model generation or Promotion.

### `ResearchSynthesisService`

- plan/freeze Input Snapshot;
- validate and record AI Candidate attempts;
- create immutable Synthesis revisions;
- expose status and deterministic lineage;
- perform no direct model call or semantic Promotion.

### `research-synthesis-copilot`

The thin Skill owns semantic generation:

1. request a bounded Input Snapshot;
2. analyze evidence and Runtime context;
3. decide whether material change exists;
4. produce a structured Candidate;
5. submit it for Harness validation;
6. optionally create a Continuation Proposal;
7. report conclusions, conflicts, limitations and next options to the Human.

The Skill cannot directly write Program truth, approved semantic records or Runtime storage.

## Operations

Proposed JSON-only operations:

```text
program week outcome assemble
program week outcome status
program week outcome resume

research bridge assemble
research bridge status
research bridge resume

research synthesis plan
research synthesis record
research synthesis status

research continuation propose
research continuation status
```

No operation accepts free-form shell commands, replacement public evidence, hidden auto-confirmation or direct Runtime write instructions.

## State and Recovery

Phase 4 avoids one rigid mega-state. It projects independent dimensions:

- closure: `pending | complete | conflict`;
- flywheel bridge: `pending | in_progress | complete | blocked`;
- synthesis: `not_requested | planned | recorded | blocked`;
- promotion: existing V2.3 status only.

The synthesis process state records execution progress only. Research meaning lives in the recorded revision's disposition (`material_update`, `conflicting_evidence`, `no_material_change` or `insufficient_evidence`), so the orchestration layer never treats novelty as the required success state.

Recovery rules:

- installed Outcome bytes are revalidated and reused;
- Cycle and Topic projections are rebuilt from immutable refs without duplicate Topic revisions;
- existing Increment/Projection/Expression/Evidence artifacts are never overwritten;
- one missing Expression resumes independently;
- a failed AI attempt does not affect Program Closure;
- an already recorded Synthesis remains immutable; rethinking produces a revision;
- Runtime promotion uncertainty follows the existing write-ahead reconciliation contract and never replays uncertain non-idempotent work.

## Human Gates

No additional confirmation is required for:

- deterministic Outcome assembly;
- Cycle publication projection and Topic release;
- Claim Projection, weekly Increment, Expressions and Evidence;
- AI Synthesis or Continuation Proposal generation.

Explicit Human action remains required for:

- selecting the next weekly research direction;
- revising Topic or Roadmap semantic truth, except for the deterministic Outcome-bound release from `reserved` to `available`;
- completing or retiring a Topic;
- accepting/rejecting AI Insight as a formal Claim, Decision or Evolution Edge;
- reviewing a Semantic Delta;
- approving a Memory Promotion Plan;
- any new external publication or public bootstrap.

The Phase 3 publication confirmation does not authorize semantic acceptance or Runtime writes.

## Acceptance Criteria

1. Only a fully verified completed Bundle can create an Outcome.
2. Outcome independently verifies both child Plan/Receipt pairs and never trusts caller-supplied public facts.
3. Outcome is create-only, digest-bound and idempotent for exact retries.
4. Weekly Cycle rebuilds to `published` only from a valid contained Outcome ref.
5. Topic returns to `available` through exactly one immutable revision and never auto-completes.
6. Publication never automatically revises Roadmap, Topic thesis or Claim state.
7. Monthly cadence counts contained Outcome refs; engagement cannot satisfy research progress.
8. Each Outcome binds exactly one default new Increment under `one-outcome-one-increment/v1`.
9. Increment `track_id` is derived from the contained Roadmap revision and cannot be caller-supplied or inferred from a project name.
10. Claim Projection preserves source status and applies the locked conservative mapping without hidden strengthening.
11. Article and Single create separate Expressions bound to exact child evidence.
12. A bridge failure cannot erase or downgrade a truthful Outcome.
13. Terminal Evidence captures exact Expression and Receipt lineage.
14. Synthesis Input Snapshot is bounded, privacy-filtered and digest-bound.
15. Synthesis supports material insight, conflict, no material change and insufficient evidence.
16. Insight refs must resolve inside the Snapshot and carry epistemic status, uncertainty and falsification information.
17. AI generation cannot directly mutate Program truth, accepted semantic records or Runtime storage.
18. Continuation Proposal is optional, independent and non-authoritative.
19. Runtime-unavailable Synthesis succeeds only with an explicit historical-context limitation.
20. Substantive external feedback remains an unverified candidate until review or reproduction.
21. Human confirmation remains mandatory for semantic Topic/Roadmap decisions and Memory Promotion; deterministic Outcome-bound Topic release is the only Phase 4 lifecycle projection exception.
22. Program Closure, bridge and synthesis resume without duplicate revisions or overwritten evidence.
23. Existing Phase 1–3 and V2.3 direct publication/memory flows remain backward compatible.
24. Tests and acceptance perform no real Browser, X, GitHub, Runtime write or user Wiki write.
25. No metric or schema requires a weekly novel conclusion or fixed number of continuation candidates.
26. A recorded Synthesis with zero Insight items is valid when its disposition and limitations are consistent with the bounded Snapshot.
27. Rephrasing an existing conclusion cannot be labeled `material_update` without a source-backed evidence delta, contradiction or new connection.

## Verification Plan

- Closed-schema, digest and state-projection tests for all new contracts.
- Lineage tests from Weekly Cycle through Bundle child evidence, Outcome, Increment, Expressions and Evidence.
- Security tests for stale refs, path escape, caller-injected public data, privacy downgrade and Claim strengthening.
- Topic/Roadmap non-mutation and secondary-signal regression tests.
- Claim Projection table tests for all six statuses.
- Partial-step recovery and projection rebuild tests.
- Fake-AI tests for material update, conflict, no change, insufficient evidence, invalid refs and private input.
- Runtime unavailable/empty/loaded context tests without real Runtime writes.
- Full Fake flow proving Closure success is independent of Synthesis/Promotion.
- Existing Phase 1–3, Publication Expression, Evidence, Delta/Review/Promotion and CLI regressions.
- Final lint, typecheck, build, repository test and diff checks after implementation only.

## Alternatives Rejected

### One weekly knowledge capsule

Combining facts, AI conclusions, next directions and Memory candidates is simpler but makes later revisions rewrite or blur historical facts.

### Continuous event-triggered autonomous agent

Generating after every event is closer to a fully autonomous RSI loop but currently creates noise, duplicate insight and quality-measurement risk before Trace/Eval exists. The checkpoint contract leaves this as a future compatible trigger policy.

### One Topic equals one lifelong Increment

This strengthens continuity but makes reframe/split/merge semantics overly rigid. Independent weekly Increments plus reviewed Evolution Edges preserve both history and flexibility.

## Residual Risks

- Correct citations do not prove that an AI inference is correct.
- Similarity detection may identify duplicate wording without identifying conceptual duplication.
- Model changes can alter synthesis quality even with the same Snapshot.
- Fake-AI acceptance validates protocol boundaries, not real model research quality.
- Agent-local Skill orchestration can be bypassed by calling lower-level operations directly.
- Future Trace/Eval should measure whether Synthesis changed experiments, contracts or understanding; novelty count and adoption rate are explicitly not quality proxies.

## External Dependencies

- project_id: `llm-wiki-runtime`
- edge_id: `edge-001`
- dependency_type: existing read-only Query and separately approved Promotion dependency
- required_contract: version 0.2.0 through current Harness adapter
- verification_status: inherited source-verified Phase 3 boundary; no new Runtime contract proposed
- implementation_impact: Runtime unavailable must degrade Synthesis honestly; any required Runtime protocol change is a scope escalation

## Flow Record

| Step | Status | Evidence | Updated |
|---|---|---|---|
| source | done | Phase 1–3 handoffs and current V2.3 Memory/Program source at `1eab543` | 2026-08-24 |
| design | done | Human confirmed the reviewed source digest `sha256:674847eb5582837cba20195eb1ed15a204335f24cf84b942d085bae4cc23fbd5` | 2026-08-24 |
| plan | done | Human confirmed implementation plan digest `sha256:9fe9cae3ddb6d07a9d4422d11ab2c43411fd31529c81c9d26cbf967f23c20891` | 2026-08-25 |
| development | pending | implementation is not authorized | 2026-08-24 |
| testing | pending | acceptance criteria and verification plan defined above | 2026-08-24 |
| archive | pending | Phase 4 handoff after verified implementation | 2026-08-24 |

## Next Gate

The written design and fixed implementation-plan digest were explicitly confirmed by the user. Production source and tests must not change until a further explicit `开始 Phase 4 inline 实现` authorization.
