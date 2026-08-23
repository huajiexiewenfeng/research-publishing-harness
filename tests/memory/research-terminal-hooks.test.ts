import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
import {
  ResearchTerminalHooks,
  type ResearchTerminalEventKind
} from '../../harnesses/research-publishing/core/research-terminal-hooks.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

const digest = (seed: string) => sha256(seed);

const cases = [
  ['package_finalized', 'research_package', 'package', null],
  ['article_finalized', 'canonical_article', 'article', null],
  ['publication_plan_approved', 'publication_plan', 'plan', null],
  ['publication_receipt_terminal', 'publication_receipt', 'post', 'x_post'],
  ['publication_receipt_terminal', 'publication_receipt', 'xarticle', 'x_article'],
  ['feedback_selected', 'feedback_snapshot', 'feedback', null],
  ['candidate_insight_created', 'candidate_insight', 'insight', null]
] as const;

describe('ResearchTerminalHooks', () => {
  it.each(cases)('records %s idempotently from one immutable source', async (kind, role, suffix, publicationKind) => {
    const root = await mkdtemp(join(tmpdir(), 'rph-terminal-hook-'));
    const store = await WorkspaceStore.open(root);
    const path = `packages/hooks/${kind}-${suffix}.json`;
    await store.writeNew(path, { kind, suffix });
    const artifact = await store.resolveExistingArtifact(path);
    const hooks = new ResearchTerminalHooks(store, {
      now: () => new Date('2026-08-23T03:00:00.000Z')
    });
    const event = {
      event_id: `terminal_${kind}_${suffix}`,
      kind: kind as ResearchTerminalEventKind,
      publication_kind: publicationKind,
      increment_id: 'increment_terminal', increment_revision: 1,
      workspace_identity_digest: digest('w'), source_digest: artifact.digest,
      artifacts: [{
        workspace_relative_path: path, digest: artifact.digest, role,
        media_type: 'application/json', canonical: true, privacy_classification: 'internal' as const
      }],
      source_refs: [`source:${kind}:${suffix}`], privacy_classification: 'internal' as const,
      occurred_at: '2026-08-23T02:59:00.000Z'
    };
    const first = await hooks.record(event);
    const second = await hooks.record(event);
    expect(second).toEqual(first);
    expect(first).toMatchObject({ status: 'complete', event_id: event.event_id });
    const unsigned = { ...first } as Record<string, unknown>;
    Reflect.deleteProperty(unsigned, 'receipt_digest');
    expect(first.receipt_digest).toBe(sha256(unsigned));
    expect((await store.list('memory/evidence/snapshots')).filter((entry) => entry.kind === 'directory')).toHaveLength(1);
  });

  it('leaves a resumable pending receipt when capture fails after the write-ahead ledger', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-terminal-resume-'));
    const store = await WorkspaceStore.open(root);
    await store.writeNew('receipts/terminal.json', { status: 'finalized' });
    const artifact = await store.resolveExistingArtifact('receipts/terminal.json');
    let fail = true;
    const hooks = new ResearchTerminalHooks(store, {
      now: () => new Date('2026-08-23T03:00:00.000Z'),
      capture: async (event, evidenceId) => {
        if (fail) { fail = false; throw new Error('synthetic capture failure'); }
        return ResearchTerminalHooks.captureDefault(store, event, evidenceId, () => new Date('2026-08-23T03:01:00.000Z'));
      }
    });
    const event = {
      event_id: 'terminal_resume', kind: 'publication_receipt_terminal' as const,
      publication_kind: 'x_post' as const,
      increment_id: 'increment_terminal', increment_revision: 1,
      workspace_identity_digest: digest('w'), source_digest: artifact.digest,
      artifacts: [{
        workspace_relative_path: artifact.relative_path, digest: artifact.digest,
        role: 'publication_receipt' as const, media_type: 'application/json', canonical: true,
        privacy_classification: 'internal' as const
      }],
      source_refs: ['receipt:terminal'], privacy_classification: 'internal' as const,
      occurred_at: '2026-08-23T02:59:00.000Z'
    };
    await expect(hooks.record(event)).resolves.toMatchObject({ status: 'evidence_capture_pending' });
    await expect(hooks.resume(event.event_id)).resolves.toMatchObject({ status: 'complete' });
  });
});
