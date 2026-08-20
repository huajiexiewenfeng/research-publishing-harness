import { describe, expect, it } from 'vitest';

import { createPublicationPlanV2_1 } from '../../harnesses/research-publishing/core/publication-plan-v2-1.js';
import { publicationPlanV2_1Fixture, visualAssetFixture } from '../fixtures/publication-plan-v2-1.js';

describe('PublicationPlanV2.1', () => {
  it('binds an explicitly authorized Article asset at Thread ordinal one', () => {
    const plan = publicationPlanV2_1Fixture();
    expect(plan.schema_version).toBe('2.1');
    expect(plan.intent).not.toHaveProperty('media');
    expect(plan.items[0]?.attachments[0]).toEqual(visualAssetFixture);
    expect(plan.plan_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('rejects multiple images, a later Thread attachment, or an unauthorized asset', () => {
    const base = publicationPlanV2_1Fixture();
    const input = {
      planId: 'bad', runId: base.run_id, targetAccount: base.intent.target_account,
      mode: 'thread' as const, targetPost: null, articlePackage: base.article_package,
      authorizedAsset: visualAssetFixture, plannedAt: base.planned_at, provenance: base.provenance
    };
    expect(() => createPublicationPlanV2_1({ ...input, items: [
      { ordinal: 1, text: 'One', attachments: [visualAssetFixture] },
      { ordinal: 2, text: 'Two', reply_to: 'previous', attachments: [visualAssetFixture] }
    ] })).toThrowError(expect.objectContaining({ code: 'X_ATTACHMENT_MISMATCH' }));
    expect(() => createPublicationPlanV2_1({ ...input, authorizedAsset: { ...visualAssetFixture, asset_id: 'other' }, items: [
      { ordinal: 1, text: 'One', attachments: [visualAssetFixture] },
      { ordinal: 2, text: 'Two', reply_to: 'previous', attachments: [] }
    ] })).toThrowError(expect.objectContaining({ code: 'VISUAL_DIGEST_MISMATCH' }));
  });

  it('changes the digest when Alt Text, attachment ordinal, or image digest changes', () => {
    const first = publicationPlanV2_1Fixture();
    const changedAsset = { ...visualAssetFixture, alt_text: 'Changed Alt Text' };
    const second = createPublicationPlanV2_1({
      planId: 'plan_2', runId: first.run_id, targetAccount: first.intent.target_account,
      mode: 'thread', targetPost: null,
      items: [
        { ordinal: 1, text: first.items[0]!.text, attachments: [changedAsset] },
        { ordinal: 2, text: first.items[1]!.text, reply_to: 'previous', attachments: [] }
      ], articlePackage: first.article_package, authorizedAsset: changedAsset,
      plannedAt: first.planned_at, provenance: first.provenance
    });
    expect(second.plan_digest).not.toBe(first.plan_digest);
  });
});
