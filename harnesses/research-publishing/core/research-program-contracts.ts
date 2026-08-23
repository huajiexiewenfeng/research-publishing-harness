import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { RESEARCH_PROGRAM_POLICY_V1 } from './research-program-policy.js';
import type {
  AddResearchTopicInput,
  ClaimBoundaryStatus,
  CreateMonthlyEditorialReviewInput,
  CreateResearchBacklogCatalogInput,
  CreateResearchProgramStatusInput,
  CreateResearchRoadmapInput,
  MonthlyEditorialReviewV1,
  ResearchArtifactRefV1,
  ResearchBacklogCatalogV1,
  ResearchProgramStatusV1,
  ResearchRoadmapV1,
  ResearchTopicRevisionV1
} from './research-program-types.js';
import { STABLE_ID_PATTERN } from './research-memory-contracts.js';
import { validateContract } from './schema-validator.js';

const LOCKED_STREAM_IDS = new Set<string>([
  'knowledge_runtime_governance',
  'project_harness_lifecycle',
  'skill_cognitive_runtime',
  'runtime_evolution',
  'enterprise_validation'
]);

const LOCKED_STAGE_IDS = new Set<string>([
  'week_01_04_wiki_contract',
  'week_05_12_failure_trace',
  'week_13_20_trace_eval',
  'week_21_24_synthesis'
]);

function fail(message: string): never {
  throw new HarnessError('CONTRACT_INVALID', message);
}

function assertStableId(value: string, label: string): void {
  if (!STABLE_ID_PATTERN.test(value)) {
    fail(`${label} must be an ASCII-safe stable id`);
  }
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    fail(`${label} must be unique`);
  }
}

function refKey(ref: ResearchArtifactRefV1): string {
  return `${ref.path}\u0000${ref.digest}`;
}

function assertUniqueRefs(refs: readonly ResearchArtifactRefV1[], label: string): void {
  assertUnique(refs.map(refKey), label);
}

function assertRevisionChain(
  revision: number,
  previousRevisionRef: ResearchArtifactRefV1 | null,
  label: string
): void {
  if (revision === 1 && previousRevisionRef !== null) {
    fail(`${label} revision one cannot have a previous revision ref`);
  }
  if (revision > 1 && previousRevisionRef === null) {
    fail(`${label} revision greater than one requires a previous revision ref`);
  }
}

