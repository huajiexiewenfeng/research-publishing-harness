import { randomUUID } from 'node:crypto';

import { verifyFinalizedArticlePackage } from '../branches/article-harness/article-package-verifier.js';
import type { ArticlePackageRef } from '../branches/article-harness/article-service.js';
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
  createPublicationBundlePlan
} from './publication-bundle-contracts.js';
import { runPublicationBundlePublishGate } from './publication-bundle-publish-gate.js';
import type {
  ApprovePublicationBundleInput,
  DerivedArticleAuthorizationV1,
  PlanPublicationBundleInput,
  PublicationBundleApprovalV1,
  PublicationBundleAuditV1,
  PublicationBundlePlanV1
} from './publication-bundle-types.js';
import {
  createWeeklyPublicationBundleBinding,
  createWeeklyResearchCycle,
  createWeeklyTopicSelection
} from './research-program-contracts.js';
import type {
  CreateWeeklyPublicationBundleBindingInput,
  OpenWeeklyCycleInput,
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

  constructor(
    private readonly store: WorkspaceStore,
    private readonly weeks: WeeklyResearchCycleService,
    options: PublicationBundleServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.approvalId = options.approvalId ?? (() => `bundle_approval_${randomUUID()}`);
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
      const existing = await this.readContract<DerivedArticleAuthorizationV1>(
        path,
        'derived-article-authorization'
      );
      verifyXArticleApproval(plan.article_plan, existing.child_approval, now);
      return existing;
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
    return this.readContract<DerivedArticleAuthorizationV1>(
      path,
      'derived-article-authorization'
    );
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
    try {
      return JSON.parse(artifact.content.toString('utf8')) as T;
    } catch {
      throw new HarnessError('CONTRACT_INVALID', `${path} is not valid JSON`);
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
}
