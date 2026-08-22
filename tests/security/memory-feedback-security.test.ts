import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MemoryFeedbackService } from '../../harnesses/research-publishing/core/memory-feedback-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

describe('Feedback capture security', () => {
  it('rejects a receipt reached through a junction and never follows it', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'rph-feedback-link-'));
    const root = join(parent, 'workspace');
    const outside = join(parent, 'outside');
    await mkdir(outside);
    await writeFile(join(outside, 'receipt.json'), JSON.stringify({
      receipt_id: 'outside', status: 'finalized', target_account: '@runtime_ai',
      public_result: { root_url: 'https://x.com/runtime_ai/status/1' }
    }), 'utf8');
    const store = await WorkspaceStore.open(root);
    await symlink(outside, join(root, 'receipts', 'outside-link'), 'junction');
    const service = new MemoryFeedbackService(store);
    await expect(service.capture({
      receipt_path: 'receipts/outside-link/receipt.json',
      receipt_digest: `sha256:${'a'.repeat(64)}`, publication_kind: 'x_single',
      public_url: 'https://x.com/runtime_ai/status/1', account: '@runtime_ai',
      observed_at: new Date(), selection_actor: 'human-reviewer', selection_reason: 'selected',
      entries: []
    })).rejects.toMatchObject({ code: 'WORKSPACE_PATH_INVALID' });
  });

  it('requires HTTPS public URLs and explicit Human selection provenance', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-feedback-input-'));
    const store = await WorkspaceStore.open(root);
    const path = 'receipts/r.json';
    await store.writeNew(path, {
      receipt_id: 'r', status: 'finalized', target_account: '@runtime_ai',
      public_result: { root_url: 'https://x.com/runtime_ai/status/1' }
    });
    const ref = await store.resolveExistingArtifact(path);
    const service = new MemoryFeedbackService(store);
    await expect(service.capture({
      receipt_path: path, receipt_digest: ref.digest, publication_kind: 'x_single',
      public_url: 'http://x.com/runtime_ai/status/1', account: '@runtime_ai',
      observed_at: new Date(), selection_actor: '', selection_reason: '', entries: []
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });
});
