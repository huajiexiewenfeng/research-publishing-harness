import { describe, expect, it } from 'vitest';

import { PublicationExpressionService } from '../../harnesses/research-publishing/core/publication-expression-service.js';
import { createPublicationExpressionFixtures } from '../fixtures/publication-expression-evidence.js';

describe('Publication Expression security', () => {
  it('rejects a stale or tampered Plan digest', async () => {
    const { store, fixtures } = await createPublicationExpressionFixtures();
    await expect(new PublicationExpressionService(store).assemble({
      ...fixtures.x_thread,
      intent: { ...fixtures.x_thread.intent, digest: `sha256:${'f'.repeat(64)}` }
    })).rejects.toMatchObject({ code: 'APPROVAL_STALE' });
  });

  it('rejects contained-path escapes before reading artifacts', async () => {
    const { store, fixtures } = await createPublicationExpressionFixtures();
    await expect(new PublicationExpressionService(store).assemble({
      ...fixtures.article,
      intent: { ...fixtures.article.intent, path: '../outside.json' }
    })).rejects.toMatchObject({ code: 'WORKSPACE_PATH_INVALID' });
  });

  it('rejects privacy downgrade', async () => {
    const { store, fixtures } = await createPublicationExpressionFixtures();
    await expect(new PublicationExpressionService(store).assemble({
      ...fixtures.article,
      intent: { ...fixtures.article.intent, privacy_classification: 'restricted' },
      target_privacy_classification: 'public'
    })).rejects.toMatchObject({ code: 'PRIVACY_GATE_BLOCKED' });
  });

  it('rejects claim escalation in a derived expression', async () => {
    const { store, fixtures } = await createPublicationExpressionFixtures();
    await expect(new PublicationExpressionService(store).assemble({
      ...fixtures.x_single,
      derivation_type: 'compression',
      expression_claim_statuses: { 'claim:runtime-boundary@1': 'verified' }
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });
});

