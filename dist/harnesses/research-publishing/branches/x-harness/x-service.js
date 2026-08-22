import { randomUUID } from 'node:crypto';
import { sha256 } from '../../core/digest.js';
import { HarnessError } from '../../core/errors.js';
import { createGenerationTask } from '../../core/generation.js';
import { runPrivacyGate } from '../../core/gates.js';
import { createPublicationPlanV2 } from '../../core/publication-plan-v2.js';
import { createPublicationPlanV2_1 } from '../../core/publication-plan-v2-1.js';
import { validateContract } from '../../core/schema-validator.js';
import { validatePostText } from './character-count.js';
const ACCOUNT_PATTERN = /^@[A-Za-z0-9_]{1,15}$/;
const SHIPPED_LANGUAGE = /\b(is implemented|is available|has shipped|currently supports|already provides|is production-ready)\b/i;
export class XService {
    store;
    runId;
    planId;
    now;
    constructor(store, options = {}) {
        this.store = store;
        this.runId = options.runId ?? (() => `x_${randomUUID()}`);
        this.planId = options.planId ?? (() => `plan_${randomUUID()}`);
        this.now = options.now ?? (() => new Date());
    }
    async prepareX(packageValue, brief) {
        if (packageValue.status !== 'frozen') {
            throw new HarnessError('STATE_TRANSITION_INVALID', 'X generation requires a frozen package');
        }
        if (!ACCOUNT_PATTERN.test(brief.targetAccount)) {
            throw new HarnessError('CONTRACT_INVALID', 'target account must be a valid X handle');
        }
        if ((brief.contentType === 'reply') !== (brief.format === 'reply')) {
            throw new HarnessError('CONTRACT_INVALID', 'reply content type and format must be selected together');
        }
        const runId = this.runId();
        const task = createGenerationTask({
            run_id: runId,
            branch: 'x',
            mode: `${brief.contentType}:${brief.format}`,
            language: brief.language
        }, packageValue, [
            'Keep every post within the versioned weighted character limit.',
            'Preserve Claim status and make planned work explicit.',
            'Return one complete draft candidate; do not publish.'
        ]);
        const metadata = {
            run_id: runId,
            package_id: packageValue.package_id,
            package_version: packageValue.version,
            target_account: brief.targetAccount,
            created_at: this.now().toISOString()
        };
        const prefix = this.runPrefix(runId);
        await this.store.writeNew(`${prefix}/run.json`, metadata);
        await this.store.writeNew(`${prefix}/package.json`, packageValue);
        await this.store.writeNew(`${prefix}/brief.json`, brief);
        await this.store.writeNew(`${prefix}/generation-task.json`, task);
        return {
            run_id: runId,
            package_id: packageValue.package_id,
            package_version: packageValue.version,
            generation_task: task
        };
    }
    async acceptXDraft(runId, candidate) {
        const prefix = this.runPrefix(runId);
        const metadata = await this.store.readJson(`${prefix}/run.json`);
        const brief = await this.store.readJson(`${prefix}/brief.json`);
        const packageValue = await this.store.readJson(`${prefix}/package.json`);
        const task = await this.store.readJson(`${prefix}/generation-task.json`);
        const draft = validateContract('x-draft', candidate);
        if (draft.run_id !== runId ||
            draft.content_type !== brief.contentType ||
            draft.format !== brief.format ||
            draft.language !== brief.language) {
            throw new HarnessError('CONTRACT_INVALID', 'X draft does not match its GenerationTask brief');
        }
        if ((draft.format === 'single' || draft.format === 'reply') && draft.items.length !== 1) {
            throw new HarnessError('CONTRACT_INVALID', `${draft.format} requires exactly one item`);
        }
        if (draft.format === 'thread' && draft.items.length < 2) {
            throw new HarnessError('CONTRACT_INVALID', 'thread requires at least two items');
        }
        if (draft.format === 'reply' && draft.target_post === undefined) {
            throw new HarnessError('CONTRACT_INVALID', 'reply requires an immutable target post snapshot');
        }
        if (draft.format !== 'reply' && draft.target_post !== undefined) {
            throw new HarnessError('CONTRACT_INVALID', 'target post is only valid for Reply');
        }
        const claimIds = new Set(packageValue.claims.map((claim) => claim.claim_id));
        draft.items.forEach((item, index) => {
            if (item.ordinal !== index + 1) {
                throw new HarnessError('CONTRACT_INVALID', 'X item ordinals must be contiguous and ordered');
            }
            if (item.claim_refs.some((claimId) => !claimIds.has(claimId))) {
                throw new HarnessError('CONTRACT_INVALID', 'X draft references a Claim outside the frozen package');
            }
            if (draft.format === 'thread' && index > 0 && item.reply_to !== 'previous') {
                throw new HarnessError('CONTRACT_INVALID', 'Thread continuation items must reply to previous');
            }
        });
        await this.store.writeNew(`${prefix}/draft-candidate.json`, draft);
        return {
            run_id: runId,
            package_id: metadata.package_id,
            package_version: metadata.package_version,
            generation_task: task,
            draft
        };
    }
    async reviewX(runId) {
        const prefix = this.runPrefix(runId);
        const packageValue = await this.store.readJson(`${prefix}/package.json`);
        const draft = await this.store.readJson(`${prefix}/draft-candidate.json`);
        const findings = [...runPrivacyGate(draft).findings];
        for (const [index, item] of draft.items.entries()) {
            const characters = validatePostText(item.text);
            if (!characters.valid) {
                findings.push({
                    code: 'CHARACTER_LIMIT_EXCEEDED',
                    severity: 'error',
                    message: `item ${item.ordinal} has weighted length ${characters.weightedLength}/${characters.maxWeightedLength}`,
                    path: `/items/${index}/text`
                });
            }
            for (const claimId of item.claim_refs) {
                const claim = packageValue.claims.find((candidate) => candidate.claim_id === claimId);
                if (claim?.claim_status === 'planned' && SHIPPED_LANGUAGE.test(item.text)) {
                    findings.push({
                        code: 'CLAIM_STATUS_LANGUAGE_MISMATCH',
                        severity: 'error',
                        message: `planned Claim ${claimId} is presented as shipped`,
                        path: `/items/${index}/text`
                    });
                }
            }
        }
        const report = validateContract('review-report', {
            schema_version: '1.0',
            run_id: runId,
            passed: findings.every((finding) => finding.severity !== 'error'),
            gates: ['evidence', 'privacy', 'editorial'],
            findings,
            reviewed_at: this.now().toISOString()
        });
        await this.store.writeNew(`${prefix}/review-report.json`, report);
        return report;
    }
    async planX(runId) {
        const prefix = this.runPrefix(runId);
        const metadata = await this.store.readJson(`${prefix}/run.json`);
        const draft = await this.store.readJson(`${prefix}/draft-candidate.json`);
        const report = await this.store.readJson(`${prefix}/review-report.json`);
        if (!report.passed) {
            const characterFailure = report.findings.some((finding) => finding.code === 'CHARACTER_LIMIT_EXCEEDED');
            throw new HarnessError(characterFailure ? 'CHARACTER_LIMIT_EXCEEDED' : 'EVIDENCE_GATE_BLOCKED', 'X review contains blocking findings', report.findings);
        }
        const items = [...draft.items]
            .sort((left, right) => left.ordinal - right.ordinal)
            .map((item) => ({
            ordinal: item.ordinal,
            text: item.text,
            digest: sha256(item.text),
            ...(item.reply_to === undefined ? {} : { reply_to: item.reply_to })
        }));
        const locked = {
            schema_version: '1.0',
            run_id: runId,
            target_account: metadata.target_account,
            adapter: 'manual',
            target_post_id: draft.target_post?.id ?? null,
            target_post: draft.target_post ?? null,
            items,
            planned_at: this.now().toISOString()
        };
        const plan = {
            ...locked,
            publication_digest: sha256(locked)
        };
        await this.store.writeNew(`${prefix}/publication-plan.json`, plan);
        return plan;
    }
    async planXBrowser(runId, handoff) {
        const prefix = this.runPrefix(runId);
        const metadata = await this.store.readJson(`${prefix}/run.json`);
        const draft = await this.store.readJson(`${prefix}/draft-candidate.json`);
        const report = await this.store.readJson(`${prefix}/review-report.json`);
        if (!report.passed) {
            throw new HarnessError('EVIDENCE_GATE_BLOCKED', 'X review contains blocking findings');
        }
        if (handoff?.visual_asset !== undefined &&
            (handoff.schema_version !== '1.1' ||
                handoff.article_package_root === undefined ||
                handoff.package_id !== metadata.package_id ||
                handoff.package_version !== metadata.package_version)) {
            throw new HarnessError('VISUAL_ASSET_INVALID', 'X visual Plan requires an exact finalized Article Handoff');
        }
        const commonItems = draft.items.map((item) => ({
            ordinal: item.ordinal,
            text: item.text,
            ...(item.reply_to === undefined ? {} : { reply_to: item.reply_to })
        }));
        const plan = handoff?.visual_asset === undefined
            ? createPublicationPlanV2({
                planId: this.planId(),
                runId,
                targetAccount: metadata.target_account,
                adapter: 'browser',
                mode: draft.format,
                targetPost: draft.target_post ?? null,
                media: [],
                items: commonItems,
                plannedAt: this.now().toISOString(),
                provenance: { draft_digest: sha256(draft) }
            })
            : createPublicationPlanV2_1({
                planId: this.planId(),
                runId,
                targetAccount: metadata.target_account,
                mode: draft.format,
                targetPost: draft.target_post ?? null,
                items: commonItems.map((item, index) => ({
                    ...item,
                    attachments: index === 0 ? [handoff.visual_asset] : []
                })),
                articlePackage: {
                    root: handoff.article_package_root,
                    digest: handoff.article_digest
                },
                authorizedAsset: handoff.visual_asset,
                plannedAt: this.now().toISOString(),
                provenance: { draft_digest: sha256(draft), handoff_id: handoff.handoff_id }
            });
        await this.store.writeNew(`${prefix}/publication-plan-v${plan.schema_version}.json`, plan);
        return plan;
    }
    runPrefix(runId) {
        if (!/^[a-zA-Z0-9_-]+$/.test(runId)) {
            throw new HarnessError('WORKSPACE_PATH_INVALID', 'run id contains unsafe path characters');
        }
        return `runs/${runId}/x`;
    }
}
//# sourceMappingURL=x-service.js.map