import {
  assertPublicationBundleApproval,
  assertPublicationBundlePlan,
  createPublicationBundleReceipt
} from './publication-bundle-contracts.js';
import type {
  PublicationBundleApprovalV1,
  PublicationBundlePlanV1,
  PublicationBundleReceiptV1
} from './publication-bundle-types.js';
import { VersionedPublicationEvidenceReader } from './publication-evidence-reader.js';
import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import type { ResearchBacklogService } from './research-backlog-service.js';
import {
  createWeeklyPublicationBundleBinding,
  createWeeklyTopicSelection
} from './research-program-contracts.js';
import type {
  ResearchArtifactRefV1,
  ResearchTopicRevisionV1,
  WeeklyCandidateSetV1,
  WeeklyPublicationBundleBindingV1,
  WeeklyResearchCycleV1,
  WeeklyTopicSelectionV1
} from './research-program-types.js';
import type { ResearchRoadmapService } from './research-roadmap-service.js';
import { validateContract } from './schema-validator.js';
import type { ResearchContentPackageV1_2 } from './types.js';
import type { WeeklyResearchCycleService } from './weekly-research-cycle-service.js';
import {
  assertWeeklyOutcomeClosure,
  assertWeeklyPublicationOutcome,
  createWeeklyOutcomeClosure,
  createWeeklyOutcomeStatus,
  createWeeklyPublicationOutcome,
  outcomeReleaseReason
} from './weekly-outcome-contracts.js';
import type {
  AssembleWeeklyOutcomeInput,
  ResumeWeeklyOutcomeInput,
  WeeklyOutcomeClosureV1,
  WeeklyOutcomeStatusV1,
  WeeklyPublicationOutcomeV1
} from './weekly-outcome-types.js';
import type { WorkspaceStore } from './workspace-store.js';

const CYCLE_ID = /^[a-z0-9][a-z0-9_-]*$/;

function fail(
  code: 'CONTRACT_INVALID' | 'STATE_TRANSITION_INVALID' | 'APPROVAL_STALE',
  message: string
): never {
  throw new HarnessError(code, message);
}

function exactRef(left: ResearchArtifactRefV1, right: ResearchArtifactRefV1): boolean {
  return left.path === right.path && left.digest === right.digest;
}

function omit<T extends object>(value: T, fields: readonly string[]): Record<string, unknown> {
  const body = { ...value } as Record<string, unknown>;
  for (const field of fields) delete body[field];
  return body;
}

export class WeeklyOutcomeService {
  private readonly now: () => Date;
  private readonly evidence: VersionedPublicationEvidenceReader;

  constructor(
    private readonly store: WorkspaceStore,
    private readonly roadmaps: ResearchRoadmapService,
    private readonly backlog: ResearchBacklogService,
    private readonly weeks: WeeklyResearchCycleService,
    options: { readonly now?: () => Date } = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.evidence = new VersionedPublicationEvidenceReader(store);
  }

