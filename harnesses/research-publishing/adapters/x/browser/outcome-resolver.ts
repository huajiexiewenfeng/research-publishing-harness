import type { BrowserActionResult } from './browser-protocol.js';
import type { PublicVerificationResult } from './public-verifier.js';

export const verificationDelaysMs = [0, 3_000, 10_000, 30_000, 90_000] as const;

export type OutcomeDecision =
  | { readonly kind: 'verify_again'; readonly next_delay_ms: number }
  | {
      readonly kind: 'finalized';
      readonly verification: Extract<PublicVerificationResult, { readonly kind: 'full_match' }>;
    }
  | {
      readonly kind: 'partial';
      readonly verification: Extract<PublicVerificationResult, { readonly kind: 'partial' }>;
    }
  | { readonly kind: 'published_unverified'; readonly reason: string }
  | { readonly kind: 'outcome_unknown'; readonly reason: string }
  | { readonly kind: 'failed_after_submit'; readonly rejection_code: string }
  | { readonly kind: 'verification_conflict'; readonly reason: string };

export interface OutcomeInput {
  readonly attempt_id: string;
  readonly verification_index: number;
  readonly submit_result: BrowserActionResult;
  readonly public_verification: PublicVerificationResult;
  readonly positive_publish_signal: boolean;
  readonly platform_rejection: { readonly attempt_id: string; readonly code: string } | null;
}

export interface OutcomeResolver {
  classify(input: OutcomeInput): OutcomeDecision;
}

export class DeterministicOutcomeResolver implements OutcomeResolver {
  classify(input: OutcomeInput): OutcomeDecision {
    if (
      input.platform_rejection !== null &&
      input.platform_rejection.attempt_id === input.attempt_id
    ) {
      return {
        kind: 'failed_after_submit',
        rejection_code: input.platform_rejection.code
      };
    }
    if (input.public_verification.kind === 'full_match') {
      return { kind: 'finalized', verification: input.public_verification };
    }
    if (input.public_verification.kind === 'partial') {
      return { kind: 'partial', verification: input.public_verification };
    }
    if (input.public_verification.kind === 'conflict') {
      return {
        kind: 'verification_conflict',
        reason: input.public_verification.reason
      };
    }
    const nextIndex = input.verification_index + 1;
    if (nextIndex < verificationDelaysMs.length) {
      return { kind: 'verify_again', next_delay_ms: verificationDelaysMs[nextIndex]! };
    }
    if (input.positive_publish_signal) {
      return {
        kind: 'published_unverified',
        reason: 'positive submit signal exists without complete public evidence'
      };
    }
    return {
      kind: 'outcome_unknown',
      reason: 'bounded public verification completed without a positive or negative result'
    };
  }
}
