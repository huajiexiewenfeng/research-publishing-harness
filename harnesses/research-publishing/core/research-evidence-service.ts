import { randomUUID } from 'node:crypto';

import { sha256 } from './digest.js';
import { EvidenceObjectStore, type ContainedArtifactInput } from './evidence-object-store.js';
import { HarnessError } from './errors.js';
import { STABLE_ID_PATTERN } from './research-memory-contracts.js';
import type {
  ArtifactRole,
  PrivacyClassification,
  ResearchEvidenceCaptureEvent,
  ResearchEvidenceSnapshotV1
} from './research-memory-types.js';
import { validateContract } from './schema-validator.js';
import type { WorkspaceStore } from './workspace-store.js';

export interface CaptureResearchEvidenceInput {
  readonly increment_id: string;
  readonly increment_revision: number;
  readonly capture_event: ResearchEvidenceCaptureEvent;
  readonly capture_kind: 'automatic_terminal' | 'explicit_working_checkpoint' | 'explicit_import';
  readonly workspace_identity_digest: `sha256:${string}`;
  readonly artifacts: readonly ContainedArtifactInput[];
  readonly source_refs: readonly string[];
  readonly privacy_classification: PrivacyClassification;
}

export interface ResearchEvidenceCaptureStatusV1 {
  readonly evidence_snapshot_id: string;
  readonly state: 'complete';
  readonly snapshot_digest: `sha256:${string}`;
  readonly artifact_count: number;
}

const EVENT_ROLES: Readonly<Record<ResearchEvidenceCaptureEvent, ReadonlySet<ArtifactRole>>> = {
  working_checkpoint: new Set(['canonical_article', 'research_package', 'claim_map', 'sources', 'boundary', 'lineage']),
  research_package_finalized: new Set(['research_package', 'claim_map', 'sources', 'boundary', 'lineage']),
  article_finalized: new Set(['canonical_article', 'article_metadata', 'review_report', 'visual_review_report', 'visual_asset', 'sources', 'boundary', 'lineage']),
  publication_intent_approved: new Set(['publication_plan', 'canonical_article', 'visual_asset']),
  publication_receipt_terminal: new Set(['publication_receipt']),
  feedback_selected: new Set(['feedback_snapshot']),
  candidate_insight_created: new Set(['candidate_insight'])
};

const PRIVACY_RANK: Readonly<Record<PrivacyClassification, number>> = {
  public: 0,
  internal: 1,
  data_only: 1,
  restricted: 2
};

export class ResearchEvidenceService {
  private readonly objects: EvidenceObjectStore;

  constructor(
    private readonly store: WorkspaceStore,
    private readonly ids: Readonly<{
      evidenceSnapshotId?: () => string;
      now?: () => Date;
    }> = {}
  ) {
    this.objects = new EvidenceObjectStore(store);
  }

  async capture(input: CaptureResearchEvidenceInput): Promise<ResearchEvidenceSnapshotV1> {
    if (!STABLE_ID_PATTERN.test(input.increment_id) || input.increment_revision < 1) {
      throw new HarnessError('CONTRACT_INVALID', 'Evidence capture requires a stable Increment revision');
    }
    if (input.artifacts.length === 0) {
      throw new HarnessError('CONTRACT_INVALID', 'Evidence capture requires at least one artifact');
    }
    const allowedRoles = EVENT_ROLES[input.capture_event];
    for (const artifact of input.artifacts) {
      if (!allowedRoles.has(artifact.role)) {
        throw new HarnessError('PRIVACY_GATE_BLOCKED', `${artifact.role} is not allowed for ${input.capture_event}`);
      }
      if (PRIVACY_RANK[artifact.privacy_classification] > PRIVACY_RANK[input.privacy_classification]) {
        throw new HarnessError('PRIVACY_GATE_BLOCKED', 'Snapshot privacy cannot downgrade an artifact');
      }
    }

    const artifactRefs = [];
    for (const artifact of input.artifacts) {
      artifactRefs.push((await this.objects.put(artifact)).artifact_ref);
    }

    const evidenceSnapshotId = this.ids.evidenceSnapshotId?.() ??
      `evidence_${randomUUID().replaceAll('-', '')}`;
    const body = {
      schema_version: 'research-evidence-snapshot/v1' as const,
      evidence_snapshot_id: evidenceSnapshotId,
      increment_id: input.increment_id,
      increment_revision: input.increment_revision,
      capture_event: input.capture_event,
      capture_kind: input.capture_kind,
      workspace_identity_digest: input.workspace_identity_digest,
      artifact_refs: artifactRefs,
      source_refs: [...input.source_refs],
      privacy_classification: input.privacy_classification,
      capture_policy_version: 'research-evidence-capture/v1' as const,
      captured_at: (this.ids.now?.() ?? new Date()).toISOString()
    };
    const snapshot = validateContract<ResearchEvidenceSnapshotV1>('research-evidence-snapshot', {
      ...body,
      snapshot_digest: sha256(body)
    });
    await this.store.writeNewDirectory(`memory/evidence/snapshots/${evidenceSnapshotId}`, {
      'manifest.json': snapshot
    });
    return snapshot;
  }

  async status(evidenceSnapshotId: string): Promise<ResearchEvidenceCaptureStatusV1> {
    if (!STABLE_ID_PATTERN.test(evidenceSnapshotId)) {
      throw new HarnessError('CONTRACT_INVALID', 'Evidence Snapshot id must be stable');
    }
    const snapshot = validateContract<ResearchEvidenceSnapshotV1>(
      'research-evidence-snapshot',
      await this.store.readJson(`memory/evidence/snapshots/${evidenceSnapshotId}/manifest.json`)
    );
    const body = { ...snapshot } as Record<string, unknown>;
    Reflect.deleteProperty(body, 'snapshot_digest');
    if (sha256(body) !== snapshot.snapshot_digest) {
      throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'Evidence Snapshot digest does not match');
    }
    for (const ref of snapshot.artifact_refs) await this.objects.verify(ref);
    return {
      evidence_snapshot_id: snapshot.evidence_snapshot_id,
      state: 'complete',
      snapshot_digest: snapshot.snapshot_digest,
      artifact_count: snapshot.artifact_refs.length
    };
  }
}
