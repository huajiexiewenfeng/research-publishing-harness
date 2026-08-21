import { sha256 } from '../../../core/digest.js';
import { HarnessError } from '../../../core/errors.js';
import { validateContract } from '../../../core/schema-validator.js';
import type { XArticlePublicationPlanV1 } from '../../../core/x-article-publication-plan.js';
import type { XArticlePublicVerification } from './article-public-verifier.js';

export type XArticleReceiptStatus =
  | 'published'
  | 'published_media_unverified'
  | 'outcome_unknown'
  | 'verification_conflict';

export interface CreateXArticleReceiptInput {
  readonly receiptId: string;
  readonly executionId: string;
  readonly plan: XArticlePublicationPlanV1;
  readonly status: XArticleReceiptStatus;
  readonly draftId: string;
  readonly editorRevision: string;
  readonly previewRevision: string;
  readonly publicVerification: XArticlePublicVerification;
  readonly issuedAt: string;
  readonly supersedesReceiptId: string | null;
}

export interface XArticlePublishReceiptV1 {
  readonly schema_version: '1.0';
  readonly receipt_id: string;
  readonly execution_id: string;
  readonly plan_id: string;
  readonly plan_digest: string;
  readonly status: XArticleReceiptStatus;
  readonly source_evidence: {
    readonly article_package_digest: string;
    readonly document_digest: string;
    readonly asset_digests: readonly string[];
  };
  readonly editor_evidence: {
    readonly draft_id: string;
    readonly editor_revision: string;
    readonly preview_revision: string;
    readonly content_match: true;
  };
  readonly public_evidence: XArticlePublicVerification;
  readonly issued_at: string;
  readonly supersedes_receipt_id: string | null;
  readonly receipt_digest: string;
}

export function createXArticleReceipt(input: CreateXArticleReceiptInput): XArticlePublishReceiptV1 {
  const requiredStatus = input.publicVerification.kind === 'full_match'
    ? 'published'
    : input.publicVerification.kind === 'media_unverified'
      ? 'published_media_unverified'
      : 'verification_conflict';
  if (input.status !== requiredStatus) {
    throw new HarnessError(
      'ARTICLE_PUBLICATION_CONFLICT',
      'X Article Receipt status cannot exceed public verification evidence'
    );
  }
  const base = {
    schema_version: '1.0' as const,
    receipt_id: input.receiptId,
    execution_id: input.executionId,
    plan_id: input.plan.plan_id,
    plan_digest: input.plan.plan_digest,
    status: input.status,
    source_evidence: {
      article_package_digest: input.plan.intent.article_package.digest,
      document_digest: sha256(input.plan.intent.document),
      asset_digests: input.plan.intent.visuals.map((binding) => binding.asset.digest)
    },
    editor_evidence: {
      draft_id: input.draftId,
      editor_revision: input.editorRevision,
      preview_revision: input.previewRevision,
      content_match: true as const
    },
    public_evidence: input.publicVerification,
    issued_at: input.issuedAt,
    supersedes_receipt_id: input.supersedesReceiptId
  };
  return validateContract<XArticlePublishReceiptV1>('x-article-publish-receipt', {
    ...base,
    receipt_digest: sha256(base)
  });
}
