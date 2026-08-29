import { HarnessError } from './errors.js';

export interface EvaluateXArticleFastPathDeadlineInput {
  readonly started_at: string;
  readonly time_budget_seconds: number;
  readonly now: string;
}

export interface XArticleFastPathDeadlineEvaluation {
  readonly elapsed_seconds: number;
  readonly exceeded: boolean;
}

export function evaluateXArticleFastPathDeadline(
  input: EvaluateXArticleFastPathDeadlineInput
): XArticleFastPathDeadlineEvaluation {
  const startedAt = Date.parse(input.started_at);
  const now = Date.parse(input.now);
  if (
    !Number.isFinite(startedAt)
    || !Number.isFinite(now)
    || now < startedAt
    || !Number.isFinite(input.time_budget_seconds)
    || input.time_budget_seconds <= 0
  ) {
    throw new HarnessError(
      'CONTRACT_INVALID',
      'X Article Fast Path deadline timestamp or time budget is invalid'
    );
  }
  const elapsedSeconds = (now - startedAt) / 1000;
  return {
    elapsed_seconds: elapsedSeconds,
    exceeded: elapsedSeconds >= input.time_budget_seconds
  };
}
