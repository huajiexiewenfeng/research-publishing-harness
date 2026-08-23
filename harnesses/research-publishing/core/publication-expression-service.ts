import type { ClaimStatus } from './types.js';
import { HarnessError } from './errors.js';
import {
  VersionedPublicationEvidenceReader,
  type PublicationEvidenceReader,
  type PublicationIntentBinding,
  type PublicationReceiptBinding
} from './publication-evidence-reader.js';
import { createPublicationExpression } from './research-memory-contracts.js';
import type {
  PrivacyClassification,
  PublicationChannel,
  PublicationExpressionV1
} from './research-memory-types.js';
import type { WorkspaceStore } from './workspace-store.js';

export type { PublicationChannel } from './research-memory-types.js';

export interface AssemblePublicationExpressionInput {
  readonly expression_id: string;
  readonly increment_ref: string;
  readonly channel: PublicationChannel;
  readonly language: string;
  readonly derivation_type: 'original' | 'translation' | 'compression' | 'adaptation';
  readonly claim_refs: readonly string[];
  readonly visual_refs: readonly string[];
  readonly evidence_snapshot_refs: readonly string[];
  readonly intent: PublicationIntentBinding;
  readonly receipt: PublicationReceiptBinding | null;
  readonly source_claim_statuses: Readonly<Record<string, ClaimStatus>>;
  readonly expression_claim_statuses: Readonly<Record<string, ClaimStatus>>;
  readonly target_privacy_classification: PrivacyClassification;
}

const PRIVACY_RANK: Readonly<Record<PrivacyClassification, number>> = {
  public: 0,
  internal: 1,
  data_only: 1,
  restricted: 2
};

const CLAIM_RANK: Readonly<Record<ClaimStatus, number>> = {
  planned: 0,
  hypothesis: 1,
  inferred: 2,
  observed: 3,
  verified: 4
};

export class PublicationExpressionService {
  private readonly reader: PublicationEvidenceReader;

  constructor(store: WorkspaceStore, reader?: PublicationEvidenceReader) {
    this.reader = reader ?? new VersionedPublicationEvidenceReader(store);
  }

  async assemble(input: AssemblePublicationExpressionInput): Promise<PublicationExpressionV1> {
    const intended = await this.reader.readIntent(input.intent);
    if (intended.channel !== input.channel) {
      throw new HarnessError('CONTRACT_INVALID', 'Publication Expression channel differs from approved intent');
    }
    if (PRIVACY_RANK[intended.privacy_classification] > PRIVACY_RANK[input.target_privacy_classification]) {
      throw new HarnessError('PRIVACY_GATE_BLOCKED', 'Publication Expression cannot downgrade intent privacy');
    }
    if (new Set(input.claim_refs).size !== input.claim_refs.length ||
      input.claim_refs.some((ref) => input.source_claim_statuses[ref] === undefined)) {
      throw new HarnessError('CONTRACT_INVALID', 'Publication Expression claim refs must resolve exactly');
    }
    for (const ref of input.claim_refs) {
      const source = input.source_claim_statuses[ref]!;
      const expression = input.expression_claim_statuses[ref];
      if (expression === undefined || CLAIM_RANK[expression] > CLAIM_RANK[source]) {
        throw new HarnessError('CONTRACT_INVALID', 'Publication Expression cannot strengthen source claim status');
      }
    }
    if (input.visual_refs.length !== intended.visual_refs.length ||
      input.visual_refs.some((ref, index) => ref !== intended.visual_refs[index])) {
      throw new HarnessError('CONTRACT_INVALID', 'Publication Expression visuals differ from approved intent');
    }

    const observed = input.receipt === null ? null : await this.reader.readObservation(input.receipt);
    if (observed !== null) {
      if (PRIVACY_RANK[observed.privacy_classification] > PRIVACY_RANK[input.target_privacy_classification]) {
        throw new HarnessError('PRIVACY_GATE_BLOCKED', 'Publication Expression cannot downgrade Receipt privacy');
      }
      if (observed.bound_plan_digest !== null && observed.bound_plan_digest !== intended.approved_plan_digest) {
        throw new HarnessError('APPROVAL_STALE', 'terminal Receipt does not bind the approved publication Plan');
      }
    }
    const intendedContent = {
      approved_plan_ref: intended.approved_plan_ref,
      approved_plan_digest: intended.approved_plan_digest,
      local_content_path: intended.local_content_path,
      content_digest: intended.content_digest,
      expected_item_order: intended.expected_item_order,
      link_refs: intended.link_refs,
      visual_refs: intended.visual_refs
    };
    return createPublicationExpression({
      expression_id: input.expression_id,
      increment_ref: input.increment_ref,
      channel: input.channel,
      language: input.language,
      derivation_type: input.derivation_type,
      claim_refs: [...input.claim_refs],
      visual_refs: [...input.visual_refs],
      evidence_snapshot_refs: [...input.evidence_snapshot_refs],
      intended_content: intendedContent,
      observed_content: observed?.observed_content ?? null,
      verification_level: observed?.verification_level ?? 'planned',
      platform_refs: observed?.platform_refs ?? [],
      publication_receipt_ref: observed?.receipt_ref ?? null,
      published_at: observed?.published_at ?? null
    });
  }
}
