import { describe, expect, it } from 'vitest';

import {
  createXArticlePublicationPreflight
} from '../../harnesses/research-publishing/branches/x-article-harness/article-publication-preflight.js';
import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
import {
  confirmXArticleFastPath,
  createXArticleFastPathAudit,
  verifyXArticleFastPathConfirmation
} from '../../harnesses/research-publishing/core/x-article-fast-path.js';
import type { VisualAssetRef } from '../../harnesses/research-publishing/core/types.js';
import {
  createXArticlePublicationPlan,
  type XArticleVisualBindingV1
} from '../../harnesses/research-publishing/core/x-article-publication-plan.js';

function asset(assetId: string, altText: string): VisualAssetRef {
  return {
    asset_id: assetId,
    relative_path: `assets/${assetId}.png`,
    digest: sha256({ asset_id: assetId }),
    mime_type: 'image/png',
    alt_text: altText,
    claim_refs: [`claim:${assetId}`]
  };
}

function auditFixture(target: { readonly kind: 'new' } | { readonly kind: 'existing'; readonly draft_id: string } = { kind: 'new' }) {
  const cover = asset('cover', 'Runtime layers');
  const diagram = asset('diagram', 'Skill and Runtime boundary');
  const sourceDocument = {
    schema_version: '1.0' as const,
    title: 'From Skill Memory to Shared Agent Knowledge',
    cover_asset_id: cover.asset_id,
    blocks: [
      { kind: 'paragraph' as const, runs: [{ text: 'Domain semantics belong in the Skill.', marks: [] as const, link: null }] },
      {
        kind: 'paragraph' as const,
        runs: [{
          text: 'Status: X Article Draft (v0.1) · Evidence review date: 2026-08-25',
          marks: ['italic'] as const,
          link: null
        }]
      },
      { kind: 'image' as const, asset_id: diagram.asset_id, alt_text: diagram.alt_text }
    ]
  };
  const sourceVisuals: readonly XArticleVisualBindingV1[] = [
    { asset: cover, placement: { kind: 'cover' } },
    { asset: diagram, placement: { kind: 'block', block_ordinal: 3 } }
  ];
  const preflight = createXArticlePublicationPreflight({
    document: sourceDocument,
    visuals: sourceVisuals
  });
  const plan = createXArticlePublicationPlan({
    planId: 'x_article_plan_fast_1',
    runId: 'x_article_run_fast_1',
    targetAccount: '@Glen56121',
    articlePackage: { root: 'articles/runtime/article_1', digest: `sha256:${'a'.repeat(64)}` },
    document: preflight.sanitized_document,
    visuals: [
      { asset: cover, placement: { kind: 'cover' } },
      { asset: diagram, placement: { kind: 'block', block_ordinal: 2 } }
    ],
    plannedAt: '2026-08-29T01:00:00.000Z',
    provenance: { article_run_id: 'article_1' }
  });
  return createXArticleFastPathAudit({
    preflight,
    publication_plan: plan,
    draft_target: target
  });
}

describe('X Article Fast Path Audit and confirmation', () => {
  it('locks the sanitized Diff, ordered visuals, target, budgets, and digest', () => {
    const audit = auditFixture();
    const { audit_digest: auditDigest, ...body } = audit;

    expect(audit).toMatchObject({
      schema_version: 'x-article-fast-path-audit/v1',
      protocol: 'x-article-materialization/v3.4',
      target_account: '@Glen56121',
      draft_target: { kind: 'new' },
      time_budget_seconds: 600,
      recovery_budget_seconds: 120,
      preflight: {
        removals: [{ block_ordinal: 2, reason: 'draft_status' }],
        cover: { asset_id: 'cover', alt_text: 'Runtime layers' },
        inline_assets: [{ asset_id: 'diagram', block_ordinal: 2, alt_text: 'Skill and Runtime boundary' }]
      }
    });
    expect(audit.publication_plan.intent.document).toEqual(audit.preflight.sanitized_document);
    expect(audit.publication_plan.intent.visuals[1]!.placement).toEqual({ kind: 'block', block_ordinal: 2 });
    expect(auditDigest).toBe(sha256(body));
  });

  it('binds Draft handling and every nested digest into the Audit', () => {
    const first = auditFixture({ kind: 'existing', draft_id: '2092452393472733510' });
    const repeated = auditFixture({ kind: 'existing', draft_id: '2092452393472733510' });
    const changedTarget = auditFixture({ kind: 'existing', draft_id: '2092452393472733511' });

    expect(repeated.audit_digest).toBe(first.audit_digest);
    expect(changedTarget.audit_digest).not.toBe(first.audit_digest);
    expect(() => createXArticleFastPathAudit({
      preflight: { ...first.preflight, preflight_digest: `sha256:${'f'.repeat(64)}` },
      publication_plan: first.publication_plan,
      draft_target: first.draft_target
    })).toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });

  it('creates a Draft-only confirmation whose digest excludes only itself', () => {
    const audit = auditFixture();
    const confirmation = confirmXArticleFastPath(
      audit,
      'human:Glen56121',
      300_000,
      new Date('2026-08-29T01:01:00.000Z')
    );
    const { confirmation_digest: confirmationDigest, ...body } = confirmation;

    expect(confirmation).toMatchObject({
      scope: 'materialize_draft_once',
      audit_digest: audit.audit_digest,
      target_account: '@Glen56121',
      confirmed_by: 'human:Glen56121'
    });
    expect(confirmation).not.toHaveProperty('scope', 'publish_once');
    expect(confirmationDigest).toBe(sha256(body));
    expect(() => verifyXArticleFastPathConfirmation(
      audit,
      confirmation,
      new Date('2026-08-29T01:02:00.000Z')
    )).not.toThrow();
  });

  it('rejects changed Audit, changed account, expired, or malformed confirmation', () => {
    const audit = auditFixture();
    const confirmation = confirmXArticleFastPath(
      audit,
      'human:Glen56121',
      60_000,
      new Date('2026-08-29T01:01:00.000Z')
    );

    expect(() => verifyXArticleFastPathConfirmation(
      auditFixture({ kind: 'existing', draft_id: 'draft_2' }),
      confirmation,
      new Date('2026-08-29T01:01:30.000Z')
    )).toThrowError(expect.objectContaining({ code: 'APPROVAL_STALE' }));
    expect(() => verifyXArticleFastPathConfirmation(
      audit,
      { ...confirmation, target_account: '@other' },
      new Date('2026-08-29T01:01:30.000Z')
    )).toThrowError(expect.objectContaining({ code: 'APPROVAL_STALE' }));
    expect(() => verifyXArticleFastPathConfirmation(
      audit,
      confirmation,
      new Date('2026-08-29T01:02:00.000Z')
    )).toThrowError(expect.objectContaining({ code: 'APPROVAL_STALE' }));
    expect(() => confirmXArticleFastPath(audit, ' ', 0))
      .toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });
});
