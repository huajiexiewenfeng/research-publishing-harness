import { randomUUID } from 'node:crypto';

import { verifyFinalizedArticlePackage } from '../branches/article-harness/article-package-verifier.js';
import type { ArticlePackageRef } from '../branches/article-harness/article-service.js';
import type { XArticlePublishReceiptV1 } from '../adapters/x/article-browser/article-receipt.js';
import {
  assertFinalReceiptV2,
  type PublicationReceiptV2
} from '../adapters/x/browser/receipt-v2.js';
import type { PublicationReceiptV2_1 } from '../adapters/x/browser/receipt-v2-1.js';
import {
  approvePublicationV2,
  verifyApprovalV2,
  type ApprovalV2
} from './approval-v2.js';
import {
  approvePublicationV2_1,
  verifyApprovalV2_1,
  type ApprovalV2_1
} from './approval-v2-1.js';
import type { BrowserExecutionState } from './browser-execution.js';
import { sha256, sha256Bytes } from './digest.js';
import { HarnessError } from './errors.js';
import {
  runClaimBoundaryGate,
  runEvidenceGate,
  runPrivacyGate,
  runResearchGate,
  runResearchLineageGate
} from './gates.js';
import { validatePackageMemoryBinding } from './memory-package.js';
import { renderPublicationBundleAudit } from './publication-bundle-audit.js';
import {
  assertPublicationBundleApproval,
  assertPublicationBundlePlan,
  createPublicationBundleApproval,
  createPublicationBundlePlan,
  createPublicationBundleReceipt
} from './publication-bundle-contracts.js';
import { runPublicationBundlePublishGate } from './publication-bundle-publish-gate.js';
import {
  WorkspacePublicationChildExecutionInspector,
  type PublicationChildExecutionInspector
} from './publication-child-execution-inspector.js';
import type {
  ApprovePublicationBundleInput,
  ArticleExecutionBindingV1,
  ArticleReceiptBindingV1,
  AttachArticleReceiptInput,
  AttachSingleReceiptInput,
  BindArticleExecutionInput,
  BindSingleExecutionInput,
  DerivedArticleAuthorizationV1,
  DerivedSingleAuthorizationV1,
  MaterializedSinglePublicationV1,
  PlanPublicationBundleInput,
  PublicationBundleApprovalV1,
  PublicationBundleAuditV1,
  PublicationBundlePhase,
  PublicationBundlePlanV1,
  PublicationBundleReceiptV1,
  PublicationBundleStatusV1,
  SingleExecutionBindingV1,
  SingleReceiptBindingV1
} from './publication-bundle-types.js';
import {
  assertPublicationPlanV2,
  createPublicationPlanV2,
  type PublicationPlanV2
} from './publication-plan-v2.js';
import {
  assertPublicationPlanV2_1,
  createPublicationPlanV2_1,
  type PublicationPlanV2_1
} from './publication-plan-v2-1.js';
import {
  createWeeklyPublicationBundleBinding,
  createWeeklyResearchCycle,
  createWeeklyTopicSelection
} from './research-program-contracts.js';
import type {
  CreateWeeklyPublicationBundleBindingInput,
  OpenWeeklyCycleInput,
  ResearchArtifactRefV1,
  SelectWeeklyTopicInput,
  WeeklyCandidateSetV1,
  WeeklyCycleStatusV1,
  WeeklyPublicationBundleBindingV1,
  WeeklyResearchCycleV1,
  WeeklyTopicSelectionV1
} from './research-program-types.js';
import { validateContract } from './schema-validator.js';
import type {
  ArticleVisualManifest,
  ContractName,
  ResearchContentPackageV1_2
} from './types.js';
import type { WeeklyResearchCycleService } from './weekly-research-cycle-service.js';
import type { WorkspaceStore } from './workspace-store.js';
import type { XArticleExecutionState } from './x-article-execution.js';
import {
  assertApprovedXArticleUrl,
  materializeXArticleUrl
} from './x-article-url-materializer.js';
import {
  approveXArticlePublication,
  verifyXArticleApproval
} from './x-article-approval.js';
import {
  assertXArticlePublicationPlan,
  type XArticlePublicationPlanV1
} from './x-article-publication-plan.js';

interface PublicationBundleServiceOptions {
  readonly now?: () => Date;
  readonly approvalId?: () => string;
  readonly childInspector?: PublicationChildExecutionInspector;
}

interface VerifiedBundleSources {
  readonly cycle: WeeklyResearchCycleV1;
  readonly selection: WeeklyTopicSelectionV1;
  readonly packageValue: ResearchContentPackageV1_2;
  readonly articlePackage: ArticlePackageRef;
  readonly articlePlan: XArticlePublicationPlanV1;
  readonly weeklyStatus: WeeklyCycleStatusV1;
}

function omitFields(value: object, fields: readonly string[]): Record<string, unknown> {
  const body = { ...(value as Record<string, unknown>) };
  for (const field of fields) delete body[field];
  return body;
}

function exact(left: unknown, right: unknown): boolean {
  return sha256(left) === sha256(right);
}

export class PublicationBundleService {
  private readonly now: () => Date;
  private readonly approvalId: () => string;
  private readonly inspector: PublicationChildExecutionInspector;

  constructor(
    private readonly store: WorkspaceStore,
    private readonly weeks: WeeklyResearchCycleService,
    options: PublicationBundleServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.approvalId = options.approvalId ?? (() => `bundle_approval_${randomUUID()}`);
    this.inspector = options.childInspector ??
      new WorkspacePublicationChildExecutionInspector(store);
  }

  async plan(input: PlanPublicationBundleInput): Promise<PublicationBundlePlanV1> {
    const sources = await this.verifySources(input);
    const plan = createPublicationBundlePlan({
      ...input,
      cycle_ref: input.cycle_ref,
      selection_ref: input.selection_ref,
      research_content_package_ref: input.research_content_package_ref,
      canonical_article_package: {
        ...input.canonical_article_package,
        root: sources.articlePackage.root,
        package_digest: sources.articlePackage.digest as `sha256:${string}`
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
          throw new HarnessError(
            'STATE_TRANSITION_INVALID',
            'Weekly Cycle already has an immutable Publication Bundle'
          );
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
      } else {
        await this.store.writeNew(planPath, plan);
      }
      const exactPlan = await this.readPlan(plan.bundle_id);
      const bindingInput: CreateWeeklyPublicationBundleBindingInput = {
        cycle_ref: exactPlan.cycle_ref,
        selection_ref: exactPlan.selection_ref,
        research_content_package_ref: exactPlan.research_content_package_ref,
        weekly_article_ref: sources.weeklyStatus.article_ref!,
        article_package_ref: exactPlan.canonical_article_package.package_ref,
        bundle_plan_ref: { path: planPath, digest: exactPlan.bundle_digest },
        bound_at: exactPlan.planned_at
      };
      await this.store.writeNew(
        bindingPath,
        createWeeklyPublicationBundleBinding(bindingInput)
      );
      return exactPlan;
    });

    await this.weeks.status(installed.cycle_id);
    return installed;
  }

