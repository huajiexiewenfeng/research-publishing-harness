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
