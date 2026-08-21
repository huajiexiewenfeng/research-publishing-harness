import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { validateContract } from './schema-validator.js';
import type { VisualAssetRef } from './types.js';
import type { XArticleDocumentV1 } from '../branches/x-article-harness/article-document.js';

export interface XArticleVisualBindingV1 {
  readonly asset: VisualAssetRef;
  readonly placement:
    | { readonly kind: 'cover' }
    | { readonly kind: 'block'; readonly block_ordinal: number };
}

export interface XArticlePublicationIntentV1 {
  readonly schema_version: '1.0';
  readonly platform: 'x';
  readonly target_account: string;
  readonly adapter: 'browser';
  readonly audience: 'everyone';
  readonly action: 'publish_once';
  readonly article_package: { readonly root: string; readonly digest: string };
  readonly document: XArticleDocumentV1;
  readonly visuals: readonly XArticleVisualBindingV1[];
}

export interface XArticlePublicationPlanV1 {
  readonly schema_version: '1.0';
  readonly plan_id: string;
  readonly run_id: string;
  readonly intent: XArticlePublicationIntentV1;
  readonly plan_digest: string;
  readonly planned_at: string;
  readonly provenance: Readonly<Record<string, string>>;
}

export interface CreateXArticlePublicationPlanInput {
  readonly planId: string;
  readonly runId: string;
  readonly targetAccount: string;
  readonly articlePackage: { readonly root: string; readonly digest: string };
  readonly document: XArticleDocumentV1;
  readonly visuals: readonly XArticleVisualBindingV1[];
  readonly plannedAt: string;
  readonly provenance: Readonly<Record<string, string>>;
}

const ACCOUNT = /^@[A-Za-z0-9_]{1,15}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;

function assertSafeRoot(root: string): void {
  if (
    root.length === 0 || root.includes('\\') || root.startsWith('/') ||
    /^[A-Za-z]:/.test(root) || root.split('/').includes('..')
  ) {
    throw new HarnessError('WORKSPACE_PATH_INVALID', 'Article Package root must be a safe workspace-relative path');
  }
}

export function assertXArticlePublicationPlan(plan: XArticlePublicationPlanV1): void {
  validateContract<XArticlePublicationPlanV1>('x-article-publication-plan', plan);
  validateContract<XArticleDocumentV1>('x-article-document', plan.intent.document);
  assertSafeRoot(plan.intent.article_package.root);
  if (!ACCOUNT.test(plan.intent.target_account) || !DIGEST.test(plan.intent.article_package.digest)) {
    throw new HarnessError('CONTRACT_INVALID', 'X Article account or Package Digest is invalid');
  }
  const assetIds = new Set<string>();
  for (const binding of plan.intent.visuals) {
    validateContract<VisualAssetRef>('visual-asset-ref', binding.asset);
    if (assetIds.has(binding.asset.asset_id)) {
      throw new HarnessError('ARTICLE_ASSET_MISMATCH', 'X Article visual bindings contain a duplicate asset');
    }
    assetIds.add(binding.asset.asset_id);
  }
  const cover = plan.intent.visuals.filter((binding) => binding.placement.kind === 'cover');
  if (
    (plan.intent.document.cover_asset_id === null && cover.length !== 0) ||
    (plan.intent.document.cover_asset_id !== null &&
      (cover.length !== 1 || cover[0]!.asset.asset_id !== plan.intent.document.cover_asset_id))
  ) {
    throw new HarnessError('ARTICLE_ASSET_MISMATCH', 'X Article cover binding differs from its document');
  }
  const documentImages = plan.intent.document.blocks.flatMap((block, index) =>
    block.kind === 'image' ? [{ asset_id: block.asset_id, block_ordinal: index + 1 }] : []
  );
  const inlineBindings = plan.intent.visuals.flatMap((binding) =>
    binding.placement.kind === 'block'
      ? [{ asset_id: binding.asset.asset_id, block_ordinal: binding.placement.block_ordinal }]
      : []
  );
  if (sha256(documentImages) !== sha256(inlineBindings)) {
    throw new HarnessError('ARTICLE_ASSET_MISMATCH', 'X Article inline visual bindings differ from its document');
  }
  if (plan.plan_digest !== sha256(plan.intent)) {
    throw new HarnessError('CONTRACT_INVALID', 'X Article Plan Digest does not match its Intent');
  }
}

export function createXArticlePublicationPlan(
  input: CreateXArticlePublicationPlanInput
): XArticlePublicationPlanV1 {
  assertSafeRoot(input.articlePackage.root);
  const intent: XArticlePublicationIntentV1 = {
    schema_version: '1.0',
    platform: 'x',
    target_account: input.targetAccount,
    adapter: 'browser',
    audience: 'everyone',
    action: 'publish_once',
    article_package: input.articlePackage,
    document: input.document,
    visuals: input.visuals
  };
  const plan: XArticlePublicationPlanV1 = {
    schema_version: '1.0',
    plan_id: input.planId,
    run_id: input.runId,
    intent,
    plan_digest: sha256(intent),
    planned_at: input.plannedAt,
    provenance: input.provenance
  };
  assertXArticlePublicationPlan(plan);
  return plan;
}
