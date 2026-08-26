import type { PublicationPlan } from '../../../branches/x-harness/x-service.js';
import { type Approval } from '../../../core/approval.js';
import type { WorkspaceStore } from '../../../core/workspace-store.js';
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
    recordPublished(receipt: PublishReceipt, publicResult: ManualPublicResult): Promise<PublishReceipt>;
    private safeId;
    private persistApproval;
    private renderPreview;
}
export {};