  async audit(bundleId: string): Promise<PublicationBundleAuditV1> {
    return renderPublicationBundleAudit(await this.readPlan(bundleId));
  }

  async approve(input: ApprovePublicationBundleInput): Promise<PublicationBundleApprovalV1> {
    const plan = await this.readPlan(input.bundle_id);
    const path = this.approvalPath(input.bundle_id);
    if (await this.store.exists(path)) {
      const existing = await this.readApproval(plan);
      if (
        existing.bundle_digest !== input.confirmed_bundle_digest ||
        existing.approved_by !== input.approved_by
      ) {
        throw new HarnessError('APPROVAL_STALE', 'Publication Bundle Approval is immutable');
      }
      return existing;
    }
    const approval = createPublicationBundleApproval(
      plan,
      input,
      this.now(),
      this.approvalId()
    );
    await this.store.writeNew(path, approval);
    return this.readApproval(plan);
  }

  async articleAuthorization(bundleId: string): Promise<DerivedArticleAuthorizationV1> {
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
    const gate = runPublicationBundlePublishGate(plan, approval, now);
    if (!gate.passed || approval === undefined) {
      throw new HarnessError(
        'PUBLISH_GATE_BLOCKED',
        'Publication Bundle Publish Gate blocked Article authorization',
        gate.findings
      );
    }
    const path = this.articleAuthorizationPath(bundleId);
    if (await this.store.exists(path)) {
      return this.readArticleAuthorization(plan, approval, true);
    }
    const remainingTtl = Date.parse(approval.expires_at) - now.getTime();
    if (remainingTtl <= 0) {
      throw new HarnessError('PUBLISH_GATE_BLOCKED', 'Publication Bundle Approval expired');
    }
    const childApproval = approveXArticlePublication(
      plan.article_plan,
      approval.approved_by,
      remainingTtl,
      now,
      () => `x_article_approval_${plan.bundle_id}`
    );
    const [bundlePlanRef, bundleApprovalRef] = await Promise.all([
      this.fileRef(this.planPath(bundleId)),
      this.fileRef(this.approvalPath(bundleId))
    ]);
    const body = {
      schema_version: 'derived-article-authorization/v1' as const,
      bundle_id: bundleId,
      bundle_plan_ref: bundlePlanRef,
      bundle_approval_ref: bundleApprovalRef,
      child_plan_digest: plan.article_plan.plan_digest as `sha256:${string}`,
      child_approval: childApproval,
      issued_at: now.toISOString()
    };
    const authorization = validateContract<DerivedArticleAuthorizationV1>(
      'derived-article-authorization',
      { ...body, authorization_digest: sha256(body) }
    );
    await this.store.writeNew(path, authorization);
    return this.readArticleAuthorization(plan, approval, true);
  }

  async bindArticleExecution(
    input: BindArticleExecutionInput
  ): Promise<ArticleExecutionBindingV1> {
    const plan = await this.readPlan(input.bundle_id);
    const approval = await this.readApproval(plan);
    assertPublicationBundleApproval(plan, approval, this.now());
    const authorization = await this.readArticleAuthorization(plan, approval, true);
    const inspected = await this.inspector.inspectArticle(input.execution_id);
    if (
      inspected.snapshot.publish_command_count !== 0 ||
      !exact(inspected.plan, plan.article_plan) ||
      !exact(inspected.approval, authorization.child_approval) ||
      inspected.snapshot.run_id !== plan.article_plan.run_id ||
      inspected.snapshot.plan_id !== plan.article_plan.plan_id
    ) {
      throw new HarnessError(
        'STATE_TRANSITION_INVALID',
        'Article execution must match the derived Authorization before any Publish command'
      );
    }
    const path = this.articleExecutionBindingPath(input.bundle_id);
    if (await this.store.exists(path)) {
      const existing = await this.readArticleExecutionBinding(input.bundle_id);
      if (existing.execution_id !== input.execution_id) {
        throw new HarnessError(
          'STATE_TRANSITION_INVALID',
          'Publication Bundle already binds a different Article execution'
        );
      }
      return existing;
    }
    const [bundlePlanRef, bundleApprovalRef, authorizationRef] = await Promise.all([
      this.fileRef(this.planPath(input.bundle_id)),
      this.fileRef(this.approvalPath(input.bundle_id)),
      this.fileRef(this.articleAuthorizationPath(input.bundle_id))
    ]);
    const body = {
      schema_version: 'publication-bundle-execution-binding/v1' as const,
      bundle_id: input.bundle_id,
      child_kind: 'x_article' as const,
      bundle_plan_ref: bundlePlanRef,
      bundle_approval_ref: bundleApprovalRef,
      child_authorization_ref: authorizationRef,
      execution_id: input.execution_id,
      run_id: inspected.snapshot.run_id,
      plan_id: inspected.snapshot.plan_id,
      plan_digest: plan.article_plan.plan_digest as `sha256:${string}`,
      installed_plan_ref: inspected.installed_plan_ref,
      installed_approval_ref: inspected.installed_approval_ref,
      bound_at: input.bound_at
    };
    const binding = validateContract<ArticleExecutionBindingV1>(
      'publication-bundle-execution-binding',
      { ...body, binding_digest: sha256(body) }
    );
    await this.store.writeNew(path, binding);
    await this.status(input.bundle_id);
    return this.readArticleExecutionBinding(input.bundle_id);
  }

