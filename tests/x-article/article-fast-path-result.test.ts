import { describe, expect, it } from 'vitest';

import {
  createXArticleFastPathResult,
  verifyXArticleFastPathResult
} from '../../harnesses/research-publishing/core/x-article-materialization.js';

const input = {
  execution_id: 'execution_fast_result_1',
  draft_id: '2092851979932647424',
  draft_url: 'https://x.com/compose/articles/edit/2092851979932647424',
  audit_digest: `sha256:${'a'.repeat(64)}` as `sha256:${string}`,
  materialization_digest: `sha256:${'b'.repeat(64)}` as `sha256:${string}`,
  final_revision: `sha256:${'c'.repeat(64)}` as `sha256:${string}`,
  elapsed_seconds: 91,
  cover: { expected: 1 as const, completed: 1 as const, alt: 'unobservable' as const },
  inline_images: { expected: 3, completed: 3 },
  alt: { expected: 4, verified: 3 },
  recovery_count: 1 as const,
  preview_command_count: 0 as const,
  publish_command_count: 0 as const,
  checkpoint_path: 'runs/execution_fast_result_1/x-article/browser/materialization-checkpoint.json',
  completed_at: '2026-08-21T09:01:31.000Z'
};

describe('X Article Fast Path result', () => {
  it('creates and verifies immutable reconciled Draft evidence', () => {
    const result = createXArticleFastPathResult(input);

    expect(result).toMatchObject({
      schema_version: 'x-article-fast-path-result/v1',
      protocol: 'x-article-materialization/v3.4',
      state: 'draft_reconciled',
      inline_images: { expected: 3, completed: 3 },
      preview_command_count: 0,
      publish_command_count: 0
    });
    expect(() => verifyXArticleFastPathResult(result)).not.toThrow();
  });

  it('rejects incomplete media, extra recovery, Preview, and Publish evidence', () => {
    expect(() => createXArticleFastPathResult({
      ...input,
      inline_images: { expected: 3, completed: 2 }
    })).toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
    expect(() => createXArticleFastPathResult({ ...input, recovery_count: 2 as never }))
      .toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
    expect(() => createXArticleFastPathResult({ ...input, preview_command_count: 1 as never }))
      .toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
    expect(() => createXArticleFastPathResult({ ...input, publish_command_count: 1 as never }))
      .toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });

  it('detects result digest drift', () => {
    const result = createXArticleFastPathResult(input);

    expect(() => verifyXArticleFastPathResult({
      ...result,
      elapsed_seconds: result.elapsed_seconds + 1
    })).toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });
});
