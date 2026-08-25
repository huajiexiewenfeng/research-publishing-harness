import { sha256 } from './digest.js';
import type { ContainedArtifactInput } from './evidence-object-store.js';
import { HarnessError } from './errors.js';
import type { MaterializedSinglePublicationV1 } from './publication-bundle-types.js';
import { PublicationExpressionService } from './publication-expression-service.js';
import {
  assertClaimProjection,
  assertWeeklyResearchBridgeStatus,
  assertWeeklyResearchIncrementBinding,
  candidateClaimRef,
  createClaimProjection,
  createWeeklyResearchBridgeStatus,
  createWeeklyResearchIncrementBinding,
  incrementIdForOutcome,
  projectPackageClaimStatus
} from './research-bridge-contracts.js';
import type {
  ClaimProjectionV1,
  WeeklyResearchBridgeStatusV1,
  WeeklyResearchIncrementBindingV1
} from './research-bridge-types.js';
import { ResearchEvidenceService } from './research-evidence-service.js';
import { ResearchIncrementService } from './research-increment-service.js';
import { createResearchIncrementRevision } from './research-memory-contracts.js';
import type {
  PublicationExpressionV1,
  ResearchEvidenceSnapshotV1,
  ResearchIncrementRevisionV1
} from './research-memory-types.js';
import type {
  ResearchArtifactRefV1,
  ResearchRoadmapV1,
  ResearchTopicRevisionV1
} from './research-program-types.js';
import { validateContract } from './schema-validator.js';
import type { ResearchContentPackageV1_2 } from './types.js';
import {
  assertWeeklyOutcomeClosure,
  assertWeeklyPublicationOutcome
} from './weekly-outcome-contracts.js';
import type {
  WeeklyOutcomeClosureV1,
  WeeklyPublicationOutcomeV1
} from './weekly-outcome-types.js';
import type { WorkspaceStore } from './workspace-store.js';

const CYCLE_ID = /^[a-z0-9][a-z0-9_-]{0,95}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;

interface AssembleBridgeInput {
  readonly cycle_id: string;
  readonly workspace_identity_digest: `sha256:${string}`;
}

interface BridgeSources {
  readonly outcome: WeeklyPublicationOutcomeV1;
  readonly outcome_ref: ResearchArtifactRefV1;
  readonly package_value: ResearchContentPackageV1_2;
  readonly roadmap: ResearchRoadmapV1;
  readonly article_plan: Record<string, unknown>;
  readonly single_plan: Record<string, unknown>;
  readonly materialized_single: MaterializedSinglePublicationV1;
  readonly workspace_identity_digest: `sha256:${string}`;
}

function fail(code: ConstructorParameters<typeof HarnessError>[0], message: string): never {
  throw new HarnessError(code, message);
}

function exactRef(left: ResearchArtifactRefV1, right: ResearchArtifactRefV1): boolean {
  return left.path === right.path && left.digest === right.digest;
}

function withoutDigest<T extends object>(value: T, field: keyof T): Record<string, unknown> {
  const body = { ...value } as Record<string, unknown>;
  Reflect.deleteProperty(body, field as string);
  return body;
}

export class WeeklyResearchBridgeService {
  private readonly now: () => Date;

