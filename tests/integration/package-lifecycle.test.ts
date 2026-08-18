import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createGenerationTask } from '../../harnesses/research-publishing/core/generation.js';
import { PackageService } from '../../harnesses/research-publishing/core/package-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { researchPackage } from '../fixtures/research-package.js';

const candidate = {
  schema_version: '1.0',
  candidate_id: 'candidate_runtime',
  title: 'Evidence-bound runtime context',
  source_type: 'design',
  research_track: 'enterprise-agent-runtime',
  thesis_hint: 'Runtime context should carry evidence and boundaries.',
  source_refs: ['https://example.com/design'],
  privacy: 'public',
  status: 'idea',
  captured_at: '2026-08-18T12:00:00.000Z'
} as const;

describe('research package lifecycle', () => {
  it('qualifies, reviews and freezes immutable package versions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-lifecycle-'));
    const store = await WorkspaceStore.open(root);
    const service = new PackageService(store, () => new Date('2026-08-18T13:00:00.000Z'));

    await service.captureCandidate(candidate);
    await expect(service.qualifyCandidate(candidate.candidate_id, {})).rejects.toMatchObject({
      code: 'RESEARCH_GATE_BLOCKED'
    });

    const qualified = await service.qualifyCandidate(candidate.candidate_id, {
      novelty_hint: 'This makes the evidence boundary a runtime input instead of prompt prose.'
    });
    expect(qualified.status).toBe('evidence_ready');

    const draft = await service.buildPackage(qualified, {
      ...researchPackage,
      status: 'draft',
      package_id: 'package_runtime',
      version: 1
    });
    const reviewed = await service.reviewPackage(draft);
    expect(reviewed.package.status).toBe('reviewed');
    expect(reviewed.package.version).toBe(2);
    expect(reviewed.report.passed).toBe(true);

    const frozen = await service.freezePackage(reviewed.package);
    expect(frozen.package.status).toBe('frozen');
    expect(frozen.package.version).toBe(3);
    expect(frozen.digest).toMatch(/^sha256:[a-f0-9]{64}$/);

    await expect(service.freezePackage(reviewed.package)).rejects.toMatchObject({
      code: 'ARTIFACT_EXISTS'
    });
    await expect(
      store.readJson('packages/package_runtime/v2/package.json')
    ).resolves.toMatchObject({ status: 'reviewed', version: 2 });
  });

  it('creates a contract-valid generation task without internal-only sources', () => {
    const packageWithPrivateSource = {
      ...researchPackage,
      status: 'frozen',
      sources: [
        ...researchPackage.sources,
        {
          source_id: 'source_private',
          source_type: 'document',
          location: 'private design',
          access: 'private',
          publication_policy: 'internal_only'
        }
      ]
    } as const;

    const task = createGenerationTask(
      { run_id: 'run_article_1', branch: 'article', mode: 'deep_dive', language: 'en' },
      packageWithPrivateSource,
      ['Do not present planned work as shipped.']
    );

    expect(task.source_summaries.map((source) => source.source_id)).toEqual(['source_test']);
    expect(task.claims[1]).toMatchObject({ claim_status: 'planned' });
  });
});
