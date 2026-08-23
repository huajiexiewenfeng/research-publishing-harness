import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ResearchImportService, type ResearchImportManifestV1 } from '../../harnesses/research-publishing/core/research-import-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

const v23Production = [
  'research-terminal-hooks.ts', 'research-import-service.ts', 'research-flywheel-service.ts',
  'progressive-research-query-service.ts', 'memory-promotion-service.ts'
];

describe('Research Data Flywheel V2.3 security', () => {
  it('contains no network client, shell execution, broad Query glob, or direct Wiki write fallback', async () => {
    const sources = await Promise.all(v23Production.map((name) =>
      readFile(resolve('harnesses/research-publishing/core', name), 'utf8')
    ));
    const combined = sources.join('\n');
    expect(combined).not.toMatch(/(?:fetch\s*\(|https?\.request|child_process|execFile|spawn\s*\()/);
    expect(combined).not.toContain('domains/research-publishing/**');
    expect(combined).not.toMatch(/(?:write|copy|rename).*\.llm-wiki/is);
  });

  it('ships an inspectable example without credentials or a workstation absolute path', async () => {
    const text = await readFile(resolve('docs/examples/research-import-manifest.example.json'), 'utf8');
    expect(text).not.toMatch(/cookie|password|private[_ -]?key|recovery[_ -]?code|[A-Z]:\\Users\\/i);
    const manifest = JSON.parse(text) as ResearchImportManifestV1;
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-v23-security-')));
    const report = await new ResearchImportService(store).inspect(manifest);
    expect(report).toMatchObject({ import_id: 'import_first_runtime_boundary', item_order: [1, 2, 3, 4, 5, 6] });
  });
});
