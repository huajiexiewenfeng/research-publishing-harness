import { HarnessError } from './errors.js';

const FAST_PATH_PROTOCOL = 'x-article-materialization/v3.4' as const;

export interface XArticleFastPathReleaseSetV1 {
  readonly harness_protocol: typeof FAST_PATH_PROTOCOL;
  readonly registry_protocol: typeof FAST_PATH_PROTOCOL;
  readonly skill_protocol: typeof FAST_PATH_PROTOCOL;
  readonly browser_host_protocol: typeof FAST_PATH_PROTOCOL;
}

export function assertXArticleFastPathReleaseSet(
  releaseSet: XArticleFastPathReleaseSetV1
): void {
  const exact =
    releaseSet !== null
    && typeof releaseSet === 'object'
    && releaseSet.harness_protocol === FAST_PATH_PROTOCOL
    && releaseSet.registry_protocol === FAST_PATH_PROTOCOL
    && releaseSet.skill_protocol === FAST_PATH_PROTOCOL
    && releaseSet.browser_host_protocol === FAST_PATH_PROTOCOL;
  if (!exact) {
    throw new HarnessError(
      'ARTICLE_RUNTIME_VERSION_MISMATCH',
      'X Article Fast Path requires one coherent x-article-materialization/v3.4 release set'
    );
  }
}
