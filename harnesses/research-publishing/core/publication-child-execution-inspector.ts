import type { XArticleApprovalV1 } from './x-article-approval.js';
import { verifyXArticleApproval } from './x-article-approval.js';
import type { XArticlePublicationPlanV1 } from './x-article-publication-plan.js';
import { assertXArticlePublicationPlan } from './x-article-publication-plan.js';
import type { XArticleExecutionSnapshotV1 } from './x-article-execution.js';
import type { ApprovalV2 } from './approval-v2.js';
import { verifyApprovalV2 } from './approval-v2.js';
import type { ApprovalV2_1 } from './approval-v2-1.js';
import { verifyApprovalV2_1 } from './approval-v2-1.js';
import type { BrowserExecutionSnapshot } from './browser-execution.js';
import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import type { PublicationPlanV2 } from './publication-plan-v2.js';
import { assertPublicationPlanV2 } from './publication-plan-v2.js';
import type { PublicationPlanV2_1 } from './publication-plan-v2-1.js';
import { assertPublicationPlanV2_1 } from './publication-plan-v2-1.js';
import type { ResearchArtifactRefV1 } from './research-program-types.js';
import type { WorkspaceStore } from './workspace-store.js';

export interface InspectedArticleExecution {
  readonly snapshot: XArticleExecutionSnapshotV1;
  readonly installed_plan_ref: ResearchArtifactRefV1;
  readonly installed_approval_ref: ResearchArtifactRefV1;
  readonly plan: XArticlePublicationPlanV1;
  readonly approval: XArticleApprovalV1;
}

export interface InspectedSingleExecution {
  readonly snapshot: BrowserExecutionSnapshot;
  readonly installed_plan_ref: ResearchArtifactRefV1;
  readonly installed_approval_ref: ResearchArtifactRefV1;
  readonly plan: PublicationPlanV2 | PublicationPlanV2_1;
  readonly approval: ApprovalV2 | ApprovalV2_1;
  readonly latest_receipt_path: string | null;
}

export interface PublicationChildExecutionInspector {
  inspectArticle(executionId: string): Promise<InspectedArticleExecution>;
  inspectSingle(runId: string, executionId: string): Promise<InspectedSingleExecution>;
}

interface ArticleAdapterContext {
  readonly plan: XArticlePublicationPlanV1;
  readonly approval: XArticleApprovalV1;
  readonly snapshot: XArticleExecutionSnapshotV1;
}

interface SingleExecutionLocator {
  readonly execution_id: string;
  readonly run_id: string;
  readonly plan_id: string;
  readonly created_at: string;
}

interface SingleExecutionContext {
  readonly plan_path: string;
  readonly approval_path: string;
  readonly latest_receipt_path: string | null;
}

const SAFE_ID = /^[a-z0-9][a-z0-9_-]*$/;
const ARTICLE_STATES = new Set([
  'created', 'preflight', 'account_verified', 'draft_create_armed', 'draft_created',
  'draft_identity_unknown', 'content_filling', 'content_partially_verified',
  'content_verified', 'preview_verified', 'publish_armed', 'publish_attempted',
  'outcome_resolving', 'public_verifying', 'finalized', 'pre_publish_failed',
  'cancelled_before_publish', 'published_unverified', 'outcome_unknown',
  'verification_conflict', 'failed_after_publish'
]);

