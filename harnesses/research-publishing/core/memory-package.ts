import { HarnessError } from './errors.js';
import { validateContract } from './schema-validator.js';
import type { ContextSnapshotV1 } from './memory-types.js';
import type { ResearchContextReviewV2, ResearchContextSnapshotV2 } from './research-query-types.js';
import type {
  ResearchContentPackage,
  ResearchContentPackageV1_1
} from './types.js';

const MEMORY_REF_PREFIX = 'llm-wiki:';

export function validatePackageMemoryBinding<T extends ResearchContentPackage>(
  packageValue: T
): T {
  const valid = validateContract<T>('research-content-package', packageValue);
  if (valid.schema_version === '1.0') return valid;

  const applied = new Set(valid.memory_context.context_refs);
  for (const evidence of valid.evidence) {
    if (evidence.source_ref.startsWith(MEMORY_REF_PREFIX) && !applied.has(evidence.source_ref)) {
      throw new HarnessError(
        'CONTRACT_INVALID',
        `evidence ${evidence.evidence_id} references unapplied memory context: ${evidence.source_ref}`
      );
    }
  }
  return valid;
}

export function bindResearchMemoryContext(
  packageDraft: ResearchContentPackageV1_1,
  snapshot: ResearchContextSnapshotV2,
  review: ResearchContextReviewV2
): ResearchContentPackageV1_1 {
  if (packageDraft.status !== 'draft') {
    throw new HarnessError('STATE_TRANSITION_INVALID', 'memory may bind to a draft package only');
  }
  if (
    review.query_id !== snapshot.query_id || review.query_plan_digest !== snapshot.query_plan_digest ||
    review.snapshot_digest !== snapshot.snapshot_digest
  ) {
    throw new HarnessError('CONTRACT_INVALID', 'Research memory Review does not bind the frozen Snapshot');
  }
  const available = new Set(snapshot.context_items.map((item) => item.context_ref));
  if (review.selected_context_refs.some((ref) => !available.has(ref))) {
    throw new HarnessError('CONTRACT_INVALID', 'selected memory context ref is not in the frozen Snapshot');
  }
  if (review.selected_context_refs.length > 0 && snapshot.query_status !== 'loaded') {
    throw new HarnessError('CONTRACT_INVALID', 'only a loaded Research Context Snapshot may be applied');
  }
  const selected = new Set(review.selected_context_refs);
  const ordered = snapshot.context_items.map((item) => item.context_ref).filter((ref) => selected.has(ref));
  return validatePackageMemoryBinding({
    ...packageDraft,
    memory_context: {
      schema_version: 'memory-context/v2',
      research_query_plan_digest: snapshot.query_plan_digest,
      research_context_snapshot_digest: snapshot.snapshot_digest,
      context_refs: ordered,
      status: ordered.length > 0 ? 'applied' : 'reviewed_not_applied',
      reviewer: review.reviewer,
      reviewed_at: review.reviewed_at
    }
  });
}

export function bindMemoryContext(
  packageDraft: ResearchContentPackageV1_1,
  snapshot: ContextSnapshotV1,
  selectedRefs: readonly string[],
  reviewer: string,
  now: Date
): ResearchContentPackageV1_1 {
  if (packageDraft.status !== 'draft') {
    throw new HarnessError('STATE_TRANSITION_INVALID', 'memory may bind to a draft package only');
  }
  if (reviewer.trim().length === 0 || !Number.isFinite(now.getTime())) {
    throw new HarnessError('CONTRACT_INVALID', 'memory review requires a reviewer and valid timestamp');
  }
  const available = new Set(snapshot.items.map((item) => item.context_ref));
  const selected = [...new Set(selectedRefs)];
  if (selected.some((ref) => !available.has(ref))) {
    throw new HarnessError('CONTRACT_INVALID', 'selected memory context ref is not in the frozen snapshot');
  }
  if (selected.length > 0 && snapshot.status !== 'loaded') {
    throw new HarnessError('CONTRACT_INVALID', 'only a loaded context snapshot may be applied');
  }
  const ordered = snapshot.items
    .map((item) => item.context_ref)
    .filter((ref) => selected.includes(ref));
  const bound: ResearchContentPackageV1_1 = {
    ...packageDraft,
    memory_context: {
      query_plan_digest: snapshot.query_plan_digest,
      context_snapshot_digest: snapshot.snapshot_digest,
      context_refs: ordered,
      status: ordered.length > 0 ? 'applied' : 'reviewed_not_applied',
      reviewer: reviewer.trim(),
      reviewed_at: now.toISOString()
    }
  };
  return validatePackageMemoryBinding(bound);
}
