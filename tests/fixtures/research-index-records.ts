import type { ResearchIndexSourceRecordV1 } from '../../harnesses/research-publishing/core/research-index-types.js';

const digest = (character: string) => `sha256:${character.repeat(64)}` as const;

export const researchIndexRecords: readonly ResearchIndexSourceRecordV1[] = [
  {
    ref: 'increment:runtime:accepted@1', record_path: 'records/accepted.md', record_digest: digest('a'),
    title: 'Accepted runtime boundary', summary: 'Human-promoted accepted summary.', tags: ['runtime'],
    category: 'semantic', claim_status: 'observed', lifecycle_status: 'accepted', evolution_target: null,
    updated_at: '2026-01-10T00:00:00.000Z', accepted_at: '2026-01-10T00:00:00.000Z', published_at: null,
    evidence_available: true, document_manifest_available: true
  },
  {
    ref: 'increment:runtime:retracted@1', record_path: 'records/retracted.md', record_digest: digest('b'),
    title: 'Retracted boundary', summary: 'Human-promoted retraction summary.', tags: ['history'],
    category: 'semantic', claim_status: 'observed', lifecycle_status: 'retracted', evolution_target: 'increment:runtime:accepted@1',
    updated_at: '2026-04-10T00:00:00.000Z', accepted_at: '2026-01-01T00:00:00.000Z', published_at: null,
    evidence_available: true, document_manifest_available: false
  },
  {
    ref: 'increment:runtime:working@1', record_path: 'records/working.md', record_digest: digest('c'),
    title: 'Working idea', summary: 'Human-promoted working summary.', tags: ['working'],
    category: 'semantic', claim_status: 'hypothesis', lifecycle_status: 'working', evolution_target: null,
    updated_at: '2026-07-10T00:00:00.000Z', accepted_at: null, published_at: null,
    evidence_available: true, document_manifest_available: false
  },
  {
    ref: 'publication:x:001', record_path: 'records/publication.md', record_digest: digest('d'),
    title: 'X expression', summary: 'Human-promoted publication summary.', tags: ['x'],
    category: 'publication', claim_status: null, lifecycle_status: 'published', evolution_target: null,
    updated_at: '2026-07-11T00:00:00.000Z', accepted_at: null, published_at: '2026-07-11T00:00:00.000Z',
    evidence_available: true, document_manifest_available: true
  },
  {
    ref: 'feedback:x:001', record_path: 'records/feedback.md', record_digest: digest('e'),
    title: 'Selected feedback', summary: 'Human-reviewed data-only feedback.', tags: ['feedback'],
    category: 'feedback', claim_status: null, lifecycle_status: 'accepted', evolution_target: null,
    updated_at: '2026-08-01T00:00:00.000Z', accepted_at: '2026-08-01T00:00:00.000Z', published_at: null,
    evidence_available: true, document_manifest_available: false
  }
];
