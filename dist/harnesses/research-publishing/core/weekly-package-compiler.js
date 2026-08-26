import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { validatePackageMemoryBinding } from './memory-package.js';
import { createWeeklyCandidateSet, createWeeklyCycleStatus, createWeeklyResearchCycle, createWeeklyTopicSelection } from './research-program-contracts.js';
import { STABLE_ID_PATTERN } from './research-memory-contracts.js';
import { validateContract } from './schema-validator.js';
function omitFields(value, fields) {
    const body = { ...value };
    for (const field of fields)
        delete body[field];
    return body;
}
function fail(message) {
    throw new HarnessError('APPROVAL_STALE', message);
}
export class WeeklyPackageCompiler {
    store;
    constructor(store) {
        this.store = store;
    }
    async compile(input) {
        if (!STABLE_ID_PATTERN.test(input.cycle_id)) {
            throw new HarnessError('CONTRACT_INVALID', 'Weekly Cycle id must be stable');
        }
        const root = `program/weeks/${input.cycle_id}`;
        const cycle = await this.readCycle(root, input.cycle_id);
        const candidateSet = await this.readCandidateSet(root, input.cycle_id);
        const selection = await this.readSelection(root, candidateSet);
        if (candidateSet.candidate_set_digest !== input.candidate_set_digest ||
            selection.selection_digest !== input.selection_digest ||
            selection.selected_brief_id !== input.selected_brief_id) {
            fail('Compile input does not bind the exact Candidate Set and Human Selection');
        }
        const selected = candidateSet.candidates.find((candidate) => candidate.brief_id === input.selected_brief_id);
        if (selected === undefined)
            fail('Human-selected Candidate Brief is absent');
        const review = await this.readReview(cycle);
        const packageValue = validatePackageMemoryBinding(validateContract('research-content-package', {
            ...input.package,
            schema_version: '1.2',
            topic: selected.working_title,
            thesis: { summary: selected.thesis, claim_status: selected.claim_status },
            memory_context: {
                schema_version: 'memory-context/v2',
                research_query_plan_digest: cycle.context_binding.plan_digest,
                research_context_snapshot_digest: cycle.context_binding.snapshot_digest,
                context_refs: [...cycle.context_binding.selected_context_refs],
                status: cycle.context_binding.application_status,
                reviewer: review.reviewer,
                reviewed_at: review.reviewed_at
            },
            research_program_binding: {
                roadmap_ref: cycle.roadmap_ref,
                topic_ref: selected.topic_ref,
                candidate_set_ref: {
                    path: `${root}/candidates.json`,
                    digest: candidateSet.candidate_set_digest
                },
                selection_ref: {
                    path: `${root}/selection.json`,
                    digest: selection.selection_digest
                }
            }
        }));
        await this.store.writeNew(`${root}/package.json`, packageValue);
        const installed = await this.readContract(`${root}/package.json`, 'research-content-package');
        if (sha256(installed) !== sha256(packageValue))
            fail('Installed V1.2 Package changed after write');
        await this.projectStatusIfPresent(root, cycle, candidateSet, selection, installed);
        return installed;
    }
    async readCycle(root, cycleId) {
        const value = await this.readContract(`${root}/cycle.json`, 'weekly-research-cycle');
        const verified = createWeeklyResearchCycle(omitFields(value, ['schema_version', 'cycle_digest']));
        if (value.cycle_id !== cycleId || value.cycle_digest !== verified.cycle_digest) {
            fail('Weekly Cycle path or digest is stale');
        }
        return value;
    }
    async readCandidateSet(root, cycleId) {
        const value = await this.readContract(`${root}/candidates.json`, 'weekly-candidate-set');
        const verified = createWeeklyCandidateSet(omitFields(value, ['schema_version', 'candidate_set_digest']));
        if (value.cycle_id !== cycleId || value.candidate_set_digest !== verified.candidate_set_digest) {
            fail('Candidate Set path or digest is stale');
        }
        return value;
    }
    async readSelection(root, candidateSet) {
        const value = await this.readContract(`${root}/selection.json`, 'weekly-topic-selection');
        const verified = createWeeklyTopicSelection(candidateSet, omitFields(value, ['schema_version', 'selection_id', 'selection_digest']));
        if (value.selection_digest !== verified.selection_digest)
            fail('Topic Selection digest is stale');
        return value;
    }
    async readReview(cycle) {
        const value = await this.readContract(`memory/queries-v2/${cycle.context_binding.query_id}/review.json`, 'research-context-review-v2');
        const body = omitFields(value, ['review_digest']);
        if (value.review_digest !== sha256(body) ||
            value.review_digest !== cycle.context_binding.review_digest ||
            value.query_plan_digest !== cycle.context_binding.plan_digest ||
            value.snapshot_digest !== cycle.context_binding.snapshot_digest ||
            sha256(value.selected_context_refs) !== sha256(cycle.context_binding.selected_context_refs)) {
            fail('Reviewed Context no longer matches the Weekly Cycle binding');
        }
        return value;
    }
    async projectStatusIfPresent(root, cycle, candidateSet, selection, packageValue) {
        const path = `${root}/status.json`;
        if (!await this.store.exists(path))
            return;
        const current = await this.readContract(path, 'weekly-cycle-status');
        const input = {
            ...omitFields(current, ['schema_version', 'projection_digest']),
            cycle_ref: { path: `${root}/cycle.json`, digest: cycle.cycle_digest },
            phase: 'package_compiled',
            candidate_set_ref: { path: `${root}/candidates.json`, digest: candidateSet.candidate_set_digest },
            selection_ref: { path: `${root}/selection.json`, digest: selection.selection_digest },
            package_ref: { path: `${root}/package.json`, digest: sha256(packageValue) },
            blocked_reason: null,
            updated_at: packageValue.updated_at
        };
        await this.store.replaceAtomic(path, createWeeklyCycleStatus(input));
    }
    async readContract(path, contract) {
        const artifact = await this.store.readContainedArtifact(path);
        let value;
        try {
            value = JSON.parse(artifact.content.toString('utf8'));
        }
        catch {
            throw new HarnessError('CONTRACT_INVALID', `${contract} is not valid JSON`);
        }
        return validateContract(contract, value);
    }
}
//# sourceMappingURL=weekly-package-compiler.js.map