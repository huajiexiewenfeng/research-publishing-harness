import { type XArticleEditorImportStateV1, type XArticleEditorObservation } from '../harnesses/research-publishing/adapters/x/article-browser/article-browser-protocol.js';
import { type XArticleImportTemplateV1 } from '../harnesses/research-publishing/adapters/x/article-browser/article-import-template.js';
import type { VisualAssetRef } from '../harnesses/research-publishing/core/types.js';
import { type XArticleStageProgressV1 } from '../harnesses/research-publishing/core/x-article-materialization.js';
export interface HostWaitInput {
    readonly timeout_ms: number;
    readonly progress_every_ms: 20_000;
}
export interface FakeXArticleHost {
    focusBody(targetRef: string): Promise<void>;
    pasteStructuredTemplate(template: XArticleImportTemplateV1): Promise<void>;
    locateUniqueAnchor(anchorId: string): Promise<void>;
    uploadVerifiedAsset(asset: VisualAssetRef): Promise<void>;
    moveMediaToAnchorOrdinal(blockOrdinal: number): Promise<void>;
    setAndVerifyInlineAlt(altText: string): Promise<void>;
    removeAnchor(anchorId: string): Promise<void>;
    waitForEditorStable(input: HostWaitInput): Promise<void>;
    waitForMediaReady(input: HostWaitInput): Promise<void>;
    waitForAutosave(input: HostWaitInput): Promise<void>;
    readImportProjection(): Promise<XArticleEditorImportStateV1>;
    readEditorProjection(): Promise<XArticleEditorObservation>;
}
export type XArticleHostAcceptanceFault = 'non_empty_body' | 'unknown_content' | 'wrong_template_digest' | 'reordered_anchors' | 'duplicate_anchor' | 'missing_anchor' | 'second_import' | 'wrong_asset' | 'wrong_ordinal' | 'wrong_alt' | 'ambiguous_grouping' | 'wrong_progress_stage' | 'snapshot_body_tamper' | 'snapshot_template_tamper' | 'snapshot_visual_tamper' | 'snapshot_counter_tamper' | 'snapshot_completed_command_tamper' | 'snapshot_schema_tamper' | 'snapshot_clock_tamper' | 'persisted_report_digest_tamper' | 'persisted_evidence_digest_tamper' | 'persisted_reported_at_tamper' | 'persisted_report_command_tamper' | 'persisted_observation_tamper' | 'persisted_command_tamper' | 'persisted_claim_tamper';
export interface XArticleHostAcceptanceInput {
    readonly body_blocks: number;
    readonly inline_images: number;
    readonly fault?: XArticleHostAcceptanceFault;
    readonly restart_after_effect?: 'import' | 'first_image';
}
interface HostWaitRecord extends HostWaitInput {
    readonly waiting_for: 'editor_stability' | 'media_readiness' | 'autosave';
}
interface HostCommandTimelineEntry {
    readonly command_id: string;
    readonly purpose: string;
    readonly issued_at: string;
    readonly claimed_at: string;
    readonly observation_at: string;
    readonly reported_at: string;
}
export interface XArticleHostAcceptanceResult {
    readonly host_transactions: readonly string[];
    readonly paragraph_level_transactions: number;
    readonly progress_events: readonly XArticleStageProgressV1[];
    readonly waits: readonly HostWaitRecord[];
    readonly grouped_image_corrections: number;
    readonly observation_count: number;
    readonly claim_count: number;
    readonly body_import_effects: number;
    readonly image_upload_effects: readonly string[];
    readonly expected_image_ordinals: readonly number[];
    readonly expected_image_alts: readonly string[];
    readonly normalized_post_state: XArticleEditorObservation;
    readonly restart_count: number;
    readonly recovered_command_ids: readonly string[];
    readonly recovered_claim_created: readonly boolean[];
    readonly claim_identity_unchanged: boolean;
    readonly command_digest_unchanged: boolean;
    readonly report_count: number;
    readonly human_content_overwrite_count: number;
    readonly command_timeline: readonly HostCommandTimelineEntry[];
    readonly wall_clock_sleeps: 0;
    readonly network: 'unused';
}
export declare function runXArticleHostAcceptance(input: XArticleHostAcceptanceInput): Promise<XArticleHostAcceptanceResult>;
export {};
