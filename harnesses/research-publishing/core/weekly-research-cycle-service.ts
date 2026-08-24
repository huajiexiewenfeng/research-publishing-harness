import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import {
  createResearchTopicRevision,
  createWeeklyCandidateSet,
  createWeeklyCycleCancellation,
  createWeeklyCycleStatus,
  createWeeklyResearchCycle,
  createWeeklyTopicSelection
} from './research-program-contracts.js';
import type {
  AddResearchTopicInput,
  CancelWeeklyCycleInput,
  CreateWeeklyCycleStatusInput,
  OpenWeeklyCycleInput,
  ResearchArtifactRefV1,
  ResearchBacklogPort,
  ResearchRoadmapPort,
  ResearchRoadmapV1,
  ResearchTopicRevisionV1,
  SelectWeeklyTopicInput,
  SubmitWeeklyCandidatesInput,
  WeeklyCandidateSetV1,
  WeeklyCycleCancellationV1,
  WeeklyCycleStatusV1,
  WeeklyResearchCyclePort,
  WeeklyResearchCycleV1,
  WeeklyTopicSelectionV1
} from './research-program-types.js';
import type {
  ResearchContextReviewV2,
  ResearchContextSnapshotV2,
  ResearchQueryPlanV2
} from './research-query-types.js';
import { STABLE_ID_PATTERN } from './research-memory-contracts.js';
import { validateContract } from './schema-validator.js';
import type { ContractName } from './types.js';
import type { WorkspaceStore } from './workspace-store.js';

const ROADMAP_REF_PATTERN = /^program\/roadmaps\/([a-z0-9][a-z0-9_-]*)\/revisions\/([1-9][0-9]*)\.json$/;
const TOPIC_REF_PATTERN = /^program\/backlog\/topics\/([a-z0-9][a-z0-9_-]*)\/revisions\/([1-9][0-9]*)\.json$/;

function fail(
  code: 'CONTRACT_INVALID' | 'STATE_TRANSITION_INVALID' | 'RESEARCH_GATE_BLOCKED' | 'APPROVAL_STALE',
  message: string
): never {
  throw new HarnessError(code, message);
}

function cycleRoot(cycleId: string): string {
  if (!STABLE_ID_PATTERN.test(cycleId)) {
    fail('CONTRACT_INVALID', 'Weekly Cycle id must be an ASCII-safe stable id');
  }
  return `program/weeks/${cycleId}`;
}

function exactRef(left: ResearchArtifactRefV1, right: ResearchArtifactRefV1): boolean {
  return left.path === right.path && left.digest === right.digest;
}

function exactValue(left: unknown, right: unknown): boolean {
  return sha256(left) === sha256(right);
}

function roadmapRef(roadmap: ResearchRoadmapV1): ResearchArtifactRefV1 {
  return {
    path: `program/roadmaps/${roadmap.roadmap_id}/revisions/${roadmap.revision}.json`,
    digest: roadmap.roadmap_digest
  };
}

function artifactRef(path: string, digest: `sha256:${string}`): ResearchArtifactRefV1 {
  return { path, digest };
}

function omitFields(value: object, fields: readonly string[]): Record<string, unknown> {
  const body = { ...(value as Record<string, unknown>) };
  for (const field of fields) delete body[field];
  return body;
}

export class WeeklyResearchCycleService implements WeeklyResearchCyclePort {
  constructor(
    private readonly store: WorkspaceStore,
    private readonly roadmaps: ResearchRoadmapPort,
    private readonly backlog: ResearchBacklogPort
  ) {}

  async open(input: OpenWeeklyCycleInput): Promise<WeeklyResearchCycleV1> {
    const cycle = createWeeklyResearchCycle(input);
    const roadmapMatch = ROADMAP_REF_PATTERN.exec(cycle.roadmap_ref.path);
    if (roadmapMatch === null) {
      fail('APPROVAL_STALE', 'Weekly Cycle requires a canonical current Roadmap ref');
    }
    const roadmap = await this.roadmaps.current(roadmapMatch[1]!);
    if (!exactRef(cycle.roadmap_ref, roadmapRef(roadmap))) {
      fail('APPROVAL_STALE', 'Weekly Cycle does not bind the current Roadmap revision');
    }
    await this.backlog.assertCadenceReady(roadmap.roadmap_id);
    await this.verifyContext(cycle);
    await this.assertNoActiveCycle(cycle);

    const root = cycleRoot(cycle.cycle_id);
    return this.store.withLock(`${root}/cycle.lock`, async () => {
      await this.store.writeNew(`${root}/cycle.json`, cycle);
      const installed = await this.readCycle(cycle.cycle_id);
      await this.projectStatus(installed, 'opened', input.opened_at);
      return installed;
    });
  }

