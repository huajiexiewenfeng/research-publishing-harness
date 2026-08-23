import { sha256, sha256Bytes } from './digest.js';
import { HarnessError } from './errors.js';
import type {
  PrivacyClassification,
  PublicationChannel,
  PublicationIntendedContentV1,
  PublicationObservedContentV1
} from './research-memory-types.js';
import { validateContract } from './schema-validator.js';
import type { WorkspaceStore } from './workspace-store.js';

export type PublicationIntentArtifactKind =
  | 'explicit'
  | 'article_package'
  | 'x_v2'
  | 'x_v2_1'
  | 'x_article';

export type PublicationReceiptArtifactKind = 'explicit' | 'x_v1' | 'x_v2' | 'x_v2_1' | 'x_article';

export interface PublicationIntentBinding {
  readonly kind: PublicationIntentArtifactKind;
  readonly path: string;
  readonly digest: `sha256:${string}`;
  readonly content_path: string;
  readonly content_digest: `sha256:${string}`;
  readonly privacy_classification: PrivacyClassification;
}

export interface PublicationReceiptBinding {
  readonly kind: PublicationReceiptArtifactKind;
  readonly path: string;
  readonly digest: `sha256:${string}`;
  readonly privacy_classification: PrivacyClassification;
}

export interface PublicationIntentEvidenceV1 extends PublicationIntendedContentV1 {
  readonly channel: PublicationChannel;
  readonly privacy_classification: PrivacyClassification;
}

export interface PublicationObservedEvidenceV1 {
  readonly receipt_ref: string;
  readonly bound_plan_digest: `sha256:${string}` | null;
  readonly observed_content: PublicationObservedContentV1 | null;
  readonly verification_level: 'manual_recorded' | 'public_verified' | 'outcome_unknown' | 'conflict';
  readonly platform_refs: readonly string[];
  readonly published_at: string | null;
  readonly privacy_classification: PrivacyClassification;
}

export interface PublicationEvidenceReader {
  readIntent(input: PublicationIntentBinding): Promise<PublicationIntentEvidenceV1>;
  readObservation(input: PublicationReceiptBinding): Promise<PublicationObservedEvidenceV1>;
}

type JsonObject = Record<string, unknown>;

function object(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new HarnessError('CONTRACT_INVALID', `${label} must be an object`);
  }
  return value as JsonObject;
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new HarnessError('CONTRACT_INVALID', `${label} must be a non-empty string`);
  }
  return value;
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new HarnessError('CONTRACT_INVALID', `${label} must contain strings`);
  }
  return [...new Set(value as string[])];
}

function ordinalArray(value: unknown, label: string): readonly number[] {
  if (!Array.isArray(value) || value.some((item) => !Number.isInteger(item) || (item as number) < 1)) {
    throw new HarnessError('CONTRACT_INVALID', `${label} must contain positive ordinals`);
  }
  return value as number[];
}

