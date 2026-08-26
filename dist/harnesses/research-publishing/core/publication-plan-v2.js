import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { validateContract } from './schema-validator.js';
const ACCOUNT = /^@[A-Za-z0-9_]{1,15}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
export function normalizePublicationText(text) {
    return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').normalize('NFC');
}
export function createPublicationPlanV2(input) {
    const items = input.items.map((item, index) => {
        const text = normalizePublicationText(item.text);
        if (item.ordinal !== index + 1 || text.length === 0) {
            throw new HarnessError('CONTRACT_INVALID', 'V2 publication items must be non-empty and contiguous');
        }
        return {
            ordinal: item.ordinal,
            text,
            digest: sha256(text),
            ...(item.reply_to === undefined ? {} : { reply_to: item.reply_to })
        };
    });
    const intent = {
        schema_version: '2.0',
        platform: 'x',
        target_account: input.targetAccount,
        adapter: input.adapter,
        mode: input.mode,
        target_post: input.targetPost,
        media: input.media,
        items,
        action: 'publish_once'
    };
    const plan = {
        schema_version: '2.0',
        plan_id: input.planId,
        run_id: input.runId,
        intent,
        items,
        plan_digest: sha256(intent),
        planned_at: input.plannedAt,
        provenance: input.provenance
    };
    assertPublicationPlanV2(plan);
    return validateContract('publication-plan-v2', plan);
}
export function assertPublicationPlanV2(plan) {
    validateContract('publication-plan-v2', plan);
    if (!ACCOUNT.test(plan.intent.target_account) || !SHA256.test(plan.plan_digest)) {
        throw new HarnessError('CONTRACT_INVALID', 'invalid V2 account or digest');
    }
    if (sha256(plan.intent) !== plan.plan_digest || plan.items.length !== plan.intent.items.length) {
        throw new HarnessError('APPROVAL_STALE', 'V2 publication intent no longer matches its digest');
    }
    plan.items.forEach((item, index) => {
        if (item.ordinal !== index + 1 ||
            item.digest !== sha256(normalizePublicationText(item.text)) ||
            item.digest !== plan.intent.items[index]?.digest) {
            throw new HarnessError('APPROVAL_STALE', `V2 publication item ${item.ordinal} is stale`);
        }
    });
    const singleValid = plan.intent.mode === 'single' &&
        plan.items.length === 1 &&
        plan.intent.target_post === null &&
        plan.items[0]?.reply_to === undefined;
    const threadValid = plan.intent.mode === 'thread' &&
        plan.items.length >= 2 &&
        plan.intent.target_post === null &&
        plan.items[0]?.reply_to === undefined &&
        plan.items.slice(1).every((item) => item.reply_to === 'previous');
    const replyValid = plan.intent.mode === 'reply' &&
        plan.items.length === 1 &&
        plan.intent.target_post !== null &&
        plan.items[0]?.reply_to === 'target';
    if (!singleValid && !threadValid && !replyValid) {
        throw new HarnessError('CONTRACT_INVALID', 'V2 publication mode, target, and reply chain are inconsistent');
    }
}
//# sourceMappingURL=publication-plan-v2.js.map