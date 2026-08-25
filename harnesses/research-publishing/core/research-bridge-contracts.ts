import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import type {
  ClaimProjectionV1,
  CreateClaimProjectionInput,
  CreateWeeklyResearchBridgeStatusInput,
  CreateWeeklyResearchIncrementBindingInput,
  WeeklyResearchBridgeStatusV1,
  WeeklyResearchIncrementBindingV1
} from './research-bridge-types.js';
import type { ClaimBoundaryStatus, ResearchArtifactRefV1 } from './research-program-types.js';
import { validateContract } from './schema-validator.js';
import type { LegacyClaimStatus } from './types.js';
import type { WeeklyPublicationOutcomeV1 } from './weekly-outcome-types.js';

const STABLE_ID = /^[a-z0-9][a-z0-9_-]{0,95}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;

const CLAIM_PROJECTION: Readonly<Record<ClaimBoundaryStatus, LegacyClaimStatus>> = {
  validated: 'verified',
  shipped: 'observed',
  observed: 'observed',
  exploring: 'hypothesis',
  planned: 'planned',
  hypothesis: 'hypothesis'
};

function fail(message: string): never {
  throw new HarnessError('CONTRACT_INVALID', message);
}

function assertRef(ref: ResearchArtifactRefV1, label: string): void {
  if (
    ref.path.length === 0 || ref.path.includes('\\') || ref.path.startsWith('/') ||
    /^[A-Za-z]:/.test(ref.path) || ref.path.split('/').some(
      (segment) => segment === '' || segment === '.' || segment === '..'
    )
  ) {
    fail(`${label} must use a safe workspace-relative path`);
  }
  if (!DIGEST.test(ref.digest)) fail(`${label} requires a canonical digest`);
}

function assertUnique(values: readonly string[], label: string): void {
  if (values.some((value) => value.trim().length === 0) ||
      new Set(values).size !== values.length) {
    fail(`${label} must contain unique non-empty values`);
  }
}

export function projectPackageClaimStatus(status: ClaimBoundaryStatus): LegacyClaimStatus {
  return CLAIM_PROJECTION[status];
}

export function candidateClaimRef(projectionId: string, sourceClaimId: string): string {
  if (!STABLE_ID.test(projectionId) || !STABLE_ID.test(sourceClaimId)) {
    fail('Candidate Claim identity requires stable Projection and source Claim ids');
  }
  return `claim-candidate:${projectionId}:${sourceClaimId}`;
}

export function incrementIdForOutcome(outcome: WeeklyPublicationOutcomeV1): string {
  if (!STABLE_ID.test(outcome.outcome_id) || !DIGEST.test(outcome.outcome_digest)) {
    fail('Weekly Outcome identity is invalid');
  }
  return `weekly_${outcome.outcome_id}_${outcome.outcome_digest.slice(7, 19)}`;
}

export function createClaimProjection(input: CreateClaimProjectionInput): ClaimProjectionV1 {
  if (!STABLE_ID.test(input.projection_id)) fail('Claim Projection id is invalid');
  assertRef(input.outcome_ref, 'Claim Projection Outcome ref');
  assertRef(input.package_ref, 'Claim Projection Package ref');
  if (input.items.length === 0) fail('Claim Projection requires at least one Package Claim');
  const sourceRefs: string[] = [];
  const candidateRefs: string[] = [];
  for (const item of input.items) {
    if (!STABLE_ID.test(item.source_claim_id) || !DIGEST.test(item.statement_digest)) {
      fail('Claim Projection item identity or statement digest is invalid');
    }
    const expectedRef = candidateClaimRef(input.projection_id, item.source_claim_id);
    if (item.candidate_claim_ref !== expectedRef ||
        item.candidate_status !== projectPackageClaimStatus(item.source_status)) {
      fail('Claim Projection mapping or candidate status is invalid');
    }
    if (item.projection_rule !== 'package-to-memory-claim/v1' ||
        item.loss_note.trim().length === 0) {
      fail('Claim Projection item requires the locked rule and a loss note');
    }
    assertUnique(item.evidence_refs, 'Claim Projection Evidence refs');
    sourceRefs.push(item.source_claim_ref);
    candidateRefs.push(item.candidate_claim_ref);
  }
  assertUnique(sourceRefs, 'Claim Projection source refs');
  assertUnique(candidateRefs, 'Claim Projection candidate refs');
  const body = { schema_version: 'claim-projection/v1' as const, ...input };
  return validateContract<ClaimProjectionV1>('claim-projection', {
    ...body,
    projection_digest: sha256(body)
  });
}

