import type { BrowserActionResult } from './browser-protocol.js';
import type { PublicVerificationResult } from './public-verifier.js';
export declare const verificationDelaysMs: readonly [0, 3000, 10000, 30000, 90000];
export type OutcomeDecision = {
    readonly kind: 'verify_again';
    readonly next_delay_ms: number;
} | {
    readonly kind: 'finalized';
    readonly verification: Extract<PublicVerificationResult, {
        readonly kind: 'full_match';
    }>;
} | {
    readonly kind: 'partial';
    readonly verification: Extract<PublicVerificationResult, {
        readonly kind: 'partial';
    }>;
} | {
    readonly kind: 'published_unverified';
    readonly reason: string;
} | {
    readonly kind: 'outcome_unknown';
    readonly reason: string;
} | {
    readonly kind: 'failed_after_submit';
    readonly rejection_code: string;
} | {
    readonly kind: 'verification_conflict';
    readonly reason: string;
};
export interface OutcomeInput {
    readonly attempt_id: string;
    readonly verification_index: number;
    readonly submit_result: BrowserActionResult;
    readonly public_verification: PublicVerificationResult;
    readonly positive_publish_signal: boolean;
    readonly platform_rejection: {
        readonly attempt_id: string;
        readonly code: string;
    } | null;
}
export interface OutcomeResolver {
    classify(input: OutcomeInput): OutcomeDecision;
}
export declare class DeterministicOutcomeResolver implements OutcomeResolver {
    classify(input: OutcomeInput): OutcomeDecision;
}
