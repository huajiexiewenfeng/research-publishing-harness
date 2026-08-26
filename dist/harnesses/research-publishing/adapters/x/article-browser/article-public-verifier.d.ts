import type { XArticlePublicationPlanV1 } from '../../../core/x-article-publication-plan.js';
import type { XArticlePublicObservation } from './article-browser-protocol.js';
interface XArticlePublicVerificationBase {
    readonly article_id: string;
    readonly canonical_url: string;
    readonly author_match: boolean;
    readonly content_match: boolean;
    readonly links_match: boolean;
    readonly media_match: boolean | null;
    readonly verified_at: string;
}
export type XArticlePublicVerification = (XArticlePublicVerificationBase & {
    readonly kind: 'full_match';
}) | (XArticlePublicVerificationBase & {
    readonly kind: 'media_unverified';
}) | (XArticlePublicVerificationBase & {
    readonly kind: 'conflict';
});
export declare function verifyPublicXArticle(plan: XArticlePublicationPlanV1, article: XArticlePublicObservation, now?: Date): XArticlePublicVerification;
export {};
