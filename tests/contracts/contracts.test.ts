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
  'x-article-existing-draft-binding',
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
  'research-context-review-v2',
  'research-index-doctor-report',
  'research-index-rebuild-plan',
  'research-roadmap',
  'research-topic-revision',
  'research-backlog-catalog',
  'monthly-editorial-review',
  'research-program-status',
  'weekly-research-cycle',
  'weekly-candidate-set',
  'weekly-topic-selection',
  'weekly-cycle-cancellation',
  'weekly-cycle-status',
  'publication-bundle-plan',
  'publication-bundle-approval',
  'publication-bundle-status',
  'publication-bundle-execution-binding',
  'publication-bundle-receipt-binding',
  'weekly-publication-bundle-binding',
  'materialized-single-publication',
  'derived-article-authorization',
  'derived-single-authorization',
  'publication-bundle-receipt',
  'weekly-publication-outcome',
  'weekly-outcome-closure',
  'weekly-outcome-status',
  'claim-projection',
  'weekly-research-increment-binding',
  'weekly-research-bridge-status',
  'synthesis-input-snapshot',
  'research-synthesis-candidate',
  'research-synthesis-attempt',
  'research-synthesis-revision',
  'research-continuation-proposal',
  'research-synthesis-status'
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
  'research-index-shard',
  'research-index-doctor-report',
  'research-index-rebuild-plan',
  'research-roadmap',
  'research-topic-revision',
  'research-backlog-catalog',
  'monthly-editorial-review',
  'research-program-status',
  'weekly-research-cycle',
  'weekly-candidate-set',
  'weekly-topic-selection',
  'weekly-cycle-cancellation',
  'weekly-cycle-status',
  'publication-bundle-plan',
  'publication-bundle-approval',
  'publication-bundle-status',
  'publication-bundle-execution-binding',
  'publication-bundle-receipt-binding',
  'weekly-publication-bundle-binding',
  'materialized-single-publication',
  'derived-article-authorization',
  'derived-single-authorization',
  'publication-bundle-receipt',
  'weekly-publication-outcome',
  'weekly-outcome-closure',
  'weekly-outcome-status',
  'claim-projection',
  'weekly-research-increment-binding',
  'weekly-research-bridge-status',
  'synthesis-input-snapshot',
  'research-synthesis-candidate',
  'research-synthesis-attempt',
  'research-synthesis-revision',
  'research-continuation-proposal',
  'research-synthesis-status'
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
        ? '1.2'
        : v1Names.has(name)
        ? '1.0'
        : name.endsWith('v2-1')
          ? '2.1'
        : name.startsWith('visual-')
            ? '1.0'
            : name === 'x-article-existing-draft-binding'
              ? 'v1'
            : '2.0';
      expect(schema.$id).toBe(`rph://contracts/${name}/${version}`);
      expect(schema.additionalProperties).toBe(false);
    });
  }
});
