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
  'publish-receipt',
  'publication-plan-v2',
  'approval-v2',
  'browser-execution-event',
  'browser-command',
  'browser-observation'
] as const;

const v1Names = new Set([
  'candidate',
  'research-content-package',
  'generation-task',
  'article-draft',
  'x-draft',
  'review-report',
  'approval',
  'publish-receipt'
]);

describe('public contracts', () => {
  for (const name of names) {
    it(`${name} has a stable versioned id and rejects unknown fields`, async () => {
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

      const version = v1Names.has(name) ? '1.0' : '2.0';
      expect(schema.$id).toBe(`rph://contracts/${name}/${version}`);
      expect(schema.additionalProperties).toBe(false);
    });
  }
});
