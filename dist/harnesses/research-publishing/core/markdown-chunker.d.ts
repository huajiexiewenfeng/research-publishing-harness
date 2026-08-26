export type CanonicalTextResult = Readonly<{
    status: 'normalized';
    text: string;
}> | Readonly<{
    status: 'evidence_only';
    reason: 'non_text_media' | 'lossy_decode';
}>;
export interface CanonicalTextChunk {
    readonly ordinal: number;
    readonly text: string;
    readonly char_start: number;
    readonly char_end: number;
    readonly heading_path: readonly string[];
}
export declare function normalizeCanonicalUtf8(bytes: Uint8Array, declaredMediaType: string): CanonicalTextResult;
export declare function chunkCanonicalMarkdown(text: string, maxChars: number): readonly CanonicalTextChunk[];
