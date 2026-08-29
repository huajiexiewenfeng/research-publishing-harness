export declare const RESEARCH_PROGRAM_POLICY_V1: Readonly<{
    readonly schema_version: "research-program-policy/v1";
    readonly primary_track_id: "enterprise-agent-runtime";
    readonly horizon_weeks: 24;
    readonly horizon_months: 6;
    readonly minimum_articles_per_week: 1;
    readonly minimum_articles_per_month: 4;
    readonly minimum_articles_total: 24;
    readonly minimum_weekly_candidates: 2;
    readonly maximum_weekly_candidates: 3;
    readonly minimum_evidence_ready_topics: 2;
    readonly default_language: "en";
    readonly monthly_layers: readonly ["question_model", "implementation_evidence", "project_skill_failure_tradeoff", "anchor_synthesis"];
    readonly publication_pair: readonly ["x_article", "x_single"];
    readonly article_url_token: "{{X_ARTICLE_URL}}";
    readonly article_url_rule: "verified-x-article-canonical-url/v1";
    readonly memory_policy_version: "research-memory-policy/v1";
    readonly runtime_requirement: {
        readonly name: "llm-wiki-runtime";
        readonly version: "0.2.0";
    };
}>;