  async submitCandidates(input: SubmitWeeklyCandidatesInput): Promise<WeeklyCandidateSetV1> {
    const cycle = await this.readCycle(input.cycle_id);
    if (!exactRef(input.roadmap_ref, cycle.roadmap_ref) ||
        !exactValue(input.context_binding, cycle.context_binding)) {
      fail('APPROVAL_STALE', 'Candidate Set must bind the exact Weekly Cycle Roadmap and Context');
    }
    const candidateSet = createWeeklyCandidateSet(input);
    const roadmapId = this.roadmapId(cycle.roadmap_ref);
    for (const candidate of candidateSet.candidates) {
      const topic = await this.readTopic(candidate.topic_ref);
      if (topic.roadmap_id !== roadmapId) {
        fail('APPROVAL_STALE', 'Candidate Topic belongs to a foreign Roadmap');
      }
      if (topic.backlog_state !== 'evidence_ready' || topic.availability !== 'available') {
        fail('RESEARCH_GATE_BLOCKED', 'Every Candidate requires an available Evidence Ready Topic');
      }
    }
    if (
      cycle.context_binding.application_status === 'reviewed_not_applied' &&
      candidateSet.candidates.some((candidate) =>
        candidate.evidence_refs.length === 0 || candidate.source_refs.length === 0
      )
    ) {
      await this.projectStatus(
        cycle,
        'blocked',
        input.created_at,
        'Runtime Context was not applied and independent Candidate evidence is incomplete'
      );
      fail('RESEARCH_GATE_BLOCKED', 'Independent Candidate evidence is required without applied Context');
    }

    const root = cycleRoot(cycle.cycle_id);
    await this.store.writeNew(`${root}/candidates.json`, candidateSet);
    const installed = await this.readCandidateSet(cycle.cycle_id);
    await this.projectStatus(cycle, 'candidates_submitted', input.created_at, null, installed);
    return installed;
  }

  async select(input: SelectWeeklyTopicInput): Promise<WeeklyTopicSelectionV1> {
    const root = cycleRoot(input.cycle_id);
    const cycle = await this.readCycle(input.cycle_id);
    const candidateSet = await this.readCandidateSet(input.cycle_id);
    if (await this.store.exists(`${root}/selection.json`)) {
      fail('STATE_TRANSITION_INVALID', 'Weekly Cycle already has an immutable Human Selection');
    }
    const selection = createWeeklyTopicSelection(candidateSet, input);
    await this.store.writeNew(`${root}/selection.json`, selection);
    const installed = await this.readSelection(input.cycle_id, candidateSet);
    const selected = candidateSet.candidates.find(
      (candidate) => candidate.brief_id === installed.selected_brief_id
    )!;
    await this.backlog.reserve({
      topic_ref: selected.topic_ref,
      selection_ref: artifactRef(`${root}/selection.json`, installed.selection_digest),
      changed_by: installed.selected_by,
      changed_at: installed.selected_at
    });
    await this.projectStatus(cycle, 'topic_selected', input.selected_at, null, candidateSet, installed);
    return installed;
  }

