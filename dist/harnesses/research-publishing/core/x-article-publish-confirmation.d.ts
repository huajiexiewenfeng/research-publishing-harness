export interface XArticlePublishConfirmationV1 {
    readonly schema_version: 'x-article-publish-confirmation/v1';
    readonly confirmation_id: string;
    readonly execution_id: string;
    readonly draft_id: string;
    readonly target_account: string;
    readonly audience: 'everyone';
    readonly scope: 'publish_article_once';
    readonly plan_digest: `sha256:${string}`;
    readonly document_digest: `sha256:${string}`;
    readonly preview_revision: `sha256:${string}`;
    readonly asset_digests: readonly `sha256:${string}`[];
    readonly confirmed_by: string;
    readonly confirmed_at: string;
    readonly confirmation_digest: `sha256:${string}`;
}
export type CreateXArticlePublishConfirmationInput = Omit<XArticlePublishConfirmationV1, 'schema_version' | 'scope' | 'confirmation_digest'>;
export interface XArticlePublishConfirmationBinding {
    readonly execution_id: string;
    readonly draft_id: string;
    readonly target_account: string;
    readonly audience: 'everyone';
    readonly plan_digest: `sha256:${string}`;
    readonly document_digest: `sha256:${string}`;
    readonly preview_revision: `sha256:${string}`;
    readonly asset_digests: readonly `sha256:${string}`[];
    readonly confirmed_at_not_before: string;
    readonly confirmed_at_not_after: string;
}
export declare function createXArticlePublishConfirmation(input: CreateXArticlePublishConfirmationInput): XArticlePublishConfirmationV1;
export declare function verifyXArticlePublishConfirmation(confirmation: XArticlePublishConfirmationV1, binding: XArticlePublishConfirmationBinding): XArticlePublishConfirmationV1;
