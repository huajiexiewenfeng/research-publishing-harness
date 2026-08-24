import type {
  AddResearchTopicInput,
  CreateMonthlyEditorialReviewInput,
  CreateResearchBacklogCatalogInput,
  CreateResearchProgramStatusInput,
  CreateResearchRoadmapInput,
  MonthlyArticleLayer,
  ResearchStageV1,
  ResearchStreamV1,
  SubmitWeeklyCandidatesInput,
  WeeklyCandidateBriefV1,
  OpenWeeklyCycleInput
} from '../../harnesses/research-publishing/core/research-program-types.js';

const layers: readonly MonthlyArticleLayer[] = [
  'question_model',
  'implementation_evidence',
  'project_skill_failure_tradeoff',
  'anchor_synthesis'
];

const streamDefinitions = [
  ['knowledge_runtime_governance', 'Knowledge Runtime & Governance'],
  ['project_harness_lifecycle', 'Project Harness & Lifecycle'],
  ['skill_cognitive_runtime', 'Skill & Cognitive Runtime'],
  ['runtime_evolution', 'Runtime Evolution'],
  ['enterprise_validation', 'Enterprise Validation']
] as const;

const streams: readonly ResearchStreamV1[] = streamDefinitions.map(([streamId, name]) => ({
  stream_id: streamId,
  name,
  project_refs: [`https://example.test/${streamId}`],
  research_questions: [`What is the boundary of ${name}?`],
  relationship_notes: [`Synthetic relationship note for ${name}.`]
}));

const stageDefinitions = [
  ['week_01_04_wiki_contract', 1, 4, 'Cross-Skill Wiki Contract', 'observed'],
  ['week_05_12_failure_trace', 5, 12, 'Failure-derived Trace', 'exploring'],
  ['week_13_20_trace_eval', 13, 20, 'Trace-backed Eval', 'planned'],
  ['week_21_24_synthesis', 21, 24, 'Synthesis and decision', 'hypothesis']
] as const;

const stages: readonly ResearchStageV1[] = stageDefinitions.map(([
  stageId,
  startWeek,
  endWeek,
  objective,
  capabilityStatus
]) => ({
  stage_id: stageId,
  start_week: startWeek,
  end_week: endWeek,
  window_role: 'target_only',
  progression_mode: 'evidence_gated',
  objective,
  completion_signals: [`${objective} completion evidence`],
  capability_status: capabilityStatus,
  evidence_refs: []
}));

export const roadmapInput: CreateResearchRoadmapInput = {
  roadmap_id: 'enterprise_ai_agent_runtime_202608',
  revision: 1,
  previous_revision_ref: null,
  title: 'Enterprise AI Agent Runtime Research Roadmap',
  north_star: {
    en: 'How can enterprise AI agents accumulate reliable knowledge, participate in real work, and improve without losing evidence, boundaries, or human control?',
    zh_CN: '企业级 AI Agent 如何积累可靠知识、参与真实工作并持续改进，同时不失去证据、边界与人工控制？'
  },
  primary_track_id: 'enterprise-agent-runtime',
  target_account: '@Glen56121',
  research_streams: streams,
  research_stages: stages,
  publication_clock: {
    minimum_articles_per_week: 1,
    minimum_articles_per_month: 4,
    minimum_articles_total: 24,
    default_language: 'en',
    default_publication_pair: ['x_article', 'x_single'],
    optional_chinese_translation: true,
    research_notes_kpi: null,
    replies_kpi: null
  },
  article_slots: Array.from({ length: 24 }, (_, index) => ({
    slot_id: `slot_${String(index + 1).padStart(2, '0')}`,
    week_number: index + 1,
    month_id: `month_${String(Math.floor(index / 4) + 1).padStart(2, '0')}`,
    article_layer: layers[index % layers.length]!,
    working_title: `Fixture Article ${String(index + 1).padStart(2, '0')}`,
    planning_abstract: 'A short directional summary for contract validation, not an article draft.',
    stream_ids: [streams[index % streams.length]!.stream_id],
    capability_status: index < 4 ? 'observed' : 'planned',
    evidence_refs: [],
    directional_only: true
  })),
  prologue_refs: ['https://x.com/Glen56121/status/2089976025677725798'],
  non_goals: ['engagement-driven ranking'],
  approved_by: 'human',
  change_reason: 'synthetic contract fixture',
  created_at: '2026-08-23T00:00:00.000Z'
};

export function topicInput(
  topicId: string,
  backlogState: AddResearchTopicInput['backlog_state']
): AddResearchTopicInput {
  return {
    topic_id: topicId,
    roadmap_id: roadmapInput.roadmap_id,
    revision: 1,
    previous_revision_ref: null,
    working_title: `Fixture ${topicId}`,
    stream_ids: ['knowledge_runtime_governance'],
    article_layer: 'question_model',
    backlog_state: backlogState,
    availability: 'available',
    claim_status: backlogState === 'evidence_ready' ? 'observed' : 'exploring',
    selection_ref: null,
    outcome_ref: null,
    thesis_hint: 'A bounded fixture thesis.',
    incremental_value: 'Adds a contract test case.',
    evidence_refs: backlogState === 'evidence_ready' ? ['source:fixture'] : [],
    boundary_notes: ['No production impact is claimed.'],
    source_refs: ['https://example.test/source'],
    changed_by: 'human',
    change_reason: 'synthetic contract fixture',
    created_at: '2026-08-23T00:00:00.000Z'
  };
}