  async assemble(input: AssembleWeeklyOutcomeInput): Promise<WeeklyPublicationOutcomeV1> {
    this.assertOnlyCycleId(input);
    const root = this.cycleRoot(input.cycle_id);
    return this.store.withLock(`${root}/outcome.lock`, async () => {
      const path = `${root}/outcome.json`;
      if (await this.store.exists(path)) {
        const installed = await this.readOutcome(input.cycle_id);
        await this.resumeUnlocked(installed);
        return installed;
      }
      const sources = await this.readSources(input.cycle_id);
      const article = await this.readChildObservation(sources.receipt.article, 'x_article');
      const singlePlan = await this.readJson<Record<string, unknown>>(
        sources.receipt.single.plan_ref.path
      );
      const singleKind = singlePlan.schema_version === '2.1' ? 'x_v2_1' : 'x_v2';
      const single = await this.readChildObservation(sources.receipt.single, singleKind);
      const currentTopic = await this.currentSelectedTopic(sources);
      if (currentTopic.availability !== 'reserved') {
        fail('STATE_TRANSITION_INVALID', 'Weekly Outcome requires the selected Topic to remain reserved');
      }
      const outcome = createWeeklyPublicationOutcome({
        outcome_id: `${input.cycle_id}_outcome`,
        cycle_ref: sources.binding.cycle_ref,
        roadmap_ref: sources.cycle.roadmap_ref,
        topic_ref: this.topicRef(currentTopic),
        selection_ref: sources.binding.selection_ref,
        research_content_package_ref: sources.binding.research_content_package_ref,
        weekly_article_ref: sources.binding.weekly_article_ref,
        article_package_ref: sources.binding.article_package_ref,
        bundle_plan_ref: sources.receipt.bundle_plan_ref,
        bundle_approval_ref: sources.receipt.bundle_approval_ref,
        bundle_receipt_ref: await this.fileRef(
          `runs/${sources.receipt.bundle_id}/publication-bundle/receipt.json`
        ),
        article,
        single,
        research_stream_ids: sources.selected.stream_ids,
        package_claim_refs: sources.packageValue.claims.map(
          (claim) => `package:${sources.packageValue.package_id}:claim:${claim.claim_id}`
        ),
        package_evidence_refs: sources.packageValue.evidence.map(
          (evidenceItem) => `package:${sources.packageValue.package_id}:evidence:${evidenceItem.evidence_id}`
        ),
        package_boundary_refs: Object.entries(sources.packageValue.boundaries).flatMap(
          ([kind, values]) => values.map(
            (_value, index) => `package:${sources.packageValue.package_id}:boundary:${kind}:${index}`
          )
        ),
        package_open_question_refs: sources.packageValue.open_questions.map(
          (_question, index) => `package:${sources.packageValue.package_id}:open-question:${index}`
        ),
        issued_at: sources.receipt.issued_at
      });
      await this.store.writeNew(path, outcome);
      const installed = await this.readOutcome(input.cycle_id);
      await this.resumeUnlocked(installed);
      return installed;
    });
  }

  async resume(input: ResumeWeeklyOutcomeInput): Promise<WeeklyOutcomeStatusV1> {
    this.assertOnlyCycleId(input);
    const root = this.cycleRoot(input.cycle_id);
    return this.store.withLock(`${root}/outcome.lock`, async () => {
      const outcome = await this.readOutcome(input.cycle_id);
      return this.resumeUnlocked(outcome);
    });
  }

  async status(cycleId: string): Promise<WeeklyOutcomeStatusV1> {
    const root = this.cycleRoot(cycleId);
    if (!await this.store.exists(`${root}/outcome.json`)) {
      return createWeeklyOutcomeStatus({
        cycle_id: cycleId, phase: 'pending', outcome_ref: null,
        released_topic_ref: null, blocked_reason: null, updated_at: this.now().toISOString()
      });
    }
    const outcome = await this.readOutcome(cycleId);
    if (!await this.store.exists(`${root}/outcome-closure.json`)) {
      return createWeeklyOutcomeStatus({
        cycle_id: cycleId, phase: 'conflict', outcome_ref: await this.fileRef(`${root}/outcome.json`),
        released_topic_ref: null, blocked_reason: 'Weekly Outcome closure is incomplete',
        updated_at: outcome.issued_at
      });
    }
    const closure = await this.readClosure(cycleId);
    await this.assertClosureLineage(cycleId, outcome, closure);
    const projected = createWeeklyOutcomeStatus({
      cycle_id: cycleId, phase: 'complete', outcome_ref: closure.outcome_ref,
      released_topic_ref: closure.released_topic_ref, blocked_reason: null,
      updated_at: closure.closed_at
    });
    await this.store.replaceAtomic(`${root}/outcome-status.json`, projected);
    return projected;
  }

