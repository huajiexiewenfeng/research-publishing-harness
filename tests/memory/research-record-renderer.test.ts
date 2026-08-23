import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

import { renderResearchRecord } from '../../harnesses/research-publishing/core/research-record-renderer.js';

describe('research record renderer', () => {
  it('renders stable data-only frontmatter and exact Human-promoted Markdown bytes', () => {
    const input = {
      record_type: 'research_increment' as const,
      frontmatter: {
        revision: 1, track_id: 'enterprise-agent-runtime',
        increment_id: 'increment_runtime_001', lifecycle_status: 'accepted',
        tags: ['agent-runtime', 'memory']
      },
      body: '# Runtime boundary\n\nHuman-promoted summary.\n'
    };
    const first = renderResearchRecord(input);
    const second = renderResearchRecord({ ...input, frontmatter: {
      tags: ['agent-runtime', 'memory'], lifecycle_status: 'accepted',
      increment_id: 'increment_runtime_001', track_id: 'enterprise-agent-runtime', revision: 1
    } });
    expect(first).toBe(second);
    const [, rawFrontmatter, body] = first.split('---\n');
    expect(parse(rawFrontmatter!)).toMatchObject({
      record_type: 'research_increment', instruction_policy: 'data_only',
      increment_id: 'increment_runtime_001', revision: 1
    });
    expect(body).toBe(input.body);
  });

  it('requires exact lookup identities and never synthesizes missing body text', () => {
    expect(() => renderResearchRecord({
      record_type: 'research_index_catalog',
      frontmatter: { index_id: 'enterprise-agent-runtime:research', track_id: 'enterprise-agent-runtime' },
      body: ''
    })).toThrowError(/generation|catalog_digest|body/i);
    expect(() => renderResearchRecord({
      record_type: 'claim_version',
      frontmatter: { claim_id: 'claim_001', version: 1 },
      body: '# Claim\n\u0000'
    })).toThrowError(/control/i);
  });
});
