import twitterText from 'twitter-text';

import {
  normalizePublicationText,
  type PublicationPlanV2
} from '../../../core/publication-plan-v2.js';
import type { PublicationPlanV2_1 } from '../../../core/publication-plan-v2-1.js';
import type { BrowserPublicPostObservation } from './browser-protocol.js';

export interface PublicMediaEvidence {
  readonly verified: boolean;
  readonly alt_text_verified: boolean | null;
  readonly public_media_url: string | null;
  readonly limitations: readonly string[];
}

export type PublicVerificationResult =
  | { readonly kind: 'full_match'; readonly root_url: string; readonly posts: readonly VerifiedPost[]; readonly media_evidence?: PublicMediaEvidence }
  | {
      readonly kind: 'partial';
      readonly matched_ordinals: readonly number[];
      readonly missing_ordinals: readonly number[];
      readonly posts: readonly VerifiedPost[];
    }
  | { readonly kind: 'no_match'; readonly reason: string }
  | { readonly kind: 'conflict'; readonly reason: string; readonly unexpected_post_ids: readonly string[] };

export interface VerifiedPost {
  readonly ordinal: number;
  readonly post_id: string;
  readonly canonical_url: string;
  readonly observed_digest: string;
  readonly reply_to_id: string | null;
}

interface ExtractedUrl {
  readonly url: string;
  readonly indices: readonly [number, number];
}

export function verifyPublicThread(
  plan: PublicationPlanV2 | PublicationPlanV2_1,
  observed: readonly BrowserPublicPostObservation[]
): PublicVerificationResult {
  const ids = observed.map((post) => post.post_id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    return conflict('duplicate public Post IDs', duplicateIds);
  }
  const wrongAuthors = observed.filter(
    (post) => post.author_handle.toLowerCase() !== plan.intent.target_account.toLowerCase()
  );
  if (wrongAuthors.length > 0) {
    return conflict('public Post author does not match approved account', wrongAuthors.map((post) => post.post_id));
  }

  const selected: BrowserPublicPostObservation[] = [];
  const verified: VerifiedPost[] = [];
  let expectedParent = plan.intent.mode === 'reply' ? plan.intent.target_post?.id ?? null : null;
  for (const item of plan.items) {
    const children = observed.filter((post) => post.reply_to_id === expectedParent && !selected.includes(post));
    const matches = children.filter((post) => postMatches(item.text, post));
    if (matches.length > 1) {
      return conflict('multiple public Posts match one planned ordinal', matches.map((post) => post.post_id));
    }
    if (matches.length === 0) {
      if (children.length > 0) {
        return conflict('public Post text, punctuation, whitespace, or links differ from the plan', children.map((post) => post.post_id));
      }
      if (verified.length === 0) return { kind: 'no_match', reason: 'no matching root Post found' };
      return {
        kind: 'partial',
        matched_ordinals: verified.map((post) => post.ordinal),
        missing_ordinals: plan.items.slice(verified.length).map((missing) => missing.ordinal),
        posts: verified
      };
    }
    const match = matches[0]!;
    selected.push(match);
    verified.push({
      ordinal: item.ordinal,
      post_id: match.post_id,
      canonical_url: match.canonical_url,
      observed_digest: item.digest,
      reply_to_id: match.reply_to_id
    });
    expectedParent = match.post_id;
  }

  const unexpected = observed.filter((post) => !selected.includes(post)).map((post) => post.post_id);
  if (unexpected.length > 0) return conflict('unexpected Posts were observed beside the approved chain', unexpected);
  if (plan.schema_version === '2.1') {
    const expected = plan.items.flatMap((item) => item.attachments.map((asset) => ({ ordinal: item.ordinal, asset })))[0];
    if (expected !== undefined) {
      const mediaPosts = selected.flatMap((post, index) => (post.media ?? []).map((media) => ({ ordinal: index + 1, post, media })));
      const target = selected[expected.ordinal - 1]!;
      if (target.media === undefined) {
        return {
          kind: 'full_match', root_url: verified[0]!.canonical_url, posts: verified,
          media_evidence: { verified: false, alt_text_verified: null, public_media_url: null, limitations: ['public page did not expose media fields'] }
        };
      }
      if (mediaPosts.length !== 1 || mediaPosts[0]!.ordinal !== expected.ordinal || mediaPosts[0]!.media.kind !== 'image') {
        return conflict('public media count, type, or Post ordinal differs from the Plan', [target.post_id]);
      }
      const media = mediaPosts[0]!.media;
      if (media.alt_text === null) {
        return {
          kind: 'full_match', root_url: verified[0]!.canonical_url, posts: verified,
          media_evidence: { verified: false, alt_text_verified: null, public_media_url: media.url, limitations: ['public page did not expose Alt Text'] }
        };
      }
      if (media.alt_text !== expected.asset.alt_text) {
        return conflict('public media Alt Text differs from the Plan', [target.post_id]);
      }
      return {
        kind: 'full_match', root_url: verified[0]!.canonical_url, posts: verified,
        media_evidence: { verified: true, alt_text_verified: true, public_media_url: media.url, limitations: ['public media bytes may be transcoded and are not source-digest comparable'] }
      };
    }
  }
  return { kind: 'full_match', root_url: verified[0]!.canonical_url, posts: verified };
}

function postMatches(expectedText: string, observed: BrowserPublicPostObservation): boolean {
  const expected = normalizePublicationText(expectedText);
  const actual = normalizePublicationText(observed.text);
  const expectedUrls = twitterText.extractUrlsWithIndices(expected) as ExtractedUrl[];
  const actualUrls = twitterText.extractUrlsWithIndices(actual) as ExtractedUrl[];
  if (
    expectedUrls.length !== actualUrls.length ||
    expectedUrls.length !== observed.links.length
  ) {
    return false;
  }
  const expectedSegments = nonUrlSegments(expected, expectedUrls);
  const actualSegments = nonUrlSegments(actual, actualUrls);
  if (
    expectedSegments.length !== actualSegments.length ||
    expectedSegments.some((segment, index) => segment !== actualSegments[index])
  ) {
    return false;
  }
  return expectedUrls.every(
    (url, index) => normalizeUrl(url.url) === normalizeUrl(observed.links[index]!.expanded_url)
  );
}

function nonUrlSegments(text: string, urls: readonly ExtractedUrl[]): string[] {
  const segments: string[] = [];
  let cursor = 0;
  for (const url of urls) {
    segments.push(text.slice(cursor, url.indices[0]));
    cursor = url.indices[1];
  }
  segments.push(text.slice(cursor));
  return segments.map(normalizePublicationText);
}

function normalizeUrl(value: string): string {
  try {
    return new URL(value).toString();
  } catch {
    return value;
  }
}

function conflict(reason: string, unexpectedPostIds: readonly string[]): PublicVerificationResult {
  return {
    kind: 'conflict',
    reason,
    unexpected_post_ids: [...new Set(unexpectedPostIds)]
  };
}
