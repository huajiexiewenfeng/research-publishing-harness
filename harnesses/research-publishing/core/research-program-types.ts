import type { ResearchQueryStatusV2 } from './research-query-types.js';

export type ResearchStreamId =
  | 'knowledge_runtime_governance'
  | 'project_harness_lifecycle'
  | 'skill_cognitive_runtime'
  | 'runtime_evolution'
  | 'enterprise_validation';

export type MonthlyArticleLayer =
  | 'question_model'
  | 'implementation_evidence'
  | 'project_skill_failure_tradeoff'
  | 'anchor_synthesis';

export type ClaimBoundaryStatus =
  | 'shipped'
  | 'validated'
  | 'observed'
  | 'exploring'
  | 'planned'
  | 'hypothesis';

export type ResearchBacklogState = 'evidence_ready' | 'researching' | 'long_term';
export type ResearchTopicAvailability = 'available' | 'reserved' | 'completed' | 'retired';

export interface ResearchArtifactRefV1 {
  readonly path: string;
  readonly digest: `sha256:${string}`;
}

export interface ResearchStreamV1 {
  readonly stream_id: ResearchStreamId;
  readonly name: string;
  readonly project_refs: readonly string[];
  readonly research_questions: readonly string[];
  readonly relationship_notes: readonly string[];
}

export interface ResearchStageV1 {
  readonly stage_id:
    | 'week_01_04_wiki_contract'
    | 'week_05_12_failure_trace'
    | 'week_13_20_trace_eval'
    | 'week_21_24_synthesis';
  readonly start_week: number;
  readonly end_week: number;
  readonly window_role: 'target_only';
  readonly progression_mode: 'evidence_gated';
  readonly objective: string;
  readonly completion_signals: readonly string[];
  readonly capability_status: ClaimBoundaryStatus;
  readonly evidence_refs: readonly string[];
}

export interface PublicationClockV1 {
  readonly minimum_articles_per_week: 1;
  readonly minimum_articles_per_month: 4;
  readonly minimum_articles_total: 24;
  readonly default_language: 'en';
  readonly default_publication_pair: readonly ['x_article', 'x_single'];
  readonly optional_chinese_translation: true;
  readonly research_notes_kpi: null;
  readonly replies_kpi: null;
}

export interface ArticleSlotV1 {
  readonly slot_id: string;
  readonly week_number: number;
  readonly month_id: string;
  readonly article_layer: MonthlyArticleLayer;
  readonly working_title: string;
  readonly planning_abstract: string;
  readonly stream_ids: readonly ResearchStreamId[];
  readonly capability_status: ClaimBoundaryStatus;
  readonly evidence_refs: readonly string[];
  readonly directional_only: true;
}

export interface ResearchRoadmapV1 {
  readonly schema_version: 'research-roadmap/v1';
  readonly roadmap_id: string;
  readonly revision: number;
  readonly previous_revision_ref: ResearchArtifactRefV1 | null;
  readonly title: string;
  readonly north_star: { readonly en: string; readonly zh_CN: string };
  readonly primary_track_id: 'enterprise-agent-runtime';
  readonly target_account: string;
  readonly research_streams: readonly ResearchStreamV1[];
  readonly research_stages: readonly ResearchStageV1[];
  readonly publication_clock: PublicationClockV1;
  readonly article_slots: readonly ArticleSlotV1[];
  readonly prologue_refs: readonly string[];
  readonly non_goals: readonly string[];
  readonly approved_by: string;
  readonly change_reason: string;
  readonly created_at: string;
  readonly roadmap_digest: `sha256:${string}`;
}

export interface ResearchTopicRevisionV1 {
  readonly schema_version: 'research-topic-revision/v1';
  readonly topic_id: string;
  readonly roadmap_id: string;
  readonly revision: number;
  readonly previous_revision_ref: ResearchArtifactRefV1 | null;
  readonly working_title: string;
  readonly stream_ids: readonly ResearchStreamId[];
  readonly article_layer: MonthlyArticleLayer;
  readonly backlog_state: ResearchBacklogState;
  readonly availability: ResearchTopicAvailability;
  readonly claim_status: ClaimBoundaryStatus;
  readonly selection_ref: ResearchArtifactRefV1 | null;
  readonly outcome_ref: ResearchArtifactRefV1 | null;
  readonly thesis_hint: string;
  readonly incremental_value: string;
  readonly evidence_refs: readonly string[];
  readonly boundary_notes: readonly string[];
  readonly source_refs: readonly string[];
  readonly changed_by: string;
  readonly change_reason: string;
  readonly created_at: string;
  readonly revision_digest: `sha256:${string}`;
}

