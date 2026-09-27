declare const protocol: "x-article-materialization/v3.4";
declare const hostProtocol: "x-article-host-bridge/v3.5";
export interface XArticleFastPathAcceptanceScenario {
    readonly name: '0' | '1' | '3' | '10' | 'disconnect_recovery';
    readonly ok: boolean;
    readonly confirmation_count: 1;
    readonly human_browser_operation_count: 0;
    readonly terminal_state: 'draft_reconciled';
    readonly elapsed_seconds: number;
    readonly cover: {
        readonly expected: 1;
        readonly completed: number;
        readonly alt: 'unobservable';
    };
    readonly inline_images: {
        readonly expected: number;
        readonly completed: number;
    };
    readonly alt: {
        readonly expected: number;
        readonly completed: number;
    };
    readonly removed_editorial_metadata_absent: boolean;
    readonly visual_anchors_absent: boolean;
    readonly recovery_count: 0 | 1;
    readonly duplicate_draft_count: number;
    readonly duplicate_upload_count: number;
    readonly duplicate_write_count: number;
    readonly preview_command_count: number;
    readonly publish_command_count: number;
    readonly issued_command_kinds: readonly string[];
    readonly host_dispatch_count: number;
}
export interface XArticleFastPathAcceptanceMatrix {
    readonly ok: boolean;
    readonly protocol: typeof protocol;
    readonly host_protocol: typeof hostProtocol;
    readonly network: 'unused';
    readonly scenarios: readonly XArticleFastPathAcceptanceScenario[];
}
export declare function runXArticleFastPathAcceptanceMatrix(): Promise<XArticleFastPathAcceptanceMatrix>;
export {};
