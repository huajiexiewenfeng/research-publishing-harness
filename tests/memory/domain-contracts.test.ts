import { readFile } from 'node:fs/promises';

import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

async function yaml(path: string): Promise<Record<string, unknown>> {
  return parse(await readFile(path, 'utf8')) as Record<string, unknown>;
}

describe('research-publishing LLM Wiki domain assets', () => {
  it('declares create-only research records, append-only events, and bounded context', async () => {
    const profile = await yaml('harnesses/research-publishing/memory/llm-wiki-profile.yml') as any;
    expect(profile.profile).toMatchObject({ id: 'research-publishing', version: 'v0.1' });
    expect(profile.write_rules.records).toEqual({
      publication_evidence: {
        path: 'domains/research-publishing/tracks/{research_track}/publications/{publication_id}.md',
        mode: 'create_only',
        required_vars: ['research_track', 'publication_id'],
        required_refs: ['source_id']
      },
      feedback_snapshot: {
        path: 'domains/research-publishing/tracks/{research_track}/feedback/{feedback_id}.md',
        mode: 'create_only',
        required_vars: ['research_track', 'feedback_id'],
        required_refs: ['source_id', 'publication_id']
      },
      candidate_insight: {
        path: 'domains/research-publishing/tracks/{research_track}/insights/{insight_id}.md',
        mode: 'create_only',
        required_vars: ['research_track', 'insight_id'],
        required_refs: ['source_id', 'feedback_id']
      }
    });
    expect(profile.logs.types.memory_event).toEqual({
      path: 'logs/research-publishing-memory-event.jsonl',
      mode: 'append_only'
    });
    expect(profile.read_rules.context_pack).toMatchObject({
      include: ['domains/research-publishing/**'],
      exclude: ['sources/originals/**', '.meta/**'],
      order: 'path_asc'
    });
  });

  it('binds mapping validation to the internal harness and semantics to Article/X Skills', async () => {
    const mapping = await yaml('harnesses/research-publishing/memory/ingest-mapping.yml') as any;
    const harnessScp = await yaml('harnesses/research-publishing/memory/scp.yml') as any;
    const articleScp = await yaml('skills/article-publishing-copilot/scp.yml') as any;
    const xScp = await yaml('skills/x-publishing-copilot/scp.yml') as any;

    expect(mapping.mapping).toMatchObject({
      id: 'research-publishing-memory',
      version: 'v0.1',
      domain: 'research-publishing',
      owner_skill_id: 'research-publishing-harness-memory'
    });
    expect(mapping.produces).toEqual([
      { record_type: 'publication_evidence' },
      { record_type: 'feedback_snapshot' },
      { record_type: 'candidate_insight' },
      { log_type: 'memory_event' }
    ]);
    expect(harnessScp.skill).toEqual({ id: 'research-publishing-harness-memory', domain: 'research-publishing' });

    for (const [id, scp] of [
      ['article-publishing-copilot', articleScp],
      ['x-publishing-copilot', xScp]
    ] as const) {
      expect(scp.skill).toEqual({ id, domain: 'research-publishing' });
      expect(scp.query).toEqual({ primary_domain: 'research-publishing', supports: [] });
      expect(scp.llm_wiki).toMatchObject({ profile: 'research-publishing', required: false });
      expect(scp.ingest.produces).toEqual(expect.arrayContaining([
        { domain: 'research-publishing', record_type: 'publication_evidence' },
        { domain: 'research-publishing', record_type: 'feedback_snapshot' },
        { domain: 'research-publishing', record_type: 'candidate_insight' }
      ]));
    }
  });
});
