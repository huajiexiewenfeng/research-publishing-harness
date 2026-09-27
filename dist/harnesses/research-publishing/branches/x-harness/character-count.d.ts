export interface PostTextResult {
    readonly valid: boolean;
    readonly weightedLength: number;
    readonly maxWeightedLength: number | null;
    readonly permillage: number | null;
}
/** null removes the local length cap; platform/account restrictions still apply. */
export declare function validatePostText(text: string, maxWeightedLength?: number | null): PostTextResult;
