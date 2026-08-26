import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { verifyFinalizedArticlePackage } from '../branches/article-harness/article-package-verifier.js';
import { createXArticleImportTemplate } from '../adapters/x/article-browser/article-import-template.js';
import { computeXArticlePageRevision } from '../adapters/x/article-browser/article-browser-protocol.js';
import { assertFinalReceiptV2 } from '../adapters/x/browser/receipt-v2.js';
import { approvePublicationV2, verifyApprovalV2 } from './approval-v2.js';
import { approvePublicationV2_1, verifyApprovalV2_1 } from './approval-v2-1.js';
import { sha256, sha256Bytes } from './digest.js';
import { HarnessError } from './errors.js';
import { runClaimBoundaryGate, runEvidenceGate, runPrivacyGate, runResearchGate, runResearchLineageGate } from './gates.js';
import { validatePackageMemoryBinding } from './memory-package.js';
import { renderPublicationBundleAudit } from './publication-bundle-audit.js';
import { assertPublicationBundleApproval, assertPublicationBundlePlan, createPublicationBundleApproval, createPublicationBundlePlan, createPublicationBundleReceipt } from './publication-bundle-contracts.js';
import { runPublicationBundlePublishGate } from './publication-bundle-publish-gate.js';
import { WorkspacePublicationChildExecutionInspector } from './publication-child-execution-inspector.js';
import { assertPublicationPlanV2, createPublicationPlanV2 } from './publication-plan-v2.js';
import { assertPublicationPlanV2_1, createPublicationPlanV2_1 } from './publication-plan-v2-1.js';
import { createWeeklyPublicationBundleBinding, createWeeklyResearchCycle, createWeeklyTopicSelection } from './research-program-contracts.js';
import { validateContract } from './schema-validator.js';
import { createXArticleMaterializationPlan, createXArticleMaterializationReceipt, createXArticleMaterializationStartEvidence } from './x-article-materialization.js';
import { createXArticlePublishConfirmation, verifyXArticlePublishConfirmation } from './x-article-publish-confirmation.js';
import { assertApprovedXArticleUrl, materializeXArticleUrl } from './x-article-url-materializer.js';
import { approveXArticlePublication, verifyXArticleApproval } from './x-article-approval.js';
import { assertXArticlePublicationPlan } from './x-article-publication-plan.js';
function omitFields(value, fields) {
    const body = { ...value };
    for (const field of fields)
        delete body[field];
    return body;
}
function exact(left, right) {
    return sha256(left) === sha256(right);
}
export class PublicationBundleService {
    store;
    weeks;
    now;
    approvalId;
    inspector;
    constructor(store, weeks, options = {}) {
        this.store = store;
        this.weeks = weeks;
        this.now = options.now ?? (() => new Date());
        this.approvalId = options.approvalId ?? (() => `bundle_approval_${randomUUID()}`);
        this.inspector = options.childInspector ??
            new WorkspacePublicationChildExecutionInspector(store);
    }
    async plan(input) {
        const sources = await this.verifySources(input);
        const plan = createPublicationBundlePlan({
            ...input,
            cycle_ref: input.cycle_ref,
            selection_ref: input.selection_ref,
            research_content_package_ref: input.research_content_package_ref,
            canonical_article_package: {
                ...input.canonical_article_package,
                root: sources.articlePackage.root,
                package_digest: sources.articlePackage.digest
            },
            article_plan: sources.articlePlan
        });
        const cycleRoot = `program/weeks/${plan.cycle_id}`;
        const bindingPath = `${cycleRoot}/publication-bundle-binding.json`;
        const planPath = this.planPath(plan.bundle_id);
        const installed = await this.store.withLock(`${cycleRoot}/publication-bundle.lock`, async () => {
            if (await this.store.exists(bindingPath)) {
                const binding = await this.readWeeklyBinding(bindingPath);
                if (binding.bundle_plan_ref.path !== planPath) {
                    throw new HarnessError('STATE_TRANSITION_INVALID', 'Weekly Cycle already has an immutable Publication Bundle');
                }
                const existing = await this.readPlan(plan.bundle_id);
                if (!exact(existing, plan)) {
                    throw new HarnessError('APPROVAL_STALE', 'Publication Bundle Plan retry changed bytes');
                }
                return existing;
            }
            if (await this.store.exists(planPath)) {
                const existing = await this.readPlan(plan.bundle_id);
                if (!exact(existing, plan)) {
                    throw new HarnessError('ARTIFACT_EXISTS', 'Publication Bundle id has a different Plan');
                }
            }
            else {
                await this.store.writeNew(planPath, plan);
            }
            const exactPlan = await this.readPlan(plan.bundle_id);
            const bindingInput = {
                cycle_ref: exactPlan.cycle_ref,
                selection_ref: exactPlan.selection_ref,
                research_content_package_ref: exactPlan.research_content_package_ref,
                weekly_article_ref: sources.weeklyStatus.article_ref,
                article_package_ref: exactPlan.canonical_article_package.package_ref,
                bundle_plan_ref: { path: planPath, digest: exactPlan.bundle_digest },
                bound_at: exactPlan.planned_at
            };
            await this.store.writeNew(bindingPath, createWeeklyPublicationBundleBinding(bindingInput));
            return exactPlan;
        });
        await this.weeks.status(installed.cycle_id);
        return installed;
    }
    async audit(bundleId) {
        return renderPublicationBundleAudit(await this.readPlan(bundleId));
    }
    async approve(input) {
        if ('confirmed_preview_revision' in input) {
            return this.approvePreparedArticle(input);
        }
        const plan = await this.readPlan(input.bundle_id);
        const path = this.approvalPath(input.bundle_id);
        if (await this.store.exists(path)) {
            const existing = await this.readApproval(plan);
            if (existing.bundle_digest !== input.confirmed_bundle_digest ||
                existing.approved_by !== input.approved_by) {
                throw new HarnessError('APPROVAL_STALE', 'Publication Bundle Approval is immutable');
            }
            return existing;
        }
        const approval = createPublicationBundleApproval(plan, input, this.now(), this.approvalId());
        await this.store.writeNew(path, approval);
        return this.readApproval(plan);
    }
    async bindPreparedArticle(input) {
        const detached = structuredClone(input);
        return this.store.withLock(this.bundleLockPath(detached.bundle_id), async () => {
            const plan = await this.readPlan(detached.bundle_id);
            if (await this.store.exists(this.approvalPath(detached.bundle_id))) {
                throw new HarnessError('STATE_TRANSITION_INVALID', 'Prepared Article binding cannot change after Bundle approval');
            }
            return this.store.withLock(this.articleAdapterLockPath(detached.execution_id), async () => {
                const verified = await this.verifyPreparedArticle(plan, detached);
                await this.ensurePreparedExecutionOwner(plan, detached.execution_id);
                const projection = await this.optionalPreparedProjection(detached.bundle_id);
                if (projection?.active_binding_ref !== null && projection !== undefined) {
                    const active = await this.readPreparedBindingRef(plan, projection.active_binding_ref);
                    if (!this.preparedBindingMatchesInput(active, detached, verified)) {
                        throw new HarnessError('STATE_TRANSITION_INVALID', 'Publication Bundle already has a different active prepared Article binding');
                    }
                    return { ...active, binding_ref: projection.active_binding_ref };
                }
                const entries = await this.store.list(this.preparedBindingsDirectory(detached.bundle_id));
                const versions = entries
                    .filter((entry) => entry.kind === 'file' && /^\d{6}\.json$/.test(entry.name))
                    .map((entry) => Number.parseInt(entry.name.slice(0, 6), 10));
                const latestVersion = versions.length === 0 ? 0 : Math.max(...versions);
                let binding;
                let bindingPath;
                let recoveredOrphan = false;
                if (latestVersion > 0) {
                    bindingPath = this.preparedBindingPath(detached.bundle_id, latestVersion);
                    const orphanRef = await this.fileRef(bindingPath);
                    const orphan = await this.readPreparedBindingRef(plan, orphanRef);
                    const unbound = await this.isPreparedBindingUnbound(detached.bundle_id, orphanRef);
                    if (!unbound) {
                        if (!this.preparedBindingMatchesInput(orphan, detached, verified)) {
                            throw new HarnessError('APPROVAL_STALE', 'orphaned prepared Article binding differs from retry input');
                        }
                        binding = orphan;
                        recoveredOrphan = true;
                    }
                }
                if (!recoveredOrphan) {
                    const bindingVersion = latestVersion + 1;
                    bindingPath = this.preparedBindingPath(detached.bundle_id, bindingVersion);
                    const body = {
                        schema_version: 'publication-bundle-prepared-article-binding/v1',
                        binding_version: bindingVersion,
                        bundle_id: detached.bundle_id,
                        bundle_plan_ref: await this.fileRef(this.planPath(detached.bundle_id)),
                        execution_id: detached.execution_id,
                        run_id: verified.context.snapshot.run_id,
                        plan_id: verified.context.snapshot.plan_id,
                        child_plan_ref: verified.planRef,
                        child_plan_digest: plan.article_plan.plan_digest,
                        materialization_plan_ref: verified.materializationPlanRef,
                        materialization_digest: verified.materializationPlan.materialization_digest,
                        draft_id: verified.context.snapshot.draft_id,
                        target_account: plan.article_plan.intent.target_account,
                        audience: 'everyone',
                        document_digest: verified.materializationPlan.document_digest,
                        preview_observation_ref: verified.previewRef,
                        preview_observed_at: verified.preview.observed_at,
                        preview_revision: verified.preview.page_revision,
                        materialization_receipt_ref: verified.receiptRef,
                        materialization_receipt_digest: verified.receipt.receipt_digest,
                        asset_digests: plan.article_plan.intent.visuals.map((item) => item.asset.digest),
                        bound_at: detached.bound_at
                    };
                    binding = { ...body, binding_digest: sha256(body) };
                    await this.store.writeNew(bindingPath, binding);
                }
                if (binding === undefined || bindingPath === undefined) {
                    throw new HarnessError('APPROVAL_STALE', 'prepared Article binding recovery failed');
                }
                const bindingRef = await this.fileRef(bindingPath);
                const nextProjection = this.createPreparedProjection(detached.bundle_id, projection?.revision ?? 0, bindingRef, detached.bound_at);
                await this.store.replaceAtomic(this.preparedProjectionPath(detached.bundle_id), nextProjection);
                return { ...binding, binding_ref: bindingRef };
            });
        });
    }
    async unbindPreparedArticle(bundleId) {
        await this.store.withLock(this.bundleLockPath(bundleId), async () => {
            const plan = await this.readPlan(bundleId);
            if (await this.store.exists(this.approvalPath(bundleId))) {
                throw new HarnessError('STATE_TRANSITION_INVALID', 'Prepared Article binding cannot be reversed after Bundle approval');
            }
            const projection = await this.optionalPreparedProjection(bundleId);
            if (projection === undefined || projection.active_binding_ref === null)
                return;
            await this.readPreparedBindingRef(plan, projection.active_binding_ref);
            const unbindingPath = this.preparedUnbindingPath(bundleId, projection.revision);
            const body = {
                schema_version: 'publication-bundle-prepared-article-unbinding/v1',
                bundle_id: bundleId,
                binding_ref: projection.active_binding_ref,
                unbound_at: this.now().toISOString()
            };
            const unbinding = {
                ...body,
                unbinding_digest: sha256(body)
            };
            if (await this.store.exists(unbindingPath)) {
                const existing = await this.readJson(unbindingPath);
                if (!isDeepStrictEqual(existing, unbinding)) {
                    throw new HarnessError('APPROVAL_STALE', 'prepared Article unbinding record changed');
                }
            }
            else {
                await this.store.writeNew(unbindingPath, unbinding);
            }
            await this.store.replaceAtomic(this.preparedProjectionPath(bundleId), this.createPreparedProjection(bundleId, projection.revision, null, unbinding.unbound_at));
        });
        return this.status(bundleId);
    }
    async articlePublishConfirmation(bundleId) {
        const plan = await this.readPlan(bundleId);
        const approval = await this.readApproval(plan);
        if (approval.schema_version !== 'publication-bundle-approval/v2') {
            throw new HarnessError('STATE_TRANSITION_INVALID', 'legacy Bundle Approval has no prepared Article confirmation');
        }
        const binding = await this.readPreparedBindingRef(plan, approval.prepared_article_binding_ref);
        this.assertPreparedApproval(plan, approval, binding, this.now());
        return this.readDerivedArticleConfirmation(plan, approval, binding);
    }
    async articleAuthorization(bundleId) {
        const plan = await this.readPlan(bundleId);
        await this.verifySources({
            bundle_id: plan.bundle_id,
            cycle_id: plan.cycle_id,
            cycle_ref: plan.cycle_ref,
            selection_ref: plan.selection_ref,
            research_content_package_ref: plan.research_content_package_ref,
            canonical_article_package: plan.canonical_article_package,
            article_plan: plan.article_plan,
            single_intent: plan.single_intent,
            authorization_ttl_ms: plan.authorization_ttl_ms,
            planned_at: plan.planned_at
        });
        const approval = await this.optionalApproval(plan);
        const now = this.now();
        const gate = approval?.schema_version === 'publication-bundle-approval/v1'
            ? runPublicationBundlePublishGate(plan, approval, now)
            : { passed: false, findings: [] };
        if (!gate.passed || approval?.schema_version !== 'publication-bundle-approval/v1') {
            throw new HarnessError('PUBLISH_GATE_BLOCKED', 'Publication Bundle Publish Gate blocked Article authorization', gate.findings);
        }
        const path = this.articleAuthorizationPath(bundleId);
        if (await this.store.exists(path)) {
            return this.readArticleAuthorization(plan, approval, true);
        }
        const remainingTtl = Date.parse(approval.expires_at) - now.getTime();
        if (remainingTtl <= 0) {
            throw new HarnessError('PUBLISH_GATE_BLOCKED', 'Publication Bundle Approval expired');
        }
        const childApproval = approveXArticlePublication(plan.article_plan, approval.approved_by, remainingTtl, now, () => `x_article_approval_${plan.bundle_id}`);
        const [bundlePlanRef, bundleApprovalRef] = await Promise.all([
            this.fileRef(this.planPath(bundleId)),
            this.fileRef(this.approvalPath(bundleId))
        ]);
        const body = {
            schema_version: 'derived-article-authorization/v1',
            bundle_id: bundleId,
            bundle_plan_ref: bundlePlanRef,
            bundle_approval_ref: bundleApprovalRef,
            child_plan_digest: plan.article_plan.plan_digest,
            child_approval: childApproval,
            issued_at: now.toISOString()
        };
        const authorization = validateContract('derived-article-authorization', { ...body, authorization_digest: sha256(body) });
        await this.store.writeNew(path, authorization);
        return this.readArticleAuthorization(plan, approval, true);
    }
    async bindArticleExecution(input) {
        const plan = await this.readPlan(input.bundle_id);
        const approval = await this.readApproval(plan);
        if (approval.schema_version !== 'publication-bundle-approval/v1') {
            throw new HarnessError('STATE_TRANSITION_INVALID', 'prepared Article executions use the Bundle-derived Publish confirmation');
        }
        assertPublicationBundleApproval(plan, approval, this.now());
        const authorization = await this.readArticleAuthorization(plan, approval, true);
        const inspected = await this.inspector.inspectArticle(input.execution_id);
        if (inspected.snapshot.publish_command_count !== 0 ||
            !exact(inspected.plan, plan.article_plan) ||
            !exact(inspected.approval, authorization.child_approval) ||
            inspected.snapshot.run_id !== plan.article_plan.run_id ||
            inspected.snapshot.plan_id !== plan.article_plan.plan_id) {
            throw new HarnessError('STATE_TRANSITION_INVALID', 'Article execution must match the derived Authorization before any Publish command');
        }
        const path = this.articleExecutionBindingPath(input.bundle_id);
        if (await this.store.exists(path)) {
            const existing = await this.readArticleExecutionBinding(input.bundle_id);
            if (existing.execution_id !== input.execution_id) {
                throw new HarnessError('STATE_TRANSITION_INVALID', 'Publication Bundle already binds a different Article execution');
            }
            return existing;
        }
        const [bundlePlanRef, bundleApprovalRef, authorizationRef] = await Promise.all([
            this.fileRef(this.planPath(input.bundle_id)),
            this.fileRef(this.approvalPath(input.bundle_id)),
            this.fileRef(this.articleAuthorizationPath(input.bundle_id))
        ]);
        const body = {
            schema_version: 'publication-bundle-execution-binding/v1',
            bundle_id: input.bundle_id,
            child_kind: 'x_article',
            bundle_plan_ref: bundlePlanRef,
            bundle_approval_ref: bundleApprovalRef,
            child_authorization_ref: authorizationRef,
            execution_id: input.execution_id,
            run_id: inspected.snapshot.run_id,
            plan_id: inspected.snapshot.plan_id,
            plan_digest: plan.article_plan.plan_digest,
            installed_plan_ref: inspected.installed_plan_ref,
            installed_approval_ref: inspected.installed_approval_ref,
            bound_at: input.bound_at
        };
        const binding = validateContract('publication-bundle-execution-binding', { ...body, binding_digest: sha256(body) });
        await this.store.writeNew(path, binding);
        await this.status(input.bundle_id);
        return this.readArticleExecutionBinding(input.bundle_id);
    }
    async attachArticleReceipt(input) {
        const plan = await this.readPlan(input.bundle_id);
        let executionId;
        let installedPlanRef;
        let executionBindingRef;
        let snapshot;
        if (await this.store.exists(this.articleExecutionBindingPath(input.bundle_id))) {
            const binding = await this.readArticleExecutionBinding(input.bundle_id);
            const inspected = await this.inspector.inspectArticle(binding.execution_id);
            executionId = binding.execution_id;
            installedPlanRef = binding.installed_plan_ref;
            executionBindingRef = await this.fileRef(this.articleExecutionBindingPath(input.bundle_id));
            snapshot = inspected.snapshot;
        }
        else {
            const projection = await this.readPreparedProjection(input.bundle_id);
            if (projection.active_binding_ref === null) {
                throw new HarnessError('APPROVAL_STALE', 'Article Receipt lacks an active execution binding');
            }
            const binding = await this.readPreparedBindingRef(plan, projection.active_binding_ref);
            const context = await this.readJson(`${this.articleAdapterPrefix(binding.execution_id)}/adapter-context.json`);
            executionId = binding.execution_id;
            installedPlanRef = binding.child_plan_ref;
            executionBindingRef = projection.active_binding_ref;
            snapshot = context.snapshot;
        }
        const artifact = await this.store.readContainedArtifact(input.receipt_path);
        if (artifact.digest !== input.receipt_digest ||
            snapshot.latest_receipt_path !== artifact.relative_path) {
            throw new HarnessError('APPROVAL_STALE', 'Article Receipt file binding is stale');
        }
        const receipt = validateContract('x-article-publish-receipt', this.parseJson(artifact.content, input.receipt_path));
        const { receipt_digest: receiptDigest, ...receiptBody } = receipt;
        if (receiptDigest !== sha256(receiptBody) ||
            receipt.execution_id !== executionId ||
            receipt.plan_id !== plan.article_plan.plan_id ||
            receipt.plan_digest !== plan.article_plan.plan_digest ||
            receipt.source_evidence.article_package_digest !==
                plan.article_plan.intent.article_package.digest ||
            receipt.source_evidence.document_digest !== sha256(plan.article_plan.intent.document) ||
            !exact(receipt.source_evidence.asset_digests, plan.article_plan.intent.visuals.map((visual) => visual.asset.digest)) ||
            receipt.status === 'outcome_unknown') {
            throw new HarnessError('ARTICLE_PUBLICATION_CONFLICT', 'Article Receipt does not match the bound execution and Plan evidence');
        }
        let canonicalUrl = null;
        let limitations = [];
        if (receipt.status === 'published' || receipt.status === 'published_media_unverified') {
            if (snapshot.state !== 'finalized' ||
                !receipt.public_evidence.author_match || !receipt.public_evidence.content_match ||
                !receipt.public_evidence.links_match ||
                (receipt.status === 'published' && receipt.public_evidence.media_match !== true) ||
                (receipt.status === 'published_media_unverified' &&
                    receipt.public_evidence.media_match !== null)) {
                throw new HarnessError('ARTICLE_PUBLICATION_CONFLICT', 'Article successful Receipt exceeds its public evidence');
            }
            const url = assertApprovedXArticleUrl(receipt.public_evidence.canonical_url, plan.article_plan.intent.target_account);
            if (url.pathname.split('/').at(-1) !== receipt.public_evidence.article_id) {
                throw new HarnessError('ARTICLE_PUBLICATION_CONFLICT', 'Article canonical URL identity differs from public evidence');
            }
            canonicalUrl = receipt.public_evidence.canonical_url;
            if (receipt.status === 'published_media_unverified') {
                limitations = ['published_media_unverified'];
            }
        }
        else if (receipt.status !== 'verification_conflict' ||
            snapshot.state !== 'verification_conflict') {
            throw new HarnessError('ARTICLE_PUBLICATION_CONFLICT', 'Article terminal Receipt status differs from its execution snapshot');
        }
        else {
            limitations = ['verification_conflict'];
        }
        const path = this.articleReceiptBindingPath(input.bundle_id);
        if (await this.store.exists(path)) {
            const existing = await this.readArticleReceiptBinding(input.bundle_id);
            if (existing.child_receipt_ref.digest !== artifact.digest) {
                throw new HarnessError('APPROVAL_STALE', 'Article Receipt Binding is immutable');
            }
            return this.status(input.bundle_id);
        }
        const body = {
            schema_version: 'publication-bundle-receipt-binding/v1',
            bundle_id: input.bundle_id,
            child_kind: 'x_article',
            execution_binding_ref: executionBindingRef,
            child_plan_ref: installedPlanRef,
            child_plan_digest: plan.article_plan.plan_digest,
            child_receipt_ref: { path: artifact.relative_path, digest: artifact.digest },
            child_receipt_digest: receipt.receipt_digest,
            parsed_status: receipt.status,
            canonical_public_url: canonicalUrl,
            limitations,
            bound_at: receipt.issued_at
        };
        await this.store.writeNew(path, validateContract('publication-bundle-receipt-binding', { ...body, binding_digest: sha256(body) }));
        return this.status(input.bundle_id);
    }
    async materializeSingle(bundleId) {
        const plan = await this.readPlan(bundleId);
        const approval = await this.readApproval(plan);
        await this.assertApprovalForChildAction(plan, approval, this.now());
        const receiptBinding = await this.readArticleReceiptBinding(bundleId);
        if (!['published', 'published_media_unverified'].includes(receiptBinding.parsed_status) ||
            receiptBinding.canonical_public_url === null) {
            throw new HarnessError('STATE_TRANSITION_INVALID', 'Single materialization requires a verified Article Receipt Binding');
        }
        const path = this.materializedSinglePath(bundleId);
        if (await this.store.exists(path))
            return this.readMaterializedSingle(plan, receiptBinding);
        const finalText = materializeXArticleUrl(plan.single_intent.text_template, receiptBinding.canonical_public_url, plan.single_intent.target_account);
        const provenance = {
            publication_bundle_plan_digest: plan.bundle_digest,
            article_receipt_binding_digest: receiptBinding.binding_digest,
            substitution_rule_digest: sha256(plan.substitution)
        };
        const childPlan = plan.single_intent.visual_asset === null
            ? createPublicationPlanV2({
                planId: `x_single_plan_${bundleId}`,
                runId: plan.single_intent.run_id,
                targetAccount: plan.single_intent.target_account,
                adapter: 'browser',
                mode: 'single',
                targetPost: null,
                media: [],
                items: [{ ordinal: 1, text: finalText }],
                plannedAt: this.now().toISOString(),
                provenance
            })
            : createPublicationPlanV2_1({
                planId: `x_single_plan_${bundleId}`,
                runId: plan.single_intent.run_id,
                targetAccount: plan.single_intent.target_account,
                mode: 'single',
                targetPost: null,
                items: [{
                        ordinal: 1,
                        text: finalText,
                        attachments: [plan.single_intent.visual_asset]
                    }],
                articlePackage: plan.single_intent.article_package,
                authorizedAsset: plan.single_intent.visual_asset,
                plannedAt: this.now().toISOString(),
                provenance
            });
        const [bundlePlanRef, articleReceiptBindingRef] = await Promise.all([
            this.fileRef(this.planPath(bundleId)),
            this.fileRef(this.articleReceiptBindingPath(bundleId))
        ]);
        const body = {
            schema_version: 'materialized-single-publication/v1',
            bundle_id: bundleId,
            bundle_plan_ref: bundlePlanRef,
            article_receipt_binding_ref: articleReceiptBindingRef,
            canonical_article_url: receiptBinding.canonical_public_url,
            final_text: finalText,
            child_plan: childPlan,
            materialized_at: this.now().toISOString()
        };
        await this.store.writeNew(path, validateContract('materialized-single-publication', { ...body, materialization_digest: sha256(body) }));
        await this.status(bundleId);
        return this.readMaterializedSingle(plan, receiptBinding);
    }
    async singleAuthorization(bundleId) {
        if (await this.store.exists(this.singleExecutionBindingPath(bundleId))) {
            throw new HarnessError('STATE_TRANSITION_INVALID', 'Single execution is already bound; authorization cannot be replayed');
        }
        const plan = await this.readPlan(bundleId);
        const approval = await this.readApproval(plan);
        const now = this.now();
        await this.assertApprovalForChildAction(plan, approval, now);
        const receiptBinding = await this.readArticleReceiptBinding(bundleId);
        const materialized = await this.readMaterializedSingle(plan, receiptBinding);
        const path = this.singleAuthorizationPath(bundleId);
        if (await this.store.exists(path)) {
            return this.readSingleAuthorization(plan, approval, materialized, true);
        }
        const remainingTtl = Date.parse(approval.expires_at) - now.getTime();
        if (remainingTtl <= 0) {
            throw new HarnessError('PUBLISH_GATE_BLOCKED', 'Publication Bundle Approval expired');
        }
        const childApproval = materialized.child_plan.schema_version === '2.0'
            ? approvePublicationV2(materialized.child_plan, approval.approved_by, remainingTtl, now, () => `x_single_approval_${bundleId}`)
            : approvePublicationV2_1(materialized.child_plan, approval.approved_by, remainingTtl, now, () => `x_single_approval_${bundleId}`);
        const [bundlePlanRef, bundleApprovalRef, materializedSingleRef] = await Promise.all([
            this.fileRef(this.planPath(bundleId)),
            this.fileRef(this.approvalPath(bundleId)),
            this.fileRef(this.materializedSinglePath(bundleId))
        ]);
        const body = {
            schema_version: 'derived-single-authorization/v1',
            bundle_id: bundleId,
            bundle_plan_ref: bundlePlanRef,
            bundle_approval_ref: bundleApprovalRef,
            materialized_single_ref: materializedSingleRef,
            child_plan_digest: materialized.child_plan.plan_digest,
            child_approval: childApproval,
            issued_at: now.toISOString()
        };
        await this.store.writeNew(path, validateContract('derived-single-authorization', { ...body, authorization_digest: sha256(body) }));
        await this.status(bundleId);
        return this.readSingleAuthorization(plan, approval, materialized, true);
    }
    async bindSingleExecution(input) {
        const plan = await this.readPlan(input.bundle_id);
        const approval = await this.readApproval(plan);
        await this.assertApprovalForChildAction(plan, approval, this.now());
        const materialized = await this.readMaterializedSingle(plan, await this.readArticleReceiptBinding(input.bundle_id));
        const authorization = await this.readSingleAuthorization(plan, approval, materialized, true);
        const inspected = await this.inspector.inspectSingle(materialized.child_plan.run_id, input.execution_id);
        if (inspected.snapshot.submit_command_count !== 0 ||
            !exact(inspected.plan, materialized.child_plan) ||
            !exact(inspected.approval, authorization.child_approval) ||
            inspected.snapshot.plan_id !== materialized.child_plan.plan_id) {
            throw new HarnessError('STATE_TRANSITION_INVALID', 'Single execution must match the derived Authorization before any Submit command');
        }
        const path = this.singleExecutionBindingPath(input.bundle_id);
        if (await this.store.exists(path)) {
            const existing = await this.readSingleExecutionBinding(input.bundle_id);
            if (existing.execution_id !== input.execution_id) {
                throw new HarnessError('STATE_TRANSITION_INVALID', 'Publication Bundle already binds a different Single execution');
            }
            return existing;
        }
        const [bundlePlanRef, bundleApprovalRef, authorizationRef] = await Promise.all([
            this.fileRef(this.planPath(input.bundle_id)),
            this.fileRef(this.approvalPath(input.bundle_id)),
            this.fileRef(this.singleAuthorizationPath(input.bundle_id))
        ]);
        const body = {
            schema_version: 'publication-bundle-execution-binding/v1',
            bundle_id: input.bundle_id,
            child_kind: 'x_single',
            bundle_plan_ref: bundlePlanRef,
            bundle_approval_ref: bundleApprovalRef,
            child_authorization_ref: authorizationRef,
            execution_id: input.execution_id,
            run_id: inspected.snapshot.run_id,
            plan_id: inspected.snapshot.plan_id,
            plan_digest: materialized.child_plan.plan_digest,
            installed_plan_ref: inspected.installed_plan_ref,
            installed_approval_ref: inspected.installed_approval_ref,
            bound_at: input.bound_at
        };
        await this.store.writeNew(path, validateContract('publication-bundle-execution-binding', { ...body, binding_digest: sha256(body) }));
        await this.status(input.bundle_id);
        return this.readSingleExecutionBinding(input.bundle_id);
    }
    async attachSingleReceipt(input) {
        const executionBinding = await this.readSingleExecutionBinding(input.bundle_id);
        const inspected = await this.inspector.inspectSingle(executionBinding.run_id, executionBinding.execution_id);
        const artifact = await this.store.readContainedArtifact(input.receipt_path);
        if (artifact.digest !== input.receipt_digest ||
            inspected.latest_receipt_path !== artifact.relative_path) {
            throw new HarnessError('APPROVAL_STALE', 'Single Receipt file binding is stale');
        }
        const receipt = this.parseJson(artifact.content, input.receipt_path);
        const verified = this.verifySingleReceipt(inspected.plan, inspected.approval, inspected.snapshot.state, executionBinding, receipt);
        const path = this.singleReceiptBindingPath(input.bundle_id, receipt.receipt_id);
        if (!(await this.store.exists(path))) {
            const executionBindingRef = await this.fileRef(this.singleExecutionBindingPath(input.bundle_id));
            const body = {
                schema_version: 'publication-bundle-receipt-binding/v1',
                bundle_id: input.bundle_id,
                child_kind: 'x_single',
                execution_binding_ref: executionBindingRef,
                child_plan_ref: executionBinding.installed_plan_ref,
                child_plan_digest: executionBinding.plan_digest,
                child_receipt_ref: { path: artifact.relative_path, digest: artifact.digest },
                child_receipt_digest: sha256(receipt),
                parsed_status: verified.parsedStatus,
                canonical_public_url: verified.canonicalUrl,
                limitations: verified.limitations,
                bound_at: receipt.created_at
            };
            await this.store.writeNew(path, validateContract('publication-bundle-receipt-binding', { ...body, binding_digest: sha256(body) }));
        }
        else {
            await this.readSingleReceiptBinding(input.bundle_id, receipt.receipt_id);
        }
        if (!verified.success)
            return this.status(input.bundle_id);
        return this.issueJointReceipt(input.bundle_id, receipt.receipt_id);
    }
    async status(bundleId) {
        const plan = await this.readPlan(bundleId);
        let phase = 'planned';
        let updatedAt = plan.planned_at;
        let limitations = [];
        let articleExecutionBindingRef = null;
        let articleReceiptBindingRef = null;
        let singleExecutionBindingRef = null;
        let singleReceiptBindingRef = null;
        let jointReceiptRef = null;
        const approval = await this.store.exists(this.approvalPath(bundleId))
            ? await this.readApproval(plan)
            : null;
        const preparedProjection = await this.optionalPreparedProjection(bundleId);
        let preparedBinding = null;
        if (preparedProjection !== undefined) {
            updatedAt = preparedProjection.updated_at;
            if (preparedProjection.active_binding_ref === null) {
                phase = 'article_materializing';
            }
            else {
                preparedBinding = await this.readPreparedBindingRef(plan, preparedProjection.active_binding_ref);
                articleExecutionBindingRef = preparedProjection.active_binding_ref;
                updatedAt = preparedBinding.bound_at;
                phase = 'article_preview_ready';
            }
        }
        if (approval !== null) {
            phase = approval.schema_version === 'publication-bundle-approval/v2'
                ? 'confirmation_pending'
                : 'approved';
            updatedAt = approval.approved_at;
        }
        if (approval?.schema_version === 'publication-bundle-approval/v2') {
            if (preparedBinding === null) {
                throw new HarnessError('APPROVAL_STALE', 'Bundle V2 Approval lacks active prepared binding');
            }
            await this.readDerivedArticleConfirmation(plan, approval, preparedBinding);
            const context = await this.readJson(`${this.articleAdapterPrefix(preparedBinding.execution_id)}/adapter-context.json`);
            if (context.snapshot.state === 'publish_armed') {
                phase = 'article_authorized';
                updatedAt = context.snapshot.updated_at;
            }
            else if (context.snapshot.state !== 'confirmation_pending') {
                phase = this.articleSnapshotPhase(context.snapshot.state);
                updatedAt = context.snapshot.updated_at;
            }
        }
        if (await this.store.exists(this.articleAuthorizationPath(bundleId))) {
            if (approval?.schema_version !== 'publication-bundle-approval/v1') {
                throw new HarnessError('APPROVAL_STALE', 'Article Authorization lacks legacy Bundle Approval');
            }
            await this.readArticleAuthorization(plan, approval, false);
            phase = 'article_authorized';
        }
        if (await this.store.exists(this.articleExecutionBindingPath(bundleId))) {
            const binding = await this.readArticleExecutionBinding(bundleId);
            articleExecutionBindingRef = await this.fileRef(this.articleExecutionBindingPath(bundleId));
            const inspected = await this.inspector.inspectArticle(binding.execution_id);
            updatedAt = inspected.snapshot.updated_at;
            phase = this.articleSnapshotPhase(inspected.snapshot.state);
        }
        if (await this.store.exists(this.articleReceiptBindingPath(bundleId))) {
            const binding = await this.readArticleReceiptBinding(bundleId);
            articleReceiptBindingRef = await this.fileRef(this.articleReceiptBindingPath(bundleId));
            limitations = binding.limitations;
            updatedAt = binding.bound_at;
            phase = binding.parsed_status === 'verification_conflict'
                ? 'article_verification_conflict'
                : 'article_verified';
        }
        if (await this.store.exists(this.materializedSinglePath(bundleId))) {
            if (articleReceiptBindingRef === null) {
                throw new HarnessError('APPROVAL_STALE', 'Materialized Single lacks Article Receipt evidence');
            }
            await this.readMaterializedSingle(plan, await this.readArticleReceiptBinding(bundleId));
            phase = 'single_materialized';
        }
        if (await this.store.exists(this.singleAuthorizationPath(bundleId))) {
            if (approval === null) {
                throw new HarnessError('APPROVAL_STALE', 'Single Authorization lacks Bundle Approval');
            }
            const materialized = await this.readMaterializedSingle(plan, await this.readArticleReceiptBinding(bundleId));
            await this.readSingleAuthorization(plan, approval, materialized, false);
            phase = 'single_authorized';
        }
        if (await this.store.exists(this.singleExecutionBindingPath(bundleId))) {
            const binding = await this.readSingleExecutionBinding(bundleId);
            singleExecutionBindingRef = await this.fileRef(this.singleExecutionBindingPath(bundleId));
            const inspected = await this.inspector.inspectSingle(binding.run_id, binding.execution_id);
            phase = this.singleSnapshotPhase(inspected.snapshot.state);
            updatedAt = inspected.snapshot.updated_at;
            if (inspected.latest_receipt_path !== null) {
                const latestReceipt = await this.readJson(inspected.latest_receipt_path);
                const receiptBindingPath = this.singleReceiptBindingPath(bundleId, latestReceipt.receipt_id);
                if (await this.store.exists(receiptBindingPath)) {
                    const receiptBinding = await this.readSingleReceiptBinding(bundleId, latestReceipt.receipt_id);
                    singleReceiptBindingRef = await this.fileRef(receiptBindingPath);
                    limitations = [...new Set([...limitations, ...receiptBinding.limitations])];
                    updatedAt = receiptBinding.bound_at;
                    phase = this.singleReceiptPhase(receiptBinding.parsed_status);
                }
            }
        }
        if (await this.store.exists(this.jointReceiptPath(bundleId))) {
            await this.readJointReceipt(bundleId);
            jointReceiptRef = await this.fileRef(this.jointReceiptPath(bundleId));
            phase = 'completed';
        }
        if (approval !== null && Date.parse(approval.expires_at) <= this.now().getTime() &&
            ![
                'article_verification_conflict', 'article_terminal_failure',
                'single_verification_conflict', 'single_terminal_failure', 'completed'
            ].includes(phase)) {
            phase = 'approval_expired';
            updatedAt = approval.expires_at;
        }
        const body = {
            schema_version: 'publication-bundle-status/v1',
            bundle_id: bundleId,
            cycle_id: plan.cycle_id,
            bundle_plan_ref: await this.fileRef(this.planPath(bundleId)),
            phase,
            article_execution_binding_ref: articleExecutionBindingRef,
            article_receipt_binding_ref: articleReceiptBindingRef,
            single_execution_binding_ref: singleExecutionBindingRef,
            single_receipt_binding_ref: singleReceiptBindingRef,
            joint_receipt_ref: jointReceiptRef,
            limitations,
            updated_at: updatedAt
        };
        const status = validateContract('publication-bundle-status', {
            ...body,
            projection_digest: sha256(body)
        });
        await this.store.replaceAtomic(this.statusPath(bundleId), status);
        return this.readBundleStatus(bundleId);
    }
    async approvePreparedArticle(input) {
        const detached = structuredClone(input);
        return this.store.withLock(this.bundleLockPath(detached.bundle_id), async () => {
            const plan = await this.readPlan(detached.bundle_id);
            const projection = await this.readPreparedProjection(detached.bundle_id);
            if (projection.active_binding_ref === null) {
                throw new HarnessError('PUBLISH_GATE_BLOCKED', 'Bundle confirmation requires an active prepared Article binding');
            }
            const binding = await this.readPreparedBindingRef(plan, projection.active_binding_ref);
            await this.store.withLock(this.articleAdapterLockPath(binding.execution_id), async () => {
                await this.verifyPreparedArticle(plan, {
                    bundle_id: detached.bundle_id,
                    execution_id: binding.execution_id,
                    preview_revision: binding.preview_revision,
                    materialization_receipt_ref: binding.materialization_receipt_ref,
                    bound_at: binding.bound_at
                });
            });
            if (detached.confirmed_bundle_digest !== plan.bundle_digest
                || detached.confirmed_preview_revision !== binding.preview_revision
                || detached.approved_by.trim().length === 0) {
                throw new HarnessError('APPROVAL_STALE', 'Bundle confirmation does not match the active verified Article Preview');
            }
            const path = this.approvalPath(detached.bundle_id);
            if (await this.store.exists(path)) {
                const existing = await this.readApproval(plan);
                if (existing.schema_version !== 'publication-bundle-approval/v2'
                    || existing.bundle_digest !== detached.confirmed_bundle_digest
                    || existing.confirmed_preview_revision !== detached.confirmed_preview_revision
                    || existing.approved_by !== detached.approved_by
                    || !exact(existing.prepared_article_binding_ref, projection.active_binding_ref)) {
                    throw new HarnessError('APPROVAL_STALE', 'Publication Bundle Approval is immutable');
                }
                await this.persistDerivedArticleConfirmation(plan, existing, binding);
                return existing;
            }
            const approvedAt = this.now().toISOString();
            const body = {
                schema_version: 'publication-bundle-approval/v2',
                approval_id: this.approvalId(),
                bundle_id: plan.bundle_id,
                bundle_digest: plan.bundle_digest,
                target_account: binding.target_account,
                scope: 'publish_bundle_once',
                confirmed_preview_revision: binding.preview_revision,
                prepared_article_binding_ref: projection.active_binding_ref,
                approved_by: detached.approved_by,
                approved_at: approvedAt,
                expires_at: new Date(Date.parse(approvedAt) + plan.authorization_ttl_ms).toISOString()
            };
            const approval = validateContract('publication-bundle-approval-v2', { ...body, approval_digest: sha256(body) });
            this.assertPreparedApproval(plan, approval, binding);
            await this.store.writeNew(path, approval);
            await this.persistDerivedArticleConfirmation(plan, approval, binding);
            return (await this.readApproval(plan));
        });
    }
    async verifyPreparedArticle(plan, input) {
        const prefix = this.articleAdapterPrefix(input.execution_id);
        const [planArtifact, materializationArtifact, checkpointArtifact, contextArtifact] = await Promise.all([
            this.store.readContainedArtifact(`${prefix}/plan.json`),
            this.store.readContainedArtifact(`${prefix}/materialization-plan.json`),
            this.store.readContainedArtifact(`${prefix}/materialization-checkpoint.json`),
            this.store.readContainedArtifact(`${prefix}/adapter-context.json`)
        ]);
        const childPlan = this.parseJson(planArtifact.content, 'prepared Article Plan');
        assertXArticlePublicationPlan(childPlan);
        const materializationPlan = validateContract('x-article-materialization-plan', this.parseJson(materializationArtifact.content, 'prepared materialization Plan'));
        const checkpoint = validateContract('x-article-materialization-checkpoint', this.parseJson(checkpointArtifact.content, 'prepared materialization checkpoint'));
        const rawContext = this.parseJson(contextArtifact.content, 'prepared Article context');
        if (typeof rawContext !== 'object' || rawContext === null || Array.isArray(rawContext)) {
            throw new HarnessError('PUBLISH_GATE_BLOCKED', 'prepared Article context is malformed');
        }
        const rawSnapshot = Reflect.get(rawContext, 'snapshot');
        if (typeof rawSnapshot !== 'object' || rawSnapshot === null || Array.isArray(rawSnapshot)) {
            throw new HarnessError('PUBLISH_GATE_BLOCKED', 'prepared Article snapshot is malformed');
        }
        const context = rawContext;
        const canonicalMaterialization = createXArticleMaterializationPlan({
            execution_id: input.execution_id,
            publication_plan: plan.article_plan,
            import_template: createXArticleImportTemplate(plan.article_plan.intent.document),
            strategy: materializationPlan.strategy
        });
        if (input.bundle_id !== plan.bundle_id
            || !exact(childPlan, plan.article_plan)
            || !exact(materializationPlan, canonicalMaterialization)
            || context.schema_version !== '1.0'
            || context.execution_mode !== 'materialization_v3_2'
            || context.approval !== null
            || !exact(context.plan, childPlan)
            || !exact(context.materialization_plan, materializationPlan)
            || context.snapshot.execution_id !== input.execution_id
            || context.snapshot.run_id !== plan.article_plan.run_id
            || context.snapshot.plan_id !== plan.article_plan.plan_id
            || context.snapshot.state !== 'confirmation_pending'
            || context.snapshot.draft_id === null
            || context.snapshot.publish_command_count !== 0
            || context.pending_command !== null
            || context.pending_issue !== null
            || context.submit_delivered
            || checkpoint.execution_id !== input.execution_id
            || checkpoint.materialization_digest !== materializationPlan.materialization_digest
            || checkpoint.draft_id !== context.snapshot.draft_id
            || checkpoint.phase !== 'preview_verified'
            || checkpoint.publish_confirmation !== 'absent'
            || materializationPlan.publication_plan_digest !== plan.article_plan.plan_digest) {
            throw new HarnessError('PUBLISH_GATE_BLOCKED', 'prepared Article does not match the Bundle child Plan at confirmation_pending');
        }
        if (await this.store.exists(`${prefix}/publish-confirmation.json`)
            || await this.store.exists(`${prefix}/publish-confirmation-consumption.json`)) {
            throw new HarnessError('PUBLISH_GATE_BLOCKED', 'prepared Article already has Publish confirmation or consumption evidence');
        }
        const commandEntries = await this.store.list(`${prefix}/commands`);
        let commandCount = 0;
        for (const entry of commandEntries) {
            if (entry.kind !== 'directory') {
                throw new HarnessError('PUBLISH_GATE_BLOCKED', 'prepared Article command history is malformed');
            }
            const command = validateContract('x-article-browser-command', await this.readJson(`${entry.relative_path}/command.json`));
            commandCount += 1;
            const commandFiles = await this.store.list(entry.relative_path);
            if (commandFiles.some((file) => file.kind !== 'file' || !['command.json', 'claim.json'].includes(file.name))) {
                throw new HarnessError('PUBLISH_GATE_BLOCKED', 'prepared Article command history is malformed');
            }
            if (command.execution_id !== input.execution_id
                || command.run_id !== plan.article_plan.run_id
                || command.payload_digest !== sha256(command.payload)) {
                throw new HarnessError('PUBLISH_GATE_BLOCKED', 'prepared Article command history is foreign');
            }
            if (await this.store.exists(`${entry.relative_path}/claim.json`)) {
                const claim = await this.readJson(`${entry.relative_path}/claim.json`);
                if (claim.schema_version !== '1.0'
                    || claim.execution_id !== input.execution_id
                    || claim.command_id !== command.command_id
                    || claim.claimed !== true
                    || !Number.isFinite(Date.parse(claim.claimed_at))) {
                    throw new HarnessError('PUBLISH_GATE_BLOCKED', 'prepared Article command claim is stale');
                }
            }
            if (command.kind === 'publish_article_once') {
                throw new HarnessError('PUBLISH_GATE_BLOCKED', 'prepared Article already issued a Publish command');
            }
        }
        const observationEntries = await this.store.list(`${prefix}/observations`);
        if (observationEntries.some((entry) => entry.kind !== 'file' || !entry.name.endsWith('.json'))) {
            throw new HarnessError('PUBLISH_GATE_BLOCKED', 'prepared Article observation history is malformed');
        }
        for (const entry of observationEntries) {
            const observation = validateContract('x-article-browser-observation', await this.readJson(entry.relative_path));
            const observationBody = Object.fromEntries(Object.entries(observation).filter(([key]) => key !== 'page_revision'));
            if (observation.execution_id !== input.execution_id
                || observation.page_revision !== computeXArticlePageRevision(observationBody)) {
                throw new HarnessError('PUBLISH_GATE_BLOCKED', 'prepared Article observation history is stale');
            }
        }
        const receiptArtifact = await this.store.readContainedArtifact(input.materialization_receipt_ref.path);
        if (receiptArtifact.relative_path !== `${prefix}/materialization-receipt.json`
            || receiptArtifact.digest !== input.materialization_receipt_ref.digest) {
            throw new HarnessError('PUBLISH_GATE_BLOCKED', 'materialization Preview receipt ref is stale');
        }
        const receipt = validateContract('x-article-materialization-receipt', this.parseJson(receiptArtifact.content, 'materialization Preview receipt'));
        const previewId = context.latest_preview_observation_id;
        if (previewId === null || context.snapshot.latest_observation_id !== previewId) {
            throw new HarnessError('PUBLISH_GATE_BLOCKED', 'prepared Article lacks the latest verified Preview');
        }
        const previewArtifact = await this.store.readContainedArtifact(`${prefix}/observations/${previewId}.json`);
        const preview = validateContract('x-article-browser-observation', this.parseJson(previewArtifact.content, 'prepared Article Preview'));
        const previewBody = Object.fromEntries(Object.entries(preview).filter(([key]) => key !== 'page_revision'));
        const start = await this.readJson(`${prefix}/materialization-start.json`);
        if (typeof start !== 'object' || start === null || !Number.isFinite(Date.parse(start.started_at))) {
            throw new HarnessError('PUBLISH_GATE_BLOCKED', 'materialization start evidence is malformed');
        }
        const recreatedStart = createXArticleMaterializationStartEvidence({
            plan: materializationPlan,
            started_at: start.started_at
        });
        const progress = await this.readPreparedProgress(input.execution_id);
        const recreatedReceipt = createXArticleMaterializationReceipt({
            plan: materializationPlan,
            checkpoint,
            progress,
            body_block_count: receipt.body_block_count,
            command_count: receipt.command_count,
            observation_count: receipt.observation_count,
            automation_started_at: start.started_at,
            preview_verified_at: checkpoint.updated_at,
            human_wait_seconds: receipt.human_wait_seconds,
            preview_revision: preview.page_revision,
            issued_at: receipt.issued_at
        });
        if (!isDeepStrictEqual(start, recreatedStart)
            || !isDeepStrictEqual(receipt, recreatedReceipt)
            || receipt.supersedes_receipt_digest !== null
            || receipt.execution_id !== input.execution_id
            || receipt.draft_id !== context.snapshot.draft_id
            || receipt.materialization_digest !== materializationPlan.materialization_digest
            || receipt.preview_revision !== input.preview_revision
            || input.preview_revision !== preview.page_revision
            || !Number.isFinite(Date.parse(input.bound_at))
            || !Number.isFinite(Date.parse(preview.observed_at))
            || Date.parse(input.bound_at) < Date.parse(preview.observed_at)
            || preview.page_revision !== computeXArticlePageRevision(previewBody)
            || preview.execution_id !== input.execution_id
            || preview.account_handle !== plan.article_plan.intent.target_account
            || preview.page_kind !== 'article_preview'
            || context.preview_revision !== preview.page_revision
            || context.latest_observation === null
            || !isDeepStrictEqual(context.latest_observation, preview)
            || receipt.command_count !== commandCount
            || receipt.observation_count !== observationEntries.length) {
            throw new HarnessError('PUBLISH_GATE_BLOCKED', 'prepared Article Preview, receipt, checkpoint, or activity evidence is stale');
        }
        return {
            context,
            materializationPlan,
            checkpoint,
            receipt,
            planRef: { path: planArtifact.relative_path, digest: planArtifact.digest },
            materializationPlanRef: {
                path: materializationArtifact.relative_path,
                digest: materializationArtifact.digest
            },
            previewRef: { path: previewArtifact.relative_path, digest: previewArtifact.digest },
            receiptRef: { path: receiptArtifact.relative_path, digest: receiptArtifact.digest },
            preview
        };
    }
    async readPreparedProgress(executionId) {
        const path = `${this.articleAdapterPrefix(executionId)}/materialization-progress.jsonl`;
        if (!(await this.store.exists(path)))
            return [];
        const content = await this.store.readText(path);
        if (!content.endsWith('\n')) {
            throw new HarnessError('PUBLISH_GATE_BLOCKED', 'materialization progress is truncated');
        }
        const lines = content.slice(0, -1).split('\n');
        if (lines.some((line) => line.length === 0)) {
            throw new HarnessError('PUBLISH_GATE_BLOCKED', 'materialization progress contains a blank record');
        }
        return lines.map((line) => {
            let value;
            try {
                value = JSON.parse(line);
            }
            catch (error) {
                throw new HarnessError('PUBLISH_GATE_BLOCKED', 'materialization progress is invalid', error);
            }
            const progress = validateContract('x-article-materialization-progress', value);
            if (progress.execution_id !== executionId) {
                throw new HarnessError('PUBLISH_GATE_BLOCKED', 'materialization progress is foreign');
            }
            return progress;
        });
    }
    preparedBindingMatchesInput(binding, input, verified) {
        return binding.bundle_id === input.bundle_id
            && binding.execution_id === input.execution_id
            && binding.preview_revision === input.preview_revision
            && binding.bound_at === input.bound_at
            && exact(binding.materialization_receipt_ref, input.materialization_receipt_ref)
            && exact(binding.child_plan_ref, verified.planRef)
            && exact(binding.materialization_plan_ref, verified.materializationPlanRef)
            && exact(binding.preview_observation_ref, verified.previewRef)
            && binding.materialization_receipt_digest === verified.receipt.receipt_digest;
    }
    createPreparedProjection(bundleId, currentRevision, activeBindingRef, updatedAt) {
        const body = {
            schema_version: 'publication-bundle-prepared-article-projection/v1',
            bundle_id: bundleId,
            revision: currentRevision + 1,
            active_binding_ref: activeBindingRef,
            updated_at: updatedAt
        };
        return { ...body, projection_digest: sha256(body) };
    }
    async optionalPreparedProjection(bundleId) {
        return await this.store.exists(this.preparedProjectionPath(bundleId))
            ? this.readPreparedProjection(bundleId)
            : undefined;
    }
    async readPreparedProjection(bundleId) {
        const projection = await this.readJson(this.preparedProjectionPath(bundleId));
        const { projection_digest: digest, ...body } = projection;
        if (digest !== sha256(body)
            || projection.schema_version !== 'publication-bundle-prepared-article-projection/v1'
            || projection.bundle_id !== bundleId
            || !Number.isInteger(projection.revision)
            || projection.revision < 1) {
            throw new HarnessError('APPROVAL_STALE', 'prepared Article active projection is stale');
        }
        if (projection.active_binding_ref !== null) {
            const artifact = await this.store.readContainedArtifact(projection.active_binding_ref.path);
            if (artifact.digest !== projection.active_binding_ref.digest) {
                throw new HarnessError('APPROVAL_STALE', 'prepared Article active binding ref is stale');
            }
        }
        return projection;
    }
    async readPreparedBindingRef(plan, ref) {
        const artifact = await this.store.readContainedArtifact(ref.path);
        const value = this.parseJson(artifact.content, 'prepared Article binding');
        const { binding_digest: digest, ...body } = value;
        const expectedPath = this.preparedBindingPath(plan.bundle_id, value.binding_version);
        const [planRef, childPlanRef, materializationPlanRef, previewRef, receiptRef] = await Promise.all([
            this.fileRef(this.planPath(plan.bundle_id)),
            this.fileRef(`${this.articleAdapterPrefix(value.execution_id)}/plan.json`),
            this.fileRef(`${this.articleAdapterPrefix(value.execution_id)}/materialization-plan.json`),
            this.fileRef(value.preview_observation_ref.path),
            this.fileRef(value.materialization_receipt_ref.path)
        ]);
        if (artifact.digest !== ref.digest
            || artifact.relative_path !== expectedPath
            || value.schema_version !== 'publication-bundle-prepared-article-binding/v1'
            || value.bundle_id !== plan.bundle_id
            || digest !== sha256(body)
            || !exact(value.bundle_plan_ref, planRef)
            || !exact(value.child_plan_ref, childPlanRef)
            || !exact(value.materialization_plan_ref, materializationPlanRef)
            || !exact(value.preview_observation_ref, previewRef)
            || !exact(value.materialization_receipt_ref, receiptRef)
            || value.child_plan_digest !== plan.article_plan.plan_digest
            || value.target_account !== plan.article_plan.intent.target_account
            || value.audience !== 'everyone'
            || !exact(value.asset_digests, plan.article_plan.intent.visuals.map((item) => item.asset.digest))) {
            throw new HarnessError('APPROVAL_STALE', 'prepared Article binding is stale');
        }
        return value;
    }
    async isPreparedBindingUnbound(bundleId, bindingRef) {
        const entries = await this.store.list(`runs/${bundleId}/publication-bundle/prepared-article-unbindings`);
        for (const entry of entries) {
            if (entry.kind !== 'file' || !/^\d{6}\.json$/.test(entry.name)) {
                throw new HarnessError('APPROVAL_STALE', 'prepared Article unbinding history is malformed');
            }
            const value = await this.readJson(entry.relative_path);
            const { unbinding_digest: digest, ...body } = value;
            if (value.schema_version !== 'publication-bundle-prepared-article-unbinding/v1'
                || value.bundle_id !== bundleId
                || digest !== sha256(body)) {
                throw new HarnessError('APPROVAL_STALE', 'prepared Article unbinding record is stale');
            }
            if (exact(value.binding_ref, bindingRef))
                return true;
        }
        return false;
    }
    async ensurePreparedExecutionOwner(plan, executionId) {
        const path = this.preparedExecutionOwnerPath(executionId);
        const body = {
            schema_version: 'publication-bundle-prepared-execution-owner/v1',
            execution_id: executionId,
            bundle_id: plan.bundle_id,
            bundle_plan_ref: await this.fileRef(this.planPath(plan.bundle_id)),
            child_plan_digest: plan.article_plan.plan_digest
        };
        const owner = {
            ...body,
            owner_digest: sha256(body)
        };
        if (await this.store.exists(path)) {
            const existing = await this.readJson(path);
            const { owner_digest: digest, ...existingBody } = existing;
            if (digest !== sha256(existingBody)
                || !isDeepStrictEqual(existing, owner)) {
                throw new HarnessError('PUBLISH_GATE_BLOCKED', 'prepared Article execution already belongs to a different Publication Bundle');
            }
            return;
        }
        await this.store.writeNew(path, owner);
    }
    assertPreparedApproval(plan, approval, binding, now) {
        validateContract('publication-bundle-approval-v2', approval);
        const { approval_digest: digest, ...body } = approval;
        if (approval.bundle_id !== plan.bundle_id
            || approval.bundle_digest !== plan.bundle_digest
            || approval.target_account !== binding.target_account
            || approval.scope !== 'publish_bundle_once'
            || approval.confirmed_preview_revision !== binding.preview_revision
            || approval.prepared_article_binding_ref.path !== this.preparedBindingPath(plan.bundle_id, binding.binding_version)
            || approval.approved_by.trim().length === 0
            || Date.parse(approval.expires_at) - Date.parse(approval.approved_at)
                !== plan.authorization_ttl_ms
            || digest !== sha256(body)) {
            throw new HarnessError('APPROVAL_STALE', 'Publication Bundle V2 Approval is stale');
        }
        if (now !== undefined && Date.parse(approval.expires_at) <= now.getTime()) {
            throw new HarnessError('APPROVAL_STALE', 'Publication Bundle Approval is expired');
        }
    }
    async persistDerivedArticleConfirmation(plan, approval, binding) {
        this.assertPreparedApproval(plan, approval, binding);
        const confirmation = createXArticlePublishConfirmation({
            confirmation_id: `bundle_confirmation_${plan.bundle_id}`,
            execution_id: binding.execution_id,
            draft_id: binding.draft_id,
            target_account: binding.target_account,
            audience: 'everyone',
            plan_digest: binding.child_plan_digest,
            document_digest: binding.document_digest,
            preview_revision: binding.preview_revision,
            asset_digests: binding.asset_digests,
            confirmed_by: approval.approved_by,
            confirmed_at: approval.approved_at
        });
        verifyXArticlePublishConfirmation(confirmation, {
            execution_id: binding.execution_id,
            draft_id: binding.draft_id,
            target_account: binding.target_account,
            audience: 'everyone',
            plan_digest: binding.child_plan_digest,
            document_digest: binding.document_digest,
            preview_revision: binding.preview_revision,
            asset_digests: binding.asset_digests,
            confirmed_at_not_before: binding.preview_observed_at,
            confirmed_at_not_after: approval.approved_at
        });
        const path = this.articlePublishConfirmationPath(plan.bundle_id);
        if (await this.store.exists(path)) {
            const existing = await this.readJson(path);
            if (!isDeepStrictEqual(existing, confirmation)) {
                throw new HarnessError('APPROVAL_STALE', 'derived Article confirmation is immutable');
            }
        }
        else {
            await this.store.writeNew(path, confirmation);
        }
        return confirmation;
    }
    async readDerivedArticleConfirmation(plan, approval, binding) {
        const confirmation = await this.readContract(this.articlePublishConfirmationPath(plan.bundle_id), 'x-article-publish-confirmation');
        verifyXArticlePublishConfirmation(confirmation, {
            execution_id: binding.execution_id,
            draft_id: binding.draft_id,
            target_account: binding.target_account,
            audience: 'everyone',
            plan_digest: binding.child_plan_digest,
            document_digest: binding.document_digest,
            preview_revision: binding.preview_revision,
            asset_digests: binding.asset_digests,
            confirmed_at_not_before: binding.preview_observed_at,
            confirmed_at_not_after: approval.approved_at
        });
        return confirmation;
    }
    async assertApprovalForChildAction(plan, approval, now) {
        if (approval.schema_version === 'publication-bundle-approval/v1') {
            const gate = runPublicationBundlePublishGate(plan, approval, now);
            if (!gate.passed) {
                throw new HarnessError('PUBLISH_GATE_BLOCKED', 'Bundle Approval is not active', gate.findings);
            }
            return;
        }
        const projection = await this.readPreparedProjection(plan.bundle_id);
        if (projection.active_binding_ref === null
            || !exact(projection.active_binding_ref, approval.prepared_article_binding_ref)) {
            throw new HarnessError('PUBLISH_GATE_BLOCKED', 'Bundle V2 Approval no longer matches the active prepared Article binding');
        }
        const binding = await this.readPreparedBindingRef(plan, approval.prepared_article_binding_ref);
        this.assertPreparedApproval(plan, approval, binding, now);
        await this.readDerivedArticleConfirmation(plan, approval, binding);
    }
    async verifySources(input) {
        const cycle = await this.readContract(input.cycle_ref.path, 'weekly-research-cycle');
        const verifiedCycle = createWeeklyResearchCycle(omitFields(cycle, ['schema_version', 'cycle_digest']));
        if (cycle.cycle_id !== input.cycle_id ||
            cycle.cycle_digest !== verifiedCycle.cycle_digest ||
            input.cycle_ref.digest !== cycle.cycle_digest) {
            throw new HarnessError('APPROVAL_STALE', 'Bundle Cycle ref is stale');
        }
        const candidateSet = await this.readContract(`program/weeks/${cycle.cycle_id}/candidates.json`, 'weekly-candidate-set');
        const selection = await this.readContract(input.selection_ref.path, 'weekly-topic-selection');
        const verifiedSelection = createWeeklyTopicSelection(candidateSet, omitFields(selection, ['schema_version', 'selection_id', 'selection_digest']));
        if (selection.cycle_id !== cycle.cycle_id ||
            selection.selection_digest !== verifiedSelection.selection_digest ||
            input.selection_ref.digest !== selection.selection_digest) {
            throw new HarnessError('APPROVAL_STALE', 'Bundle Selection ref is stale');
        }
        const packageValue = validatePackageMemoryBinding(await this.readContract(input.research_content_package_ref.path, 'research-content-package'));
        if (packageValue.schema_version !== '1.2' ||
            sha256(packageValue) !== input.research_content_package_ref.digest ||
            !exact(packageValue.research_program_binding.selection_ref, input.selection_ref) ||
            !exact(packageValue.research_program_binding.candidate_set_ref, {
                path: `program/weeks/${cycle.cycle_id}/candidates.json`,
                digest: candidateSet.candidate_set_digest
            })) {
            throw new HarnessError('APPROVAL_STALE', 'Bundle V1.2 Package lineage is stale');
        }
        this.assertContentGates(packageValue);
        const claims = new Set(packageValue.claims.map((claim) => claim.claim_id));
        if (input.single_intent.claim_refs.some((claim) => !claims.has(claim))) {
            throw new HarnessError('CONTRACT_INVALID', 'Single Claim ref is absent from Package V1.2');
        }
        const articlePackage = await this.readJson(input.canonical_article_package.package_ref.path);
        if (sha256(articlePackage) !== input.canonical_article_package.package_ref.digest ||
            articlePackage.root !== input.canonical_article_package.root ||
            articlePackage.digest !== input.canonical_article_package.package_digest) {
            throw new HarnessError('APPROVAL_STALE', 'Canonical Article Package ref is stale');
        }
        await verifyFinalizedArticlePackage(this.store, articlePackage);
        await this.verifyVisual(input, articlePackage);
        const articlePlanPath = `runs/${input.article_plan.run_id}/x-article/publication-plan-v1.json`;
        const articlePlan = await this.readContract(articlePlanPath, 'x-article-publication-plan');
        assertXArticlePublicationPlan(articlePlan);
        if (!exact(articlePlan, input.article_plan) ||
            articlePlan.intent.article_package.root !== articlePackage.root ||
            articlePlan.intent.article_package.digest !== articlePackage.digest ||
            articlePlan.intent.target_account !== input.single_intent.target_account) {
            throw new HarnessError('APPROVAL_STALE', 'Stored X Article Plan differs from the Bundle');
        }
        const weeklyStatus = await this.readContract(`program/weeks/${cycle.cycle_id}/status.json`, 'weekly-cycle-status');
        const verifiedStatus = validateContract('weekly-cycle-status', weeklyStatus);
        const weeklyArticleRef = verifiedStatus.article_ref;
        if (verifiedStatus.projection_digest !==
            sha256(omitFields(verifiedStatus, ['projection_digest'])) ||
            verifiedStatus.cycle_ref.digest !== cycle.cycle_digest ||
            verifiedStatus.selection_ref?.digest !== selection.selection_digest ||
            verifiedStatus.package_ref?.digest !== input.research_content_package_ref.digest ||
            weeklyArticleRef === null ||
            weeklyArticleRef.path !== `program/weeks/${cycle.cycle_id}/article.json` ||
            ['opened', 'candidates_submitted', 'topic_selected', 'cancelled', 'published']
                .includes(verifiedStatus.phase)) {
            throw new HarnessError('STATE_TRANSITION_INVALID', 'Weekly Cycle is not ready for publication planning');
        }
        const weeklyArticle = await this.readJson(weeklyArticleRef.path);
        if (sha256(weeklyArticle) !== weeklyArticleRef.digest || !exact(weeklyArticle, articlePackage)) {
            throw new HarnessError('APPROVAL_STALE', 'Weekly Article projection differs from finalized Article Package');
        }
        return { cycle, selection, packageValue, articlePackage, articlePlan, weeklyStatus };
    }
    assertContentGates(packageValue) {
        const gates = [
            runResearchGate(packageValue),
            runResearchLineageGate(packageValue),
            runEvidenceGate(packageValue),
            runClaimBoundaryGate(packageValue),
            runPrivacyGate(packageValue)
        ];
        const failedGate = gates.find((gate) => !gate.passed);
        if (failedGate !== undefined) {
            const code = failedGate.gate === 'privacy'
                ? 'PRIVACY_GATE_BLOCKED'
                : failedGate.gate === 'evidence' || failedGate.gate === 'claim_boundary'
                    ? 'EVIDENCE_GATE_BLOCKED'
                    : 'RESEARCH_GATE_BLOCKED';
            throw new HarnessError(code, `Publication Bundle ${failedGate.gate} Gate failed`, failedGate);
        }
    }
    async verifyVisual(input, articlePackage) {
        const visual = input.single_intent.visual_asset;
        if (visual === null)
            return;
        const manifest = await this.readContract(`${articlePackage.root}/visual-manifest.json`, 'visual-manifest');
        const installed = manifest.bindings.find((binding) => binding.asset.asset_id === visual.asset_id)?.asset;
        if (installed === undefined || !exact(installed, visual)) {
            throw new HarnessError('VISUAL_ASSET_INVALID', 'Bundle Visual is not exact finalized Article evidence');
        }
        const bytes = await this.store.readBytes(`${articlePackage.root}/${visual.relative_path}`);
        if (sha256Bytes(bytes) !== visual.digest) {
            throw new HarnessError('VISUAL_DIGEST_MISMATCH', 'Bundle Visual bytes changed after finalization');
        }
    }
    async readPlan(bundleId) {
        const value = await this.readContract(this.planPath(bundleId), 'publication-bundle-plan');
        assertPublicationBundlePlan(value);
        if (value.bundle_id !== bundleId) {
            throw new HarnessError('APPROVAL_STALE', 'Publication Bundle Plan path is stale');
        }
        return value;
    }
    async readApproval(plan) {
        const value = await this.readJson(this.approvalPath(plan.bundle_id));
        if (value.schema_version === 'publication-bundle-approval/v1') {
            validateContract('publication-bundle-approval', value);
            assertPublicationBundleApproval(plan, value);
            return value;
        }
        if (value.schema_version === 'publication-bundle-approval/v2') {
            validateContract('publication-bundle-approval-v2', value);
            const binding = await this.readPreparedBindingRef(plan, value.prepared_article_binding_ref);
            this.assertPreparedApproval(plan, value, binding);
            return value;
        }
        throw new HarnessError('CONTRACT_INVALID', 'unknown Publication Bundle Approval version');
    }
    async optionalApproval(plan) {
        return await this.store.exists(this.approvalPath(plan.bundle_id))
            ? this.readApproval(plan)
            : undefined;
    }
    async readArticleAuthorization(plan, approval, requireUnexpired) {
        const value = await this.readContract(this.articleAuthorizationPath(plan.bundle_id), 'derived-article-authorization');
        const { authorization_digest: digest, ...body } = value;
        const [planRef, approvalRef] = await Promise.all([
            this.fileRef(this.planPath(plan.bundle_id)),
            this.fileRef(this.approvalPath(plan.bundle_id))
        ]);
        if (digest !== sha256(body) || value.bundle_id !== plan.bundle_id ||
            !exact(value.bundle_plan_ref, planRef) ||
            !exact(value.bundle_approval_ref, approvalRef) ||
            value.child_plan_digest !== plan.article_plan.plan_digest) {
            throw new HarnessError('APPROVAL_STALE', 'Derived Article Authorization is stale');
        }
        verifyXArticleApproval(plan.article_plan, value.child_approval, requireUnexpired ? this.now() : new Date(value.child_approval.approved_at));
        if (value.child_approval.approved_by !== approval.approved_by ||
            Date.parse(value.child_approval.expires_at) !== Date.parse(approval.expires_at)) {
            throw new HarnessError('APPROVAL_STALE', 'Derived Article Approval exceeds Bundle Approval');
        }
        return value;
    }
    async readArticleExecutionBinding(bundleId) {
        const value = await this.readContract(this.articleExecutionBindingPath(bundleId), 'publication-bundle-execution-binding');
        const { binding_digest: digest, ...body } = value;
        const [planRef, approvalRef, authorizationRef] = await Promise.all([
            this.fileRef(this.planPath(bundleId)),
            this.fileRef(this.approvalPath(bundleId)),
            this.fileRef(this.articleAuthorizationPath(bundleId))
        ]);
        if (digest !== sha256(body) || value.bundle_id !== bundleId ||
            value.child_kind !== 'x_article' ||
            !exact(value.bundle_plan_ref, planRef) ||
            !exact(value.bundle_approval_ref, approvalRef) ||
            !exact(value.child_authorization_ref, authorizationRef)) {
            throw new HarnessError('APPROVAL_STALE', 'Article Execution Binding is stale');
        }
        return value;
    }
    async readArticleReceiptBinding(bundleId) {
        if (!(await this.store.exists(this.articleReceiptBindingPath(bundleId)))) {
            throw new HarnessError('STATE_TRANSITION_INVALID', 'Verified Article Receipt Binding does not exist');
        }
        const value = await this.readContract(this.articleReceiptBindingPath(bundleId), 'publication-bundle-receipt-binding');
        const { binding_digest: digest, ...body } = value;
        const plan = await this.readPlan(bundleId);
        let executionId;
        let installedPlanRef;
        let planDigest;
        let executionBindingRef;
        if (await this.store.exists(this.articleExecutionBindingPath(bundleId))) {
            const executionBinding = await this.readArticleExecutionBinding(bundleId);
            executionId = executionBinding.execution_id;
            installedPlanRef = executionBinding.installed_plan_ref;
            planDigest = executionBinding.plan_digest;
            executionBindingRef = await this.fileRef(this.articleExecutionBindingPath(bundleId));
        }
        else {
            const projection = await this.readPreparedProjection(bundleId);
            if (projection.active_binding_ref === null) {
                throw new HarnessError('APPROVAL_STALE', 'Article Receipt Binding lost its execution binding');
            }
            const prepared = await this.readPreparedBindingRef(plan, projection.active_binding_ref);
            executionId = prepared.execution_id;
            installedPlanRef = prepared.child_plan_ref;
            planDigest = prepared.child_plan_digest;
            executionBindingRef = projection.active_binding_ref;
        }
        const [currentExecutionBindingRef, receiptRef, receipt] = await Promise.all([
            Promise.resolve(executionBindingRef),
            this.fileRef(value.child_receipt_ref.path),
            this.readContract(value.child_receipt_ref.path, 'x-article-publish-receipt')
        ]);
        const { receipt_digest: receiptDigest, ...receiptBody } = receipt;
        if (digest !== sha256(body) || value.bundle_id !== bundleId ||
            value.child_kind !== 'x_article' ||
            !exact(value.execution_binding_ref, currentExecutionBindingRef) ||
            !exact(value.child_plan_ref, installedPlanRef) ||
            value.child_plan_digest !== planDigest ||
            !exact(value.child_receipt_ref, receiptRef) ||
            receiptDigest !== sha256(receiptBody) ||
            value.child_receipt_digest !== receiptDigest ||
            receipt.execution_id !== executionId ||
            receipt.plan_digest !== planDigest ||
            (value.canonical_public_url !== null &&
                value.canonical_public_url !== receipt.public_evidence.canonical_url)) {
            throw new HarnessError('APPROVAL_STALE', 'Article Receipt Binding is stale');
        }
        if (value.canonical_public_url !== null) {
            assertApprovedXArticleUrl(value.canonical_public_url, plan.article_plan.intent.target_account);
        }
        return value;
    }
    async readMaterializedSingle(plan, receiptBinding) {
        const value = await this.readContract(this.materializedSinglePath(plan.bundle_id), 'materialized-single-publication');
        const { materialization_digest: digest, ...body } = value;
        const [planRef, receiptBindingRef] = await Promise.all([
            this.fileRef(this.planPath(plan.bundle_id)),
            this.fileRef(this.articleReceiptBindingPath(plan.bundle_id))
        ]);
        const expectedText = materializeXArticleUrl(plan.single_intent.text_template, receiptBinding.canonical_public_url ?? '', plan.single_intent.target_account);
        if (digest !== sha256(body) || value.bundle_id !== plan.bundle_id ||
            !exact(value.bundle_plan_ref, planRef) ||
            !exact(value.article_receipt_binding_ref, receiptBindingRef) ||
            value.canonical_article_url !== receiptBinding.canonical_public_url ||
            value.final_text !== expectedText ||
            value.child_plan.plan_id !== `x_single_plan_${plan.bundle_id}` ||
            value.child_plan.run_id !== plan.single_intent.run_id ||
            value.child_plan.intent.target_account !== plan.single_intent.target_account ||
            value.child_plan.intent.adapter !== 'browser' ||
            value.child_plan.intent.mode !== 'single' ||
            value.child_plan.items.length !== 1 ||
            value.child_plan.items[0]?.text !== expectedText) {
            throw new HarnessError('APPROVAL_STALE', 'Materialized Single is stale');
        }
        if (value.child_plan.schema_version === '2.0') {
            assertPublicationPlanV2(value.child_plan);
            if (plan.single_intent.visual_asset !== null || value.child_plan.intent.media.length !== 0) {
                throw new HarnessError('APPROVAL_STALE', 'Text-only Single Visual binding is stale');
            }
        }
        else {
            assertPublicationPlanV2_1(value.child_plan);
            if (plan.single_intent.visual_asset === null ||
                !exact(value.child_plan.items[0]?.attachments, [plan.single_intent.visual_asset]) ||
                !exact(value.child_plan.article_package, plan.single_intent.article_package)) {
                throw new HarnessError('APPROVAL_STALE', 'Visual Single binding is stale');
            }
        }
        return value;
    }
    async readSingleAuthorization(plan, approval, materialized, requireUnexpired) {
        const value = await this.readContract(this.singleAuthorizationPath(plan.bundle_id), 'derived-single-authorization');
        const { authorization_digest: digest, ...body } = value;
        const [planRef, approvalRef, materializedRef] = await Promise.all([
            this.fileRef(this.planPath(plan.bundle_id)),
            this.fileRef(this.approvalPath(plan.bundle_id)),
            this.fileRef(this.materializedSinglePath(plan.bundle_id))
        ]);
        if (digest !== sha256(body) || value.bundle_id !== plan.bundle_id ||
            !exact(value.bundle_plan_ref, planRef) ||
            !exact(value.bundle_approval_ref, approvalRef) ||
            !exact(value.materialized_single_ref, materializedRef) ||
            value.child_plan_digest !== materialized.child_plan.plan_digest ||
            value.child_approval.approved_by !== approval.approved_by ||
            Date.parse(value.child_approval.expires_at) !== Date.parse(approval.expires_at)) {
            throw new HarnessError('APPROVAL_STALE', 'Derived Single Authorization is stale');
        }
        const checkAt = requireUnexpired ? this.now() : new Date(value.child_approval.approved_at);
        if (materialized.child_plan.schema_version === '2.0' &&
            value.child_approval.schema_version === '2.0') {
            verifyApprovalV2(materialized.child_plan, value.child_approval, checkAt);
        }
        else if (materialized.child_plan.schema_version === '2.1' &&
            value.child_approval.schema_version === '2.1') {
            verifyApprovalV2_1(materialized.child_plan, value.child_approval, checkAt);
        }
        else {
            throw new HarnessError('APPROVAL_STALE', 'Derived Single Plan and Approval versions differ');
        }
        return value;
    }
    async readSingleExecutionBinding(bundleId) {
        const value = await this.readContract(this.singleExecutionBindingPath(bundleId), 'publication-bundle-execution-binding');
        const { binding_digest: digest, ...body } = value;
        const [planRef, approvalRef, authorizationRef] = await Promise.all([
            this.fileRef(this.planPath(bundleId)),
            this.fileRef(this.approvalPath(bundleId)),
            this.fileRef(this.singleAuthorizationPath(bundleId))
        ]);
        if (digest !== sha256(body) || value.bundle_id !== bundleId ||
            value.child_kind !== 'x_single' ||
            !exact(value.bundle_plan_ref, planRef) ||
            !exact(value.bundle_approval_ref, approvalRef) ||
            !exact(value.child_authorization_ref, authorizationRef)) {
            throw new HarnessError('APPROVAL_STALE', 'Single Execution Binding is stale');
        }
        return value;
    }
    verifySingleReceipt(childPlan, childApproval, snapshotState, binding, receipt) {
        if (receipt.schema_version === '2.0') {
            validateContract('publish-receipt-v2', receipt);
        }
        else {
            validateContract('publish-receipt-v2-1', receipt);
        }
        if (receipt.schema_version !== childPlan.schema_version ||
            receipt.execution_id !== binding.execution_id ||
            receipt.run_id !== binding.run_id ||
            receipt.target_account.toLowerCase() !== childPlan.intent.target_account.toLowerCase() ||
            receipt.approval.plan_digest !== childPlan.plan_digest ||
            receipt.approval.approval_digest !== childApproval.approval_digest ||
            receipt.submission.submit_command_count !== 1) {
            throw new HarnessError('PUBLIC_VERIFICATION_CONFLICT', 'Single Receipt identity differs from its bound Plan and Approval');
        }
        if (receipt.status === 'finalized') {
            if (snapshotState !== 'finalized') {
                throw new HarnessError('PUBLIC_VERIFICATION_CONFLICT', 'Final Single Receipt snapshot is stale');
            }
            if (receipt.schema_version === '2.0' && childPlan.schema_version === '2.0') {
                assertFinalReceiptV2(receipt, childPlan);
            }
            else if (receipt.schema_version === '2.1' && childPlan.schema_version === '2.1') {
                this.assertVerifiedV2_1Receipt(receipt, childPlan, true);
            }
            else {
                throw new HarnessError('PUBLIC_VERIFICATION_CONFLICT', 'Single Receipt version is stale');
            }
            return {
                parsedStatus: 'finalized',
                canonicalUrl: receipt.public_result.root_url,
                limitations: receipt.schema_version === '2.1'
                    ? receipt.media_evidence?.limitations ?? []
                    : [],
                success: true
            };
        }
        if (receipt.schema_version === '2.1' && receipt.status === 'published_media_unverified') {
            if (childPlan.schema_version !== '2.1' || snapshotState !== 'published_unverified') {
                throw new HarnessError('PUBLIC_VERIFICATION_CONFLICT', 'Media-unverified Single state is stale');
            }
            this.assertVerifiedV2_1Receipt(receipt, childPlan, false);
            return {
                parsedStatus: 'published_media_unverified',
                canonicalUrl: receipt.public_result.root_url,
                limitations: receipt.media_evidence?.limitations.length
                    ? receipt.media_evidence.limitations
                    : ['published_media_unverified'],
                success: true
            };
        }
        const terminal = {
            outcome_unknown: 'single_outcome_unknown',
            verification_conflict: 'single_verification_conflict',
            partial: 'single_terminal_failure',
            failed_after_submit: 'single_terminal_failure'
        };
        if (!(receipt.status in terminal) || snapshotState !== receipt.status) {
            throw new HarnessError('PUBLIC_VERIFICATION_CONFLICT', 'Single terminal Receipt differs from the bound execution snapshot');
        }
        return {
            parsedStatus: receipt.status,
            canonicalUrl: null,
            limitations: [receipt.status],
            success: false
        };
    }
    assertVerifiedV2_1Receipt(receipt, plan, requireMedia) {
        const result = receipt.public_result;
        const verification = receipt.verification;
        const item = plan.items[0];
        const post = result?.posts[0];
        const media = receipt.media_evidence;
        if (receipt.plan_digest !== plan.plan_digest || result === null || item === undefined ||
            result.root_url !== post?.canonical_url || result.posts.length !== 1 ||
            result.ordered_post_ids.length !== 1 || result.ordered_post_ids[0] !== post.post_id ||
            post.ordinal !== 1 || post.observed_digest !== item.digest || post.reply_to_id !== null ||
            result.matched_ordinals.join(',') !== '1' || result.missing_ordinals.length !== 0 ||
            result.unexpected_post_ids.length !== 0 ||
            receipt.observed_account?.toLowerCase() !== plan.intent.target_account.toLowerCase() ||
            verification.source !== 'browser_public_page' || !verification.account_match ||
            !verification.count_match || !verification.content_match || !verification.order_match ||
            !verification.reply_chain_match || !verification.links_match ||
            !verification.unique_post_ids || media === null ||
            media.asset_id !== item.attachments[0]?.asset_id ||
            media.source_digest !== item.attachments[0]?.digest ||
            media.target_ordinal !== 1 || !media.source_asset_verified ||
            !media.composer_attachment_verified ||
            (requireMedia && (verification.strength !== 'public_browser_verified' ||
                !media.public_media_verified || media.alt_text_verified !== true))) {
            throw new HarnessError('PUBLIC_VERIFICATION_CONFLICT', 'V2.1 Single Receipt public or media evidence is incomplete');
        }
        assertApprovedXArticleUrl(result.root_url, plan.intent.target_account);
    }
    async readSingleReceiptBinding(bundleId, receiptId) {
        const path = this.singleReceiptBindingPath(bundleId, receiptId);
        const value = await this.readContract(path, 'publication-bundle-receipt-binding');
        const { binding_digest: digest, ...body } = value;
        const executionBinding = await this.readSingleExecutionBinding(bundleId);
        const [executionBindingRef, receiptRef] = await Promise.all([
            this.fileRef(this.singleExecutionBindingPath(bundleId)),
            this.fileRef(value.child_receipt_ref.path)
        ]);
        const receipt = await this.readJson(value.child_receipt_ref.path);
        const inspected = await this.inspector.inspectSingle(executionBinding.run_id, executionBinding.execution_id);
        const verified = this.verifySingleReceipt(inspected.plan, inspected.approval, inspected.snapshot.state, executionBinding, receipt);
        if (digest !== sha256(body) || value.bundle_id !== bundleId ||
            value.child_kind !== 'x_single' ||
            !exact(value.execution_binding_ref, executionBindingRef) ||
            !exact(value.child_plan_ref, executionBinding.installed_plan_ref) ||
            value.child_plan_digest !== executionBinding.plan_digest ||
            !exact(value.child_receipt_ref, receiptRef) ||
            value.child_receipt_digest !== sha256(receipt) ||
            receipt.receipt_id !== receiptId ||
            value.parsed_status !== verified.parsedStatus ||
            value.canonical_public_url !== verified.canonicalUrl ||
            !exact(value.limitations, verified.limitations)) {
            throw new HarnessError('APPROVAL_STALE', 'Single Receipt Binding is stale');
        }
        return value;
    }
    async issueJointReceipt(bundleId, singleReceiptId) {
        if (await this.store.exists(this.jointReceiptPath(bundleId))) {
            return this.readJointReceipt(bundleId);
        }
        const plan = await this.readPlan(bundleId);
        const article = await this.readArticleReceiptBinding(bundleId);
        const single = await this.readSingleReceiptBinding(bundleId, singleReceiptId);
        if (article.canonical_public_url === null || single.canonical_public_url === null ||
            !['published', 'published_media_unverified'].includes(article.parsed_status) ||
            !['finalized', 'published_media_unverified'].includes(single.parsed_status)) {
            throw new HarnessError('STATE_TRANSITION_INVALID', 'Joint Receipt requires two verified child publications');
        }
        const [bundlePlanRef, bundleApprovalRef] = await Promise.all([
            this.fileRef(this.planPath(bundleId)),
            this.fileRef(this.approvalPath(bundleId))
        ]);
        const receipt = createPublicationBundleReceipt({
            bundle_id: bundleId,
            cycle_ref: plan.cycle_ref,
            bundle_plan_ref: bundlePlanRef,
            bundle_approval_ref: bundleApprovalRef,
            article: {
                plan_ref: article.child_plan_ref,
                plan_digest: article.child_plan_digest,
                receipt_ref: article.child_receipt_ref,
                receipt_digest: article.child_receipt_digest,
                status: article.parsed_status,
                public_url: article.canonical_public_url
            },
            single: {
                plan_ref: single.child_plan_ref,
                plan_digest: single.child_plan_digest,
                receipt_ref: single.child_receipt_ref,
                receipt_digest: single.child_receipt_digest,
                status: single.parsed_status,
                public_url: single.canonical_public_url
            },
            issued_at: this.now().toISOString()
        });
        await this.store.writeNew(this.jointReceiptPath(bundleId), receipt);
        await this.status(bundleId);
        return this.readJointReceipt(bundleId);
    }
    async readJointReceipt(bundleId) {
        const value = await this.readContract(this.jointReceiptPath(bundleId), 'publication-bundle-receipt');
        const recreated = createPublicationBundleReceipt({
            bundle_id: value.bundle_id,
            cycle_ref: value.cycle_ref,
            bundle_plan_ref: value.bundle_plan_ref,
            bundle_approval_ref: value.bundle_approval_ref,
            article: value.article,
            single: value.single,
            issued_at: value.issued_at
        });
        const [planRef, approvalRef] = await Promise.all([
            this.fileRef(this.planPath(bundleId)),
            this.fileRef(this.approvalPath(bundleId))
        ]);
        const articleBinding = await this.readArticleReceiptBinding(bundleId);
        const singleReceipt = await this.readJson(value.single.receipt_ref.path);
        const singleBinding = await this.readSingleReceiptBinding(bundleId, singleReceipt.receipt_id);
        if (!exact(value, recreated) || value.bundle_id !== bundleId ||
            !exact(value.bundle_plan_ref, planRef) ||
            !exact(value.bundle_approval_ref, approvalRef) ||
            !exact(value.article, {
                plan_ref: articleBinding.child_plan_ref,
                plan_digest: articleBinding.child_plan_digest,
                receipt_ref: articleBinding.child_receipt_ref,
                receipt_digest: articleBinding.child_receipt_digest,
                status: articleBinding.parsed_status,
                public_url: articleBinding.canonical_public_url
            }) ||
            !exact(value.single, {
                plan_ref: singleBinding.child_plan_ref,
                plan_digest: singleBinding.child_plan_digest,
                receipt_ref: singleBinding.child_receipt_ref,
                receipt_digest: singleBinding.child_receipt_digest,
                status: singleBinding.parsed_status,
                public_url: singleBinding.canonical_public_url
            })) {
            throw new HarnessError('APPROVAL_STALE', 'Publication Bundle joint Receipt is stale');
        }
        return value;
    }
    articleSnapshotPhase(state) {
        if (state === 'outcome_unknown' || state === 'published_unverified') {
            return 'article_outcome_unknown';
        }
        if (state === 'verification_conflict')
            return 'article_verification_conflict';
        if (state === 'failed_after_publish' || state === 'cancelled_before_publish') {
            return 'article_terminal_failure';
        }
        return 'article_in_progress';
    }
    singleSnapshotPhase(state) {
        if (state === 'outcome_unknown' || state === 'published_unverified') {
            return 'single_outcome_unknown';
        }
        if (state === 'verification_conflict')
            return 'single_verification_conflict';
        if (state === 'partial' || state === 'failed_after_submit' || state === 'cancelled_before_submit') {
            return 'single_terminal_failure';
        }
        return 'single_in_progress';
    }
    singleReceiptPhase(status) {
        if (status === 'outcome_unknown')
            return 'single_outcome_unknown';
        if (status === 'verification_conflict')
            return 'single_verification_conflict';
        if (status === 'partial' || status === 'failed_after_submit') {
            return 'single_terminal_failure';
        }
        return 'single_in_progress';
    }
    async readBundleStatus(bundleId) {
        const value = await this.readContract(this.statusPath(bundleId), 'publication-bundle-status');
        const { projection_digest: digest, ...body } = value;
        if (digest !== sha256(body) || value.bundle_id !== bundleId) {
            throw new HarnessError('APPROVAL_STALE', 'Publication Bundle Status is stale');
        }
        return value;
    }
    async readWeeklyBinding(path) {
        const value = await this.readContract(path, 'weekly-publication-bundle-binding');
        const verified = createWeeklyPublicationBundleBinding(omitFields(value, ['schema_version', 'binding_digest']));
        if (verified.binding_digest !== value.binding_digest) {
            throw new HarnessError('APPROVAL_STALE', 'Weekly Publication Bundle Binding is stale');
        }
        return value;
    }
    async readJson(path) {
        const artifact = await this.store.readContainedArtifact(path);
        return this.parseJson(artifact.content, path);
    }
    parseJson(content, label) {
        try {
            return JSON.parse(content.toString('utf8'));
        }
        catch {
            throw new HarnessError('CONTRACT_INVALID', `${label} is not valid JSON`);
        }
    }
    async readContract(path, contract) {
        return validateContract(contract, await this.readJson(path));
    }
    async fileRef(path) {
        const artifact = await this.store.readContainedArtifact(path);
        return { path: artifact.relative_path, digest: artifact.digest };
    }
    planPath(bundleId) {
        return `runs/${bundleId}/publication-bundle/plan.json`;
    }
    approvalPath(bundleId) {
        return `runs/${bundleId}/publication-bundle/approval.json`;
    }
    bundleLockPath(bundleId) {
        return `runs/${bundleId}/publication-bundle/control-plane.lock`;
    }
    articleAdapterPrefix(executionId) {
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(executionId)) {
            throw new HarnessError('WORKSPACE_PATH_INVALID', 'unsafe prepared Article execution id');
        }
        return `runs/${executionId}/x-article/browser`;
    }
    articleAdapterLockPath(executionId) {
        this.articleAdapterPrefix(executionId);
        return `runs/${executionId}/x-article/adapter-execution.lock`;
    }
    preparedExecutionOwnerPath(executionId) {
        this.articleAdapterPrefix(executionId);
        return `program/publication-bundle-prepared-executions/${executionId}.json`;
    }
    preparedBindingsDirectory(bundleId) {
        return `runs/${bundleId}/publication-bundle/prepared-article-bindings`;
    }
    preparedBindingPath(bundleId, version) {
        if (!Number.isInteger(version) || version < 1) {
            throw new HarnessError('CONTRACT_INVALID', 'invalid prepared Article binding version');
        }
        return `${this.preparedBindingsDirectory(bundleId)}/${String(version).padStart(6, '0')}.json`;
    }
    preparedProjectionPath(bundleId) {
        return `runs/${bundleId}/publication-bundle/prepared-article-active.json`;
    }
    preparedUnbindingPath(bundleId, projectionRevision) {
        return `runs/${bundleId}/publication-bundle/prepared-article-unbindings/${String(projectionRevision).padStart(6, '0')}.json`;
    }
    articlePublishConfirmationPath(bundleId) {
        return `runs/${bundleId}/publication-bundle/article-publish-confirmation.json`;
    }
    articleAuthorizationPath(bundleId) {
        return `runs/${bundleId}/publication-bundle/article-authorization.json`;
    }
    articleExecutionBindingPath(bundleId) {
        return `runs/${bundleId}/publication-bundle/article-execution-binding.json`;
    }
    articleReceiptBindingPath(bundleId) {
        return `runs/${bundleId}/publication-bundle/article-receipt-binding.json`;
    }
    materializedSinglePath(bundleId) {
        return `runs/${bundleId}/publication-bundle/materialized-single.json`;
    }
    singleAuthorizationPath(bundleId) {
        return `runs/${bundleId}/publication-bundle/single-authorization.json`;
    }
    singleExecutionBindingPath(bundleId) {
        return `runs/${bundleId}/publication-bundle/single-execution-binding.json`;
    }
    singleReceiptBindingPath(bundleId, receiptId) {
        return `runs/${bundleId}/publication-bundle/single-receipt-bindings/${receiptId}.json`;
    }
    jointReceiptPath(bundleId) {
        return `runs/${bundleId}/publication-bundle/receipt.json`;
    }
    statusPath(bundleId) {
        return `runs/${bundleId}/publication-bundle/status.json`;
    }
}
//# sourceMappingURL=publication-bundle-service.js.map