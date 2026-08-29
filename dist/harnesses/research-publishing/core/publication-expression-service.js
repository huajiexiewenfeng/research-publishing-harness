import { canExpressClaimAs } from './claim-boundary.js';
import { HarnessError } from './errors.js';
import { VersionedPublicationEvidenceReader } from './publication-evidence-reader.js';
import { createPublicationExpression } from './research-memory-contracts.js';
const PRIVACY_RANK = {
    public: 0,
    internal: 1,
    data_only: 1,
    restricted: 2
};
export class PublicationExpressionService {
    reader;
    constructor(store, reader) {
        this.reader = reader ?? new VersionedPublicationEvidenceReader(store);
    }
    async assemble(input) {
        const intended = await this.reader.readIntent(input.intent);
        if (intended.channel !== input.channel) {
            throw new HarnessError('CONTRACT_INVALID', 'Publication Expression channel differs from approved intent');
        }
        if (PRIVACY_RANK[intended.privacy_classification] > PRIVACY_RANK[input.target_privacy_classification]) {
            throw new HarnessError('PRIVACY_GATE_BLOCKED', 'Publication Expression cannot downgrade intent privacy');
        }
        if (new Set(input.claim_refs).size !== input.claim_refs.length ||
            input.claim_refs.some((ref) => input.source_claim_statuses[ref] === undefined)) {
            throw new HarnessError('CONTRACT_INVALID', 'Publication Expression claim refs must resolve exactly');
        }
        for (const ref of input.claim_refs) {
            const source = input.source_claim_statuses[ref];
            const expression = input.expression_claim_statuses[ref];
            if (expression === undefined || !canExpressClaimAs(source, expression)) {
                throw new HarnessError('CONTRACT_INVALID', 'Publication Expression cannot strengthen source claim status');
            }
        }
        if (input.visual_refs.length !== intended.visual_refs.length ||
            input.visual_refs.some((ref, index) => ref !== intended.visual_refs[index])) {
            throw new HarnessError('CONTRACT_INVALID', 'Publication Expression visuals differ from approved intent');
        }
        const observed = input.receipt === null ? null : await this.reader.readObservation(input.receipt);
        if (observed !== null) {
            if (PRIVACY_RANK[observed.privacy_classification] > PRIVACY_RANK[input.target_privacy_classification]) {
                throw new HarnessError('PRIVACY_GATE_BLOCKED', 'Publication Expression cannot downgrade Receipt privacy');
            }
            if (observed.bound_plan_digest !== null && observed.bound_plan_digest !== intended.approved_plan_digest) {
                throw new HarnessError('APPROVAL_STALE', 'terminal Receipt does not bind the approved publication Plan');
            }
        }
        const intendedContent = {
            approved_plan_ref: intended.approved_plan_ref,
            approved_plan_digest: intended.approved_plan_digest,
            local_content_path: intended.local_content_path,
            content_digest: intended.content_digest,
            expected_item_order: intended.expected_item_order,
            link_refs: intended.link_refs,
            visual_refs: intended.visual_refs
        };
        return createPublicationExpression({
            expression_id: input.expression_id,
            increment_ref: input.increment_ref,
            channel: input.channel,
            language: input.language,
            derivation_type: input.derivation_type,
            claim_refs: [...input.claim_refs],
            visual_refs: [...input.visual_refs],
            evidence_snapshot_refs: [...input.evidence_snapshot_refs],
            intended_content: intendedContent,
            observed_content: observed?.observed_content ?? null,
            verification_level: observed?.verification_level ?? 'planned',
            platform_refs: observed?.platform_refs ?? [],
            publication_receipt_ref: observed?.receipt_ref ?? null,
            published_at: observed?.published_at ?? null
        });
    }
}
//# sourceMappingURL=publication-expression-service.js.map