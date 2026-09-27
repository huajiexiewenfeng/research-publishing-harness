import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { sha256 } from '../../../core/digest.js';
import { HarnessError } from '../../../core/errors.js';
import { validateContract } from '../../../core/schema-validator.js';
import {
  notifyTerminalSafely,
  type ResearchTerminalNotifier
} from '../../../core/research-terminal-hooks.js';
import {
  createXArticleExecutionEvent,
  transitionXArticleExecution,
  type XArticleExecutionEventV1,
  type XArticleExecutionSnapshotV1,
  type XArticleExecutionState
} from '../../../core/x-article-execution.js';
import {
  verifyXArticleApproval,
  type XArticleApprovalV1
} from '../../../core/x-article-approval.js';
import {
  verifyXArticlePublishConfirmation,
  type XArticlePublishConfirmationV1
} from '../../../core/x-article-publish-confirmation.js';
import {
  assertXArticlePublicationPlan,
  type XArticlePublicationPlanV1
} from '../../../core/x-article-publication-plan.js';
import {
  createInitialXArticleMaterializationCheckpoint,
  createAdoptedXArticleMaterializationCheckpoint,
  createSupersedingXArticleMaterializationReceipt,
  createXArticleMaterializationReceipt,
  createXArticleFastPathResult,
  createXArticleMaterializationStartEvidence,
  createXArticleMaterializationPlan,
  createXArticleStageProgress,
  verifyXArticleMaterializationStartEvidence,
  type XArticleMaterializationCheckpointV1,
  type XArticleMaterializationPlanV1,
  type XArticleMaterializationReceiptV1,
  type XArticleMaterializationStartEvidenceV1,
  type XArticleFastPathResultV1,
  type XArticleStageProgressV1
} from '../../../core/x-article-materialization.js';
import { createXArticleExistingDraftBinding, verifyXArticleExistingDraftBinding } from '../../../core/x-article-existing-draft-binding.js';
import {
  assertXArticleFastPathAudit,
  verifyXArticleFastPathConfirmation,
  type XArticleFastPathAuditV1,
  type XArticleFastPathConfirmationV1
} from '../../../core/x-article-fast-path.js';
import {
  assertXArticleFastPathReleaseSet,
  type XArticleFastPathReleaseSetV1
} from '../../../core/x-article-fast-path-release.js';
import {
  evaluateXArticleFastPathDeadline,
  type XArticleFastPathDeadlineEvaluation
} from '../../../core/x-article-fast-path-deadline.js';
import { XArticleMaterializationStore } from '../../../core/x-article-materialization-store.js';
import type { WorkspaceStore } from '../../../core/workspace-store.js';
import {
  computeXArticleElapsedSeconds,
  computeXArticlePageRevision,
  type XArticleBrowserObservation,
  type XArticlePublishReviewObservation
} from './article-browser-protocol.js';
import { decideXArticleMediaAttempt } from './article-media-attempt-policy.js';
import { reconcileXArticleDraft } from './article-draft-reconciler.js';
import { verifyPublicXArticle } from './article-public-verifier.js';
import { createXArticleReceipt } from './article-receipt.js';
import {
  XArticleCommandBroker,
  type IssueXArticleBrowserCommandInput,
  type XArticleBrowserCommandKind,
  type XArticleBrowserCommandV1,
  type XArticleCommandClaimV1
} from './article-command-broker.js';
import {
  nextMaterializationEditorDecision,
  nextArticleEditorDecision,
  type XArticleImportStrategy
} from './article-editor-protocol.js';
import { createXArticleImportTemplate } from './article-import-template.js';
import type { XArticlePageContract } from './article-page-contract.js';

export interface XArticleBrowserCapabilityManifestV1 {
  readonly executor: 'codex-chrome';
  readonly executor_version: string;
  readonly browser_family: 'chrome';
  readonly capabilities: readonly XArticleBrowserCommandKind[];
  readonly observed_at: string;
}

export type XArticleBrowserHostReason =
  | 'observation_captured'
  | 'cover_uploaded'
  | 'inline_image_uploaded'
  | 'file_transfer_missing'
  | 'x_media_effect_absent'
  | 'x_media_still_processing'
  | 'observation_unavailable_after_selection'
  | 'command_or_asset_invalid'
  | 'cover_control_ambiguous'
  | 'anchor_control_ambiguous'
  | 'anchor_context_changed'
  | 'inline_alt_unverified';

export interface XArticleBrowserReportInput {
  readonly command: XArticleBrowserCommandV1;
  readonly status: 'success' | 'transient_failure' | 'uncertain' | 'rejected';
  readonly observation: XArticleBrowserObservation | null;
  readonly host_reason?: XArticleBrowserHostReason;
}

interface AdapterContext {
  readonly schema_version: '1.0';
  readonly plan: XArticlePublicationPlanV1;
  readonly approval: XArticleApprovalV1 | null;
  readonly execution_mode: 'materialization_v3_2' | 'media_completion_v3_3' | 'legacy_preapproved';
  readonly materialization_plan: XArticleMaterializationPlanV1 | null;
  readonly fast_path: XArticleFastPathExecutionBindingV1 | null;
  readonly capabilities: XArticleBrowserCapabilityManifestV1;
  readonly import_strategy: XArticleImportStrategy;
  readonly bulk_import_issued: boolean;
  readonly snapshot: XArticleExecutionSnapshotV1;
  readonly latest_observation: XArticleBrowserObservation | null;
  readonly latest_editor_observation_id: string | null;
  readonly latest_preview_observation_id: string | null;
  readonly editor_revision: string | null;
  readonly preview_revision: string | null;
  readonly pending_command: XArticleBrowserCommandV1 | null;
  readonly pending_issue: PendingIssueIntent | null;
  readonly last_projected_report: ProjectedReportIdentity | null;
  readonly submit_delivered: boolean;
  readonly needs_editor_observation: boolean;
  readonly automation_started_at: string;
}

interface XArticleFastPathExecutionBindingV1 {
  readonly audit_digest: `sha256:${string}`;
  readonly preflight_digest: `sha256:${string}`;
  readonly confirmation_digest: `sha256:${string}`;
  readonly started_at: string;
  readonly time_budget_seconds: 600 | 900;
  readonly recovery_budget_seconds: 120;
  readonly recovery_count: 0 | 1;
}

interface XArticleFastPathConfirmationConsumptionV1 {
  readonly schema_version: 'x-article-fast-path-confirmation-consumption/v1';
  readonly execution_id: string;
  readonly audit_digest: `sha256:${string}`;
  readonly preflight_digest: `sha256:${string}`;
  readonly confirmation_digest: `sha256:${string}`;
  readonly draft_target_digest: `sha256:${string}`;
  readonly capabilities_digest: `sha256:${string}`;
  readonly release_set_digest: `sha256:${string}`;
  readonly source_observation_digest: `sha256:${string}` | null;
  readonly created_at: string;
  readonly consumption_digest: `sha256:${string}`;
}

export interface PrepareXArticleFastPathInput {
  readonly audit: XArticleFastPathAuditV1;
  readonly confirmation: XArticleFastPathConfirmationV1;
  readonly capabilities: XArticleBrowserCapabilityManifestV1;
  readonly release_set: XArticleFastPathReleaseSetV1;
  readonly source_observation?: XArticleBrowserObservation;
}

export interface XArticleFastPathStatusProjectionV1 {
  readonly stage: 'Draft ready' | 'Cover' | 'Inline images' | 'Final check' | 'Timed out';
  readonly timed_out: boolean;
  readonly cover: `${number}/${number}`;
  readonly inline_images: `${number}/${number}`;
  readonly result_path: string | null;
}

export type XArticleBrowserStatusV1 = XArticleExecutionSnapshotV1 & {
  readonly fast_path_status?: XArticleFastPathStatusProjectionV1;
};

interface PendingIssueIntent {
  readonly command_id: string;
  readonly input: IssueXArticleBrowserCommandInput;
  readonly input_digest: string;
  readonly checkpoint_revision: number | null;
  readonly action_key: string;
}

interface V3_3CommandIssueBinding {
  readonly schema_version: 'x-article-command-issue-binding/v1';
  readonly execution_id: string;
  readonly command_id: string;
  readonly input_digest: string;
  readonly checkpoint_revision: number | null;
  readonly action_key: string;
  readonly predecessor_observation_id: string | null;
  readonly predecessor_revision: string | null;
  readonly binding_digest: string;
}

interface ProjectedReportIdentity {
  readonly command_id: string;
  readonly report_digest: string;
}

interface ReportProjectionComplete {
  readonly schema_version: '1.0';
  readonly execution_id: string;
  readonly command_id: string;
  readonly report_digest: string;
  readonly preview_receipt_digest: `sha256:${string}` | null;
  readonly projection_digest: `sha256:${string}`;
}

interface MaterializationReportEvidenceV1 {
  readonly schema_version: 'x-article-materialization-report/v1';
  readonly execution_id: string;
  readonly command_id: string;
  readonly report: XArticleBrowserReportInput;
  readonly report_digest: `sha256:${string}`;
  readonly reported_at: string;
  readonly evidence_digest: `sha256:${string}`;
}

interface XArticlePublishConfirmationConsumptionV1 {
  readonly schema_version: 'x-article-publish-confirmation-consumption/v1';
  readonly execution_id: string;
  readonly draft_id: string;
  readonly confirmation_id: string;
  readonly confirmation_digest: `sha256:${string}`;
  readonly command_id: string;
  readonly command_digest: `sha256:${string}`;
  readonly consumed_at: string;
  readonly consumption_digest: `sha256:${string}`;
}

const V3_3_ALLOWED_COMMANDS = new Set<XArticleBrowserCommandKind>([
  'navigate',
  'observe_article_page',
  'upload_article_cover',
  'replace_article_visual_anchor',
  'set_article_image_alt'
]);
const V3_3_MEDIA_COMMANDS = new Set<XArticleBrowserCommandKind>([
  'upload_article_cover',
  'replace_article_visual_anchor',
  'set_article_image_alt'
]);

interface XArticleBrowserAdapterOptions {
  readonly executionId?: () => string;
  readonly eventId?: () => string;
  readonly commandId?: () => string;
  readonly attemptId?: () => string;
  readonly receiptId?: () => string;
  readonly now?: () => Date;
  readonly terminalNotifier?: ResearchTerminalNotifier;
}

export class XArticleBrowserAdapter {
  private readonly executionId: () => string;
  private readonly eventId: () => string;
  private readonly commandId: () => string;
  private readonly attemptId: () => string;
  private readonly receiptId: () => string;
  private readonly now: () => Date;
  private readonly terminalNotifier: ResearchTerminalNotifier | null;
  private readonly broker: XArticleCommandBroker;
  private readonly materializationStore: XArticleMaterializationStore;

  constructor(
    private readonly store: WorkspaceStore,
    private readonly contract: XArticlePageContract,
    options: XArticleBrowserAdapterOptions = {}
  ) {
    this.executionId = options.executionId ?? (() => `x_article_execution_${randomUUID()}`);
    this.eventId = options.eventId ?? (() => `x_article_event_${randomUUID()}`);
    this.commandId = options.commandId ?? (() => `x_article_command_${randomUUID()}`);
    this.attemptId = options.attemptId ?? (() => `x_article_attempt_${randomUUID()}`);
    this.receiptId = options.receiptId ?? (() => `x_article_receipt_${randomUUID()}`);
    this.now = options.now ?? (() => new Date());
    this.terminalNotifier = options.terminalNotifier ?? null;
    this.broker = new XArticleCommandBroker(store, { now: this.now });
    this.materializationStore = new XArticleMaterializationStore(store);
  }

  async prepare(
    plan: XArticlePublicationPlanV1,
    capabilities: XArticleBrowserCapabilityManifestV1
  ): Promise<XArticleExecutionSnapshotV1> {
    assertXArticlePublicationPlan(plan);
    this.verifyPreparedCapabilities(plan, capabilities);
    const executionId = this.executionId();
    this.assertId(executionId);
    return this.withExecutionLock(executionId, () =>
      this.prepareLocked(plan, capabilities, executionId)
    );
  }

  async prepareExistingDraftMedia(
    plan: XArticlePublicationPlanV1,
    sourceObservation: XArticleBrowserObservation,
    capabilities: XArticleBrowserCapabilityManifestV1
  ): Promise<XArticleExecutionSnapshotV1> {
    assertXArticlePublicationPlan(plan);
    this.verifyPreparedCapabilities(plan, capabilities);
    const binding = createXArticleExistingDraftBinding({ publication_plan: plan, observation: sourceObservation });
    const executionId = this.executionId();
    this.assertId(executionId);
    return this.withExecutionLock(executionId, () => this.prepareLocked(
      plan, capabilities, executionId, {
        execution_mode: 'media_completion_v3_3',
        draft_binding: binding
      }
    ));
  }

  async prepareFastPath(input: PrepareXArticleFastPathInput): Promise<XArticleExecutionSnapshotV1> {
    assertXArticleFastPathReleaseSet(input.release_set);
    assertXArticleFastPathAudit(input.audit);
    verifyXArticleFastPathConfirmation(input.audit, input.confirmation, this.now());
    const plan = input.audit.publication_plan;
    if (sha256(plan.intent.document) !== input.audit.preflight.sanitized_document_digest) {
      throw new HarnessError(
        'CONTRACT_INVALID',
        'X Article Fast Path Plan document differs from the sanitized Preflight document'
      );
    }
    this.verifyPreparedCapabilities(plan, input.capabilities);

    let adopted: {
      readonly execution_mode: 'media_completion_v3_3';
      readonly draft_binding: ReturnType<typeof createXArticleExistingDraftBinding>;
    } | null = null;
    if (input.audit.draft_target.kind === 'new') {
      if (input.source_observation !== undefined) {
        throw new HarnessError(
          'ARTICLE_DRAFT_CONFLICT',
          'new-Draft Fast Path must not include an existing Draft observation'
        );
      }
    } else {
      if (input.source_observation === undefined) {
        throw new HarnessError(
          'ARTICLE_DRAFT_CONFLICT',
          'existing-Draft Fast Path requires a source observation'
        );
      }
      const binding = createXArticleExistingDraftBinding({
        publication_plan: plan,
        observation: input.source_observation
      });
      if (binding.draft_id !== input.audit.draft_target.draft_id) {
        throw new HarnessError(
          'ARTICLE_DRAFT_CONFLICT',
          'existing-Draft Fast Path observation differs from the Audit target'
        );
      }
      adopted = { execution_mode: 'media_completion_v3_3', draft_binding: binding };
    }

    const expected = {
      audit_digest: input.audit.audit_digest,
      preflight_digest: input.audit.preflight.preflight_digest,
      confirmation_digest: input.confirmation.confirmation_digest,
      draft_target_digest: sha256(input.audit.draft_target),
      capabilities_digest: sha256(input.capabilities),
      release_set_digest: sha256(input.release_set),
      source_observation_digest: input.source_observation === undefined
        ? null
        : sha256(input.source_observation)
    } as const;
    const key = input.confirmation.confirmation_digest.slice('sha256:'.length);
    const recordPath = `x/fast-path/confirmations/${key}.json`;
    const lockPath = `x/fast-path/confirmations/${key}.lock`;

    return this.store.withLock(lockPath, async () => {
      let consumption: XArticleFastPathConfirmationConsumptionV1;
      if (await this.store.exists(recordPath)) {
        consumption = await this.store.readJson<XArticleFastPathConfirmationConsumptionV1>(recordPath);
        const { consumption_digest: _digest, execution_id: _executionId, created_at: _createdAt, schema_version: _schema, ...binding } = consumption;
        void _digest; void _executionId; void _createdAt; void _schema;
        const digestBody = Object.fromEntries(
          Object.entries(consumption).filter(([field]) => field !== 'consumption_digest')
        );
        if (
          consumption.schema_version !== 'x-article-fast-path-confirmation-consumption/v1'
          || consumption.consumption_digest !== sha256(digestBody)
          || !isDeepStrictEqual(binding, expected)
        ) {
          throw new HarnessError(
            'ARTICLE_CHECKPOINT_CONFLICT',
            'X Article Fast Path confirmation is already bound to different execution inputs'
          );
        }
      } else {
        const executionId = this.executionId();
        this.assertId(executionId);
        const body = {
          schema_version: 'x-article-fast-path-confirmation-consumption/v1' as const,
          execution_id: executionId,
          ...expected,
          created_at: this.now().toISOString()
        };
        consumption = { ...body, consumption_digest: sha256(body) };
        await this.store.writeNew(recordPath, consumption);
      }

      const fastPath: XArticleFastPathExecutionBindingV1 = {
        audit_digest: consumption.audit_digest,
        preflight_digest: consumption.preflight_digest,
        confirmation_digest: consumption.confirmation_digest,
        started_at: consumption.created_at,
        time_budget_seconds: input.audit.time_budget_seconds,
        recovery_budget_seconds: input.audit.recovery_budget_seconds,
        recovery_count: 0
      };
      return this.withExecutionLock(consumption.execution_id, () => this.prepareLocked(
        plan,
        input.capabilities,
        consumption.execution_id,
        adopted,
        fastPath
      ));
    });
  }

  private async prepareLocked(
    plan: XArticlePublicationPlanV1,
    capabilities: XArticleBrowserCapabilityManifestV1,
    executionId: string,
    adopted: {
      readonly execution_mode: 'media_completion_v3_3';
      readonly draft_binding: ReturnType<typeof createXArticleExistingDraftBinding>;
    } | null = null,
    fastPath: XArticleFastPathExecutionBindingV1 | null = null
  ): Promise<XArticleExecutionSnapshotV1> {
    const materializationPlan = createXArticleMaterializationPlan({
      execution_id: executionId,
      publication_plan: plan,
      import_template: createXArticleImportTemplate(plan.intent.document),
      strategy: 'rich_text_anchor_import/v1',
      draft_binding: adopted?.draft_binding ?? null
    });
    const startEvidence = await this.resolveMaterializationStart(materializationPlan);
    const snapshot = this.initialSnapshot(executionId, plan, startEvidence.started_at);
    const checkpoint = adopted === null
      ? createInitialXArticleMaterializationCheckpoint({ plan: materializationPlan, updated_at: startEvidence.started_at })
      : null;
    const context: AdapterContext = {
      schema_version: '1.0', plan, approval: null, capabilities,
      execution_mode: adopted?.execution_mode ?? 'materialization_v3_2', materialization_plan: materializationPlan,
      fast_path: fastPath,
      import_strategy: 'bulk_document', bulk_import_issued: false, snapshot,
      latest_observation: null, editor_revision: null, preview_revision: null,
      latest_editor_observation_id: null, latest_preview_observation_id: null,
      pending_command: null, pending_issue: null, last_projected_report: null,
      submit_delivered: false, needs_editor_observation: false,
      automation_started_at: snapshot.updated_at
    };
    const materializationPlanPath = `${this.prefix(executionId)}/materialization-plan.json`;
    const checkpointPath = `${this.prefix(executionId)}/materialization-checkpoint.json`;
    const materializationExists = await this.store.exists(materializationPlanPath);
    const checkpointExists = await this.store.exists(checkpointPath);
    if (materializationExists && checkpointExists) {
      const persistedPlan = await this.materializationStore.readPlan(executionId);
      const persistedCheckpoint = await this.materializationStore.readCheckpoint(executionId);
      if (
        !isDeepStrictEqual(persistedPlan, materializationPlan)
        || persistedCheckpoint.materialization_digest !== materializationPlan.materialization_digest
      ) {
        throw new HarnessError(
          'ARTICLE_CHECKPOINT_CONFLICT',
          'prepared X Article materialization retry differs from durable state'
        );
      }
    } else if (checkpoint !== null) {
      await this.materializationStore.create(materializationPlan, checkpoint);
    }

    await this.ensureExactArtifact(`${this.prefix(executionId)}/plan.json`, plan);
    await this.ensureExactArtifact(`${this.prefix(executionId)}/capabilities.json`, capabilities);
    const contextPath = `${this.prefix(executionId)}/adapter-context.json`;
    if (await this.store.exists(contextPath)) {
      const existing = await this.readContext(executionId);
      if (
        existing.execution_mode !== (adopted?.execution_mode ?? 'materialization_v3_2')
        || !isDeepStrictEqual(existing.plan, plan)
        || !isDeepStrictEqual(existing.capabilities, capabilities)
        || !isDeepStrictEqual(existing.materialization_plan, materializationPlan)
        || !isDeepStrictEqual(existing.fast_path ?? null, fastPath)
        || existing.automation_started_at !== startEvidence.started_at
      ) {
        throw new HarnessError(
          'ARTICLE_CHECKPOINT_CONFLICT',
          'prepared X Article adapter retry differs from durable state'
        );
      }
      return existing.snapshot;
    }
    await this.store.writeNew(contextPath, context);
    return snapshot;
  }

  private async resolveMaterializationStart(
    plan: XArticleMaterializationPlanV1
  ): Promise<XArticleMaterializationStartEvidenceV1> {
    const path = this.materializationStartPath(plan.execution_id);
    if (await this.store.exists(path)) {
      try {
        return verifyXArticleMaterializationStartEvidence(
          await this.store.readJson<XArticleMaterializationStartEvidenceV1>(path),
          plan
        );
      } catch (error) {
        throw new HarnessError(
          'ARTICLE_CHECKPOINT_CONFLICT',
          'prepared X Article materialization start evidence differs from durable state',
          error
        );
      }
    }

    const planPath = `${this.prefix(plan.execution_id)}/materialization-plan.json`;
    const checkpointPath = `${this.prefix(plan.execution_id)}/materialization-checkpoint.json`;
    const planExists = await this.store.exists(planPath);
    const checkpointExists = await this.store.exists(checkpointPath);
    let startedAt: string;
    if (planExists || checkpointExists) {
      if (!planExists || !checkpointExists) {
        throw new HarnessError(
          'ARTICLE_CHECKPOINT_CONFLICT',
          'missing start evidence cannot be repaired from partial materialization state'
        );
      }
      const persistedPlan = await this.materializationStore.readPlan(plan.execution_id);
      const persistedCheckpoint = await this.materializationStore.readCheckpoint(plan.execution_id);
      const expectedCheckpoint = createInitialXArticleMaterializationCheckpoint({
        plan,
        updated_at: persistedCheckpoint.updated_at
      });
      if (
        !isDeepStrictEqual(persistedPlan, plan)
        || !isDeepStrictEqual(persistedCheckpoint, expectedCheckpoint)
      ) {
        throw new HarnessError(
          'ARTICLE_CHECKPOINT_CONFLICT',
          'missing start evidence cannot be repaired from advanced materialization state'
        );
      }
      const contextPath = `${this.prefix(plan.execution_id)}/adapter-context.json`;
      if (await this.store.exists(contextPath)) {
        const context = await this.readContext(plan.execution_id);
        if (
          context.execution_mode !== 'materialization_v3_2'
          || context.snapshot.state !== 'created'
          || context.snapshot.sequence !== 0
          || context.snapshot.updated_at !== persistedCheckpoint.updated_at
          || context.automation_started_at !== persistedCheckpoint.updated_at
        ) {
          throw new HarnessError(
            'ARTICLE_CHECKPOINT_CONFLICT',
            'missing start evidence cannot be repaired after adapter execution advanced'
          );
        }
      }
      startedAt = persistedCheckpoint.updated_at;
    } else {
      startedAt = this.now().toISOString();
    }
    const evidence = createXArticleMaterializationStartEvidence({ plan, started_at: startedAt });
    await this.writeNewMaterializationStart(path, evidence, plan);
    return evidence;
  }