export interface SecondarySignalsV1 {
  readonly impressions: number;
  readonly likes: number;
  readonly replies: number;
  readonly followers: number;
  readonly stars: number;
  readonly issues: number;
  readonly reproductions: number;
}

export interface MonthlyEditorialReviewV1 {
  readonly schema_version: 'monthly-editorial-review/v1';
  readonly review_id: string;
  readonly roadmap_ref: ResearchArtifactRefV1;
  readonly month_id: string;
  readonly completed_outcome_refs: readonly ResearchArtifactRefV1[];
  readonly stream_coverage: readonly ResearchStreamId[];
  readonly north_star_alignment: {
    readonly status: 'aligned' | 'needs_revision';
    readonly rationale: string;
  };
  readonly claim_changes: readonly {
    readonly claim_ref: string;
    readonly disposition: 'strengthened' | 'weakened' | 'rejected' | 'unchanged';
    readonly evidence_refs: readonly string[];
  }[];
  readonly implementation_evidence_refs: readonly string[];
  readonly failure_refs: readonly string[];
  readonly decision_refs: readonly string[];
  readonly boundary_change_refs: readonly string[];
  readonly open_question_refs: readonly string[];
  readonly repeated_topic_refs: readonly string[];
  readonly off_track_findings: readonly string[];
  readonly next_candidate_topic_refs: readonly [
    ResearchArtifactRefV1,
    ResearchArtifactRefV1,
    ResearchArtifactRefV1,
    ResearchArtifactRefV1
  ];
  readonly evidence_ready_count: number;
  readonly cadence_met: boolean;
  readonly research_progress_met: boolean;
  readonly evidence_ready_guard_met: boolean;
  readonly roadmap_change_requested: boolean;
  readonly roadmap_change_reason: string | null;
  readonly secondary_signals: SecondarySignalsV1;
  readonly reviewed_by: string;
  readonly reviewed_at: string;
  readonly review_digest: `sha256:${string}`;
}

export interface ResearchBacklogCatalogV1 {
  readonly schema_version: 'research-backlog-catalog/v1';
  readonly roadmap_ref: ResearchArtifactRefV1;
  readonly entries: readonly {
    readonly topic_id: string;
    readonly current_revision_ref: ResearchArtifactRefV1;
    readonly backlog_state: ResearchBacklogState;
    readonly availability: ResearchTopicAvailability;
    readonly claim_status: ClaimBoundaryStatus;
  }[];
  readonly counts: {
    readonly evidence_ready: number;
    readonly researching: number;
    readonly long_term: number;
  };
  readonly rebuilt_at: string;
  readonly catalog_digest: `sha256:${string}`;
}

export type ProgramNextAction =
  | 'replenish_evidence_ready_backlog'
  | 'open_next_weekly_cycle'
  | 'complete_active_week'
  | 'run_monthly_editorial_review'
  | 'review_requested_roadmap_change'
  | 'six_month_synthesis_due';

export interface ResearchProgramStatusV1 {
  readonly schema_version: 'research-program-status/v1';
  readonly roadmap_ref: ResearchArtifactRefV1;
  readonly backlog_catalog_ref: ResearchArtifactRefV1;
  readonly latest_review_ref: ResearchArtifactRefV1 | null;
  readonly active_cycle_refs: readonly ResearchArtifactRefV1[];
  readonly warnings: readonly string[];
  readonly next_action: ProgramNextAction;
  readonly projected_at: string;
  readonly projection_digest: `sha256:${string}`;
}

export interface WeeklyContextBindingV1 {
  readonly query_id: string;
  readonly plan_digest: `sha256:${string}`;
  readonly snapshot_digest: `sha256:${string}`;
  readonly review_digest: `sha256:${string}`;
  readonly selected_context_refs: readonly string[];
  readonly query_status: ResearchQueryStatusV2;
  readonly application_status: 'applied' | 'reviewed_not_applied';
  readonly runtime_version: '0.2.0' | null;
}

