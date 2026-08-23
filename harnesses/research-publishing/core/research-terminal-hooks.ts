import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { STABLE_ID_PATTERN } from './research-memory-contracts.js';
import { ResearchEvidenceService } from './research-evidence-service.js';
import type {
  ArtifactRole,
  PrivacyClassification,
  ResearchEvidenceCaptureEvent,
  ResearchEvidenceSnapshotV1
} from './research-memory-types.js';
import { validateContract } from './schema-validator.js';
import type { WorkspaceStore } from './workspace-store.js';

export type ResearchTerminalEventKind =
  | 'package_finalized'
  | 'article_finalized'
  | 'publication_plan_approved'
  | 'publication_receipt_terminal'
  | 'feedback_selected'
  | 'candidate_insight_created';

export interface ResearchTerminalEventArtifact {
  readonly workspace_relative_path: string;
  readonly digest: `sha256:${string}`;
  readonly role: ArtifactRole;
  readonly media_type: string;
  readonly canonical: boolean;
  readonly privacy_classification: PrivacyClassification;
}

export interface ResearchTerminalEvent {
  readonly event_id: string;
  readonly kind: ResearchTerminalEventKind;
  readonly publication_kind: 'x_post' | 'x_article' | null;
  readonly increment_id: string;
  readonly increment_revision: number;
  readonly workspace_identity_digest: `sha256:${string}`;
  readonly source_digest: `sha256:${string}`;
  readonly artifacts: readonly ResearchTerminalEventArtifact[];
  readonly source_refs: readonly string[];
  readonly privacy_classification: PrivacyClassification;
  readonly occurred_at: string;
}

export interface ResearchTerminalHookReceiptV1 {
  readonly schema_version: 'research-terminal-hook-receipt/v1';
  readonly event_id: string;
  readonly event_kind: ResearchTerminalEventKind;
  readonly event_digest: `sha256:${string}`;
  readonly source_digest: `sha256:${string}`;
  readonly status: 'complete' | 'evidence_capture_pending';
  readonly evidence_snapshot_ref: string | null;
  readonly evidence_snapshot_digest: `sha256:${string}` | null;
  readonly error_code: string | null;
  readonly recorded_at: string;
  readonly receipt_digest: `sha256:${string}`;
}

interface TerminalHookLedgerV1 {
  readonly schema_version: 'research-terminal-hook-ledger/v1';
  readonly event_id: string;
  readonly event_digest: `sha256:${string}`;
  readonly source_digest: `sha256:${string}`;
  readonly evidence_snapshot_id: string;
  readonly status: 'capture_pending' | 'complete';
  readonly updated_at: string;
}

export interface ResearchTerminalHooksOptions {
  readonly now?: () => Date;
  readonly capture?: (
    event: ResearchTerminalEvent,
    evidenceSnapshotId: string
  ) => Promise<ResearchEvidenceSnapshotV1>;
}

export interface ResearchTerminalArtifactNotification {
  readonly notification_id: string;
  readonly kind: ResearchTerminalEventKind;
  readonly publication_kind: 'x_post' | 'x_article' | null;
  readonly workspace_relative_path: string;
  readonly role: ArtifactRole;
  readonly media_type: string;
  readonly canonical: boolean;
  readonly privacy_classification: PrivacyClassification;
  readonly occurred_at: string;
}

export interface ResearchTerminalNotifier {
  notify(input: ResearchTerminalArtifactNotification): Promise<ResearchTerminalHookReceiptV1>;
}

export interface BoundResearchTerminalContext {
  readonly increment_id: string;
  readonly increment_revision: number;
  readonly workspace_identity_digest: `sha256:${string}`;
  readonly source_refs: readonly string[];
  readonly privacy_classification: PrivacyClassification;
}

export async function notifyTerminalSafely(
  store: WorkspaceStore,
  notifier: ResearchTerminalNotifier | null,
  input: ResearchTerminalArtifactNotification
): Promise<void> {
  if (notifier === null) return;
  try {
    const receipt = await notifier.notify(input);
    if (receipt.status === 'complete') return;
    await store.replaceAtomic(`memory/terminal-hooks/pending-notifications/${input.notification_id}.json`, receipt);
  } catch (error) {
    await store.replaceAtomic(`memory/terminal-hooks/pending-notifications/${input.notification_id}.json`, {
      schema_version: 'research-terminal-notification-pending/v1',
      notification_id: input.notification_id,
      kind: input.kind,
      source_path: input.workspace_relative_path,
      status: 'evidence_capture_pending',
      error_code: error instanceof HarnessError ? error.code : 'EVIDENCE_CAPTURE_FAILED',
      recorded_at: input.occurred_at
    });
  }
}

const EVENT_CAPTURE: Readonly<Record<ResearchTerminalEventKind, ResearchEvidenceCaptureEvent>> = {
  package_finalized: 'research_package_finalized',
  article_finalized: 'article_finalized',
  publication_plan_approved: 'publication_intent_approved',
  publication_receipt_terminal: 'publication_receipt_terminal',
  feedback_selected: 'feedback_selected',
  candidate_insight_created: 'candidate_insight_created'
};