  constructor(
    private readonly store: WorkspaceStore,
    options: { readonly now?: () => Date } = {}
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async assemble(input: AssembleBridgeInput): Promise<WeeklyResearchBridgeStatusV1> {
    this.assertAssembleInput(input);
    const root = this.bridgeRoot(input.cycle_id);
    return this.store.withLock(`${root}/bridge.lock`, async () => {
      const sources = await this.readSources(input.cycle_id);
      if (sources.workspace_identity_digest !== input.workspace_identity_digest) {
        fail('APPROVAL_STALE', 'Workspace identity does not match the approved publication account');
      }
      return this.resumeUnlocked(input.cycle_id, sources);
    });
  }

  async resume(input: { readonly cycle_id: string }): Promise<WeeklyResearchBridgeStatusV1> {
    this.assertResumeInput(input);
    const root = this.bridgeRoot(input.cycle_id);
    return this.store.withLock(`${root}/bridge.lock`, async () => {
      const sources = await this.readSources(input.cycle_id);
      try {
        return await this.resumeUnlocked(input.cycle_id, sources);
      } catch (error) {
        await this.writeBlockedStatus(input.cycle_id, sources.outcome_ref, error);
        throw error;
      }
    });
  }

  async status(cycleId: string): Promise<WeeklyResearchBridgeStatusV1> {
    const root = this.bridgeRoot(cycleId);
    const sources = await this.readSources(cycleId);
    try {
      const projected = await this.deriveStatus(cycleId, sources.outcome_ref);
      if (await this.store.exists(`${root}/status.json`)) {
        const installed = await this.readBridgeStatus(cycleId);
        if (sha256(this.statusFacts(installed)) === sha256(this.statusFacts(projected))) {
          return installed;
        }
      }
      await this.store.replaceAtomic(`${root}/status.json`, projected);
      return projected;
    } catch (error) {
      return this.writeBlockedStatus(cycleId, sources.outcome_ref, error);
    }
  }

  private async resumeUnlocked(
    cycleId: string,
    sources: BridgeSources
  ): Promise<WeeklyResearchBridgeStatusV1> {
    const projection = await this.ensureClaimProjection(cycleId, sources);
    const incrementId = incrementIdForOutcome(sources.outcome);
    const initialEvidence = await this.ensureInitialEvidence(cycleId, incrementId, sources);
    const increment = await this.ensureIncrement(
      cycleId, incrementId, sources, projection, initialEvidence
    );
    const binding = await this.ensureBinding(cycleId, sources, increment);
    const articleExpression = await this.ensureExpression(
      'article', cycleId, sources, projection, binding, initialEvidence
    );
    await this.ensureTerminalEvidence(
      'article', cycleId, sources, binding, articleExpression
    );
    const singleExpression = await this.ensureExpression(
      'single', cycleId, sources, projection, binding, initialEvidence
    );
    await this.ensureTerminalEvidence(
      'single', cycleId, sources, binding, singleExpression
    );
    return this.status(cycleId);
  }

  private async readSources(cycleId: string): Promise<BridgeSources> {
    const weekRoot = this.weekRoot(cycleId);
    const outcomeArtifact = await this.store.readContainedArtifact(`${weekRoot}/outcome.json`);
    const outcome = validateContract<WeeklyPublicationOutcomeV1>(
      'weekly-publication-outcome', this.parse(outcomeArtifact.content, 'Weekly Outcome')
    );
    assertWeeklyPublicationOutcome(outcome);
    const outcomeRef = {
      path: outcomeArtifact.relative_path,
      digest: outcomeArtifact.digest
    } satisfies ResearchArtifactRefV1;

    const closure = await this.readContract<WeeklyOutcomeClosureV1>(
      `${weekRoot}/outcome-closure.json`, 'weekly-outcome-closure'
    );
    assertWeeklyOutcomeClosure(closure);
    if (!exactRef(closure.outcome_ref, outcomeRef)) {
      fail('APPROVAL_STALE', 'Weekly Outcome closure no longer binds the installed Outcome bytes');
    }

    const packageValue = await this.readContract<ResearchContentPackageV1_2>(
      outcome.research_content_package_ref.path, 'research-content-package'
    );
    if (packageValue.schema_version !== '1.2' || packageValue.status !== 'frozen' ||
        sha256(packageValue) !== outcome.research_content_package_ref.digest ||
        !exactRef(packageValue.research_program_binding.roadmap_ref, outcome.roadmap_ref) ||
        !exactRef(packageValue.research_program_binding.selection_ref, outcome.selection_ref)) {
      fail('APPROVAL_STALE', 'Research Package no longer matches the Weekly Outcome');
    }
    const selectedTopic = await this.readContract<ResearchTopicRevisionV1>(
      outcome.topic_ref.path, 'research-topic-revision'
    );
    if (selectedTopic.revision_digest !== outcome.topic_ref.digest ||
        selectedTopic.revision_digest !== sha256(withoutDigest(selectedTopic, 'revision_digest')) ||
        selectedTopic.previous_revision_ref === null ||
        !exactRef(
          selectedTopic.previous_revision_ref,
          packageValue.research_program_binding.topic_ref
        ) || selectedTopic.selection_ref === null ||
        !exactRef(selectedTopic.selection_ref, outcome.selection_ref)) {
      fail('APPROVAL_STALE', 'Selected Topic lineage no longer matches the Research Package');
    }
    const packageClaimRefs = packageValue.claims.map(
      (claim) => `package:${packageValue.package_id}:claim:${claim.claim_id}`
    );
    if (sha256(packageClaimRefs) !== sha256(outcome.package_claim_refs)) {
      fail('APPROVAL_STALE', 'Weekly Outcome Package Claim lineage is stale');
    }

    const roadmap = await this.readContract<ResearchRoadmapV1>(
      outcome.roadmap_ref.path, 'research-roadmap'
    );
    if (roadmap.roadmap_digest !== outcome.roadmap_ref.digest ||
        roadmap.roadmap_digest !== sha256(withoutDigest(roadmap, 'roadmap_digest'))) {
      fail('APPROVAL_STALE', 'Roadmap revision no longer matches the Weekly Outcome');
    }

    await this.assertSemanticRef(outcome.weekly_article_ref, 'Weekly Article ref');
    const articlePackage = await this.readSemanticRef<Record<string, unknown>>(
      outcome.article_package_ref, 'Canonical Article Package ref'
    );
    const articlePlan = await this.readFileRef<Record<string, unknown>>(
      outcome.article.plan_ref, 'X Article Plan'
    );
    const singlePlan = await this.readFileRef<Record<string, unknown>>(
      outcome.single.plan_ref, 'X Single Plan'
    );
    await this.readFileRef(outcome.article.receipt_ref, 'X Article Receipt');
    await this.readFileRef(outcome.single.receipt_ref, 'X Single Receipt');
    await this.readFileRef(outcome.bundle_receipt_ref, 'Publication Bundle Receipt');

    const articleIntent = articlePlan.intent as Record<string, unknown> | undefined;
    const articleIntentPackage = articleIntent?.article_package as Record<string, unknown> | undefined;
    if (articlePlan.schema_version !== '1.0' ||
        articleIntentPackage?.root !== articlePackage.root ||
        articleIntentPackage?.digest !== articlePackage.digest) {
      fail('APPROVAL_STALE', 'X Article Plan no longer binds the canonical Article Package');
    }

    const materialized = await this.readContract<MaterializedSinglePublicationV1>(
      `runs/${this.bundleId(outcome.bundle_receipt_ref.path)}/publication-bundle/materialized-single.json`,
      'materialized-single-publication'
    );
    if (materialized.materialization_digest !==
        sha256(withoutDigest(materialized, 'materialization_digest')) ||
        sha256(materialized.child_plan) !== sha256(singlePlan) ||
        !Array.isArray(singlePlan.items) || singlePlan.items.length !== 1 ||
        (singlePlan.items[0] as Record<string, unknown>).text !== materialized.final_text) {
      fail('APPROVAL_STALE', 'Materialized Single no longer matches its approved child Plan');
    }
    const account = (articlePlan.intent as Record<string, unknown>).target_account;
    if (typeof account !== 'string') fail('CONTRACT_INVALID', 'X Article account is invalid');
    const workspaceIdentityDigest = sha256({ profile: 'research-publishing', account });
    return {
      outcome,
      outcome_ref: outcomeRef,
      package_value: packageValue,
      roadmap,
      article_plan: articlePlan,
      single_plan: singlePlan,
      materialized_single: materialized,
      workspace_identity_digest: workspaceIdentityDigest
    };
  }

  private async ensureClaimProjection(
    cycleId: string,
    sources: BridgeSources
  ): Promise<ClaimProjectionV1> {
    const path = `${this.bridgeRoot(cycleId)}/claim-projection.json`;
    const projectionId = `projection_${cycleId}`;
    const evidenceIds = new Set(sources.package_value.evidence.map((item) => item.evidence_id));
    const expected = createClaimProjection({
      projection_id: projectionId,
      outcome_ref: sources.outcome_ref,
      package_ref: sources.outcome.research_content_package_ref,
      items: sources.package_value.claims.map((claim) => {
        for (const evidenceId of claim.evidence_refs) {
          if (!evidenceIds.has(evidenceId)) {
            fail('APPROVAL_STALE', `Package Claim ${claim.claim_id} has unresolved Evidence`);
          }
        }
        return {
          source_claim_ref: `package:${sources.package_value.package_id}:claim:${claim.claim_id}`,
          source_claim_id: claim.claim_id,
          statement_digest: sha256(claim.statement),
          source_status: claim.claim_status,
          candidate_claim_ref: candidateClaimRef(projectionId, claim.claim_id),
          candidate_status: projectPackageClaimStatus(claim.claim_status),
          evidence_refs: claim.evidence_refs.map(
            (id) => `package:${sources.package_value.package_id}:evidence:${id}`
          ),
          projection_rule: 'package-to-memory-claim/v1',
          loss_note: 'Candidate status preserves or weakens Package evidence; it is not accepted semantic truth.'
        };
      }),
      projected_at: sources.outcome.issued_at
    });
    if (!await this.store.exists(path)) {
      await this.store.writeNew(path, expected);
      return expected;
    }
    const installed = await this.readContract<ClaimProjectionV1>(path, 'claim-projection');
    assertClaimProjection(installed);
    if (installed.projection_digest !== expected.projection_digest) {
      fail('APPROVAL_STALE', 'Installed Claim Projection differs from the exact Package projection');
    }
    return installed;
  }

  private async ensureInitialEvidence(
    cycleId: string,
    incrementId: string,
    sources: BridgeSources
  ): Promise<ResearchEvidenceSnapshotV1> {
    const id = `evidence_${cycleId}_research_package`;
    const projectionPath = `${this.bridgeRoot(cycleId)}/claim-projection.json`;
    const artifacts: readonly ContainedArtifactInput[] = [
      this.artifact(sources.outcome.research_content_package_ref.path, 'research_package', 'application/json', 'internal'),
      this.artifact(projectionPath, 'claim_map', 'application/json', 'internal'),
      this.artifact(sources.outcome_ref.path, 'lineage', 'application/json', 'internal')
    ];
    const sourceRefs = sources.package_value.sources.map(
      (source) => `package:${sources.package_value.package_id}:source:${source.source_id}`
    );
    return this.ensureEvidence(id, {
      increment_id: incrementId,
      increment_revision: 1,
      capture_event: 'research_package_finalized',
      capture_kind: 'automatic_terminal',
      workspace_identity_digest: sources.workspace_identity_digest,
      artifacts,
      source_refs: sourceRefs,
      privacy_classification: 'internal'
    });
  }

  private async ensureIncrement(
    cycleId: string,
    incrementId: string,
    sources: BridgeSources,
    projection: ClaimProjectionV1,
    evidence: ResearchEvidenceSnapshotV1
  ): Promise<ResearchIncrementRevisionV1> {
    const path = `memory/increments/${incrementId}/revisions/1/revision.json`;
    const input = {
      increment_id: incrementId,
      revision: 1,
      track_id: sources.roadmap.primary_track_id,
      title: sources.package_value.topic,
      research_question: sources.package_value.research_question,
      thesis: sources.package_value.thesis.summary,
      summary: `Weekly publication outcome ${sources.outcome.outcome_id}`,
      document_manifest_refs: [sources.outcome.article_package_ref.path],
      tags: [...sources.outcome.research_stream_ids],
      claim_refs: projection.items.map((item) => item.candidate_claim_ref),
      decision_refs: [],
      boundary_refs: [...sources.outcome.package_boundary_refs],
      open_question_refs: [...sources.outcome.package_open_question_refs],
      source_refs: sources.package_value.sources.map(
        (source) => `package:${sources.package_value.package_id}:source:${source.source_id}`
      ),
      evidence_snapshot_refs: [`evidence:${evidence.evidence_snapshot_id}`],
      predecessor_refs: [],
      created_at: sources.outcome.issued_at
    } as const;
    if (!await this.store.exists(path)) {
      return new ResearchIncrementService(this.store, {
        lifecycleEventId: () => `event_${cycleId}_working`,
        now: () => new Date(sources.outcome.issued_at)
      }).assemble(input);
    }
    const installed = await this.readContract<ResearchIncrementRevisionV1>(
      path, 'research-increment-revision'
    );
    const expected = createResearchIncrementRevision(input);
    if (installed.content_digest !== expected.content_digest) {
      fail('APPROVAL_STALE', 'Installed Research Increment differs from the exact Weekly Outcome');
    }
    const status = await new ResearchIncrementService(this.store).status(incrementId);
    if (status.track_id !== sources.roadmap.primary_track_id ||
        status.latest_revision !== 1 || status.state !== 'working') {
      fail('APPROVAL_STALE', 'Research Increment status is stale');
    }
    return installed;
  }

  private async ensureBinding(
    cycleId: string,
    sources: BridgeSources,
    increment: ResearchIncrementRevisionV1
  ): Promise<WeeklyResearchIncrementBindingV1> {
    const root = this.bridgeRoot(cycleId);
    const path = `${root}/increment-binding.json`;
    const expected = createWeeklyResearchIncrementBinding({
      cycle_id: cycleId,
      outcome_ref: sources.outcome_ref,
      claim_projection_ref: await this.fileRef(`${root}/claim-projection.json`),
      track_id: increment.track_id,
      increment_id: increment.increment_id,
      increment_ref: `increment:${increment.track_id}:${increment.increment_id}@1`,
      increment_revision_ref: await this.fileRef(
        `memory/increments/${increment.increment_id}/revisions/1/revision.json`
      ),
      bound_at: sources.outcome.issued_at
    });
    if (!await this.store.exists(path)) {
      await this.store.writeNew(path, expected);
      return expected;
    }
    const installed = await this.readContract<WeeklyResearchIncrementBindingV1>(
      path, 'weekly-research-increment-binding'
    );
    assertWeeklyResearchIncrementBinding(installed);
    if (installed.binding_digest !== expected.binding_digest) {
      fail('APPROVAL_STALE', 'Installed Increment Binding differs from the exact Increment bytes');
    }
    return installed;
  }

  private async ensureExpression(
    kind: 'article' | 'single',
    cycleId: string,
    sources: BridgeSources,
    projection: ClaimProjectionV1,
    binding: WeeklyResearchIncrementBindingV1,
    initialEvidence: ResearchEvidenceSnapshotV1
  ): Promise<PublicationExpressionV1> {
    const root = this.bridgeRoot(cycleId);
    const path = `${root}/${kind}-expression.json`;
    const child = kind === 'article' ? sources.outcome.article : sources.outcome.single;
    const plan = kind === 'article' ? sources.article_plan : sources.single_plan;
    const planKind = kind === 'article'
      ? 'x_article' as const
      : plan.schema_version === '2.1' ? 'x_v2_1' as const : 'x_v2' as const;
    const content = kind === 'article'
      ? await this.articleContent(sources.article_plan)
      : await this.singleContent(cycleId, sources.materialized_single.final_text);
    const statuses = Object.fromEntries(
      projection.items.map((item) => [item.candidate_claim_ref, item.candidate_status])
    );
    const expected = await new PublicationExpressionService(this.store).assemble({
      expression_id: `${binding.increment_id}_${kind === 'article' ? 'x_article' : 'x_single'}`,
      increment_ref: binding.increment_ref,
      channel: kind === 'article' ? 'x_article' : 'x_single',
      language: 'en',
      derivation_type: kind === 'article' ? 'original' : 'compression',
      claim_refs: projection.items.map((item) => item.candidate_claim_ref),
      visual_refs: this.visualRefs(plan, kind),
      evidence_snapshot_refs: [`evidence:${initialEvidence.evidence_snapshot_id}`],
      intent: {
        kind: planKind,
        path: child.plan_ref.path,
        digest: child.plan_ref.digest,
        content_path: content.path,
        content_digest: content.digest,
        privacy_classification: 'public'
      },
      receipt: {
        kind: planKind,
        path: child.receipt_ref.path,
        digest: child.receipt_ref.digest,
        privacy_classification: 'public'
      },
      source_claim_statuses: statuses,
      expression_claim_statuses: statuses,
      target_privacy_classification: 'public'
    });
    if (!await this.store.exists(path)) {
      await this.store.writeNew(path, expected);
      return expected;
    }
    const installed = await this.readContract<PublicationExpressionV1>(
      path, 'publication-expression'
    );
    if (installed.expression_digest !== sha256(withoutDigest(installed, 'expression_digest')) ||
        installed.expression_digest !== expected.expression_digest) {
      fail('APPROVAL_STALE', `Installed ${kind} Expression is stale`);
    }
    return installed;
  }

  private async ensureTerminalEvidence(
    kind: 'article' | 'single',
    cycleId: string,
    sources: BridgeSources,
    binding: WeeklyResearchIncrementBindingV1,
    expression: PublicationExpressionV1
  ): Promise<ResearchEvidenceSnapshotV1> {
    const child = kind === 'article' ? sources.outcome.article : sources.outcome.single;
    return this.ensureEvidence(`evidence_${cycleId}_${kind}_terminal`, {
      increment_id: binding.increment_id,
      increment_revision: 1,
      capture_event: 'publication_receipt_terminal',
      capture_kind: 'automatic_terminal',
      workspace_identity_digest: sources.workspace_identity_digest,
      artifacts: [
        this.artifact(child.receipt_ref.path, 'publication_receipt', 'application/json', 'public'),
        this.artifact(
          `${this.bridgeRoot(cycleId)}/${kind}-expression.json`,
          'publication_expression', 'application/json', 'public'
        )
      ],
      source_refs: [expression.publication_receipt_ref ?? `receipt:${child.receipt_ref.path}`],
      privacy_classification: 'public'
    });
  }

  private async ensureEvidence(
    id: string,
    input: Parameters<ResearchEvidenceService['capture']>[0]
  ): Promise<ResearchEvidenceSnapshotV1> {
    const path = `memory/evidence/snapshots/${id}/manifest.json`;
    const service = new ResearchEvidenceService(this.store, {
      evidenceSnapshotId: () => id,
      now: this.now
    });
    if (!await this.store.exists(path)) return service.capture(input);
    await service.status(id);
    const installed = await this.readContract<ResearchEvidenceSnapshotV1>(
      path, 'research-evidence-snapshot'
    );
    const expectedArtifacts = await Promise.all(input.artifacts.map(async (artifact) => {
      const source = await this.store.readContainedArtifact(artifact.workspace_relative_path);
      return {
        role: artifact.role,
        workspace_relative_path: source.relative_path,
        digest: source.digest,
        media_type: artifact.media_type,
        byte_size: source.bytes,
        canonical: artifact.canonical,
        privacy_classification: artifact.privacy_classification
      };
    }));
    const installedArtifacts = installed.artifact_refs.map((artifact) => ({
      role: artifact.role,
      workspace_relative_path: artifact.workspace_relative_path,
      digest: artifact.digest,
      media_type: artifact.media_type,
      byte_size: artifact.byte_size,
      canonical: artifact.canonical,
      privacy_classification: artifact.privacy_classification
    }));
    if (installed.increment_id !== input.increment_id ||
        installed.increment_revision !== input.increment_revision ||
        installed.capture_event !== input.capture_event ||
        installed.capture_kind !== input.capture_kind ||
        installed.workspace_identity_digest !== input.workspace_identity_digest ||
        installed.privacy_classification !== input.privacy_classification ||
        sha256(installed.source_refs) !== sha256(input.source_refs) ||
        sha256(installedArtifacts) !== sha256(expectedArtifacts)) {
      fail('APPROVAL_STALE', `Installed Evidence Snapshot ${id} has stale lineage`);
    }
    return installed;
  }

  private async deriveStatus(
    cycleId: string,
    outcomeRef: ResearchArtifactRefV1
  ): Promise<WeeklyResearchBridgeStatusV1> {
    const root = this.bridgeRoot(cycleId);
    const projectionRef = await this.optionalValidatedRef(
      `${root}/claim-projection.json`, 'claim-projection', assertClaimProjection
    );
    const bindingRef = await this.optionalValidatedRef(
      `${root}/increment-binding.json`,
      'weekly-research-increment-binding',
      assertWeeklyResearchIncrementBinding
    );
    const articleExpressionRef = await this.optionalExpressionRef(`${root}/article-expression.json`);
    const singleExpressionRef = await this.optionalExpressionRef(`${root}/single-expression.json`);
    const articleEvidenceRef = await this.optionalEvidenceRef(`evidence_${cycleId}_article_terminal`);
    const singleEvidenceRef = await this.optionalEvidenceRef(`evidence_${cycleId}_single_terminal`);
    const values = [
      projectionRef, bindingRef, articleExpressionRef, articleEvidenceRef,
      singleExpressionRef, singleEvidenceRef
    ];
    const complete = values.every((value) => value !== null);
    const pending = values.every((value) => value === null);
    return createWeeklyResearchBridgeStatus({
      cycle_id: cycleId,
      phase: complete ? 'complete' : pending ? 'pending' : 'in_progress',
      outcome_ref: outcomeRef,
      claim_projection_ref: projectionRef,
      increment_binding_ref: bindingRef,
      article_expression_ref: articleExpressionRef,
      article_evidence_ref: articleEvidenceRef,
      single_expression_ref: singleExpressionRef,
      single_evidence_ref: singleEvidenceRef,
      blocked_reason: null,
      updated_at: this.now().toISOString()
    });
  }

  private async writeBlockedStatus(
    cycleId: string,
    outcomeRef: ResearchArtifactRefV1,
    error: unknown
  ): Promise<WeeklyResearchBridgeStatusV1> {
    const message = error instanceof Error ? error.message : 'unknown Research Bridge failure';
    const root = this.bridgeRoot(cycleId);
    const value = createWeeklyResearchBridgeStatus({
      cycle_id: cycleId,
      phase: 'blocked',
      outcome_ref: outcomeRef,
      claim_projection_ref: await this.fileRefIfExists(`${root}/claim-projection.json`),
      increment_binding_ref: await this.fileRefIfExists(`${root}/increment-binding.json`),
      article_expression_ref: await this.fileRefIfExists(`${root}/article-expression.json`),
      article_evidence_ref: await this.evidenceRefIfExists(`evidence_${cycleId}_article_terminal`),
      single_expression_ref: await this.fileRefIfExists(`${root}/single-expression.json`),
      single_evidence_ref: await this.evidenceRefIfExists(`evidence_${cycleId}_single_terminal`),
      blocked_reason: message,
      updated_at: this.now().toISOString()
    });
    await this.store.replaceAtomic(`${root}/status.json`, value);
    return value;
  }

  private async optionalValidatedRef<T>(
    path: string,
    contract: Parameters<typeof validateContract>[0],
    assertion: (value: T) => void
  ): Promise<ResearchArtifactRefV1 | null> {
    if (!await this.store.exists(path)) return null;
    const value = await this.readContract<T>(path, contract);
    assertion(value);
    return this.fileRef(path);
  }

  private async optionalExpressionRef(path: string): Promise<ResearchArtifactRefV1 | null> {
    if (!await this.store.exists(path)) return null;
    const value = await this.readContract<PublicationExpressionV1>(path, 'publication-expression');
    if (value.expression_digest !== sha256(withoutDigest(value, 'expression_digest'))) {
      fail('APPROVAL_STALE', 'Publication Expression digest mismatch');
    }
    return this.fileRef(path);
  }

  private async optionalEvidenceRef(id: string): Promise<string | null> {
    const path = `memory/evidence/snapshots/${id}/manifest.json`;
    if (!await this.store.exists(path)) return null;
    await new ResearchEvidenceService(this.store).status(id);
    return `evidence:${id}`;
  }

  private async readBridgeStatus(cycleId: string): Promise<WeeklyResearchBridgeStatusV1> {
    const value = await this.readContract<WeeklyResearchBridgeStatusV1>(
      `${this.bridgeRoot(cycleId)}/status.json`, 'weekly-research-bridge-status'
    );
    assertWeeklyResearchBridgeStatus(value);
    return value;
  }

  private statusFacts(value: WeeklyResearchBridgeStatusV1): Record<string, unknown> {
    const {
      updated_at: _updatedAt,
      projection_digest: _projectionDigest,
      ...facts
    } = value;
    void _updatedAt;
    void _projectionDigest;
    return facts;
  }

  private async articleContent(plan: Record<string, unknown>): Promise<ResearchArtifactRefV1> {
    const intent = plan.intent as Record<string, unknown>;
    const articlePackage = intent.article_package as Record<string, unknown>;
    if (typeof articlePackage.root !== 'string') {
      fail('CONTRACT_INVALID', 'X Article Package root is invalid');
    }
    return this.fileRef(`${articlePackage.root}/article.md`);
  }

  private async singleContent(cycleId: string, text: string): Promise<ResearchArtifactRefV1> {
    const path = `${this.bridgeRoot(cycleId)}/x-single.txt`;
    if (!await this.store.exists(path)) await this.store.writeNew(path, text);
    const installed = await this.store.readText(path);
    if (installed !== text) fail('APPROVAL_STALE', 'Materialized X Single text is stale');
    return this.fileRef(path);
  }

  private visualRefs(plan: Record<string, unknown>, kind: 'article' | 'single'): readonly string[] {
    if (kind === 'article') {
      const intent = plan.intent as Record<string, unknown>;
      const visuals = Array.isArray(intent.visuals) ? intent.visuals : [];
      return visuals.map((value) => {
        const asset = (value as Record<string, unknown>).asset as Record<string, unknown>;
        return asset.asset_id as string;
      });
    }
    if (plan.schema_version !== '2.1') return [];
    const items = plan.items as Array<Record<string, unknown>>;
    return items.flatMap((item) => (item.attachments as Array<Record<string, unknown>>)
      .map((asset) => asset.asset_id as string));
  }

  private artifact(
    workspaceRelativePath: string,
    role: ContainedArtifactInput['role'],
    mediaType: string,
    privacy: ContainedArtifactInput['privacy_classification']
  ): ContainedArtifactInput {
    return {
      workspace_relative_path: workspaceRelativePath,
      role,
      media_type: mediaType,
      canonical: true,
      privacy_classification: privacy
    };
  }

  private async readSemanticRef<T extends object>(
    ref: ResearchArtifactRefV1,
    label: string
  ): Promise<T> {
    const value = await this.readJson<T>(ref.path, label);
    if (sha256(value) !== ref.digest) fail('APPROVAL_STALE', `${label} digest is stale`);
    return value;
  }

  private async assertSemanticRef(ref: ResearchArtifactRefV1, label: string): Promise<void> {
    await this.readSemanticRef(ref, label);
  }

  private async readFileRef<T = unknown>(ref: ResearchArtifactRefV1, label: string): Promise<T> {
    const artifact = await this.store.readContainedArtifact(ref.path);
    if (artifact.digest !== ref.digest) fail('APPROVAL_STALE', `${label} digest is stale`);
    return this.parse(artifact.content, label) as T;
  }

  private async readContract<T>(
    path: string,
    contract: Parameters<typeof validateContract>[0]
  ): Promise<T> {
    return validateContract<T>(contract, await this.readJson(path, contract));
  }

  private async readJson<T>(path: string, label: string): Promise<T> {
    const artifact = await this.store.readContainedArtifact(path);
    return this.parse(artifact.content, label) as T;
  }

  private parse(bytes: Uint8Array, label: string): unknown {
    try {
      return JSON.parse(Buffer.from(bytes).toString('utf8'));
    } catch {
      fail('CONTRACT_INVALID', `${label} is not valid JSON`);
    }
  }

  private async fileRef(path: string): Promise<ResearchArtifactRefV1> {
    const artifact = await this.store.readContainedArtifact(path);
    return { path: artifact.relative_path, digest: artifact.digest };
  }

  private async fileRefIfExists(path: string): Promise<ResearchArtifactRefV1 | null> {
    return await this.store.exists(path) ? this.fileRef(path) : null;
  }

  private async evidenceRefIfExists(id: string): Promise<string | null> {
    return await this.store.exists(`memory/evidence/snapshots/${id}/manifest.json`)
      ? `evidence:${id}` : null;
  }

  private assertAssembleInput(input: AssembleBridgeInput): void {
    const value = input as unknown as Record<string, unknown>;
    if (Object.keys(value).length !== 2 || typeof value.cycle_id !== 'string' ||
        typeof value.workspace_identity_digest !== 'string' ||
        !DIGEST.test(value.workspace_identity_digest)) {
      fail('CONTRACT_INVALID', 'Bridge assemble accepts only Cycle id and Workspace identity digest');
    }
    this.bridgeRoot(value.cycle_id);
  }

  private assertResumeInput(input: { readonly cycle_id: string }): void {
    const value = input as unknown as Record<string, unknown>;
    if (Object.keys(value).length !== 1 || typeof value.cycle_id !== 'string') {
      fail('CONTRACT_INVALID', 'Bridge resume accepts only cycle_id');
    }
    this.bridgeRoot(value.cycle_id);
  }

  private weekRoot(cycleId: string): string {
    if (!CYCLE_ID.test(cycleId)) fail('CONTRACT_INVALID', 'Weekly Cycle id is invalid');
    return `program/weeks/${cycleId}`;
  }

  private bridgeRoot(cycleId: string): string {
    return `${this.weekRoot(cycleId)}/research-bridge`;
  }

  private bundleId(path: string): string {
    const match = /^runs\/([a-z0-9][a-z0-9_-]{0,95})\/publication-bundle\/receipt\.json$/.exec(path);
    if (match === null) fail('APPROVAL_STALE', 'Publication Bundle Receipt path is not canonical');
    return match[1]!;
  }
}