  async attachArticleReceipt(
    input: AttachArticleReceiptInput
  ): Promise<PublicationBundleStatusV1> {
    const plan = await this.readPlan(input.bundle_id);
    const binding = await this.readArticleExecutionBinding(input.bundle_id);
    const inspected = await this.inspector.inspectArticle(binding.execution_id);
    const artifact = await this.store.readContainedArtifact(input.receipt_path);
    if (
      artifact.digest !== input.receipt_digest ||
      inspected.snapshot.latest_receipt_path !== artifact.relative_path
    ) {
      throw new HarnessError('APPROVAL_STALE', 'Article Receipt file binding is stale');
    }
    const receipt = validateContract<XArticlePublishReceiptV1>(
      'x-article-publish-receipt',
      this.parseJson<XArticlePublishReceiptV1>(artifact.content, input.receipt_path)
    );
    const { receipt_digest: receiptDigest, ...receiptBody } = receipt;
    if (
      receiptDigest !== sha256(receiptBody) ||
      receipt.execution_id !== binding.execution_id ||
      receipt.plan_id !== plan.article_plan.plan_id ||
      receipt.plan_digest !== plan.article_plan.plan_digest ||
      receipt.source_evidence.article_package_digest !==
        plan.article_plan.intent.article_package.digest ||
      receipt.source_evidence.document_digest !== sha256(plan.article_plan.intent.document) ||
      !exact(
        receipt.source_evidence.asset_digests,
        plan.article_plan.intent.visuals.map((visual) => visual.asset.digest)
      ) ||
      receipt.status === 'outcome_unknown'
    ) {
      throw new HarnessError(
        'ARTICLE_PUBLICATION_CONFLICT',
        'Article Receipt does not match the bound execution and Plan evidence'
      );
    }
    let canonicalUrl: string | null = null;
    let limitations: string[] = [];
    if (receipt.status === 'published' || receipt.status === 'published_media_unverified') {
      if (
        inspected.snapshot.state !== 'finalized' ||
        !receipt.public_evidence.author_match || !receipt.public_evidence.content_match ||
        !receipt.public_evidence.links_match ||
        (receipt.status === 'published' && receipt.public_evidence.media_match !== true) ||
        (receipt.status === 'published_media_unverified' &&
          receipt.public_evidence.media_match !== null)
      ) {
        throw new HarnessError(
          'ARTICLE_PUBLICATION_CONFLICT',
          'Article successful Receipt exceeds its public evidence'
        );
      }
      const url = assertApprovedXArticleUrl(
        receipt.public_evidence.canonical_url,
        plan.article_plan.intent.target_account
      );
      if (url.pathname.split('/').at(-1) !== receipt.public_evidence.article_id) {
        throw new HarnessError(
          'ARTICLE_PUBLICATION_CONFLICT',
          'Article canonical URL identity differs from public evidence'
        );
      }
      canonicalUrl = receipt.public_evidence.canonical_url;
      if (receipt.status === 'published_media_unverified') {
        limitations = ['published_media_unverified'];
      }
    } else if (
      receipt.status !== 'verification_conflict' ||
      inspected.snapshot.state !== 'verification_conflict'
    ) {
      throw new HarnessError(
        'ARTICLE_PUBLICATION_CONFLICT',
        'Article terminal Receipt status differs from its execution snapshot'
      );
    } else {
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
    const executionBindingRef = await this.fileRef(
      this.articleExecutionBindingPath(input.bundle_id)
    );
    const body = {
      schema_version: 'publication-bundle-receipt-binding/v1' as const,
      bundle_id: input.bundle_id,
      child_kind: 'x_article' as const,
      execution_binding_ref: executionBindingRef,
      child_plan_ref: binding.installed_plan_ref,
      child_plan_digest: plan.article_plan.plan_digest as `sha256:${string}`,
      child_receipt_ref: { path: artifact.relative_path, digest: artifact.digest },
      child_receipt_digest: receipt.receipt_digest as `sha256:${string}`,
      parsed_status: receipt.status,
      canonical_public_url: canonicalUrl,
      limitations,
      bound_at: receipt.issued_at
    };
    await this.store.writeNew(path, validateContract<ArticleReceiptBindingV1>(
      'publication-bundle-receipt-binding',
      { ...body, binding_digest: sha256(body) }
    ));
    return this.status(input.bundle_id);
  }

  async materializeSingle(bundleId: string): Promise<MaterializedSinglePublicationV1> {
    const plan = await this.readPlan(bundleId);
    const approval = await this.readApproval(plan);
    const gate = runPublicationBundlePublishGate(plan, approval, this.now());
    if (!gate.passed) {
      throw new HarnessError('PUBLISH_GATE_BLOCKED', 'Bundle Approval cannot materialize Single', gate.findings);
    }
    const receiptBinding = await this.readArticleReceiptBinding(bundleId);
    if (
      !['published', 'published_media_unverified'].includes(receiptBinding.parsed_status) ||
      receiptBinding.canonical_public_url === null
    ) {
      throw new HarnessError(
        'STATE_TRANSITION_INVALID',
        'Single materialization requires a verified Article Receipt Binding'
      );
    }
    const path = this.materializedSinglePath(bundleId);
    if (await this.store.exists(path)) return this.readMaterializedSingle(plan, receiptBinding);
    const finalText = materializeXArticleUrl(
      plan.single_intent.text_template,
      receiptBinding.canonical_public_url,
      plan.single_intent.target_account
    );
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
      schema_version: 'materialized-single-publication/v1' as const,
      bundle_id: bundleId,
      bundle_plan_ref: bundlePlanRef,
      article_receipt_binding_ref: articleReceiptBindingRef,
      canonical_article_url: receiptBinding.canonical_public_url,
      final_text: finalText,
      child_plan: childPlan,
      materialized_at: this.now().toISOString()
    };
    await this.store.writeNew(path, validateContract<MaterializedSinglePublicationV1>(
      'materialized-single-publication',
      { ...body, materialization_digest: sha256(body) }
    ));
    await this.status(bundleId);
    return this.readMaterializedSingle(plan, receiptBinding);
  }

  async singleAuthorization(bundleId: string): Promise<DerivedSingleAuthorizationV1> {
    if (await this.store.exists(this.singleExecutionBindingPath(bundleId))) {
      throw new HarnessError(
        'STATE_TRANSITION_INVALID',
        'Single execution is already bound; authorization cannot be replayed'
      );
    }
    const plan = await this.readPlan(bundleId);
    const approval = await this.readApproval(plan);
    const now = this.now();
    const gate = runPublicationBundlePublishGate(plan, approval, now);
    if (!gate.passed) {
      throw new HarnessError('PUBLISH_GATE_BLOCKED', 'Bundle Approval cannot authorize Single', gate.findings);
    }
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
      ? approvePublicationV2(
          materialized.child_plan,
          approval.approved_by,
          remainingTtl,
          now,
          () => `x_single_approval_${bundleId}`
        )
      : approvePublicationV2_1(
          materialized.child_plan,
          approval.approved_by,
          remainingTtl,
          now,
          () => `x_single_approval_${bundleId}`
        );
    const [bundlePlanRef, bundleApprovalRef, materializedSingleRef] = await Promise.all([
      this.fileRef(this.planPath(bundleId)),
      this.fileRef(this.approvalPath(bundleId)),
      this.fileRef(this.materializedSinglePath(bundleId))
    ]);
    const body = {
      schema_version: 'derived-single-authorization/v1' as const,
      bundle_id: bundleId,
      bundle_plan_ref: bundlePlanRef,
      bundle_approval_ref: bundleApprovalRef,
      materialized_single_ref: materializedSingleRef,
      child_plan_digest: materialized.child_plan.plan_digest as `sha256:${string}`,
      child_approval: childApproval,
      issued_at: now.toISOString()
    };
    await this.store.writeNew(path, validateContract<DerivedSingleAuthorizationV1>(
      'derived-single-authorization',
      { ...body, authorization_digest: sha256(body) }
    ));
    await this.status(bundleId);
    return this.readSingleAuthorization(plan, approval, materialized, true);
  }

