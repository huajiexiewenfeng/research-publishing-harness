import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import type {
  ApprovePublicationBundleInput,
  PlanPublicationBundleInput,
  PublicationBundleApprovalV1,
  PublicationBundlePlanV1,
  PublicationBundleReceiptV1,
  CreatePublicationBundleReceiptInput
} from './publication-bundle-types.js';
import { validateContract } from './schema-validator.js';
import { assertXArticlePublicationPlan } from './x-article-publication-plan.js';

export const PUBLICATION_BUNDLE_TTL = {
  default_ms: 7_200_000,
  minimum_ms: 600_000,
  maximum_ms: 86_400_000
} as const;

const STABLE_ID = /^[a-z0-9][a-z0-9_-]*$/;
const ACCOUNT = /^@[A-Za-z0-9_]{1,15}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const DYNAMIC_TOKEN = /\{\{[^{}]+\}\}/g;

function fail(code: 'CONTRACT_INVALID' | 'APPROVAL_STALE', message: string): never {
  throw new HarnessError(code, message);
}

function assertStableId(value: string, label: string): void {
  if (!STABLE_ID.test(value)) fail('CONTRACT_INVALID', `${label} must be an ASCII-safe stable id`);
}

function assertDigest(value: string, label: string): asserts value is `sha256:${string}` {
  if (!DIGEST.test(value)) fail('CONTRACT_INVALID', `${label} must be a canonical SHA-256 digest`);
}

function assertSafeRelativePath(path: string, label: string): void {
  if (
    path.length === 0 || path.includes('\\') || path.startsWith('/') ||
    /^[A-Za-z]:/.test(path) || path.split('/').includes('..')
  ) {
    fail('CONTRACT_INVALID', `${label} must be a safe workspace-relative path`);
  }
}

function assertRef(ref: { readonly path: string; readonly digest: string }, label: string): void {
  assertSafeRelativePath(ref.path, `${label} path`);
  assertDigest(ref.digest, `${label} digest`);
}

function assertPlanInvariants(plan: PublicationBundlePlanV1): void {
  assertStableId(plan.bundle_id, 'Publication Bundle id');
  assertStableId(plan.cycle_id, 'Weekly Cycle id');
  assertRef(plan.cycle_ref, 'Cycle ref');
  assertRef(plan.selection_ref, 'Selection ref');
  assertRef(plan.research_content_package_ref, 'Research Content Package ref');
  assertRef(plan.canonical_article_package.package_ref, 'Canonical Article Package ref');
  assertSafeRelativePath(plan.canonical_article_package.root, 'Canonical Article Package root');
  assertDigest(plan.canonical_article_package.package_digest, 'Canonical Article Package digest');
  assertXArticlePublicationPlan(plan.article_plan);
  if (
    plan.cycle_ref.path !== `program/weeks/${plan.cycle_id}/cycle.json` ||
    plan.selection_ref.path !== `program/weeks/${plan.cycle_id}/selection.json` ||
    plan.research_content_package_ref.path !== `program/weeks/${plan.cycle_id}/package.json`
  ) {
    fail('CONTRACT_INVALID', 'Publication Bundle program refs must belong to the exact Weekly Cycle');
  }
  const tokens = plan.single_intent.text_template.match(DYNAMIC_TOKEN) ?? [];
  if (tokens.length !== 1 || tokens[0] !== '{{X_ARTICLE_URL}}') {
    fail('CONTRACT_INVALID', 'Single template requires exactly one {{X_ARTICLE_URL}} token');
  }
  assertStableId(plan.single_intent.run_id, 'Single run id');
  if (
    !ACCOUNT.test(plan.single_intent.target_account) ||
    plan.single_intent.target_account !== plan.article_plan.intent.target_account
  ) {
    fail('CONTRACT_INVALID', 'Single and Article must use the same valid target account');
  }
  if (
    plan.single_intent.article_package.root !== plan.canonical_article_package.root ||
    plan.single_intent.article_package.digest !== plan.canonical_article_package.package_digest ||
    plan.article_plan.intent.article_package.root !== plan.canonical_article_package.root ||
    plan.article_plan.intent.article_package.digest !== plan.canonical_article_package.package_digest
  ) {
    fail('CONTRACT_INVALID', 'Article and Single must bind the same Canonical Article Package');
  }
  if (
    plan.single_intent.claim_refs.length === 0 ||
    new Set(plan.single_intent.claim_refs).size !== plan.single_intent.claim_refs.length ||
    plan.single_intent.claim_refs.some((claim) => claim.trim().length === 0)
  ) {
    fail('CONTRACT_INVALID', 'Single Claim refs must be non-empty and unique');
  }
  if (
    !Number.isInteger(plan.authorization_ttl_ms) ||
    plan.authorization_ttl_ms < PUBLICATION_BUNDLE_TTL.minimum_ms ||
    plan.authorization_ttl_ms > PUBLICATION_BUNDLE_TTL.maximum_ms
  ) {
    fail('CONTRACT_INVALID', 'Publication Bundle authorization TTL is outside the locked range');
  }
  if (
    plan.substitution.token !== '{{X_ARTICLE_URL}}' ||
    plan.substitution.rule !== 'verified-x-article-canonical-url/v1' ||
    plan.execution_order[0] !== 'x_article' ||
    plan.execution_order[1] !== 'x_single' ||
    plan.execution_order.length !== 2 ||
    plan.action !== 'publish_bundle_once' ||
    plan.policy_version !== 'research-program-policy/v1'
  ) {
    fail('CONTRACT_INVALID', 'Publication Bundle locked policy is invalid');
  }
}

