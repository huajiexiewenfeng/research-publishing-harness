import type { XArticleBlockV1 } from '../../../branches/x-article-harness/article-document.js';
import type { VisualAssetRef } from '../../../core/types.js';
import type { WorkspaceStore } from '../../../core/workspace-store.js';
import type { XArticleImportTemplateV1, XArticleVisualAnchorV1 } from './article-import-template.js';
export type XArticleBrowserCommandKind = 'observe_article_page' | 'navigate' | 'create_article_draft' | 'set_article_title' | 'upload_article_cover' | 'import_article_document' | 'insert_article_block' | 'insert_article_image' | 'replace_article_visual_anchor' | 'set_article_image_alt' | 'open_article_preview' | 'open_publish_review' | 'publish_article_once';
export type XArticleBrowserCommandPayload = {
    readonly kind: 'observe_article_page';
    readonly scope: 'index' | 'editor' | 'preview' | 'public_article';
} | {
    readonly kind: 'navigate';
    readonly url: string;
} | {
    readonly kind: 'create_article_draft';
    readonly target_ref: string;
} | {
    readonly kind: 'set_article_title';
    readonly target_ref: string;
    readonly title: string;
} | {
    readonly kind: 'upload_article_cover';
    readonly package_root: string;
    readonly package_digest: string;
    readonly asset: VisualAssetRef;
} | {
    readonly kind: 'import_article_document';
    readonly target_ref: string;
    readonly package_root: string;
    readonly package_digest: string;
    readonly template: XArticleImportTemplateV1;
} | {
    readonly kind: 'insert_article_block';
    readonly target_ref: string;
    readonly block_ordinal: number;
    readonly block: XArticleBlockV1;
} | {
    readonly kind: 'insert_article_image';
    readonly target_ref: string;
    readonly block_ordinal: number;
    readonly package_root: string;
    readonly package_digest: string;
    readonly asset: VisualAssetRef;
} | {
    readonly kind: 'replace_article_visual_anchor';
    readonly target_ref: string;
    readonly anchor: XArticleVisualAnchorV1;
    readonly package_root: string;
    readonly package_digest: string;
    readonly asset: VisualAssetRef;
} | {
    readonly kind: 'set_article_image_alt';
    readonly visual_ref: string;
    readonly alt_text: string;
} | {
    readonly kind: 'open_article_preview';
    readonly target_ref: string;
} | {
    readonly kind: 'open_publish_review';
    readonly target_ref: string;
} | {
    readonly kind: 'publish_article_once';
    readonly target_ref: string;
};
interface XArticleBrowserCommandInputBase {
    readonly execution_id: string;
    readonly run_id: string;
    readonly draft_id: string | null;
    readonly purpose: string;
    readonly expected_page_revision: string | null;
    readonly allowed_origin: 'https://x.com';
}
type ImportArticleDocumentPayload = Extract<XArticleBrowserCommandPayload, {
    readonly kind: 'import_article_document';
}>;
type ReplaceArticleVisualAnchorPayload = Extract<XArticleBrowserCommandPayload, {
    readonly kind: 'replace_article_visual_anchor';
}>;
type LegacyXArticleBrowserCommandPayload = Exclude<XArticleBrowserCommandPayload, ImportArticleDocumentPayload | ReplaceArticleVisualAnchorPayload>;
export type IssueXArticleBrowserCommandInput = XArticleBrowserCommandInputBase & ({
    readonly kind: 'import_article_document';
    readonly side_effect: 'write';
    readonly payload: ImportArticleDocumentPayload;
} | {
    readonly kind: 'replace_article_visual_anchor';
    readonly side_effect: 'write';
    readonly payload: ReplaceArticleVisualAnchorPayload;
} | {
    readonly kind: LegacyXArticleBrowserCommandPayload['kind'];
    readonly side_effect: 'read' | 'write' | 'submit';
    readonly payload: LegacyXArticleBrowserCommandPayload;
});
export type XArticleBrowserCommandV1 = IssueXArticleBrowserCommandInput & {
    readonly schema_version: '1.0';
    readonly command_id: string;
    readonly payload_digest: string;
    readonly issued_at: string;
};
export interface XArticleCommandClaimV1 {
    readonly schema_version: '1.0';
    readonly execution_id: string;
    readonly command_id: string;
    readonly claimed: true;
    readonly claimed_at: string;
}
export interface XArticleCommandClaimResult {
    readonly claim: XArticleCommandClaimV1;
    readonly created: boolean;
}
interface XArticleCommandBrokerOptions {
    readonly commandId?: () => string;
    readonly now?: () => Date;
}
export declare class XArticleCommandBroker {
    private readonly store;
    private readonly commandId;
    private readonly now;
    constructor(store: WorkspaceStore, options?: XArticleCommandBrokerOptions);
    issue(input: IssueXArticleBrowserCommandInput, commandIdOverride?: string): Promise<XArticleBrowserCommandV1>;
    claim(command: XArticleBrowserCommandV1): Promise<XArticleCommandClaimV1>;
    claimOrRead(command: XArticleBrowserCommandV1): Promise<XArticleCommandClaimResult>;
    readExistingClaim(command: XArticleBrowserCommandV1): Promise<XArticleCommandClaimV1>;
    private assertStoredCommand;
    private commandPath;
    private claimPath;
    private assertId;
}
export {};
