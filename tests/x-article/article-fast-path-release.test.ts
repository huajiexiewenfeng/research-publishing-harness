import { describe, expect, it } from 'vitest';

import {
  assertXArticleFastPathReleaseSet,
  type XArticleFastPathReleaseSetV1
} from '../../harnesses/research-publishing/core/x-article-fast-path-release.js';

const releaseSet: XArticleFastPathReleaseSetV1 = {
  harness_protocol: 'x-article-materialization/v3.4',
  registry_protocol: 'x-article-materialization/v3.4',
  skill_protocol: 'x-article-materialization/v3.4',
  browser_host_protocol: 'x-article-materialization/v3.4'
};

describe('X Article Fast Path release set', () => {
  it('accepts an exact V3.4 release set without mutating it', () => {
    const before = structuredClone(releaseSet);

    expect(() => assertXArticleFastPathReleaseSet(releaseSet)).not.toThrow();
    expect(releaseSet).toEqual(before);
  });

  it.each([
    'harness_protocol',
    'registry_protocol',
    'skill_protocol',
    'browser_host_protocol'
  ] as const)('rejects a stale %s before execution', (component) => {
    const stale = { ...releaseSet, [component]: 'x-article-materialization/v3.3' };

    expect(() => assertXArticleFastPathReleaseSet(stale as XArticleFastPathReleaseSetV1))
      .toThrowError(expect.objectContaining({ code: 'ARTICLE_RUNTIME_VERSION_MISMATCH' }));
  });
});