export function createPublicationBundlePlan(
  input: PlanPublicationBundleInput
): PublicationBundlePlanV1 {
  const body = {
    schema_version: 'publication-bundle-plan/v1' as const,
    bundle_id: input.bundle_id,
    cycle_id: input.cycle_id,
    cycle_ref: input.cycle_ref,
    selection_ref: input.selection_ref,
    research_content_package_ref: input.research_content_package_ref,
    canonical_article_package: input.canonical_article_package,
    article_plan: input.article_plan,
    single_intent: input.single_intent,
    substitution: {
      token: '{{X_ARTICLE_URL}}' as const,
      rule: 'verified-x-article-canonical-url/v1' as const
    },
    execution_order: ['x_article', 'x_single'] as const,
    authorization_ttl_ms: input.authorization_ttl_ms ?? PUBLICATION_BUNDLE_TTL.default_ms,
    action: 'publish_bundle_once' as const,
    policy_version: 'research-program-policy/v1' as const,
    planned_at: input.planned_at
  };
  const plan: PublicationBundlePlanV1 = {
    ...body,
    bundle_digest: sha256(body)
  };
  assertPlanInvariants(plan);
  return validateContract<PublicationBundlePlanV1>('publication-bundle-plan', plan);
}

export function assertPublicationBundlePlan(plan: PublicationBundlePlanV1): void {
  validateContract<PublicationBundlePlanV1>('publication-bundle-plan', plan);
  assertPlanInvariants(plan);
  const { bundle_digest, ...body } = plan;
  if (bundle_digest !== sha256(body)) {
    fail('APPROVAL_STALE', 'Publication Bundle Plan is stale');
  }
}

export function createPublicationBundleApproval(
  plan: PublicationBundlePlanV1,
  input: ApprovePublicationBundleInput,
  now: Date,
  approvalId: string
): PublicationBundleApprovalV1 {
  assertPublicationBundlePlan(plan);
  assertStableId(approvalId, 'Publication Bundle Approval id');
  if (
    input.bundle_id !== plan.bundle_id ||
    input.confirmed_bundle_digest !== plan.bundle_digest ||
    input.approved_by.trim().length === 0
  ) {
    fail('APPROVAL_STALE', 'Bundle confirmation does not match the installed Plan');
  }
  const approved_at = now.toISOString();
  const body = {
    schema_version: 'publication-bundle-approval/v1' as const,
    approval_id: approvalId,
    bundle_id: plan.bundle_id,
    bundle_digest: plan.bundle_digest,
    target_account: plan.article_plan.intent.target_account,
    scope: 'publish_bundle_once' as const,
    approved_by: input.approved_by,
    approved_at,
    expires_at: new Date(now.getTime() + plan.authorization_ttl_ms).toISOString()
  };
  return validateContract<PublicationBundleApprovalV1>('publication-bundle-approval', {
    ...body,
    approval_digest: sha256(body)
  });
}

export function assertPublicationBundleApproval(
  plan: PublicationBundlePlanV1,
  approval: PublicationBundleApprovalV1,
  now?: Date
): void {
  assertPublicationBundlePlan(plan);
  validateContract<PublicationBundleApprovalV1>('publication-bundle-approval', approval);
  const { approval_digest, ...body } = approval;
  const matches =
    approval.bundle_id === plan.bundle_id &&
    approval.bundle_digest === plan.bundle_digest &&
    approval.target_account === plan.article_plan.intent.target_account &&
    approval.scope === 'publish_bundle_once' &&
    Date.parse(approval.expires_at) - Date.parse(approval.approved_at) ===
      plan.authorization_ttl_ms &&
    approval_digest === sha256(body);
  if (!matches) {
    fail('APPROVAL_STALE', 'Publication Bundle Approval is stale');
  }
  if (now !== undefined && Date.parse(approval.expires_at) <= now.getTime()) {
    fail('APPROVAL_STALE', 'Publication Bundle Approval is expired');
  }
}

export function createPublicationBundleReceipt(
  input: CreatePublicationBundleReceiptInput
): PublicationBundleReceiptV1 {
  assertStableId(input.bundle_id, 'Publication Bundle id');
  assertRef(input.cycle_ref, 'Cycle ref');
  assertRef(input.bundle_plan_ref, 'Bundle Plan ref');
  assertRef(input.bundle_approval_ref, 'Bundle Approval ref');
  for (const [label, child] of [
    ['Article', input.article],
    ['Single', input.single]
  ] as const) {
    assertRef(child.plan_ref, `${label} Plan ref`);
    assertDigest(child.plan_digest, `${label} Plan digest`);
    assertRef(child.receipt_ref, `${label} Receipt ref`);
    assertDigest(child.receipt_digest, `${label} Receipt digest`);
  }
  if (
    !['published', 'published_media_unverified'].includes(input.article.status) ||
    !['finalized', 'published_media_unverified'].includes(input.single.status)
  ) {
    fail('CONTRACT_INVALID', 'A completed Bundle Receipt requires two verified child publications');
  }
  const limitations = [input.article.status, input.single.status].includes('published_media_unverified')
    ? ['published_media_unverified']
    : [];
  const body = {
    schema_version: 'publication-bundle-receipt/v1' as const,
    ...input,
    status: 'completed' as const,
    public_urls: [input.article.public_url, input.single.public_url] as const,
    limitations
  };
  return validateContract<PublicationBundleReceiptV1>('publication-bundle-receipt', {
    ...body,
    receipt_digest: sha256(body)
  });
}
