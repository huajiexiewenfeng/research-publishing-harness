import { describe, expect, it } from 'vitest';

import { PublicationExpressionService } from '../../harnesses/research-publishing/core/publication-expression-service.js';
import {
  createConflictingPublicationFixture,
  createPublicationExpressionFixtures
} from '../fixtures/publication-expression-evidence.js';

describe('PublicationExpressionService', () => {
  it.each(['article', 'x_article', 'x_thread', 'x_single', 'x_reply', 'gist', 'github_article'] as const)(
    'assembles %s without changing source claim status',
    async (channel) => {
      const { store, fixtures } = await createPublicationExpressionFixtures();
      const expression = await new PublicationExpressionService(store).assemble(fixtures[channel]);
      expect(expression.channel).toBe(channel);
      expect(expression.claim_refs).toEqual(fixtures[channel].claim_refs);
      expect(expression.evidence_snapshot_refs).toEqual(fixtures[channel].evidence_snapshot_refs);
      expect(expression.verification_level).toBe(fixtures[channel].expected_verification);
    }
  );

  it('preserves intended truth when public verification conflicts', async () => {
    const { store, input, approvedDigest } = await createConflictingPublicationFixture();
    const expression = await new PublicationExpressionService(store).assemble(input);
    expect(expression.intended_content.content_digest).toBe(approvedDigest);
    expect(expression.observed_content?.unexpected_content).not.toEqual([]);
    expect(expression.verification_level).toBe('conflict');
  });

  it.each(['translation', 'compression', 'adaptation'] as const)(
    'keeps canonical claim status for %s expressions',
    async (derivation_type) => {
      const { store, fixtures } = await createPublicationExpressionFixtures();
      const input = { ...fixtures.x_single, derivation_type };
      const expression = await new PublicationExpressionService(store).assemble(input);
      expect(expression.claim_refs).toEqual(['claim:runtime-boundary@1']);
    }
  );
});

