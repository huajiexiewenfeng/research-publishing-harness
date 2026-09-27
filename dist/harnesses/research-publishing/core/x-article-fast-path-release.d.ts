declare const FAST_PATH_PROTOCOL: "x-article-materialization/v3.4";
export interface XArticleFastPathReleaseSetV1 {
    readonly harness_protocol: typeof FAST_PATH_PROTOCOL;
    readonly registry_protocol: typeof FAST_PATH_PROTOCOL;
    readonly skill_protocol: typeof FAST_PATH_PROTOCOL;
    readonly browser_host_protocol: typeof FAST_PATH_PROTOCOL;
}
export declare function assertXArticleFastPathReleaseSet(releaseSet: XArticleFastPathReleaseSetV1): void;
export {};
