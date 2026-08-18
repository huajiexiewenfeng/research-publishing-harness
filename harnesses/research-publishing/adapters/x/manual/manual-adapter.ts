import { randomUUID } from 'node:crypto';

import type { PublicationPlan } from '../../../branches/x-harness/x-service.js';
import { type Approval, verifyApproval } from '../../../core/approval.js';
import { sha256 } from '../../../core/digest.js';
import { HarnessError } from '../../../core/errors.js';
import { validateContract } from '../../../core/schema-validator.js';
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

export class ManualAdapter {
  private readonly receiptId: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly store: WorkspaceStore,
    options: ManualAdapterOptions = {}
  ) {
    this.receiptId = options.receiptId ?? (() => `receipt_${randomUUID()}`);
    this.now = options.now ?? (() => new Date());
  }

  async handoff(plan: PublicationPlan, approval: Approval): Promise<PublishReceipt> {
    verifyApproval(plan, approval, this.now());
    const digestKey = plan.publication_digest.slice(7, 19);
    const root = `x/${plan.run_id}/manual/${digestKey}`;
    const previewPath = `${root}/preview.md`;
    const receiptId = this.safeId(this.receiptId());

    await this.persistApproval(approval);
    await this.store.writeNew(`${root}/copy-package.json`, { plan, approval });
    await this.store.writeNew(previewPath, this.renderPreview(plan));

    const receipt = validateContract<PublishReceipt>('publish-receipt', {
      schema_version: '1.0',
      receipt_id: receiptId,
      run_id: plan.run_id,
      publication_digest: plan.publication_digest,
      adapter: 'manual',
      status: 'handed_off',
      verification_source: 'manual',
      preview_path: previewPath,
      created_at: this.now().toISOString()
    });
    await this.store.writeNew(`receipts/${receiptId}.json`, receipt);
    return receipt;
  }

  async recordPublished(
    receipt: PublishReceipt,
    publicResult: ManualPublicResult
  ): Promise<PublishReceipt> {
    if (receipt.status !== 'handed_off') {
      throw new HarnessError('STATE_TRANSITION_INVALID', 'only a handed-off receipt can be recorded');
    }
    const recorded = validateContract<PublishReceipt>('publish-receipt', {
      ...receipt,
      status: 'manual_recorded',
      public_result: {
        url: publicResult.url,
        post_ids: [...publicResult.postIds],
        published_at: publicResult.publishedAt
      }
    });
    await this.store.writeNew(`receipts/${this.safeId(receipt.receipt_id)}.manual-recorded.json`, recorded);
    return recorded;
  }

  private safeId(value: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
      throw new HarnessError('WORKSPACE_PATH_INVALID', 'receipt id contains unsafe path characters');
    }
    return value;
  }

  private async persistApproval(approval: Approval): Promise<void> {
    const path = `approvals/${approval.approval_id}.json`;
    try {
      const existing = await this.store.readJson<Approval>(path);
      if (sha256(existing) !== sha256(approval)) {
        throw new HarnessError('ARTIFACT_EXISTS', 'approval id exists with different content');
      }
    } catch (error) {
      if (error instanceof HarnessError && error.code === 'ARTIFACT_NOT_FOUND') {
        await this.store.writeNew(path, approval);
        return;
      }
      throw error;
    }
  }

  private renderPreview(plan: PublicationPlan): string {
    const target = plan.target_post == null
      ? ''
      : `\nReply target: ${plan.target_post.url}\nSnapshot: ${plan.target_post.snapshot_digest}\n`;
    const items = plan.items
      .map(
        (item) =>
          `## Copy item ${item.ordinal}\n\n${item.text}\n\nDigest: ${item.digest}`
      )
      .join('\n\n');
    return [
      '# Manual X publication package',
      '',
      `Account: ${plan.target_account}`,
      `Publication digest: ${plan.publication_digest}`,
      target,
      items,
      '',
      'This package is for human copy/paste. No publication was performed or verified automatically.',
      ''
    ].join('\n');
  }
}
