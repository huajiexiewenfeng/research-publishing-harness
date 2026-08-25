import { describe, expect, it } from 'vitest';

import type { WeeklyResearchIncrementBindingV1 } from '../../harnesses/research-publishing/core/research-bridge-types.js';
import type { PublicationExpressionV1 } from '../../harnesses/research-publishing/core/research-memory-types.js';
import { WeeklyResearchBridgeService } from '../../harnesses/research-publishing/core/weekly-research-bridge-service.js';
import { createClosedPhase4OutcomeFixture } from '../fixtures/phase-4-research-loop.js';

describe('WeeklyResearchBridgeService', () => {
  it('assembles one working Increment and two independent Expressions', async () => {
    const fixture = await createClosedPhase4OutcomeFixture();
    const bridge = new WeeklyResearchBridgeService(fixture.store, {
      now: () => new Date('2026-08-24T12:05:00.000Z')
    });

    const status = await bridge.assemble({
      cycle_id: fixture.cycle_id,
      workspace_identity_digest: fixture.workspace_identity_digest
    });
    const root = `program/weeks/${fixture.cycle_id}/research-bridge`;
    const binding = await fixture.store.readJson<WeeklyResearchIncrementBindingV1>(
      `${root}/increment-binding.json`
    );
    const article = await fixture.store.readJson<PublicationExpressionV1>(
      `${root}/article-expression.json`
    );
    const single = await fixture.store.readJson<PublicationExpressionV1>(
      `${root}/single-expression.json`
    );

    expect(status.phase).toBe('complete');
    expect(binding.track_id).toBe('enterprise-agent-runtime');
    expect(binding.binding_policy).toBe('one-outcome-one-increment/v1');
    expect(binding.increment_ref)
      .toBe(`increment:${binding.track_id}:${binding.increment_id}@1`);
    expect(article.channel).toBe('x_article');
    expect(single.channel).toBe('x_single');
    expect(article.expression_id).not.toBe(single.expression_id);
  });

  it('is idempotent for an exact retry', async () => {
    const fixture = await createClosedPhase4OutcomeFixture();
    const bridge = new WeeklyResearchBridgeService(fixture.store);
    const input = {
      cycle_id: fixture.cycle_id,
      workspace_identity_digest: fixture.workspace_identity_digest
    };

    const first = await bridge.assemble(input);
    const second = await bridge.assemble(input);

    expect(second).toEqual(first);
  });
});
