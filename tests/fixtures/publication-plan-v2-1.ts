import { createPublicationPlanV2_1 } from '../../harnesses/research-publishing/core/publication-plan-v2-1.js';

export const visualAssetFixture = {
  asset_id: 'asset_cover', relative_path: 'assets/asset_cover.png',
  digest: `sha256:${'b'.repeat(64)}` as const, mime_type: 'image/png' as const,
  alt_text: 'A boundary around an evidence-backed runtime.', claim_refs: ['claim_verified']
};

export function publicationPlanV2_1Fixture() {
  return createPublicationPlanV2_1({
    planId: 'plan_visual_1', runId: 'run_visual_1', targetAccount: '@runtime_ai',
    mode: 'thread', targetPost: null,
    items: [
      { ordinal: 1, text: 'Runtime boundaries matter.', attachments: [visualAssetFixture] },
      { ordinal: 2, text: 'Evidence must survive.', reply_to: 'previous', attachments: [] }
    ],
    articlePackage: { root: 'articles/visual/run_1', digest: `sha256:${'a'.repeat(64)}` },
    authorizedAsset: visualAssetFixture,
    plannedAt: '2026-08-20T03:00:00.000Z', provenance: { handoff_id: 'handoff_1' }
  });
}
