import type { VisualAssetRef } from './types.js';
import type { WorkspaceStore } from './workspace-store.js';
export declare const VISUAL_NORMALIZATION_VERSION = "sharp-0.34.4-v1";
export interface VisualImportLimits {
    readonly maxInputBytes: number;
    readonly maxWidth: number;
    readonly maxHeight: number;
    readonly maxPixels: number;
}
export interface AttachVisualInput {
    readonly runId: string;
    readonly candidateId: string;
    readonly assetId: string;
    readonly slotId: string;
    readonly sourcePath: string;
    readonly altText: string;
    readonly claimRefs: readonly string[];
    readonly provenance: {
        readonly method: 'deterministic' | 'generated' | 'manual';
        readonly tool: string | null;
    };
    readonly editableSourcePath?: string;
}
export interface VisualCandidate {
    readonly candidate_id: string;
    readonly slot_id: string;
    readonly asset: VisualAssetRef;
    readonly staged_relative_path: string;
    readonly width: number;
    readonly height: number;
    readonly byte_size: number;
    readonly normalization_version: string;
    readonly provenance: {
        readonly method: 'deterministic' | 'generated' | 'manual';
        readonly tool: string | null;
        readonly source_digest: string;
    };
    readonly editable_source: {
        readonly staged_relative_path: string;
        readonly relative_path: string;
        readonly digest: `sha256:${string}`;
    } | null;
}
export declare class VisualAssetImporter {
    private readonly store;
    private readonly limits;
    constructor(store: WorkspaceStore, limits?: VisualImportLimits);
    attach(input: AttachVisualInput): Promise<VisualCandidate>;
    private importEditableSource;
}
export declare function verifyPackageVisualAsset(store: WorkspaceStore, packageRoot: string, asset: VisualAssetRef): Promise<void>;
