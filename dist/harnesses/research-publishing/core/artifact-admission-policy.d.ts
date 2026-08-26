import type { PrivacyClassification } from './research-memory-types.js';
export declare function privacyRank(value: PrivacyClassification): number;
export declare function assertArtifactAdmissible(input: {
    readonly workspace_relative_path: string;
    readonly media_type: string;
    readonly privacy_classification: PrivacyClassification;
    readonly bytes: Uint8Array;
    readonly allow_restricted: boolean;
}): void;