  async cancel(input: CancelWeeklyCycleInput): Promise<WeeklyCycleStatusV1> {
    const root = cycleRoot(input.cycle_id);
    const cycle = await this.readCycle(input.cycle_id);
    const candidateSet = await this.readCandidateSet(input.cycle_id);
    const selection = await this.readSelection(input.cycle_id, candidateSet);
    const current = await this.status(input.cycle_id);
    if (['publication_planned', 'published'].includes(current.phase)) {
      fail('STATE_TRANSITION_INVALID', 'Weekly Cycle cannot be cancelled after publication planning');
    }
    let cancellation: WeeklyCycleCancellationV1;
    if (await this.store.exists(`${root}/cancellation.json`)) {
      cancellation = await this.readCancellation(input.cycle_id, cycle, selection);
      if (
        cancellation.reason !== input.reason || cancellation.cancelled_by !== input.cancelled_by ||
        cancellation.cancelled_at !== input.cancelled_at ||
        input.confirmed_selection_digest !== selection.selection_digest
      ) {
        fail('APPROVAL_STALE', 'Cancellation retry does not match the immutable Cancellation event');
      }
    } else {
      cancellation = createWeeklyCycleCancellation(cycle, selection, input);
      await this.store.writeNew(`${root}/cancellation.json`, cancellation);
      cancellation = await this.readCancellation(input.cycle_id, cycle, selection);
    }

    const selected = candidateSet.candidates.find(
      (candidate) => candidate.brief_id === selection.selected_brief_id
    )!;
    const topicId = this.topicId(selected.topic_ref);
    const catalog = await this.backlog.catalog(this.roadmapId(cycle.roadmap_ref));
    const currentTopic = catalog.entries.find((entry) => entry.topic_id === topicId);
    if (currentTopic === undefined) fail('APPROVAL_STALE', 'Selected Topic is absent from the current Backlog');
    if (currentTopic.availability === 'reserved') {
      await this.backlog.release({
        topic_ref: currentTopic.current_revision_ref,
        release_reason: input.reason,
        changed_by: input.cancelled_by,
        changed_at: input.cancelled_at
      });
    } else if (currentTopic.availability !== 'available') {
      fail('STATE_TRANSITION_INVALID', 'Selected Topic cannot be released from its current state');
    }
    return this.projectStatus(
      cycle, 'cancelled', input.cancelled_at, null, candidateSet, selection, cancellation
    );
  }

  async status(cycleId: string): Promise<WeeklyCycleStatusV1> {
    const root = cycleRoot(cycleId);
    const cycle = await this.readCycle(cycleId);
    const candidateSet = await this.optionalCandidateSet(cycleId);
    const selection = candidateSet === null ? null : await this.optionalSelection(cycleId, candidateSet);
    const cancellation = selection === null
      ? null
      : await this.optionalCancellation(cycleId, cycle, selection);
    const phase = cancellation !== null
      ? 'cancelled'
      : selection !== null
        ? 'topic_selected'
        : candidateSet !== null
          ? 'candidates_submitted'
          : 'opened';

    if (await this.store.exists(`${root}/status.json`)) {
      const existing = await this.readStatus(cycleId);
      if (existing.phase === phase) return existing;
    }
    return this.projectStatus(
      cycle, phase, new Date().toISOString(), null, candidateSet, selection, cancellation
    );
  }

  private async verifyContext(cycle: WeeklyResearchCycleV1): Promise<void> {
    const root = `memory/queries-v2/${cycle.context_binding.query_id}`;
    const plan = await this.readSemantic<ResearchQueryPlanV2>(
      `${root}/plan.json`, 'research-query-plan-v2', 'plan_digest'
    );
    const snapshot = await this.readSemantic<ResearchContextSnapshotV2>(
      `${root}/snapshot.json`, 'research-context-snapshot-v2', 'snapshot_digest'
    );
    const review = await this.readSemantic<ResearchContextReviewV2>(
      `${root}/review.json`, 'research-context-review-v2', 'review_digest'
    );
    const binding = cycle.context_binding;
    if (
      plan.query_id !== binding.query_id || plan.plan_digest !== binding.plan_digest ||
      snapshot.query_id !== plan.query_id || snapshot.query_plan_digest !== plan.plan_digest ||
      snapshot.snapshot_digest !== binding.snapshot_digest ||
      review.query_id !== plan.query_id || review.query_plan_digest !== plan.plan_digest ||
      review.snapshot_digest !== snapshot.snapshot_digest || review.review_digest !== binding.review_digest ||
      snapshot.query_status !== binding.query_status || snapshot.runtime_version !== binding.runtime_version ||
      !exactValue(review.selected_context_refs, binding.selected_context_refs)
    ) {
      fail('APPROVAL_STALE', 'Weekly Context binding does not match the reviewed Query artifact chain');
    }
  }

