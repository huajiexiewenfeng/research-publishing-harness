import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import type { ResearchArtifactRefV1 } from './research-program-types.js';
import type {
  CreateResearchContinuationProposalInput,
  CreateResearchSynthesisAttemptInput,
  CreateResearchSynthesisRevisionInput,
  CreateResearchSynthesisStatusInput,
  CreateSynthesisInputSnapshotInput,
  ResearchContinuationProposalV1,
  ResearchSynthesisAttemptV1,
  ResearchSynthesisCandidateV1,
  ResearchSynthesisInsightV1,
  ResearchSynthesisRevisionV1,
  ResearchSynthesisStatusV1,
  SynthesisInputSnapshotV1
} from './research-synthesis-types.js';
import { SYNTHESIS_BUDGET_V1 } from './research-synthesis-types.js';
import { validateContract } from './schema-validator.js';

const STABLE_ID = /^[a-z0-9][a-z0-9_-]{0,95}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;

function fail(message: string): never {
  throw new HarnessError('CONTRACT_INVALID', message);
}

function assertText(value: string, label: string): void {
  if (value.trim().length === 0) fail(`${label} is required`);
}

function assertUnique(values: readonly string[], label: string): void {
  if (values.some((value) => value.trim().length === 0) ||
      new Set(values).size !== values.length) {
    fail(`${label} must contain unique non-empty values`);
  }
}

function assertRef(ref: ResearchArtifactRefV1, label: string): void {
  const segments = ref.path.replaceAll('\\', '/').split('/');
  if (ref.path.includes('\\') || ref.path.startsWith('/') || /^[A-Za-z]:/.test(ref.path) ||
      segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..') ||
      !DIGEST.test(ref.digest)) {
    fail(`${label} must be a safe digest-bound workspace ref`);
  }
}

export function synthesisSourceRef(ref: ResearchArtifactRefV1): string {
  assertRef(ref, 'Synthesis source');
  return `artifact:${ref.path}#${ref.digest}`;
}

export function createSynthesisInputSnapshot(
  input: CreateSynthesisInputSnapshotInput
): SynthesisInputSnapshotV1 {
  if (!STABLE_ID.test(input.snapshot_id)) fail('Synthesis Snapshot id is invalid');
  assertText(input.trigger.reason, 'Synthesis trigger reason');
  if (input.source_items.length > SYNTHESIS_BUDGET_V1.max_items) {
    fail('Synthesis Snapshot exceeds the item budget');
  }
  const refs: string[] = [];
  let total = 0;
  for (const item of input.source_items) {
    assertRef(item.ref, 'Synthesis context item');
    refs.push(synthesisSourceRef(item.ref));
    if (item.content.length !== item.included_chars || item.original_chars < item.included_chars ||
        item.included_chars > SYNTHESIS_BUDGET_V1.max_item_chars ||
        item.truncated !== (item.included_chars < item.original_chars)) {
      fail('Synthesis context truncation or item budget is invalid');
    }
    total += item.included_chars;
  }
  assertUnique(refs, 'Synthesis context refs');
  if (total > SYNTHESIS_BUDGET_V1.max_total_chars) {
    fail('Synthesis Snapshot exceeds the total character budget');
  }
  assertUnique(input.evidence_refs, 'Synthesis Evidence refs');
  if (input.prior_synthesis_ref !== null) {
    assertRef(input.prior_synthesis_ref, 'Prior Synthesis');
  }
  const runtime = input.runtime_context;
  const runtimeRefs = [runtime.query_plan_ref, runtime.context_snapshot_ref, runtime.review_ref];
  const hasAllRuntimeRefs = runtimeRefs.every((ref) => ref !== null);
  const hasNoRuntimeRefs = runtimeRefs.every((ref) => ref === null);
  if (!hasAllRuntimeRefs && !hasNoRuntimeRefs) {
    fail('Runtime context refs must be complete or absent');
  }
  for (const ref of runtimeRefs) if (ref !== null) assertRef(ref, 'Runtime context');
  assertUnique(runtime.selected_context_refs, 'Runtime selected context refs');
  if ((runtime.status === 'loaded' || runtime.status === 'empty') && !hasAllRuntimeRefs) {
    fail('Loaded or empty Runtime context requires the reviewed Query chain');
  }
  if (runtime.status === 'loaded' && runtime.selected_context_refs.length === 0) {
    fail('Loaded Runtime context requires a selected context ref');
  }
  if (runtime.status === 'empty' && runtime.selected_context_refs.length !== 0) {
    fail('Empty Runtime context cannot select context refs');
  }
  if (runtime.status === 'unavailable') {
    if (runtime.limitation === null || runtime.limitation.trim().length === 0) {
      fail('Unavailable Runtime context requires a limitation');
    }
  } else if (runtime.limitation !== null) {
    fail('Available Runtime context cannot claim an unavailable limitation');
  }
  const body = {
    schema_version: 'synthesis-input-snapshot/v1' as const,
    ...input,
    budgets: SYNTHESIS_BUDGET_V1,
    policy_version: 'research-synthesis-input/v1' as const,
    generator_request: {
      purpose: 'research_synthesis' as const,
      output_schema: 'research-synthesis-candidate/v1' as const
    }
  };
  return validateContract<SynthesisInputSnapshotV1>('synthesis-input-snapshot', {
    ...body,
    snapshot_digest: sha256(body)
  });
}

