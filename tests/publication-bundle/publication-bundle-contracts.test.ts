import { describe, expect, it } from 'vitest';

import {
  assertPublicationBundleApproval,
  assertPublicationBundlePlan,
  createPublicationBundleApproval,
  createPublicationBundlePlan,
  createPublicationBundleReceipt,
  PUBLICATION_BUNDLE_TTL
} from '../../harnesses/research-publishing/core/publication-bundle-contracts.js';
import { createWeeklyPublicationBundleBinding } from '../../harnesses/research-publishing/core/research-program-contracts.js';
import { createXArticlePublicationPlan } from '../../harnesses/research-publishing/core/x-article-publication-plan.js';

const digest = (character: string): `sha256:${string}` =>
  `sha256:${character.repeat(64)}`;

const articlePlan = createXArticlePublicationPlan({
  planId: 'x_article_plan_bundle_1',
  runId: 'x_article_run_bundle_1',
  targetAccount: '@Glen56121',
  articlePackage: {
    root: 'runs/article_run_1/article',
    digest: digest('d')
  },
  document: {
    schema_version: '1.0',
    title: 'The Skill and Runtime boundary',
    cover_asset_id: null,
    blocks: [{
      kind: 'paragraph',
      runs: [{ text: 'Skills own semantics.', marks: [], link: null }]
    }]
  },
  visuals: [],
  plannedAt: '2026-08-24T01:00:00.000Z',
  provenance: { article_run_id: 'article_run_1' }
});

const planInput = {
  bundle_id: 'bundle_week_01',
  cycle_id: 'cycle_week_01',
  cycle_ref: {
    path: 'program/weeks/cycle_week_01/cycle.json',
    digest: digest('a')
  },
  selection_ref: {
    path: 'program/weeks/cycle_week_01/selection.json',
    digest: digest('b')
  },
  research_content_package_ref: {
    path: 'program/weeks/cycle_week_01/package.json',
    digest: digest('c')
  },
  canonical_article_package: {
    root: 'runs/article_run_1/article',
    package_digest: digest('d'),
    package_ref: {
      path: 'runs/article_run_1/article/package-ref.json',
      digest: digest('e')
    }
  },
  article_plan: articlePlan,
  single_intent: {
    run_id: 'x_single_run_bundle_1',
    target_account: '@Glen56121',
    language: 'en' as const,
    content_type: 'anchor' as const,
    text_template: 'Read the complete boundary argument: {{X_ARTICLE_URL}}',
    claim_refs: ['claim_boundary_1'],
    visual_asset: null,
    article_package: {
      root: 'runs/article_run_1/article',
      digest: digest('d')
    }
  },
  planned_at: '2026-08-24T01:05:00.000Z'
};

