import type { ClaimStatus, ResearchContentPackage, SourcePublicationPolicy } from './types.js';
export interface GenerationRun {
    readonly run_id: string;
    readonly branch: 'article' | 'x';
    readonly mode: string;
    readonly language: 'en' | 'zh-CN';
}
export interface GenerationTask {
    readonly schema_version: '1.0';
    readonly task_id: string;
    readonly run_id: string;
    readonly package_id: string;
    readonly package_version: number;
    readonly branch: 'article' | 'x';
    readonly mode: string;
    readonly language: 'en' | 'zh-CN';
    readonly thesis: string;
    readonly claims: ReadonlyArray<{
        readonly claim_id: string;
        readonly statement: string;
        readonly claim_status: ClaimStatus;
    }>;
    readonly boundaries: ResearchContentPackage['boundaries'];
    readonly source_summaries: ReadonlyArray<{
        readonly source_id: string;
        readonly summary: string;
        readonly publication_policy: Exclude<SourcePublicationPolicy, 'internal_only'>;
    }>;
    readonly constraints: readonly string[];
}
export declare function createGenerationTask(run: GenerationRun, packageValue: ResearchContentPackage, constraints: readonly string[]): GenerationTask;
