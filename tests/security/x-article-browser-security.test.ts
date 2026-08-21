import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { XArticleBrowserAdapter } from '../../harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.js';
import { XArticleWeb2026_08Contract } from '../../harnesses/research-publishing/adapters/x/article-browser/contracts/x-article-web-2026-08.js';
import { approveXArticlePublication } from '../../harnesses/research-publishing/core/x-article-approval.js';
import { createXArticlePublicationPlan } from '../../harnesses/research-publishing/core/x-article-publication-plan.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

const plan = createXArticlePublicationPlan({
  planId: 'plan_secure', runId: 'run_secure', targetAccount: '@Glen56121',
  articlePackage: { root: 'articles/safe/article_1', digest: `sha256:${'a'.repeat(64)}` },
  document: { schema_version: '1.0', title: 'Safe', cover_asset_id: null, blocks: [] },
  visuals: [], plannedAt: '2026-08-21T09:00:00.000Z', provenance: {}
});
const approval = approveXArticlePublication(plan, 'human', 60_000, new Date('2026-08-21T09:00:00.000Z'));

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
});