export function assertSynthesisInputSnapshot(value: SynthesisInputSnapshotV1): void {
  const {
    schema_version: _schema,
    budgets: _budgets,
    policy_version: _policy,
    generator_request: _request,
    snapshot_digest,
    ...input
  } = value;
  void _schema;
  void _budgets;
  void _policy;
  void _request;
  if (createSynthesisInputSnapshot(input).snapshot_digest !== snapshot_digest) {
    fail('Synthesis Input Snapshot digest mismatch');
  }
}

function assertInsight(
  insight: ResearchSynthesisInsightV1,
  allowedEvidenceRefs: ReadonlySet<string>
): void {
  if (!STABLE_ID.test(insight.insight_id)) fail('Synthesis Insight id is invalid');
  assertText(insight.statement, 'Insight statement');
  assertText(insight.rationale, 'Insight rationale');
  assertText(insight.confidence_rationale, 'Insight confidence rationale');
  assertText(insight.falsification_condition, 'Insight falsification condition');
  assertText(insight.potential_mainline_impact, 'Insight mainline impact');
  assertUnique(insight.evidence_refs, 'Insight Evidence refs');
  assertUnique(insight.prior_semantic_refs, 'Insight prior semantic refs');
  assertUnique(insight.missing_evidence, 'Insight missing Evidence');
  if (insight.evidence_refs.length === 0 ||
      insight.evidence_refs.some((ref) => !allowedEvidenceRefs.has(ref))) {
    fail('Every Insight Evidence ref must resolve inside the frozen Snapshot');
  }
  if (!Number.isFinite(insight.confidence) || insight.confidence < 0 || insight.confidence > 1) {
    fail('Insight confidence must be between zero and one');
  }
}

export function assertResearchSynthesisCandidate(
  candidate: ResearchSynthesisCandidateV1,
  snapshot: SynthesisInputSnapshotV1
): void {
  validateContract<ResearchSynthesisCandidateV1>('research-synthesis-candidate', candidate);
  assertSynthesisInputSnapshot(snapshot);
  assertText(candidate.summary, 'Synthesis summary');
  assertUnique(candidate.limitations, 'Synthesis limitations');
  if (candidate.memory_context_status !== snapshot.runtime_context.status) {
    fail('Synthesis memory context status must match the frozen Snapshot');
  }
  const material = candidate.disposition === 'material_update' ||
    candidate.disposition === 'conflicting_evidence';
  if (material && candidate.insights.length === 0) {
    fail('material or conflicting Synthesis requires an Insight');
  }
  if (!material && candidate.insights.length !== 0) {
    fail('honest no-change Synthesis must not disguise an Insight');
  }
  const ids = candidate.insights.map((insight) => insight.insight_id);
  assertUnique(ids, 'Synthesis Insight ids');
  const allowed = new Set([
    ...snapshot.evidence_refs,
    ...snapshot.source_items.map((item) => synthesisSourceRef(item.ref))
  ]);
  for (const insight of candidate.insights) assertInsight(insight, allowed);
  if (candidate.disposition === 'conflicting_evidence' &&
      !candidate.insights.some((insight) => insight.kind === 'contradiction')) {
    fail('conflicting Evidence Synthesis requires a contradiction Insight');
  }
  if (candidate.disposition === 'material_update' &&
      !candidate.insights.some((insight) => [
        'conclusion', 'hypothesis', 'correction', 'contradiction', 'architecture_connection'
      ].includes(insight.kind))) {
    fail('material Synthesis requires a source-backed evidence delta or connection');
  }
  if (snapshot.runtime_context.status === 'unavailable' &&
      !candidate.limitations.some((value) =>
        /historical research context was not loaded/i.test(value))) {
    fail('Unavailable Runtime context must remain an explicit Synthesis limitation');
  }
}

export function createResearchSynthesisAttempt(
  input: CreateResearchSynthesisAttemptInput
): ResearchSynthesisAttemptV1 {
  if (!STABLE_ID.test(input.synthesis_id) || input.attempt_ordinal < 1 ||
      !Number.isInteger(input.attempt_ordinal) || !DIGEST.test(input.candidate_digest)) {
    fail('Research Synthesis Attempt identity is invalid');
  }
  assertRef(input.input_snapshot_ref, 'Attempt Input Snapshot');
  assertUnique(input.error_codes, 'Attempt error codes');
  if ((input.status === 'accepted' && input.error_codes.length !== 0) ||
      (input.status === 'rejected' && input.error_codes.length === 0)) {
    fail('Attempt status and error codes are inconsistent');
  }
  const body = { schema_version: 'research-synthesis-attempt/v1' as const, ...input };
  return validateContract<ResearchSynthesisAttemptV1>('research-synthesis-attempt', {
    ...body,
    attempt_digest: sha256(body)
  });
}