  async bindSingleExecution(
    input: BindSingleExecutionInput
  ): Promise<SingleExecutionBindingV1> {
    const plan = await this.readPlan(input.bundle_id);
    const approval = await this.readApproval(plan);
    assertPublicationBundleApproval(plan, approval, this.now());
    const materialized = await this.readMaterializedSingle(
      plan,
      await this.readArticleReceiptBinding(input.bundle_id)
    );
    const authorization = await this.readSingleAuthorization(
      plan,
      approval,
      materialized,
      true
    );
    const inspected = await this.inspector.inspectSingle(
      materialized.child_plan.run_id,
      input.execution_id
    );
    if (
      inspected.snapshot.submit_command_count !== 0 ||
      !exact(inspected.plan, materialized.child_plan) ||
      !exact(inspected.approval, authorization.child_approval) ||
      inspected.snapshot.plan_id !== materialized.child_plan.plan_id
    ) {
      throw new HarnessError(
        'STATE_TRANSITION_INVALID',
        'Single execution must match the derived Authorization before any Submit command'
      );
    }
    const path = this.singleExecutionBindingPath(input.bundle_id);
    if (await this.store.exists(path)) {
      const existing = await this.readSingleExecutionBinding(input.bundle_id);
      if (existing.execution_id !== input.execution_id) {
        throw new HarnessError(
          'STATE_TRANSITION_INVALID',
          'Publication Bundle already binds a different Single execution'
        );
      }
      return existing;
    }
    const [bundlePlanRef, bundleApprovalRef, authorizationRef] = await Promise.all([
      this.fileRef(this.planPath(input.bundle_id)),
      this.fileRef(this.approvalPath(input.bundle_id)),
      this.fileRef(this.singleAuthorizationPath(input.bundle_id))
    ]);
    const body = {
      schema_version: 'publication-bundle-execution-binding/v1' as const,
      bundle_id: input.bundle_id,
      child_kind: 'x_single' as const,
      bundle_plan_ref: bundlePlanRef,
      bundle_approval_ref: bundleApprovalRef,
      child_authorization_ref: authorizationRef,
      execution_id: input.execution_id,
      run_id: inspected.snapshot.run_id,
      plan_id: inspected.snapshot.plan_id,
      plan_digest: materialized.child_plan.plan_digest as `sha256:${string}`,
      installed_plan_ref: inspected.installed_plan_ref,
      installed_approval_ref: inspected.installed_approval_ref,
      bound_at: input.bound_at
    };
    await this.store.writeNew(path, validateContract<SingleExecutionBindingV1>(
      'publication-bundle-execution-binding',
      { ...body, binding_digest: sha256(body) }
    ));
    await this.status(input.bundle_id);
    return this.readSingleExecutionBinding(input.bundle_id);
  }

