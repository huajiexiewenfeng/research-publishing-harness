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
  'browser-observation',
  'publish-receipt-v2',
  'visual-asset-ref',
  'visual-manifest',
  'visual-review-report',
  'publication-plan-v2-1',
  'approval-v2-1',
  'publish-receipt-v2-1',
  'memory-query-plan',
  'context-snapshot',
  'publication-feedback-snapshot',
  'candidate-insight-proposal',
  'memory-ingest-plan',
  'memory-ingest-approval',
  'memory-ingest-receipt',
  'artifact-ref-v2',
  'research-evidence-snapshot',
  'research-increment-revision',
  'claim-version',
  'research-decision',
  'open-question-version',
  'research-evolution-edge',
  'publication-expression',
  'queryable-canonical-document',
  'research-lifecycle-event',
  'semantic-memory-delta',
  'semantic-promotion-review',
  'memory-promotion-plan-v2',
  'memory-promotion-approval-v2',
  'memory-promotion-receipt-v2',
  'research-index-catalog',
  'research-index-shard',
  'research-query-plan-v2',
  'research-context-snapshot-v2',
  'research-context-review-v2'
] as const;

const v1Names = new Set([
  'candidate',
  'generation-task',
  'article-draft',
  'x-draft',
  'review-report',
  'approval',
  'publish-receipt',
  'memory-query-plan',
  'context-snapshot',
  'publication-feedback-snapshot',
  'candidate-insight-proposal',
  'memory-ingest-plan',
  'memory-ingest-approval',
  'memory-ingest-receipt',
  'research-evidence-snapshot',
  'research-increment-revision',
  'claim-version',
  'research-decision',
  'open-question-version',
  'research-evolution-edge',
  'publication-expression',
  'queryable-canonical-document',
  'research-lifecycle-event',
  'semantic-memory-delta',
  'semantic-promotion-review',
  'research-index-catalog',
  'research-index-shard'
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

      const version = name === 'artifact-ref-v2'
        ? '2.3'
        : name === 'research-content-package'
        ? '1.1'
        : v1Names.has(name)
        ? '1.0'
        : name.endsWith('v2-1')
          ? '2.1'
          : name.startsWith('visual-')
            ? '1.0'
            : '2.0';
      expect(schema.$id).toBe(`rph://contracts/${name}/${version}`);
      expect(schema.additionalProperties).toBe(false);
    });
  }
});
