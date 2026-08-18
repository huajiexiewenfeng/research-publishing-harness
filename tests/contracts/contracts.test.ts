import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const names = [
  'candidate',
  'research-content-package',
  'generation-task',
  'article-draft',
  'x-draft',
  'review-report',
  'approval',
  'publish-receipt'
] as const;

describe('public contracts', () => {
  for (const name of names) {
    it(`${name} has a stable v1 id and rejects unknown fields`, async () => {
      const raw = await readFile(
        new URL(
          `../../harnesses/research-publishing/contracts/${name}.schema.json`,
          import.meta.url
        ),
        'utf8'
      );
      const schema = JSON.parse(raw) as {
        $id: string;
        additionalProperties: boolean;
      };

      expect(schema.$id).toBe(`rph://contracts/${name}/1.0`);
      expect(schema.additionalProperties).toBe(false);
    });
  }
});