export class WorkspacePublicationChildExecutionInspector
implements PublicationChildExecutionInspector {
  constructor(private readonly store: WorkspaceStore) {}

  async inspectArticle(executionId: string): Promise<InspectedArticleExecution> {
    this.assertSafeId(executionId, 'Article execution');
    const prefix = `runs/${executionId}/x-article/browser`;
    const [planArtifact, approvalArtifact, contextArtifact] = await Promise.all([
      this.store.readContainedArtifact(`${prefix}/plan.json`),
      this.store.readContainedArtifact(`${prefix}/approval.json`),
      this.store.readContainedArtifact(`${prefix}/adapter-context.json`)
    ]);
    const plan = this.parse<XArticlePublicationPlanV1>(planArtifact.content, 'Article Plan');
    const approval = this.parse<XArticleApprovalV1>(approvalArtifact.content, 'Article Approval');
    const context = this.parse<ArticleAdapterContext>(contextArtifact.content, 'Article context');
    assertXArticlePublicationPlan(plan);
    verifyXArticleApproval(plan, approval, new Date(approval.approved_at));
    if (
      sha256(context.plan) !== sha256(plan) ||
      sha256(context.approval) !== sha256(approval) ||
      context.snapshot.execution_id !== executionId ||
      context.snapshot.run_id !== plan.run_id ||
      context.snapshot.plan_id !== plan.plan_id ||
      !ARTICLE_STATES.has(context.snapshot.state) ||
      !Number.isInteger(context.snapshot.publish_command_count) ||
      context.snapshot.publish_command_count < 0
    ) {
      throw new HarnessError('APPROVAL_STALE', 'Article execution context is stale');
    }
    return {
      snapshot: context.snapshot,
      installed_plan_ref: { path: planArtifact.relative_path, digest: planArtifact.digest },
      installed_approval_ref: {
        path: approvalArtifact.relative_path,
        digest: approvalArtifact.digest
      },
      plan,
      approval
    };
  }

  async inspectSingle(runId: string, executionId: string): Promise<InspectedSingleExecution> {
    this.assertSafeId(runId, 'Single run');
    this.assertSafeId(executionId, 'Single execution');
    const locator = await this.readJson<SingleExecutionLocator>(
      `x/browser-executions/${executionId}.json`
    );
    if (locator.execution_id !== executionId || locator.run_id !== runId) {
      throw new HarnessError('APPROVAL_STALE', 'Single execution locator is stale');
    }
    const prefix = `runs/${runId}/x/browser/${executionId}`;
    const [snapshot, context] = await Promise.all([
      this.readJson<BrowserExecutionSnapshot>(`${prefix}/state.json`),
      this.readJson<SingleExecutionContext>(`${prefix}/execution-context.json`)
    ]);
    if (
      snapshot.execution_id !== executionId || snapshot.run_id !== runId ||
      snapshot.plan_id !== locator.plan_id || !Number.isInteger(snapshot.submit_command_count) ||
      snapshot.submit_command_count < 0
    ) {
      throw new HarnessError('APPROVAL_STALE', 'Single execution snapshot is stale');
    }
    const version = context.plan_path === `${prefix}/publication-plan-2.0.json`
      ? '2.0'
      : context.plan_path === `${prefix}/publication-plan-2.1.json`
        ? '2.1'
        : null;
    if (
      version === null ||
      context.approval_path !== `${prefix}/approval-${version}.json`
    ) {
      throw new HarnessError('APPROVAL_STALE', 'Single installed Plan path is stale');
    }
    const [planArtifact, approvalArtifact] = await Promise.all([
      this.store.readContainedArtifact(context.plan_path),
      this.store.readContainedArtifact(context.approval_path)
    ]);
    const plan = this.parse<PublicationPlanV2 | PublicationPlanV2_1>(
      planArtifact.content,
      'Single Plan'
    );
    const approval = this.parse<ApprovalV2 | ApprovalV2_1>(
      approvalArtifact.content,
      'Single Approval'
    );
    if (plan.schema_version === '2.0' && approval.schema_version === '2.0') {
      assertPublicationPlanV2(plan);
      verifyApprovalV2(plan, approval, new Date(approval.approved_at));
    } else if (plan.schema_version === '2.1' && approval.schema_version === '2.1') {
      assertPublicationPlanV2_1(plan);
      verifyApprovalV2_1(plan, approval, new Date(approval.approved_at));
    } else {
      throw new HarnessError('APPROVAL_STALE', 'Single installed Plan and Approval versions differ');
    }
    if (
      plan.run_id !== runId || plan.plan_id !== locator.plan_id ||
      context.plan_path !== `${prefix}/publication-plan-${plan.schema_version}.json` ||
      context.approval_path !== `${prefix}/approval-${plan.schema_version}.json`
    ) {
      throw new HarnessError('APPROVAL_STALE', 'Single installed artifacts are stale');
    }
    return {
      snapshot,
      installed_plan_ref: { path: planArtifact.relative_path, digest: planArtifact.digest },
      installed_approval_ref: {
        path: approvalArtifact.relative_path,
        digest: approvalArtifact.digest
      },
      plan,
      approval,
      latest_receipt_path: context.latest_receipt_path
    };
  }

  private async readJson<T>(path: string): Promise<T> {
    const artifact = await this.store.readContainedArtifact(path);
    return this.parse<T>(artifact.content, path);
  }

  private parse<T>(content: Buffer, label: string): T {
    try {
      return JSON.parse(content.toString('utf8')) as T;
    } catch {
      throw new HarnessError('CONTRACT_INVALID', `${label} is not valid JSON`);
    }
  }

  private assertSafeId(value: string, label: string): void {
    if (!SAFE_ID.test(value)) {
      throw new HarnessError('WORKSPACE_PATH_INVALID', `${label} id is not workspace-safe`);
    }
  }
}
