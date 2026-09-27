import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { validateContract } from './schema-validator.js';

export type PublicationAdapterV2 = 'manual' | 'browser';
export type XPublicationMode = 'single' | 'thread' | 'reply';

export interface PublicationItemV2 {
  readonly ordinal: number;
  readonly text: string;
  readonly digest: string;
  readonly reply_to?: 'previous' | 'target';
}

export interface PublicationTargetPostV2 {
  readonly id: string;
  readonly url: string;
  readonly author: string;
  readonly snapshot_digest: string;
}

export interface PublicationMediaV2 {
  readonly kind: 'image' | 'video' | 'gif';
  readonly digest: string;
}

export interface PublicationIntentV2 {
  readonly schema_version: '2.0';
  readonly platform: 'x';
  readonly target_account: string;
  readonly adapter: PublicationAdapterV2;
  readonly mode: XPublicationMode;
  readonly target_post: PublicationTargetPostV2 | null;
  readonly quote_post?: PublicationTargetPostV2;
  readonly media: readonly PublicationMediaV2[];
  readonly items: readonly PublicationItemV2[];
  readonly action: 'publish_once';
}

export interface PublicationPlanV2 {
  readonly schema_version: '2.0';
  readonly plan_id: string;
  readonly run_id: string;
  readonly intent: PublicationIntentV2;
  readonly items: readonly PublicationItemV2[];
  readonly plan_digest: string;
  readonly planned_at: string;
  readonly provenance: Readonly<Record<string, string>>;
}

export interface CreatePublicationPlanV2Input {
  readonly planId: string;
  readonly runId: string;
  readonly targetAccount: string;
  readonly adapter: PublicationAdapterV2;
  readonly mode: XPublicationMode;
  readonly targetPost: PublicationTargetPostV2 | null;
  readonly quotePost?: PublicationTargetPostV2;
  readonly media: readonly PublicationMediaV2[];
  readonly items: ReadonlyArray<{
    readonly ordinal: number;
    readonly text: string;
    readonly reply_to?: 'previous' | 'target';
  }>;
  readonly plannedAt: string;
  readonly provenance: Readonly<Record<string, string>>;
}

const ACCOUNT = /^@[A-Za-z0-9_]{1,15}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;

export function normalizePublicationText(text: string): string {
  return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').normalize('NFC');
}

export function createPublicationPlanV2(
  input: CreatePublicationPlanV2Input
): PublicationPlanV2 {
  const items = input.items.map((item, index) => {
    const text = normalizePublicationText(item.text);
    if (item.ordinal !== index + 1 || text.length === 0) {
      throw new HarnessError(
        'CONTRACT_INVALID',
        'V2 publication items must be non-empty and contiguous'
      );
    }
    return {
      ordinal: item.ordinal,
      text,
      digest: sha256(text),
      ...(item.reply_to === undefined ? {} : { reply_to: item.reply_to })
    };
  });
  const intent: PublicationIntentV2 = {
    schema_version: '2.0',
    platform: 'x',
    target_account: input.targetAccount,
    adapter: input.adapter,
    mode: input.mode,
    target_post: input.targetPost,
    ...(input.quotePost === undefined ? {} : { quote_post: input.quotePost }),
    media: input.media,
    items,
    action: 'publish_once'
  };
  const plan: PublicationPlanV2 = {
    schema_version: '2.0',
    plan_id: input.planId,
    run_id: input.runId,
    intent,
    items,
    plan_digest: sha256(intent),
    planned_at: input.plannedAt,
    provenance: input.provenance
  };
  assertPublicationPlanV2(plan);
  return validateContract<PublicationPlanV2>('publication-plan-v2', plan);
}

export function assertPublicationPlanV2(plan: PublicationPlanV2): void {
  validateContract<PublicationPlanV2>('publication-plan-v2', plan);
  assertQuoteTarget(plan.intent);
  if (!ACCOUNT.test(plan.intent.target_account) || !SHA256.test(plan.plan_digest)) {
    throw new HarnessError('CONTRACT_INVALID', 'invalid V2 account or digest');
  }
  if (sha256(plan.intent) !== plan.plan_digest || plan.items.length !== plan.intent.items.length) {
    throw new HarnessError('APPROVAL_STALE', 'V2 publication intent no longer matches its digest');
  }
  plan.items.forEach((item, index) => {
    if (
      item.ordinal !== index + 1 ||
      item.digest !== sha256(normalizePublicationText(item.text)) ||
      item.digest !== plan.intent.items[index]?.digest
    ) {
      throw new HarnessError('APPROVAL_STALE', `V2 publication item ${item.ordinal} is stale`);
    }
  });
  const singleValid =
    plan.intent.mode === 'single' &&
    plan.items.length === 1 &&
    plan.intent.target_post === null &&
    plan.items[0]?.reply_to === undefined;
  const threadValid =
    plan.intent.mode === 'thread' &&
    plan.items.length >= 2 &&
    plan.intent.target_post === null &&
    plan.items[0]?.reply_to === undefined &&
    plan.items.slice(1).every((item) => item.reply_to === 'previous');
  const replyValid =
    plan.intent.mode === 'reply' &&
    plan.items.length === 1 &&
    plan.intent.target_post !== null &&
    plan.items[0]?.reply_to === 'target';
  if (!singleValid && !threadValid && !replyValid) {
    throw new HarnessError(
      'CONTRACT_INVALID',
      'V2 publication mode, target, and reply chain are inconsistent'
    );
  }
}

export function assertQuoteTarget(intent: { readonly mode: XPublicationMode; readonly quote_post?: PublicationTargetPostV2 }): void {
  const target = intent.quote_post;
  if (target === undefined) return;
  const match = /^https:\/\/x\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d+)$/.exec(target.url);
  if (intent.mode !== 'single' || !match || match[2] !== target.id ||
    `@${match[1]}`.toLowerCase() !== target.author.toLowerCase()) {
    throw new HarnessError('CONTRACT_INVALID', 'Quote requires a Single and an exact X account/post URL binding');
  }
}
