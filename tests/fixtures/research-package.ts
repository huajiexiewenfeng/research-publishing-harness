export const researchPackage = {
  schema_version: '1.0',
  package_id: 'rcp_2026_001',
  version: 1,
  status: 'reviewed',
  research_track: {
    id: 'enterprise-agent-runtime'
  },
  topic: 'Governed context for reliable agents',
  research_question: 'How should an agent receive evidence-backed context?',
  content_intent: {
    purpose: 'share_finding',
    audience: ['ai-agent-developers'],
    desired_discussion: ['context lifecycle']
  },
  thesis: {
    summary: 'Reliable context needs evidence, boundaries, and lifecycle.',
    claim_status: 'verified'
  },
  claims: [
    {
      claim_id: 'claim_verified',
      statement: 'The synthetic runtime validates context packages.',
      claim_status: 'verified',
      evidence_refs: ['evidence_test']
    },
    {
      claim_id: 'claim_planned',
      statement: 'A trace adapter is planned for a later version.',
      claim_status: 'planned',
      evidence_refs: []
    }
  ],
  evidence: [
    {
      evidence_id: 'evidence_test',
      source_ref: 'source_test',
      evidence_type: 'test',
      summary: 'A synthetic contract test validates the package.',
      supports: ['claim_verified'],
      reproducibility: 'public'
    }
  ],
  boundaries: {
    established: ['Contract validation is implemented in the synthetic example.'],
    not_established: ['Production impact has not been measured.'],
    explicitly_not_claimed: ['The runtime does not learn autonomously.'],
    planned_work: ['Explore trace adapters after V1.']
  },
  research_lineage: [
    {
      from: 'synthetic-design',
      to: 'synthetic-runtime',
      relationship: 'informed_by',
      explanation: 'The runtime follows the public synthetic design.'
    }
  ],
  open_questions: [
    {
      question: 'Which evidence should survive between runs?',
      importance: 'high'
    }
  ],
  sources: [
    {
      source_id: 'source_test',
      source_type: 'repository',
      location: 'https://example.com/synthetic-runtime',
      revision: 'abc123',
      access: 'public',
      publication_policy: 'cite'
    }
  ],
  privacy: {
    contains_private_material: false,
    review_required: false,
    blocked_items: []
  },
  created_at: '2026-08-18T12:00:00.000Z',
  updated_at: '2026-08-18T12:00:00.000Z'
} as const;
