import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import {
  createSemanticMemoryDelta,
  createSemanticPromotionReview,
  STABLE_ID_PATTERN
} from './research-memory-contracts.js';
import type {
  ReviewDeltaInput,
  SemanticMemoryDeltaInput,
  SemanticMemoryDeltaV1,
  SemanticPromotionReviewV1
} from './research-memory-types.js';
import { ResearchEvidenceService } from './research-evidence-service.js';
import { validateContract } from './schema-validator.js';
import type { WorkspaceStore } from './workspace-store.js';

const INCREMENT_REF = /^increment:([a-z0-9][a-z0-9_-]{0,95}):([a-z0-9][a-z0-9_-]{0,95})@(\d+)$/;
const EVIDENCE_REF = /^evidence:([a-z0-9][a-z0-9_-]{0,95})$/;

function unsigned<T extends object>(value: T, key: keyof T): object {
  const copy = { ...value } as Record<PropertyKey, unknown>;
  Reflect.deleteProperty(copy, key);
  return copy;
}

export class SemanticDeltaService {
  private readonly evidence: ResearchEvidenceService;

  constructor(
    private readonly store: WorkspaceStore,
    private readonly ids: Readonly<{ now?: () => Date }> = {}
  ) {
    this.evidence = new ResearchEvidenceService(store);
  }

  async propose(input: SemanticMemoryDeltaInput): Promise<SemanticMemoryDeltaV1> {
    const match = INCREMENT_REF.exec(input.increment_ref);
    if (match === null) {
      throw new HarnessError('CONTRACT_INVALID', 'Semantic Delta Increment ref is invalid');
    }
    const [, trackId, incrementId, revisionText] = match;
    const revision = Number(revisionText);
    const storedRevision = await this.store.readJson<{
      track_id: string; revision: number; content_digest: string;
    }>(`memory/increments/${incrementId}/revisions/${revision}/revision.json`);
    if (storedRevision.track_id !== trackId || storedRevision.revision !== revision) {
      throw new HarnessError('ARTIFACT_NOT_FOUND', 'Semantic Delta Increment revision is unresolved');
    }
    for (const ref of input.evidence_snapshot_refs) {
      const evidence = EVIDENCE_REF.exec(ref);
      if (evidence === null) throw new HarnessError('CONTRACT_INVALID', 'Semantic Delta Evidence ref is invalid');
      await this.evidence.status(evidence[1]!);
    }
    const delta = createSemanticMemoryDelta({
      ...input,
      generated_at: input.generated_at || (this.ids.now?.() ?? new Date()).toISOString()
    });
    await this.store.writeNew(`memory/deltas/${delta.delta_id}/delta.json`, delta);
    return delta;
  }

  async review(deltaId: string, input: ReviewDeltaInput): Promise<SemanticPromotionReviewV1> {
    if (!STABLE_ID_PATTERN.test(deltaId)) throw new HarnessError('CONTRACT_INVALID', 'Delta id must be stable');
    const delta = validateContract<SemanticMemoryDeltaV1>(
      'semantic-memory-delta',
      await this.store.readJson(`memory/deltas/${deltaId}/delta.json`)
    );
    if (sha256(unsigned(delta, 'delta_digest')) !== delta.delta_digest) {
      throw new HarnessError('MEMORY_SOURCE_STALE', 'Semantic Delta digest no longer matches');
    }
    const review = createSemanticPromotionReview(delta, input);
    await this.store.writeNew(`memory/reviews/${review.review_id}/review.json`, review);
    return review;
  }
}