function requiresEvidence(status: ClaimBoundaryStatus): boolean {
  return status === 'shipped' || status === 'validated';
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function assertRoadmapSemantics(input: CreateResearchRoadmapInput): void {
  assertStableId(input.roadmap_id, 'Roadmap id');
  assertRevisionChain(input.revision, input.previous_revision_ref, 'Roadmap');

  if (input.research_streams.length !== LOCKED_STREAM_IDS.size) {
    fail('Roadmap requires five Research Streams');
  }
  const streamIds = input.research_streams.map((stream) => stream.stream_id);
  assertUnique(streamIds, 'Research Stream ids');
  if (streamIds.some((streamId) => !LOCKED_STREAM_IDS.has(streamId))) {
    fail('Roadmap must contain the five locked Research Streams');
  }
  for (const stream of input.research_streams) {
    assertUnique(stream.project_refs, `${stream.stream_id} project refs`);
    assertUnique(stream.research_questions, `${stream.stream_id} research questions`);
    assertUnique(stream.relationship_notes, `${stream.stream_id} relationship notes`);
  }

  if (input.research_stages.length !== LOCKED_STAGE_IDS.size) {
    fail('Roadmap requires four Research Stages');
  }
  const stageIds = input.research_stages.map((stage) => stage.stage_id);
  assertUnique(stageIds, 'Research Stage ids');
  if (stageIds.some((stageId) => !LOCKED_STAGE_IDS.has(stageId))) {
    fail('Roadmap must contain the four locked Research Stages');
  }
  let expectedWeek = 1;
  for (const stage of [...input.research_stages].sort((left, right) => left.start_week - right.start_week)) {
    if (
      stage.start_week !== expectedWeek ||
      stage.end_week < stage.start_week ||
      stage.window_role !== 'target_only' ||
      stage.progression_mode !== 'evidence_gated'
    ) {
      fail('Research Stages must be contiguous evidence-gated target windows');
    }
    assertUnique(stage.completion_signals, `${stage.stage_id} completion signals`);
    assertUnique(stage.evidence_refs, `${stage.stage_id} evidence refs`);
    if (requiresEvidence(stage.capability_status) && stage.evidence_refs.length === 0) {
      fail('shipped or validated Research Stages require evidence');
    }
    expectedWeek = stage.end_week + 1;
  }
  if (expectedWeek !== RESEARCH_PROGRAM_POLICY_V1.horizon_weeks + 1) {
    fail('Research Stages must cover weeks one through twenty-four exactly once');
  }

  if (input.article_slots.length !== RESEARCH_PROGRAM_POLICY_V1.horizon_weeks) {
    fail('Roadmap requires twenty-four Article Slots');
  }
  assertUnique(input.article_slots.map((slot) => slot.slot_id), 'Article Slot ids');
  assertUnique(input.article_slots.map((slot) => String(slot.week_number)), 'Article Slot weeks');
  const slots = [...input.article_slots].sort((left, right) => left.week_number - right.week_number);
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index]!;
    const week = index + 1;
    const expectedMonth = `month_${String(Math.floor(index / 4) + 1).padStart(2, '0')}`;
    if (slot.week_number !== week || slot.month_id !== expectedMonth) {
      fail('Article Slots must map weeks one through twenty-four into six four-slot months');
    }
    const abstractLength = codePointLength(slot.planning_abstract);
    if (abstractLength < 40 || abstractLength > 600) {
      fail('Article Slot planning abstract must contain 40 to 600 code points');
    }
    assertUnique(slot.stream_ids, `${slot.slot_id} stream ids`);
    if (slot.stream_ids.length === 0 || slot.stream_ids.some((id) => !LOCKED_STREAM_IDS.has(id))) {
      fail('Article Slot stream ids must resolve to the locked Roadmap Streams');
    }
    assertUnique(slot.evidence_refs, `${slot.slot_id} evidence refs`);
    if (requiresEvidence(slot.capability_status) && slot.evidence_refs.length === 0) {
      fail('shipped or validated Article Slots require evidence');
    }
  }
  for (let month = 1; month <= RESEARCH_PROGRAM_POLICY_V1.horizon_months; month += 1) {
    const monthId = `month_${String(month).padStart(2, '0')}`;
    const monthLayers = input.article_slots
      .filter((slot) => slot.month_id === monthId)
      .map((slot) => slot.article_layer);
    if (
      monthLayers.length !== RESEARCH_PROGRAM_POLICY_V1.monthly_layers.length ||
      new Set(monthLayers).size !== RESEARCH_PROGRAM_POLICY_V1.monthly_layers.length ||
      RESEARCH_PROGRAM_POLICY_V1.monthly_layers.some((layer) => !monthLayers.includes(layer))
    ) {
      fail('Every month requires the four monthly Article layers');
    }
  }
  assertUnique(input.prologue_refs, 'Roadmap prologue refs');
  assertUnique(input.non_goals, 'Roadmap non-goals');
}

export function createResearchRoadmap(input: CreateResearchRoadmapInput): ResearchRoadmapV1 {
  assertRoadmapSemantics(input);
  const body = { schema_version: 'research-roadmap/v1' as const, ...input };
  return validateContract<ResearchRoadmapV1>('research-roadmap', {
    ...body,
    roadmap_digest: sha256(body)
  });
}

export function createResearchTopicRevision(
  input: AddResearchTopicInput
): ResearchTopicRevisionV1 {
  assertStableId(input.topic_id, 'Topic id');
  assertStableId(input.roadmap_id, 'Roadmap id');
  assertRevisionChain(input.revision, input.previous_revision_ref, 'Topic');
  assertUnique(input.stream_ids, 'Topic stream ids');
  assertUnique(input.evidence_refs, 'Topic evidence refs');
  assertUnique(input.boundary_notes, 'Topic boundary notes');
  assertUnique(input.source_refs, 'Topic source refs');
  if (input.stream_ids.length === 0 || input.stream_ids.some((id) => !LOCKED_STREAM_IDS.has(id))) {
    fail('Topic stream ids must use locked Research Streams');
  }
  if (
    input.backlog_state === 'evidence_ready' &&
    (input.evidence_refs.length === 0 || input.boundary_notes.length === 0)
  ) {
    fail('Evidence Ready Topics require evidence and a boundary note');
  }
  if (requiresEvidence(input.claim_status) && input.evidence_refs.length === 0) {
    fail('shipped or validated Topics require evidence');
  }
  if (
    (input.availability === 'reserved' || input.availability === 'completed') &&
    input.selection_ref === null
  ) {
    fail('reserved or completed Topics require a Human Selection ref');
  }
  if (input.availability === 'completed' && input.outcome_ref === null) {
    fail('completed Topics require a Weekly Outcome ref');
  }
  if (input.availability !== 'completed' && input.outcome_ref !== null) {
    fail('only completed Topics may bind a Weekly Outcome ref');
  }
  const body = { schema_version: 'research-topic-revision/v1' as const, ...input };
  return validateContract<ResearchTopicRevisionV1>('research-topic-revision', {
    ...body,
    revision_digest: sha256(body)
  });
}

