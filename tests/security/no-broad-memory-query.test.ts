import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('V2.3 broad-load prohibition', () => {
  it('keeps progressive Query and Index maintenance free of broad Runtime paths', async () => {
    const files = [
      'harnesses/research-publishing/core/progressive-research-query-service.ts',
      'harnesses/research-publishing/core/research-query-selector.ts',
      'harnesses/research-publishing/core/research-index-maintenance-service.ts'
    ];
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      expect(source, file).not.toContain('domains/research-publishing/**');
      expect(source, file).not.toMatch(/glob[_-]json[^\n]*\*/i);
    }
  });
});
