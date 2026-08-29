import type { ResearchRuntimeRecordType } from './research-memory-types.js';
type FrontmatterValue = string | number | boolean | readonly string[];
export interface RenderResearchRecordInput {
    readonly record_type: ResearchRuntimeRecordType;
    readonly frontmatter: Readonly<Record<string, FrontmatterValue>>;
    readonly body: string;
}
export declare function renderResearchRecord(input: RenderResearchRecordInput): string;
export {};
