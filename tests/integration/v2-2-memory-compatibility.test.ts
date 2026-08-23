import { describe, expect, it } from 'vitest';

import type { RuntimeLoadPathsInput, RuntimeLoadPathsResult } from '../../harnesses/research-publishing/adapters/llm-wiki/runtime-protocol.js';
import { LegacyMemoryAdapter } from '../../harnesses/research-publishing/core/legacy-memory-adapter.js';

describe('V2.2 read-only memory compatibility', () => {
  it('cannot independently satisfy or enter a V2.3 Research Increment', async () => {
    const path = 'domains/research-publishing/tracks/enterprise-agent-runtime/publications/legacy.md';
    const checksum = `sha256:${'a'.repeat(64)}` as const;
    const runtime = {
      async loadPaths(input: RuntimeLoadPathsInput): Promise<RuntimeLoadPathsResult> {
        void input;
        return {
          status: 'loaded', runtime_version: '0.2.0', excluded_count: 0, truncated_count: 0,
          items: [{ path, checksum, content: 'legacy', instruction_policy: 'data_only', sanitized: false, risk_flags: [] }]
        };
      }
    };
    const adapter = new LegacyMemoryAdapter(runtime);
    const [binding] = await adapter.attachAsSupportingEvidence([{
      record_type: 'publication_evidence', path, checksum
    }]);
    expect(binding).toMatchObject({
      supporting_only: true, eligible_for_mainline: false, requires_import_promotion: true
    });
    expect(binding).not.toHaveProperty('research_question');
    expect(binding).not.toHaveProperty('thesis');
    expect(adapter).not.toHaveProperty('write');
    expect(adapter).not.toHaveProperty('update');
    expect(adapter).not.toHaveProperty('promote');
  });
});
