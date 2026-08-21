import { describe, expect, it } from 'vitest';

import {
  createXArticlePublicationPlan,
  type CreateXArticlePublicationPlanInput
} from '../../harnesses/research-publishing/core/x-article-publication-plan.js';
import {
  approveXArticlePublication,
  verifyXArticleApproval
} from '../../harnesses/research-publishing/core/x-article-approval.js';

const document = {
  schema_version: '1.0',
  title: 'Runtime boundary',
  cover_asset_id: null,
  blocks: [{
    kind: 'paragraph',
    runs: [{ text: 'Skills own semantics.', marks: [], link: null }]
  }]
} as const;

function input(overrides: Partial<CreateXArticlePublicationPlanInput> = {}): CreateXArticlePublicationPlanInput {
  return {
    planId: 'x_article_plan_1',
    runId: 'x_article_run_1',
    targetAccount: '@Glen56121',
    articlePackage: {
      root: 'articles/runtime/article_1',
      digest: `sha256:${'a'.repeat(64)}`
    },
    document,
    visuals: [],
    plannedAt: '2026-08-21T09:00:00.000Z',
    provenance: { article_run_id: 'article_1' },
    ...overrides
  };
}

describe('X Article Publication Plan and Approval', () => {
  it('keeps the Plan Digest stable across planning times', () => {
    const first = createXArticlePublicationPlan(input());
    const second = createXArticlePublicationPlan(input({ plannedAt: '2026-08-22T09:00:00.000Z' }));
    expect(first.plan_digest).toBe(second.plan_digest);
  });

  it('changes the Plan Digest for visible content changes', () => {
    const first = createXArticlePublicationPlan(input());
    const changed = createXArticlePublicationPlan(input({
      document: { ...document, title: 'Changed boundary' }
    }));
    expect(changed.plan_digest).not.toBe(first.plan_digest);
  });

  it('binds one approval to the complete Plan, account, audience, and publish_once action', () => {
    const plan = createXArticlePublicationPlan(input());
    const now = new Date('2026-08-21T09:01:00.000Z');
    const approval = approveXArticlePublication(plan, 'human:Glen56121', 300_000, now, () => 'approval_1');
    expect(() => verifyXArticleApproval(plan, approval, new Date('2026-08-21T09:02:00.000Z'))).not.toThrow();
    expect(() => verifyXArticleApproval(plan, { ...approval, target_account: '@other' }, now))
      .toThrowError(expect.objectContaining({ code: 'APPROVAL_STALE' }));
    expect(() => verifyXArticleApproval(plan, approval, new Date('2026-08-21T10:00:00.000Z')))
      .toThrowError(expect.objectContaining({ code: 'APPROVAL_STALE' }));
  });

  it('rejects unsafe package roots and inconsistent visual bindings', () => {
    expect(() => createXArticlePublicationPlan(input({
      articlePackage: { root: '../escape', digest: `sha256:${'a'.repeat(64)}` }
    }))).toThrowError(expect.objectContaining({ code: 'WORKSPACE_PATH_INVALID' }));
    expect(() => createXArticlePublicationPlan(input({
      document: { ...document, cover_asset_id: 'missing_cover' }
    }))).toThrowError(expect.objectContaining({ code: 'ARTICLE_ASSET_MISMATCH' }));
  });
});
