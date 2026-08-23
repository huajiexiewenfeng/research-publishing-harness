import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ResearchEvidenceService } from '../../harnesses/research-publishing/core/research-evidence-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

const digest = `sha256:${'a'.repeat(64)}` as const;

describe('Research Evidence security', () => {
  it.each(['../outside.md', 'C:\\absolute.md', '/absolute.md'])(
    'rejects unsafe capture path %s',
    async (workspace_relative_path) => {
      const root = await mkdtemp(join(tmpdir(), 'rph-evidence-path-'));
      const service = new ResearchEvidenceService(await WorkspaceStore.open(root));
      await expect(service.capture({
        increment_id: 'increment_security', increment_revision: 1,
        capture_event: 'article_finalized', capture_kind: 'automatic_terminal',
        workspace_identity_digest: digest,
        artifacts: [{
          workspace_relative_path, role: 'canonical_article', media_type: 'text/markdown',
          canonical: true, privacy_classification: 'internal'
        }],
        source_refs: ['package:security'], privacy_classification: 'internal'
      })).rejects.toMatchObject({ code: 'WORKSPACE_PATH_INVALID' });
    }
  );

  it('rejects a source reached through a junction', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'rph-evidence-link-'));
    const root = join(parent, 'workspace');
    const outside = join(parent, 'outside');
    await mkdir(outside);
    await writeFile(join(outside, 'article.md'), '# outside', 'utf8');
    const store = await WorkspaceStore.open(root);
    await symlink(outside, join(root, 'articles', 'outside-link'), 'junction');
    const service = new ResearchEvidenceService(store);
    await expect(service.capture({
      increment_id: 'increment_security', increment_revision: 1,
      capture_event: 'article_finalized', capture_kind: 'automatic_terminal',
      workspace_identity_digest: digest,
      artifacts: [{
        workspace_relative_path: 'articles/outside-link/article.md',
        role: 'canonical_article', media_type: 'text/markdown', canonical: true,
        privacy_classification: 'internal'
      }],
      source_refs: ['package:security'], privacy_classification: 'internal'
    })).rejects.toMatchObject({ code: 'WORKSPACE_PATH_INVALID' });
  });

  it('does not accept browser login-state roles or files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-evidence-browser-state-'));
    const store = await WorkspaceStore.open(root);
    await store.writeNew('articles/runtime/cookies.json', { cookie: 'session-secret' });
    const service = new ResearchEvidenceService(store);
    await expect(service.capture({
      increment_id: 'increment_security', increment_revision: 1,
      capture_event: 'article_finalized', capture_kind: 'automatic_terminal',
      workspace_identity_digest: digest,
      artifacts: [{
        workspace_relative_path: 'articles/runtime/cookies.json',
        role: 'browser_session' as never, media_type: 'application/json', canonical: false,
        privacy_classification: 'restricted'
      }],
      source_refs: ['package:security'], privacy_classification: 'restricted'
    })).rejects.toMatchObject({ code: 'PRIVACY_GATE_BLOCKED' });
  });
});
