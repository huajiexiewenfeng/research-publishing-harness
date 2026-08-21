import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { XArticleBrowserAdapter } from '../../harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.js';
import { XArticleWeb2026_08Contract } from '../../harnesses/research-publishing/adapters/x/article-browser/contracts/x-article-web-2026-08.js';
import { approveXArticlePublication } from '../../harnesses/research-publishing/core/x-article-approval.js';
import { createXArticlePublicationPlan } from '../../harnesses/research-publishing/core/x-article-publication-plan.js';
import { validateContract } from '../../harnesses/research-publishing/core/schema-validator.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

const plan = createXArticlePublicationPlan({
  planId: 'plan_secure', runId: 'run_secure', targetAccount: '@Glen56121',
  articlePackage: { root: 'articles/safe/article_1', digest: `sha256:${'a'.repeat(64)}` },
  document: { schema_version: '1.0', title: 'Safe', cover_asset_id: null, blocks: [] },
  visuals: [], plannedAt: '2026-08-21T09:00:00.000Z', provenance: {}
});
const approval = approveXArticlePublication(plan, 'human', 60_000, new Date('2026-08-21T09:00:00.000Z'));

const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;
const importAnchor = {
  anchor_id: 'anchor_asset_diagram_2', asset_id: 'asset_diagram', block_ordinal: 2,
  marker: 'RPH_VISUAL_ANCHOR:asset_diagram:2'
} as const;
const importTemplate = {
  schema_version: '1.0', source_document_digest: DIGEST_A,
  blocks: [
    { kind: 'paragraph', runs: [{ text: 'Import this article.', marks: [], link: null }] },
    { kind: 'visual_anchor', anchor_id: importAnchor.anchor_id, marker: importAnchor.marker }
  ],
  anchors: [importAnchor], template_digest: DIGEST_B
} as const;
const visualAsset = {
  asset_id: 'asset_diagram', relative_path: 'assets/asset_diagram.png', digest: DIGEST_A,
  mime_type: 'image/png', alt_text: 'Architecture diagram', claim_refs: ['claim_1']
} as const;

function importCommand(payload: object): object {
  return {
    schema_version: '1.0', command_id: 'command_import_1', execution_id: 'execution_import_1',
    run_id: 'run_import_1', draft_id: '2090731994279755776',
    kind: (payload as { kind: string }).kind, purpose: 'article_import',
    expected_page_revision: DIGEST_A, allowed_origin: 'https://x.com', side_effect: 'write',
    payload, payload_digest: DIGEST_B, issued_at: '2026-08-21T09:00:00.000Z'
  };
}

describe('X Article Browser security', () => {
  it('rejects an unsafe Package root even when passed as a typed Plan', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-security-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      now: () => new Date('2026-08-21T09:00:10.000Z')
    });
    const unsafe = {
      ...plan,
      intent: { ...plan.intent, article_package: { ...plan.intent.article_package, root: '../escape' } }
    };
    await expect(adapter.start(unsafe, approval, {
      executor: 'codex-chrome', executor_version: 'test', browser_family: 'chrome',
      capabilities: [], observed_at: '2026-08-21T09:00:00.000Z'
    })).rejects.toMatchObject({ code: 'WORKSPACE_PATH_INVALID' });
  });

  it('rejects a missing semantic Browser capability before creating an execution', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-security-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      now: () => new Date('2026-08-21T09:00:10.000Z')
    });
    await expect(adapter.start(plan, approval, {
      executor: 'codex-chrome', executor_version: 'test', browser_family: 'chrome',
      capabilities: ['observe_article_page'], observed_at: '2026-08-21T09:00:00.000Z'
    })).rejects.toMatchObject({ code: 'BROWSER_EXECUTOR_INCOMPATIBLE' });
  });

  it('accepts versioned article document import and visual anchor replacement commands', () => {
    const importDocument = importCommand({
      kind: 'import_article_document', target_ref: 'article_body', package_root: 'articles/runtime/article_1',
      package_digest: DIGEST_A, template: importTemplate
    });
    const replaceAnchor = importCommand({
      kind: 'replace_article_visual_anchor', target_ref: 'article_body', anchor: importAnchor,
      package_root: 'articles/runtime/article_1', package_digest: DIGEST_A, asset: visualAsset
    });

    expect(validateContract('x-article-browser-command', importDocument)).toEqual(importDocument);
    expect(validateContract('x-article-browser-command', replaceAnchor)).toEqual(replaceAnchor);
  });

  it('rejects an import command with a malformed template digest', () => {
    const command = importCommand({
      kind: 'import_article_document', target_ref: 'article_body', package_root: 'articles/runtime/article_1',
      package_digest: DIGEST_A, template: { ...importTemplate, template_digest: 'not-a-digest' }
    });

    expect(() => validateContract('x-article-browser-command', command))
      .toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });

  it('rejects a visual anchor replacement command with an unsafe anchor ID', () => {
    const command = importCommand({
      kind: 'replace_article_visual_anchor', target_ref: 'article_body',
      anchor: { ...importAnchor, anchor_id: '../anchor' }, package_root: 'articles/runtime/article_1',
      package_digest: DIGEST_A, asset: visualAsset
    });

    expect(() => validateContract('x-article-browser-command', command))
      .toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });

  it('rejects a visual anchor replacement command with an absolute asset path', () => {
    const command = importCommand({
      kind: 'replace_article_visual_anchor', target_ref: 'article_body', anchor: importAnchor,
      package_root: 'articles/runtime/article_1', package_digest: DIGEST_A,
      asset: { ...visualAsset, relative_path: 'C:/outside/asset_diagram.png' }
    });

    expect(() => validateContract('x-article-browser-command', command))
      .toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });

  it('rejects an import command without a Package digest', () => {
    const command = importCommand({
      kind: 'import_article_document', target_ref: 'article_body', package_root: 'articles/runtime/article_1',
      template: importTemplate
    });

    expect(() => validateContract('x-article-browser-command', command))
      .toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });
});
