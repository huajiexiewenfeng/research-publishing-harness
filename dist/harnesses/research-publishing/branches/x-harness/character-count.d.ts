export interface PostTextResult {
    readonly valid: boolean;
    readonly weightedLength: number;
    readonly maxWeightedLength: number;
    readonly permillage: number;
}
export declare function validatePostText(text: string, maxWeightedLength?: number): PostTextResult;
