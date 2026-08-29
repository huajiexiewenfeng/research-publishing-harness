import { validateContract } from './schema-validator.js';
export function createGenerationTask(run, packageValue, constraints) {
    const sourceSummaries = packageValue.sources
        .filter((source) => source.publication_policy !== 'internal_only')
        .map((source) => ({
        source_id: source.source_id,
        summary: packageValue.evidence
            .filter((evidence) => evidence.source_ref === source.source_id)
            .map((evidence) => evidence.summary)
            .join(' ') || `Public source for ${source.source_id}`,
        publication_policy: source.publication_policy
    }));
    return validateContract('generation-task', {
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
//# sourceMappingURL=generation.js.map