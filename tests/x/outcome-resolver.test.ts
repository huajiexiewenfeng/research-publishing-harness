import { describe, expect, it } from 'vitest';

import type { BrowserActionResult } from '../../harnesses/research-publishing/adapters/x/browser/browser-protocol.js';
import {
  DeterministicOutcomeResolver,
  verificationDelaysMs
} from '../../harnesses/research-publishing/adapters/x/browser/outcome-resolver.js';
import type { PublicVerificationResult } from '../../harnesses/research-publishing/adapters/x/browser/public-verifier.js';

const submitResult: BrowserActionResult = {
  schema_version: '2.0', execution_id: 'exec_1', command_id: 'cmd_submit', status: 'uncertain',
  resulting_page_revision: null, observation: null, error_code: null,
  reported_at: '2026-08-19T08:00:00.000Z'
};

const full: PublicVerificationResult = {
  kind: 'full_match', root_url: 'https://x.com/runtime_ai/status/701',
  posts: [{
    ordinal: 1, post_id: '701', canonical_url: 'https://x.com/runtime_ai/status/701',
    observed_digest: `sha256:${'a'.repeat(64)}`, reply_to_id: null
  }]
};

describe('DeterministicOutcomeResolver', () => {
  const resolver = new DeterministicOutcomeResolver();

  it('uses the exact bounded read-only schedule', () => {
    expect(verificationDelaysMs).toEqual([0, 3_000, 10_000, 30_000, 90_000]);
  });

  it('allows an uncertain Submit to finalize only after a full public match', () => {
    expect(resolver.classify({
      attempt_id: 'attempt_1', verification_index: 0, submit_result: submitResult,
      public_verification: full, positive_publish_signal: false, platform_rejection: null
    })).toMatchObject({ kind: 'finalized' });
  });

  it('classifies partial, unknown, unverified, conflict, and tied rejection exactly', () => {
    const partial: PublicVerificationResult = {
      kind: 'partial', matched_ordinals: [1], missing_ordinals: [2], posts: full.posts
    };
    expect(resolver.classify({
      attempt_id: 'attempt_1', verification_index: 1, submit_result: submitResult,
      public_verification: partial, positive_publish_signal: true, platform_rejection: null
    })).toMatchObject({ kind: 'partial' });

    const noMatch: PublicVerificationResult = { kind: 'no_match', reason: 'absent' };
    expect(resolver.classify({
      attempt_id: 'attempt_1', verification_index: 4,
      submit_result: { ...submitResult, status: 'success' }, public_verification: noMatch,
      positive_publish_signal: false, platform_rejection: null
    })).toMatchObject({ kind: 'outcome_unknown' });
    expect(resolver.classify({
      attempt_id: 'attempt_1', verification_index: 4,
      submit_result: { ...submitResult, status: 'success' }, public_verification: noMatch,
      positive_publish_signal: true, platform_rejection: null
    })).toMatchObject({ kind: 'published_unverified' });

    const conflict: PublicVerificationResult = {
      kind: 'conflict', reason: 'duplicate', unexpected_post_ids: ['701']
    };
    expect(resolver.classify({
      attempt_id: 'attempt_1', verification_index: 0, submit_result: submitResult,
      public_verification: conflict, positive_publish_signal: false, platform_rejection: null
    })).toMatchObject({ kind: 'verification_conflict' });

    expect(resolver.classify({
      attempt_id: 'attempt_1', verification_index: 0, submit_result: submitResult,
      public_verification: noMatch, positive_publish_signal: false,
      platform_rejection: { attempt_id: 'attempt_1', code: 'platform_rejected' }
    })).toEqual({ kind: 'failed_after_submit', rejection_code: 'platform_rejected' });
    expect(resolver.classify({
      attempt_id: 'attempt_1', verification_index: 4, submit_result: submitResult,
      public_verification: noMatch, positive_publish_signal: false,
      platform_rejection: { attempt_id: 'different_attempt', code: 'platform_rejected' }
    })).toMatchObject({ kind: 'outcome_unknown' });
  });

  it('never finalizes a success signal without public evidence', () => {
    expect(resolver.classify({
      attempt_id: 'attempt_1', verification_index: 0,
      submit_result: { ...submitResult, status: 'success' },
      public_verification: { kind: 'no_match', reason: 'timeline absence' },
      positive_publish_signal: true, platform_rejection: null
    })).toEqual({ kind: 'verify_again', next_delay_ms: 3000 });
  });
});