  private async assertNoActiveCycle(candidate: WeeklyResearchCycleV1): Promise<void> {
    for (const entry of await this.store.list('program/weeks')) {
      if (entry.kind !== 'directory' || !STABLE_ID_PATTERN.test(entry.name)) continue;
      const path = `${entry.relative_path}/cycle.json`;
      if (!await this.store.exists(path)) continue;
      const existing = await this.readCycle(entry.name);
      if (
        existing.week_number === candidate.week_number &&
        exactRef(existing.roadmap_ref, candidate.roadmap_ref) &&
        !await this.store.exists(`${entry.relative_path}/cancellation.json`)
      ) {
        fail('STATE_TRANSITION_INVALID', 'Roadmap week already has a non-cancelled Weekly Cycle');
      }
    }
  }

  private async projectStatus(
    cycle: WeeklyResearchCycleV1,
    phase: WeeklyCycleStatusV1['phase'],
    updatedAt: string,
    blockedReason: string | null = null,
    candidateSet: WeeklyCandidateSetV1 | null = null,
    selection: WeeklyTopicSelectionV1 | null = null,
    cancellation: WeeklyCycleCancellationV1 | null = null
  ): Promise<WeeklyCycleStatusV1> {
    const root = cycleRoot(cycle.cycle_id);
    const input: CreateWeeklyCycleStatusInput = {
      cycle_ref: artifactRef(`${root}/cycle.json`, cycle.cycle_digest),
      phase,
      candidate_set_ref: candidateSet === null
        ? null
        : artifactRef(`${root}/candidates.json`, candidateSet.candidate_set_digest),
      selection_ref: selection === null
        ? null
        : artifactRef(`${root}/selection.json`, selection.selection_digest),
      cancellation_ref: cancellation === null
        ? null
        : artifactRef(`${root}/cancellation.json`, cancellation.cancellation_digest),
      package_ref: null, article_ref: null, bundle_ref: null, outcome_ref: null,
      blocked_reason: blockedReason,
      updated_at: updatedAt
    };
    const status = createWeeklyCycleStatus(input);
    await this.store.replaceAtomic(`${root}/status.json`, status);
    return this.readStatus(cycle.cycle_id);
  }

  private async readCycle(cycleId: string): Promise<WeeklyResearchCycleV1> {
    const value = await this.readContract<WeeklyResearchCycleV1>(
      `${cycleRoot(cycleId)}/cycle.json`, 'weekly-research-cycle'
    );
    const verified = createWeeklyResearchCycle(
      omitFields(value, ['schema_version', 'cycle_digest']) as OpenWeeklyCycleInput
    );
    if (verified.cycle_digest !== value.cycle_digest || value.cycle_id !== cycleId) {
      fail('APPROVAL_STALE', 'Weekly Cycle content does not match its immutable path or digest');
    }
    return value;
  }

  private async readCandidateSet(cycleId: string): Promise<WeeklyCandidateSetV1> {
    const value = await this.readContract<WeeklyCandidateSetV1>(
      `${cycleRoot(cycleId)}/candidates.json`, 'weekly-candidate-set'
    );
    const verified = createWeeklyCandidateSet(
      omitFields(value, ['schema_version', 'candidate_set_digest']) as SubmitWeeklyCandidatesInput
    );
    if (verified.candidate_set_digest !== value.candidate_set_digest || value.cycle_id !== cycleId) {
      fail('APPROVAL_STALE', 'Candidate Set content does not match its immutable path or digest');
    }
    return value;
  }

  private async readSelection(
    cycleId: string,
    candidateSet: WeeklyCandidateSetV1
  ): Promise<WeeklyTopicSelectionV1> {
    const value = await this.readContract<WeeklyTopicSelectionV1>(
      `${cycleRoot(cycleId)}/selection.json`, 'weekly-topic-selection'
    );
    const verified = createWeeklyTopicSelection(
      candidateSet,
      omitFields(value, ['schema_version', 'selection_id', 'selection_digest']) as unknown as SelectWeeklyTopicInput
    );
    if (verified.selection_digest !== value.selection_digest || value.cycle_id !== cycleId) {
      fail('APPROVAL_STALE', 'Topic Selection content does not match its immutable path or digest');
    }
    return value;
  }

