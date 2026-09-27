import { randomUUID } from 'node:crypto';
import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { ResearchEvidenceService } from './research-evidence-service.js';
import { createResearchLifecycleEvent } from './research-lifecycle.js';
import { SemanticDeltaService } from './semantic-delta-service.js';
import { validateContract } from './schema-validator.js';
const INCREMENT_REF = /^increment:([a-z0-9][a-z0-9_-]{0,95}):([a-z0-9][a-z0-9_-]{0,95})@(\d+)$/;
function unsignedExpression(expression) {
    const body = { ...expression };
    Reflect.deleteProperty(body, 'expression_digest');
    return body;
}
export class ResearchFlywheelService {
    store;
    options;
    evidence;
    now;
    constructor(store, options = {}) {
        this.store = store;
        this.options = options;
        this.evidence = new ResearchEvidenceService(store);
        this.now = options.now ?? (() => new Date());
    }
    async proposeFromEvidence(snapshotId) {
        await this.evidence.status(snapshotId);
        const snapshot = validateContract('research-evidence-snapshot', await this.store.readJson(`memory/evidence/snapshots/${snapshotId}/manifest.json`));
        if (snapshot.capture_event !== 'publication_receipt_terminal') {
            throw new HarnessError('CONTRACT_INVALID', 'publication flywheel requires terminal publication Evidence');
        }
        const expressionRef = snapshot.artifact_refs.find((ref) => ref.role === 'publication_expression');
        const receiptRef = snapshot.artifact_refs.find((ref) => ref.role === 'publication_receipt');
        if (expressionRef === undefined || receiptRef === undefined) {
            throw new HarnessError('CONTRACT_INVALID', 'terminal publication Evidence requires expression and Receipt');
        }
        const expression = validateContract('publication-expression', await this.store.readJson(expressionRef.object_path));
        if (sha256(unsignedExpression(expression)) !== expression.expression_digest ||
            expression.publication_receipt_ref === null || expression.verification_level === 'planned') {
            throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'Publication Expression is not bound to terminal observation');
        }
        const match = INCREMENT_REF.exec(expression.increment_ref);
        if (match === null)
            throw new HarnessError('CONTRACT_INVALID', 'Publication Expression Increment ref is invalid');
        const [, trackId, incrementId, rawRevision] = match;
        const revision = Number(rawRevision);
        if (incrementId !== snapshot.increment_id || revision !== snapshot.increment_revision) {
            throw new HarnessError('CONTRACT_INVALID', 'Publication Expression and Evidence Increment identity differ');
        }
        const status = await this.store.readJson(`memory/increments/${incrementId}/status.json`);
        if (status.track_id !== trackId || status.latest_revision < revision ||
            (status.state !== 'accepted' && status.state !== 'published')) {
            throw new HarnessError('STATE_TRANSITION_INVALID', 'publication attachment requires an accepted Increment');
        }
        const occurredAt = expression.published_at ?? this.now().toISOString();
        const lifecycle = createResearchLifecycleEvent({
            event_id: this.options.lifecycleEventId?.() ?? `event_${randomUUID().replaceAll('-', '')}`,
            increment_ref: expression.increment_ref,
            event_seq: (status.latest_event_seq ?? 1) + 1,
            previous_event_ref: status.latest_event_ref,
            event_type: 'publication_attached',
            prior_state: status.state,
            resulting_state: 'published',
            evidence_refs: [`evidence:${snapshotId}`],
            approval_ref: null,
            receipt_ref: expression.publication_receipt_ref,
            occurred_at: occurredAt
        });
        const expressionTarget = this.expressionTarget(trackId, expression, occurredAt);
        const lifecycleTarget = this.lifecycleTarget(trackId, lifecycle, occurredAt, expression.verification_level);
        const evidenceRef = `evidence:${snapshotId}`;
        const operations = [
            {
                operation_id: `op_attach_${expression.expression_id}`,
                operation_type: 'attach_publication',
                target_id: expression.expression_id,
                record_type: 'publication_expression',
                target_content: expressionTarget,
                target_content_digest: sha256(expressionTarget),
                evidence_refs: [evidenceRef],
                evidence_privacy_classification: snapshot.privacy_classification,
                target_privacy_classification: snapshot.privacy_classification,
                index_impact: ['publication', 'history']
            },
            {
                operation_id: `op_lifecycle_${lifecycle.event_id}`,
                operation_type: 'change_lifecycle',
                target_id: lifecycle.event_id,
                record_type: 'research_lifecycle_event',
                target_content: lifecycleTarget,
                target_content_digest: sha256(lifecycleTarget),
                evidence_refs: [evidenceRef],
                evidence_privacy_classification: snapshot.privacy_classification,
                target_privacy_classification: snapshot.privacy_classification,
                index_impact: ['mainline', 'history', 'publication']
            }
        ];
        return new SemanticDeltaService(this.store, { now: this.now }).propose({
            delta_id: this.options.deltaId?.() ?? `delta_${randomUUID().replaceAll('-', '')}`,
            increment_ref: expression.increment_ref,
            base_catalog_digest: await (this.options.baseCatalogDigest?.() ?? Promise.resolve(sha256({ catalog: null }))),
            evidence_snapshot_refs: [evidenceRef],
            proposed_operations: operations,
            generated_by: 'research-publishing-harness/research-flywheel-service',
            generated_at: this.now().toISOString(),
            policy_version: 'semantic-promotion/v1'
        });
    }
    async proposeNextQuestions(incrementRef) {
        const match = INCREMENT_REF.exec(incrementRef);
        if (match === null)
            throw new HarnessError('CONTRACT_INVALID', 'next-question Increment ref is invalid');
        const [, trackId, incrementId, rawRevision] = match;
        const revision = validateContract('research-increment-revision', await this.store.readJson(`memory/increments/${incrementId}/revisions/${Number(rawRevision)}/revision.json`));
        if (revision.track_id !== trackId)
            throw new HarnessError('CONTRACT_INVALID', 'next-question track differs');
        const candidates = revision.open_question_refs.length > 0
            ? revision.open_question_refs
            : [`question:${incrementId}:falsification`];
        return candidates.map((origin, index) => ({
            candidate_id: `next_${incrementId}_${index + 1}`,
            increment_ref: incrementRef,
            question: `What evidence would most strongly test or falsify: ${revision.thesis}`,
            rationale: `Continue the research question: ${revision.research_question}`,
            origin_refs: [origin, incrementRef],
            evidence_strength: 'anecdotal',
            limitations: ['Candidate question only; it is not an accepted claim or autonomous research action.'],
            data_classification: 'data_only'
        }));
    }
    expressionTarget(trackId, expression, occurredAt) {
        const ref = `publication:${expression.expression_id}@${expression.expression_digest}`;
        return {
            semantic_record: expression,
            frontmatter: {
                expression_id: expression.expression_id,
                increment_ref: expression.increment_ref,
                channel: expression.channel,
                language: expression.language,
                derivation_type: expression.derivation_type,
                verification_level: expression.verification_level
            },
            body: `# Publication Expression ${expression.expression_id}\n\n${JSON.stringify(expression, null, 2)}\n`,
            variables: { research_track: trackId, expression_id: expression.expression_id },
            refs: { increment_ref: expression.increment_ref },
            index_entry: {
                ref,
                record_path: `domains/research-publishing/tracks/${trackId}/publications/${expression.expression_id}.md`,
                record_digest: expression.expression_digest,
                title: `${expression.channel}: ${expression.expression_id}`,
                summary: `Observed ${expression.channel} expression with ${expression.verification_level} verification.`,
                tags: [expression.channel, expression.derivation_type],
                category: 'publication', claim_status: null, lifecycle_status: 'published', evolution_target: null,
                updated_at: occurredAt, accepted_at: occurredAt, published_at: expression.published_at,
                evidence_available: true, document_manifest_available: false
            }
        };
    }
    lifecycleTarget(trackId, lifecycle, occurredAt, verificationStrength) {
        const match = INCREMENT_REF.exec(lifecycle.increment_ref);
        if (match === null || match[1] !== trackId)
            throw new HarnessError('CONTRACT_INVALID', 'lifecycle Increment ref is invalid');
        const incrementId = match[2];
        return {
            semantic_record: lifecycle,
            publication_verification_strength: verificationStrength,
            frontmatter: {
                event_id: lifecycle.event_id,
                increment_ref: lifecycle.increment_ref,
                event_seq: lifecycle.event_seq,
                event_type: lifecycle.event_type,
                resulting_state: lifecycle.resulting_state,
                verification_level: verificationStrength
            },
            body: `# Lifecycle Event ${lifecycle.event_id}\n\n${JSON.stringify(lifecycle, null, 2)}\n`,
            variables: { research_track: trackId, increment_id: incrementId, event_id: lifecycle.event_id },
            refs: {
                increment_ref: lifecycle.increment_ref,
                publication_receipt_ref: lifecycle.receipt_ref
            },
            index_entry: {
                ref: `lifecycle:${lifecycle.event_id}@${lifecycle.event_digest}`,
                record_path: `domains/research-publishing/tracks/${trackId}/increments/${incrementId}/lifecycle/${lifecycle.event_id}.md`,
                record_digest: lifecycle.event_digest,
                title: `Lifecycle: ${lifecycle.event_type}`,
                summary: `Increment publication lifecycle changed to ${lifecycle.resulting_state}.`,
                tags: [lifecycle.event_type, lifecycle.resulting_state], category: 'semantic', claim_status: null,
                lifecycle_status: lifecycle.resulting_state, evolution_target: null,
                updated_at: occurredAt, accepted_at: occurredAt, published_at: occurredAt,
                evidence_available: true, document_manifest_available: false
            }
        };
    }
}
//# sourceMappingURL=research-flywheel-service.js.map