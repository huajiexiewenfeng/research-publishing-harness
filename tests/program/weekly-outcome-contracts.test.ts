import { describe, expect, it } from 'vitest';

import {
  assertWeeklyPublicationOutcome,
  createWeeklyOutcomeClosure,
  createWeeklyOutcomeStatus,
  createWeeklyPublicationOutcome
} from '../../harnesses/research-publishing/core/weekly-outcome-contracts.js';
import type { ResearchArtifactRefV1 } from '../../harnesses/research-publishing/core/research-program-types.js';
import { createCompletedPhase4BundleFixture } from '../fixtures/phase-4-research-loop.js';

const now = '2026-08-25T08:00:00.000Z';

function ref(path: string, token: string): ResearchArtifactRefV1 {
  return { path, digest: `sha256:${token.repeat(64).slice(0, 64)}` };
}

const outcomeInput = {
  outcome_id: 'outcome_week_01_2026',
  cycle_ref: ref('program/weeks/week_01_2026/cycle.json', '1'),
  roadmap_ref: ref('program/roadmaps/enterprise_ai_agent_runtime_202608/revisions/1.json', '2'),
  topic_ref: ref('program/backlog/topics/topic_b/revisions/2.json', '3'),
  selection_ref: ref('program/weeks/week_01_2026/selection.json', '4'),
  research_content_package_ref: ref('program/weeks/week_01_2026/package.json', '5'),
  weekly_article_ref: ref('program/weeks/week_01_2026/article.json', '6'),
  article_package_ref: ref('articles/runtime-boundary/article_bundle_1/package-ref.json', '7'),
  bundle_plan_ref: ref('runs/bundle_week_01_2026/publication-bundle/plan.json', '8'),
  bundle_approval_ref: ref('runs/bundle_week_01_2026/publication-bundle/approval.json', '9'),
  bundle_receipt_ref: ref('runs/bundle_week_01_2026/publication-bundle/receipt.json', 'a'),
  article: {
    plan_ref: ref('runs/x_article_run_bundle_1/x-article/plan.json', 'b'),
    receipt_ref: ref('receipts/receipt_article_execution_bundle_1.json', 'c'),
    public_url: 'https://x.com/Glen56121/article/2091000000000000000',
    published_at: '2026-08-24T12:02:00.000Z',
    verification_status: 'public_browser_verified',
    limitations: []
  },
  single: {
    plan_ref: ref('runs/x_single_run_bundle_1/x/plan.json', 'd'),
    receipt_ref: ref('receipts/single_receipt_finalized.json', 'e'),
    public_url: 'https://x.com/Glen56121/status/2092000000000000000',
    published_at: '2026-08-24T12:03:03.000Z',
    verification_status: 'public_browser_verified',
    limitations: []
  },
  research_stream_ids: ['knowledge_runtime_governance'] as const,
  package_claim_refs: ['package:research_package_001:claim:claim_verified'],
  package_evidence_refs: ['package:research_package_001:evidence:evidence_test'],
  package_boundary_refs: ['package:research_package_001:boundary:not_established:0'],
  package_open_question_refs: ['package:research_package_001:open-question:0'],
  issued_at: now
};

describe('Weekly Outcome contracts', () => {
  it('derives one immutable factual Outcome from exact contained refs', () => {
    const outcome = createWeeklyPublicationOutcome(outcomeInput);

    expect(outcome).toMatchObject({
      schema_version: 'weekly-publication-outcome/v1',
      public_urls: [
        outcomeInput.article.public_url,
        outcomeInput.single.public_url
      ],
      research_stream_ids: ['knowledge_runtime_governance']
    });
    expect(outcome.outcome_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(() => assertWeeklyPublicationOutcome(outcome)).not.toThrow();
  });

  it('rejects a changed public URL after the Outcome is installed', () => {
    const outcome = createWeeklyPublicationOutcome(outcomeInput);

    expect(() => assertWeeklyPublicationOutcome({
      ...outcome,
      article: {
        ...outcome.article,
        public_url: 'https://x.com/other/article/1'
      }
    })).toThrowError(/Outcome digest|public URL/);
  });

  it('rejects refs that escape the workspace or the exact Weekly Cycle', () => {
    expect(() => createWeeklyPublicationOutcome({
      ...outcomeInput,
      selection_ref: ref('../selection.json', 'f')
    })).toThrowError(/workspace-relative|Weekly Cycle/);
  });

  it('binds the released Topic revision before closure is complete', () => {
    const outcome = createWeeklyPublicationOutcome(outcomeInput);
    const closure = createWeeklyOutcomeClosure({
      outcome_ref: ref('program/weeks/week_01_2026/outcome.json', outcome.outcome_digest.slice(7, 8)),
      released_topic_ref: ref('program/backlog/topics/topic_b/revisions/3.json', 'f'),
      closed_at: now
    });

    expect(closure.status).toBe('complete');
    expect(closure.closure_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('creates a closed status projection only with both source refs', () => {
    const status = createWeeklyOutcomeStatus({
      cycle_id: 'week_01_2026',
      phase: 'complete',
      outcome_ref: ref('program/weeks/week_01_2026/outcome.json', 'a'),
      released_topic_ref: ref('program/backlog/topics/topic_b/revisions/3.json', 'b'),
      blocked_reason: null,
      updated_at: now
    });

    expect(status.phase).toBe('complete');
    expect(status.projection_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('provides a completed local Bundle backed by real Program services', async () => {
    const fixture = await createCompletedPhase4BundleFixture();
    const catalog = await fixture.backlog.catalog('enterprise_ai_agent_runtime_202608');
    const selected = catalog.entries.find((entry) => entry.topic_id === fixture.topic_id);

    expect(fixture.bundle_receipt.status).toBe('completed');
    expect((await fixture.weeks.status(fixture.cycle_id)).phase).toBe('publication_planned');
    expect(selected?.availability).toBe('reserved');
    expect((await fixture.roadmaps.current('enterprise_ai_agent_runtime_202608')).primary_track_id)
      .toBe('enterprise-agent-runtime');
  });
});
