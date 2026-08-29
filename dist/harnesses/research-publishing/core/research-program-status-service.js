import { HarnessError } from './errors.js';
import { createResearchProgramStatus } from './research-program-contracts.js';
import { RESEARCH_PROGRAM_POLICY_V1 } from './research-program-policy.js';
import { STABLE_ID_PATTERN } from './research-memory-contracts.js';
export class ResearchProgramStatusService {
    store;
    roadmaps;
    backlog;
    reviews;
    constructor(store, roadmaps, backlog, reviews) {
        this.store = store;
        this.roadmaps = roadmaps;
        this.backlog = backlog;
        this.reviews = reviews;
    }
    async status(roadmapId) {
        if (!STABLE_ID_PATTERN.test(roadmapId)) {
            throw new HarnessError('CONTRACT_INVALID', 'Roadmap id must be an ASCII-safe stable id');
        }
        const roadmap = await this.roadmaps.current(roadmapId);
        const catalog = await this.loadCatalog(roadmapId);
        const roadmapRef = this.roadmapRef(roadmap);
        const latestReview = await this.reviews.latest(roadmapRef);
        const { activeCycleRefs, completedOutcomeCount } = await this.workspaceCycleState();
        const warnings = [];
        if (catalog.counts.evidence_ready < RESEARCH_PROGRAM_POLICY_V1.minimum_evidence_ready_topics) {
            warnings.push('available Evidence Ready Topic buffer is below 2');
        }
        const nextAction = this.nextAction(catalog.counts.evidence_ready, activeCycleRefs.length, completedOutcomeCount, latestReview);
        const status = createResearchProgramStatus({
            roadmap_ref: roadmapRef,
            backlog_catalog_ref: {
                path: 'program/backlog/catalog.json',
                digest: catalog.catalog_digest
            },
            latest_review_ref: latestReview === null ? null : {
                path: `program/months/${latestReview.month_id}/reviews/${latestReview.review_id}.json`,
                digest: latestReview.review_digest
            },
            active_cycle_refs: activeCycleRefs,
            warnings,
            next_action: nextAction,
            projected_at: new Date().toISOString()
        });
        await this.store.replaceAtomic('program/status.json', status);
        return this.store.readJson('program/status.json');
    }
    async loadCatalog(roadmapId) {
        try {
            return await this.backlog.catalog(roadmapId);
        }
        catch (error) {
            if (!(error instanceof HarnessError) || error.code !== 'ARTIFACT_NOT_FOUND')
                throw error;
            return this.backlog.rebuildCatalog(roadmapId);
        }
    }
    async workspaceCycleState() {
        const weekEntries = await this.store.list('program/weeks');
        const activeCycleRefs = [];
        let completedOutcomeCount = 0;
        for (const entry of weekEntries) {
            if (entry.kind !== 'directory' || !STABLE_ID_PATTERN.test(entry.name))
                continue;
            const cyclePath = `${entry.relative_path}/cycle.json`;
            const outcomePath = `${entry.relative_path}/outcome.json`;
            const hasOutcome = await this.store.exists(outcomePath);
            if (hasOutcome)
                completedOutcomeCount += 1;
            if (await this.store.exists(cyclePath) && !hasOutcome) {
                const artifact = await this.store.resolveExistingArtifact(cyclePath);
                activeCycleRefs.push({ path: artifact.relative_path, digest: artifact.digest });
            }
        }
        return { activeCycleRefs, completedOutcomeCount };
    }
    nextAction(evidenceReadyCount, activeCycleCount, completedOutcomeCount, latestReview) {
        if (evidenceReadyCount < RESEARCH_PROGRAM_POLICY_V1.minimum_evidence_ready_topics) {
            return 'replenish_evidence_ready_backlog';
        }
        if (activeCycleCount > 0)
            return 'complete_active_week';
        if (latestReview === null && completedOutcomeCount >= 4)
            return 'run_monthly_editorial_review';
        if (latestReview?.roadmap_change_requested === true)
            return 'review_requested_roadmap_change';
        if (latestReview?.month_id === 'month_06')
            return 'six_month_synthesis_due';
        return 'open_next_weekly_cycle';
    }
    roadmapRef(roadmap) {
        return {
            path: `program/roadmaps/${roadmap.roadmap_id}/revisions/${roadmap.revision}.json`,
            digest: roadmap.roadmap_digest
        };
    }
}
//# sourceMappingURL=research-program-status-service.js.map