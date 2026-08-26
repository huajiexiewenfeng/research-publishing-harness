import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { createMonthlyEditorialReview } from './research-program-contracts.js';
import { STABLE_ID_PATTERN } from './research-memory-contracts.js';
import { validateContract } from './schema-validator.js';
const MONTH_ID_PATTERN = /^month_0[1-6]$/;
function assertMonthId(monthId) {
    if (!MONTH_ID_PATTERN.test(monthId)) {
        throw new HarnessError('CONTRACT_INVALID', 'Month id must be month_01 through month_06');
    }
}
function reviewRoot(monthId) {
    assertMonthId(monthId);
    return `program/months/${monthId}/reviews`;
}
function withoutDigest(value) {
    const copy = { ...value };
    delete copy.review_digest;
    return copy;
}
export class MonthlyEditorialReviewService {
    store;
    constructor(store) {
        this.store = store;
    }
    async create(input) {
        assertMonthId(input.month_id);
        await this.verifyRoadmapRef(input);
        const paths = input.completed_outcome_refs.map((ref) => ref.path);
        if (new Set(paths).size !== paths.length) {
            throw new HarnessError('CONTRACT_INVALID', 'Monthly Review Outcome paths must be distinct');
        }
        for (const ref of input.completed_outcome_refs) {
            const artifact = await this.store.readContainedArtifact(ref.path);
            if (artifact.digest !== ref.digest) {
                throw new HarnessError('APPROVAL_STALE', `Weekly Outcome digest is stale: ${ref.path}`);
            }
        }
        const review = createMonthlyEditorialReview(input);
        const root = reviewRoot(review.month_id);
        return this.store.withLock(`${root}/review.lock`, async () => {
            const path = `${root}/${review.review_id}.json`;
            await this.store.writeNew(path, review);
            return this.readReview(path);
        });
    }
    async status(monthId) {
        const entries = await this.store.list(reviewRoot(monthId));
        const reviews = [];
        for (const entry of entries) {
            if (entry.kind !== 'file' || !entry.name.endsWith('.json'))
                continue;
            reviews.push(await this.readReview(entry.relative_path));
        }
        reviews.sort((left, right) => {
            const byTime = right.reviewed_at.localeCompare(left.reviewed_at);
            return byTime === 0 ? right.review_id.localeCompare(left.review_id) : byTime;
        });
        return reviews[0] ?? null;
    }
    async latest(roadmapRef) {
        const monthEntries = await this.store.list('program/months');
        const reviews = [];
        for (const entry of monthEntries) {
            if (entry.kind !== 'directory' || !MONTH_ID_PATTERN.test(entry.name))
                continue;
            const review = await this.status(entry.name);
            if (review !== null &&
                (roadmapRef === undefined ||
                    (review.roadmap_ref.path === roadmapRef.path && review.roadmap_ref.digest === roadmapRef.digest))) {
                reviews.push(review);
            }
        }
        reviews.sort((left, right) => {
            const byTime = right.reviewed_at.localeCompare(left.reviewed_at);
            return byTime === 0 ? right.month_id.localeCompare(left.month_id) : byTime;
        });
        return reviews[0] ?? null;
    }
    async verifyRoadmapRef(input) {
        const roadmap = validateContract('research-roadmap', await this.store.readJson(input.roadmap_ref.path));
        const expectedPath = `program/roadmaps/${roadmap.roadmap_id}/revisions/${roadmap.revision}.json`;
        const current = validateContract('research-roadmap', await this.store.readJson(`program/roadmaps/${roadmap.roadmap_id}/current.json`));
        const body = { ...roadmap };
        delete body.roadmap_digest;
        if (input.roadmap_ref.path !== expectedPath ||
            input.roadmap_ref.digest !== roadmap.roadmap_digest ||
            current.roadmap_digest !== roadmap.roadmap_digest ||
            sha256(body) !== roadmap.roadmap_digest) {
            throw new HarnessError('APPROVAL_STALE', 'Monthly Review Roadmap ref is stale');
        }
    }
    async readReview(path) {
        const review = validateContract('monthly-editorial-review', await this.store.readJson(path));
        if (sha256(withoutDigest(review)) !== review.review_digest) {
            throw new HarnessError('APPROVAL_STALE', 'Monthly Review digest no longer matches its content');
        }
        const expectedPath = `${reviewRoot(review.month_id)}/${review.review_id}.json`;
        if (path !== expectedPath || !STABLE_ID_PATTERN.test(review.review_id)) {
            throw new HarnessError('APPROVAL_STALE', 'Monthly Review content does not match its immutable path');
        }
        return review;
    }
}
//# sourceMappingURL=monthly-editorial-review-service.js.map