import { HarnessError } from './errors.js';
import { createResearchRoadmap } from './research-program-contracts.js';
import { STABLE_ID_PATTERN } from './research-memory-contracts.js';
function assertRoadmapId(roadmapId) {
    if (!STABLE_ID_PATTERN.test(roadmapId)) {
        throw new HarnessError('CONTRACT_INVALID', 'Roadmap id must be an ASCII-safe stable id');
    }
}
function roadmapRoot(roadmapId) {
    assertRoadmapId(roadmapId);
    return `program/roadmaps/${roadmapId}`;
}
function revisionPath(roadmapId, revision) {
    return `${roadmapRoot(roadmapId)}/revisions/${revision}.json`;
}
function revisionRef(roadmap) {
    return {
        path: revisionPath(roadmap.roadmap_id, roadmap.revision),
        digest: roadmap.roadmap_digest
    };
}
function refsEqual(left, right) {
    return left !== null && left.path === right.path && left.digest === right.digest;
}
export class ResearchRoadmapService {
    store;
    constructor(store) {
        this.store = store;
    }
    async create(input) {
        const roadmap = createResearchRoadmap(input);
        if (roadmap.revision !== 1 || roadmap.previous_revision_ref !== null) {
            throw new HarnessError('STATE_TRANSITION_INVALID', 'A new Roadmap must start at revision one without a previous revision ref');
        }
        const root = roadmapRoot(roadmap.roadmap_id);
        return this.store.withLock(`${root}/revision.lock`, async () => {
            await this.store.writeNew(revisionPath(roadmap.roadmap_id, 1), roadmap);
            const installed = await this.store.readJson(revisionPath(roadmap.roadmap_id, 1));
            await this.store.replaceAtomic(`${root}/current.json`, installed);
            return installed;
        });
    }
    async revise(input) {
        const next = createResearchRoadmap(input.roadmap);
        const root = roadmapRoot(next.roadmap_id);
        return this.store.withLock(`${root}/revision.lock`, async () => {
            const current = await this.current(next.roadmap_id);
            if (input.confirmed_current_digest !== current.roadmap_digest) {
                throw new HarnessError('APPROVAL_STALE', 'Roadmap revision is not based on the current Roadmap digest');
            }
            if (next.revision !== current.revision + 1) {
                throw new HarnessError('STATE_TRANSITION_INVALID', 'Roadmap revision must advance exactly one revision');
            }
            if (!refsEqual(next.previous_revision_ref, revisionRef(current))) {
                throw new HarnessError('APPROVAL_STALE', 'Roadmap previous revision ref does not bind the current immutable revision');
            }
            const nextPath = revisionPath(next.roadmap_id, next.revision);
            await this.store.writeNew(nextPath, next);
            const installed = await this.store.readJson(nextPath);
            await this.store.replaceAtomic(`${root}/current.json`, installed);
            return installed;
        });
    }
    async current(roadmapId) {
        return this.store.readJson(`${roadmapRoot(roadmapId)}/current.json`);
    }
}
//# sourceMappingURL=research-roadmap-service.js.map