import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ResearchTerminalHooks } from '../../harnesses/research-publishing/core/research-terminal-hooks.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

describe('Research publication loop', () => {
  it('keeps terminal publication outcome intact when Evidence capture is pending', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-publication-loop-'));
    const store = await WorkspaceStore.open(root);
    const publicationReceipt = { receipt_id: 'receipt_terminal', status: 'finalized', public_url: 'https://x.com/runtime/status/1' };
    await store.writeNew('receipts/terminal-loop.json', publicationReceipt);
    const artifact = await store.resolveExistingArtifact('receipts/terminal-loop.json');
    const hooks = new ResearchTerminalHooks(store, {
      capture: async () => { throw new Error('synthetic evidence outage'); }
    });
    const hookReceipt = await hooks.record({
      event_id: 'terminal_loop', kind: 'publication_receipt_terminal', publication_kind: 'x_post',
      increment_id: 'increment_loop', increment_revision: 1,
      workspace_identity_digest: `sha256:${'a'.repeat(64)}`, source_digest: artifact.digest,
      artifacts: [{
        workspace_relative_path: artifact.relative_path, digest: artifact.digest,
        role: 'publication_receipt', media_type: 'application/json', canonical: true,
        privacy_classification: 'internal'
      }], source_refs: ['receipt:terminal'], privacy_classification: 'internal',
      occurred_at: '2026-08-23T03:00:00.000Z'
    });
    expect(hookReceipt.status).toBe('evidence_capture_pending');
    await expect(store.readJson('receipts/terminal-loop.json')).resolves.toEqual(publicationReceipt);
  });
});