describe('Publication Bundle contracts', () => {
  it.each([
    'Read the article',
    'Read {{X_ARTICLE_URL}} and mirror {{X_ARTICLE_URL}}',
    'Read {{UNKNOWN_URL}}'
  ])('rejects invalid Single template %s', (text_template) => {
    expect(() => createPublicationBundlePlan({
      ...planInput,
      single_intent: { ...planInput.single_intent, text_template }
    })).toThrowError(/X_ARTICLE_URL/);
  });

  it.each([599_999, 86_400_001])(
    'rejects authorization TTL %d',
    (authorization_ttl_ms) => {
      expect(() => createPublicationBundlePlan({ ...planInput, authorization_ttl_ms }))
        .toThrowError(/authorization TTL/);
    }
  );

  it('locks the default TTL and every publication input in a self-excluding digest', () => {
    const plan = createPublicationBundlePlan(planInput);
    expect(plan.authorization_ttl_ms).toBe(PUBLICATION_BUNDLE_TTL.default_ms);
    expect(plan.bundle_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(() => assertPublicationBundlePlan({
      ...plan,
      authorization_ttl_ms: plan.authorization_ttl_ms + 1
    })).toThrowError(/stale/);
  });

  it('derives Approval expiry only from the locked Plan TTL', () => {
    const plan = createPublicationBundlePlan({ ...planInput, authorization_ttl_ms: 900_000 });
    const now = new Date('2026-08-24T02:00:00.000Z');
    const approval = createPublicationBundleApproval(plan, {
      bundle_id: plan.bundle_id,
      confirmed_bundle_digest: plan.bundle_digest,
      approved_by: 'human:Glen56121'
    }, now, 'bundle_approval_1');
    expect(Date.parse(approval.expires_at) - Date.parse(approval.approved_at)).toBe(900_000);
    expect(approval).not.toHaveProperty('ttl_ms');
  });

  it('rejects Approval expiry drift and expiry at the verification instant', () => {
    const plan = createPublicationBundlePlan({ ...planInput, authorization_ttl_ms: 900_000 });
    const approval = createPublicationBundleApproval(plan, {
      bundle_id: plan.bundle_id,
      confirmed_bundle_digest: plan.bundle_digest,
      approved_by: 'human:Glen56121'
    }, new Date('2026-08-24T02:00:00.000Z'), 'bundle_approval_1');
    expect(() => assertPublicationBundleApproval(plan, {
      ...approval,
      expires_at: '2026-08-24T02:20:00.000Z'
    })).toThrowError(/stale/);
    expect(() => assertPublicationBundleApproval(
      plan,
      approval,
      new Date(approval.expires_at)
    )).toThrowError(/expired/);
  });

  it('creates an exact Weekly Cycle to Bundle binding', () => {
    const plan = createPublicationBundlePlan(planInput);
    const binding = createWeeklyPublicationBundleBinding({
      cycle_ref: plan.cycle_ref,
      selection_ref: plan.selection_ref,
      research_content_package_ref: plan.research_content_package_ref,
      article_package_ref: plan.canonical_article_package.package_ref,
      bundle_plan_ref: {
        path: `runs/${plan.bundle_id}/publication-bundle/plan.json`,
        digest: plan.bundle_digest
      },
      bound_at: '2026-08-24T01:06:00.000Z'
    });
    expect(binding.bundle_plan_ref.digest).toBe(plan.bundle_digest);
    expect(binding.binding_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('rejects an Article Package ref that escapes the Workspace', () => {
    const plan = createPublicationBundlePlan(planInput);
    expect(() => createWeeklyPublicationBundleBinding({
      cycle_ref: plan.cycle_ref,
      selection_ref: plan.selection_ref,
      research_content_package_ref: plan.research_content_package_ref,
      article_package_ref: {
        path: '../outside/package-ref.json',
        digest: digest('e')
      },
      bundle_plan_ref: {
        path: `runs/${plan.bundle_id}/publication-bundle/plan.json`,
        digest: plan.bundle_digest
      },
      bound_at: '2026-08-24T01:06:00.000Z'
    })).toThrowError(/workspace-relative/);
  });

  it('declares completed Receipt status and both child Plan and Receipt refs', () => {
    const plan = createPublicationBundlePlan(planInput);
    const approval = createPublicationBundleApproval(plan, {
      bundle_id: plan.bundle_id,
      confirmed_bundle_digest: plan.bundle_digest,
      approved_by: 'human:Glen56121'
    }, new Date('2026-08-24T02:00:00.000Z'), 'bundle_approval_1');
    const receipt = createPublicationBundleReceipt({
      bundle_id: plan.bundle_id,
      cycle_ref: plan.cycle_ref,
      bundle_plan_ref: { path: 'runs/bundle_week_01/publication-bundle/plan.json', digest: plan.bundle_digest },
      bundle_approval_ref: { path: 'runs/bundle_week_01/publication-bundle/approval.json', digest: digest('f') },
      article: {
        plan_ref: { path: 'runs/x_article_run_bundle_1/x-article/publication-plan-v1.json', digest: digest('1') },
        plan_digest: articlePlan.plan_digest as `sha256:${string}`,
        receipt_ref: { path: 'runs/article_execution_1/x-article/browser/receipt.json', digest: digest('2') },
        receipt_digest: digest('3'),
        status: 'published',
        public_url: 'https://x.com/Glen56121/article/2091000000000000000'
      },
      single: {
        plan_ref: { path: 'runs/x_single_run_bundle_1/x/browser/single_execution_1/publication-plan-v2.json', digest: digest('4') },
        plan_digest: digest('5'),
        receipt_ref: { path: 'runs/x_single_run_bundle_1/x/browser/single_execution_1/receipt-v2.json', digest: digest('6') },
        receipt_digest: digest('7'),
        status: 'finalized',
        public_url: 'https://x.com/Glen56121/status/2091000000000000001'
      },
      issued_at: '2026-08-24T03:00:00.000Z'
    });
    expect(receipt).toMatchObject({
      status: 'completed',
      bundle_approval_ref: expect.objectContaining({ path: expect.any(String) }),
      article: { plan_ref: expect.any(Object), receipt_ref: expect.any(Object) },
      single: { plan_ref: expect.any(Object), receipt_ref: expect.any(Object) }
    });
    expect(receipt.public_urls).toEqual([
      'https://x.com/Glen56121/article/2091000000000000000',
      'https://x.com/Glen56121/status/2091000000000000001'
    ]);
    expect(approval.expires_at).toBe('2026-08-24T04:00:00.000Z');
  });
});
