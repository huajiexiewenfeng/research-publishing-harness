import { describe, expect, it } from 'vitest';

import {
  createMonthlyEditorialReview,
  createResearchBacklogCatalog,
  createResearchProgramStatus,
  createResearchRoadmap,
  createResearchTopicRevision
} from '../../harnesses/research-publishing/core/research-program-contracts.js';
import { RESEARCH_PROGRAM_POLICY_V1 } from '../../harnesses/research-publishing/core/research-program-policy.js';
import {
  backlogCatalogInput,
  monthlyReviewInput,
  programStatusInput,
  roadmapInput,
  topicInput
} from '../fixtures/research-program.js';

describe('research program contracts', () => {
  it('locks the confirmed six-month cadence', () => {
    expect(RESEARCH_PROGRAM_POLICY_V1).toMatchObject({
      horizon_weeks: 24,
      horizon_months: 6,
      minimum_articles_per_week: 1,
      minimum_articles_per_month: 4,
      minimum_articles_total: 24,
      minimum_weekly_candidates: 2,
      maximum_weekly_candidates: 3,
      minimum_evidence_ready_topics: 2
    });
  });

  it('requires five distinct streams and twenty-four article slots', () => {
    expect(() => createResearchRoadmap({ ...roadmapInput, research_streams: [] }))
      .toThrowError(/five Research Streams/);
    expect(() => createResearchRoadmap({
      ...roadmapInput,
      article_slots: roadmapInput.article_slots.slice(0, 23)
    })).toThrowError(/twenty-four Article Slots/);
  });

  it('keeps research progression evidence-gated and independent from publication weeks', () => {
    const roadmap = createResearchRoadmap(roadmapInput);
    expect(roadmap.research_stages.every((stage) =>
      stage.window_role === 'target_only' && stage.progression_mode === 'evidence_gated'
    )).toBe(true);
  });

  it('requires every month to contain the four distinct article layers', () => {
    const duplicateLayer = roadmapInput.article_slots.map((slot, index) =>
      index === 1 ? { ...slot, article_layer: 'question_model' as const } : slot
    );
    expect(() => createResearchRoadmap({ ...roadmapInput, article_slots: duplicateLayer }))
      .toThrowError(/four monthly Article layers/);
  });

  it('rejects planning abstracts outside the directional metadata budget', () => {
    const shortAbstract = roadmapInput.article_slots.map((slot, index) =>
      index === 0 ? { ...slot, planning_abstract: 'Too short.' } : slot
    );
    expect(() => createResearchRoadmap({ ...roadmapInput, article_slots: shortAbstract }))
      .toThrowError(/planning abstract/);
  });

  it('requires evidence before shipped or validated Roadmap claims', () => {
    const unsupported = roadmapInput.article_slots.map((slot, index) =>
      index === 0 ? { ...slot, capability_status: 'shipped' as const } : slot
    );
    expect(() => createResearchRoadmap({ ...roadmapInput, article_slots: unsupported }))
      .toThrowError(/shipped or validated/);
  });

  it('computes revision digests without self-reference', () => {
    const topic = createResearchTopicRevision(topicInput('topic_fixture', 'evidence_ready'));
    expect(topic.revision_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(createResearchTopicRevision(topicInput('topic_fixture', 'evidence_ready'))).toEqual(topic);
  });

  it('requires Evidence Ready topics to contain evidence and a boundary', () => {
    expect(() => createResearchTopicRevision({
      ...topicInput('topic_fixture', 'evidence_ready'),
      evidence_refs: []
    })).toThrowError(/Evidence Ready/);
  });

  it('keeps engagement outside cadence and research progress', () => {
    const baseline = createMonthlyEditorialReview(monthlyReviewInput);
    const highEngagement = createMonthlyEditorialReview({
      ...monthlyReviewInput,
      secondary_signals: {
        impressions: 1_000_000,
        likes: 100_000,
        replies: 10_000,
        followers: 50_000,
        stars: 5_000,
        issues: 500,
        reproductions: 100
      }
    });
    expect(highEngagement.cadence_met).toBe(baseline.cadence_met);
    expect(highEngagement.research_progress_met).toBe(baseline.research_progress_met);
  });

  it('requires exactly four next-candidate refs for a Monthly Review', () => {
    expect(() => createMonthlyEditorialReview({
      ...monthlyReviewInput,
      next_candidate_topic_refs: monthlyReviewInput.next_candidate_topic_refs.slice(0, 3)
    } as unknown as typeof monthlyReviewInput)).toThrowError(/four next-Candidate Topic refs/);
  });

  it('creates deterministic Catalog and Program Status digests', () => {
    const catalog = createResearchBacklogCatalog(backlogCatalogInput);
    const status = createResearchProgramStatus(programStatusInput);
    expect(catalog.catalog_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(status.projection_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(createResearchBacklogCatalog(backlogCatalogInput)).toEqual(catalog);
    expect(createResearchProgramStatus(programStatusInput)).toEqual(status);
  });
});
