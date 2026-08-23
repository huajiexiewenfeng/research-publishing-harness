import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ResearchIncrementService } from '../../harnesses/research-publishing/core/research-increment-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

describe('Research Increment path and lineage security', () => {
  it.each(['../escape', 'UPPERCASE', 'space id'])(
    'rejects unsafe Increment id %s before writing',
    async (increment_id) => {
      const root = await mkdtemp(join(tmpdir(), 'rph-increment-path-'));
      const service = new ResearchIncrementService(await WorkspaceStore.open(root));
      await expect(service.assemble({
        increment_id, revision: 1, title: 'Title', research_question: 'Question?', thesis: 'Thesis.',
        summary: 'Summary.', document_manifest_refs: [], tags: [], claim_refs: [], decision_refs: [],
        boundary_refs: [], open_question_refs: [], source_refs: [],
        evidence_snapshot_refs: ['evidence:missing'], predecessor_refs: []
      })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
    }
  );

  it('rejects an unresolved predecessor rather than trusting a cross-track ref string', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-increment-predecessor-'));
    const service = new ResearchIncrementService(await WorkspaceStore.open(root));
    await expect(service.assemble({
      increment_id: 'increment_runtime', revision: 1, title: 'Title',
      research_question: 'Question?', thesis: 'Thesis.', summary: 'Summary.',
      document_manifest_refs: [], tags: [], claim_refs: [], decision_refs: [], boundary_refs: [],
      open_question_refs: [], source_refs: [], evidence_snapshot_refs: ['evidence:missing'],
      predecessor_refs: ['increment:thinking-skills:missing@1']
    })).rejects.toMatchObject({ code: 'ARTIFACT_NOT_FOUND' });
  });
});
