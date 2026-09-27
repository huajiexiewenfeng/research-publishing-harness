export function decideXArticleMediaAttempt(input) {
    const events = input.progress.filter((event) => event.asset_id === input.asset_id
        && event.stage.split('#', 1)[0] === input.purpose);
    if (events.some((event) => event.observed_effect === 'unknown' || event.observed_effect === 'partial')) {
        return { kind: 'block', reason: 'effect_unknown' };
    }
    if (events.some((event) => event.observed_effect === 'complete')) {
        return { kind: 'block', reason: 'already_complete' };
    }
    if (events.length >= 2)
        return { kind: 'block', reason: 'attempt_limit' };
    return { kind: 'allow', attempt: events.length === 0 ? 1 : 2 };
}
//# sourceMappingURL=article-media-attempt-policy.js.map