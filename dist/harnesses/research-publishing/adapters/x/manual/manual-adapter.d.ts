import type { PublicationPlan } from '../../../branches/x-harness/x-service.js';
import { type Approval } from '../../../core/approval.js';
import type { WorkspaceStore } from '../../../core/workspace-store.js';
import { type PublicationPlanV2 } from '../../../core/publication-plan-v2.js';
import { type PublicationPlanV2_1 } from '../../../core/publication-plan-v2-1.js';
import { type BrowserObservation } from '../browser/browser-protocol.js';
export interface PublishReceipt {
    readonly schema_version: '1.0';
    readonly receipt_id: string;
    readonly run_id: string;
    readonly publication_digest: string;
    readonly adapter: 'manual';
    readonly status: 'handed_off' | 'manual_recorded' | 'failed';
    readonly verification_source: 'manual';
    readonly preview_path?: string;
    readonly public_result?: {
        readonly url: string;
        readonly post_ids: readonly string[];
        readonly published_at: string;
    };
    readonly error?: string;
    readonly created_at: string;
}
export interface ManualPublicResult {
    readonly url: string;
    readonly postIds: readonly string[];
    readonly publishedAt: string;
}
interface ManualAdapterOptions {
    readonly receiptId?: () => string;
    readonly now?: () => Date;
}
export declare class ManualAdapter {
    private readonly store;
    private readonly receiptId;
    private readonly now;
    constructor(store: WorkspaceStore, options?: ManualAdapterOptions);
    handoff(plan: PublicationPlan, approval: Approval): Promise<PublishReceipt>;
    recordObserved(plan: PublicationPlanV2 | PublicationPlanV2_1, observation: BrowserObservation): Promise<{
        readonly schema_version: "manual-observed/v1";
        readonly receipt_id: string;
        readonly run_id: string;
        readonly publication_actor: "human";
        readonly verification_source: "browser_observation";
        readonly status: "manual_media_unverified" | "manual_verified";
        readonly plan_digest: string;
        readonly root_url: string;
        readonly post_ids: string[];
        readonly quote_post_id: string | null;
        readonly evidence_digest: `sha256:${string}`;
        readonly media_evidence: import("../browser/public-verifier.js").PublicMediaEvidence | null;
        readonly recorded_at: string;
    }>;
    recordPublished(receipt: PublishReceipt, publicResult: ManualPublicResult): Promise<PublishReceipt>;
    private safeId;
    private persistApproval;
    private renderPreview;
}
export {};
