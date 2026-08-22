import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MemoryIngestService } from '../../harnesses/research-publishing/core/memory-ingest-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { FakeMemoryIngestRuntime } from './memory-ingest-runtime.fake.js';

export async function ingestFixture() {
  const root = await mkdtemp(join(tmpdir(), 'rph-ingest-'));
  const store = await WorkspaceStore.open(root);
  const configDir = join(root, 'memory', 'config');
  await mkdir(configDir, { recursive: true });
  const profilePath = join(configDir, 'llm-wiki-profile.yml');
  const mappingPath = join(configDir, 'ingest-mapping.yml');
  const scpPath = join(configDir, 'scp.yml');
  await writeFile(profilePath, 'profile: research-publishing\n', 'utf8');
  await writeFile(mappingPath, 'mapping: research-publishing\n', 'utf8');
  await writeFile(scpPath, 'scp: research-publishing\n', 'utf8');
  const receiptPath = 'receipts/source_publication.json';
  await store.writeNew(receiptPath, {
    receipt_id: 'publication_001', status: 'outcome_unknown', target_account: '@runtime_ai',
    public_result: null, created_at: '2026-08-22T10:00:00.000Z'
  });
  const receipt = await store.resolveExistingArtifact(receiptPath);
  const runtime = new FakeMemoryIngestRuntime();
  let receiptCounter = 0;
  const service = new MemoryIngestService(store, runtime, {
    profile_path: profilePath,
    mapping_path: mappingPath,
    scp_paths: [scpPath]
  }, {
    ingestId: () => 'ingest_001',
    approvalId: () => 'approval_ingest_001',
    receiptId: () => `memory_receipt_${++receiptCounter}`,
    now: () => new Date('2026-08-22T11:00:00.000Z')
  });
  return { root, store, runtime, service, mappingPath, receiptPath, receipt };
}
