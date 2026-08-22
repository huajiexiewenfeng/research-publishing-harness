import { type PublicationPlanV2 } from '../../../core/publication-plan-v2.js';
import type { PublicationPlanV2_1 } from '../../../core/publication-plan-v2-1.js';
import type { BrowserPublicPostObservation } from './browser-protocol.js';
export interface PublicMediaEvidence {
    readonly verified: boolean;
    readonly alt_text_verified: boolean | null;
    readonly public_media_url: string | null;
    readonly limitations: readonly string[];
}
export type PublicVerificationResult = {
    readonly kind: 'full_match';
    readonly root_url: string;
    readonly posts: readonly VerifiedPost[];
    readonly media_evidence?: PublicMediaEvidence;
} | {
    readonly kind: 'partial';
    readonly matched_ordinals: readonly number[];
    readonly missing_ordinals: readonly number[];
    readonly posts: readonly VerifiedPost[];
} | {
    readonly kind: 'no_match';
    readonly reason: string;
} | {
    readonly kind: 'conflict';
    readonly reason: string;
    readonly unexpected_post_ids: readonly string[];
};
export interface VerifiedPost {
    readonly ordinal: number;
    readonly post_id: string;
    readonly canonical_url: string;
    readonly observed_digest: string;
    readonly reply_to_id: string | null;
}
export declare function verifyPublicThread(plan: PublicationPlanV2 | PublicationPlanV2_1, observed: readonly BrowserPublicPostObservation[]): PublicVerificationResult;