function urlsIn(value: unknown): readonly string[] {
  const matches = JSON.stringify(value).match(/https:\/\/[^"\\\s]+/g) ?? [];
  return [...new Set(matches)];
}

function visualRefsIn(plan: JsonObject): readonly string[] {
  if (plan.schema_version === 'publication-expression-intent/v1') {
    return stringArray(plan.visual_refs, 'explicit intent visual refs');
  }
  const intent = object(plan.intent, 'publication intent');
  const items = Array.isArray(intent.items) ? intent.items : [];
  const attachments = items.flatMap((item) => {
    const candidate = object(item, 'publication item');
    return Array.isArray(candidate.attachments) ? candidate.attachments : [];
  });
  const visuals = Array.isArray(intent.visuals)
    ? intent.visuals.map((binding) => object(object(binding, 'visual binding').asset, 'visual asset'))
    : [];
  return [...attachments, ...visuals].map((asset) => string(object(asset, 'visual asset').asset_id, 'visual asset id'));
}

function receiptRef(binding: PublicationReceiptBinding): string {
  return `receipt:${binding.path}#${binding.digest}`;
}

export class VersionedPublicationEvidenceReader implements PublicationEvidenceReader {
  constructor(private readonly store: WorkspaceStore) {}

  async readIntent(input: PublicationIntentBinding): Promise<PublicationIntentEvidenceV1> {
    const [plan, content] = await Promise.all([
      this.readVerifiedJson(input.path, input.digest, 'approved publication intent'),
      this.readVerifiedBytes(input.content_path, input.content_digest, 'publication content')
    ]);
    void content;
    let channel: PublicationChannel;
    let order: readonly number[];
    let links: readonly string[];
    let visuals: readonly string[];
    if (input.kind === 'explicit' || input.kind === 'article_package') {
      if (plan.schema_version !== 'publication-expression-intent/v1') {
        throw new HarnessError('CONTRACT_INVALID', 'explicit publication intent schema is unsupported');
      }
      channel = string(plan.channel, 'publication channel') as PublicationChannel;
      if (string(plan.content_path, 'intent content path') !== input.content_path ||
        string(plan.content_digest, 'intent content digest') !== input.content_digest) {
        throw new HarnessError('APPROVAL_STALE', 'approved publication content binding is stale');
      }
      order = ordinalArray(plan.expected_item_order, 'expected item order');
      links = stringArray(plan.link_refs, 'intent link refs');
      visuals = stringArray(plan.visual_refs, 'intent visual refs');
    } else {
      const contract = input.kind === 'x_v2'
        ? 'publication-plan-v2'
        : input.kind === 'x_v2_1'
          ? 'publication-plan-v2-1'
          : 'x-article-publication-plan';
      validateContract(contract, plan);
      const intent = object(plan.intent, 'publication intent');
      channel = input.kind === 'x_article'
        ? 'x_article'
        : `x_${string(intent.mode, 'X publication mode')}` as PublicationChannel;
      const items = input.kind === 'x_article'
        ? [1]
        : (plan.items as JsonObject[]).map((item) => Number(item.ordinal));
      order = ordinalArray(items, 'expected item order');
      links = urlsIn(intent);
      visuals = visualRefsIn(plan);
    }
    return {
      channel,
      approved_plan_ref: input.path,
      approved_plan_digest: input.digest,
      local_content_path: input.content_path,
      content_digest: input.content_digest,
      expected_item_order: order,
      link_refs: links,
      visual_refs: visuals,
      privacy_classification: input.privacy_classification
    };
  }

  async readObservation(input: PublicationReceiptBinding): Promise<PublicationObservedEvidenceV1> {
    const receipt = await this.readVerifiedJson(input.path, input.digest, 'publication Receipt');
    if (input.kind === 'explicit') return this.readExplicitObservation(input, receipt);
    if (input.kind === 'x_v1') {
      const value = validateContract<JsonObject>('publish-receipt', receipt);
      const status = string(value.status, 'V1 Receipt status');
      const result = value.public_result === undefined ? null : object(value.public_result, 'V1 public result');
      const observed = result === null ? null : this.observed({
        source: 'user_report', public_url: string(result.url, 'public URL'),
        platform_ids: stringArray(result.post_ids, 'post ids'),
        observed_digest: sha256(result), actual_item_order: stringArray(result.post_ids, 'post ids').map((_, index) => index + 1),
        media_verification: 'unverified', link_verification: 'unverified',
        missing_content: [], unexpected_content: [], mismatches: []
      });
      return {
        receipt_ref: receiptRef(input),
        bound_plan_digest: string(value.publication_digest, 'publication digest') as `sha256:${string}`,
        observed_content: observed,
        verification_level: status === 'manual_recorded' ? 'manual_recorded' : 'outcome_unknown',
        platform_refs: observed === null ? [] : [observed.public_url, ...observed.platform_ids],
        published_at: result === null ? null : string(result.published_at, 'published at'),
        privacy_classification: input.privacy_classification
      };
    }
    if (input.kind === 'x_v2' || input.kind === 'x_v2_1') {
      const contract = input.kind === 'x_v2' ? 'publish-receipt-v2' : 'publish-receipt-v2-1';
      const value = validateContract<JsonObject>(contract, receipt);
      const result = value.public_result === null ? null : object(value.public_result, 'X public result');
      const verification = object(value.verification, 'X verification');
      const missing = result === null ? [] : ordinalArray(result.missing_ordinals, 'missing ordinals').map(String);
      const unexpected = result === null ? [] : stringArray(result.unexpected_post_ids, 'unexpected post ids');
      const mismatches = [
        verification.account_match === false ? 'account' : null,
        verification.content_match === false ? 'content' : null,
        verification.order_match === false ? 'order' : null,
        verification.reply_chain_match === false ? 'reply_chain' : null,
        verification.links_match === false ? 'links' : null
      ].filter((item): item is string => item !== null);
      const status = string(value.status, 'X Receipt status');
      const conflict = status === 'verification_conflict' || status === 'partial' ||
        missing.length > 0 || unexpected.length > 0 || mismatches.length > 0;
      const verified = status === 'finalized' && verification.strength === 'public_browser_verified' && !conflict;
      const posts = result === null ? [] : result.posts;
      const observed = result === null ? null : this.observed({
        source: verification.source === 'user_report' ? 'user_report' : 'public_page',
        public_url: string(result.root_url, 'root URL'),
        platform_ids: stringArray(result.ordered_post_ids, 'ordered post ids'),
        observed_digest: sha256(posts),
        actual_item_order: Array.isArray(posts) ? posts.map((post) => Number(object(post, 'verified post').ordinal)) : [],
        media_verification: this.mediaVerification(value, input.kind),
        link_verification: verification.links_match === true ? 'matched' : 'mismatch',
        missing_content: missing, unexpected_content: unexpected, mismatches
      });
      const bound = input.kind === 'x_v2_1'
        ? string(value.plan_digest, 'V2.1 plan digest')
        : string(object(value.approval, 'approval').plan_digest, 'V2 plan digest');
      return {
        receipt_ref: receiptRef(input), bound_plan_digest: bound as `sha256:${string}`,
        observed_content: observed,
        verification_level: conflict ? 'conflict' : verified ? 'public_verified' : 'outcome_unknown',
        platform_refs: observed === null ? [] : [observed.public_url, ...observed.platform_ids],
        published_at: result === null ? null : string(result.published_at, 'published at'),
        privacy_classification: input.privacy_classification
      };
    }
    const value = validateContract<JsonObject>('x-article-publish-receipt', receipt);
    const publicEvidence = object(value.public_evidence, 'X Article public evidence');
    const kind = string(publicEvidence.kind, 'X Article verification kind');
    const mismatches = [
      publicEvidence.author_match === false ? 'author' : null,
      publicEvidence.content_match === false ? 'content' : null,
      publicEvidence.links_match === false ? 'links' : null,
      publicEvidence.media_match === false ? 'media' : null
    ].filter((item): item is string => item !== null);
    const observed = this.observed({
      source: 'public_page', public_url: string(publicEvidence.canonical_url, 'X Article URL'),
      platform_ids: [string(publicEvidence.article_id, 'X Article id')], observed_digest: sha256(publicEvidence),
      actual_item_order: [1],
      media_verification: publicEvidence.media_match === true ? 'matched' : publicEvidence.media_match === false ? 'mismatch' : 'unverified',
      link_verification: publicEvidence.links_match === true ? 'matched' : 'mismatch',
      missing_content: [], unexpected_content: mismatches, mismatches
    });
    return {
      receipt_ref: receiptRef(input),
      bound_plan_digest: string(value.plan_digest, 'X Article plan digest') as `sha256:${string}`,
      observed_content: observed,
      verification_level: kind === 'conflict' ? 'conflict' : kind === 'full_match' ? 'public_verified' : 'outcome_unknown',
      platform_refs: [observed.public_url, ...observed.platform_ids],
      published_at: string(value.issued_at, 'X Article published at'),
      privacy_classification: input.privacy_classification
    };
  }

  private async readVerifiedJson(
    path: string,
    expectedDigest: `sha256:${string}`,
    label: string
  ): Promise<JsonObject> {
    const first = await this.store.readContainedArtifact(path);
    if (first.digest !== expectedDigest) throw new HarnessError('APPROVAL_STALE', `${label} digest is stale`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(first.content.toString('utf8'));
    } catch {
      throw new HarnessError('CONTRACT_INVALID', `${label} is not valid JSON`);
    }
    const second = await this.store.readContainedArtifact(path);
    if (second.digest !== expectedDigest || second.digest !== first.digest) {
      throw new HarnessError('APPROVAL_STALE', `${label} changed while it was read`);
    }
    return object(parsed, label);
  }

  private async readVerifiedBytes(path: string, expectedDigest: `sha256:${string}`, label: string): Promise<Buffer> {
    const artifact = await this.store.readContainedArtifact(path);
    if (artifact.digest !== expectedDigest || sha256Bytes(artifact.content) !== expectedDigest) {
      throw new HarnessError('APPROVAL_STALE', `${label} digest is stale`);
    }
    return artifact.content;
  }

  private readExplicitObservation(
    input: PublicationReceiptBinding,
    receipt: JsonObject
  ): PublicationObservedEvidenceV1 {
    if (receipt.schema_version !== 'publication-observation/v1') {
      throw new HarnessError('CONTRACT_INVALID', 'explicit publication observation schema is unsupported');
    }
    const status = string(receipt.status, 'explicit observation status');
    if (!['manual_recorded', 'public_verified', 'outcome_unknown', 'conflict'].includes(status)) {
      throw new HarnessError('CONTRACT_INVALID', 'explicit observation status is unsupported');
    }
    const observed = this.observed({
      source: receipt.source === 'public_page' ? 'public_page' : 'user_report',
      public_url: string(receipt.public_url, 'public URL'),
      platform_ids: stringArray(receipt.platform_ids, 'platform ids'),
      observed_digest: string(receipt.observed_digest, 'observed digest') as `sha256:${string}`,
      actual_item_order: ordinalArray(receipt.actual_item_order, 'actual item order'),
      media_verification: receipt.media_verification as PublicationObservedContentV1['media_verification'],
      link_verification: receipt.link_verification as PublicationObservedContentV1['link_verification'],
      missing_content: stringArray(receipt.missing_content, 'missing content'),
      unexpected_content: stringArray(receipt.unexpected_content, 'unexpected content'),
      mismatches: stringArray(receipt.mismatches, 'mismatches')
    });
    return {
      receipt_ref: receiptRef(input), bound_plan_digest: null, observed_content: observed,
      verification_level: status as PublicationObservedEvidenceV1['verification_level'],
      platform_refs: [observed.public_url, ...observed.platform_ids],
      published_at: string(receipt.published_at, 'published at'),
      privacy_classification: input.privacy_classification
    };
  }

  private observed(value: PublicationObservedContentV1): PublicationObservedContentV1 {
    return value;
  }

  private mediaVerification(value: JsonObject, kind: 'x_v2' | 'x_v2_1'):
    PublicationObservedContentV1['media_verification'] {
    if (kind === 'x_v2') return 'unverified';
    if (value.media_evidence === null) return 'matched';
    const media = object(value.media_evidence, 'media evidence');
    return media.public_media_verified === true && media.alt_text_verified === true ? 'matched'
      : media.public_media_verified === false ? 'mismatch' : 'unverified';
  }
}

