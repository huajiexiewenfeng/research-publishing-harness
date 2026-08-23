import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ResearchEvidenceService } from '../../harnesses/research-publishing/core/research-evidence-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

const digest = (seed: string) => `sha256:${seed.repeat(64).slice(0, 64)}` as const;

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'rph-evidence-capture-'));
  const store = await WorkspaceStore.open(root);
  await store.writeNew('articles/runtime/article.md', '# Runtime boundary\n');
  await store.writeNewBytes('articles/runtime/diagram.png', Buffer.from([137, 80, 78, 71]));
  const service = new ResearchEvidenceService(store, {
    evidenceSnapshotId: () => 'evidence_runtime_001',
    now: () => new Date('2026-08-23T01:00:00.000Z')
  });
  return { store, service };
}

describe('ResearchEvidenceService', () => {
  it.each([
    ['working_checkpoint', 'explicit_working_checkpoint', 'canonical_article'],
    ['research_package_finalized', 'automatic_terminal', 'research_package'],
    ['publication_intent_approved', 'automatic_terminal', 'publication_plan'],
    ['publication_receipt_terminal', 'automatic_terminal', 'publication_receipt'],
    ['feedback_selected', 'automatic_terminal', 'feedback_snapshot'],
    ['candidate_insight_created', 'automatic_terminal', 'candidate_insight']
  ] as const)('admits the %s capture event with its declared artifact role', async (
    capture_event,
    capture_kind,
    role
  ) => {
    const root = await mkdtemp(join(tmpdir(), 'rph-evidence-event-'));
    const store = await WorkspaceStore.open(root);
    const path = `packages/events/${capture_event}.md`;
    await store.writeNew(path, `# ${capture_event}\n`);
    const service = new ResearchEvidenceService(store);
    await expect(service.capture({
      increment_id: 'increment_events', increment_revision: 1,
      capture_event, capture_kind, workspace_identity_digest: digest('e'),
      artifacts: [{
        workspace_relative_path: path, role, media_type: 'text/markdown', canonical: true,
        privacy_classification: role === 'feedback_snapshot' ? 'data_only' : 'internal'
      }],
      source_refs: [`source:${capture_event}`],
      privacy_classification: role === 'feedback_snapshot' ? 'data_only' : 'internal'
    })).resolves.toMatchObject({ capture_event, capture_kind });
  });

  it('captures all allowed artifacts before atomically creating the Snapshot', async () => {
    const { store, service } = await fixture();
    const snapshot = await service.capture({
      increment_id: 'increment_runtime_001',
      increment_revision: 1,
      capture_event: 'article_finalized',
      capture_kind: 'automatic_terminal',
      workspace_identity_digest: digest('a'),
      artifacts: [
        {
          workspace_relative_path: 'articles/runtime/article.md',
          role: 'canonical_article', media_type: 'text/markdown', canonical: true,
          privacy_classification: 'internal'
        },
        {
          workspace_relative_path: 'articles/runtime/diagram.png',
          role: 'visual_asset', media_type: 'image/png', canonical: true,
          privacy_classification: 'internal'
        }
      ],
      source_refs: ['package:runtime_001'],
      privacy_classification: 'internal'
    });
    expect(snapshot).toMatchObject({
      evidence_snapshot_id: 'evidence_runtime_001',
      capture_policy_version: 'research-evidence-capture/v1',
      captured_at: '2026-08-23T01:00:00.000Z'
    });
    expect(snapshot.artifact_refs).toHaveLength(2);
    await expect(store.readJson('memory/evidence/snapshots/evidence_runtime_001/manifest.json'))
      .resolves.toEqual(snapshot);
    await expect(service.status('evidence_runtime_001')).resolves.toMatchObject({
      state: 'complete', snapshot_digest: snapshot.snapshot_digest
    });
  });

  it('does not create a complete Snapshot when any artifact fails privacy checks', async () => {
    const { store, service } = await fixture();
    await store.writeNew('articles/runtime/secret.txt', 'api_token=super-secret-value');
    await expect(service.capture({
      increment_id: 'increment_runtime_002', increment_revision: 1,
      capture_event: 'article_finalized', capture_kind: 'automatic_terminal',
      workspace_identity_digest: digest('b'),
      artifacts: [{
        workspace_relative_path: 'articles/runtime/secret.txt',
        role: 'canonical_article', media_type: 'text/plain', canonical: true,
        privacy_classification: 'restricted'
      }],
      source_refs: ['package:runtime_002'], privacy_classification: 'restricted'
    })).rejects.toMatchObject({ code: 'PRIVACY_GATE_BLOCKED' });
    await expect(store.exists('memory/evidence/snapshots/evidence_runtime_001/manifest.json'))
      .resolves.toBe(false);
  });
});
