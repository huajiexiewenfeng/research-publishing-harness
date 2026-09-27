import type { XArticleStageProgressV1 } from '../../../core/x-article-materialization.js';
export type XArticleMediaAttemptDecision = {
    readonly kind: 'allow';
    readonly attempt: 1 | 2;
} | {
    readonly kind: 'block';
    readonly reason: 'effect_unknown' | 'attempt_limit' | 'already_complete';
};
export interface DecideXArticleMediaAttemptInput {
    readonly progress: readonly XArticleStageProgressV1[];
    readonly asset_id: string;
    readonly purpose: string;
}
export declare function decideXArticleMediaAttempt(input: DecideXArticleMediaAttemptInput): XArticleMediaAttemptDecision;
