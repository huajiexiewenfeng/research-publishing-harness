import { describe, expect, it } from 'vitest';

import {
  runEvidenceGate,
  runPrivacyGate,
  runPublishGate,
  runResearchGate
} from '../../harnesses/research-publishing/core/gates.js';
import { researchPackage } from '../fixtures/research-package.js';

describe('research gate', () => {
  it('accepts a package connected to a research track and increment', () => {
    expect(runResearchGate(researchPackage).passed).toBe(true);
  });

  it('blocks an external-signal-only package', () => {
    const externalOnly = {
      ...researchPackage,
      evidence: [
        {
          ...researchPackage.evidence[0],
          evidence_type: 'external_context',
          source_ref: 'source_external'
        }
      ],
      sources: [
        {
          ...researchPackage.sources[0],
          source_id: 'source_external',
          source_type: 'external'
        }
      ]
    };

    expect(runResearchGate(externalOnly)).toEqual(
      expect.objectContaining({
        passed: false,
        findings: expect.arrayContaining([
          expect.objectContaining({ code: 'EXTERNAL_SIGNAL_ONLY' })
        ])
      })
    );
  });
});

describe('evidence gate', () => {
  it('accepts verified evidence and explicitly planned work', () => {
    expect(runEvidenceGate(researchPackage).passed).toBe(true);
  });

  it('blocks a verified claim without evidence', () => {
    const missingEvidence = {
      ...researchPackage,
      claims: [
        {
          ...researchPackage.claims[0],
          evidence_refs: []
        }
      ]
    };

    expect(runEvidenceGate(missingEvidence).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'VERIFIED_WITHOUT_EVIDENCE' })
      ])
    );
  });

  it('blocks planned work described as already implemented', () => {
    const overstated = {
      ...researchPackage,
      claims: [
        {
          claim_id: 'claim_trace',
          statement: 'The Trace Runtime is implemented and available.',
          claim_status: 'planned',
          evidence_refs: []
        }
      ]
    };

    expect(runEvidenceGate(overstated).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CLAIM_STATUS_LANGUAGE_MISMATCH' })
      ])
    );
  });

  it('blocks public claims that depend on internal-only sources', () => {
    const internalOnly = {
      ...researchPackage,
      sources: [
        {
          ...researchPackage.sources[0],
          access: 'restricted',
          publication_policy: 'internal_only'
        }
      ]
    };

    expect(runEvidenceGate(internalOnly).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INTERNAL_ONLY_CLAIM' })
      ])
    );
  });
});

describe('privacy gate', () => {
  it.each([
    'C:\\Users\\alice\\private-notes.md',
    '/home/alice/private-notes.md',
    'Authorization: Bearer secret-token-value',
    'Cookie: auth=session-secret'
  ])('blocks sensitive value %s', (sensitive) => {
    expect(runPrivacyGate({ text: sensitive }).passed).toBe(false);
  });

  it('accepts public synthetic content', () => {
    expect(runPrivacyGate(researchPackage).passed).toBe(true);
  });
});

describe('publish gate', () => {
  const request = {
    publication_digest: `sha256:${'a'.repeat(64)}`,
    target_account: '@synthetic',
    adapter: 'manual' as const,
    target_post_id: null
  };
  const approval = {
    ...request,
    expires_at: '2030-01-01T00:00:00.000Z'
  };

  it('blocks a publication without approval', () => {
    expect(runPublishGate(request).passed).toBe(false);
  });

  it('accepts an exact, unexpired approval', () => {
    expect(
      runPublishGate(request, approval, new Date('2026-08-18T12:00:00.000Z'))
        .passed
    ).toBe(true);
  });

  it('blocks approval for another account', () => {
    expect(
      runPublishGate(
        request,
        { ...approval, target_account: '@different' },
        new Date('2026-08-18T12:00:00.000Z')
      ).passed
    ).toBe(false);
  });
});
