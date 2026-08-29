import { describe, expect, it } from 'vitest';

import { decideXArticleMediaAttempt } from '../../harnesses/research-publishing/adapters/x/article-browser/article-media-attempt-policy.js';
import type { XArticleStageProgressV1 } from '../../harnesses/research-publishing/core/x-article-materialization.js';

const assetId = 'asset-cover-shared-agent-knowledge';
const purpose = 'upload_article_cover';

function progress(
  observedEffect: XArticleStageProgressV1['observed_effect'],
  index = 1,
  overrides: Partial<XArticleStageProgressV1> = {}
): XArticleStageProgressV1 {
  return {
    schema_version: 'x-article-materialization-progress/v1',
    execution_id: 'execution_media_attempt_1',
    stage: `${purpose}#command_${index}`,
    asset_id: assetId,
    elapsed_seconds: 1,
    waiting_for: null,
    retry_count: 0,
    observed_effect: observedEffect,
    recorded_at: `2026-08-29T08:00:0${index}.000Z`,
    ...overrides
  };
}

describe('X Article media attempt policy', () => {
  it('allows the first write when no matching progress exists', () => {
    expect(decideXArticleMediaAttempt({ progress: [], asset_id: assetId, purpose }))
      .toEqual({ kind: 'allow', attempt: 1 });
  });

  it('allows exactly one retry after a proven no-effect report', () => {
    expect(decideXArticleMediaAttempt({
      progress: [progress('none')], asset_id: assetId, purpose
    })).toEqual({ kind: 'allow', attempt: 2 });
  });

  it.each(['unknown', 'partial'] as const)(
    'blocks after a %s effect because a duplicate write cannot be excluded',
    (effect) => {
      expect(decideXArticleMediaAttempt({
        progress: [progress(effect)], asset_id: assetId, purpose
      })).toEqual({ kind: 'block', reason: 'effect_unknown' });
    }
  );

  it('blocks after two proven no-effect writes', () => {
    expect(decideXArticleMediaAttempt({
      progress: [progress('none'), progress('none', 2)], asset_id: assetId, purpose
    })).toEqual({ kind: 'block', reason: 'attempt_limit' });
  });

  it('blocks when the media is already complete', () => {
    expect(decideXArticleMediaAttempt({
      progress: [progress('complete')], asset_id: assetId, purpose
    })).toEqual({ kind: 'block', reason: 'already_complete' });
  });

  it('ignores progress for a different asset or command purpose', () => {
    expect(decideXArticleMediaAttempt({
      progress: [
        progress('unknown', 1, { asset_id: 'another_asset' }),
        progress('unknown', 2, { stage: 'replace_article_visual_anchor_44#command_2' })
      ],
      asset_id: assetId,
      purpose
    })).toEqual({ kind: 'allow', attempt: 1 });
  });
});
