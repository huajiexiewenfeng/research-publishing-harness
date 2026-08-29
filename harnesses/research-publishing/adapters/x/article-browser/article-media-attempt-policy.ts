import type { XArticleStageProgressV1 } from '../../../core/x-article-materialization.js';

export type XArticleMediaAttemptDecision =
  | { readonly kind: 'allow'; readonly attempt: 1 | 2 }
  | {
      readonly kind: 'block';
      readonly reason: 'effect_unknown' | 'attempt_limit' | 'already_complete';
    };

export interface DecideXArticleMediaAttemptInput {
  readonly progress: readonly XArticleStageProgressV1[];
  readonly asset_id: string;
  readonly purpose: string;
}

export function decideXArticleMediaAttempt(
  input: DecideXArticleMediaAttemptInput
): XArticleMediaAttemptDecision {
  const events = input.progress.filter((event) =>
    event.asset_id === input.asset_id
    && event.stage.split('#', 1)[0] === input.purpose
  );
  if (events.some((event) =>
    event.observed_effect === 'unknown' || event.observed_effect === 'partial'
  )) {
    return { kind: 'block', reason: 'effect_unknown' };
  }
  if (events.some((event) => event.observed_effect === 'complete')) {
    return { kind: 'block', reason: 'already_complete' };
  }
  if (events.length >= 2) return { kind: 'block', reason: 'attempt_limit' };
  return { kind: 'allow', attempt: events.length === 0 ? 1 : 2 };
}
