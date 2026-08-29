import type { ArtifactRefV2, ArtifactRefV2Input, ClaimVersionInput, ClaimVersionV1, PublicationExpressionV1, ReviewDeltaInput, ResearchIncrementRevisionInput, ResearchIncrementRevisionV1, SemanticMemoryDeltaInput, SemanticMemoryDeltaV1, SemanticPromotionReviewV1 } from './research-memory-types.js';
export declare const STABLE_ID_PATTERN: RegExp;
export declare function createArtifactRefV2(input: ArtifactRefV2Input): ArtifactRefV2;
export declare function createResearchIncrementRevision(input: ResearchIncrementRevisionInput): ResearchIncrementRevisionV1;
export declare function createClaimVersion(input: ClaimVersionInput): ClaimVersionV1;
export declare function createPublicationExpression(input: Omit<PublicationExpressionV1, 'schema_version' | 'expression_digest'>): PublicationExpressionV1;
export declare function createSemanticMemoryDelta(input: SemanticMemoryDeltaInput): SemanticMemoryDeltaV1;
export declare function createSemanticPromotionReview(delta: SemanticMemoryDeltaV1, input: ReviewDeltaInput): SemanticPromotionReviewV1;
