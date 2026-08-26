export const RESEARCH_PROGRAM_POLICY_V1 = Object.freeze({
    schema_version: 'research-program-policy/v1',
    primary_track_id: 'enterprise-agent-runtime',
    horizon_weeks: 24,
    horizon_months: 6,
    minimum_articles_per_week: 1,
    minimum_articles_per_month: 4,
    minimum_articles_total: 24,
    minimum_weekly_candidates: 2,
    maximum_weekly_candidates: 3,
    minimum_evidence_ready_topics: 2,
    default_language: 'en',
    monthly_layers: [
        'question_model',
        'implementation_evidence',
        'project_skill_failure_tradeoff',
        'anchor_synthesis'
    ],
    publication_pair: ['x_article', 'x_single'],
    article_url_token: '{{X_ARTICLE_URL}}',
    article_url_rule: 'verified-x-article-canonical-url/v1',
    memory_policy_version: 'research-memory-policy/v1',
    runtime_requirement: { name: 'llm-wiki-runtime', version: '0.2.0' }
});
//# sourceMappingURL=research-program-policy.js.map