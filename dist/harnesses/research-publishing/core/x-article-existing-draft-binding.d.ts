import type { XArticleBrowserObservation } from '../adapters/x/article-browser/article-browser-protocol.js';
import { type XArticlePublicationPlanV1 } from './x-article-publication-plan.js';
export interface XArticleExistingDraftBindingV1 {
    readonly schema_version: 'x-article-existing-draft-binding/v1';
    readonly mode: 'adopt_existing';
    readonly draft_id: string;
    readonly expected_account: string;
    readonly expected_editor_revision: `sha256:${string}`;
    readonly expected_title_digest: `sha256:${string}`;
    readonly expected_document_digest: `sha256:${string}`;
    readonly expected_import_template_digest: `sha256:${string}`;
    readonly expected_anchor_manifest_digest: `sha256:${string}`;
    readonly expected_cover_count: 0;
    readonly expected_inline_media_count: 0;
    readonly source_observation_digest: `sha256:${string}`;
    readonly observed_at: string;
    readonly binding_digest: `sha256:${string}`;
}
export interface CreateXArticleExistingDraftBindingInput {
    readonly publication_plan: XArticlePublicationPlanV1;
    readonly observation: XArticleBrowserObservation;
}
export declare function computeXArticleExistingDraftRevision(observation: XArticleBrowserObservation): `sha256:${string}`;
export declare function createXArticleExistingDraftBinding(input: CreateXArticleExistingDraftBindingInput): XArticleExistingDraftBindingV1;
export declare function verifyXArticleExistingDraftBinding(binding: XArticleExistingDraftBindingV1, publicationPlan: XArticlePublicationPlanV1, observation: XArticleBrowserObservation): XArticleExistingDraftBindingV1;
