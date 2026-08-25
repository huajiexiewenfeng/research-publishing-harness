import {
  createResearchContextReview,
  createResearchContextSnapshot,
  createResearchQueryPlan
} from '../../harnesses/research-publishing/core/research-query-types.js';
import type { PlanResearchSynthesisInput } from '../../harnesses/research-publishing/core/research-synthesis-service.js';
import type {
  ResearchSynthesisCandidateV1,
  SynthesisDisposition
} from '../../harnesses/research-publishing/core/research-synthesis-types.js';
import { WeeklyResearchBridgeService } from '../../harnesses/research-publishing/core/weekly-research-bridge-service.js';
import { createClosedPhase4OutcomeFixture } from './phase-4-research-loop.js';

export async function createResearchSynthesisFixture(options: {
  readonly loaded_query?: boolean;
  readonly empty_query?: boolean;
} = {}) {
  const fixture = await createClosedPhase4OutcomeFixture();
  const bridge = new WeeklyResearchBridgeService(fixture.store, {
    now: () => new Date('2026-08-25T11:00:00.000Z')
  });
  const bridgeStatus = await bridge.assemble({
    cycle_id: fixture.cycle_id,
    workspace_identity_digest: fixture.workspace_identity_digest
  });
  const paths = [
    `program/weeks/${fixture.cycle_id}/outcome.json`,
    fixture.outcome.research_content_package_ref.path,
    bridgeStatus.article_expression_ref!.path,
    `memory/evidence/snapshots/${bridgeStatus.article_evidence_ref!.slice('evidence:'.length)}/manifest.json`
  ];
  const refs = await Promise.all(paths.map((path) => fixture.store.resolveExistingArtifact(path)));
  let runtimeQuery: PlanResearchSynthesisInput['runtime_query'] = null;
  if (options.loaded_query === true || options.empty_query === true) {
    const queryStatus = options.empty_query === true ? 'empty' as const : 'loaded' as const;
    const queryId = 'query_synthesis_week_01';
    const recordRef = {
      ref: 'claim:runtime_boundary@1',
      path: 'domains/research-publishing/tracks/enterprise-agent-runtime/claims/runtime_boundary/versions/1.md',
      digest: `sha256:${'7'.repeat(64)}` as const,
      evidence_refs: [],
      document_manifest_ref: null
    };
    const catalogRef = {
      path: 'domains/research-publishing/tracks/enterprise-agent-runtime/indexes/catalog.md',
      digest: `sha256:${'6'.repeat(64)}` as const,
      generation: 'generation_synthesis_01'
    };
    const plan = createResearchQueryPlan({
      query_id: queryId,
      track_id: 'enterprise-agent-runtime',
      query_intent: 'Reconsider the Skill and Runtime boundary.',
      view: 'mainline',
      include_working: false,
      selection_terms: ['skill', 'runtime'],
      selection_rationale: 'The accepted Claim is directly relevant.',
      document_mode: 'none',
      catalog_ref: catalogRef,
      selected_shard_refs: [],
      selected_record_refs: [recordRef],
      selected_manifest_refs: [],
      selected_chunk_refs: [],
      created_at: '2026-08-25T11:01:00.000Z'
    });
    const snapshot = createResearchContextSnapshot({
      snapshot_id: 'query_snapshot_synthesis_week_01',
      query_plan_digest: plan.plan_digest,
      query_id: queryId,
      query_intent: plan.query_intent,
      track_id: plan.track_id,
      view: plan.view,
      index_refs: [catalogRef],
      selected_summary_refs: queryStatus === 'loaded' ? [recordRef.ref] : [],
      selected_record_refs: queryStatus === 'loaded' ? [recordRef] : [],
      selected_evidence_refs: [],
      context_items: queryStatus === 'loaded' ? [{
        context_ref: recordRef.ref,
        relative_path: recordRef.path,
        content_digest: recordRef.digest,
        content: '# Runtime boundary\n\nDeterministic knowledge access belongs in the Runtime.\n',
        source_layer: 'semantic_record',
        classification: 'data_only',
        sanitized: false,
        risk_flags: []
      }] : [],
      risk_flags: [],
      budgets: plan.budgets,
      selection_rationale: plan.selection_rationale,
      query_status: queryStatus,
      runtime_version: '0.2.0',
      created_at: '2026-08-25T11:02:00.000Z'
    });
    const review = createResearchContextReview(snapshot, {
      review_id: 'query_review_synthesis_week_01',
      selected_context_refs: queryStatus === 'loaded' ? [recordRef.ref] : [],
      reviewer: 'human',
      reviewed_at: '2026-08-25T11:03:00.000Z'
    });
    const queryRoot = `memory/queries-v2/${queryId}`;
    await fixture.store.writeNew(`${queryRoot}/plan.json`, plan);
    await fixture.store.writeNew(`${queryRoot}/snapshot.json`, snapshot);
    await fixture.store.writeNew(`${queryRoot}/review.json`, review);
    runtimeQuery = {
      query_id: queryId,
      plan_digest: plan.plan_digest,
      snapshot_digest: snapshot.snapshot_digest,
      review_digest: review.review_digest
    };
  }
  const input: PlanResearchSynthesisInput = {
    snapshot_id: 'synthesis_input_week_01',
    trigger: { kind: 'weekly_outcome', reason: 'The weekly publication completed.' },
    source_refs: refs.map((ref, index) => ({
      ref: { path: ref.relative_path, digest: ref.digest },
      role: ['outcome', 'package', 'expression', 'evidence'][index] as
        PlanResearchSynthesisInput['source_refs'][number]['role'],
      media_type: 'application/json',
      privacy_classification: index === 1 ? 'internal' : 'public'
    })),
    evidence_refs: [bridgeStatus.article_evidence_ref!, bridgeStatus.single_evidence_ref!],
    prior_synthesis_ref: null,
    runtime_query: runtimeQuery,
    created_at: '2026-08-25T11:04:00.000Z'
  };
  return { ...fixture, bridge, bridgeStatus, input };
}

export function synthesisCandidate(
  disposition: SynthesisDisposition = 'no_material_change',
  memoryStatus: ResearchSynthesisCandidateV1['memory_context_status'] = 'unavailable'
): ResearchSynthesisCandidateV1 {
  const material = disposition === 'material_update' || disposition === 'conflicting_evidence';
  return {
    schema_version: 'research-synthesis-candidate/v1',
    disposition,
    insights: material ? [{
      insight_id: 'insight_synthesis_week_01',
      kind: disposition === 'conflicting_evidence' ? 'contradiction' : 'architecture_connection',
      epistemic_status: 'inference',
      statement: 'Research publication closure and semantic memory promotion need separate authority.',
      rationale: 'The bounded Outcome is factual but Memory Promotion remains Human-controlled.',
      evidence_refs: ['evidence:evidence_week_01_2026_article_terminal'],
      prior_semantic_refs: [],
      confidence: 0.8,
      confidence_rationale: 'The local Outcome and Evidence chain support the boundary.',
      falsification_condition: 'An automatic promotion path demonstrates equivalent review guarantees.',
      missing_evidence: ['No production benchmark is available.'],
      potential_mainline_impact: 'May refine the Agent Runtime governance thesis.'
    }] : [],
    summary: material ? 'A meaningful source-backed connection was found.' : 'The current thesis still stands.',
    limitations: memoryStatus === 'unavailable'
      ? ['Historical research context was not loaded.']
      : [],
    memory_context_status: memoryStatus,
    generator_provenance: {
      provider: 'fake-ai', model: 'fixture-v1', invocation_id: 'fixture_invocation_01'
    }
  };
}