  private async resumeUnlocked(outcome: WeeklyPublicationOutcomeV1): Promise<WeeklyOutcomeStatusV1> {
    const cycleId = this.cycleId(outcome.cycle_ref.path);
    const root = this.cycleRoot(cycleId);
    const reason = outcomeReleaseReason(outcome);
    const roadmapId = this.roadmapId(outcome.roadmap_ref.path);
    const topicId = this.topicId(outcome.topic_ref.path);
    const catalog = await this.backlog.catalog(roadmapId);
    const currentEntry = catalog.entries.find((entry) => entry.topic_id === topicId);
    if (currentEntry === undefined) fail('APPROVAL_STALE', 'Selected Topic is absent from Backlog');
    let released: ResearchTopicRevisionV1;
    if (currentEntry.availability === 'reserved') {
      if (!exactRef(currentEntry.current_revision_ref, outcome.topic_ref)) {
        fail('APPROVAL_STALE', 'Reserved Topic no longer matches the Outcome source revision');
      }
      released = await this.backlog.release({
        topic_ref: currentEntry.current_revision_ref,
        release_reason: reason,
        changed_by: 'research-publishing-harness/weekly-outcome-service',
        changed_at: this.now().toISOString()
      });
    } else if (currentEntry.availability === 'available') {
      released = await this.findExactRelease(topicId, outcome.topic_ref, reason);
    } else {
      fail('STATE_TRANSITION_INVALID', 'Selected Topic cannot close from its current lifecycle state');
    }
    const outcomeRef = await this.fileRef(`${root}/outcome.json`);
    const releasedRef = this.topicRef(released);
    const closurePath = `${root}/outcome-closure.json`;
    if (!await this.store.exists(closurePath)) {
      await this.store.writeNew(closurePath, createWeeklyOutcomeClosure({
        outcome_ref: outcomeRef,
        released_topic_ref: releasedRef,
        closed_at: released.created_at
      }));
    }
    const closure = await this.readClosure(cycleId);
    if (!exactRef(closure.outcome_ref, outcomeRef) || !exactRef(closure.released_topic_ref, releasedRef)) {
      fail('APPROVAL_STALE', 'Weekly Outcome Closure does not match its recovered source artifacts');
    }
    await this.weeks.status(cycleId);
    return this.status(cycleId);
  }

