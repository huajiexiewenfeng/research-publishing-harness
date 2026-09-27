import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { assertQuoteTarget, normalizePublicationText, type PublicationTargetPostV2, type XPublicationMode } from './publication-plan-v2.js';
import { validateContract } from './schema-validator.js';
import type { VisualAssetRef } from './types.js';

export interface PublicationItemV2_1 {
  readonly ordinal: number;
  readonly text: string;
  readonly digest: string;
  readonly reply_to?: 'previous' | 'target';
  readonly attachments: readonly VisualAssetRef[];
}

export interface PublicationIntentV2_1 {
  readonly schema_version: '2.1';
  readonly platform: 'x';
  readonly target_account: string;
  readonly adapter: 'browser';
  readonly mode: XPublicationMode;
  readonly target_post: PublicationTargetPostV2 | null;
  readonly quote_post?: PublicationTargetPostV2;
  readonly items: readonly PublicationItemV2_1[];
  readonly action: 'publish_once';
}

export interface PublicationPlanV2_1 {
  readonly schema_version: '2.1';
  readonly plan_id: string;
  readonly run_id: string;
  readonly intent: PublicationIntentV2_1;
  readonly items: readonly PublicationItemV2_1[];
  readonly plan_digest: string;
  readonly planned_at: string;
  readonly provenance: Readonly<Record<string, string>>;
  readonly article_package: { readonly root: string; readonly digest: string } | null;
}

export interface CreatePublicationPlanV2_1Input {
  readonly planId: string;
  readonly runId: string;
  readonly targetAccount: string;
  readonly mode: XPublicationMode;
  readonly targetPost: PublicationTargetPostV2 | null;
  readonly quotePost?: PublicationTargetPostV2;
  readonly items: ReadonlyArray<{
    readonly ordinal: number;
    readonly text: string;
    readonly reply_to?: 'previous' | 'target';
    readonly attachments: readonly VisualAssetRef[];
  }>;
  readonly articlePackage: { readonly root: string; readonly digest: string } | null;
  readonly authorizedAsset: VisualAssetRef | null;
  readonly plannedAt: string;
  readonly provenance: Readonly<Record<string, string>>;
}

const ACCOUNT = /^@[A-Za-z0-9_]{1,15}$/;

export function createPublicationPlanV2_1(input: CreatePublicationPlanV2_1Input): PublicationPlanV2_1 {
  const items: PublicationItemV2_1[] = input.items.map((item, index) => {
    const text = normalizePublicationText(item.text);
    if (item.ordinal !== index + 1 || text.length === 0) {
      throw new HarnessError('CONTRACT_INVALID', 'V2.1 publication items must be non-empty and contiguous');
    }
    return {
      ordinal: item.ordinal,
      text,
      digest: sha256(text),
      ...(item.reply_to === undefined ? {} : { reply_to: item.reply_to }),
      attachments: item.attachments.map((asset) => ({ ...asset, claim_refs: [...asset.claim_refs] }))
    };
  });
  assertAttachmentAuthorization(items, input.articlePackage, input.authorizedAsset, input.mode);
  const intent: PublicationIntentV2_1 = {
    schema_version: '2.1', platform: 'x', target_account: input.targetAccount,
    adapter: 'browser', mode: input.mode, target_post: input.targetPost,
    ...(input.quotePost === undefined ? {} : { quote_post: input.quotePost }),
    items, action: 'publish_once'
  };
  const plan: PublicationPlanV2_1 = {
    schema_version: '2.1', plan_id: input.planId, run_id: input.runId,
    intent, items, plan_digest: sha256({ intent, article_package: input.articlePackage }), planned_at: input.plannedAt,
    provenance: input.provenance, article_package: input.articlePackage
  };
  assertPublicationPlanV2_1(plan);
  return validateContract<PublicationPlanV2_1>('publication-plan-v2-1', plan);
}

export function assertPublicationPlanV2_1(plan: PublicationPlanV2_1): void {
  validateContract<PublicationPlanV2_1>('publication-plan-v2-1', plan);
  assertQuoteTarget(plan.intent);
  if (!ACCOUNT.test(plan.intent.target_account) ||
    sha256({ intent: plan.intent, article_package: plan.article_package }) !== plan.plan_digest ||
    sha256(plan.items) !== sha256(plan.intent.items)) {
    throw new HarnessError('APPROVAL_STALE', 'V2.1 publication intent no longer matches its digest');
  }
  plan.items.forEach((item, index) => {
    if (item.ordinal !== index + 1 || item.digest !== sha256(normalizePublicationText(item.text))) {
      throw new HarnessError('APPROVAL_STALE', `V2.1 publication item ${item.ordinal} is stale`);
    }
  });
  const singleValid = plan.intent.mode === 'single' && plan.items.length === 1 && plan.intent.target_post === null && plan.items[0]?.reply_to === undefined;
  const threadValid = plan.intent.mode === 'thread' && plan.items.length >= 2 && plan.intent.target_post === null && plan.items[0]?.reply_to === undefined && plan.items.slice(1).every((item) => item.reply_to === 'previous');
  const replyValid = plan.intent.mode === 'reply' && plan.items.length === 1 && plan.intent.target_post !== null && plan.items[0]?.reply_to === 'target';
  if (!singleValid && !threadValid && !replyValid) {
    throw new HarnessError('CONTRACT_INVALID', 'V2.1 publication mode, target, and reply chain are inconsistent');
  }
  const attachments = plan.items.flatMap((item) => item.attachments.map((asset) => ({ ordinal: item.ordinal, asset })));
  if (attachments.length > 1 || (plan.intent.mode === 'thread' && attachments[0]?.ordinal !== undefined && attachments[0].ordinal !== 1)) {
    throw new HarnessError('X_ATTACHMENT_MISMATCH', 'V2.1 allows one static image on the first publication item only');
  }
  if (attachments.length > 0 && plan.article_package === null) {
    throw new HarnessError('VISUAL_PATH_OUTSIDE_PACKAGE', 'a V2.1 attachment requires a locked Article Package');
  }
}

function assertAttachmentAuthorization(
  items: readonly PublicationItemV2_1[],
  articlePackage: CreatePublicationPlanV2_1Input['articlePackage'],
  authorizedAsset: VisualAssetRef | null,
  mode: XPublicationMode
): void {
  const attachments = items.flatMap((item) => item.attachments.map((asset) => ({ ordinal: item.ordinal, asset })));
  if (attachments.length > 1 || (mode === 'thread' && attachments[0]?.ordinal !== undefined && attachments[0].ordinal !== 1)) {
    throw new HarnessError('X_ATTACHMENT_MISMATCH', 'V2.1 allows at most one image and Thread only on ordinal one');
  }
  if (attachments.length === 0) {
    if (authorizedAsset !== null) throw new HarnessError('X_ATTACHMENT_MISMATCH', 'the explicitly authorized asset was not attached');
    return;
  }
  if (articlePackage === null || authorizedAsset === null || sha256(attachments[0]!.asset) !== sha256(authorizedAsset)) {
    throw new HarnessError('VISUAL_DIGEST_MISMATCH', 'attachment is not the exact asset authorized by the Article Handoff');
  }
}