export const backlogCatalogInput: CreateResearchBacklogCatalogInput = {
  roadmap_ref: {
    path: 'program/roadmaps/enterprise_ai_agent_runtime_202608/revisions/1.json',
    digest: `sha256:${'a'.repeat(64)}`
  },
  entries: [],
  counts: { evidence_ready: 0, researching: 0, long_term: 0 },
  rebuilt_at: '2026-08-23T00:00:00.000Z'
};

export const monthlyReviewInput: CreateMonthlyEditorialReviewInput = {
  review_id: 'review_2026_09',
  roadmap_ref: backlogCatalogInput.roadmap_ref,
  month_id: 'month_01',
  completed_outcome_refs: ['a', 'b', 'c', 'd'].map((id, index) => ({
    path: `program/weeks/week_${String(index + 1).padStart(2, '0')}/outcome.json`,
    digest: `sha256:${id.repeat(64)}`
  })),
  stream_coverage: ['knowledge_runtime_governance'],
  north_star_alignment: {
    status: 'aligned',
    rationale: 'Outcomes advance the approved question.'
  },
  claim_changes: [],
  implementation_evidence_refs: [],
  failure_refs: [],
  decision_refs: [],
  boundary_change_refs: [],
  open_question_refs: [],
  repeated_topic_refs: [],
  off_track_findings: [],
  next_candidate_topic_refs: [
    { path: 'program/backlog/topics/topic_a/revisions/1.json', digest: `sha256:${'a'.repeat(64)}` },
    { path: 'program/backlog/topics/topic_b/revisions/1.json', digest: `sha256:${'b'.repeat(64)}` },
    { path: 'program/backlog/topics/topic_c/revisions/1.json', digest: `sha256:${'c'.repeat(64)}` },
    { path: 'program/backlog/topics/topic_d/revisions/1.json', digest: `sha256:${'d'.repeat(64)}` }
  ],
  evidence_ready_count: 2,
  roadmap_change_requested: false,
  roadmap_change_reason: null,
  secondary_signals: {
    impressions: 0,
    likes: 0,
    replies: 0,
    followers: 0,
    stars: 0,
    issues: 0,
    reproductions: 0
  },
  reviewed_by: 'human',
  reviewed_at: '2026-09-30T12:00:00.000Z'
};

export const programStatusInput: CreateResearchProgramStatusInput = {
  roadmap_ref: backlogCatalogInput.roadmap_ref,
  backlog_catalog_ref: {
    path: 'program/backlog/catalog.json',
    digest: `sha256:${'b'.repeat(64)}`
  },
  latest_review_ref: null,
  active_cycle_refs: [],
  warnings: [],
  next_action: 'open_next_weekly_cycle',
  projected_at: '2026-08-23T00:00:00.000Z'
};

export const weeklyContextBinding = {
  query_id: 'query_week_01',
  plan_digest: `sha256:${'1'.repeat(64)}` as const,
  snapshot_digest: `sha256:${'2'.repeat(64)}` as const,
  review_digest: `sha256:${'3'.repeat(64)}` as const,
  selected_context_refs: ['context:runtime-boundary'],
  query_status: 'loaded' as const,
  application_status: 'applied' as const,
  runtime_version: '0.2.0' as const
};

export const weeklyCycleInput: OpenWeeklyCycleInput = {
  cycle_id: 'week_01_2026',
  roadmap_ref: backlogCatalogInput.roadmap_ref,
  week_number: 1,
  month_id: 'month_01',
  context_binding: weeklyContextBinding,
  opened_by: 'human',
  opened_at: '2026-08-24T08:00:00.000Z'
};

export function weeklyCandidateBrief(id: string): WeeklyCandidateBriefV1 {
  return {
    brief_id: `brief_${id}`,
    topic_ref: {
      path: `program/backlog/topics/topic_${id}/revisions/1.json`,
      digest: `sha256:${id.repeat(64).slice(0, 64)}` as `sha256:${string}`
    },
    stream_ids: ['knowledge_runtime_governance'],
    working_title: `Weekly Candidate ${id.toUpperCase()}`,
    thesis: 'The knowledge boundary should remain deterministic and evidence-backed.',
    claim_status: 'observed',
    implementation_status: 'implemented in a synthetic fixture',
    evidence_refs: [`evidence:${id}`],
    lineage_refs: [`lineage:${id}`],
    prior_publication_refs: [],
    incremental_value: `Adds bounded weekly evidence for candidate ${id}.`,
    boundaries: {
      established: ['The fixture contract is implemented.'],
      not_established: ['Production impact is not established.'],
      explicitly_not_claimed: ['No benchmark improvement is claimed.'],
      planned_work: ['Run a real-workflow validation later.']
    },
    recommended_form: 'x_article',
    visual_plan: [{
      purpose: 'architecture',
      required: false,
      brief: 'Show the Skill and Runtime boundary only when it materially improves clarity.'
    }],
    source_refs: [`source:${id}`],
    privacy: 'public'
  };
}

export const weeklyCandidateSetInput: SubmitWeeklyCandidatesInput = {
  candidate_set_id: 'candidate_set_week_01_2026',
  cycle_id: weeklyCycleInput.cycle_id,
  roadmap_ref: weeklyCycleInput.roadmap_ref,
  context_binding: weeklyContextBinding,
  candidates: [weeklyCandidateBrief('a'), weeklyCandidateBrief('b')],
  generated_by_skill: 'article-publishing-copilot',
  created_at: '2026-08-24T09:00:00.000Z'
};