export function createResearchBacklogCatalog(
  input: CreateResearchBacklogCatalogInput
): ResearchBacklogCatalogV1 {
  const sortedEntries = [...input.entries].sort((left, right) =>
    left.topic_id.localeCompare(right.topic_id)
  );
  assertUnique(sortedEntries.map((entry) => entry.topic_id), 'Backlog Topic ids');
  assertUniqueRefs(sortedEntries.map((entry) => entry.current_revision_ref), 'Backlog revision refs');
  const expectedCounts = { evidence_ready: 0, researching: 0, long_term: 0 };
  for (const entry of sortedEntries) {
    assertStableId(entry.topic_id, 'Topic id');
    if (entry.availability === 'available') {
      expectedCounts[entry.backlog_state] += 1;
    }
  }
  if (
    input.counts.evidence_ready !== expectedCounts.evidence_ready ||
    input.counts.researching !== expectedCounts.researching ||
    input.counts.long_term !== expectedCounts.long_term
  ) {
    fail('Backlog counts must match available Topic entries');
  }
  const body = {
    schema_version: 'research-backlog-catalog/v1' as const,
    ...input,
    entries: sortedEntries
  };
  return validateContract<ResearchBacklogCatalogV1>('research-backlog-catalog', {
    ...body,
    catalog_digest: sha256(body)
  });
}

function assertUniqueReviewContent(input: CreateMonthlyEditorialReviewInput): void {
  assertUniqueRefs(input.completed_outcome_refs, 'Monthly Outcome refs');
  assertUnique(input.stream_coverage, 'Monthly Stream coverage');
  assertUnique(input.claim_changes.map((change) => change.claim_ref), 'Monthly Claim refs');
  for (const change of input.claim_changes) {
    assertUnique(change.evidence_refs, `${change.claim_ref} evidence refs`);
  }
  for (const [label, values] of [
    ['implementation Evidence refs', input.implementation_evidence_refs],
    ['failure refs', input.failure_refs],
    ['decision refs', input.decision_refs],
    ['boundary change refs', input.boundary_change_refs],
    ['open question refs', input.open_question_refs],
    ['repeated Topic refs', input.repeated_topic_refs],
    ['off-track findings', input.off_track_findings]
  ] as const) {
    assertUnique(values, `Monthly ${label}`);
  }
}

export function createMonthlyEditorialReview(
  input: CreateMonthlyEditorialReviewInput
): MonthlyEditorialReviewV1 {
  assertStableId(input.review_id, 'Monthly Review id');
  if (input.next_candidate_topic_refs.length !== 4) {
    fail('Monthly Review requires exactly four next-Candidate Topic refs');
  }
  assertUniqueRefs(input.next_candidate_topic_refs, 'next-Candidate Topic refs');
  assertUniqueReviewContent(input);
  if (
    input.roadmap_change_requested !== (input.roadmap_change_reason !== null) ||
    (input.roadmap_change_reason !== null && input.roadmap_change_reason.trim().length === 0)
  ) {
    fail('Roadmap change requests require one non-empty reason');
  }
  const cadenceMet = input.completed_outcome_refs.length >= 4;
  const researchProgressMet =
    input.claim_changes.length > 0 ||
    input.implementation_evidence_refs.length > 0 ||
    input.failure_refs.length > 0 ||
    input.decision_refs.length > 0 ||
    input.boundary_change_refs.length > 0 ||
    input.open_question_refs.length > 0;
  const body = {
    schema_version: 'monthly-editorial-review/v1' as const,
    ...input,
    cadence_met: cadenceMet,
    research_progress_met: researchProgressMet,
    evidence_ready_guard_met:
      input.evidence_ready_count >= RESEARCH_PROGRAM_POLICY_V1.minimum_evidence_ready_topics
  };
  return validateContract<MonthlyEditorialReviewV1>('monthly-editorial-review', {
    ...body,
    review_digest: sha256(body)
  });
}

export function createResearchProgramStatus(
  input: CreateResearchProgramStatusInput
): ResearchProgramStatusV1 {
  assertUniqueRefs(input.active_cycle_refs, 'active Weekly Cycle refs');
  assertUnique(input.warnings, 'Program warnings');
  const body = { schema_version: 'research-program-status/v1' as const, ...input };
  return validateContract<ResearchProgramStatusV1>('research-program-status', {
    ...body,
    projection_digest: sha256(body)
  });
}
