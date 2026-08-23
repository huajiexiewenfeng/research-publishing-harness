import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { validateContract } from './schema-validator.js';
import type { ClaimStatus } from './types.js';
import type {
  ArtifactRefV2,
  ArtifactRefV2Input,
  ClaimVersionInput,
  ClaimVersionV1,
  ResearchIncrementRevisionInput,
  ResearchIncrementRevisionV1
} from './research-memory-types.js';

export const STABLE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,95}$/;

const CLAIM_RANK: Readonly<Record<ClaimStatus, number>> = {
  planned: 0,
  hypothesis: 1,
  inferred: 2,
  observed: 3,
  verified: 4
};

function assertStableId(value: string, label: string): void {
  if (!STABLE_ID_PATTERN.test(value)) {
    throw new HarnessError('CONTRACT_INVALID', `${label} must be an ASCII-safe stable id`);
  }
}

function assertWorkspaceRelativePath(value: string): void {
  const normalized = value.replaceAll('\\', '/');
  if (
    value.length === 0 ||
    /^[a-zA-Z]:[\\/]/.test(value) ||
    value.startsWith('/') ||
    normalized.split('/').some((part) => part === '..' || part.length === 0)
  ) {
    throw new HarnessError('WORKSPACE_PATH_INVALID', 'artifact path must be a contained workspace-relative path');
  }
}

export function createArtifactRefV2(input: ArtifactRefV2Input): ArtifactRefV2 {
  assertWorkspaceRelativePath(input.workspace_relative_path);
  const hex = input.digest.slice('sha256:'.length);
  const value = {
    schema_version: '2.3' as const,
    ...input,
    object_path: `memory/evidence/objects/sha256/${hex.slice(0, 2)}/${hex}`
  };
  return validateContract<ArtifactRefV2>('artifact-ref-v2', value);
}

export function createResearchIncrementRevision(
  input: ResearchIncrementRevisionInput
): ResearchIncrementRevisionV1 {
  assertStableId(input.increment_id, 'increment id');
  assertStableId(input.track_id, 'track id');
  const body = {
    schema_version: 'research-increment-revision/v1' as const,
    ...input
  };
  return validateContract<ResearchIncrementRevisionV1>('research-increment-revision', {
    ...body,
    content_digest: sha256(input)
  });
}

export function createClaimVersion(input: ClaimVersionInput): ClaimVersionV1 {
  assertStableId(input.claim_id, 'claim id');
  if (CLAIM_RANK[input.claim_status] > CLAIM_RANK[input.canonical_claim_status]) {
    throw new HarnessError('CONTRACT_INVALID', 'claim status cannot exceed canonical claim status');
  }
  const persisted = {
    claim_id: input.claim_id,
    version: input.version,
    statement: input.statement,
    claim_status: input.claim_status,
    evidence_refs: input.evidence_refs,
    boundary_refs: input.boundary_refs,
    increment_ref: input.increment_ref,
    evolution_refs: input.evolution_refs,
    summary: input.summary
  };
  const body = {
    schema_version: 'claim-version/v1' as const,
    ...persisted
  };
  return validateContract<ClaimVersionV1>('claim-version', {
    ...body,
    claim_digest: sha256(body)
  });
}
