import { HarnessError } from './errors.js';
export function evaluateXArticleFastPathDeadline(input) {
    const startedAt = Date.parse(input.started_at);
    const now = Date.parse(input.now);
    if (!Number.isFinite(startedAt)
        || !Number.isFinite(now)
        || now < startedAt
        || !Number.isFinite(input.time_budget_seconds)
        || input.time_budget_seconds <= 0) {
        throw new HarnessError('CONTRACT_INVALID', 'X Article Fast Path deadline timestamp or time budget is invalid');
    }
    const elapsedSeconds = (now - startedAt) / 1000;
    return {
        elapsed_seconds: elapsedSeconds,
        exceeded: elapsedSeconds >= input.time_budget_seconds
    };
}
//# sourceMappingURL=x-article-fast-path-deadline.js.map