  private async writeNewMaterializationStart(
    path: string,
    evidence: XArticleMaterializationStartEvidenceV1,
    plan: XArticleMaterializationPlanV1
  ): Promise<void> {
    try {
      await this.store.writeNew(path, evidence);
    } catch (error) {
      if (!(await this.store.exists(path))) {
        try {
          await this.store.writeNew(path, evidence);
        } catch {
          throw error;
        }
      }
      const persisted = verifyXArticleMaterializationStartEvidence(
        await this.store.readJson<XArticleMaterializationStartEvidenceV1>(path),
        plan
      );
      if (!isDeepStrictEqual(persisted, evidence)) {
        throw new HarnessError(
          'ARTICLE_CHECKPOINT_CONFLICT',
          'materialization start write repaired different evidence'
        );
      }
      throw error;
    }
  }

  async start(
    plan: XArticlePublicationPlanV1,
    approval: XArticleApprovalV1,
    capabilities: XArticleBrowserCapabilityManifestV1
  ): Promise<XArticleExecutionSnapshotV1> {
    assertXArticlePublicationPlan(plan);
    verifyXArticleApproval(plan, approval, this.now());
    const importStrategy = this.verifyCapabilities(plan, capabilities);
    const executionId = this.executionId();
    this.assertId(executionId);
    const snapshot = this.initialSnapshot(executionId, plan);
    const context: AdapterContext = {
      schema_version: '1.0', plan, approval, capabilities,
      execution_mode: 'legacy_preapproved', materialization_plan: null,
      fast_path: null,
      import_strategy: importStrategy, snapshot,
      bulk_import_issued: false,
      latest_observation: null, editor_revision: null, preview_revision: null,
      latest_editor_observation_id: null, latest_preview_observation_id: null,
      pending_command: null, pending_issue: null, last_projected_report: null,
      submit_delivered: false, needs_editor_observation: false,
      automation_started_at: snapshot.updated_at
    };
    await this.store.writeNewDirectory(this.prefix(executionId), {
      'plan.json': plan, 'approval.json': approval, 'capabilities.json': capabilities,
      'adapter-context.json': context
    });
    await notifyTerminalSafely(this.store, this.terminalNotifier, {
      notification_id: `publication_plan_${plan.plan_id}_${executionId}`,
      kind: 'publication_plan_approved', publication_kind: null,
      workspace_relative_path: `${this.prefix(executionId)}/plan.json`, role: 'publication_plan',
      media_type: 'application/json', canonical: true, privacy_classification: 'internal',
      occurred_at: snapshot.updated_at
    });
    return snapshot;
  }

  async next(executionId: string): Promise<{
    readonly snapshot: XArticleExecutionSnapshotV1;
    readonly command: XArticleBrowserCommandV1 | null;
  }> {
    return this.withExecutionLock(executionId, () => this.nextLocked(executionId));
  }

  private async nextLocked(executionId: string): Promise<{
    readonly snapshot: XArticleExecutionSnapshotV1;
    readonly command: XArticleBrowserCommandV1 | null;
  }> {
    let context = await this.readContext(executionId);
    if (
      context.snapshot.state === 'cancelled_before_publish'
      || context.snapshot.state === 'materialization_blocked'
    ) {
      return { snapshot: context.snapshot, command: null };
    }
    const deadline = this.fastPathDeadline(context);
    if (deadline?.exceeded === true && context.snapshot.state !== 'draft_reconciled') {
      const checkpoint = await this.materializationStore.readCheckpoint(executionId);
      context = await this.blockMaterialization(context, checkpoint, {
        kind: 'fast_path_timeout',
        elapsed_seconds: deadline.elapsed_seconds,
        time_budget_seconds: context.fast_path!.time_budget_seconds
      });
      return { snapshot: context.snapshot, command: null };
    }
    if (context.pending_issue !== null && context.pending_command === null) {
      await this.assertV3_3PendingIssueBinding(context);
      const recovered = await this.finishPendingIssue(context);
      if (
        context.execution_mode === 'media_completion_v3_3'
        && this.isMaterializationEffect(recovered.command)
      ) {
        return this.observeUnreportedV3_3Effect(await this.readContext(executionId));
      }
      return recovered;
    }
    if (context.pending_command !== null) {
      await this.assertV3_3PendingIssueBinding(context);
      await this.assertV3_3DurableCommand(context, context.pending_command);
      if (
        context.execution_mode === 'media_completion_v3_3'
        && this.isMaterializationEffect(context.pending_command)
      ) {
        return this.observeUnreportedV3_3Effect(context);
      }
      return {
        snapshot: context.snapshot,
        command: context.pending_command.side_effect === 'submit' && context.submit_delivered
          ? null
          : context.pending_command
      };
    }

    const state = context.snapshot.state;
    if (state === 'created') {
      const adopted = context.execution_mode === 'media_completion_v3_3';
      context = await this.transition(context, 'preflight', adopted ? 'article_adoption_observing' : 'preflight_started');
      if (adopted) {
        const draftId = context.materialization_plan?.draft_binding?.draft_id;
        if (draftId === undefined) {
          throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'existing Draft binding is absent');
        }
        return this.issue(context, {
          execution_id: executionId, run_id: context.plan.run_id, draft_id: draftId,
          kind: 'navigate', purpose: 'navigate_existing_article_draft',
          expected_page_revision: null, allowed_origin: 'https://x.com', side_effect: 'read',
          payload: { kind: 'navigate', url: `https://x.com/compose/articles/edit/${draftId}` }
        });
      }
      return this.issue(context, {
        execution_id: executionId, run_id: context.plan.run_id, draft_id: null,
        kind: 'observe_article_page', purpose: 'observe_articles_index',
        expected_page_revision: null, allowed_origin: 'https://x.com', side_effect: 'read',
        payload: { kind: 'observe_article_page', scope: 'index' }
      });
    }

    if (
      context.execution_mode === 'media_completion_v3_3'
      && (state === 'preflight' || state === 'account_verified' || state === 'draft_created')
    ) {
      return this.advanceAdoptedDraftBinding(context);
    }

    if (state === 'preflight') {
      const observation = this.requireObservation(context);
      const account = this.contract.detectAccount(observation);
      if (account.handle !== context.plan.intent.target_account) {
        throw new HarnessError('X_ACCOUNT_MISMATCH', 'X Article account differs from the Plan target');
      }
      const page = this.contract.detectPage(observation);
      if (page.kind !== 'articles_index') {
        throw new HarnessError('ARTICLE_DRAFT_CONFLICT', 'new X Article publication must start from the Articles index');
      }
      if (this.isPreparedMaterializationMode(context)) {
        const checkpoint = await this.materializationStore.readCheckpoint(executionId);
        await this.materializationStore.updateCheckpoint(executionId, checkpoint.revision, (current) => ({
          ...current,
          phase: 'preflight_passed',
          updated_at: this.now().toISOString()
        }));
      }
      context = await this.transition(context, 'account_verified', 'article_account_verified');
      context = await this.transition(context, 'draft_create_armed', 'article_draft_create_armed');
      return this.issue(context, {
        execution_id: executionId, run_id: context.plan.run_id, draft_id: null,
        kind: 'create_article_draft', purpose: 'create_article_draft',
        expected_page_revision: observation.page_revision, allowed_origin: 'https://x.com', side_effect: 'write',
        payload: { kind: 'create_article_draft', target_ref: this.contract.detectControl(observation, 'create').ref }
      });
    }

    if (state === 'draft_create_armed') {
      const observation = this.requireObservation(context);
      const page = this.contract.detectPage(observation);
      if (page.kind !== 'article_editor') {
        throw new HarnessError('ARTICLE_DRAFT_IDENTITY_UNKNOWN', 'draft creation did not produce a unique Article editor identity');
      }
      context = await this.transition(context, 'draft_created', 'article_draft_identity_captured', {
        draft_id: page.draft_id
      });
      if (this.isPreparedMaterializationMode(context)) {
        const checkpoint = await this.materializationStore.readCheckpoint(executionId);
        await this.materializationStore.updateCheckpoint(executionId, checkpoint.revision, (current) => ({
          ...current,
          draft_id: page.draft_id,
          phase: 'article_shell_ready',
          last_editor_revision: current.last_editor_revision ?? observation.page_revision,
          updated_at: this.now().toISOString()
        }));
        context = await this.transition(
          context,
          'materialization_reconciling',
          'article_materialization_reconciling'
        );
        return this.nextMaterializationCommand(context, observation);
      }
      context = await this.transition(context, 'content_filling', 'article_content_filling_started');
      return this.nextEditorCommand(context, observation);
    }

    if (state === 'draft_reconciled') {
      await this.ensureFastPathResult(context);
      return { snapshot: context.snapshot, command: null };
    }

    if (state === 'materialization_reconciling') {
      if (context.needs_editor_observation) return this.issueEditorObservation(context);
      return this.nextMaterializationCommand(context, this.requireObservation(context));
    }

    if (state === 'content_filling' || state === 'content_partially_verified') {
      return this.nextEditorCommand(context, this.requireObservation(context));
    }

    if (state === 'content_verified') {
      const observation = this.requireObservation(context);
      const preview = this.contract.detectPreview(observation);
      const expected = context.plan.intent.document;
      const actual = {
        schema_version: '1.0', title: preview.title,
        cover_asset_id: preview.visuals.find((visual) => visual.kind === 'cover')?.asset_id ?? null,
        blocks: preview.blocks
      };
      if (sha256(actual) !== sha256(expected)) {
        throw new HarnessError('ARTICLE_PREVIEW_MISMATCH', 'X Article Preview differs from the approved Plan');
      }
      context = await this.transition(context, 'preview_verified', 'article_preview_verified');
      return this.issue(context, {
        execution_id: executionId, run_id: context.plan.run_id, draft_id: context.snapshot.draft_id,
        kind: 'open_publish_review', purpose: 'open_publish_review',
        expected_page_revision: observation.page_revision, allowed_origin: 'https://x.com', side_effect: 'write',
        payload: { kind: 'open_publish_review', target_ref: this.contract.detectControl(observation, 'publish').ref }
      });
    }

    if (state === 'publish_armed' && context.execution_mode === 'materialization_v3_2') {
      await this.verifyStoredPublishConfirmation(context, ['armed']);
      const observation = this.requireObservation(context);
      if (observation.preview !== null) {
        return this.issue(context, {
          execution_id: executionId, run_id: context.plan.run_id,
          draft_id: context.snapshot.draft_id,
          kind: 'open_publish_review', purpose: 'open_publish_review',
          expected_page_revision: observation.page_revision,
          allowed_origin: 'https://x.com', side_effect: 'write',
          payload: {
            kind: 'open_publish_review',
            target_ref: this.contract.detectControl(observation, 'publish').ref
          }
        });
      }
      const review = await this.assertPreparedPublishReview(context, observation);
      return this.issue(context, {
        execution_id: executionId, run_id: context.plan.run_id,
        draft_id: context.snapshot.draft_id,
        kind: 'publish_article_once', purpose: 'publish_article_once',
        expected_page_revision: observation.page_revision,
        allowed_origin: 'https://x.com', side_effect: 'submit',
        payload: { kind: 'publish_article_once', target_ref: review.final_publish_ref }
      }, `publish_${executionId}`);
    }

    if (state === 'preview_verified' || (
      state === 'publish_armed' && context.execution_mode === 'legacy_preapproved'
    )) {
      const observation = this.requireObservation(context);
      const review = this.contract.detectPublishReview(observation);
      if (review.draft_id !== context.snapshot.draft_id || review.audience !== 'everyone' || review.final_publish_ref === null) {
        throw new HarnessError('ARTICLE_PREVIEW_MISMATCH', 'X Article publish review differs from the approved account or audience');
      }
      verifyXArticleApproval(context.plan, this.requireApproval(context), this.now());
      if (state === 'preview_verified') {
        context = await this.transition(context, 'publish_armed', 'article_publish_armed', {
          attempt_id: this.attemptId()
        });
      }
      const issued = await this.issue(context, {
        execution_id: executionId, run_id: context.plan.run_id, draft_id: context.snapshot.draft_id,
        kind: 'publish_article_once', purpose: 'publish_article_once',
        expected_page_revision: observation.page_revision, allowed_origin: 'https://x.com', side_effect: 'submit',
        payload: { kind: 'publish_article_once', target_ref: review.final_publish_ref }
      }, `publish_${executionId}`);
      context = await this.readContext(executionId);
      context = await this.transition(context, 'publish_attempted', 'article_publish_command_issued', {
        publish_command_count: 1,
        submit_delivered: true
      });
      return { snapshot: context.snapshot, command: issued.command };
    }

    if (state === 'publish_attempted' || state === 'outcome_resolving') {
      if (state === 'publish_attempted') {
        context = await this.transition(context, 'outcome_resolving', 'article_publish_outcome_resolving');
      }
      context = await this.transition(context, 'public_verifying', 'article_public_verification_started');
      return this.nextPublicVerification(context);
    }

    if (state === 'public_verifying') {
      return this.nextPublicVerification(context);
    }

