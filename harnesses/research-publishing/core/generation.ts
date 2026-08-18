import { validateContract } from './schema-validator.js';
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

export function createGenerationTask(
  run: GenerationRun,
  packageValue: ResearchContentPackage,
  constraints: readonly string[]
): GenerationTask {
  const sourceSummaries = packageValue.sources
    .filter(
      (source): source is typeof source & { publication_policy: 'cite' | 'paraphrase_only' } =>
        source.publication_policy !== 'internal_only'
    )
    .map((source) => ({
      source_id: source.source_id,
      summary:
        packageValue.evidence
          .filter((evidence) => evidence.source_ref === source.source_id)
          .map((evidence) => evidence.summary)
          .join(' ') || `Public source for ${source.source_id}`,
      publication_policy: source.publication_policy
    }));

  return validateContract<GenerationTask>('generation-task', {
    schema_version: '1.0',
    task_id: `${run.run_id}:${packageValue.package_id}:v${packageValue.version}`,
    run_id: run.run_id,
    package_id: packageValue.package_id,
    package_version: packageValue.version,
    branch: run.branch,
    mode: run.mode,
    language: run.language,
    thesis: packageValue.thesis.summary,
    claims: packageValue.claims.map((claim) => ({
      claim_id: claim.claim_id,
      statement: claim.statement,
      claim_status: claim.claim_status
    })),
    boundaries: packageValue.boundaries,
    source_summaries: sourceSummaries,
    constraints: [...constraints]
  });
}