export interface WeeklyCandidateBriefV1 {
  readonly brief_id: string;
  readonly topic_ref: ResearchArtifactRefV1;
  readonly stream_ids: readonly ResearchStreamId[];
  readonly working_title: string;
  readonly thesis: string;
  readonly claim_status: ClaimBoundaryStatus;
  readonly implementation_status: string;
  readonly evidence_refs: readonly string[];
  readonly lineage_refs: readonly string[];
  readonly prior_publication_refs: readonly string[];
  readonly incremental_value: string;
  readonly boundaries: {
    readonly established: readonly string[];
    readonly not_established: readonly string[];
    readonly explicitly_not_claimed: readonly string[];
    readonly planned_work: readonly string[];
  };
  readonly recommended_form: 'x_article';
  readonly visual_plan: readonly {
    readonly purpose: 'cover' | 'explanation' | 'architecture' | 'evidence';
    readonly required: boolean;
    readonly brief: string;
  }[];
  readonly source_refs: readonly string[];
  readonly privacy: 'public' | 'needs_review';
}

export interface WeeklyCandidateSetV1 {
  readonly schema_version: 'weekly-candidate-set/v1';
  readonly candidate_set_id: string;
  readonly cycle_id: string;
  readonly roadmap_ref: ResearchArtifactRefV1;
  readonly context_binding: WeeklyContextBindingV1;
  readonly candidates: readonly WeeklyCandidateBriefV1[];
  readonly generated_by_skill: 'article-publishing-copilot';
  readonly created_at: string;
  readonly candidate_set_digest: `sha256:${string}`;
}

export interface WeeklyTopicSelectionV1 {
  readonly schema_version: 'weekly-topic-selection/v1';
  readonly selection_id: string;
  readonly cycle_id: string;
  readonly candidate_set_digest: `sha256:${string}`;
  readonly selected_brief_id: string;
  readonly selection_source: 'human_explicit';
  readonly selected_by: string;
  readonly selected_at: string;
  readonly selection_digest: `sha256:${string}`;
}

export interface WeeklyResearchCycleV1 {
  readonly schema_version: 'weekly-research-cycle/v1';
  readonly cycle_id: string;
  readonly roadmap_ref: ResearchArtifactRefV1;
  readonly week_number: number;
  readonly month_id: string;
  readonly context_binding: WeeklyContextBindingV1;
  readonly opened_by: string;
  readonly opened_at: string;
  readonly cycle_digest: `sha256:${string}`;
}

export type WeeklyCyclePhase =
  | 'opened'
  | 'candidates_submitted'
  | 'topic_selected'
  | 'package_compiled'
  | 'package_frozen'
  | 'article_finalized'
  | 'publication_planned'
  | 'published'
  | 'blocked'
  | 'cancelled';

export interface WeeklyCycleStatusV1 {
  readonly schema_version: 'weekly-cycle-status/v1';
  readonly cycle_ref: ResearchArtifactRefV1;
  readonly phase: WeeklyCyclePhase;
  readonly candidate_set_ref: ResearchArtifactRefV1 | null;
  readonly selection_ref: ResearchArtifactRefV1 | null;
  readonly cancellation_ref: ResearchArtifactRefV1 | null;
  readonly package_ref: ResearchArtifactRefV1 | null;
  readonly article_ref: ResearchArtifactRefV1 | null;
  readonly bundle_ref: ResearchArtifactRefV1 | null;
  readonly outcome_ref: ResearchArtifactRefV1 | null;
  readonly blocked_reason: string | null;
  readonly updated_at: string;
  readonly projection_digest: `sha256:${string}`;
}

export interface WeeklyCycleCancellationV1 {
  readonly schema_version: 'weekly-cycle-cancellation/v1';
  readonly cancellation_id: string;
  readonly cycle_ref: ResearchArtifactRefV1;
  readonly selection_ref: ResearchArtifactRefV1;
  readonly reason: string;
  readonly cancelled_by: string;
  readonly cancelled_at: string;
  readonly cancellation_digest: `sha256:${string}`;
}

export type CreateResearchRoadmapInput = Omit<
  ResearchRoadmapV1,
  'schema_version' | 'roadmap_digest'