    return { snapshot: context.snapshot, command: null };
  }

  async claim(command: XArticleBrowserCommandV1): Promise<XArticleCommandClaimV1> {
    const detachedCommand = structuredClone(command);
    return this.withExecutionLock(detachedCommand.execution_id, () =>
      this.claimLocked(detachedCommand)
    );
  }

  private async claimLocked(command: XArticleBrowserCommandV1): Promise<XArticleCommandClaimV1> {
    let context = await this.readContext(command.execution_id);
    this.assertClaimLifecycleActive(context);
    if (command.side_effect !== 'read' && this.fastPathDeadline(context)?.exceeded === true) {
      throw new HarnessError(
        'ARTICLE_MATERIALIZATION_TIMEOUT',
        'X Article Fast Path write authorization expired before command claim'
      );
    }
    await this.assertV3_3PendingIssueBinding(context);
    await this.assertV3_3DurableCommand(context, command);
    if (
      context.pending_command === null
      && context.pending_issue?.command_id === command.command_id
    ) {
      context = await this.recoverBrokerPersistedCommand(context, command);
    }
    this.assertPendingClaimIdentity(context, command);
    if (
      command.kind === 'publish_article_once'
      && command.side_effect === 'submit'
      && context.execution_mode === 'materialization_v3_2'
    ) {
      return this.claimPreparedPublish(context, command);
    }
    return this.broker.claim(command);
  }

  private assertClaimLifecycleActive(context: AdapterContext): void {
    if (
      context.snapshot.state === 'cancelled_before_publish'
      || context.snapshot.state === 'finalized'
      || context.snapshot.state === 'verification_conflict'
      || context.snapshot.state === 'failed_after_publish'
      || context.snapshot.state === 'materialization_blocked'
    ) {
      throw new HarnessError(
        'COMMAND_REPLAY_REJECTED',
        `X Article command cannot be claimed from terminal state ${context.snapshot.state}`
      );
    }
  }

  private assertPendingClaimIdentity(
    context: AdapterContext,
    command: XArticleBrowserCommandV1
  ): void {
    const intent = context.pending_issue;
    const stableCommandInput = Object.fromEntries(
      Object.entries(command).filter(([key]) =>
        !['schema_version', 'command_id', 'payload_digest', 'issued_at'].includes(key)
      )
    );
    if (
      context.pending_command === null
      || intent === null
      || command.execution_id !== context.snapshot.execution_id
      || context.snapshot.latest_command_id !== command.command_id
      || intent.command_id !== command.command_id
      || intent.input.execution_id !== context.snapshot.execution_id
      || intent.input_digest !== sha256(intent.input)
      || intent.input_digest !== sha256(stableCommandInput)
      || sha256(context.pending_command) !== sha256(command)
    ) {
      throw new HarnessError(
        'COMMAND_REPLAY_REJECTED',
        'X Article claim does not match the current durable pending command issue'
      );
    }
  }

  async report(input: XArticleBrowserReportInput): Promise<XArticleExecutionSnapshotV1> {
    return this.withExecutionLock(input.command.execution_id, () => this.reportLocked(input));
  }

  private async reportLocked(input: XArticleBrowserReportInput): Promise<XArticleExecutionSnapshotV1> {
    let context = await this.readContext(input.command.execution_id);
    await this.assertV3_3PendingIssueBinding(context, input.command.command_id);
    await this.assertV3_3DurableCommand(context, input.command);
    const reportDigest = sha256(input);
    const reportPath = `${this.prefix(input.command.execution_id)}/reports/${input.command.command_id}.json`;
    const projectionPath = this.reportProjectionPath(input.command);
    if (await this.store.exists(projectionPath)) {
      const projection = await this.readReportProjection(projectionPath, {
        execution_id: input.command.execution_id,
        command_id: input.command.command_id,
        report_digest: reportDigest
      });
      if (
        projection.execution_id !== input.command.execution_id
        || projection.command_id !== input.command.command_id
        || projection.report_digest !== reportDigest
      ) {
        throw new HarnessError('CONTRACT_INVALID', 'replayed X Article report projection changed');
      }
      if (this.isPreparedMaterializationMode(context)) {
        const evidence = await this.readMaterializationReportEvidence(reportPath, input.command);
        if (evidence.report_digest !== reportDigest) {
          throw new HarnessError('CONTRACT_INVALID', 'replayed X Article report artifact changed');
        }
      } else {
        const persistedReport = await this.store.readJson<XArticleBrowserReportInput>(reportPath);
        if (sha256(persistedReport) !== reportDigest) {
          throw new HarnessError('CONTRACT_INVALID', 'replayed X Article report artifact changed');
        }
      }
      context = await this.recoverPreBindingAdoptionRejectionContext(context);
      if (
        context.pending_command?.command_id === input.command.command_id
        || context.pending_issue?.command_id === input.command.command_id
      ) {
        context = await this.finalizeProjectedReport(
          context,
          input.command.command_id,
          reportDigest
        );
      }
      return context.snapshot;
    }
    if (context.snapshot.state === 'cancelled_before_publish') {
      throw new HarnessError(
        'COMMAND_REPLAY_REJECTED',
        'cancelled X Article execution does not accept reports'
      );
    }
    if (
      context.pending_command === null
      && context.pending_issue?.command_id === input.command.command_id
    ) {
      context = await this.recoverBrokerPersistedCommand(context, input.command);
    }
    if (context.pending_command?.command_id !== input.command.command_id) {
      throw new HarnessError('COMMAND_REPLAY_REJECTED', 'reported X Article command is not pending');
    }
    if (sha256(context.pending_command) !== sha256(input.command)) {
      if (this.isPreparedReportActive(context)) {
        const checkpoint = await this.materializationStore.readCheckpoint(context.snapshot.execution_id);
        context = await this.blockMaterialization(context, checkpoint, {
          kind: 'unverifiable', reasons: ['reported command envelope changed']
        });
        return (await this.finalizeProjectedReport(
          context,
          input.command.command_id,
          reportDigest
        )).snapshot;
      }
      throw new HarnessError('CONTRACT_INVALID', 'reported X Article command envelope changed');
    }
    if (input.observation !== null) {
      validateContract<XArticleBrowserObservation>(
        'x-article-browser-observation',
        input.observation
      );
    }
    const reconcileUncertainMaterialization = input.observation !== null
      && this.isPreparedMaterializationMode(context)
      && this.isMaterializationEffect(input.command)
      && (input.observation.editor !== null || input.observation.preview !== null);
    if (
      input.observation !== null
      && (input.status === 'success' || reconcileUncertainMaterialization)
    ) {
      try {
        this.contract.detectPage(input.observation);
      } catch (error) {
        if (!(error instanceof HarnessError)) throw error;
        if (
          context.execution_mode === 'media_completion_v3_3'
          && context.snapshot.state === 'preflight'
        ) {
          return this.finalizePreBindingAdoptionRejection(
            context, reportPath, input, reportDigest, error
          );
        }
        if (!this.isPreparedMaterializationMode(context)) throw error;
        const checkpoint = await this.materializationStore.readCheckpoint(context.snapshot.execution_id);
        context = await this.blockMaterialization(context, checkpoint, {
          kind: 'unverifiable', reasons: ['reported page contract is malformed']
        });
        return (await this.finalizeProjectedReport(context, input.command.command_id, reportDigest)).snapshot;
      }
    }
    let materializationReport: MaterializationReportEvidenceV1 | null = null;
    if (this.isPreparedMaterializationMode(context)) {
      materializationReport = await this.persistMaterializationReportEvidence(reportPath, input);
      if (await this.hasMaterializationCheckpoint(context)) {
        await this.recordMaterializationProgress(context, materializationReport);
      }
    } else {
      await this.ensureExactArtifact(reportPath, input);
    }
    if (await this.hasDurablePreBindingAdoptionRejection(context)) {
      return (await this.finalizeProjectedReport(
        context, input.command.command_id, reportDigest
      )).snapshot;
    }
    if (
      this.isPreparedReportActive(context)
      && (input.observation === null && input.status === 'success')
    ) {
      if (
        context.execution_mode === 'media_completion_v3_3'
        && context.snapshot.state === 'preflight'
      ) {
        return this.finalizePreBindingAdoptionRejection(
          context,
          reportPath,
          input,
          reportDigest,
          new HarnessError(
            'ARTICLE_DRAFT_CONFLICT',
            'adopted Draft preflight success report has no browser observation'
          )
        );
      }
      const checkpoint = await this.materializationStore.readCheckpoint(context.snapshot.execution_id);
      context = await this.blockMaterialization(context, checkpoint, {
        kind: 'unverifiable', reasons: ['successful report has no browser observation']
      });
      return (await this.finalizeProjectedReport(
        context,
        input.command.command_id,
        reportDigest
      )).snapshot;
    }
    if (
      input.observation === null
      || (input.status !== 'success' && !reconcileUncertainMaterialization)
    ) {
      if (
        this.isPreparedMaterializationMode(context)
        && this.isMaterializationEffect(input.command)
      ) {
        context = { ...context, needs_editor_observation: true };
        await this.writeContext(context);
        return (await this.finalizeProjectedReport(context, input.command.command_id, reportDigest)).snapshot;
      }
      if (input.command.kind === 'create_article_draft' && input.status === 'uncertain') {
        context = await this.transition(context, 'draft_identity_unknown', 'article_draft_identity_unknown');
        return (await this.finalizeProjectedReport(context, input.command.command_id, reportDigest)).snapshot;
      }
      if (input.command.kind === 'publish_article_once') {
        context = await this.transition(context, 'outcome_resolving', 'article_publish_outcome_resolving');
        context = await this.transition(context, 'outcome_unknown', 'article_publish_outcome_unknown');
        return (await this.finalizeProjectedReport(context, input.command.command_id, reportDigest)).snapshot;
      }
      context = await this.transition(context, 'pre_publish_failed', 'article_browser_command_failed');
      return (await this.finalizeProjectedReport(context, input.command.command_id, reportDigest)).snapshot;
    }
    if (
      input.observation.execution_id !== input.command.execution_id ||
      input.observation.command_id !== input.command.command_id
    ) {
      if (
        context.execution_mode === 'media_completion_v3_3'
        && context.snapshot.state === 'preflight'
      ) {
        return this.finalizePreBindingAdoptionRejection(
          context,
          reportPath,
          input,
          reportDigest,
          new HarnessError('ARTICLE_DRAFT_CONFLICT', 'reported observation identity is foreign')
        );
      }
      if (this.isPreparedReportActive(context)) {
        const checkpoint = await this.materializationStore.readCheckpoint(context.snapshot.execution_id);
        context = await this.blockMaterialization(context, checkpoint, {
          kind: 'unverifiable', reasons: ['reported observation identity is foreign']
        });
        return (await this.finalizeProjectedReport(
          context,
          input.command.command_id,
          reportDigest
        )).snapshot;
      }
      throw new HarnessError('CONTRACT_INVALID', 'X Article observation does not belong to its command');
    }
    await this.ensureExactArtifact(
      `${this.prefix(input.command.execution_id)}/observations/${input.observation.observation_id}.json`,
      input.observation
    );
    context = {
      ...context,
      latest_observation: input.observation,
      editor_revision: input.observation.editor === null
        ? context.editor_revision
        : input.observation.page_revision,
      latest_editor_observation_id: input.observation.editor === null
        ? context.latest_editor_observation_id
        : input.observation.observation_id,
      latest_preview_observation_id: input.observation.preview === null
        ? context.latest_preview_observation_id
        : input.observation.observation_id,
      preview_revision: input.observation.preview === null
        ? context.preview_revision
        : input.observation.page_revision,
      needs_editor_observation: false,
      snapshot: {
        ...context.snapshot,
        latest_observation_id: input.observation.observation_id,
        updated_at: this.now().toISOString()
      }
    };
    await this.writeContext(context);
    if (
      this.isPreparedMaterializationMode(context)
      && input.observation.editor !== null
      && context.snapshot.draft_id !== null
      && context.snapshot.state === 'materialization_reconciling'
    ) {
      context = await this.reconcileReportedEditor(context, input.observation);
    }
    if (
      this.isPreparedMaterializationMode(context)
      && input.observation.preview !== null
      && context.snapshot.state === 'materialization_reconciling'
    ) {
      context = await this.reconcilePreparedPreview(context, input.observation);
    }
    return (await this.finalizeProjectedReport(
      context,
      input.command.command_id,
      reportDigest
    )).snapshot;
  }

  async status(executionId: string): Promise<XArticleBrowserStatusV1> {
    const context = await this.readContext(executionId);
    if (context.fast_path === null) return context.snapshot;
    const checkpointPath = `${this.prefix(executionId)}/materialization-checkpoint.json`;
    const checkpoint = await this.store.exists(checkpointPath)
      ? await this.materializationStore.readCheckpoint(executionId)
      : null;
    const expectedInline = checkpoint?.media.length
      ?? context.materialization_plan?.visual_anchors.length
      ?? context.plan.intent.visuals.filter((binding) => binding.placement.kind === 'block').length;
    const completedInline = checkpoint?.media.filter((entry) =>
      entry.status === 'completed'
      && entry.observed_media_ref !== null
      && entry.observed_context_digest !== null
    ).length ?? 0;
    const covers = context.latest_observation?.editor?.visuals.filter((visual) =>
      visual.kind === 'cover' && visual.status === 'uploaded'
    ) ?? [];
    const completedCover = covers.length === 1 ? 1 : 0;
    const resultPath = this.fastPathResultPath(executionId);
    const hasResult = await this.store.exists(resultPath);
    const timedOut = !hasResult && this.fastPathDeadline(context)?.exceeded === true;
    const stage: XArticleFastPathStatusProjectionV1['stage'] = timedOut
      ? 'Timed out'
      : hasResult
      ? 'Final check'
      : checkpoint?.draft_id == null
        ? 'Draft ready'
        : completedCover === 0
          ? 'Cover'
          : completedInline < expectedInline ? 'Inline images' : 'Final check';
    return {
      ...context.snapshot,
      fast_path_status: {
        stage,
        timed_out: timedOut,
        cover: `${completedCover}/1`,
        inline_images: `${completedInline}/${expectedInline}`,
        result_path: hasResult ? resultPath : null
      }
    };
  }

  async recoverFastPath(
    executionId: string
  ): Promise<{ readonly snapshot: XArticleExecutionSnapshotV1; readonly command: XArticleBrowserCommandV1 }> {
    return this.withExecutionLock(executionId, async () => {
      let context = await this.readContext(executionId);
      const fastPath = context.fast_path;
      if (fastPath === null) {
        throw new HarnessError(
          'ARTICLE_CHECKPOINT_CONFLICT',
          'X Article execution is not bound to Fast Path recovery'
        );
      }
      const recoveredAt = this.now().toISOString();
      if (this.fastPathDeadline(context, recoveredAt)?.exceeded === true) {
        throw new HarnessError(
          'ARTICLE_MATERIALIZATION_TIMEOUT',
          'X Article Fast Path recovery cannot start after the main deadline'
        );
      }
      const elapsed = computeXArticleElapsedSeconds(fastPath.started_at, recoveredAt);
      if (elapsed > fastPath.recovery_budget_seconds) {
        throw new HarnessError(
          'ARTICLE_MATERIALIZATION_TIMEOUT',
          'X Article Fast Path recovery exceeded its 120-second budget'
        );
      }
      if (fastPath.recovery_count >= 1) {
        throw new HarnessError(
          'ARTICLE_MATERIALIZATION_NO_PROGRESS',
          'X Article Fast Path permits only one read-only recovery'
        );
      }
      if (
        context.snapshot.state !== 'materialization_reconciling'
        || !context.needs_editor_observation
        || context.pending_command !== null
        || context.pending_issue !== null
      ) {
        throw new HarnessError(
          'ARTICLE_MATERIALIZATION_NO_PROGRESS',
          'X Article Fast Path has no uncertain media effect to recover'
        );
      }

      context = {
        ...context,
        fast_path: { ...fastPath, recovery_count: 1 }
      };
      await this.writeContext(context);
      await this.materializationStore.appendProgress(createXArticleStageProgress({
        execution_id: executionId,
        stage: 'fast_path_recovery#1',
        asset_id: null,
        elapsed_seconds: elapsed,
        waiting_for: 'browser_effect_reconciliation',
        retry_count: 0,
        observed_effect: 'unknown',
        recorded_at: recoveredAt
      }));
      return this.issueEditorObservation(context);
    });
  }

  async confirmPublish(
    executionId: string,
    confirmation: XArticlePublishConfirmationV1
  ): Promise<XArticleExecutionSnapshotV1> {
    const detachedConfirmation = structuredClone(confirmation);
    return this.withExecutionLock(executionId, () =>
      this.confirmPublishLocked(executionId, detachedConfirmation)
    );
  }

  private async confirmPublishLocked(
    executionId: string,
    confirmation: XArticlePublishConfirmationV1
  ): Promise<XArticleExecutionSnapshotV1> {
    let context = await this.readContext(executionId);
    if (
      context.execution_mode !== 'materialization_v3_2'
      || (context.snapshot.state !== 'confirmation_pending'
        && context.snapshot.state !== 'publish_armed')
      || context.snapshot.draft_id === null
      || context.snapshot.publish_command_count !== 0
      || context.submit_delivered
      || context.pending_command !== null
      || context.pending_issue !== null
    ) {
      throw new HarnessError(
        'STATE_TRANSITION_INVALID',
        `X Article Publish cannot be confirmed from ${context.snapshot.state}`
      );
    }
    const evidence = await this.assertPreparedConfirmationEvidence(
      context,
      context.snapshot.state === 'confirmation_pending'
        ? ['absent', 'armed']
        : ['armed']
    );
    if (
      context.snapshot.state === 'confirmation_pending'
      && (
        context.snapshot.latest_observation_id !== evidence.preview.observation_id
        || context.latest_observation === null
        || context.latest_observation.observation_id !== evidence.preview.observation_id
        || sha256(context.latest_observation) !== sha256(evidence.preview)
      )
    ) {
      throw new HarnessError(
        'PUBLISH_GATE_BLOCKED',
        'X Article confirmation must bind the latest durable verified Preview'
      );
    }
    if (
      context.snapshot.state === 'confirmation_pending'
      && !(
        (evidence.checkpoint.publish_confirmation === 'absent'
          && evidence.checkpoint.phase === 'preview_verified')
        || (evidence.checkpoint.publish_confirmation === 'armed'
          && evidence.checkpoint.phase === 'human_confirmed')
      )
    ) {
      throw new HarnessError(
        'PUBLISH_GATE_BLOCKED',
        'X Article confirmation checkpoint is not at the verified Preview boundary'
      );
    }
    verifyXArticlePublishConfirmation(confirmation, {
      execution_id: executionId,
      draft_id: context.snapshot.draft_id,
      target_account: context.plan.intent.target_account,
      audience: 'everyone',
      plan_digest: context.plan.plan_digest as `sha256:${string}`,
      document_digest: evidence.materializationPlan.document_digest,
      preview_revision: evidence.preview.page_revision,
      asset_digests: context.plan.intent.visuals.map((item) => item.asset.digest),
      confirmed_at_not_before: evidence.preview.observed_at,
      confirmed_at_not_after: this.now().toISOString()
    });
    const confirmationPath = this.publishConfirmationPath(executionId);
    if (evidence.checkpoint.publish_confirmation === 'absent') {
      await this.ensureExactArtifact(confirmationPath, confirmation);
    } else {
      let existing: XArticlePublishConfirmationV1;
      try {
        existing = await this.store.readJson<XArticlePublishConfirmationV1>(confirmationPath);
      } catch (error) {
        throw new HarnessError(
          'PUBLISH_GATE_BLOCKED',
          'armed X Article Publish confirmation artifact is missing or unreadable',
          error
        );
      }
      if (!isDeepStrictEqual(existing, confirmation)) {
        throw new HarnessError(
          'ARTICLE_CHECKPOINT_CONFLICT',
          'armed X Article Publish confirmation differs on retry'
        );
      }
    }

    if (evidence.checkpoint.publish_confirmation === 'absent') {
      await this.materializationStore.updateCheckpoint(
        executionId,
        evidence.checkpoint.revision,
        (current) => {
          if (current.phase !== 'preview_verified' || current.publish_confirmation !== 'absent') {
            throw new HarnessError(
              'ARTICLE_CHECKPOINT_CONFLICT',
              'X Article confirmation checkpoint changed before arming'
            );
          }
          return {
            ...current,
            phase: 'human_confirmed',
            publish_confirmation: 'armed',
            updated_at: confirmation.confirmed_at
          };
        }
      );
    }
    if (context.snapshot.state === 'publish_armed') return context.snapshot;
    context = await this.transition(context, 'publish_armed', 'article_publish_confirmed', {
      attempt_id: this.attemptId()
    });
    return context.snapshot;
  }

  async resumeVerification(executionId: string): Promise<XArticleExecutionSnapshotV1> {
    let context = await this.readContext(executionId);
    if (context.snapshot.state !== 'outcome_unknown' && context.snapshot.state !== 'published_unverified') {
      throw new HarnessError(
        'STATE_TRANSITION_INVALID',
        `X Article verification cannot resume from ${context.snapshot.state}`
      );
    }
    context = await this.transition(context, 'public_verifying', 'article_public_verification_resumed');
    return context.snapshot;
  }

  async resumeEditor(executionId: string): Promise<XArticleExecutionSnapshotV1> {
    return this.withExecutionLock(executionId, () => this.resumeEditorLocked(executionId));
  }

  private async resumeEditorLocked(executionId: string): Promise<XArticleExecutionSnapshotV1> {
    let context = await this.readContext(executionId);
    if (this.isPreparedMaterializationMode(context)) {
      const materializationPlan = await this.readBoundMaterializationPlan(context);
      const checkpoint = await this.materializationStore.readCheckpoint(executionId);
      if (
        checkpoint.execution_id !== executionId
        || checkpoint.materialization_digest !== materializationPlan.materialization_digest
        || checkpoint.draft_id !== context.snapshot.draft_id
        || checkpoint.publish_confirmation !== 'absent'
        || (context.pending_command !== null && context.pending_issue === null)
        || (context.pending_issue !== null && (
          context.pending_issue.input.execution_id !== executionId
          || context.pending_issue.input_digest !== sha256(context.pending_issue.input)
          || (context.pending_command !== null
            && context.pending_command.command_id !== context.pending_issue.command_id)
        ))
      ) {
        throw new HarnessError(
          'ARTICLE_CHECKPOINT_CONFLICT',
          'saved X Article editor lifecycle is not bound to durable materialization state'
        );
      }
      if (
        context.snapshot.state === 'materialization_blocked'
        || context.snapshot.publish_command_count !== 0
        || context.submit_delivered
        || context.snapshot.draft_id === null
      ) {
        throw new HarnessError(
          context.snapshot.state === 'materialization_blocked'
            ? 'ARTICLE_MATERIALIZATION_DRIFT'
            : 'STATE_TRANSITION_INVALID',
          `X Article editor cannot resume from ${context.snapshot.state}`
        );
      }
      let durableEditor: XArticleBrowserObservation | null = null;
      if (context.latest_editor_observation_id !== null) {
        durableEditor = await this.store.readJson<XArticleBrowserObservation>(
          `${this.prefix(executionId)}/observations/${context.latest_editor_observation_id}.json`
        );
        const revisionBody = Object.fromEntries(
          Object.entries(durableEditor).filter(([key]) => key !== 'page_revision')
        );
        if (
          durableEditor.page_revision !== computeXArticlePageRevision(revisionBody)
          || durableEditor.execution_id !== executionId
          || durableEditor.account_handle !== materializationPlan.target_account
          || durableEditor.page_kind !== 'article_editor'
          || durableEditor.editor?.draft_id !== checkpoint.draft_id
          || (context.latest_observation?.editor !== null
            && context.latest_observation !== null
            && sha256(context.latest_observation) !== sha256(durableEditor))
          || (checkpoint.last_editor_revision !== null
            && durableEditor.page_revision !== checkpoint.last_editor_revision)
        ) {
          context = await this.blockMaterialization(context, checkpoint, {
            kind: 'unverifiable', reasons: ['saved editor observation is foreign or stale']
          });
          throw new HarnessError(
            'ARTICLE_MATERIALIZATION_DRIFT',
            'saved X Article editor observation is foreign or stale'
          );
        }
      }
      const mustObserve = context.pending_issue !== null || context.needs_editor_observation;
      if (!mustObserve) {
        if (durableEditor === null) {
          throw new HarnessError(
            'STATE_TRANSITION_INVALID',
            'X Article editor resume has no durable reconciliation observation'
          );
        }
        const reconciliation = this.reconcileMaterializationDraft(
          materializationPlan, checkpoint, context.plan.intent.document, durableEditor
        );
        if (
          (reconciliation.kind === 'content_drift' || reconciliation.kind === 'unverifiable')
          && !this.isOnlyMissingCover(reconciliation)
        ) {
          context = await this.blockMaterialization(context, checkpoint, reconciliation);
          throw new HarnessError(
            'ARTICLE_MATERIALIZATION_DRIFT',
            'saved X Article Draft cannot resume safely',
            reconciliation
          );
        }
      }
      if (
        context.pending_command !== null
        && context.pending_command.kind !== 'observe_article_page'
      ) context = await this.clearPending(context);
      context = { ...context, needs_editor_observation: mustObserve };
      if (context.snapshot.state === 'pre_publish_failed') {
        context = await this.transition(
          context,
          'materialization_reconciling',
          'article_materialization_resumed'
        );
      } else if (context.snapshot.state !== 'materialization_reconciling') {
        throw new HarnessError(
          'STATE_TRANSITION_INVALID',
          `X Article editor cannot resume from ${context.snapshot.state}`
        );
      }
      await this.writeContext(context);
      return context.snapshot;
    }
    if (
      context.snapshot.state !== 'pre_publish_failed' ||
      context.snapshot.publish_command_count !== 0 ||
      context.submit_delivered ||
      context.pending_command !== null ||
      context.snapshot.draft_id === null ||
      context.latest_observation === null
    ) {
      throw new HarnessError(
        'STATE_TRANSITION_INVALID',
        `X Article editor cannot resume from ${context.snapshot.state}`
      );
    }
    const account = this.contract.detectAccount(context.latest_observation);
    const page = this.contract.detectPage(context.latest_observation);
    if (
      account.handle !== context.plan.intent.target_account ||
      page.kind !== 'article_editor' ||
      page.draft_id !== context.snapshot.draft_id
    ) {
      throw new HarnessError('ARTICLE_DRAFT_CONFLICT', 'saved X Article editor does not match the execution');
    }
    const decision = nextArticleEditorDecision(
      {
        plan: context.plan,
        draft_id: context.snapshot.draft_id,
        import_strategy: context.import_strategy,
        bulk_import_issued: context.bulk_import_issued
      },
      context.latest_observation,
      this.contract
    );
    if (decision.kind === 'blocked') throw new HarnessError(decision.code, decision.message);
    context = await this.transition(context, 'content_filling', 'article_editor_failure_resumed');
    return context.snapshot;
  }

  async refreshApproval(
    executionId: string,
    approval: XArticleApprovalV1
  ): Promise<XArticleExecutionSnapshotV1> {
    let context = await this.readContext(executionId);
    if (this.isPreparedMaterializationMode(context)) {
      throw new HarnessError(
        'STATE_TRANSITION_INVALID',
        'prepared X Article materialization cannot reuse legacy Approval refresh'
      );
    }
    if (
      context.snapshot.publish_command_count !== 0 ||
      context.submit_delivered ||
      ['publish_attempted', 'outcome_resolving', 'public_verifying', 'finalized',
        'published_unverified', 'outcome_unknown', 'verification_conflict',
        'failed_after_publish', 'cancelled_before_publish'].includes(context.snapshot.state)
    ) {
      throw new HarnessError('STATE_TRANSITION_INVALID', 'X Article Approval cannot refresh after Publish');
    }
    verifyXArticleApproval(context.plan, approval, this.now());
    this.assertId(approval.approval_id);
    const approvalPath = `${this.prefix(executionId)}/approval-refreshes/${approval.approval_id}.json`;
    if (await this.store.exists(approvalPath)) {
      const existing = await this.store.readJson<XArticleApprovalV1>(approvalPath);
      if (sha256(existing) !== sha256(approval)) {
        throw new HarnessError('ARTIFACT_EXISTS', 'X Article Approval refresh identity is already used');
      }
    } else {
      await this.store.writeNew(approvalPath, approval);
    }
    context = {
      ...context,
      approval,
      snapshot: { ...context.snapshot, updated_at: this.now().toISOString() }
    };
    await this.writeContext(context);
    return context.snapshot;
  }

  async cancelBeforePublish(executionId: string): Promise<XArticleExecutionSnapshotV1> {
    return this.withExecutionLock(executionId, () => this.cancelBeforePublishLocked(executionId));
  }

  private async cancelBeforePublishLocked(executionId: string): Promise<XArticleExecutionSnapshotV1> {
    let context = await this.readContext(executionId);
    const checkpoint = await this.readCancellationCheckpoint(context);
    const confirmationConsumed = this.isPreparedMaterializationMode(context)
      && (
        await this.store.exists(this.publishConfirmationConsumptionPath(executionId))
        || checkpoint?.publish_confirmation === 'consumed'
      );
    if (
      context.snapshot.publish_command_count > 0
      || context.snapshot.state === 'publish_attempted'
      || confirmationConsumed
    ) {
      throw new HarnessError('STATE_TRANSITION_INVALID', 'X Article execution cannot be cancelled after Publish');
    }
    if (context.pending_command !== null || context.pending_issue !== null) {
      context = await this.clearPending(context);
    }
    context = await this.transition(context, 'cancelled_before_publish', 'article_cancelled_before_publish');
    return context.snapshot;
  }

  private async readCancellationCheckpoint(
    context: AdapterContext
  ): Promise<XArticleMaterializationCheckpointV1 | null> {
    if (!this.isPreparedMaterializationMode(context)) return null;
    const checkpointPath = `${this.prefix(context.snapshot.execution_id)}/materialization-checkpoint.json`;
    if (await this.store.exists(checkpointPath)) {
      return this.materializationStore.readCheckpoint(context.snapshot.execution_id);
    }
    const planPath = `${this.prefix(context.snapshot.execution_id)}/materialization-plan.json`;
    if (await this.store.exists(planPath)) {
      throw new HarnessError(
        'ARTICLE_CHECKPOINT_CONFLICT',
        'prepared X Article materialization plan is missing its checkpoint'
      );
    }
    if (
      context.execution_mode === 'media_completion_v3_3'
      && ['created', 'preflight', 'materialization_blocked'].includes(context.snapshot.state)
    ) return null;
    throw new HarnessError(
      'ARTICLE_CHECKPOINT_CONFLICT',
      'prepared X Article materialization persistence is missing'
    );
  }

  private async advanceAdoptedDraftBinding(
    context: AdapterContext
  ): Promise<{ readonly snapshot: XArticleExecutionSnapshotV1; readonly command: XArticleBrowserCommandV1 | null }> {
    const observation = this.requireObservation(context);
    const materializationPlan = context.materialization_plan;
    if (materializationPlan === null || materializationPlan.draft_binding === null) {
      throw new HarnessError('ARTICLE_DRAFT_CONFLICT', 'existing Draft binding is absent');
    }
    if (context.snapshot.state === 'preflight') {
      try {
        const account = this.contract.detectAccount(observation);
        if (account.handle !== context.plan.intent.target_account) {
          throw new HarnessError('X_ACCOUNT_MISMATCH', 'X Article account differs from the Plan target');
        }
        verifyXArticleExistingDraftBinding(materializationPlan.draft_binding, context.plan, observation);
        await this.ensureAdoptedDraftBoundCheckpoint(context, materializationPlan, observation);
      } catch (error) {
        if (error instanceof HarnessError) {
          context = await this.rejectAdoption(context, error);
          return { snapshot: context.snapshot, command: null };
        }
        throw error;
      }
      context = await this.transition(context, 'account_verified', 'article_adoption_verified');
    }
    if (context.snapshot.state === 'account_verified') {
      context = await this.transition(context, 'draft_created', 'article_draft_bound', {
        draft_id: materializationPlan.draft_binding.draft_id
      });
    }
    if (context.snapshot.state === 'draft_created') {
      const checkpoint = await this.materializationStore.readCheckpoint(context.snapshot.execution_id);
      if (checkpoint.phase === 'draft_bound') {
        await this.materializationStore.updateCheckpoint(
          context.snapshot.execution_id,
          checkpoint.revision,
          (current) => {
            if (
              current.phase !== 'draft_bound'
              || current.body.status !== 'adopted_verified'
              || current.body.observed_digest !== materializationPlan.import_template_digest
            ) {
              throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'adopted Draft checkpoint changed before body promotion');
            }
            return { ...current, phase: 'body_verified', updated_at: this.now().toISOString() };
          }
        );
      } else if (
        checkpoint.phase !== 'body_verified'
        || checkpoint.body.status !== 'adopted_verified'
        || checkpoint.body.observed_digest !== materializationPlan.import_template_digest
      ) {
        throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'adopted Draft checkpoint cannot resume body promotion');
      }
      context = await this.transition(context, 'materialization_reconciling', 'article_materialization_reconciling');
    }
    return this.nextMaterializationCommand(context, observation);
  }

  private async ensureAdoptedDraftBoundCheckpoint(
    context: AdapterContext,
    materializationPlan: XArticleMaterializationPlanV1,
    observation: XArticleBrowserObservation
  ): Promise<XArticleMaterializationCheckpointV1> {
    const checkpointPath = `${this.prefix(context.snapshot.execution_id)}/materialization-checkpoint.json`;
    const planPath = `${this.prefix(context.snapshot.execution_id)}/materialization-plan.json`;
    const [checkpointExists, planExists] = await Promise.all([
      this.store.exists(checkpointPath), this.store.exists(planPath)
    ]);
    const expected = createAdoptedXArticleMaterializationCheckpoint({
      plan: materializationPlan, publication_plan: context.plan, observation, updated_at: this.now().toISOString()
    });
    if (!checkpointExists && !planExists) return this.materializationStore.create(materializationPlan, expected);
    if (!checkpointExists || !planExists) {
      throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'adopted Draft binding has partial materialization persistence');
    }
    const persistedPlan = await this.materializationStore.readPlan(context.snapshot.execution_id);
    const checkpoint = await this.materializationStore.readCheckpoint(context.snapshot.execution_id);
    if (
      !isDeepStrictEqual(persistedPlan, materializationPlan)
      || checkpoint.materialization_digest !== materializationPlan.materialization_digest
      || checkpoint.draft_id !== materializationPlan.draft_binding!.draft_id
      || checkpoint.draft_origin !== 'adopted_existing'
      || checkpoint.body.status !== 'adopted_verified'
      || checkpoint.body.observed_digest !== materializationPlan.import_template_digest
      || (checkpoint.phase !== 'draft_bound' && checkpoint.phase !== 'body_verified')
    ) {
      throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'adopted Draft binding checkpoint differs on retry');
    }
    return checkpoint;
  }

  private async nextPublicVerification(
    context: AdapterContext
  ): Promise<{ readonly snapshot: XArticleExecutionSnapshotV1; readonly command: XArticleBrowserCommandV1 | null }> {
    const article = context.latest_observation?.public_article ?? null;
    if (article === null) {
      return this.issue(context, {
        execution_id: context.snapshot.execution_id,
        run_id: context.plan.run_id,
        draft_id: context.snapshot.draft_id,
        kind: 'observe_article_page',
        purpose: 'observe_public_article',
        expected_page_revision: context.latest_observation?.page_revision ?? null,
        allowed_origin: 'https://x.com',
        side_effect: 'read',
        payload: { kind: 'observe_article_page', scope: 'public_article' }
      });
    }
    if (
      context.snapshot.draft_id === null ||
      context.editor_revision === null ||
      context.preview_revision === null
    ) {
      throw new HarnessError('ARTICLE_OUTCOME_UNKNOWN', 'X Article verification lacks editor or Preview evidence');
    }
    const verification = verifyPublicXArticle(context.plan, article, this.now());
    if (this.isPreparedMaterializationMode(context)) {
      await this.persistPublicMaterializationReceipt(context);
    }
    const status = verification.kind === 'full_match'
      ? 'published'
      : verification.kind === 'media_unverified'
        ? 'published_media_unverified'
        : 'verification_conflict';
    const receipt = createXArticleReceipt({
      receiptId: this.receiptId(),
      executionId: context.snapshot.execution_id,
      plan: context.plan,
      status,
      draftId: context.snapshot.draft_id,
      editorRevision: context.editor_revision,
      previewRevision: context.preview_revision,
      publicVerification: verification,
      issuedAt: this.now().toISOString(),
      supersedesReceiptId: null
    });
    const receiptPath = `receipts/${receipt.receipt_id}.json`;
    await this.store.writeNew(receiptPath, receipt);
    await notifyTerminalSafely(this.store, this.terminalNotifier, {
      notification_id: `publication_receipt_${receipt.receipt_id}`,
      kind: 'publication_receipt_terminal', publication_kind: 'x_article',
      workspace_relative_path: receiptPath, role: 'publication_receipt', media_type: 'application/json',
      canonical: true, privacy_classification: 'internal', occurred_at: receipt.issued_at
    });
    const finalState = verification.kind === 'full_match'
      ? 'finalized'
      : verification.kind === 'media_unverified'
        ? 'published_unverified'
        : 'verification_conflict';
    context = await this.transition(context, finalState, 'article_public_verification_completed', {
      latest_receipt_path: receiptPath
    });
    return { snapshot: context.snapshot, command: null };
  }

  private async nextEditorCommand(
    context: AdapterContext,
    observation: XArticleBrowserObservation
  ): Promise<{ readonly snapshot: XArticleExecutionSnapshotV1; readonly command: XArticleBrowserCommandV1 | null }> {
    if (context.snapshot.draft_id === null) {
      throw new HarnessError('ARTICLE_DRAFT_IDENTITY_UNKNOWN', 'X Article execution has no draft identity');
    }
    const decision = nextArticleEditorDecision(
      {
        plan: context.plan,
        draft_id: context.snapshot.draft_id,
        import_strategy: context.import_strategy,
        bulk_import_issued: context.bulk_import_issued
      },
      observation,
      this.contract
    );
    if (decision.kind === 'blocked') throw new HarnessError(decision.code, decision.message);
    if (decision.kind === 'complete') return { snapshot: context.snapshot, command: null };
    if (decision.input.kind === 'open_article_preview') {
      context = await this.transition(context, 'content_verified', 'article_editor_document_verified');
    } else if (context.snapshot.state === 'content_filling') {
      context = await this.transition(context, 'content_partially_verified', 'article_editor_prefix_verified');
    } else {
      context = await this.transition(context, 'content_filling', 'article_content_filling_resumed');
    }
    if (decision.input.kind === 'import_article_document') {
      context = { ...context, bulk_import_issued: true };
    }
    return this.issue(context, decision.input);
  }

  private async nextMaterializationCommand(
    context: AdapterContext,
    observation: XArticleBrowserObservation
  ): Promise<{ readonly snapshot: XArticleExecutionSnapshotV1; readonly command: XArticleBrowserCommandV1 | null }> {
    if (context.snapshot.draft_id === null) {
      throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'prepared materialization context is incomplete');
    }
    const persistedPlan = await this.readBoundMaterializationPlan(context);
    const checkpoint = await this.materializationStore.readCheckpoint(context.snapshot.execution_id);
    const reconciliation = this.reconcileMaterializationDraft(
      persistedPlan, checkpoint, context.plan.intent.document, observation
    );
    if (this.isOnlyMissingCover(reconciliation)) {
      const binding = context.plan.intent.visuals.find((candidate) => candidate.placement.kind === 'cover');
      if (binding === undefined || binding.asset.asset_id !== context.plan.intent.document.cover_asset_id) {
        context = await this.blockMaterialization(context, checkpoint, reconciliation);
        return { snapshot: context.snapshot, command: null };
      }
      const attempt = decideXArticleMediaAttempt({
        progress: await this.materializationStore.readProgress(context.snapshot.execution_id),
        asset_id: binding.asset.asset_id,
        purpose: 'upload_article_cover'
      });
      if (attempt.kind === 'block') {
        context = await this.blockMaterialization(context, checkpoint, {
          kind: 'unverifiable',
          reasons: [`cover media write blocked: ${attempt.reason}`]
        });
        return { snapshot: context.snapshot, command: null };
      }
      return this.issue(context, {
        execution_id: context.snapshot.execution_id,
        run_id: context.plan.run_id,
        draft_id: context.snapshot.draft_id,
        kind: 'upload_article_cover',
        purpose: 'upload_article_cover',
        expected_page_revision: observation.page_revision,
        allowed_origin: 'https://x.com',
        side_effect: 'write',
        payload: {
          kind: 'upload_article_cover',
          package_root: context.plan.intent.article_package.root,
          package_digest: context.plan.intent.article_package.digest,
          asset: binding.asset
        }
      });
    }
    if (reconciliation.kind === 'content_drift' || reconciliation.kind === 'unverifiable') {
      context = await this.blockMaterialization(context, checkpoint, reconciliation);
      return { snapshot: context.snapshot, command: null };
    }
    const decision = nextMaterializationEditorDecision({
      plan: context.plan,
      materialization_plan: persistedPlan,
      draft_id: context.snapshot.draft_id,
      completion_target: context.execution_mode === 'media_completion_v3_3' || context.fast_path !== null
        ? 'draft_reconciled'
        : 'preview'
    }, observation, reconciliation, this.contract);
    if (decision.kind === 'blocked') {
      context = await this.blockMaterialization(context, checkpoint, decision);
      return { snapshot: context.snapshot, command: null };
    }
    if (decision.kind === 'complete') {
      if (
        (context.execution_mode !== 'media_completion_v3_3' && context.fast_path === null)
        || checkpoint.phase !== 'draft_reconciled'
        || checkpoint.publish_confirmation !== 'absent'
        || context.snapshot.publish_command_count !== 0
      ) {
        throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'Draft-only completion lacks reconciled media evidence');
      }
      const resultPath = context.fast_path === null
        ? undefined
        : this.fastPathResultPath(context.snapshot.execution_id);
      context = await this.transition(
        context,
        'draft_reconciled',
        'article_draft_reconciled',
        resultPath === undefined ? {} : { latest_receipt_path: resultPath }
      );
      await this.ensureFastPathResult(context, checkpoint, observation);
      return { snapshot: context.snapshot, command: null };
    }
    await this.assertPreparedCommandBinding(context, persistedPlan, decision.input);
    return this.issue(context, decision.input);
  }

  private async reconcileReportedEditor(
    context: AdapterContext,
    observation: XArticleBrowserObservation
  ): Promise<AdapterContext> {
    if (observation.editor === null) return context;
    const plan = await this.readBoundMaterializationPlan(context);
    const revisionInput = Object.fromEntries(
      Object.entries(observation).filter(([key]) => key !== 'page_revision')
    );
    const identityInvalid = observation.page_revision !== computeXArticlePageRevision(revisionInput)
      || observation.execution_id !== context.snapshot.execution_id
      || observation.account_handle !== plan.target_account
      || observation.page_kind !== 'article_editor'
      || observation.editor.draft_id !== context.snapshot.draft_id;
    if (identityInvalid) {
      const trusted = await this.materializationStore.readCheckpoint(context.snapshot.execution_id);
      return this.blockMaterialization(context, trusted, { kind: 'unverifiable', reasons: ['editor observation identity is invalid'] });
    }
    const checkpoint = await this.materializationStore.readCheckpoint(context.snapshot.execution_id);
    if (context.execution_mode === 'media_completion_v3_3') {
      return this.reconcileReportedV3_3Editor(context, plan, checkpoint, observation);
    }
    const template = createXArticleImportTemplate(context.plan.intent.document);
    const importState = observation.editor.import_state;
    const bodyObserved = observation.editor.blocks.length > 0
      || importState !== null
      || (
        context.pending_command?.kind === 'import_article_document'
        && context.plan.intent.document.blocks.length === 0
      );
    const completedCount = importState === null
      ? plan.visual_anchors.length
      : sha256(importState.unresolved_anchors) === sha256(
          template.anchors.slice(template.anchors.length - importState.unresolved_anchors.length)
        )
        ? template.anchors.length - importState.unresolved_anchors.length
        : checkpoint.media.filter((media) => media.status === 'completed').length;
    const inlineVisuals = observation.editor.visuals.filter((visual) => visual.kind === 'inline');
    const media = checkpoint.media.map((entry, index) => {
      if (index >= completedCount) {
        return entry.status === 'upload_started'
          ? { ...entry, status: 'pending' as const, observed_media_ref: null, observed_context_digest: null }
          : entry;
      }
      const anchor = plan.visual_anchors[index]!;
      const visual = inlineVisuals.find((candidate) =>
        candidate.asset_id === anchor.asset_id
        && candidate.block_ordinal === anchor.block_ordinal
      );
      if (
        visual === undefined
        || visual.ref.length === 0
        || visual.status !== 'uploaded'
        || !visual.owned_by_execution
        || visual.alt_text !== anchor.alt_text
      ) return entry;
      return {
        ...entry,
        status: 'completed' as const,
        observed_media_ref: visual.ref,
        observed_context_digest: anchor.context_digest
      };
    });
    const body = checkpoint.body.status === 'adopted_verified'
      ? checkpoint.body
      : bodyObserved
        ? { status: 'verified' as const, observed_digest: plan.import_template_digest }
        : checkpoint.body;
    const finalEditor = importState === null
      && this.hasVerifiedMaterializationBody({ ...checkpoint, body })
      && media.every((entry) => entry.status === 'completed');
    const phase = finalEditor
      ? 'draft_reconciled'
      : media.some((entry) => entry.status === 'completed')
        ? 'media_materializing'
        : body.status === 'adopted_verified'
          ? 'body_verified'
          : bodyObserved ? 'body_imported' : checkpoint.phase;
    const candidate: XArticleMaterializationCheckpointV1 = {
      ...checkpoint,
      phase,
      body,
      media,
      last_editor_revision: observation.page_revision,
      updated_at: observation.observed_at
    };
    const reconciliation = this.reconcileMaterializationDraft(
      plan, candidate, context.plan.intent.document, observation
    );
    if (
      (reconciliation.kind === 'content_drift' || reconciliation.kind === 'unverifiable')
      && !this.isOnlyMissingCover(reconciliation)
    ) {
      return this.blockMaterialization(context, checkpoint, reconciliation);
    }
    const stableCurrent = { ...checkpoint, revision: 0, updated_at: '' };
    const stableCandidate = { ...candidate, revision: 0, updated_at: '' };
    if (!isDeepStrictEqual(stableCurrent, stableCandidate)) {
      await this.materializationStore.updateCheckpoint(
        context.snapshot.execution_id,
        checkpoint.revision,
        () => candidate
      );
    }
    return context;
  }

  private async reconcileReportedV3_3Editor(
    context: AdapterContext,
    plan: XArticleMaterializationPlanV1,
    checkpoint: XArticleMaterializationCheckpointV1,
    observation: XArticleBrowserObservation
  ): Promise<AdapterContext> {
    const editor = observation.editor!;
    const template = createXArticleImportTemplate(context.plan.intent.document);
    const coverBinding = context.plan.intent.visuals.find((binding) => binding.placement.kind === 'cover');
    const covers = editor.visuals.filter((visual) => visual.kind === 'cover');
    const coverPresence = coverBinding === undefined
      ? covers.length === 0 ? 'absent' as const : 'ambiguous' as const
      : covers.length === 0
        ? 'absent' as const
        : covers.length === 1
          && covers[0]!.asset_id === coverBinding.asset.asset_id
          && covers[0]!.block_ordinal === null
          && covers[0]!.ref.length > 0
          && covers[0]!.status === 'uploaded'
          && covers[0]!.owned_by_execution
          && (this.contract.media_alt_capabilities.cover === 'unobservable'
            ? covers[0]!.alt_text === null
            : covers[0]!.alt_text === coverBinding.asset.alt_text)
          ? 'present' as const
          : 'ambiguous' as const;

    const importState = editor.import_state;
    const resolvedCount = importState === null
      ? template.anchors.length
      : importState.template_digest === template.template_digest
        && importState.source_document_digest === template.source_document_digest
        && sha256(importState.unresolved_anchors) === sha256(
          template.anchors.slice(template.anchors.length - importState.unresolved_anchors.length)
        )
        ? template.anchors.length - importState.unresolved_anchors.length
        : null;
    const inlineVisuals = editor.visuals.filter((visual) => visual.kind === 'inline');
    const matchedVisualRefs = new Set<string>();
    let waitForObservation = false;
    let inlineAmbiguous = editor.has_unknown_content;
    const media = checkpoint.media.map((entry, index) => {
      const anchor = plan.visual_anchors[index]!;
      const anchorPresence = resolvedCount === null
        ? 'ambiguous' as const
        : index < resolvedCount ? 'absent' as const : 'present' as const;
      const candidates = inlineVisuals.filter((visual) =>
        visual.block_ordinal === anchor.block_ordinal || visual.asset_id === anchor.asset_id
      );
      const exact = candidates.length === 1
        && candidates[0]!.asset_id === anchor.asset_id
        && candidates[0]!.block_ordinal === anchor.block_ordinal
        && candidates[0]!.ref.length > 0
        && candidates[0]!.status === 'uploaded'
        && candidates[0]!.owned_by_execution
        && candidates[0]!.alt_text?.normalize('NFC') === anchor.alt_text.normalize('NFC');
      const imagePresence = candidates.length === 0
        ? 'absent' as const
        : exact ? 'present' as const : 'ambiguous' as const;
      if (exact) matchedVisualRefs.add(candidates[0]!.ref);

      if (anchorPresence === 'present' && imagePresence === 'absent') {
        if (entry.status === 'completed' || editor.has_unknown_content) {
          inlineAmbiguous = true;
          return { ...entry, status: 'ambiguous' as const };
        }
        return {
          ...entry,
          status: 'pending' as const,
          observed_media_ref: null,
          observed_context_digest: null
        };
      }
      if (anchorPresence === 'present' && imagePresence === 'present') {
        if (entry.status === 'upload_started') {
          waitForObservation = true;
          return entry;
        }
        inlineAmbiguous = true;
        return { ...entry, status: 'ambiguous' as const };
      }
      if (anchorPresence === 'absent' && imagePresence === 'present') {
        return {
          ...entry,
          status: 'completed' as const,
          observed_media_ref: candidates[0]!.ref,
          observed_context_digest: anchor.context_digest
        };
      }
      inlineAmbiguous = true;
      return { ...entry, status: 'ambiguous' as const };
    });
    if (
      inlineVisuals.some((visual) => !matchedVisualRefs.has(visual.ref))
      || new Set(inlineVisuals.map((visual) => visual.ref)).size !== inlineVisuals.length
    ) inlineAmbiguous = true;
    const reconciledMedia = inlineAmbiguous
      ? media.map((entry) => ({ ...entry, status: 'ambiguous' as const }))
      : media;
    const ambiguous = inlineAmbiguous || coverPresence === 'ambiguous';

    const finalEditor = importState === null
      && this.hasVerifiedMaterializationBody(checkpoint)
      && reconciledMedia.every((entry) => entry.status === 'completed');
    const phase = finalEditor
      ? 'draft_reconciled' as const
      : reconciledMedia.some((entry) => entry.status === 'completed' || entry.status === 'upload_started')
        ? 'media_materializing' as const
        : 'body_verified' as const;
    const candidate: XArticleMaterializationCheckpointV1 = {
      ...checkpoint,
      phase,
      body: checkpoint.body,
      media: reconciledMedia,
      last_editor_revision: observation.page_revision,
      updated_at: observation.observed_at
    };
    const stableCurrent = { ...checkpoint, revision: 0, updated_at: '' };
    const stableCandidate = { ...candidate, revision: 0, updated_at: '' };
    const updated = isDeepStrictEqual(stableCurrent, stableCandidate)
      ? checkpoint
      : await this.materializationStore.updateCheckpoint(
        context.snapshot.execution_id,
        checkpoint.revision,
        () => candidate
      );

    if (ambiguous) {
      return this.blockMaterialization(context, updated, {
        kind: 'unverifiable',
        reasons: ['existing Draft media effect is ambiguous or contradictory']
      });
    }
    if (waitForObservation) {
      return { ...context, needs_editor_observation: true };
    }
    const reconciliation = this.reconcileMaterializationDraft(
      plan, updated, context.plan.intent.document, observation
    );
    if (
      (reconciliation.kind === 'content_drift' || reconciliation.kind === 'unverifiable')
      && !this.isOnlyMissingCover(reconciliation)
    ) {
      return this.blockMaterialization(context, updated, reconciliation);
    }
    return context;
  }

  private reconcileMaterializationDraft(
    plan: XArticleMaterializationPlanV1,
    checkpoint: XArticleMaterializationCheckpointV1,
    document: XArticlePublicationPlanV1['intent']['document'],
    observation: XArticleBrowserObservation
  ) {
    const reconciliationCheckpoint = checkpoint.body.status === 'adopted_verified'
      ? { ...checkpoint, body: { status: 'verified' as const, observed_digest: checkpoint.body.observed_digest } }
      : checkpoint;
    return reconcileXArticleDraft({ plan, checkpoint: reconciliationCheckpoint, document, observation });
  }

  private hasVerifiedMaterializationBody(checkpoint: XArticleMaterializationCheckpointV1): boolean {
    return (checkpoint.body.status === 'verified' || checkpoint.body.status === 'adopted_verified')
      && checkpoint.body.observed_digest !== null;
  }

  private async rejectAdoption(
    context: AdapterContext,
    error: HarnessError
  ): Promise<AdapterContext> {
    const evidence = { code: error.code, message: error.message };
    const evidenceDigest = sha256(evidence);
    await this.ensureExactArtifact(
      `${this.prefix(context.snapshot.execution_id)}/reconciliation-evidence/${evidenceDigest.slice(7)}.json`,
      { evidence_digest: evidenceDigest, evidence }
    );
    return this.transition(context, 'materialization_blocked', 'article_adoption_rejected');
  }

  private async finalizePreBindingAdoptionRejection(
    context: AdapterContext,
    reportPath: string,
    input: XArticleBrowserReportInput,
    reportDigest: string,
    error: HarnessError
  ): Promise<XArticleExecutionSnapshotV1> {
    await this.persistMaterializationReportEvidence(reportPath, input);
    context = await this.rejectAdoption(context, error);
    return (await this.finalizeProjectedReport(
      context, input.command.command_id, reportDigest
    )).snapshot;
  }

  private async reconcilePreparedPreview(
    context: AdapterContext,
    observation: XArticleBrowserObservation
  ): Promise<AdapterContext> {
    let checkpoint: XArticleMaterializationCheckpointV1;
    try {
      checkpoint = (await this.assertPreparedConfirmationEvidence(context, ['absent']))
        .checkpoint;
    } catch {
      checkpoint = await this.materializationStore.readCheckpoint(context.snapshot.execution_id);
      return this.blockMaterialization(context, checkpoint, {
        kind: 'unverifiable',
        reasons: ['prepared Preview gate lacks coherent durable reconciliation evidence']
      });
    }
    if (checkpoint.phase !== 'preview_verified') {
      const previewVerifiedAt = this.now().toISOString();
      checkpoint = await this.materializationStore.updateCheckpoint(
        context.snapshot.execution_id,
        checkpoint.revision,
        (current) => ({
          ...current,
          phase: 'preview_verified',
          updated_at: previewVerifiedAt
        })
      );
    }
    await this.persistPreviewMaterializationReceipt(context, checkpoint, observation);
    if (context.snapshot.state === 'confirmation_pending') return context;
    return this.transition(
      context,
      'confirmation_pending',
      'article_materialization_confirmation_pending'
    );
  }

  private issueEditorObservation(
    context: AdapterContext
  ): Promise<{ readonly snapshot: XArticleExecutionSnapshotV1; readonly command: XArticleBrowserCommandV1 }> {
    return this.issue(context, {
      execution_id: context.snapshot.execution_id,
      run_id: context.plan.run_id,
      draft_id: context.snapshot.draft_id,
      kind: 'observe_article_page',
      purpose: 'reconcile_article_editor',
      expected_page_revision: context.latest_observation?.page_revision ?? null,
      allowed_origin: 'https://x.com', side_effect: 'read',
      payload: { kind: 'observe_article_page', scope: 'editor' }
    });
  }

  private async observeUnreportedV3_3Effect(
    context: AdapterContext
  ): Promise<{ readonly snapshot: XArticleExecutionSnapshotV1; readonly command: XArticleBrowserCommandV1 }> {
    const observing: AdapterContext = {
      ...context,
      pending_command: null,
      pending_issue: null,
      needs_editor_observation: true
    };
    await this.writeContext(observing);
    return this.issueEditorObservation(observing);
  }

  private async recordMaterializationProgress(
    context: AdapterContext,
    evidence: MaterializationReportEvidenceV1
  ): Promise<void> {
    const input = evidence.report;
    const stage = `${input.command.purpose}#${input.command.command_id}`;
    const expected = this.progressFromReportEvidence(evidence);
    const existing = await this.materializationStore.readProgress(
      context.snapshot.execution_id
    );
    const prior = existing.find((event) => event.stage === stage);
    if (prior !== undefined) {
      if (!isDeepStrictEqual(prior, expected)) {
        throw new HarnessError('CONTRACT_INVALID', 'persisted materialization progress changed');
      }
      return;
    }
    await this.materializationStore.appendProgress(expected);
  }

  private progressFromReportEvidence(
    evidence: MaterializationReportEvidenceV1
  ): XArticleStageProgressV1 {
    const input = evidence.report;
    const payload = input.command.payload;
    const assetId = payload.kind === 'replace_article_visual_anchor'
      ? payload.asset.asset_id
      : payload.kind === 'upload_article_cover'
        ? payload.asset.asset_id
        : null;
    const observedEffect = input.host_reason === 'x_media_still_processing'
      ? 'partial' as const
      : input.host_reason === 'observation_unavailable_after_selection'
        ? 'unknown' as const
        : input.host_reason === 'file_transfer_missing'
          || input.host_reason === 'x_media_effect_absent'
          ? 'none' as const
          : input.status === 'success'
            ? input.observation === null ? 'unknown' as const : 'complete' as const
            : input.status === 'uncertain'
              ? 'unknown' as const
              : 'none' as const;
    const waitingFor = observedEffect === 'unknown' || input.status === 'transient_failure'
      ? 'browser_effect_reconciliation'
      : null;
    return createXArticleStageProgress({
      execution_id: input.command.execution_id,
      stage: `${input.command.purpose}#${input.command.command_id}`,
      asset_id: assetId,
      elapsed_seconds: computeXArticleElapsedSeconds(input.command.issued_at, evidence.reported_at),
      waiting_for: waitingFor,
      retry_count: input.status === 'transient_failure' ? 1 : 0,
      observed_effect: observedEffect,
      recorded_at: evidence.reported_at
    });
  }

  private materializationReportBody(
    evidence: MaterializationReportEvidenceV1
  ): Omit<MaterializationReportEvidenceV1, 'evidence_digest'> {
    return Object.fromEntries(
      Object.entries(evidence).filter(([key]) => key !== 'evidence_digest')
    ) as Omit<MaterializationReportEvidenceV1, 'evidence_digest'>;
  }

  private async persistMaterializationReportEvidence(
    path: string,
    report: XArticleBrowserReportInput
  ): Promise<MaterializationReportEvidenceV1> {
    if (await this.store.exists(path)) {
      const existing = await this.readMaterializationReportEvidence(path, report.command);
      if (existing.report_digest !== sha256(report)) {
        throw new HarnessError('CONTRACT_INVALID', 'replayed X Article report artifact changed');
      }
      return existing;
    }
    const reportedAt = this.now().toISOString();
    const body = {
      schema_version: 'x-article-materialization-report/v1' as const,
      execution_id: report.command.execution_id,
      command_id: report.command.command_id,
      report: structuredClone(report),
      report_digest: sha256(report),
      reported_at: reportedAt
    };
    const evidence: MaterializationReportEvidenceV1 = {
      ...body,
      evidence_digest: sha256(body)
    };
    const validated = this.validateMaterializationReportEvidence(evidence, report.command);
    await this.store.writeNew(path, validated);
    return validated;
  }

  private async readMaterializationReportEvidence(
    path: string,
    command: XArticleBrowserCommandV1
  ): Promise<MaterializationReportEvidenceV1> {
    const evidence = await this.store.readJson<MaterializationReportEvidenceV1>(path);
    return this.validateMaterializationReportEvidence(evidence, command);
  }

  private validateMaterializationReportEvidence(
    evidence: MaterializationReportEvidenceV1,
    command: XArticleBrowserCommandV1
  ): MaterializationReportEvidenceV1 {
    const commandAt = Date.parse(command.issued_at);
    const reportedAt = Date.parse(evidence.reported_at);
    const observedAt = evidence.report.observation === null
      ? null
      : Date.parse(evidence.report.observation.observed_at);
    if (
      evidence.schema_version !== 'x-article-materialization-report/v1'
      || evidence.execution_id !== command.execution_id
      || evidence.command_id !== command.command_id
      || sha256(evidence.report.command) !== sha256(command)
      || evidence.report_digest !== sha256(evidence.report)
      || evidence.evidence_digest !== sha256(this.materializationReportBody(evidence))
      || !Number.isFinite(commandAt)
      || !Number.isFinite(reportedAt)
      || commandAt > reportedAt
      || (observedAt !== null && (!Number.isFinite(observedAt) || observedAt < commandAt || observedAt > reportedAt))
    ) {
      throw new HarnessError('CONTRACT_INVALID', 'materialization report evidence changed or is time-reversed');
    }
    return evidence;
  }

  private async durableMaterializationActivity(
    context: AdapterContext,
    materializationPlan: XArticleMaterializationPlanV1,
    recoveryRecordedAt: string,
    currentCommandId: string
  ): Promise<{
    readonly commandCount: number;
    readonly observationCount: number;
    readonly progress: readonly XArticleStageProgressV1[];
  }> {
    const executionId = context.snapshot.execution_id;
    const commandEntries = await this.store.list(`${this.prefix(executionId)}/commands`);
    const commandIds = new Set<string>();
    const commands: XArticleBrowserCommandV1[] = [];
    for (const entry of commandEntries) {
      if (entry.kind !== 'directory') {
        throw new HarnessError('CONTRACT_INVALID', 'materialization command ledger contains a non-directory');
      }
      this.assertId(entry.name);
      const command = validateContract<XArticleBrowserCommandV1>(
        'x-article-browser-command',
        await this.store.readJson<unknown>(`${entry.relative_path}/command.json`)
      );
      await this.assertPreparedCommandBinding(context, materializationPlan, command);
      if (
        command.execution_id !== executionId
        || command.command_id !== entry.name
        || command.run_id !== context.plan.run_id
        || command.allowed_origin !== 'https://x.com'
        || !this.isTrustedPreviewMaterializationCommand(context, command)
        || command.payload_digest !== sha256(command.payload)
        || !Number.isFinite(Date.parse(command.issued_at))
        || Date.parse(command.issued_at) < Date.parse(context.automation_started_at)
        || Date.parse(command.issued_at) > Date.parse(recoveryRecordedAt)
      ) {
        throw new HarnessError('CONTRACT_INVALID', 'materialization command ledger identity changed');
      }
      if (commandIds.has(command.command_id)) {
        throw new HarnessError('CONTRACT_INVALID', 'materialization command ledger contains a duplicate');
      }
      commandIds.add(command.command_id);
      commands.push(command);
    }

    const reportEntries = await this.store.list(`${this.prefix(executionId)}/reports`);
    for (const entry of reportEntries) {
      const commandId = entry.kind === 'file' && entry.name.endsWith('.json')
        ? entry.name.slice(0, -'.json'.length)
        : '';
      if (!commandIds.has(commandId)) {
        throw new HarnessError('CONTRACT_INVALID', 'materialization report ledger contains extraneous evidence');
      }
    }

    const observationEntries = await this.store.list(`${this.prefix(executionId)}/observations`);
    const observations = new Map<string, XArticleBrowserObservation>();
    for (const entry of observationEntries) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.json')) {
        throw new HarnessError('CONTRACT_INVALID', 'materialization observation ledger contains an invalid entry');
      }
      const observation = validateContract<XArticleBrowserObservation>(
        'x-article-browser-observation',
        await this.store.readJson<unknown>(entry.relative_path)
      );
      const body = Object.fromEntries(
        Object.entries(observation).filter(([key]) => key !== 'page_revision')
      );
      if (
        observation.execution_id !== executionId
        || `${observation.observation_id}.json` !== entry.name
        || !commandIds.has(observation.command_id)
        || observation.page_revision !== computeXArticlePageRevision(body)
        || observations.has(observation.observation_id)
      ) {
        throw new HarnessError('CONTRACT_INVALID', 'materialization observation ledger identity changed');
      }
      observations.set(observation.observation_id, observation);
    }

    let progress = await this.materializationStore.readProgress(executionId);
    const progressByCommand = new Map<string, XArticleStageProgressV1>();
    for (const event of progress) {
      const separator = event.stage.lastIndexOf('#');
      const commandId = separator < 1 ? '' : event.stage.slice(separator + 1);
      if (!commandIds.has(commandId) || progressByCommand.has(commandId)) {
        throw new HarnessError('CONTRACT_INVALID', 'materialization progress ledger is duplicate or foreign');
      }
      progressByCommand.set(commandId, event);
    }

    const referencedObservations = new Set<string>();
    for (const command of commands.sort((left, right) =>
      left.issued_at.localeCompare(right.issued_at) || left.command_id.localeCompare(right.command_id))) {
      const reportPath = `${this.prefix(executionId)}/reports/${command.command_id}.json`;
      let expectedProgress: XArticleStageProgressV1;
      if (await this.store.exists(reportPath)) {
        const evidence = await this.readMaterializationReportEvidence(reportPath, command);
        const observation = evidence.report.observation;
        if (observation !== null) {
          const durable = observations.get(observation.observation_id);
          if (durable === undefined || !isDeepStrictEqual(durable, observation)) {
            throw new HarnessError('CONTRACT_INVALID', 'materialization report observation is missing or changed');
          }
          if (referencedObservations.has(observation.observation_id)) {
            throw new HarnessError('CONTRACT_INVALID', 'materialization observation is referenced more than once');
          }
          referencedObservations.add(observation.observation_id);
        }
        if (command.command_id !== currentCommandId) {
          const projection = await this.readReportProjection(this.reportProjectionPath(command), {
            execution_id: command.execution_id,
            command_id: command.command_id,
            report_digest: evidence.report_digest
          });
          if (projection.report_digest !== evidence.report_digest) {
            throw new HarnessError('CONTRACT_INVALID', 'materialization report projection changed');
          }
        }
        expectedProgress = this.progressFromReportEvidence(evidence);
      } else {
        if (command.command_id === currentCommandId) {
          throw new HarnessError('CONTRACT_INVALID', 'current Preview command lacks durable report evidence');
        }
        try {
          await this.broker.readExistingClaim(command);
        } catch (error) {
          throw new HarnessError(
            'CONTRACT_INVALID',
            'unreported materialization command lacks a valid durable claim',
            error
          );
        }
        const payload = command.payload;
        const assetId = payload.kind === 'replace_article_visual_anchor'
          ? payload.asset.asset_id
          : payload.kind === 'upload_article_cover'
            ? payload.asset.asset_id
            : null;
        expectedProgress = createXArticleStageProgress({
          execution_id: executionId,
          stage: `durable_command_recovery#${command.command_id}`,
          asset_id: assetId,
          elapsed_seconds: 0,
          waiting_for: 'durable_command_recovery',
          retry_count: 0,
          observed_effect: 'unknown',
          recorded_at: recoveryRecordedAt
        });
        if (!progressByCommand.has(command.command_id)) {
          await this.materializationStore.appendProgress(expectedProgress);
          progressByCommand.set(command.command_id, expectedProgress);
        }
      }
      if (!isDeepStrictEqual(progressByCommand.get(command.command_id), expectedProgress)) {
        throw new HarnessError('CONTRACT_INVALID', 'materialization progress differs from durable report evidence');
      }
      if (Date.parse(expectedProgress.recorded_at) > Date.parse(recoveryRecordedAt)) {
        throw new HarnessError('CONTRACT_INVALID', 'materialization activity occurs after Preview checkpoint');
      }
    }
    if (referencedObservations.size !== observations.size) {
      throw new HarnessError('CONTRACT_INVALID', 'materialization observation ledger contains extraneous evidence');
    }
    progress = await this.materializationStore.readProgress(executionId);
    if (
      progress.length !== commandIds.size
      || progress.some((event) => {
        const separator = event.stage.lastIndexOf('#');
        return separator < 1 || !commandIds.has(event.stage.slice(separator + 1));
      })
    ) {
      throw new HarnessError('CONTRACT_INVALID', 'materialization progress ledger is incomplete or foreign');
    }
    return {
      commandCount: commandIds.size,
      observationCount: observations.size,
      progress
    };
  }

  private isTrustedPreviewMaterializationCommand(
    context: AdapterContext,
    command: XArticleBrowserCommandV1
  ): boolean {
    const preDraft = command.purpose === 'observe_articles_index'
      || command.purpose === 'create_article_draft';
    if (preDraft ? command.draft_id !== null : command.draft_id !== context.snapshot.draft_id) {
      return false;
    }
    if (command.kind === 'observe_article_page') {
      return command.side_effect === 'read'
        && [
          'observe_articles_index',
          'reconcile_article_editor',
          'reconcile_article_import_completion'
        ].includes(command.purpose);
    }
    if (command.kind === 'create_article_draft') {
      return command.purpose === 'create_article_draft' && command.side_effect === 'write';
    }
    if (command.kind === 'set_article_title') {
      return command.purpose === 'set_article_title' && command.side_effect === 'write';
    }
    if (command.kind === 'import_article_document') {
      return command.purpose === 'import_article_document' && command.side_effect === 'write';
    }
    if (command.kind === 'replace_article_visual_anchor') {
      return /^replace_article_visual_anchor_[1-9][0-9]*$/.test(command.purpose)
        && command.side_effect === 'write';
    }
    if (command.kind === 'upload_article_cover') {
      return command.purpose === 'upload_article_cover' && command.side_effect === 'write';
    }
    return command.kind === 'open_article_preview'
      && command.purpose === 'open_article_preview'
      && command.side_effect === 'write';
  }

  private async persistPreviewMaterializationReceipt(
    context: AdapterContext,
    checkpoint: XArticleMaterializationCheckpointV1,
    preview: XArticleBrowserObservation
  ): Promise<XArticleMaterializationReceiptV1> {
    const plan = await this.readBoundMaterializationPlan(context);
    const start = await this.readBoundMaterializationStart(context, plan);
    const activity = await this.durableMaterializationActivity(
      context,
      plan,
      checkpoint.updated_at,
      preview.command_id
    );
    const receipt = createXArticleMaterializationReceipt({
      plan,
      checkpoint,
      progress: activity.progress,
      cover_asset_id: context.plan.intent.document.cover_asset_id,
      body_block_count: context.plan.intent.document.blocks.length,
      command_count: activity.commandCount,
      observation_count: activity.observationCount,
      automation_started_at: start.started_at,
      preview_verified_at: checkpoint.updated_at,
      human_wait_seconds: 0,
      preview_revision: preview.page_revision,
      issued_at: checkpoint.updated_at
    });
    const path = this.previewMaterializationReceiptPath(context.snapshot.execution_id);
    try {
      await this.ensureExactArtifact(path, receipt);
    } catch (error) {
      throw new HarnessError(
        'ARTICLE_CHECKPOINT_CONFLICT',
        'Preview materialization receipt is missing, corrupt, or mismatched on repair',
        error
      );
    }
    return receipt;
  }

  private async persistPublicMaterializationReceipt(
    context: AdapterContext
  ): Promise<XArticleMaterializationReceiptV1> {
    let previewReceipt: XArticleMaterializationReceiptV1;
    try {
      previewReceipt = await this.store.readJson<XArticleMaterializationReceiptV1>(
        this.previewMaterializationReceiptPath(context.snapshot.execution_id)
      );
    } catch (error) {
      throw new HarnessError(
        'ARTICLE_CHECKPOINT_CONFLICT',
        'public verification requires the immutable Preview materialization receipt',
        error
      );
    }
    const { confirmation } = await this.verifyStoredPublishConfirmation(context, ['consumed']);
    const latestCommandId = context.latest_observation?.command_id;
    const progress = await this.materializationStore.readProgress(context.snapshot.execution_id);
    const publicProgress = latestCommandId === undefined
      ? undefined
      : progress.find((event) => event.stage.endsWith(`#${latestCommandId}`));
    if (publicProgress === undefined) {
      throw new HarnessError('CONTRACT_INVALID', 'public receipt lacks durable verification progress');
    }
    const publicCommand = validateContract<XArticleBrowserCommandV1>(
      'x-article-browser-command',
      await this.store.readJson<unknown>(this.commandPath({
        execution_id: context.snapshot.execution_id,
        command_id: latestCommandId!
      }))
    );
    const publicReport = await this.readMaterializationReportEvidence(
      `${this.prefix(context.snapshot.execution_id)}/reports/${publicCommand.command_id}.json`,
      publicCommand
    );
    if (
      !isDeepStrictEqual(publicProgress, this.progressFromReportEvidence(publicReport))
      || context.latest_observation === null
      || !isDeepStrictEqual(publicReport.report.observation, context.latest_observation)
    ) {
      throw new HarnessError('CONTRACT_INVALID', 'public verification progress differs from its exact report evidence');
    }
    const previewBoundary = await this.boundPreviewReceiptEvidence(context, previewReceipt);
    const receipt = createSupersedingXArticleMaterializationReceipt({
      preview_receipt: previewReceipt,
      expected_preview_receipt_digest: previewBoundary.receipt_digest,
      human_wait_seconds: computeXArticleElapsedSeconds(
        previewBoundary.observed_at,
        confirmation.confirmed_at
      ),
      issued_at: publicProgress.recorded_at
    });
    try {
      await this.ensureExactArtifact(
        this.publicMaterializationReceiptPath(context.snapshot.execution_id),
        receipt
      );
    } catch (error) {
      throw new HarnessError(
        'ARTICLE_CHECKPOINT_CONFLICT',
        'public materialization receipt is corrupt or mismatched on repair',
        error
      );
    }
    return receipt;
  }

  private isMaterializationEffect(command: XArticleBrowserCommandV1): boolean {
    return command.kind === 'set_article_title'
      || command.kind === 'import_article_document'
      || command.kind === 'replace_article_visual_anchor'
      || command.kind === 'upload_article_cover'
      || command.kind === 'set_article_image_alt'
      || command.kind === 'open_article_preview';
  }

  private isPreparedMaterializationMode(context: AdapterContext): boolean {
    return context.execution_mode === 'materialization_v3_2'
      || context.execution_mode === 'media_completion_v3_3';
  }

  private async hasMaterializationCheckpoint(context: AdapterContext): Promise<boolean> {
    if (!this.isPreparedMaterializationMode(context)) return false;
    const planPath = `${this.prefix(context.snapshot.execution_id)}/materialization-plan.json`;
    const checkpointPath = `${this.prefix(context.snapshot.execution_id)}/materialization-checkpoint.json`;
    const [planExists, checkpointExists] = await Promise.all([
      this.store.exists(planPath), this.store.exists(checkpointPath)
    ]);
    if (planExists && checkpointExists) return true;
    if (planExists || checkpointExists) {
      throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'prepared materialization persistence is partial');
    }
    if (
      context.execution_mode === 'media_completion_v3_3'
      && context.materialization_plan !== null
      && context.materialization_plan.draft_binding !== null
      && (
        context.snapshot.state === 'preflight'
        || await this.hasDurablePreBindingAdoptionRejection(context)
      )
    ) return false;
    throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'prepared materialization persistence is missing');
  }

  private async hasDurablePreBindingAdoptionRejection(context: AdapterContext): Promise<boolean> {
    if (context.snapshot.state !== 'materialization_blocked') return false;
    const eventPath = `${this.prefix(context.snapshot.execution_id)}/events/${String(context.snapshot.sequence).padStart(6, '0')}.json`;
    if (!await this.store.exists(eventPath)) return false;
    const event = await this.store.readJson<XArticleExecutionEventV1>(eventPath);
    if (
      event.execution_id !== context.snapshot.execution_id
      || event.sequence !== context.snapshot.sequence
      || event.previous_state !== 'preflight'
      || event.next_state !== 'materialization_blocked'
    ) {
      throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'adoption rejection event differs from blocked context');
    }
    return event.event_type === 'article_adoption_rejected';
  }

  private async recoverPreBindingAdoptionRejectionContext(context: AdapterContext): Promise<AdapterContext> {
    if (
      context.execution_mode !== 'media_completion_v3_3'
      || context.materialization_plan === null
      || context.materialization_plan.draft_binding === null
      || context.snapshot.state !== 'preflight'
    ) return context;
    const sequence = context.snapshot.sequence + 1;
    const eventPath = `${this.prefix(context.snapshot.execution_id)}/events/${String(sequence).padStart(6, '0')}.json`;
    if (!await this.store.exists(eventPath)) return context;
    const event = await this.store.readJson<XArticleExecutionEventV1>(eventPath);
    if (
      event.execution_id !== context.snapshot.execution_id
      || event.sequence !== sequence
      || event.event_type !== 'article_adoption_rejected'
      || event.previous_state !== 'preflight'
      || event.next_state !== 'materialization_blocked'
      || event.draft_id !== context.snapshot.draft_id
      || event.command_id !== null
    ) {
      throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'persisted adoption rejection event differs from preflight context');
    }
    const repaired: AdapterContext = {
      ...context,
      snapshot: {
        ...context.snapshot,
        state: 'materialization_blocked',
        sequence,
        updated_at: event.occurred_at
      }
    };
    await this.writeContext(repaired);
    return repaired;
  }

  private isPreparedReportActive(context: AdapterContext): boolean {
    return this.isPreparedMaterializationMode(context)
      && [
        'created', 'preflight', 'account_verified', 'draft_create_armed',
        'draft_created', 'materialization_reconciling', 'pre_publish_failed'
      ].includes(context.snapshot.state);
  }

  private async readBoundMaterializationPlan(
    context: AdapterContext
  ): Promise<XArticleMaterializationPlanV1> {
    if (!this.isPreparedMaterializationMode(context) || context.materialization_plan === null) {
      throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'prepared materialization plan is absent');
    }
    let durablePlan: XArticlePublicationPlanV1;
    try {
      durablePlan = await this.store.readJson<XArticlePublicationPlanV1>(
        `${this.prefix(context.snapshot.execution_id)}/plan.json`
      );
      assertXArticlePublicationPlan(durablePlan);
    } catch (error) {
      throw new HarnessError(
        'ARTICLE_CHECKPOINT_CONFLICT',
        'immutable X Article adapter plan is missing, corrupt, or invalid',
        error
      );
    }
    assertXArticlePublicationPlan(context.plan);
    const persisted = await this.materializationStore.readPlan(context.snapshot.execution_id);
    const expectedMaterialization = createXArticleMaterializationPlan({
      execution_id: context.snapshot.execution_id,
      publication_plan: durablePlan,
      import_template: createXArticleImportTemplate(durablePlan.intent.document),
      strategy: persisted.strategy,
      draft_binding: persisted.draft_binding
    });
    if (
      !isDeepStrictEqual(durablePlan, context.plan)
      || durablePlan.plan_id !== context.snapshot.plan_id
      || durablePlan.run_id !== context.snapshot.run_id
      || persisted.publication_plan_digest !== context.plan.plan_digest
      || !isDeepStrictEqual(persisted, context.materialization_plan)
      || !isDeepStrictEqual(persisted, expectedMaterialization)
    ) {
      throw new HarnessError(
        'ARTICLE_CHECKPOINT_CONFLICT',
        'durable materialization plan is not bound to the locked publication plan'
      );
    }
    return persisted;
  }

  private async readBoundMaterializationStart(
    context: AdapterContext,
    plan: XArticleMaterializationPlanV1
  ): Promise<XArticleMaterializationStartEvidenceV1> {
    try {
      const evidence = await this.store.readJson<XArticleMaterializationStartEvidenceV1>(
        this.materializationStartPath(context.snapshot.execution_id)
      );
      const verified = verifyXArticleMaterializationStartEvidence(evidence, plan);
      if (verified.started_at !== context.automation_started_at) {
        throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'adapter start mirror differs from immutable evidence');
      }
      return verified;
    } catch (error) {
      if (error instanceof HarnessError && error.code === 'ARTICLE_CHECKPOINT_CONFLICT') throw error;
      throw new HarnessError(
        'ARTICLE_CHECKPOINT_CONFLICT',
        'materialization start evidence is missing, corrupt, or mismatched',
        error
      );
    }
  }

  private async boundPreviewReceiptEvidence(
    context: AdapterContext,
    previewReceipt: XArticleMaterializationReceiptV1
  ): Promise<{ readonly receipt_digest: `sha256:${string}`; readonly observed_at: string }> {
    if (context.latest_preview_observation_id === null) {
      throw new HarnessError('CONTRACT_INVALID', 'public receipt lacks a bound Preview observation');
    }
    const observation = await this.store.readJson<XArticleBrowserObservation>(
      `${this.prefix(context.snapshot.execution_id)}/observations/${context.latest_preview_observation_id}.json`
    );
    if (
      observation.execution_id !== context.snapshot.execution_id
      || observation.preview === null
      || observation.page_revision !== previewReceipt.preview_revision
    ) {
      throw new HarnessError('CONTRACT_INVALID', 'Preview receipt boundary observation changed');
    }
    const command = validateContract<XArticleBrowserCommandV1>(
      'x-article-browser-command',
      await this.store.readJson<unknown>(this.commandPath({
        execution_id: context.snapshot.execution_id,
        command_id: observation.command_id
      }))
    );
    const report = await this.readMaterializationReportEvidence(
      `${this.prefix(context.snapshot.execution_id)}/reports/${command.command_id}.json`,
      command
    );
    if (report.report.observation === null || !isDeepStrictEqual(report.report.observation, observation)) {
      throw new HarnessError('CONTRACT_INVALID', 'Preview report does not bind its durable observation');
    }
    const projection = await this.readReportProjection(this.reportProjectionPath({
      execution_id: context.snapshot.execution_id,
      command_id: observation.command_id
    }), {
      execution_id: context.snapshot.execution_id,
      command_id: observation.command_id,
      report_digest: report.report_digest
    });
    if (projection.preview_receipt_digest === null) {
      throw new HarnessError('CONTRACT_INVALID', 'Preview projection lacks an immutable receipt binding');
    }
    const plan = await this.readBoundMaterializationPlan(context);
    await this.readBoundMaterializationStart(context, plan);
    return {
      receipt_digest: projection.preview_receipt_digest,
      observed_at: observation.observed_at
    };
  }

  private isOnlyMissingCover(
    reconciliation: ReturnType<typeof reconcileXArticleDraft>
  ): boolean {
    return reconciliation.kind === 'content_drift'
      && reconciliation.differences.length === 1
      && reconciliation.differences[0]?.path === 'editor.visuals.cover[0]'
      && reconciliation.differences[0]?.reason === 'missing';
  }

  private async assertPreparedCommandBinding(
    context: AdapterContext,
    materializationPlan: XArticleMaterializationPlanV1,
    input: IssueXArticleBrowserCommandInput
  ): Promise<void> {
    await this.assertV3_3DurableCommand(context, input, materializationPlan);
    if (
      input.payload.kind === 'set_article_title'
      && input.payload.title !== context.plan.intent.document.title
    ) {
      throw new HarnessError(
        'ARTICLE_MATERIALIZATION_DRIFT',
        'prepared title command is not bound to durable content'
      );
    }
    if (input.payload.kind === 'import_article_document') {
      const canonicalTemplate = createXArticleImportTemplate(context.plan.intent.document);
      if (
        input.payload.package_root !== context.plan.intent.article_package.root
        || input.payload.package_digest !== context.plan.intent.article_package.digest
        || input.payload.template.template_digest !== materializationPlan.import_template_digest
        || !isDeepStrictEqual(input.payload.template, canonicalTemplate)
      ) {
        throw new HarnessError('ARTICLE_MATERIALIZATION_DRIFT', 'prepared import command is not bound to durable content');
      }
    }
    if (input.payload.kind === 'replace_article_visual_anchor') {
      const payload = input.payload;
      const anchor = materializationPlan.visual_anchors.find((candidate) =>
        candidate.anchor_id === payload.anchor.anchor_id
      );
      const binding = context.plan.intent.visuals.find((candidate) =>
        candidate.placement.kind === 'block'
        && candidate.placement.block_ordinal === payload.anchor.block_ordinal
        && candidate.asset.asset_id === payload.anchor.asset_id
      );
      if (
        anchor === undefined
        || binding === undefined
        || anchor.asset_id !== payload.asset.asset_id
        || anchor.block_ordinal !== payload.anchor.block_ordinal
        || anchor.asset_digest !== payload.asset.digest
        || binding.asset.digest !== anchor.asset_digest
        || input.purpose !== `replace_article_visual_anchor_${anchor.block_ordinal}`
        || !isDeepStrictEqual(binding.asset, payload.asset)
      ) {
        throw new HarnessError('ARTICLE_ASSET_MISMATCH', 'prepared anchor command is not bound to durable assets');
      }
    }
    if (input.payload.kind === 'upload_article_cover') {
      const binding = context.plan.intent.visuals.find((candidate) => candidate.placement.kind === 'cover');
      if (
        binding === undefined
        || context.plan.intent.document.cover_asset_id !== input.payload.asset.asset_id
        || !isDeepStrictEqual(binding.asset, input.payload.asset)
      ) {
        throw new HarnessError('ARTICLE_ASSET_MISMATCH', 'prepared cover command is not bound to the locked asset');
      }
    }
  }

  private async assertV3_3PendingIssueBinding(
    context: AdapterContext,
    commandId?: string
  ): Promise<void> {
    const intent = context.pending_issue;
    if (intent === null) {
      if (
        context.execution_mode === 'media_completion_v3_3'
        && context.pending_command !== null
        && (commandId === undefined || context.pending_command.command_id === commandId)
      ) {
        throw new HarnessError('PUBLISH_GATE_BLOCKED', 'existing Draft pending command lost its issue intent');
      }
      return;
    }
    if (commandId !== undefined && intent.command_id !== commandId) return;
    if (intent.input_digest !== sha256(intent.input)) {
      throw new HarnessError('CONTRACT_INVALID', 'X Article command issue intent changed');
    }
    if (context.execution_mode !== 'media_completion_v3_3') return;
    const expectedActionKey = sha256({
      checkpoint_revision: intent.checkpoint_revision,
      state: context.snapshot.state,
      sequence: context.snapshot.sequence,
      input: intent.input
    });
    if (commandId === undefined && intent.action_key !== expectedActionKey) {
      throw new HarnessError('PUBLISH_GATE_BLOCKED', 'existing Draft command action binding changed');
    }
    await this.assertV3_3DurableCommand(context, intent.input);
    await this.assertV3_3IssuedCommandBinding(context, intent);
    if (
      context.pending_command !== null
      && context.pending_command.command_id === intent.command_id
    ) {
      const stableCommandInput = Object.fromEntries(
        Object.entries(context.pending_command).filter(([key]) =>
          !['schema_version', 'command_id', 'payload_digest', 'issued_at'].includes(key)
        )
      );
      if (
        context.pending_command.payload_digest !== sha256(context.pending_command.payload)
        || sha256(stableCommandInput) !== intent.input_digest
      ) {
        throw new HarnessError('PUBLISH_GATE_BLOCKED', 'existing Draft pending command changed');
      }
    }
  }

  private async assertV3_3DurableCommand(
    context: AdapterContext,
    input: IssueXArticleBrowserCommandInput | XArticleBrowserCommandV1,
    boundPlan?: XArticleMaterializationPlanV1
  ): Promise<void> {
    if (context.execution_mode !== 'media_completion_v3_3') return;
    if (!V3_3_ALLOWED_COMMANDS.has(input.kind)) {
      throw new HarnessError(
        'PUBLISH_GATE_BLOCKED',
        `existing Draft media completion cannot issue ${input.kind}`
      );
    }
    let materializationPlan = boundPlan;
    if (materializationPlan === undefined && input.kind === 'navigate') {
      let durablePlan: XArticlePublicationPlanV1;
      try {
        durablePlan = await this.store.readJson<XArticlePublicationPlanV1>(
          `${this.prefix(context.snapshot.execution_id)}/plan.json`
        );
        assertXArticlePublicationPlan(durablePlan);
      } catch (error) {
        throw new HarnessError('PUBLISH_GATE_BLOCKED', 'existing Draft durable Plan is unavailable', error);
      }
      const draftBinding = context.materialization_plan?.draft_binding;
      if (draftBinding === null || draftBinding === undefined) {
        throw new HarnessError('PUBLISH_GATE_BLOCKED', 'existing Draft durable binding is unavailable');
      }
      const expected = createXArticleMaterializationPlan({
        execution_id: context.snapshot.execution_id,
        publication_plan: durablePlan,
        import_template: createXArticleImportTemplate(durablePlan.intent.document),
        strategy: 'rich_text_anchor_import/v1',
        draft_binding: draftBinding
      });
      if (!isDeepStrictEqual(durablePlan, context.plan) || !isDeepStrictEqual(expected, context.materialization_plan)) {
        throw new HarnessError('PUBLISH_GATE_BLOCKED', 'existing Draft pre-binding Plan changed');
      }
      materializationPlan = expected;
    }
    materializationPlan ??= await this.readBoundMaterializationPlan(context);
    const binding = materializationPlan?.draft_binding;
    if (
      materializationPlan === null
      || materializationPlan === undefined
      || binding === null
      || binding === undefined
      || materializationPlan.execution_id !== context.snapshot.execution_id
      || materializationPlan.publication_plan_digest !== context.plan.plan_digest
      || binding.expected_account !== context.plan.intent.target_account
      || input.execution_id !== context.snapshot.execution_id
      || input.run_id !== context.plan.run_id
      || input.draft_id !== binding.draft_id
      || input.allowed_origin !== 'https://x.com'
      || input.kind !== input.payload.kind
    ) {
      throw new HarnessError('PUBLISH_GATE_BLOCKED', 'existing Draft command identity binding changed');
    }
    if ('schema_version' in input) {
      try {
        validateContract<XArticleBrowserCommandV1>('x-article-browser-command', input);
      } catch (error) {
        throw new HarnessError('PUBLISH_GATE_BLOCKED', 'existing Draft command envelope changed', error);
      }
      if (
        input.schema_version !== '1.0'
        || input.payload_digest !== sha256(input.payload)
        || !Number.isFinite(Date.parse(input.issued_at))
      ) {
        throw new HarnessError('PUBLISH_GATE_BLOCKED', 'existing Draft command digest changed');
      }
    }

    if (input.kind === 'navigate' && input.payload.kind === 'navigate') {
      if (
        input.purpose !== 'navigate_existing_article_draft'
        || input.side_effect !== 'read'
        || input.expected_page_revision !== null
        || input.payload.url !== `https://x.com/compose/articles/edit/${binding.draft_id}`
      ) {
        throw new HarnessError('PUBLISH_GATE_BLOCKED', 'existing Draft navigation binding changed');
      }
      return;
    }

    const observation = await this.readV3_3CommandObservation(context, input.expected_page_revision);
    const isEnvelope = 'schema_version' in input;
    const isFreshIssue = !isEnvelope && context.pending_issue === null;
    if (isFreshIssue && V3_3_MEDIA_COMMANDS.has(input.kind)) {
      if (
        context.editor_revision !== observation.page_revision
        || context.latest_editor_observation_id !== observation.observation_id
      ) {
        throw new HarnessError(
          'PUBLISH_GATE_BLOCKED',
          'existing Draft media command predecessor revision changed'
        );
      }
    }
    let editor;
    try {
      editor = this.contract.detectEditor(observation);
    } catch (error) {
      throw new HarnessError('PUBLISH_GATE_BLOCKED', 'existing Draft command has no bound editor', error);
    }
    if (
      observation.account_handle !== materializationPlan.target_account
      || observation.page_kind !== 'article_editor'
      || editor.draft_id !== binding.draft_id
      || context.snapshot.draft_id !== binding.draft_id
    ) {
      throw new HarnessError('PUBLISH_GATE_BLOCKED', 'existing Draft command account or Draft binding changed');
    }

    if (input.kind === 'observe_article_page' && input.payload.kind === 'observe_article_page') {
      if (
        input.side_effect !== 'read'
        || input.payload.scope !== 'editor'
        || !['reconcile_article_editor', 'reconcile_article_import_completion'].includes(input.purpose)
      ) {
        throw new HarnessError('PUBLISH_GATE_BLOCKED', 'existing Draft observation binding changed');
      }
      return;
    }

    if (input.kind === 'upload_article_cover' && input.payload.kind === 'upload_article_cover') {
      const cover = context.plan.intent.visuals.find((candidate) => candidate.placement.kind === 'cover');
      if (
        input.purpose !== 'upload_article_cover'
        || input.side_effect !== 'write'
        || cover === undefined
        || context.plan.intent.document.cover_asset_id !== cover.asset.asset_id
        || input.payload.package_root !== context.plan.intent.article_package.root
        || input.payload.package_digest !== context.plan.intent.article_package.digest
        || !isDeepStrictEqual(input.payload.asset, cover.asset)
      ) {
        throw new HarnessError('PUBLISH_GATE_BLOCKED', 'existing Draft cover binding changed');
      }
      return;
    }

    if (
      input.kind === 'replace_article_visual_anchor'
      && input.payload.kind === 'replace_article_visual_anchor'
    ) {
      const anchor = materializationPlan.visual_anchors.find((candidate) =>
        candidate.anchor_id === input.payload.anchor.anchor_id
      );
      const templateAnchor = createXArticleImportTemplate(context.plan.intent.document).anchors.find(
        (candidate) => candidate.anchor_id === input.payload.anchor.anchor_id
      );
      const visual = anchor === undefined ? undefined : context.plan.intent.visuals.find((candidate) =>
        candidate.placement.kind === 'block'
        && candidate.placement.block_ordinal === anchor.block_ordinal
        && candidate.asset.asset_id === anchor.asset_id
      );
      let bodyRef: string;
      try {
        bodyRef = this.contract.detectControl(observation, 'body').ref;
      } catch (error) {
        throw new HarnessError('PUBLISH_GATE_BLOCKED', 'existing Draft anchor target changed', error);
      }
      if (
        input.side_effect !== 'write'
        || anchor === undefined
        || templateAnchor === undefined
        || visual === undefined
        || input.purpose !== `replace_article_visual_anchor_${anchor.block_ordinal}`
        || input.payload.target_ref !== bodyRef
        || input.payload.package_root !== context.plan.intent.article_package.root
        || input.payload.package_digest !== context.plan.intent.article_package.digest
        || !isDeepStrictEqual(input.payload.anchor, templateAnchor)
        || !isDeepStrictEqual(input.payload.asset, visual.asset)
        || input.payload.asset.digest !== anchor.asset_digest
      ) {
        throw new HarnessError('PUBLISH_GATE_BLOCKED', 'existing Draft anchor or asset binding changed');
      }
      return;
    }

    if (input.kind === 'set_article_image_alt' && input.payload.kind === 'set_article_image_alt') {
      const payload = input.payload;
      const observedVisual = editor.visuals.find((visual) => visual.ref === payload.visual_ref);
      const cover = context.plan.intent.visuals.find((candidate) => candidate.placement.kind === 'cover');
      if (
        input.purpose !== 'set_cover_alt_text'
        || input.side_effect !== 'write'
        || observedVisual === undefined
        || !observedVisual.owned_by_execution
        || observedVisual.status !== 'uploaded'
        || observedVisual.kind !== 'cover'
        || cover === undefined
        || observedVisual.asset_id !== cover.asset.asset_id
        || payload.alt_text !== cover.asset.alt_text
      ) {
        throw new HarnessError('PUBLISH_GATE_BLOCKED', 'existing Draft Alt or ownership binding changed');
      }
      return;
    }

    throw new HarnessError('PUBLISH_GATE_BLOCKED', 'existing Draft command payload is not exactly bound');
  }

  private async readV3_3CommandObservation(
    context: AdapterContext,
    revision: string | null
  ): Promise<XArticleBrowserObservation> {
    if (revision === null) {
      throw new HarnessError('PUBLISH_GATE_BLOCKED', 'existing Draft write lacks a page revision');
    }
    const observations: XArticleBrowserObservation[] = [];
    const entries = await this.store.list(`${this.prefix(context.snapshot.execution_id)}/observations`);
    for (const entry of entries) {
      if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue;
      const observation = await this.store.readJson<XArticleBrowserObservation>(entry.relative_path);
      if (observation.page_revision === revision) observations.push(observation);
    }
    if (observations.length !== 1) {
      throw new HarnessError('PUBLISH_GATE_BLOCKED', 'existing Draft command page revision is not uniquely durable');
    }
    const observation = observations[0]!;
    const revisionBody = Object.fromEntries(
      Object.entries(observation).filter(([key]) => key !== 'page_revision')
    );
    if (
      observation.page_revision !== computeXArticlePageRevision(revisionBody)
      || observation.execution_id !== context.snapshot.execution_id
      || observation.origin !== 'https://x.com'
    ) {
      throw new HarnessError('PUBLISH_GATE_BLOCKED', 'existing Draft command page evidence changed');
    }
    return observation;
  }

  private async assertV3_3IssuedCommandBinding(
    context: AdapterContext,
    intent: PendingIssueIntent
  ): Promise<void> {
    let binding: V3_3CommandIssueBinding;
    try {
      binding = await this.store.readJson<V3_3CommandIssueBinding>(
        this.v3_3CommandIssueBindingPath(context.snapshot.execution_id, intent.command_id)
      );
    } catch (error) {
      throw new HarnessError('PUBLISH_GATE_BLOCKED', 'existing Draft command issue binding is missing', error);
    }
    const { binding_digest: persistedDigest, ...body } = binding;
    if (
      binding.schema_version !== 'x-article-command-issue-binding/v1'
      || persistedDigest !== sha256(body)
      || binding.execution_id !== context.snapshot.execution_id
      || binding.command_id !== intent.command_id
      || binding.input_digest !== intent.input_digest
      || binding.checkpoint_revision !== intent.checkpoint_revision
      || binding.action_key !== intent.action_key
      || binding.predecessor_revision !== intent.input.expected_page_revision
      || (binding.predecessor_revision === null) !== (binding.predecessor_observation_id === null)
    ) {
      throw new HarnessError('PUBLISH_GATE_BLOCKED', 'existing Draft issued command binding changed');
    }
    if (binding.predecessor_observation_id !== null) {
      let predecessor: XArticleBrowserObservation;
      try {
        predecessor = await this.store.readJson<XArticleBrowserObservation>(
          `${this.prefix(context.snapshot.execution_id)}/observations/${binding.predecessor_observation_id}.json`
        );
      } catch (error) {
        throw new HarnessError(
          'PUBLISH_GATE_BLOCKED', 'existing Draft command predecessor is missing', error
        );
      }
      const predecessorBody = Object.fromEntries(
        Object.entries(predecessor).filter(([key]) => key !== 'page_revision')
      );
      if (
        predecessor.page_revision !== computeXArticlePageRevision(predecessorBody)
        || predecessor.page_revision !== binding.predecessor_revision
        || predecessor.observation_id !== binding.predecessor_observation_id
        || predecessor.execution_id !== context.snapshot.execution_id
        || predecessor.origin !== 'https://x.com'
        || predecessor.account_handle !== context.plan.intent.target_account
        || predecessor.page_kind !== 'article_editor'
        || predecessor.editor?.draft_id !== context.snapshot.draft_id
      ) {
        throw new HarnessError('PUBLISH_GATE_BLOCKED', 'existing Draft command predecessor changed');
      }
    }
  }

  private async blockMaterialization(
    context: AdapterContext,
    checkpoint: XArticleMaterializationCheckpointV1,
    evidence: object
  ): Promise<AdapterContext> {
    if (checkpoint.phase !== 'blocked') {
      await this.materializationStore.updateCheckpoint(
        context.snapshot.execution_id,
        checkpoint.revision,
        (trusted) => ({
          ...trusted,
          phase: 'blocked',
          updated_at: context.latest_observation?.observed_at ?? this.now().toISOString()
        })
      );
    }
    const evidenceDigest = sha256(evidence);
    await this.ensureExactArtifact(
      `${this.prefix(context.snapshot.execution_id)}/reconciliation-evidence/${evidenceDigest.slice(7)}.json`,
      { evidence_digest: evidenceDigest, evidence }
    );
    if (context.snapshot.state === 'materialization_blocked') return context;
    return this.transition(context, 'materialization_blocked', 'article_materialization_blocked');
  }

  private async issue(
    context: AdapterContext,
    input: IssueXArticleBrowserCommandInput,
    deterministicId?: string
  ): Promise<{ readonly snapshot: XArticleExecutionSnapshotV1; readonly command: XArticleBrowserCommandV1 }> {
    await this.assertV3_3DurableCommand(context, input);
    let checkpointRevision: number | null = null;
    if (
      this.isPreparedMaterializationMode(context)
      && !(context.execution_mode === 'media_completion_v3_3' && context.snapshot.state === 'preflight')
    ) {
      checkpointRevision = (await this.materializationStore.readCheckpoint(
        context.snapshot.execution_id
      )).revision;
    }
    const commandId = deterministicId ?? this.commandId();
    this.assertId(commandId);
    const pendingIssue: PendingIssueIntent = {
      command_id: commandId,
      input,
      input_digest: sha256(input),
      checkpoint_revision: checkpointRevision,
      action_key: sha256({
        checkpoint_revision: checkpointRevision,
        state: context.snapshot.state,
        sequence: context.snapshot.sequence,
        input
      })
    };
    if (context.execution_mode === 'media_completion_v3_3') {
      const bindingBody = {
        schema_version: 'x-article-command-issue-binding/v1' as const,
        execution_id: context.snapshot.execution_id,
        command_id: commandId,
        input_digest: pendingIssue.input_digest,
        checkpoint_revision: pendingIssue.checkpoint_revision,
        action_key: pendingIssue.action_key,
        predecessor_observation_id: input.expected_page_revision === null
          ? null
          : context.latest_editor_observation_id,
        predecessor_revision: input.expected_page_revision
      };
      await this.ensureExactArtifact(
        this.v3_3CommandIssueBindingPath(context.snapshot.execution_id, commandId),
        { ...bindingBody, binding_digest: sha256(bindingBody) }
      );
    }
    const intendedContext: AdapterContext = { ...context, pending_issue: pendingIssue };
    await this.writeContext(intendedContext);
    await this.projectPendingIssueCheckpoint(intendedContext);
    return this.finishPendingIssue(intendedContext);
  }

  private async finishPendingIssue(
    context: AdapterContext
  ): Promise<{ readonly snapshot: XArticleExecutionSnapshotV1; readonly command: XArticleBrowserCommandV1 }> {
    const pendingIssue = context.pending_issue;
    if (pendingIssue === null) {
      throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'X Article command issue intent is absent');
    }
    await this.assertV3_3PendingIssueBinding(context);
    await this.assertV3_3DurableCommand(context, pendingIssue.input);
    await this.projectPendingIssueCheckpoint(context);
    const command = await this.broker.issue(pendingIssue.input, pendingIssue.command_id);
    const nextContext: AdapterContext = {
      ...context,
      pending_command: command,
      needs_editor_observation: context.needs_editor_observation
        || (this.isPreparedMaterializationMode(context) && this.isMaterializationEffect(command)),
      snapshot: {
        ...context.snapshot,
        latest_command_id: command.command_id,
        updated_at: this.now().toISOString()
      }
    };
    await this.writeContext(nextContext);
    return { snapshot: nextContext.snapshot, command };
  }

  private async projectPendingIssueCheckpoint(context: AdapterContext): Promise<void> {
    const intent = context.pending_issue;
    if (
      !this.isPreparedMaterializationMode(context)
      || intent === null
      || (context.execution_mode === 'media_completion_v3_3' && context.snapshot.state === 'preflight')
    ) return;
    if (
      intent.input.execution_id !== context.snapshot.execution_id
      || intent.input_digest !== sha256(intent.input)
    ) {
      throw new HarnessError('CONTRACT_INVALID', 'prepared command issue intent identity changed');
    }
    const checkpoint = await this.materializationStore.readCheckpoint(context.snapshot.execution_id);
    if (intent.input.kind === 'import_article_document') {
      if (checkpoint.body.status === 'issued') return;
      if (checkpoint.body.status !== 'pending' || checkpoint.revision !== intent.checkpoint_revision) {
        throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'body issue intent checkpoint changed');
      }
      await this.materializationStore.updateCheckpoint(
        context.snapshot.execution_id,
        checkpoint.revision,
        (current) => ({
          ...current,
          body: { status: 'issued', observed_digest: null },
          updated_at: this.now().toISOString()
        })
      );
      return;
    }
    if (intent.input.kind === 'replace_article_visual_anchor') {
      const anchorId = intent.input.payload.anchor.anchor_id;
      const mediaIndex = checkpoint.media.findIndex((entry) => entry.anchor_id === anchorId);
      const media = checkpoint.media[mediaIndex];
      if (media?.status === 'upload_started') return;
      if (
        media === undefined
        || media.status !== 'pending'
        || checkpoint.revision !== intent.checkpoint_revision
      ) {
        throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'anchor issue intent checkpoint changed');
      }
      await this.materializationStore.updateCheckpoint(
        context.snapshot.execution_id,
        checkpoint.revision,
        (current) => ({
          ...current,
          media: current.media.map((entry, index) => index === mediaIndex
            ? { ...entry, status: 'upload_started' as const }
            : entry),
          updated_at: this.now().toISOString()
        })
      );
    }
  }

  private async clearPending(context: AdapterContext): Promise<AdapterContext> {
    const next = { ...context, pending_command: null, pending_issue: null };
    await this.writeContext(next);
    return next;
  }

  private async transition(
    context: AdapterContext,
    nextState: XArticleExecutionState,
    eventType: string,
    overrides: {
      readonly draft_id?: string;
      readonly attempt_id?: string;
      readonly publish_command_count?: number;
      readonly submit_delivered?: boolean;
      readonly latest_receipt_path?: string;
    } = {}
  ): Promise<AdapterContext> {
    transitionXArticleExecution(context.snapshot.state, nextState);
    const sequence = context.snapshot.sequence + 1;
    const eventPath = `${this.prefix(context.snapshot.execution_id)}/events/${String(sequence).padStart(6, '0')}.json`;
    let event: XArticleExecutionEventV1;
    if (await this.store.exists(eventPath)) {
      event = await this.store.readJson<XArticleExecutionEventV1>(eventPath);
      if (
        event.execution_id !== context.snapshot.execution_id
        || event.sequence !== sequence
        || event.event_type !== eventType
        || event.previous_state !== context.snapshot.state
        || event.next_state !== nextState
        || event.draft_id !== (overrides.draft_id ?? context.snapshot.draft_id)
        || event.command_id !== (context.pending_command?.command_id ?? null)
      ) {
        throw new HarnessError('CONTRACT_INVALID', 'persisted X Article transition event changed');
      }
    } else {
      event = createXArticleExecutionEvent({
        eventId: this.eventId(), executionId: context.snapshot.execution_id, sequence,
        eventType, occurredAt: this.now().toISOString(), previousState: context.snapshot.state,
        nextState, draftId: overrides.draft_id ?? context.snapshot.draft_id,
        commandId: context.pending_command?.command_id ?? null
      });
      await this.store.writeNew(eventPath, event);
    }
    const nextContext: AdapterContext = {
      ...context,
      submit_delivered: overrides.submit_delivered ?? context.submit_delivered,
      snapshot: {
        ...context.snapshot,
        state: nextState,
        sequence,
        draft_id: overrides.draft_id ?? context.snapshot.draft_id,
        attempt_id: overrides.attempt_id ?? context.snapshot.attempt_id,
        publish_command_count: overrides.publish_command_count ?? context.snapshot.publish_command_count,
        latest_receipt_path: overrides.latest_receipt_path ?? context.snapshot.latest_receipt_path,
        updated_at: event.occurred_at
      }
    };
    await this.writeContext(nextContext);
    return nextContext;
  }

  private verifyCapabilities(
    plan: XArticlePublicationPlanV1,
    manifest: XArticleBrowserCapabilityManifestV1
  ): XArticleImportStrategy {
    const hasDocumentImport = manifest.capabilities.includes('import_article_document');
    const hasAnchorReplacement = manifest.capabilities.includes('replace_article_visual_anchor');
    if (hasDocumentImport !== hasAnchorReplacement) {
      throw new HarnessError(
        'BROWSER_EXECUTOR_INCOMPATIBLE',
        'Chrome Host must advertise both X Article bulk-import capabilities'
      );
    }
    const required: XArticleBrowserCommandKind[] = [
      'observe_article_page', 'create_article_draft', 'set_article_title',
      'insert_article_block', 'open_article_preview', 'open_publish_review', 'publish_article_once'
    ];
    if (plan.intent.visuals.some((visual) => visual.placement.kind === 'cover')) required.push('upload_article_cover');
    if (plan.intent.visuals.some((visual) => visual.placement.kind === 'block')) required.push('insert_article_image');
    const coverAltRequired =
      this.contract.media_alt_capabilities.cover === 'editable' &&
      plan.intent.visuals.some((visual) => visual.placement.kind === 'cover');
    const inlineAltRequired =
      this.contract.media_alt_capabilities.inline === 'editable' &&
      plan.intent.visuals.some((visual) => visual.placement.kind === 'block');
    if (coverAltRequired || inlineAltRequired) required.push('set_article_image_alt');
    if (
      manifest.executor !== 'codex-chrome' || manifest.browser_family !== 'chrome' ||
      required.some((capability) => !manifest.capabilities.includes(capability))
    ) {
      throw new HarnessError('BROWSER_EXECUTOR_INCOMPATIBLE', 'Chrome Host lacks required X Article capabilities');
    }
    return hasDocumentImport ? 'bulk_document' : 'incremental_blocks';
  }

  private async finalizeProjectedReport(
    context: AdapterContext,
    commandId: string,
    reportDigest: string
  ): Promise<AdapterContext> {
    let previewReceiptDigest: `sha256:${string}` | null = null;
    if (
      context.execution_mode === 'materialization_v3_2'
      && context.latest_preview_observation_id !== null
    ) {
      const observation = await this.store.readJson<XArticleBrowserObservation>(
        `${this.prefix(context.snapshot.execution_id)}/observations/${context.latest_preview_observation_id}.json`
      );
      if (
        observation.command_id === commandId
        && await this.store.exists(this.previewMaterializationReceiptPath(context.snapshot.execution_id))
      ) {
        const receipt = await this.store.readJson<XArticleMaterializationReceiptV1>(
          this.previewMaterializationReceiptPath(context.snapshot.execution_id)
        );
        previewReceiptDigest = receipt.receipt_digest;
      }
    }
    const projectionBody = {
      execution_id: context.snapshot.execution_id,
      command_id: commandId
    };
    const projection = {
      schema_version: '1.0' as const,
      ...projectionBody,
      report_digest: reportDigest,
      preview_receipt_digest: previewReceiptDigest
    };
    await this.ensureExactArtifact(this.reportProjectionPath(projectionBody), {
      ...projection,
      projection_digest: sha256(projection)
    } satisfies ReportProjectionComplete);
    const next: AdapterContext = {
      ...context,
      pending_command: null,
      pending_issue: null,
      last_projected_report: { command_id: commandId, report_digest: reportDigest }
    };
    await this.writeContext(next);
    return next;
  }

  private async readReportProjection(
    path: string,
    expected: {
      readonly execution_id: string;
      readonly command_id: string;
      readonly report_digest?: string;
    }
  ): Promise<ReportProjectionComplete> {
    const projection = await this.store.readJson<ReportProjectionComplete>(path);
    const body = Object.fromEntries(
      Object.entries(projection).filter(([key]) => key !== 'projection_digest')
    );
    if (
      projection.schema_version !== '1.0'
      || projection.projection_digest !== sha256(body)
      || projection.execution_id !== expected.execution_id
      || projection.command_id !== expected.command_id
      || (expected.report_digest !== undefined && projection.report_digest !== expected.report_digest)
      || (projection.preview_receipt_digest !== null
        && !/^sha256:[a-f0-9]{64}$/.test(projection.preview_receipt_digest))
    ) {
      throw new HarnessError('CONTRACT_INVALID', 'X Article report projection changed');
    }
    return projection;
  }

  private async recoverBrokerPersistedCommand(
    context: AdapterContext,
    reported: XArticleBrowserCommandV1
  ): Promise<AdapterContext> {
    if (context.snapshot.state === 'cancelled_before_publish') {
      throw new HarnessError(
        'COMMAND_REPLAY_REJECTED',
        'cancelled X Article execution cannot recover a broker command'
      );
    }
    const intent = context.pending_issue;
    if (
      intent === null
      || intent.command_id !== reported.command_id
      || intent.input_digest !== sha256(intent.input)
    ) {
      throw new HarnessError('COMMAND_REPLAY_REJECTED', 'reported X Article command has no durable issue intent');
    }
    const command = await this.store.readJson<XArticleBrowserCommandV1>(this.commandPath(reported));
    if (
      sha256(command) !== sha256(reported)
      || command.command_id !== intent.command_id
    ) {
      throw new HarnessError('CONTRACT_INVALID', 'broker-persisted X Article command changed');
    }
    const stableCommandInput = Object.fromEntries(
      Object.entries(command).filter(([key]) =>
        !['schema_version', 'command_id', 'payload_digest', 'issued_at'].includes(key)
      )
    );
    if (sha256(stableCommandInput) !== intent.input_digest) {
      throw new HarnessError('CONTRACT_INVALID', 'broker command is not bound to durable issue intent');
    }
    await this.assertV3_3DurableCommand(context, command);
    const repaired: AdapterContext = {
      ...context,
      pending_command: command,
      snapshot: {
        ...context.snapshot,
        latest_command_id: command.command_id,
        updated_at: command.issued_at
      }
    };
    await this.writeContext(repaired);
    return repaired;
  }

  private verifyPreparedCapabilities(
    plan: XArticlePublicationPlanV1,
    manifest: XArticleBrowserCapabilityManifestV1
  ): void {
    if (
      !manifest.capabilities.includes('import_article_document')
      || !manifest.capabilities.includes('replace_article_visual_anchor')
    ) {
      throw new HarnessError(
        'ARTICLE_BULK_IMPORT_REQUIRED',
        'prepared X Article materialization requires the complete bulk-import capability set'
      );
    }
    const required: XArticleBrowserCommandKind[] = [
      'observe_article_page', 'create_article_draft', 'set_article_title', 'open_article_preview',
      'open_publish_review', 'publish_article_once'
    ];
    if (plan.intent.visuals.some((visual) => visual.placement.kind === 'cover')) {
      required.push('upload_article_cover');
    }
    if (
      manifest.executor !== 'codex-chrome'
      || manifest.browser_family !== 'chrome'
      || required.some((capability) => !manifest.capabilities.includes(capability))
    ) {
      throw new HarnessError(
        'ARTICLE_MATERIALIZATION_CAPABILITY_MISMATCH',
        'Chrome Host lacks a required prepared X Article materialization capability'
      );
    }
  }

  private async assertPreparedConfirmationEvidence(
    context: AdapterContext,
    allowedConfirmationStates: readonly ('absent' | 'armed' | 'consumed')[]
  ): Promise<{
    readonly materializationPlan: XArticleMaterializationPlanV1;
    readonly checkpoint: XArticleMaterializationCheckpointV1;
    readonly preview: XArticleBrowserObservation;
  }> {
    const materializationPlan = await this.readBoundMaterializationPlan(context);
    const checkpoint = await this.materializationStore.readCheckpoint(
      context.snapshot.execution_id
    );
    const previewObservationId = context.latest_preview_observation_id;
    const editorObservationId = context.latest_editor_observation_id;
    let preview: XArticleBrowserObservation | null = null;
    let editor: XArticleBrowserObservation | null = null;
    if (previewObservationId !== null && previewObservationId !== undefined) {
      try {
        preview = await this.store.readJson<XArticleBrowserObservation>(
          `${this.prefix(context.snapshot.execution_id)}/observations/${previewObservationId}.json`
        );
      } catch {
        preview = null;
      }
    }
    if (editorObservationId !== null) {
      try {
        editor = await this.store.readJson<XArticleBrowserObservation>(
          `${this.prefix(context.snapshot.execution_id)}/observations/${editorObservationId}.json`
        );
      } catch {
        editor = null;
      }
    }

    let coherentEditor = false;
    if (editor !== null) {
      try {
        const editorBody = Object.fromEntries(
          Object.entries(editor).filter(([key]) => key !== 'page_revision')
        );
        const editorPage = this.contract.detectPage(editor);
        this.contract.detectEditor(editor);
        const reconciliation = reconcileXArticleDraft({
          plan: materializationPlan,
          checkpoint: {
            ...checkpoint,
            phase: 'draft_reconciled',
            publish_confirmation: 'absent'
          },
          document: context.plan.intent.document,
          observation: editor
        });
        coherentEditor = editor.page_revision === computeXArticlePageRevision(editorBody)
          && editor.execution_id === context.snapshot.execution_id
          && editor.account_handle === materializationPlan.target_account
          && editor.page_kind === 'article_editor'
          && editorPage.kind === 'article_editor'
          && editorPage.draft_id === context.snapshot.draft_id
          && (reconciliation.kind === 'exact'
            || reconciliation.kind === 'semantically_equivalent');
      } catch {
        coherentEditor = false;
      }
    }

    let previewCoherent = false;
    if (preview !== null) {
      try {
        const previewBody = Object.fromEntries(
          Object.entries(preview).filter(([key]) => key !== 'page_revision')
        );
        const previewPage = this.contract.detectPage(preview);
        const observedPreview = this.contract.detectPreview(preview);
        const expectedDocument = context.plan.intent.document;
        const actualDocument = {
          schema_version: '1.0' as const,
          title: observedPreview.title,
          cover_asset_id: observedPreview.visuals.find((visual) =>
            visual.kind === 'cover'
          )?.asset_id ?? null,
          blocks: observedPreview.blocks
        };
        const expectedVisuals = context.plan.intent.visuals.map((binding) => {
          const isCover = binding.placement.kind === 'cover';
          const blockOrdinal = isCover ? null : binding.placement.block_ordinal;
          return {
            asset_id: binding.asset.asset_id,
            kind: isCover ? 'cover' as const : 'inline' as const,
            block_ordinal: blockOrdinal,
            ref: isCover
              ? editor?.editor?.visuals.find((visual) => visual.kind === 'cover')?.ref ?? null
              : checkpoint.media.find((entry) => entry.block_ordinal === blockOrdinal)
                  ?.observed_media_ref ?? null,
            alt_text: isCover && this.contract.media_alt_capabilities.cover === 'unobservable'
              ? null
              : binding.asset.alt_text,
            status: 'uploaded' as const,
            owned_by_execution: true
          };
        });
        const observedVisuals = observedPreview.visuals.map((visual) => ({
          asset_id: visual.asset_id,
          kind: visual.kind,
          block_ordinal: visual.block_ordinal,
          ref: visual.ref,
          alt_text: visual.kind === 'cover'
            && this.contract.media_alt_capabilities.cover === 'unobservable'
            ? null
            : visual.alt_text,
          status: visual.status,
          owned_by_execution: visual.owned_by_execution
        }));
        previewCoherent = preview.page_revision === computeXArticlePageRevision(previewBody)
          && preview.execution_id === context.snapshot.execution_id
          && preview.account_handle === materializationPlan.target_account
          && preview.page_kind === 'article_preview'
          && previewPage.kind === 'article_preview'
          && observedPreview.draft_id === context.snapshot.draft_id
          && sha256(actualDocument) === sha256(expectedDocument)
          && sha256(observedVisuals) === sha256(expectedVisuals);
      } catch {
        previewCoherent = false;
      }
    }

    const phaseMatches =
      (checkpoint.publish_confirmation === 'absent'
        && (checkpoint.phase === 'draft_reconciled' || checkpoint.phase === 'preview_verified'))
      || (checkpoint.publish_confirmation === 'armed' && checkpoint.phase === 'human_confirmed')
      || (checkpoint.publish_confirmation === 'consumed' && checkpoint.phase === 'publish_submitted');
    const mediaRefs = checkpoint.media.map((entry) => entry.observed_media_ref);
    const contextPreviewMatches = preview !== null
      && context.preview_revision === preview.page_revision
      && (context.latest_observation?.observation_id !== preview.observation_id
        || sha256(context.latest_observation) === sha256(preview));
    const gateInvalid = context.execution_mode !== 'materialization_v3_2'
      || context.snapshot.draft_id === null
      || context.snapshot.execution_id !== materializationPlan.execution_id
      || checkpoint.execution_id !== context.snapshot.execution_id
      || checkpoint.draft_id !== context.snapshot.draft_id
      || checkpoint.materialization_digest !== materializationPlan.materialization_digest
      || !allowedConfirmationStates.includes(checkpoint.publish_confirmation)
      || !phaseMatches
      || checkpoint.body.status !== 'verified'
      || checkpoint.body.observed_digest !== materializationPlan.import_template_digest
      || checkpoint.media.length !== materializationPlan.visual_anchors.length
      || checkpoint.media.some((entry, index) =>
        entry.status !== 'completed'
        || entry.observed_media_ref === null
        || entry.observed_context_digest !== materializationPlan.visual_anchors[index]?.context_digest
        || entry.asset_id !== materializationPlan.visual_anchors[index]?.asset_id
        || entry.asset_digest !== materializationPlan.visual_anchors[index]?.asset_digest
      )
      || new Set(mediaRefs).size !== mediaRefs.length
      || checkpoint.last_editor_revision === null
      || context.editor_revision !== checkpoint.last_editor_revision
      || editor === null
      || !coherentEditor
      || editor.page_revision !== checkpoint.last_editor_revision
      || preview === null
      || !previewCoherent
      || !contextPreviewMatches;
    if (gateInvalid || preview === null) {
      throw new HarnessError(
        'PUBLISH_GATE_BLOCKED',
        'X Article Publish confirmation lacks coherent durable Preview and Editor evidence'
      );
    }
    return { materializationPlan, checkpoint, preview };
  }

  private async verifyStoredPublishConfirmation(
    context: AdapterContext,
    allowedConfirmationStates: readonly ('armed' | 'consumed')[]
  ): Promise<{
    readonly confirmation: XArticlePublishConfirmationV1;
    readonly evidence: Awaited<ReturnType<XArticleBrowserAdapter['assertPreparedConfirmationEvidence']>>;
  }> {
    const evidence = await this.assertPreparedConfirmationEvidence(
      context,
      allowedConfirmationStates
    );
    let confirmation: XArticlePublishConfirmationV1;
    try {
      confirmation = await this.store.readJson<XArticlePublishConfirmationV1>(
        this.publishConfirmationPath(context.snapshot.execution_id)
      );
    } catch (error) {
      throw new HarnessError(
        'PUBLISH_GATE_BLOCKED',
        'X Article Publish confirmation artifact is missing or unreadable',
        error
      );
    }
    verifyXArticlePublishConfirmation(confirmation, {
      execution_id: context.snapshot.execution_id,
      draft_id: context.snapshot.draft_id!,
      target_account: context.plan.intent.target_account,
      audience: 'everyone',
      plan_digest: context.plan.plan_digest as `sha256:${string}`,
      document_digest: evidence.materializationPlan.document_digest,
      preview_revision: evidence.preview.page_revision,
      asset_digests: context.plan.intent.visuals.map((item) => item.asset.digest),
      confirmed_at_not_before: evidence.preview.observed_at,
      confirmed_at_not_after: this.now().toISOString()
    });
    return { confirmation, evidence };
  }

  private async assertPreparedPublishReview(
    context: AdapterContext,
    observation: XArticleBrowserObservation
  ): Promise<XArticlePublishReviewObservation & { readonly final_publish_ref: string }> {
    let durable: XArticleBrowserObservation;
    try {
      durable = await this.store.readJson<XArticleBrowserObservation>(
        `${this.prefix(context.snapshot.execution_id)}/observations/${observation.observation_id}.json`
      );
    } catch (error) {
      throw new HarnessError('PUBLISH_GATE_BLOCKED', 'durable X Article Publish review is missing', error);
    }
    const body = Object.fromEntries(
      Object.entries(durable).filter(([key]) => key !== 'page_revision')
    );
    const review = this.contract.detectPublishReview(durable);
    if (
      sha256(durable) !== sha256(observation)
      || durable.page_revision !== computeXArticlePageRevision(body)
      || durable.execution_id !== context.snapshot.execution_id
      || durable.account_handle !== context.plan.intent.target_account
      || durable.page_kind !== 'publish_review'
      || review.draft_id !== context.snapshot.draft_id
      || review.audience !== 'everyone'
      || review.final_publish_ref === null
    ) {
      throw new HarnessError(
        'PUBLISH_GATE_BLOCKED',
        'X Article Publish review differs from the confirmed publication'
      );
    }
    return review as XArticlePublishReviewObservation & { readonly final_publish_ref: string };
  }

  private async claimPreparedPublish(
    context: AdapterContext,
    command: XArticleBrowserCommandV1
  ): Promise<XArticleCommandClaimV1> {
    if (
      context.snapshot.state === 'cancelled_before_publish'
      || (context.snapshot.state !== 'publish_armed'
        && context.snapshot.state !== 'publish_attempted')
    ) {
      throw new HarnessError(
        'COMMAND_REPLAY_REJECTED',
        'X Article Publish command is not armed for this execution'
      );
    }
    if (
      context.pending_command === null
      || sha256(context.pending_command) !== sha256(command)
      || command.execution_id !== context.snapshot.execution_id
      || command.run_id !== context.plan.run_id
      || command.draft_id !== context.snapshot.draft_id
      || command.kind !== 'publish_article_once'
      || command.purpose !== 'publish_article_once'
      || command.side_effect !== 'submit'
      || command.payload.kind !== 'publish_article_once'
    ) {
      throw new HarnessError(
        'COMMAND_REPLAY_REJECTED',
        'X Article Publish claim does not match the exact armed command'
      );
    }
    const verified = await this.verifyStoredPublishConfirmation(
      context,
      context.snapshot.state === 'publish_attempted' ? ['consumed'] : ['armed', 'consumed']
    );
    const review = await this.assertPreparedPublishReview(
      context,
      this.requireObservation(context)
    );
    if (
      command.expected_page_revision !== context.latest_observation?.page_revision
      || command.payload.target_ref !== review.final_publish_ref
    ) {
      throw new HarnessError(
        'COMMAND_REPLAY_REJECTED',
        'X Article Publish command is stale for the durable Publish review'
      );
    }

    const consumptionBody = {
      schema_version: 'x-article-publish-confirmation-consumption/v1' as const,
      execution_id: context.snapshot.execution_id,
      draft_id: context.snapshot.draft_id!,
      confirmation_id: verified.confirmation.confirmation_id,
      confirmation_digest: verified.confirmation.confirmation_digest,
      command_id: command.command_id,
      command_digest: sha256(command),
      consumed_at: this.now().toISOString()
    };
    const consumptionPath = this.publishConfirmationConsumptionPath(
      context.snapshot.execution_id
    );
    const consumptionExists = await this.store.exists(consumptionPath);
    const alreadyConsumed = context.snapshot.state === 'publish_attempted'
      || verified.evidence.checkpoint.publish_confirmation === 'consumed'
      || consumptionExists;
    if (alreadyConsumed) {
      const consumption = await this.readExactPublishConsumption(
        consumptionPath,
        consumptionBody
      );
      if (
        verified.evidence.checkpoint.publish_confirmation === 'consumed'
        && verified.evidence.checkpoint.updated_at !== consumption.consumed_at
      ) {
        throw new HarnessError(
          'CONTRACT_INVALID',
          'consumed X Article checkpoint differs from its confirmation consumption'
        );
      }
      if (verified.evidence.checkpoint.publish_confirmation === 'armed') {
        await this.consumePublishCheckpoint(
          context.snapshot.execution_id,
          verified.evidence.checkpoint,
          consumption.consumed_at
        );
      }
      if (context.snapshot.state === 'publish_attempted') {
        await this.broker.readExistingClaim(command);
        throw new HarnessError(
          'COMMAND_REPLAY_REJECTED',
          'X Article Publish command was already consumed'
        );
      }
      const recovered = await this.broker.claimOrRead(command);
      await this.transition(context, 'publish_attempted', 'article_publish_command_claimed', {
        publish_command_count: 1,
        submit_delivered: true
      });
      if (!recovered.created) {
        throw new HarnessError(
          'COMMAND_REPLAY_REJECTED',
          'X Article Publish command may already have been delivered'
        );
      }
      return recovered.claim;
    }

    const consumption: XArticlePublishConfirmationConsumptionV1 = {
      ...consumptionBody,
      consumption_digest: sha256(consumptionBody)
    };
    await this.store.writeNew(consumptionPath, consumption);
    await this.consumePublishCheckpoint(
      context.snapshot.execution_id,
      verified.evidence.checkpoint,
      consumption.consumed_at
    );

    const claim = await this.broker.claim(command);
    await this.transition(context, 'publish_attempted', 'article_publish_command_claimed', {
      publish_command_count: 1,
      submit_delivered: true
    });
    return claim;
  }

  private async readExactPublishConsumption(
    path: string,
    expectedBody: Omit<XArticlePublishConfirmationConsumptionV1, 'consumption_digest'>
  ): Promise<XArticlePublishConfirmationConsumptionV1> {
    const consumption = await this.store.readJson<XArticlePublishConfirmationConsumptionV1>(path);
    const { consumption_digest: persistedDigest, ...persistedBody } = consumption;
    const stablePersisted = { ...persistedBody, consumed_at: null };
    const stableExpected = { ...expectedBody, consumed_at: null };
    if (
      persistedDigest !== sha256(persistedBody)
      || !isDeepStrictEqual(stablePersisted, stableExpected)
      || !Number.isFinite(Date.parse(consumption.consumed_at))
    ) {
      throw new HarnessError(
        'CONTRACT_INVALID',
        'X Article Publish confirmation consumption changed or belongs to another command'
      );
    }
    return consumption;
  }

  private async consumePublishCheckpoint(
    executionId: string,
    checkpoint: XArticleMaterializationCheckpointV1,
    consumedAt: string
  ): Promise<void> {
    if (checkpoint.publish_confirmation === 'armed') {
      await this.materializationStore.updateCheckpoint(
        executionId,
        checkpoint.revision,
        (current) => {
          if (current.phase !== 'human_confirmed' || current.publish_confirmation !== 'armed') {
            throw new HarnessError(
              'ARTICLE_CHECKPOINT_CONFLICT',
              'X Article Publish confirmation checkpoint changed before consumption'
            );
          }
          return {
            ...current,
            phase: 'publish_submitted',
            publish_confirmation: 'consumed',
            updated_at: consumedAt
          };
        }
      );
    }
  }

  private initialSnapshot(
    executionId: string,
    plan: XArticlePublicationPlanV1,
    updatedAt = this.now().toISOString()
  ): XArticleExecutionSnapshotV1 {
    return {
      schema_version: '1.0', execution_id: executionId, run_id: plan.run_id,
      plan_id: plan.plan_id, state: 'created', sequence: 0, draft_id: null,
      attempt_id: null, publish_command_count: 0, latest_command_id: null,
      latest_observation_id: null, latest_receipt_path: null, updated_at: updatedAt
    };
  }

  private requireApproval(context: AdapterContext): XArticleApprovalV1 {
    if (context.approval === null) {
      throw new HarnessError('PUBLISH_GATE_BLOCKED', 'X Article Publish requires explicit approval');
    }
    return context.approval;
  }

  private requireObservation(context: AdapterContext): XArticleBrowserObservation {
    if (context.latest_observation === null) {
      throw new HarnessError('ARTICLE_PAGE_CONTRACT_UNSUPPORTED', 'X Article execution needs a fresh observation');
    }
    return context.latest_observation;
  }

  private async ensureFastPathResult(
    context: AdapterContext,
    suppliedCheckpoint?: XArticleMaterializationCheckpointV1,
    suppliedObservation?: XArticleBrowserObservation
  ): Promise<XArticleFastPathResultV1 | null> {
    const fastPath = context.fast_path;
    if (fastPath === null) return null;
    const executionId = context.snapshot.execution_id;
    const checkpoint = suppliedCheckpoint
      ?? await this.materializationStore.readCheckpoint(executionId);
    const observation = suppliedObservation ?? context.latest_observation;
    const editor = observation?.editor ?? null;
    const plan = await this.readBoundMaterializationPlan(context);
    const reconciliation = observation === null
      ? { kind: 'unverifiable' as const }
      : this.reconcileMaterializationDraft(
          plan,
          checkpoint,
          context.plan.intent.document,
          observation
        );
    const completeMedia = checkpoint.media.every((entry) =>
      entry.status === 'completed'
      && entry.observed_media_ref !== null
      && entry.observed_context_digest !== null
    );
    const coverBinding = context.plan.intent.visuals.find((binding) => binding.placement.kind === 'cover');
    const coverVisuals = editor?.visuals.filter((visual) => visual.kind === 'cover') ?? [];
    const cover = coverBinding === undefined || coverVisuals.length !== 1
      ? null
      : coverVisuals[0]!;
    const coverAlt = this.contract.media_alt_capabilities.cover === 'unobservable'
      ? 'unobservable' as const
      : 'verified' as const;
    const coverValid = coverBinding !== undefined
      && cover !== null
      && cover.asset_id === coverBinding.asset.asset_id
      && cover.status === 'uploaded'
      && cover.owned_by_execution
      && cover.ref.length > 0
      && (coverAlt === 'unobservable' || cover.alt_text === coverBinding.asset.alt_text);
    if (
      context.snapshot.state !== 'draft_reconciled'
      || context.snapshot.draft_id === null
      || checkpoint.phase !== 'draft_reconciled'
      || checkpoint.publish_confirmation !== 'absent'
      || !this.hasVerifiedMaterializationBody(checkpoint)
      || !completeMedia
      || observation === null
      || editor === null
      || editor.draft_id !== context.snapshot.draft_id
      || editor.title !== context.plan.intent.document.title
      || editor.import_state !== null
      || editor.has_unknown_content
      || editor.autosave_state !== 'saved'
      || !coverValid
      || (reconciliation.kind !== 'exact' && reconciliation.kind !== 'semantically_equivalent')
      || context.snapshot.publish_command_count !== 0
    ) {
      throw new HarnessError(
        'ARTICLE_CHECKPOINT_CONFLICT',
        'X Article Fast Path cannot create Result before the Draft is fully reconciled'
      );
    }

    const commandEntries = await this.store.list(`${this.prefix(executionId)}/commands`);
    let previewCommandCount = 0;
    let publishCommandCount = 0;
    for (const entry of commandEntries) {
      if (entry.kind !== 'directory') {
        throw new HarnessError('CONTRACT_INVALID', 'Fast Path command ledger contains a non-directory');
      }
      const command = validateContract<XArticleBrowserCommandV1>(
        'x-article-browser-command',
        await this.store.readJson<unknown>(`${entry.relative_path}/command.json`)
      );
      if (command.execution_id !== executionId || command.command_id !== entry.name) {
        throw new HarnessError('CONTRACT_INVALID', 'Fast Path command ledger identity changed');
      }
      if (command.kind === 'open_article_preview') previewCommandCount += 1;
      if (command.kind === 'publish_article_once') publishCommandCount += 1;
    }
    if (previewCommandCount !== 0 || publishCommandCount !== 0) {
      throw new HarnessError(
        'ARTICLE_CHECKPOINT_CONFLICT',
        'X Article Fast Path Result forbids Preview and Publish commands'
      );
    }

    const startEvidence = verifyXArticleMaterializationStartEvidence(
      await this.store.readJson<XArticleMaterializationStartEvidenceV1>(
        this.materializationStartPath(executionId)
      ),
      plan
    );
    const inlineCompleted = checkpoint.media.filter((entry) => entry.status === 'completed').length;
    const inlineAltVerified = checkpoint.media.filter((entry) =>
      entry.status === 'completed' && entry.observed_context_digest !== null
    ).length;
    const result = createXArticleFastPathResult({
      execution_id: executionId,
      draft_id: context.snapshot.draft_id,
      draft_url: `https://x.com/compose/articles/edit/${context.snapshot.draft_id}`,
      audit_digest: fastPath.audit_digest,
      materialization_digest: checkpoint.materialization_digest,
      final_revision: observation.page_revision,
      elapsed_seconds: computeXArticleElapsedSeconds(startEvidence.started_at, checkpoint.updated_at),
      cover: { expected: 1, completed: 1, alt: coverAlt },
      inline_images: { expected: checkpoint.media.length, completed: inlineCompleted },
      alt: {
        expected: context.plan.intent.visuals.length,
        verified: inlineAltVerified + (coverAlt === 'verified' ? 1 : 0)
      },
      recovery_count: fastPath.recovery_count,
      preview_command_count: 0,
      publish_command_count: 0,
      checkpoint_path: `${this.prefix(executionId)}/materialization-checkpoint.json`,
      completed_at: checkpoint.updated_at
    });
    await this.ensureExactArtifact(this.fastPathResultPath(executionId), result);
    await this.ensureFastPathCompletionProgress(result);
    return result;
  }

  private async ensureFastPathCompletionProgress(result: XArticleFastPathResultV1): Promise<void> {
    const stages = [
      'Fast Path: Draft ready',
      'Fast Path: Cover 1/1',
      `Fast Path: Inline images ${result.inline_images.completed}/${result.inline_images.expected}`,
      'Fast Path: Final check'
    ] as const;
    for (const stage of stages) {
      const expected = createXArticleStageProgress({
        execution_id: result.execution_id,
        stage,
        asset_id: null,
        elapsed_seconds: result.elapsed_seconds,
        waiting_for: null,
        retry_count: 0,
        observed_effect: 'complete',
        recorded_at: result.completed_at
      });
      const progress = await this.materializationStore.readProgress(result.execution_id);
      const existing = progress.find((entry) => entry.stage === stage);
      if (existing === undefined) {
        await this.materializationStore.appendProgress(expected);
      } else if (!isDeepStrictEqual(existing, expected)) {
        throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'Fast Path progress stage changed on retry');
      }
    }
  }

  private async readContext(executionId: string): Promise<AdapterContext> {
    this.assertId(executionId);
    return this.store.readJson<AdapterContext>(`${this.prefix(executionId)}/adapter-context.json`);
  }

  private async writeContext(context: AdapterContext): Promise<void> {
    await this.store.replaceAtomic(`${this.prefix(context.snapshot.execution_id)}/adapter-context.json`, context);
  }

  private prefix(executionId: string): string {
    this.assertId(executionId);
    return `runs/${executionId}/x-article/browser`;
  }

  private publishConfirmationPath(executionId: string): string {
    return `${this.prefix(executionId)}/publish-confirmation.json`;
  }

  private previewMaterializationReceiptPath(executionId: string): string {
    return `${this.prefix(executionId)}/materialization-receipt.json`;
  }

  private materializationStartPath(executionId: string): string {
    return `${this.prefix(executionId)}/materialization-start.json`;
  }

  private fastPathResultPath(executionId: string): string {
    return `${this.prefix(executionId)}/fast-path-result-v1.json`;
  }

  private publicMaterializationReceiptPath(executionId: string): string {
    return `${this.prefix(executionId)}/materialization-receipt-public.json`;
  }

  private publishConfirmationConsumptionPath(executionId: string): string {
    return `${this.prefix(executionId)}/publish-confirmation-consumption.json`;
  }

  private async ensureExactArtifact<T extends object | string>(path: string, expected: T): Promise<void> {
    if (await this.store.exists(path)) {
      const existing = await this.store.readJson<unknown>(path);
      if (!isDeepStrictEqual(existing, expected)) {
        throw new HarnessError(
          'ARTICLE_CHECKPOINT_CONFLICT',
          `prepared X Article artifact differs on retry: ${path}`
        );
      }
      return;
    }
    await this.store.writeNew(path, expected);
  }

  private withExecutionLock<T>(executionId: string, operation: () => Promise<T>): Promise<T> {
    this.assertId(executionId);
    return this.store.withLock(`runs/${executionId}/x-article/adapter-execution.lock`, operation);
  }

  private fastPathDeadline(
    context: AdapterContext,
    now?: string
  ): XArticleFastPathDeadlineEvaluation | null {
    if (context.fast_path === null) return null;
    return evaluateXArticleFastPathDeadline({
      started_at: context.fast_path.started_at,
      time_budget_seconds: context.fast_path.time_budget_seconds,
      now: now ?? this.now().toISOString()
    });
  }

  private commandPath(command: Pick<XArticleBrowserCommandV1, 'execution_id' | 'command_id'>): string {
    this.assertId(command.command_id);
    return `${this.prefix(command.execution_id)}/commands/${command.command_id}/command.json`;
  }

  private v3_3CommandIssueBindingPath(executionId: string, commandId: string): string {
    this.assertId(commandId);
    return `${this.prefix(executionId)}/command-issue-bindings/${commandId}.json`;
  }

  private reportProjectionPath(
    command: Pick<XArticleBrowserCommandV1, 'execution_id' | 'command_id'>
  ): string {
    this.assertId(command.command_id);
    return `${this.prefix(command.execution_id)}/report-projections/${command.command_id}.json`;
  }

  private assertId(id: string): void {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new HarnessError('WORKSPACE_PATH_INVALID', 'unsafe X Article execution identity');
  }
}
