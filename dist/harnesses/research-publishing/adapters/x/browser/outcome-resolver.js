export const verificationDelaysMs = [0, 3_000, 10_000, 30_000, 90_000];
export class DeterministicOutcomeResolver {
    classify(input) {
        if (input.platform_rejection !== null &&
            input.platform_rejection.attempt_id === input.attempt_id) {
            return {
                kind: 'failed_after_submit',
                rejection_code: input.platform_rejection.code
            };
        }
        if (input.public_verification.kind === 'full_match') {
            if (input.public_verification.media_evidence?.verified === false) {
                return { kind: 'published_unverified', reason: input.public_verification.media_evidence.limitations.join('; ') };
            }
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
            return { kind: 'verify_again', next_delay_ms: verificationDelaysMs[nextIndex] };
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
//# sourceMappingURL=outcome-resolver.js.map