  private async readSources(cycleId: string) {
    const root = this.cycleRoot(cycleId);
    const cycle = await this.readSemantic<WeeklyResearchCycleV1>(
      `${root}/cycle.json`, 'weekly-research-cycle', 'cycle_digest'
    );
    const candidateSet = await this.readSemantic<WeeklyCandidateSetV1>(
      `${root}/candidates.json`, 'weekly-candidate-set', 'candidate_set_digest'
    );
    const selection = await this.readContract<WeeklyTopicSelectionV1>(
      `${root}/selection.json`, 'weekly-topic-selection'
    );
    const recreatedSelection = createWeeklyTopicSelection(candidateSet, {
      cycle_id: selection.cycle_id,
      candidate_set_digest: selection.candidate_set_digest,
      selected_brief_id: selection.selected_brief_id,
      selection_source: selection.selection_source,
      selected_by: selection.selected_by,
      selected_at: selection.selected_at
    });
    if (recreatedSelection.selection_digest !== selection.selection_digest) {
      fail('APPROVAL_STALE', 'Weekly Selection digest is stale');
    }
    const selected = candidateSet.candidates.find(
      (candidate) => candidate.brief_id === selection.selected_brief_id
    );
    if (selected === undefined) fail('APPROVAL_STALE', 'Selected Candidate is absent');
    const binding = await this.readContract<WeeklyPublicationBundleBindingV1>(
      `${root}/publication-bundle-binding.json`, 'weekly-publication-bundle-binding'
    );
    const recreatedBinding = createWeeklyPublicationBundleBinding(
      omit(binding, ['schema_version', 'binding_digest']) as unknown as Parameters<typeof createWeeklyPublicationBundleBinding>[0]
    );
    if (recreatedBinding.binding_digest !== binding.binding_digest) {
      fail('APPROVAL_STALE', 'Weekly Publication Bundle Binding is stale');
    }
    const packageValue = await this.readContract<ResearchContentPackageV1_2>(
      binding.research_content_package_ref.path, 'research-content-package'
    );
    if (sha256(packageValue) !== binding.research_content_package_ref.digest ||
        packageValue.schema_version !== '1.2' || packageValue.status !== 'frozen' ||
        !exactRef(binding.cycle_ref, {
          path: `${root}/cycle.json`, digest: cycle.cycle_digest
        }) ||
        !exactRef(binding.selection_ref, {
          path: `${root}/selection.json`, digest: selection.selection_digest
        }) ||
        !exactRef(packageValue.research_program_binding.roadmap_ref, cycle.roadmap_ref) ||
        !exactRef(packageValue.research_program_binding.topic_ref, selected.topic_ref) ||
        !exactRef(packageValue.research_program_binding.candidate_set_ref, {
          path: `${root}/candidates.json`, digest: candidateSet.candidate_set_digest
        }) ||
        !exactRef(packageValue.research_program_binding.selection_ref, binding.selection_ref)) {
      fail('APPROVAL_STALE', 'Research Content Package does not match the Bundle binding');
    }
    const [weeklyArticle, articlePackage] = await Promise.all([
      this.readJson<unknown>(binding.weekly_article_ref.path),
      this.readJson<unknown>(binding.article_package_ref.path)
    ]);
    if (sha256(weeklyArticle) !== binding.weekly_article_ref.digest ||
        sha256(articlePackage) !== binding.article_package_ref.digest ||
        sha256(weeklyArticle) !== sha256(articlePackage)) {
      fail('APPROVAL_STALE', 'Weekly Article and Canonical Article Package refs are stale');
    }
    const plan = await this.readContract<PublicationBundlePlanV1>(
      binding.bundle_plan_ref.path, 'publication-bundle-plan'
    );
    assertPublicationBundlePlan(plan);
    if (binding.bundle_plan_ref.digest !== plan.bundle_digest ||
        !exactRef(plan.cycle_ref, binding.cycle_ref) ||
        !exactRef(plan.selection_ref, binding.selection_ref) ||
        !exactRef(plan.research_content_package_ref, binding.research_content_package_ref) ||
        !exactRef(plan.canonical_article_package.package_ref, binding.article_package_ref)) {
      fail('APPROVAL_STALE', 'Publication Bundle Plan does not match the Weekly binding');
    }
    const receiptPath = `runs/${plan.bundle_id}/publication-bundle/receipt.json`;
    const receipt = await this.readContract<PublicationBundleReceiptV1>(
      receiptPath, 'publication-bundle-receipt'
    );
    const recreatedReceipt = createPublicationBundleReceipt({
      bundle_id: receipt.bundle_id, cycle_ref: receipt.cycle_ref,
      bundle_plan_ref: receipt.bundle_plan_ref, bundle_approval_ref: receipt.bundle_approval_ref,
      article: receipt.article, single: receipt.single, issued_at: receipt.issued_at
    });
    if (recreatedReceipt.receipt_digest !== receipt.receipt_digest ||
        sha256(recreatedReceipt) !== sha256(receipt) || receipt.status !== 'completed') {
      fail('STATE_TRANSITION_INVALID', 'Weekly Outcome requires a completed exact Bundle');
    }
    const approval = await this.readContract<PublicationBundleApprovalV1>(
      receipt.bundle_approval_ref.path, 'publication-bundle-approval'
    );
    assertPublicationBundleApproval(plan, approval);
    const [planRef, approvalRef] = await Promise.all([
      this.fileRef(binding.bundle_plan_ref.path),
      this.fileRef(receipt.bundle_approval_ref.path)
    ]);
    if (!exactRef(planRef, receipt.bundle_plan_ref) ||
        !exactRef(approvalRef, receipt.bundle_approval_ref) ||
        !exactRef(binding.cycle_ref, receipt.cycle_ref) ||
        !exactRef(binding.selection_ref, packageValue.research_program_binding.selection_ref) ||
        !exactRef(binding.research_content_package_ref, plan.research_content_package_ref)) {
      fail('APPROVAL_STALE', 'Publication Bundle lineage is stale');
    }
    const roadmap = await this.roadmaps.current(this.roadmapId(cycle.roadmap_ref.path));
    if (roadmap.roadmap_digest !== cycle.roadmap_ref.digest) {
      fail('APPROVAL_STALE', 'Weekly Cycle Roadmap is no longer current');
    }
    return { cycle, candidateSet, selection, selected, binding, packageValue, plan, approval, receipt, roadmap };
  }

