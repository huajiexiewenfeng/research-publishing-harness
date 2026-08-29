import type { ClaimStatus } from './types.js';
export declare function canExpressClaimAs(source: ClaimStatus, target: ClaimStatus): boolean;
export declare function claimLanguageMatchesBoundary(status: ClaimStatus, text: string): boolean;