export function createResearchSynthesisRevision(
  input: CreateResearchSynthesisRevisionInput,
  snapshot: SynthesisInputSnapshotV1
): ResearchSynthesisRevisionV1 {
  if (!STABLE_ID.test(input.synthesis_id) || input.revision < 1 ||
      !Number.isInteger(input.revision)) {
    fail('Research Synthesis revision identity is invalid');
  }
  assertRef(input.input_snapshot_ref, 'Synthesis Input Snapshot');
  if (input.input_snapshot_ref.path !==
      `research/synthesis-inputs/${snapshot.snapshot_id}.json`) {
    fail('Research Synthesis revision must bind the exact Input Snapshot path');
  }
  if ((input.revision === 1) !== (input.previous_revision_ref === null)) {
    fail('Research Synthesis revision chain is invalid');
  }
  if (input.previous_revision_ref !== null) {
    assertRef(input.previous_revision_ref, 'Previous Synthesis revision');
  }
  const candidate: ResearchSynthesisCandidateV1 = {
    schema_version: 'research-synthesis-candidate/v1',
    disposition: input.disposition,
    insights: input.insights,
    summary: input.summary,
    limitations: input.limitations,
    memory_context_status: input.memory_context_status,
    generator_provenance: input.generator_provenance
  };
  assertResearchSynthesisCandidate(candidate, snapshot);
  const body = { schema_version: 'research-synthesis-revision/v1' as const, ...input };
  return validateContract<ResearchSynthesisRevisionV1>('research-synthesis-revision', {
    ...body,
    revision_digest: sha256(body)
  });
}

export function createResearchContinuationProposal(
  input: CreateResearchContinuationProposalInput,
  allowedOriginRefs: readonly string[]
): ResearchContinuationProposalV1 {
  if (!STABLE_ID.test(input.proposal_id)) fail('Continuation Proposal id is invalid');
  assertRef(input.synthesis_ref, 'Continuation Proposal Synthesis');
  const allowed = new Set(allowedOriginRefs);
  const ids: string[] = [];
  for (const candidate of input.candidates) {
    if (!STABLE_ID.test(candidate.candidate_id)) fail('Continuation Candidate id is invalid');
    ids.push(candidate.candidate_id);
    assertText(candidate.proposal, 'Continuation proposal');
    assertText(candidate.rationale, 'Continuation rationale');
    assertUnique(candidate.origin_refs, 'Continuation origin refs');
    assertUnique(candidate.uncertainties, 'Continuation uncertainties');
    if (candidate.origin_refs.length === 0 ||
        candidate.origin_refs.some((ref) => !allowed.has(ref))) {
      fail('Continuation Candidate origin ref is outside the Synthesis revision');
    }
  }
  assertUnique(ids, 'Continuation Candidate ids');
  const body = {
    schema_version: 'research-continuation-proposal/v1' as const,
    ...input,
    authority: 'non_authoritative' as const
  };
  return validateContract<ResearchContinuationProposalV1>('research-continuation-proposal', {
    ...body,
    proposal_digest: sha256(body)
  });
}

export function createResearchSynthesisStatus(
  input: CreateResearchSynthesisStatusInput
): ResearchSynthesisStatusV1 {
  if (!STABLE_ID.test(input.synthesis_id) || input.attempt_count < 0 ||
      !Number.isInteger(input.attempt_count)) {
    fail('Research Synthesis Status identity is invalid');
  }
  if (input.input_snapshot_ref !== null) assertRef(input.input_snapshot_ref, 'Status Snapshot');
  if (input.latest_revision_ref !== null) assertRef(input.latest_revision_ref, 'Status revision');
  if (input.phase === 'not_requested' && (
    input.input_snapshot_ref !== null || input.latest_revision_ref !== null ||
    input.attempt_count !== 0 || input.blocked_reason !== null
  )) fail('not_requested Synthesis Status cannot contain execution state');
  if (input.phase === 'planned' && (
    input.input_snapshot_ref === null || input.latest_revision_ref !== null ||
    input.blocked_reason !== null
  )) fail('planned Synthesis Status requires only an Input Snapshot');
  if (input.phase === 'recorded' && (
    input.input_snapshot_ref === null || input.latest_revision_ref === null ||
    input.attempt_count < 1 || input.blocked_reason !== null
  )) fail('recorded Synthesis Status requires Snapshot, revision and attempt');
  if (input.phase === 'blocked' && (
    input.input_snapshot_ref === null || input.blocked_reason === null ||
    input.blocked_reason.trim().length === 0
  )) fail('blocked Synthesis Status requires Snapshot and reason');
  const body = { schema_version: 'research-synthesis-status/v1' as const, ...input };
  return validateContract<ResearchSynthesisStatusV1>('research-synthesis-status', {
    ...body,
    projection_digest: sha256(body)
  });
}