  private async readChildObservation(
    child: PublicationBundleReceiptV1['article'],
    kind: 'x_article' | 'x_v2' | 'x_v2_1'
  ) {
    const observation = await this.evidence.readObservation({
      kind, path: child.receipt_ref.path, digest: child.receipt_ref.digest,
      privacy_classification: 'public'
    });
    if (observation.observed_content === null || observation.published_at === null ||
        observation.verification_level === 'conflict' ||
        observation.observed_content.public_url !== child.public_url ||
        observation.bound_plan_digest !== child.plan_digest) {
      fail('APPROVAL_STALE', 'Bundle child public evidence does not match its Receipt');
    }
    return {
      plan_ref: child.plan_ref,
      receipt_ref: child.receipt_ref,
      public_url: observation.observed_content.public_url,
      published_at: observation.published_at,
      verification_status: observation.verification_level,
      limitations: observation.verification_level === 'public_verified'
        ? []
        : ['published_media_unverified']
    };
  }

  private async currentSelectedTopic(
    sources: Awaited<ReturnType<WeeklyOutcomeService['readSources']>>
  ): Promise<ResearchTopicRevisionV1> {
    const topicId = this.topicId(sources.selected.topic_ref.path);
    const catalog = await this.backlog.catalog(sources.roadmap.roadmap_id);
    const entry = catalog.entries.find((candidate) => candidate.topic_id === topicId);
    if (entry === undefined) fail('APPROVAL_STALE', 'Selected Topic is absent from Backlog');
    const topic = await this.readSemantic<ResearchTopicRevisionV1>(
      entry.current_revision_ref.path, 'research-topic-revision', 'revision_digest'
    );
    if (!exactRef(entry.current_revision_ref, this.topicRef(topic)) ||
        topic.selection_ref === null || !exactRef(topic.selection_ref, sources.binding.selection_ref)) {
      fail('APPROVAL_STALE', 'Selected Topic lifecycle binding is stale');
    }
    return topic;
  }

  private async findExactRelease(
    topicId: string,
    previous: ResearchArtifactRefV1,
    reason: string
  ): Promise<ResearchTopicRevisionV1> {
    const entries = await this.store.list(`program/backlog/topics/${topicId}/revisions`);
    const matches: ResearchTopicRevisionV1[] = [];
    for (const entry of entries) {
      if (entry.kind !== 'file' || !/^[1-9][0-9]*\.json$/.test(entry.name)) continue;
      const topic = await this.readSemantic<ResearchTopicRevisionV1>(
        entry.relative_path, 'research-topic-revision', 'revision_digest'
      );
      if (topic.previous_revision_ref !== null && exactRef(topic.previous_revision_ref, previous) &&
          topic.availability === 'available' && topic.change_reason === reason) {
        matches.push(topic);
      }
    }
    if (matches.length !== 1) fail('APPROVAL_STALE', 'Exact Outcome-bound Topic release cannot be proven');
    return matches[0]!;
  }

  private async assertClosureLineage(
    cycleId: string,
    outcome: WeeklyPublicationOutcomeV1,
    closure: WeeklyOutcomeClosureV1
  ): Promise<void> {
    const outcomeRef = await this.fileRef(`${this.cycleRoot(cycleId)}/outcome.json`);
    const releasedArtifact = await this.store.readContainedArtifact(closure.released_topic_ref.path);
    const released = validateContract<ResearchTopicRevisionV1>(
      'research-topic-revision', JSON.parse(releasedArtifact.content.toString('utf8'))
    );
    if (!exactRef(closure.outcome_ref, outcomeRef) ||
        !exactRef(closure.released_topic_ref, this.topicRef(released)) ||
        released.availability !== 'available' || released.previous_revision_ref === null ||
        !exactRef(released.previous_revision_ref, outcome.topic_ref) ||
        released.change_reason !== outcomeReleaseReason(outcome)) {
      fail('APPROVAL_STALE', 'Weekly Outcome Closure lineage is stale');
    }
  }