>;

export interface ReviseResearchRoadmapInput {
  readonly roadmap: CreateResearchRoadmapInput;
  readonly confirmed_current_digest: `sha256:${string}`;
}

export type AddResearchTopicInput = Omit<
  ResearchTopicRevisionV1,
  'schema_version' | 'revision_digest'
>;

export interface ReviseResearchTopicInput {
  readonly topic: AddResearchTopicInput;
  readonly confirmed_current_digest: `sha256:${string}`;
}

export interface ReserveResearchTopicInput {
  readonly topic_ref: ResearchArtifactRefV1;
  readonly selection_ref: ResearchArtifactRefV1;
  readonly changed_by: string;
  readonly changed_at: string;
}

export interface ReleaseResearchTopicInput {
  readonly topic_ref: ResearchArtifactRefV1;
  readonly release_reason: string;
  readonly changed_by: string;
  readonly changed_at: string;
}

export interface CompleteResearchTopicInput {
  readonly topic_ref: ResearchArtifactRefV1;
  readonly outcome_ref: ResearchArtifactRefV1;
  readonly changed_by: string;
  readonly changed_at: string;
}

export type CreateResearchBacklogCatalogInput = Omit<
  ResearchBacklogCatalogV1,
  'schema_version' | 'catalog_digest'
>;

export type CreateMonthlyEditorialReviewInput = Omit<
  MonthlyEditorialReviewV1,
  | 'schema_version'
  | 'cadence_met'
  | 'research_progress_met'
  | 'evidence_ready_guard_met'
  | 'review_digest'
>;

export type CreateResearchProgramStatusInput = Omit<
  ResearchProgramStatusV1,
  'schema_version' | 'projection_digest'
>;

export type OpenWeeklyCycleInput = Omit<
  WeeklyResearchCycleV1,
  'schema_version' | 'cycle_digest'
>;

export type SubmitWeeklyCandidatesInput = Omit<
  WeeklyCandidateSetV1,
  'schema_version' | 'candidate_set_digest'
>;

export type SelectWeeklyTopicInput = Omit<
  WeeklyTopicSelectionV1,
  'schema_version' | 'selection_id' | 'selection_digest'
>;

export interface CancelWeeklyCycleInput {
  readonly cycle_id: string;
  readonly confirmed_selection_digest: `sha256:${string}`;
  readonly reason: string;
  readonly cancelled_by: string;
  readonly cancelled_at: string;
}

export type CreateWeeklyCycleStatusInput = Omit<
  WeeklyCycleStatusV1,
  'schema_version' | 'projection_digest'
>;

export interface ResearchRoadmapPort {
  create(input: CreateResearchRoadmapInput): Promise<ResearchRoadmapV1>;
  revise(input: ReviseResearchRoadmapInput): Promise<ResearchRoadmapV1>;
  current(roadmapId: string): Promise<ResearchRoadmapV1>;
}

export interface ResearchBacklogPort {
  add(input: AddResearchTopicInput): Promise<ResearchTopicRevisionV1>;
  revise(input: ReviseResearchTopicInput): Promise<ResearchTopicRevisionV1>;
  reserve(input: ReserveResearchTopicInput): Promise<ResearchTopicRevisionV1>;
  release(input: ReleaseResearchTopicInput): Promise<ResearchTopicRevisionV1>;
  complete(input: CompleteResearchTopicInput): Promise<ResearchTopicRevisionV1>;
  catalog(roadmapId: string): Promise<ResearchBacklogCatalogV1>;
  rebuildCatalog(roadmapId: string): Promise<ResearchBacklogCatalogV1>;
  assertCadenceReady(roadmapId: string): Promise<void>;
}

export interface WeeklyResearchCyclePort {
  open(input: OpenWeeklyCycleInput): Promise<WeeklyResearchCycleV1>;
  submitCandidates(input: SubmitWeeklyCandidatesInput): Promise<WeeklyCandidateSetV1>;
  select(input: SelectWeeklyTopicInput): Promise<WeeklyTopicSelectionV1>;
  cancel(input: CancelWeeklyCycleInput): Promise<WeeklyCycleStatusV1>;
  status(cycleId: string): Promise<WeeklyCycleStatusV1>;
}