  private async readCancellation(
    cycleId: string,
    cycle: WeeklyResearchCycleV1,
    selection: WeeklyTopicSelectionV1
  ): Promise<WeeklyCycleCancellationV1> {
    const value = await this.readContract<WeeklyCycleCancellationV1>(
      `${cycleRoot(cycleId)}/cancellation.json`, 'weekly-cycle-cancellation'
    );
    const verified = createWeeklyCycleCancellation(cycle, selection, {
      cycle_id: cycleId, confirmed_selection_digest: selection.selection_digest,
      reason: value.reason, cancelled_by: value.cancelled_by, cancelled_at: value.cancelled_at
    });
    if (verified.cancellation_digest !== value.cancellation_digest) {
      fail('APPROVAL_STALE', 'Cancellation content does not match its immutable digest');
    }
    return value;
  }

  private async readStatus(cycleId: string): Promise<WeeklyCycleStatusV1> {
    const value = await this.readContract<WeeklyCycleStatusV1>(
      `${cycleRoot(cycleId)}/status.json`, 'weekly-cycle-status'
    );
    const verified = createWeeklyCycleStatus(
      omitFields(value, ['schema_version', 'projection_digest']) as unknown as CreateWeeklyCycleStatusInput
    );
    if (verified.projection_digest !== value.projection_digest) {
      fail('APPROVAL_STALE', 'Weekly Cycle Status digest no longer matches its content');
    }
    return value;
  }

  private async readTopic(ref: ResearchArtifactRefV1): Promise<ResearchTopicRevisionV1> {
    const match = TOPIC_REF_PATTERN.exec(ref.path);
    if (match === null) fail('APPROVAL_STALE', 'Candidate Topic ref is not canonical');
    const value = await this.readContract<ResearchTopicRevisionV1>(ref.path, 'research-topic-revision');
    const verified = createResearchTopicRevision(
      omitFields(value, ['schema_version', 'revision_digest']) as unknown as AddResearchTopicInput
    );
    if (
      verified.revision_digest !== value.revision_digest || !exactRef(ref, {
        path: `program/backlog/topics/${value.topic_id}/revisions/${value.revision}.json`,
        digest: value.revision_digest
      })
    ) {
      fail('APPROVAL_STALE', 'Candidate Topic ref does not bind an exact immutable revision');
    }
    return value;
  }

  private async readSemantic<T extends object>(
    path: string,
    contract: ContractName,
    digestField: keyof T & string
  ): Promise<T> {
    const value = await this.readContract<T>(path, contract);
    if ((value as Record<string, unknown>)[digestField] !== sha256(omitFields(value, [digestField]))) {
      fail('APPROVAL_STALE', `${contract} semantic digest no longer matches its content`);
    }
    return value;
  }

  private async readContract<T>(path: string, contract: ContractName): Promise<T> {
    const artifact = await this.store.readContainedArtifact(path);
    let value: unknown;
    try {
      value = JSON.parse(artifact.content.toString('utf8'));
    } catch {
      fail('CONTRACT_INVALID', `${contract} is not valid JSON`);
    }
    return validateContract<T>(contract, value);
  }

  private async optionalCandidateSet(cycleId: string): Promise<WeeklyCandidateSetV1 | null> {
    return await this.store.exists(`${cycleRoot(cycleId)}/candidates.json`)
      ? this.readCandidateSet(cycleId)
      : null;
  }

  private async optionalSelection(
    cycleId: string,
    candidateSet: WeeklyCandidateSetV1
  ): Promise<WeeklyTopicSelectionV1 | null> {
    return await this.store.exists(`${cycleRoot(cycleId)}/selection.json`)
      ? this.readSelection(cycleId, candidateSet)
      : null;
  }

  private async optionalCancellation(
    cycleId: string,
    cycle: WeeklyResearchCycleV1,
    selection: WeeklyTopicSelectionV1
  ): Promise<WeeklyCycleCancellationV1 | null> {
    return await this.store.exists(`${cycleRoot(cycleId)}/cancellation.json`)
      ? this.readCancellation(cycleId, cycle, selection)
      : null;
  }

  private roadmapId(ref: ResearchArtifactRefV1): string {
    const match = ROADMAP_REF_PATTERN.exec(ref.path);
    if (match === null) fail('APPROVAL_STALE', 'Roadmap ref is not canonical');
    return match[1]!;
  }

  private topicId(ref: ResearchArtifactRefV1): string {
    const match = TOPIC_REF_PATTERN.exec(ref.path);
    if (match === null) fail('APPROVAL_STALE', 'Topic ref is not canonical');
    return match[1]!;
  }
}
