# Handoff: Research Program Orchestration V2.4 Phase 4

## Status

- Flow: `research-program-orchestration-v2-4-phase-4`
- Result: implemented and `passed-agent-local`
- Production/acceptance head: `da6350f`
- Confirmed plan digest: `sha256:9fe9cae3ddb6d07a9d4422d11ab2c43411fd31529c81c9d26cbf967f23c20891`
- External effects: none; Fake AI and contained local artifacts only

## Delivered loop

```text
completed Publication Bundle
  -> immutable Weekly Outcome
  -> Cycle published + Topic available
  -> Claim Projection + weekly Increment
  -> Article/Single Expressions + terminal Evidence
  -> bounded Synthesis Snapshot
  -> immutable AI Synthesis revision
  -> optional non-authoritative Continuation Proposal
  -> stop before Human Topic/Roadmap/Delta/Promotion authority
```

## Program Closure proof

- Outcome: `program/weeks/<cycle_id>/outcome.json`.
- Closure marker: `program/weeks/<cycle_id>/outcome-closure.json`.
- The closure binds the exact Outcome and released immutable Topic revision.
- `WeeklyResearchCycleService.status` derives `published` only from the valid contained Outcome/closure chain.
- The selected Topic moves from `reserved` to `available`; it is never auto-completed, and Roadmap bytes remain unchanged.
- Only `cycle_id` is accepted from the caller; URLs, timestamps, verification state and child refs are re-derived from the completed Bundle.

## Research Bridge proof

- Bridge artifacts live under `program/weeks/<cycle_id>/research-bridge/`:
  - `claim-projection.json`;
  - `increment-binding.json`;
  - `article-expression.json`;
  - `single-expression.json`;
  - `status.json`.
- Default Increment identity is `weekly_<outcome_id>_<first-12-outcome-digest-hex>` under policy `one-outcome-one-increment/v1`.
- `track_id` comes only from the exact Roadmap revision's `primary_track_id`; callers cannot inject it.
- Claim mapping is conservative: `validated -> verified`, `shipped -> observed`, `observed -> observed`, `exploring -> hypothesis`, `planned -> planned`, `hypothesis -> hypothesis`.
- Projected Claims remain candidates. No accepted Claim, Decision or Evolution Edge is written.
- Article and Single remain separate `PublicationExpressionV1` artifacts bound to their exact child Plan/Receipt evidence.
- Terminal Evidence refs are `evidence:evidence_<cycle_id>_article_terminal` and `evidence:evidence_<cycle_id>_single_terminal`.

## AI Research Partner proof

- Snapshot path: `research/synthesis-inputs/<snapshot_id>.json`.
- Fixed V1 budgets: at most 24 items, 64,000 total characters and 12,000 characters per item; order and truncation are explicit.
- Runtime context is admitted only from an independently verified Query V2 Plan/Snapshot/Human Review chain.
- Runtime status is preserved as `loaded`, `empty` or `unavailable`; unavailable context requires the historical-context limitation and does not block local Synthesis.
- Runtime and Feedback content have `data_only` authority. Evidence manifests cannot be privacy-downgraded. Secret-bearing, unsafe-path, non-UTF-8, stale or unresolved inputs fail closed.
- Candidate dispositions are `material_update`, `conflicting_evidence`, `no_material_change` and `insufficient_evidence`.
- `no_material_change` and `insufficient_evidence` succeed with zero Insights. Material/conflicting results require source-bound Insights; paraphrase alone is not a material update.
- Hidden chain-of-thought is rejected and never persisted. A rejected attempt stores only candidate digest and error codes.
- Attempts and revisions are create-only under `research/syntheses/<synthesis_id>/`; rethinking the same Snapshot creates a new revision with an exact prior-byte ref.
- Concurrent recording fails fast with `EXECUTION_BUSY`; a safe retry creates the next revision without duplication.

## Continuation and authority

- Proposals live at `research/syntheses/<synthesis_id>/continuations/<proposal_id>.json`.
- They may contain zero or more source-bound candidates and always have `authority: non_authoritative`.
- The Skill displays at most three candidates, but the Harness stores all valid candidates losslessly.
- Proposal generation does not instantiate or mutate Roadmap, Backlog, Weekly Cycle, Delta or Promotion services.
- Human authority is unchanged for Topic selection/reframe/split/merge/pause/complete, Roadmap truth, Semantic Delta Review and Memory Promotion confirmation.

## Interfaces

- Program closure: `program week outcome assemble|status|resume`.
- Research bridge: `research bridge assemble|status|resume`.
- Synthesis: `research synthesis plan|record|status`.
- Continuation: `research continuation propose|status`.
- Skill: `skills/research-synthesis-copilot/` with optional Runtime fallback and no direct `.llm-wiki` access.
- Package manifest contains 236 deterministic files, all three Skills and `llm_wiki_runtime: 0.2.0`.

## Commits

- `233c377` lifecycle start
- `6b01bb3` Weekly Outcome contracts
- `f500ed9` immutable Outcome closure
- `923e6fe` resumable Outcome CLI/service boundary
- `43505c8` Claim Projection and Bridge contracts
- `1c5a0ab` Outcome-to-Evidence bridge service
- `5ea3516` bounded Synthesis contracts
- `5557967` Synthesis service and non-authoritative proposals
- `5a5a654` research CLI, Skill and package registration
- `da6350f` Fake-AI full loop, security gate and final manifest

## Fresh verification

- Focused Phase 4 gate: 22 test files, 86 tests passed.
- Repository Vitest: 161 files / 692 tests passed; 1 file / 1 test skipped because real Runtime integration is opt-in.
- ESLint, TypeScript build/typecheck and `git diff --check`: passed.
- `research-synthesis-copilot` validator: `Skill is valid!`.
- Offline acceptance: passed, `network: unused`.
- No real Browser, X, GitHub, Runtime or user Wiki action occurred. No Memory Promotion was planned, approved or executed.
- Verification is agent-local, not CI or independent review.

## Residual risks

- Contract-valid, source-linked AI synthesis can still be wrong; Fake AI proves boundaries, not research quality.
- Conceptual novelty and useful cross-project connections are not fully measurable by string similarity.
- Model/version changes may alter conclusions for the same Snapshot.
- The Skill can be bypassed by direct CLI use, although Harness contracts still enforce deterministic boundaries.
- Real Runtime `0.2.0` integration was not executed in this final run; its opt-in test remained skipped.
- Future Trace/Eval should measure whether synthesis changes experiments, contracts or understanding. Novelty count, adoption and engagement remain invalid quality proxies.

## Next gate

Use Phase 4 at a Human-selected meaningful research checkpoint. Any live publication, external feedback collection, Topic/Roadmap change, Semantic Delta Review, Memory Promotion or public bootstrap is a separate operation with its ordinary authority and verification.
