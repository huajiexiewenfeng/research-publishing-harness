import { HarnessError } from './errors.js';
const FAST_PATH_PROTOCOL = 'x-article-materialization/v3.4';
export function assertXArticleFastPathReleaseSet(releaseSet) {
    const exact = releaseSet !== null
        && typeof releaseSet === 'object'
        && releaseSet.harness_protocol === FAST_PATH_PROTOCOL
        && releaseSet.registry_protocol === FAST_PATH_PROTOCOL
        && releaseSet.skill_protocol === FAST_PATH_PROTOCOL
        && releaseSet.browser_host_protocol === FAST_PATH_PROTOCOL;
    if (!exact) {
        throw new HarnessError('ARTICLE_RUNTIME_VERSION_MISMATCH', 'X Article Fast Path requires one coherent x-article-materialization/v3.4 release set');
    }
}
//# sourceMappingURL=x-article-fast-path-release.js.map