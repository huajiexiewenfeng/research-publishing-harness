import { randomUUID } from 'node:crypto';

import type { PublicationPlan } from '../../../branches/x-harness/x-service.js';
import { type Approval, verifyApproval } from '../../../core/approval.js';
import { sha256 } from '../../../core/digest.js';
import { HarnessError } from '../../../core/errors.js';
import { validateContract } from '../../../core/schema-validator.js';
import type { WorkspaceStore } from '../../../core/workspace-store.js';
import { assertPublicationPlanV2, type PublicationPlanV2 } from '../../../core/publication-plan-v2.js';
import { assertPublicationPlanV2_1, type PublicationPlanV2_1 } from '../../../core/publication-plan-v2-1.js';
import { computePageRevision, type BrowserObservation } from '../browser/browser-protocol.js';
import { verifyPublicThread } from '../browser/public-verifier.js';

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

  async recordObserved(plan: PublicationPlanV2 | PublicationPlanV2_1, observation: BrowserObservation) {
    if (plan.schema_version === '2.1') assertPublicationPlanV2_1(plan);
    else assertPublicationPlanV2(plan);
    validateContract<BrowserObservation>('browser-observation', observation);
    if (computePageRevision(observation) !== observation.page_revision) {
      throw new HarnessError('STALE_PAGE_REVISION', 'manual publication observation has changed');
    }
    for (const post of observation.public_posts) {
      const expected = `https://x.com/${post.author_handle.slice(1)}/status/${post.post_id}`;
      if (!/^\d+$/.test(post.post_id) || post.canonical_url.toLowerCase() !== expected.toLowerCase()) {
        throw new HarnessError('CONTRACT_INVALID', 'manual publication requires canonical X post URLs');
      }
    }
    const result = verifyPublicThread(plan, observation.public_posts);
    if (result.kind !== 'full_match' || observation.canonical_url !== result.root_url) {
      throw new HarnessError('COMPOSER_CONTENT_MISMATCH', 'public evidence does not match the complete publication Plan');
    }
    const id = this.safeId(`manual_${plan.plan_id}_${result.posts[0]!.post_id}`);
    const evidenceDigest = sha256(observation.public_posts);
    const path = `receipts/${id}.json`;
    const receipt = {
      schema_version: 'manual-observed/v1', receipt_id: id, run_id: plan.run_id,
      publication_actor: 'human', verification_source: 'browser_observation',
      status: result.media_evidence?.verified === false ? 'manual_media_unverified' : 'manual_verified',
      plan_digest: plan.plan_digest, root_url: result.root_url,
      post_ids: result.posts.map((post) => post.post_id), quote_post_id: plan.intent.quote_post?.id ?? null,
      evidence_digest: evidenceDigest, media_evidence: result.media_evidence ?? null,
      recorded_at: this.now().toISOString()
    } as const;
    try {
      const existing = await this.store.readJson<typeof receipt>(path);
      if (existing.plan_digest !== plan.plan_digest || existing.evidence_digest !== evidenceDigest) {
        throw new HarnessError('ARTIFACT_EXISTS', 'manual receipt already exists with different evidence');
      }
      return existing;
    } catch (error) {
      if (!(error instanceof HarnessError) || error.code !== 'ARTIFACT_NOT_FOUND') throw error;
    }
    await this.store.writeNew(`${path}.evidence.json`, { plan, observation });
    await this.store.writeNew(path, receipt);
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