const EVENT_PRIMARY_ROLE: Readonly<Record<ResearchTerminalEventKind, ArtifactRole>> = {
  package_finalized: 'research_package',
  article_finalized: 'canonical_article',
  publication_plan_approved: 'publication_plan',
  publication_receipt_terminal: 'publication_receipt',
  feedback_selected: 'feedback_snapshot',
  candidate_insight_created: 'candidate_insight'
};

function unsignedReceipt(receipt: ResearchTerminalHookReceiptV1): object {
  const body = { ...receipt } as Record<string, unknown>;
  Reflect.deleteProperty(body, 'receipt_digest');
  return body;
}

export class ResearchTerminalHooks {
  private readonly now: () => Date;
  private readonly capture: NonNullable<ResearchTerminalHooksOptions['capture']>;

  constructor(
    private readonly store: WorkspaceStore,
    options: ResearchTerminalHooksOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.capture = options.capture ?? ((event, evidenceId) =>
      ResearchTerminalHooks.captureDefault(store, event, evidenceId, this.now));
  }

  static async captureDefault(
    store: WorkspaceStore,
    event: ResearchTerminalEvent,
    evidenceSnapshotId: string,
    now: () => Date = () => new Date()
  ): Promise<ResearchEvidenceSnapshotV1> {
    const evidence = new ResearchEvidenceService(store, {
      evidenceSnapshotId: () => evidenceSnapshotId,
      now
    });
    const snapshotPath = `memory/evidence/snapshots/${evidenceSnapshotId}/manifest.json`;
    if (await store.exists(snapshotPath)) {
      await evidence.status(evidenceSnapshotId);
      return store.readJson<ResearchEvidenceSnapshotV1>(snapshotPath);
    }
    return evidence.capture({
      increment_id: event.increment_id,
      increment_revision: event.increment_revision,
      capture_event: EVENT_CAPTURE[event.kind],
      capture_kind: 'automatic_terminal',
      workspace_identity_digest: event.workspace_identity_digest,
      artifacts: event.artifacts.map((artifact) => ({
        workspace_relative_path: artifact.workspace_relative_path,
        role: artifact.role,
        media_type: artifact.media_type,
        canonical: artifact.canonical,
        privacy_classification: artifact.privacy_classification
      })),
      source_refs: event.source_refs,
      privacy_classification: event.privacy_classification
    });
  }

  async record(event: ResearchTerminalEvent): Promise<ResearchTerminalHookReceiptV1> {
    await this.validateEvent(event);
    const root = this.root(event.event_id);
    const eventDigest = sha256(event);
    const evidenceSnapshotId = `evidence_${sha256(event.event_id).slice(7, 31)}`;
    return this.store.withLock(`memory/terminal-hooks/locks/${event.event_id}.lock`, async () => {
      if (await this.store.exists(`${root}/event.json`)) {
        const stored = await this.store.readJson<ResearchTerminalEvent>(`${root}/event.json`);
        if (sha256(stored) !== eventDigest) {
          throw new HarnessError('APPROVAL_STALE', 'terminal event id is already bound to different source bytes');
        }
        const complete = await this.readReceipt(event.event_id);
        if (complete?.status === 'complete') return complete;
      } else {
        const ledger: TerminalHookLedgerV1 = {
          schema_version: 'research-terminal-hook-ledger/v1',
          event_id: event.event_id,
          event_digest: eventDigest,
          source_digest: event.source_digest,
          evidence_snapshot_id: evidenceSnapshotId,
          status: 'capture_pending',
          updated_at: this.now().toISOString()
        };
        await this.store.writeNewDirectory(root, { 'event.json': event, 'ledger.json': ledger });
      }
      return this.captureAndRecord(event, eventDigest, evidenceSnapshotId);
    });
  }

  async resume(eventId: string): Promise<ResearchTerminalHookReceiptV1> {
    const root = this.root(eventId);
    const event = await this.store.readJson<ResearchTerminalEvent>(`${root}/event.json`);
    return this.record(event);
  }

  async status(eventId: string): Promise<ResearchTerminalHookReceiptV1> {
    const receipt = await this.readReceipt(eventId);
    if (receipt === null) {
      throw new HarnessError('ARTIFACT_NOT_FOUND', `terminal hook Receipt not found: ${eventId}`);
    }
    return receipt;
  }