  private async readOutcome(cycleId: string): Promise<WeeklyPublicationOutcomeV1> {
    const outcome = await this.readContract<WeeklyPublicationOutcomeV1>(
      `${this.cycleRoot(cycleId)}/outcome.json`, 'weekly-publication-outcome'
    );
    assertWeeklyPublicationOutcome(outcome);
    if (this.cycleId(outcome.cycle_ref.path) !== cycleId) {
      fail('APPROVAL_STALE', 'Weekly Outcome path does not match its Cycle');
    }
    return outcome;
  }

  private async readClosure(cycleId: string): Promise<WeeklyOutcomeClosureV1> {
    const closure = await this.readContract<WeeklyOutcomeClosureV1>(
      `${this.cycleRoot(cycleId)}/outcome-closure.json`, 'weekly-outcome-closure'
    );
    assertWeeklyOutcomeClosure(closure);
    return closure;
  }

  private async readSemantic<T extends object>(
    path: string,
    contract: Parameters<typeof validateContract>[0],
    digestField: keyof T & string
  ): Promise<T> {
    const value = await this.readContract<T>(path, contract);
    if ((value as Record<string, unknown>)[digestField] !== sha256(omit(value, [digestField]))) {
      fail('APPROVAL_STALE', `${contract} semantic digest is stale`);
    }
    return value;
  }

  private async readContract<T>(
    path: string,
    contract: Parameters<typeof validateContract>[0]
  ): Promise<T> {
    return validateContract<T>(contract, await this.readJson<unknown>(path));
  }

  private async readJson<T>(path: string): Promise<T> {
    const artifact = await this.store.readContainedArtifact(path);
    try {
      return JSON.parse(artifact.content.toString('utf8')) as T;
    } catch {
      fail('CONTRACT_INVALID', `${path} is not valid JSON`);
    }
  }

  private async fileRef(path: string): Promise<ResearchArtifactRefV1> {
    const artifact = await this.store.readContainedArtifact(path);
    return { path: artifact.relative_path, digest: artifact.digest };
  }

  private assertOnlyCycleId(input: object): void {
    const value = input as Record<string, unknown>;
    if (Object.keys(value).length !== 1 || typeof value.cycle_id !== 'string') {
      fail('CONTRACT_INVALID', 'Weekly Outcome input accepts only cycle_id');
    }
    this.cycleRoot(value.cycle_id);
  }

  private cycleRoot(cycleId: string): string {
    if (!CYCLE_ID.test(cycleId)) fail('CONTRACT_INVALID', 'Weekly Cycle id is invalid');
    return `program/weeks/${cycleId}`;
  }

  private cycleId(path: string): string {
    const match = /^program\/weeks\/([a-z0-9][a-z0-9_-]*)\/cycle\.json$/.exec(path);
    if (match === null) fail('APPROVAL_STALE', 'Weekly Cycle ref is not canonical');
    return match[1]!;
  }

  private roadmapId(path: string): string {
    const match = /^program\/roadmaps\/([a-z0-9][a-z0-9_-]*)\/revisions\/[1-9][0-9]*\.json$/.exec(path);
    if (match === null) fail('APPROVAL_STALE', 'Roadmap ref is not canonical');
    return match[1]!;
  }

  private topicId(path: string): string {
    const match = /^program\/backlog\/topics\/([a-z0-9][a-z0-9_-]*)\/revisions\/[1-9][0-9]*\.json$/.exec(path);
    if (match === null) fail('APPROVAL_STALE', 'Topic ref is not canonical');
    return match[1]!;
  }

  private topicRef(topic: ResearchTopicRevisionV1): ResearchArtifactRefV1 {
    return {
      path: `program/backlog/topics/${topic.topic_id}/revisions/${topic.revision}.json`,
      digest: topic.revision_digest
    };
  }
}
