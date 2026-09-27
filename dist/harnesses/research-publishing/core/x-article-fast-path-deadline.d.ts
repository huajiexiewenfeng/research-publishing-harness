export interface EvaluateXArticleFastPathDeadlineInput {
    readonly started_at: string;
    readonly time_budget_seconds: number;
    readonly now: string;
}
export interface XArticleFastPathDeadlineEvaluation {
    readonly elapsed_seconds: number;
    readonly exceeded: boolean;
}
export declare function evaluateXArticleFastPathDeadline(input: EvaluateXArticleFastPathDeadlineInput): XArticleFastPathDeadlineEvaluation;
