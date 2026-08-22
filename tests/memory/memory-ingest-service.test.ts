import { writeFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { ingestFixture } from './memory-ingest-fixture.js';

describe('MemoryIngestService execution', () => {
  it('invalidates exact approval before writes when mapping bytes change', async () => {
    const { service, runtime, mappingPath, receiptPath, receipt } = await ingestFixture();
    const plan = await service.planPublicationCheckpoint({
      receipt_path: receiptPath, receipt_digest: receipt.digest,
      research_track: 'enterprise-agent-runtime', publication_id: 'publication_001'
    });
    const approval = await service.approve(plan.ingest_id, 'human-reviewer', 600_000);
    await writeFile(mappingPath, 'mapping: changed\n', 'utf8');
    await expect(service.execute(plan.ingest_id, approval)).rejects.toMatchObject({
      code: 'APPROVAL_STALE'
    });
    expect(runtime.count('copySource')).toBe(0);
  });

  it('runs the fixed Runtime sequence and creates a terminal Receipt', async () => {
    const { service, runtime, receiptPath, receipt } = await ingestFixture();
    const plan = await service.planPublicationCheckpoint({
      receipt_path: receiptPath, receipt_digest: receipt.digest,
      research_track: 'enterprise-agent-runtime', publication_id: 'publication_001'
    });
    const approval = await service.approve(plan.ingest_id, 'human-reviewer', 600_000);
    const result = await service.execute(plan.ingest_id, approval);
    expect(result.status).toBe('succeeded');
    expect(result.steps.map((step) => step.name)).toEqual([
      'validate_mapping', 'copy_source', 'write_records', 'register_artifact', 'append_log'
    ]);
    expect(runtime.calls.map((call) => call.method)).toEqual([
      'validateMapping', 'version', 'validateMapping', 'copySource',
      'writeRecord', 'registerArtifact', 'appendLog'
    ]);
    expect(await service.status(plan.ingest_id)).toMatchObject({ state: 'finalized' });
  });

  it('resumes after source copy without replaying finalized steps', async () => {
    const { service, runtime, receiptPath, receipt } = await ingestFixture();
    const plan = await service.planPublicationCheckpoint({
      receipt_path: receiptPath, receipt_digest: receipt.digest,
      research_track: 'enterprise-agent-runtime', publication_id: 'publication_001'
    });
    const approval = await service.approve(plan.ingest_id, 'human-reviewer', 600_000);
    runtime.failOnce('writeRecord');
    const first = await service.execute(plan.ingest_id, approval);
    expect(first.status).toBe('partial');
    expect(first.resume_cursor).toBe('write_records');
    const final = await service.resume(plan.ingest_id, approval);
    expect(final.status).toBe('succeeded');
    expect(runtime.count('copySource')).toBe(1);
    expect(runtime.count('writeRecord')).toBe(2);
  });
});
