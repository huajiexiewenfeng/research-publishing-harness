import { randomUUID } from 'node:crypto';

import { sha256, sha256Bytes } from './digest.js';
import { HarnessError } from './errors.js';
import type { Digest, PublicationFeedbackSnapshotV1 } from './memory-types.js';
import { validateContract } from './schema-validator.js';
import type { WorkspaceStore } from './workspace-store.js';

const TERMINAL_RECEIPT_STATUSES = new Set(['finalized', 'published', 'manual_recorded']);

export interface CaptureFeedbackInput {
  readonly receipt_path: string;
  readonly receipt_digest: Digest;
  readonly publication_kind: PublicationFeedbackSnapshotV1['publication_kind'];
  readonly public_url: string;
  readonly account: string;
  readonly observed_at: Date;
  readonly selection_actor: string;
  readonly selection_reason: string;
  readonly entries: ReadonlyArray<{
    readonly public_url: string;
    readonly platform_id: string;
    readonly author: string;
    readonly observed_text: string;
    readonly observed_metrics: Readonly<Record<string, number>>;
  }>;
}

export interface MemoryFeedbackServiceIds {
  readonly feedbackSnapshotId?: () => string;
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new HarnessError('CONTRACT_INVALID', 'publication receipt must be a JSON object');
  }
  return value as Record<string, unknown>;
}

function nestedString(value: Record<string, unknown>, objectKey: string, field: string): string | null {
  const nested = value[objectKey];
  if (nested === null || typeof nested !== 'object' || Array.isArray(nested)) return null;
  const result = (nested as Record<string, unknown>)[field];
  return typeof result === 'string' ? result : null;
}

function publicHttpsUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new HarnessError('CONTRACT_INVALID', 'feedback URL must be a valid public URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new HarnessError('CONTRACT_INVALID', 'feedback URL must use HTTPS');
  }
  return parsed;
}

export class MemoryFeedbackService {
  constructor(
    private readonly store: WorkspaceStore,
    private readonly ids: MemoryFeedbackServiceIds = {}
  ) {}

  private async receipt(path: string, expectedDigest: Digest): Promise<{
    receipt_id: string;
    status: string;
    target_account: string | null;
    public_url: string | null;
  }> {
    const before = await this.store.resolveExistingArtifact(path);
    if (before.digest !== expectedDigest) {
      throw new HarnessError('MEMORY_SOURCE_STALE', 'publication receipt bytes no longer match');
    }
    const bytes = await this.store.readBytes(path);
    if (sha256Bytes(bytes) !== expectedDigest) {
      throw new HarnessError('MEMORY_SOURCE_STALE', 'publication receipt changed during capture');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(bytes.toString('utf8'));
    } catch {
      throw new HarnessError('CONTRACT_INVALID', 'publication receipt is not valid JSON');
    }
    const value = record(parsed);
    const after = await this.store.resolveExistingArtifact(path);
    if (after.digest !== expectedDigest) {
      throw new HarnessError('MEMORY_SOURCE_STALE', 'publication receipt changed during capture');
    }
    const receiptId = value.receipt_id;
    const status = value.status;
    if (typeof receiptId !== 'string' || receiptId.length === 0 || typeof status !== 'string') {
      throw new HarnessError('CONTRACT_INVALID', 'publication receipt identity is incomplete');
    }
    return {
      receipt_id: receiptId,
      status,
      target_account: typeof value.target_account === 'string' ? value.target_account : null,
      public_url:
        nestedString(value, 'public_result', 'root_url') ??
        nestedString(value, 'public_result', 'url') ??
        nestedString(value, 'public_evidence', 'canonical_url')
    };
  }

  async capture(input: CaptureFeedbackInput): Promise<PublicationFeedbackSnapshotV1> {
    const receipt = await this.receipt(input.receipt_path, input.receipt_digest);
    const actor = input.selection_actor.trim();
    const reason = input.selection_reason.trim();
    const account = input.account.trim();
    const rootUrl = publicHttpsUrl(input.public_url).toString();
    if (
      !TERMINAL_RECEIPT_STATUSES.has(receipt.status) ||
      actor.length === 0 || reason.length === 0 || account.length === 0 ||
      !Number.isFinite(input.observed_at.getTime()) || input.entries.length === 0
    ) {
      throw new HarnessError('CONTRACT_INVALID', 'feedback capture requires terminal receipt and Human selection provenance');
    }
    if (receipt.public_url !== null && publicHttpsUrl(receipt.public_url).toString() !== rootUrl) {
      throw new HarnessError('CONTRACT_INVALID', 'feedback publication URL does not match receipt');
    }
    if (receipt.target_account !== null && receipt.target_account.toLowerCase() !== account.toLowerCase()) {
      throw new HarnessError('CONTRACT_INVALID', 'feedback account does not match receipt');
    }
    const entries = input.entries.map((entry, index) => {
      const observedText = entry.observed_text;
      publicHttpsUrl(entry.public_url);
      if (
        entry.platform_id.trim().length === 0 || entry.author.trim().length === 0 ||
        observedText.trim().length === 0 ||
        Object.values(entry.observed_metrics).some((value) => !Number.isFinite(value) || value < 0)
      ) {
        throw new HarnessError('CONTRACT_INVALID', 'feedback entry is incomplete or has invalid metrics');
      }
      return {
        ordinal: index + 1,
        public_url: new URL(entry.public_url).toString(),
        platform_id: entry.platform_id,
        author: entry.author,
        observed_text: observedText,
        observed_text_checksum: sha256Bytes(Buffer.from(observedText, 'utf8')),
        observed_metrics: { ...entry.observed_metrics },
        data_classification: 'data_only' as const
      };
    });
    const body = {
      schema_version: 'publication-feedback-snapshot/v1' as const,
      feedback_snapshot_id: this.ids.feedbackSnapshotId?.() ?? `feedback_${randomUUID().replaceAll('-', '')}`,
      publication_receipt_id: receipt.receipt_id,
      publication_receipt_digest: input.receipt_digest,
      publication_kind: input.publication_kind,
      public_url: rootUrl,
      account,
      observed_at: input.observed_at.toISOString(),
      selection_actor: actor,
      selection_reason: reason,
      entries
    };
    const snapshot = validateContract<PublicationFeedbackSnapshotV1>(
      'publication-feedback-snapshot',
      { ...body, snapshot_digest: sha256(body) }
    );
    await this.store.writeNew(`feedback/${snapshot.feedback_snapshot_id}/snapshot.json`, snapshot);
    return snapshot;
  }
}
