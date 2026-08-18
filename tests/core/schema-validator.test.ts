import { describe, expect, it } from 'vitest';

import { validateContract } from '../../harnesses/research-publishing/core/schema-validator.js';

const candidate = {
  schema_version: '1.0',
  candidate_id: 'candidate_2026_001',
  title: 'Deterministic context should be governed',
  source_type: 'design',
  research_track: 'enterprise-agent-runtime',
  thesis_hint: 'Reliable context requires explicit evidence and lifecycle.',
  novelty_hint: 'Treat context selection as a governed runtime contract.',
  source_refs: ['source_design_001'],
  privacy: 'public',
  status: 'idea',
  captured_at: '2026-08-18T12:00:00.000Z'
} as const;

describe('validateContract', () => {
  it('returns a valid contract value', () => {
    expect(validateContract('candidate', candidate)).toEqual(candidate);
  });

  it('rejects unknown fields with a stable error code', () => {
    expect(() =>
      validateContract('candidate', { ...candidate, unexpected: true })
    ).toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });

  it('rejects invalid date-time formats', () => {
    expect(() =>
      validateContract('candidate', { ...candidate, captured_at: 'today' })
    ).toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });
});