export function assertClaimProjection(value: ClaimProjectionV1): void {
  const { schema_version: _schema, projection_digest, ...input } = value;
  void _schema;
  if (createClaimProjection(input).projection_digest !== projection_digest) {
    fail('Claim Projection digest mismatch');
  }
}

export function createWeeklyResearchIncrementBinding(
  input: CreateWeeklyResearchIncrementBindingInput
): WeeklyResearchIncrementBindingV1 {
  if (!STABLE_ID.test(input.cycle_id) || !STABLE_ID.test(input.increment_id) ||
      !STABLE_ID.test(input.track_id)) {
    fail('Weekly Research Increment Binding ids are invalid');
  }
  assertRef(input.outcome_ref, 'Increment Binding Outcome ref');
  assertRef(input.claim_projection_ref, 'Increment Binding Claim Projection ref');
  assertRef(input.increment_revision_ref, 'Increment Binding revision ref');
  if (input.outcome_ref.path !== `program/weeks/${input.cycle_id}/outcome.json` ||
      input.claim_projection_ref.path !==
        `program/weeks/${input.cycle_id}/research-bridge/claim-projection.json` ||
      input.increment_ref !== `increment:${input.track_id}:${input.increment_id}@1` ||
      input.increment_revision_ref.path !==
        `memory/increments/${input.increment_id}/revisions/1/revision.json`) {
    fail('Weekly Research Increment Binding layout or Increment ref is invalid');
  }
  const body = {
    schema_version: 'weekly-research-increment-binding/v1' as const,
    ...input,
    binding_policy: 'one-outcome-one-increment/v1' as const
  };
  return validateContract<WeeklyResearchIncrementBindingV1>(
    'weekly-research-increment-binding',
    { ...body, binding_digest: sha256(body) }
  );
}

export function assertWeeklyResearchIncrementBinding(
  value: WeeklyResearchIncrementBindingV1
): void {
  const {
    schema_version: _schema,
    binding_policy: _policy,
    binding_digest,
    ...input
  } = value;
  void _schema;
  void _policy;
  if (createWeeklyResearchIncrementBinding(input).binding_digest !== binding_digest) {
    fail('Weekly Research Increment Binding digest mismatch');
  }
}

export function createWeeklyResearchBridgeStatus(
  input: CreateWeeklyResearchBridgeStatusInput
): WeeklyResearchBridgeStatusV1 {
  if (!STABLE_ID.test(input.cycle_id)) fail('Weekly Research Bridge cycle id is invalid');
  assertRef(input.outcome_ref, 'Weekly Research Bridge Outcome ref');
  for (const [label, ref] of [
    ['Claim Projection', input.claim_projection_ref],
    ['Increment Binding', input.increment_binding_ref],
    ['Article Expression', input.article_expression_ref],
    ['Single Expression', input.single_expression_ref]
  ] as const) {
    if (ref !== null) assertRef(ref, label);
  }
  const required = [
    input.claim_projection_ref, input.increment_binding_ref,
    input.article_expression_ref, input.article_evidence_ref,
    input.single_expression_ref, input.single_evidence_ref
  ];
  if (input.phase === 'complete' && (
    required.some((value) => value === null) || input.blocked_reason !== null
  )) {
    fail('complete Weekly Research Bridge Status requires every artifact and Evidence ref');
  }
  if (input.phase === 'blocked' && (
    input.blocked_reason === null || input.blocked_reason.trim().length === 0
  )) {
    fail('blocked Weekly Research Bridge Status requires a reason');
  }
  if (input.phase !== 'blocked' && input.blocked_reason !== null) {
    fail('Only a blocked Weekly Research Bridge Status may contain a reason');
  }
  const body = { schema_version: 'weekly-research-bridge-status/v1' as const, ...input };
  return validateContract<WeeklyResearchBridgeStatusV1>('weekly-research-bridge-status', {
    ...body,
    projection_digest: sha256(body)
  });
}

export function assertWeeklyResearchBridgeStatus(value: WeeklyResearchBridgeStatusV1): void {
  const { schema_version: _schema, projection_digest, ...input } = value;
  void _schema;
  if (createWeeklyResearchBridgeStatus(input).projection_digest !== projection_digest) {
    fail('Weekly Research Bridge Status digest mismatch');
  }
}
