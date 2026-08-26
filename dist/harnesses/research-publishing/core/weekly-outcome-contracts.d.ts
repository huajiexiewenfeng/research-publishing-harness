import type { CreateWeeklyOutcomeClosureInput, CreateWeeklyOutcomeStatusInput, CreateWeeklyPublicationOutcomeInput, WeeklyOutcomeClosureV1, WeeklyOutcomeStatusV1, WeeklyPublicationOutcomeV1 } from './weekly-outcome-types.js';
export declare function createWeeklyPublicationOutcome(input: CreateWeeklyPublicationOutcomeInput): WeeklyPublicationOutcomeV1;
export declare function assertWeeklyPublicationOutcome(outcome: WeeklyPublicationOutcomeV1): void;
export declare function outcomeReleaseReason(outcome: WeeklyPublicationOutcomeV1): string;
export declare function createWeeklyOutcomeClosure(input: CreateWeeklyOutcomeClosureInput): WeeklyOutcomeClosureV1;
export declare function assertWeeklyOutcomeClosure(closure: WeeklyOutcomeClosureV1): void;
export declare function createWeeklyOutcomeStatus(input: CreateWeeklyOutcomeStatusInput): WeeklyOutcomeStatusV1;
