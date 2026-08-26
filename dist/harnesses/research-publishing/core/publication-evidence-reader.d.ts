import type { PrivacyClassification, PublicationChannel, PublicationIntendedContentV1, PublicationObservedContentV1 } from './research-memory-types.js';
import type { WorkspaceStore } from './workspace-store.js';
export type PublicationIntentArtifactKind = 'explicit' | 'article_package' | 'x_v2' | 'x_v2_1' | 'x_article';
export type PublicationReceiptArtifactKind = 'explicit' | 'x_v1' | 'x_v2' | 'x_v2_1' | 'x_article';
export interface PublicationIntentBinding {
    readonly kind: PublicationIntentArtifactKind;
    readonly path: string;
    readonly digest: `sha256:${string}`;
    readonly content_path: string;
    readonly content_digest: `sha256:${string}`;
    readonly privacy_classification: PrivacyClassification;
}
export interface PublicationReceiptBinding {
    readonly kind: PublicationReceiptArtifactKind;
    readonly path: string;
    readonly digest: `sha256:${string}`;
    readonly privacy_classification: PrivacyClassification;
}
export interface PublicationIntentEvidenceV1 extends PublicationIntendedContentV1 {
    readonly channel: PublicationChannel;
    readonly privacy_classification: PrivacyClassification;
}
export interface PublicationObservedEvidenceV1 {
    readonly receipt_ref: string;
    readonly bound_plan_digest: `sha256:${string}` | null;
    readonly observed_content: PublicationObservedContentV1 | null;
    readonly verification_level: 'manual_recorded' | 'public_verified' | 'outcome_unknown' | 'conflict';
    readonly platform_refs: readonly string[];
    readonly published_at: string | null;
    readonly privacy_classification: PrivacyClassification;
}
export interface PublicationEvidenceReader {
    readIntent(input: PublicationIntentBinding): Promise<PublicationIntentEvidenceV1>;
    readObservation(input: PublicationReceiptBinding): Promise<PublicationObservedEvidenceV1>;
}
export declare class VersionedPublicationEvidenceReader implements PublicationEvidenceReader {
    private readonly store;
    constructor(store: WorkspaceStore);
    readIntent(input: PublicationIntentBinding): Promise<PublicationIntentEvidenceV1>;
    readObservation(input: PublicationReceiptBinding): Promise<PublicationObservedEvidenceV1>;
    private readVerifiedJson;
    private readVerifiedBytes;
    private readExplicitObservation;
    private observed;
    private mediaVerification;
}