  async attachSingleReceipt(
    input: AttachSingleReceiptInput
  ): Promise<PublicationBundleReceiptV1 | PublicationBundleStatusV1> {
    const executionBinding = await this.readSingleExecutionBinding(input.bundle_id);
    const inspected = await this.inspector.inspectSingle(
      executionBinding.run_id,
      executionBinding.execution_id
    );
    const artifact = await this.store.readContainedArtifact(input.receipt_path);
    if (
      artifact.digest !== input.receipt_digest ||
      inspected.latest_receipt_path !== artifact.relative_path
    ) {
      throw new HarnessError('APPROVAL_STALE', 'Single Receipt file binding is stale');
    }
    const receipt = this.parseJson<PublicationReceiptV2 | PublicationReceiptV2_1>(
      artifact.content,
      input.receipt_path
    );
    const verified = this.verifySingleReceipt(
      inspected.plan,
      inspected.approval,
      inspected.snapshot.state,
      executionBinding,
      receipt
    );
    const path = this.singleReceiptBindingPath(input.bundle_id, receipt.receipt_id);
    if (!(await this.store.exists(path))) {
      const executionBindingRef = await this.fileRef(
        this.singleExecutionBindingPath(input.bundle_id)
      );
      const body = {
        schema_version: 'publication-bundle-receipt-binding/v1' as const,
        bundle_id: input.bundle_id,
        child_kind: 'x_single' as const,
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
      await this.store.writeNew(path, validateContract<SingleReceiptBindingV1>(
        'publication-bundle-receipt-binding',
        { ...body, binding_digest: sha256(body) }
      ));
    } else {
      await this.readSingleReceiptBinding(input.bundle_id, receipt.receipt_id);
    }
    if (!verified.success) return this.status(input.bundle_id);
    return this.issueJointReceipt(input.bundle_id, receipt.receipt_id);
  }

  async status(bundleId: string): Promise<PublicationBundleStatusV1> {
    const plan = await this.readPlan(bundleId);
    let phase: PublicationBundlePhase = 'planned';
    let updatedAt = plan.planned_at;
    let limitations: readonly string[] = [];
    let articleExecutionBindingRef: ResearchArtifactRefV1 | null = null;
    let articleReceiptBindingRef: ResearchArtifactRefV1 | null = null;
    let singleExecutionBindingRef: ResearchArtifactRefV1 | null = null;
    let singleReceiptBindingRef: ResearchArtifactRefV1 | null = null;
    let jointReceiptRef: ResearchArtifactRefV1 | null = null;
    const approval = await this.store.exists(this.approvalPath(bundleId))
      ? await this.readApproval(plan)
      : null;
    if (approval !== null) {
      phase = 'approved';
      updatedAt = approval.approved_at;
    }
    if (await this.store.exists(this.articleAuthorizationPath(bundleId))) {
      if (approval === null) throw new HarnessError('APPROVAL_STALE', 'Article Authorization lacks Bundle Approval');
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
      const materialized = await this.readMaterializedSingle(
        plan,
        await this.readArticleReceiptBinding(bundleId)
      );
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
        const latestReceipt = await this.readJson<{ readonly receipt_id: string }>(
          inspected.latest_receipt_path
        );
        const receiptBindingPath = this.singleReceiptBindingPath(bundleId, latestReceipt.receipt_id);
        if (await this.store.exists(receiptBindingPath)) {
          const receiptBinding = await this.readSingleReceiptBinding(
            bundleId,
            latestReceipt.receipt_id
          );
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
    if (
      approval !== null && Date.parse(approval.expires_at) <= this.now().getTime() &&
      ![
        'article_verification_conflict', 'article_terminal_failure',
        'single_verification_conflict', 'single_terminal_failure', 'completed'
      ].includes(phase)
    ) {
      phase = 'approval_expired';
      updatedAt = approval.expires_at;
    }
    const body = {
      schema_version: 'publication-bundle-status/v1' as const,
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
    const status = validateContract<PublicationBundleStatusV1>('publication-bundle-status', {
      ...body,
      projection_digest: sha256(body)
    });
    await this.store.replaceAtomic(this.statusPath(bundleId), status);
    return this.readBundleStatus(bundleId);
  }

  private async verifySources(input: PlanPublicationBundleInput): Promise<VerifiedBundleSources> {
    const cycle = await this.readContract<WeeklyResearchCycleV1>(
      input.cycle_ref.path,
      'weekly-research-cycle'
    );
    const verifiedCycle = createWeeklyResearchCycle(
      omitFields(cycle, ['schema_version', 'cycle_digest']) as OpenWeeklyCycleInput
    );
    if (
      cycle.cycle_id !== input.cycle_id ||
      cycle.cycle_digest !== verifiedCycle.cycle_digest ||
      input.cycle_ref.digest !== cycle.cycle_digest
    ) {
      throw new HarnessError('APPROVAL_STALE', 'Bundle Cycle ref is stale');
    }
    const candidateSet = await this.readContract<WeeklyCandidateSetV1>(
      `program/weeks/${cycle.cycle_id}/candidates.json`,
      'weekly-candidate-set'
    );
    const selection = await this.readContract<WeeklyTopicSelectionV1>(
      input.selection_ref.path,
      'weekly-topic-selection'
    );
    const verifiedSelection = createWeeklyTopicSelection(
      candidateSet,
      omitFields(
        selection,
        ['schema_version', 'selection_id', 'selection_digest']
      ) as unknown as SelectWeeklyTopicInput
    );
    if (
      selection.cycle_id !== cycle.cycle_id ||
      selection.selection_digest !== verifiedSelection.selection_digest ||
      input.selection_ref.digest !== selection.selection_digest
    ) {
      throw new HarnessError('APPROVAL_STALE', 'Bundle Selection ref is stale');
    }
    const packageValue = validatePackageMemoryBinding(
      await this.readContract<ResearchContentPackageV1_2>(
        input.research_content_package_ref.path,
        'research-content-package'
      )
    );
    if (
      packageValue.schema_version !== '1.2' ||
      sha256(packageValue) !== input.research_content_package_ref.digest ||
      !exact(packageValue.research_program_binding.selection_ref, input.selection_ref) ||
      !exact(packageValue.research_program_binding.candidate_set_ref, {
        path: `program/weeks/${cycle.cycle_id}/candidates.json`,
        digest: candidateSet.candidate_set_digest
      })
    ) {
      throw new HarnessError('APPROVAL_STALE', 'Bundle V1.2 Package lineage is stale');
    }
    this.assertContentGates(packageValue);
    const claims = new Set(packageValue.claims.map((claim) => claim.claim_id));
    if (input.single_intent.claim_refs.some((claim) => !claims.has(claim))) {
      throw new HarnessError('CONTRACT_INVALID', 'Single Claim ref is absent from Package V1.2');
    }

    const articlePackage = await this.readJson<ArticlePackageRef>(
      input.canonical_article_package.package_ref.path
    );
    if (
      sha256(articlePackage) !== input.canonical_article_package.package_ref.digest ||
      articlePackage.root !== input.canonical_article_package.root ||
      articlePackage.digest !== input.canonical_article_package.package_digest
    ) {
      throw new HarnessError('APPROVAL_STALE', 'Canonical Article Package ref is stale');
    }
    await verifyFinalizedArticlePackage(this.store, articlePackage);
    await this.verifyVisual(input, articlePackage);

    const articlePlanPath =
      `runs/${input.article_plan.run_id}/x-article/publication-plan-v1.json`;
    const articlePlan = await this.readContract<XArticlePublicationPlanV1>(
      articlePlanPath,
      'x-article-publication-plan'
    );
    assertXArticlePublicationPlan(articlePlan);
    if (
      !exact(articlePlan, input.article_plan) ||
      articlePlan.intent.article_package.root !== articlePackage.root ||
      articlePlan.intent.article_package.digest !== articlePackage.digest ||
      articlePlan.intent.target_account !== input.single_intent.target_account
    ) {
      throw new HarnessError('APPROVAL_STALE', 'Stored X Article Plan differs from the Bundle');
    }
    const weeklyStatus = await this.readContract<WeeklyCycleStatusV1>(
      `program/weeks/${cycle.cycle_id}/status.json`,
      'weekly-cycle-status'
    );
    const verifiedStatus = validateContract<WeeklyCycleStatusV1>('weekly-cycle-status', weeklyStatus);
    const weeklyArticleRef = verifiedStatus.article_ref;
    if (
      verifiedStatus.projection_digest !==
        sha256(omitFields(verifiedStatus, ['projection_digest'])) ||
      verifiedStatus.cycle_ref.digest !== cycle.cycle_digest ||
      verifiedStatus.selection_ref?.digest !== selection.selection_digest ||
      verifiedStatus.package_ref?.digest !== input.research_content_package_ref.digest ||
      weeklyArticleRef === null ||
      weeklyArticleRef.path !== `program/weeks/${cycle.cycle_id}/article.json` ||
      ['opened', 'candidates_submitted', 'topic_selected', 'cancelled', 'published']
        .includes(verifiedStatus.phase)
    ) {
      throw new HarnessError('STATE_TRANSITION_INVALID', 'Weekly Cycle is not ready for publication planning');
    }
    const weeklyArticle = await this.readJson<ArticlePackageRef>(weeklyArticleRef.path);
    if (sha256(weeklyArticle) !== weeklyArticleRef.digest || !exact(weeklyArticle, articlePackage)) {
      throw new HarnessError('APPROVAL_STALE', 'Weekly Article projection differs from finalized Article Package');
    }
    return { cycle, selection, packageValue, articlePackage, articlePlan, weeklyStatus };
  }

  private assertContentGates(packageValue: ResearchContentPackageV1_2): void {
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

  private async verifyVisual(
    input: PlanPublicationBundleInput,
    articlePackage: ArticlePackageRef
  ): Promise<void> {
    const visual = input.single_intent.visual_asset;
    if (visual === null) return;
    const manifest = await this.readContract<ArticleVisualManifest>(
      `${articlePackage.root}/visual-manifest.json`,
      'visual-manifest'
    );
    const installed = manifest.bindings.find(
      (binding) => binding.asset.asset_id === visual.asset_id
    )?.asset;
    if (installed === undefined || !exact(installed, visual)) {
      throw new HarnessError('VISUAL_ASSET_INVALID', 'Bundle Visual is not exact finalized Article evidence');
    }
    const bytes = await this.store.readBytes(`${articlePackage.root}/${visual.relative_path}`);
    if (sha256Bytes(bytes) !== visual.digest) {
      throw new HarnessError('VISUAL_DIGEST_MISMATCH', 'Bundle Visual bytes changed after finalization');
    }
  }

  private async readPlan(bundleId: string): Promise<PublicationBundlePlanV1> {
    const value = await this.readContract<PublicationBundlePlanV1>(
      this.planPath(bundleId),
      'publication-bundle-plan'
    );
    assertPublicationBundlePlan(value);
    if (value.bundle_id !== bundleId) {
      throw new HarnessError('APPROVAL_STALE', 'Publication Bundle Plan path is stale');
    }
    return value;
  }

  private async readApproval(
    plan: PublicationBundlePlanV1
  ): Promise<PublicationBundleApprovalV1> {
    const value = await this.readContract<PublicationBundleApprovalV1>(
      this.approvalPath(plan.bundle_id),
      'publication-bundle-approval'
    );
    assertPublicationBundleApproval(plan, value);
    return value;
  }

  private async optionalApproval(
    plan: PublicationBundlePlanV1
  ): Promise<PublicationBundleApprovalV1 | undefined> {
    return await this.store.exists(this.approvalPath(plan.bundle_id))
      ? this.readApproval(plan)
      : undefined;
  }

  private async readArticleAuthorization(
    plan: PublicationBundlePlanV1,
    approval: PublicationBundleApprovalV1,
    requireUnexpired: boolean
  ): Promise<DerivedArticleAuthorizationV1> {
    const value = await this.readContract<DerivedArticleAuthorizationV1>(
      this.articleAuthorizationPath(plan.bundle_id),
      'derived-article-authorization'
    );
    const { authorization_digest: digest, ...body } = value;
    const [planRef, approvalRef] = await Promise.all([
      this.fileRef(this.planPath(plan.bundle_id)),
      this.fileRef(this.approvalPath(plan.bundle_id))
    ]);
    if (
      digest !== sha256(body) || value.bundle_id !== plan.bundle_id ||
      !exact(value.bundle_plan_ref, planRef) ||
      !exact(value.bundle_approval_ref, approvalRef) ||
      value.child_plan_digest !== plan.article_plan.plan_digest
    ) {
      throw new HarnessError('APPROVAL_STALE', 'Derived Article Authorization is stale');
    }
    verifyXArticleApproval(
      plan.article_plan,
      value.child_approval,
      requireUnexpired ? this.now() : new Date(value.child_approval.approved_at)
    );
    if (
      value.child_approval.approved_by !== approval.approved_by ||
      Date.parse(value.child_approval.expires_at) !== Date.parse(approval.expires_at)
    ) {
      throw new HarnessError('APPROVAL_STALE', 'Derived Article Approval exceeds Bundle Approval');
    }
    return value;
  }

  private async readArticleExecutionBinding(bundleId: string): Promise<ArticleExecutionBindingV1> {
    const value = await this.readContract<ArticleExecutionBindingV1>(
      this.articleExecutionBindingPath(bundleId),
      'publication-bundle-execution-binding'
    );
    const { binding_digest: digest, ...body } = value;
    const [planRef, approvalRef, authorizationRef] = await Promise.all([
      this.fileRef(this.planPath(bundleId)),
      this.fileRef(this.approvalPath(bundleId)),
      this.fileRef(this.articleAuthorizationPath(bundleId))
    ]);
    if (
      digest !== sha256(body) || value.bundle_id !== bundleId ||
      value.child_kind !== 'x_article' ||
      !exact(value.bundle_plan_ref, planRef) ||
      !exact(value.bundle_approval_ref, approvalRef) ||
      !exact(value.child_authorization_ref, authorizationRef)
    ) {
      throw new HarnessError('APPROVAL_STALE', 'Article Execution Binding is stale');
    }
    return value;
  }

  private async readArticleReceiptBinding(bundleId: string): Promise<ArticleReceiptBindingV1> {
    if (!(await this.store.exists(this.articleReceiptBindingPath(bundleId)))) {
      throw new HarnessError(
        'STATE_TRANSITION_INVALID',
        'Verified Article Receipt Binding does not exist'
      );
    }
    const value = await this.readContract<ArticleReceiptBindingV1>(
      this.articleReceiptBindingPath(bundleId),
      'publication-bundle-receipt-binding'
    );
    const { binding_digest: digest, ...body } = value;
    const executionBinding = await this.readArticleExecutionBinding(bundleId);
    const [executionBindingRef, receiptRef, receipt] = await Promise.all([
      this.fileRef(this.articleExecutionBindingPath(bundleId)),
      this.fileRef(value.child_receipt_ref.path),
      this.readContract<XArticlePublishReceiptV1>(
        value.child_receipt_ref.path,
        'x-article-publish-receipt'
      )
    ]);
    const { receipt_digest: receiptDigest, ...receiptBody } = receipt;
    if (
      digest !== sha256(body) || value.bundle_id !== bundleId ||
      value.child_kind !== 'x_article' ||
      !exact(value.execution_binding_ref, executionBindingRef) ||
      !exact(value.child_plan_ref, executionBinding.installed_plan_ref) ||
      value.child_plan_digest !== executionBinding.plan_digest ||
      !exact(value.child_receipt_ref, receiptRef) ||
      receiptDigest !== sha256(receiptBody) ||
      value.child_receipt_digest !== receiptDigest ||
      receipt.execution_id !== executionBinding.execution_id ||
      receipt.plan_digest !== executionBinding.plan_digest ||
      (value.canonical_public_url !== null &&
        value.canonical_public_url !== receipt.public_evidence.canonical_url)
    ) {
      throw new HarnessError('APPROVAL_STALE', 'Article Receipt Binding is stale');
    }
    if (value.canonical_public_url !== null) {
      const plan = await this.readPlan(bundleId);
      assertApprovedXArticleUrl(
        value.canonical_public_url,
        plan.article_plan.intent.target_account
      );
    }
    return value;
  }

  private async readMaterializedSingle(
    plan: PublicationBundlePlanV1,
    receiptBinding: ArticleReceiptBindingV1
  ): Promise<MaterializedSinglePublicationV1> {
    const value = await this.readContract<MaterializedSinglePublicationV1>(
      this.materializedSinglePath(plan.bundle_id),
      'materialized-single-publication'
    );
    const { materialization_digest: digest, ...body } = value;
    const [planRef, receiptBindingRef] = await Promise.all([
      this.fileRef(this.planPath(plan.bundle_id)),
      this.fileRef(this.articleReceiptBindingPath(plan.bundle_id))
    ]);
    const expectedText = materializeXArticleUrl(
      plan.single_intent.text_template,
      receiptBinding.canonical_public_url ?? '',
      plan.single_intent.target_account
    );
    if (
      digest !== sha256(body) || value.bundle_id !== plan.bundle_id ||
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
      value.child_plan.items[0]?.text !== expectedText
    ) {
      throw new HarnessError('APPROVAL_STALE', 'Materialized Single is stale');
    }
    if (value.child_plan.schema_version === '2.0') {
      assertPublicationPlanV2(value.child_plan);
      if (plan.single_intent.visual_asset !== null || value.child_plan.intent.media.length !== 0) {
        throw new HarnessError('APPROVAL_STALE', 'Text-only Single Visual binding is stale');
      }
    } else {
      assertPublicationPlanV2_1(value.child_plan);
      if (
        plan.single_intent.visual_asset === null ||
        !exact(value.child_plan.items[0]?.attachments, [plan.single_intent.visual_asset]) ||
        !exact(value.child_plan.article_package, plan.single_intent.article_package)
      ) {
        throw new HarnessError('APPROVAL_STALE', 'Visual Single binding is stale');
      }
    }
    return value;
  }

  private async readSingleAuthorization(
    plan: PublicationBundlePlanV1,
    approval: PublicationBundleApprovalV1,
    materialized: MaterializedSinglePublicationV1,
    requireUnexpired: boolean
  ): Promise<DerivedSingleAuthorizationV1> {
    const value = await this.readContract<DerivedSingleAuthorizationV1>(
      this.singleAuthorizationPath(plan.bundle_id),
      'derived-single-authorization'
    );
    const { authorization_digest: digest, ...body } = value;
    const [planRef, approvalRef, materializedRef] = await Promise.all([
      this.fileRef(this.planPath(plan.bundle_id)),
      this.fileRef(this.approvalPath(plan.bundle_id)),
      this.fileRef(this.materializedSinglePath(plan.bundle_id))
    ]);
    if (
      digest !== sha256(body) || value.bundle_id !== plan.bundle_id ||
      !exact(value.bundle_plan_ref, planRef) ||
      !exact(value.bundle_approval_ref, approvalRef) ||
      !exact(value.materialized_single_ref, materializedRef) ||
      value.child_plan_digest !== materialized.child_plan.plan_digest ||
      value.child_approval.approved_by !== approval.approved_by ||
      Date.parse(value.child_approval.expires_at) !== Date.parse(approval.expires_at)
    ) {
      throw new HarnessError('APPROVAL_STALE', 'Derived Single Authorization is stale');
    }
    const checkAt = requireUnexpired ? this.now() : new Date(value.child_approval.approved_at);
    if (
      materialized.child_plan.schema_version === '2.0' &&
      value.child_approval.schema_version === '2.0'
    ) {
      verifyApprovalV2(materialized.child_plan, value.child_approval, checkAt);
    } else if (
      materialized.child_plan.schema_version === '2.1' &&
      value.child_approval.schema_version === '2.1'
    ) {
      verifyApprovalV2_1(materialized.child_plan, value.child_approval, checkAt);
    } else {
      throw new HarnessError('APPROVAL_STALE', 'Derived Single Plan and Approval versions differ');
    }
    return value;
  }

  private async readSingleExecutionBinding(bundleId: string): Promise<SingleExecutionBindingV1> {
    const value = await this.readContract<SingleExecutionBindingV1>(
      this.singleExecutionBindingPath(bundleId),
      'publication-bundle-execution-binding'
    );
    const { binding_digest: digest, ...body } = value;
    const [planRef, approvalRef, authorizationRef] = await Promise.all([
      this.fileRef(this.planPath(bundleId)),
      this.fileRef(this.approvalPath(bundleId)),
      this.fileRef(this.singleAuthorizationPath(bundleId))
    ]);
    if (
      digest !== sha256(body) || value.bundle_id !== bundleId ||
      value.child_kind !== 'x_single' ||
      !exact(value.bundle_plan_ref, planRef) ||
      !exact(value.bundle_approval_ref, approvalRef) ||
      !exact(value.child_authorization_ref, authorizationRef)
    ) {
      throw new HarnessError('APPROVAL_STALE', 'Single Execution Binding is stale');
    }
    return value;
  }

  private verifySingleReceipt(
    childPlan: PublicationPlanV2 | PublicationPlanV2_1,
    childApproval: ApprovalV2 | ApprovalV2_1,
    snapshotState: BrowserExecutionState,
    binding: SingleExecutionBindingV1,
    receipt: PublicationReceiptV2 | PublicationReceiptV2_1
  ): {
    readonly parsedStatus: SingleReceiptBindingV1['parsed_status'];
    readonly canonicalUrl: string | null;
    readonly limitations: readonly string[];
    readonly success: boolean;
  } {
    if (receipt.schema_version === '2.0') {
      validateContract<PublicationReceiptV2>('publish-receipt-v2', receipt);
    } else {
      validateContract<PublicationReceiptV2_1>('publish-receipt-v2-1', receipt);
    }
    if (
      receipt.schema_version !== childPlan.schema_version ||
      receipt.execution_id !== binding.execution_id ||
      receipt.run_id !== binding.run_id ||
      receipt.target_account.toLowerCase() !== childPlan.intent.target_account.toLowerCase() ||
      receipt.approval.plan_digest !== childPlan.plan_digest ||
      receipt.approval.approval_digest !== childApproval.approval_digest ||
      receipt.submission.submit_command_count !== 1
    ) {
      throw new HarnessError(
        'PUBLIC_VERIFICATION_CONFLICT',
        'Single Receipt identity differs from its bound Plan and Approval'
      );
    }
    if (receipt.status === 'finalized') {
      if (snapshotState !== 'finalized') {
        throw new HarnessError('PUBLIC_VERIFICATION_CONFLICT', 'Final Single Receipt snapshot is stale');
      }
      if (receipt.schema_version === '2.0' && childPlan.schema_version === '2.0') {
        assertFinalReceiptV2(receipt, childPlan);
      } else if (receipt.schema_version === '2.1' && childPlan.schema_version === '2.1') {
        this.assertVerifiedV2_1Receipt(receipt, childPlan, true);
      } else {
        throw new HarnessError('PUBLIC_VERIFICATION_CONFLICT', 'Single Receipt version is stale');
      }
      return {
        parsedStatus: 'finalized',
        canonicalUrl: receipt.public_result!.root_url,
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
        canonicalUrl: receipt.public_result!.root_url,
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
    } as const;
    if (!(receipt.status in terminal) || snapshotState !== receipt.status) {
      throw new HarnessError(
        'PUBLIC_VERIFICATION_CONFLICT',
        'Single terminal Receipt differs from the bound execution snapshot'
      );
    }
    return {
      parsedStatus: receipt.status as keyof typeof terminal,
      canonicalUrl: null,
      limitations: [receipt.status],
      success: false
    };
  }

  private assertVerifiedV2_1Receipt(
    receipt: PublicationReceiptV2_1,
    plan: PublicationPlanV2_1,
    requireMedia: boolean
  ): void {
    const result = receipt.public_result;
    const verification = receipt.verification;
    const item = plan.items[0];
    const post = result?.posts[0];
    const media = receipt.media_evidence;
    if (
      receipt.plan_digest !== plan.plan_digest || result === null || item === undefined ||
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
      (requireMedia && (
        verification.strength !== 'public_browser_verified' ||
        !media.public_media_verified || media.alt_text_verified !== true
      ))
    ) {
      throw new HarnessError(
        'PUBLIC_VERIFICATION_CONFLICT',
        'V2.1 Single Receipt public or media evidence is incomplete'
      );
    }
    assertApprovedXArticleUrl(result.root_url, plan.intent.target_account);
  }

  private async readSingleReceiptBinding(
    bundleId: string,
    receiptId: string
  ): Promise<SingleReceiptBindingV1> {
    const path = this.singleReceiptBindingPath(bundleId, receiptId);
    const value = await this.readContract<SingleReceiptBindingV1>(
      path,
      'publication-bundle-receipt-binding'
    );
    const { binding_digest: digest, ...body } = value;
    const executionBinding = await this.readSingleExecutionBinding(bundleId);
    const [executionBindingRef, receiptRef] = await Promise.all([
      this.fileRef(this.singleExecutionBindingPath(bundleId)),
      this.fileRef(value.child_receipt_ref.path)
    ]);
    const receipt = await this.readJson<PublicationReceiptV2 | PublicationReceiptV2_1>(
      value.child_receipt_ref.path
    );
    const inspected = await this.inspector.inspectSingle(
      executionBinding.run_id,
      executionBinding.execution_id
    );
    const verified = this.verifySingleReceipt(
      inspected.plan,
      inspected.approval,
      inspected.snapshot.state,
      executionBinding,
      receipt
    );
    if (
      digest !== sha256(body) || value.bundle_id !== bundleId ||
      value.child_kind !== 'x_single' ||
      !exact(value.execution_binding_ref, executionBindingRef) ||
      !exact(value.child_plan_ref, executionBinding.installed_plan_ref) ||
      value.child_plan_digest !== executionBinding.plan_digest ||
      !exact(value.child_receipt_ref, receiptRef) ||
      value.child_receipt_digest !== sha256(receipt) ||
      receipt.receipt_id !== receiptId ||
      value.parsed_status !== verified.parsedStatus ||
      value.canonical_public_url !== verified.canonicalUrl ||
      !exact(value.limitations, verified.limitations)
    ) {
      throw new HarnessError('APPROVAL_STALE', 'Single Receipt Binding is stale');
    }
    return value;
  }

  private async issueJointReceipt(
    bundleId: string,
    singleReceiptId: string
  ): Promise<PublicationBundleReceiptV1> {
    if (await this.store.exists(this.jointReceiptPath(bundleId))) {
      return this.readJointReceipt(bundleId);
    }
    const plan = await this.readPlan(bundleId);
    const article = await this.readArticleReceiptBinding(bundleId);
    const single = await this.readSingleReceiptBinding(bundleId, singleReceiptId);
    if (
      article.canonical_public_url === null || single.canonical_public_url === null ||
      !['published', 'published_media_unverified'].includes(article.parsed_status) ||
      !['finalized', 'published_media_unverified'].includes(single.parsed_status)
    ) {
      throw new HarnessError(
        'STATE_TRANSITION_INVALID',
        'Joint Receipt requires two verified child publications'
      );
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

  private async readJointReceipt(bundleId: string): Promise<PublicationBundleReceiptV1> {
    const value = await this.readContract<PublicationBundleReceiptV1>(
      this.jointReceiptPath(bundleId),
      'publication-bundle-receipt'
    );
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
    const singleReceipt = await this.readJson<{ readonly receipt_id: string }>(
      value.single.receipt_ref.path
    );
    const singleBinding = await this.readSingleReceiptBinding(
      bundleId,
      singleReceipt.receipt_id
    );
    if (
      !exact(value, recreated) || value.bundle_id !== bundleId ||
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
      })
    ) {
      throw new HarnessError('APPROVAL_STALE', 'Publication Bundle joint Receipt is stale');
    }
    return value;
  }

  private articleSnapshotPhase(state: XArticleExecutionState): PublicationBundlePhase {
    if (state === 'outcome_unknown' || state === 'published_unverified') {
      return 'article_outcome_unknown';
    }
    if (state === 'verification_conflict') return 'article_verification_conflict';
    if (state === 'failed_after_publish' || state === 'cancelled_before_publish') {
      return 'article_terminal_failure';
    }
    return 'article_in_progress';
  }

  private singleSnapshotPhase(state: BrowserExecutionState): PublicationBundlePhase {
    if (state === 'outcome_unknown' || state === 'published_unverified') {
      return 'single_outcome_unknown';
    }
    if (state === 'verification_conflict') return 'single_verification_conflict';
    if (state === 'partial' || state === 'failed_after_submit' || state === 'cancelled_before_submit') {
      return 'single_terminal_failure';
    }
    return 'single_in_progress';
  }

  private singleReceiptPhase(
    status: SingleReceiptBindingV1['parsed_status']
  ): PublicationBundlePhase {
    if (status === 'outcome_unknown') return 'single_outcome_unknown';
    if (status === 'verification_conflict') return 'single_verification_conflict';
    if (status === 'partial' || status === 'failed_after_submit') {
      return 'single_terminal_failure';
    }
    return 'single_in_progress';
  }

  private async readBundleStatus(bundleId: string): Promise<PublicationBundleStatusV1> {
    const value = await this.readContract<PublicationBundleStatusV1>(
      this.statusPath(bundleId),
      'publication-bundle-status'
    );
    const { projection_digest: digest, ...body } = value;
    if (digest !== sha256(body) || value.bundle_id !== bundleId) {
      throw new HarnessError('APPROVAL_STALE', 'Publication Bundle Status is stale');
    }
    return value;
  }

  private async readWeeklyBinding(path: string): Promise<WeeklyPublicationBundleBindingV1> {
    const value = await this.readContract<WeeklyPublicationBundleBindingV1>(
      path,
      'weekly-publication-bundle-binding'
    );
    const verified = createWeeklyPublicationBundleBinding(
      omitFields(value, ['schema_version', 'binding_digest']) as unknown as
        CreateWeeklyPublicationBundleBindingInput
    );
    if (verified.binding_digest !== value.binding_digest) {
      throw new HarnessError('APPROVAL_STALE', 'Weekly Publication Bundle Binding is stale');
    }
    return value;
  }

  private async readJson<T>(path: string): Promise<T> {
    const artifact = await this.store.readContainedArtifact(path);
    return this.parseJson<T>(artifact.content, path);
  }

  private parseJson<T>(content: Buffer, label: string): T {
    try {
      return JSON.parse(content.toString('utf8')) as T;
    } catch {
      throw new HarnessError('CONTRACT_INVALID', `${label} is not valid JSON`);
    }
  }

  private async readContract<T>(path: string, contract: ContractName): Promise<T> {
    return validateContract<T>(contract, await this.readJson<unknown>(path));
  }

  private async fileRef(path: string): Promise<{ path: string; digest: `sha256:${string}` }> {
    const artifact = await this.store.readContainedArtifact(path);
    return { path: artifact.relative_path, digest: artifact.digest };
  }

  private planPath(bundleId: string): string {
    return `runs/${bundleId}/publication-bundle/plan.json`;
  }

  private approvalPath(bundleId: string): string {
    return `runs/${bundleId}/publication-bundle/approval.json`;
  }

  private articleAuthorizationPath(bundleId: string): string {
    return `runs/${bundleId}/publication-bundle/article-authorization.json`;
  }

  private articleExecutionBindingPath(bundleId: string): string {
    return `runs/${bundleId}/publication-bundle/article-execution-binding.json`;
  }

  private articleReceiptBindingPath(bundleId: string): string {
    return `runs/${bundleId}/publication-bundle/article-receipt-binding.json`;
  }

  private materializedSinglePath(bundleId: string): string {
    return `runs/${bundleId}/publication-bundle/materialized-single.json`;
  }

  private singleAuthorizationPath(bundleId: string): string {
    return `runs/${bundleId}/publication-bundle/single-authorization.json`;
  }

  private singleExecutionBindingPath(bundleId: string): string {
    return `runs/${bundleId}/publication-bundle/single-execution-binding.json`;
  }

  private singleReceiptBindingPath(bundleId: string, receiptId: string): string {
    return `runs/${bundleId}/publication-bundle/single-receipt-bindings/${receiptId}.json`;
  }

  private jointReceiptPath(bundleId: string): string {
    return `runs/${bundleId}/publication-bundle/receipt.json`;
  }

  private statusPath(bundleId: string): string {
    return `runs/${bundleId}/publication-bundle/status.json`;
  }
}