  bind(context: BoundResearchTerminalContext): ResearchTerminalNotifier {
    return {
      notify: async (input) => {
        const artifact = await this.store.resolveExistingArtifact(input.workspace_relative_path);
        return this.record({
          event_id: input.notification_id,
          kind: input.kind,
          publication_kind: input.publication_kind,
          increment_id: context.increment_id,
          increment_revision: context.increment_revision,
          workspace_identity_digest: context.workspace_identity_digest,
          source_digest: artifact.digest,
          artifacts: [{
            workspace_relative_path: artifact.relative_path,
            digest: artifact.digest,
            role: input.role,
            media_type: input.media_type,
            canonical: input.canonical,
            privacy_classification: input.privacy_classification
          }],
          source_refs: context.source_refs,
          privacy_classification: context.privacy_classification,
          occurred_at: input.occurred_at
        });
      }
    };
  }

  private async captureAndRecord(
    event: ResearchTerminalEvent,
    eventDigest: `sha256:${string}`,
    evidenceSnapshotId: string
  ): Promise<ResearchTerminalHookReceiptV1> {
    try {
      const snapshot = await this.capture(event, evidenceSnapshotId);
      const receipt = this.receipt(event, eventDigest, {
        status: 'complete', evidence_snapshot_ref: `evidence:${snapshot.evidence_snapshot_id}`,
        evidence_snapshot_digest: snapshot.snapshot_digest, error_code: null
      });
      await this.store.replaceAtomic(`${this.root(event.event_id)}/receipt.json`, receipt);
      await this.store.replaceAtomic(`${this.root(event.event_id)}/ledger.json`, {
        schema_version: 'research-terminal-hook-ledger/v1', event_id: event.event_id,
        event_digest: eventDigest, source_digest: event.source_digest,
        evidence_snapshot_id: snapshot.evidence_snapshot_id, status: 'complete',
        updated_at: receipt.recorded_at
      } satisfies TerminalHookLedgerV1);
      return receipt;
    } catch (error) {
      const receipt = this.receipt(event, eventDigest, {
        status: 'evidence_capture_pending', evidence_snapshot_ref: null,
        evidence_snapshot_digest: null,
        error_code: error instanceof HarnessError ? error.code : 'EVIDENCE_CAPTURE_FAILED'
      });
      await this.store.replaceAtomic(`${this.root(event.event_id)}/receipt.json`, receipt);
      return receipt;
    }
  }

  private receipt(
    event: ResearchTerminalEvent,
    eventDigest: `sha256:${string}`,
    result: Pick<ResearchTerminalHookReceiptV1,
      'status' | 'evidence_snapshot_ref' | 'evidence_snapshot_digest' | 'error_code'>
  ): ResearchTerminalHookReceiptV1 {
    const body = {
      schema_version: 'research-terminal-hook-receipt/v1' as const,
      event_id: event.event_id,
      event_kind: event.kind,
      event_digest: eventDigest,
      source_digest: event.source_digest,
      ...result,
      recorded_at: this.now().toISOString()
    };
    return validateContract<ResearchTerminalHookReceiptV1>('research-terminal-hook-receipt', {
      ...body,
      receipt_digest: sha256(body)
    });
  }

  private async readReceipt(eventId: string): Promise<ResearchTerminalHookReceiptV1 | null> {
    const path = `${this.root(eventId)}/receipt.json`;
    if (!(await this.store.exists(path))) return null;
    const receipt = validateContract<ResearchTerminalHookReceiptV1>(
      'research-terminal-hook-receipt',
      await this.store.readJson(path)
    );
    if (sha256(unsignedReceipt(receipt)) !== receipt.receipt_digest) {
      throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'terminal hook Receipt digest does not match');
    }
    return receipt;
  }

  private async validateEvent(event: ResearchTerminalEvent): Promise<void> {
    if (!STABLE_ID_PATTERN.test(event.event_id) || !STABLE_ID_PATTERN.test(event.increment_id) ||
      !Number.isInteger(event.increment_revision) || event.increment_revision < 1 ||
      !Number.isFinite(Date.parse(event.occurred_at)) || event.artifacts.length === 0 ||
      event.source_refs.length === 0) {
      throw new HarnessError('CONTRACT_INVALID', 'terminal event identity or source binding is incomplete');
    }
    if ((event.kind === 'publication_receipt_terminal') !== (event.publication_kind !== null)) {
      throw new HarnessError('CONTRACT_INVALID', 'publication terminal events require an exact publication kind');
    }
    if (event.artifacts[0]!.role !== EVENT_PRIMARY_ROLE[event.kind] ||
      event.artifacts[0]!.digest !== event.source_digest) {
      throw new HarnessError('CONTRACT_INVALID', 'terminal event primary source does not match its kind or digest');
    }
    for (const artifact of event.artifacts) {
      const resolved = await this.store.resolveExistingArtifact(artifact.workspace_relative_path);
      if (resolved.digest !== artifact.digest) {
        throw new HarnessError('MEMORY_SOURCE_STALE', 'terminal event source bytes are stale');
      }
    }
  }

  private root(eventId: string): string {
    if (!STABLE_ID_PATTERN.test(eventId)) throw new HarnessError('CONTRACT_INVALID', 'terminal event id must be stable');
    return `memory/terminal-hooks/${eventId}`;
  }
}
