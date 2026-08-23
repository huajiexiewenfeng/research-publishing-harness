import { sha256Bytes } from '../../harnesses/research-publishing/core/digest.js';
import { HarnessError } from '../../harnesses/research-publishing/core/errors.js';
import { ResearchIndexProjector } from '../../harnesses/research-publishing/core/research-index-projector.js';
import type { PlanResearchQueryInput } from '../../harnesses/research-publishing/core/research-query-types.js';
import { renderResearchRecord } from '../../harnesses/research-publishing/core/research-record-renderer.js';
import type { RuntimeContextResult } from '../../harnesses/research-publishing/core/memory-types.js';

const track = 'enterprise-agent-runtime';

export class FakeProgressiveRuntime {
  readonly calls: string[] = [];
  readonly contents = new Map<string, string>();
  catalogPath = '';
  catalogDigest = `sha256:${'0'.repeat(64)}` as const;
  unavailable = false;
  catalogFound = true;
  returnUnplannedPath = false;

  async findRecords() {
    this.calls.push('find:catalog');
    if (this.unavailable) throw new HarnessError('MEMORY_RUNTIME_UNAVAILABLE', 'runtime unavailable');
    if (!this.catalogFound) {
      return { status: 'not_found' as const, record_type: 'research_index_catalog' as const, matches: [] as const };
    }
    return {
      status: 'found' as const, record_type: 'research_index_catalog' as const,
      matches: [{
        path: this.catalogPath, checksum: this.catalogDigest,
        identity: `${track}:research`, display: `${track}:research`, fields: {}
      }] as const
    };
  }

  async loadPaths(input: { readonly paths: readonly string[] }): Promise<RuntimeContextResult> {
    this.calls.push(`load:${input.paths.join(',')}`);
    const items = input.paths.map((path, index) => {
      const content = this.contents.get(path);
      if (content === undefined) throw new Error(`missing fake Runtime path ${path}`);
      return {
        path: this.returnUnplannedPath && index === 0 ? 'domains/research-publishing/**' : path,
        checksum: sha256Bytes(Buffer.from(content, 'utf8')), content,
        instruction_policy: 'data_only' as const, sanitized: false, risk_flags: []
      };
    });
    return { status: items.length === 0 ? 'empty' : 'loaded', runtime_version: '0.2.0', items, excluded_count: 0, truncated_count: 0 };
  }
}

export function progressiveQueryFixture() {
  const semanticContent = renderResearchRecord({
    record_type: 'claim_version',
    frontmatter: { claim_id: 'runtime_boundary', version: 1, claim_status: 'observed' },
    body: '# Runtime boundary\n\nDeterministic access belongs in the Runtime.\n'
  });
  const semanticPath = `domains/research-publishing/tracks/${track}/claims/runtime_boundary/versions/1.md`;
  const semanticDigest = sha256Bytes(Buffer.from(semanticContent, 'utf8'));
  const projection = new ResearchIndexProjector().project({
    track_id: track, prior_catalog: null,
    records: [{
      ref: 'claim:runtime_boundary@1', record_path: semanticPath, record_digest: semanticDigest,
      title: 'Runtime boundary', summary: 'Deterministic access belongs in the Runtime.',
      tags: ['runtime'], category: 'semantic', claim_status: 'observed', lifecycle_status: 'accepted',
      evolution_target: null, updated_at: '2026-08-23T02:00:00.000Z',
      accepted_at: '2026-08-23T02:00:00.000Z', published_at: null,
      evidence_available: true, document_manifest_available: false
    }]
  });
  const shard = projection.shards.find((item) => item.record.view === 'mainline')!;
  const runtime = new FakeProgressiveRuntime();
  runtime.catalogPath = projection.catalog_path;
  runtime.catalogDigest = projection.catalog_content_digest;
  runtime.contents.set(projection.catalog_path, projection.catalog_content);
  for (const projectedShard of projection.shards) {
    runtime.contents.set(projectedShard.path, projectedShard.content);
  }
  runtime.contents.set(semanticPath, semanticContent);
  const input: PlanResearchQueryInput = {
    query_id: 'query_progressive_001', track_id: track,
    query_intent: 'Explain the deterministic Runtime boundary.', view: 'mainline',
    include_working: false, selection_terms: ['runtime', 'boundary'],
    selection_rationale: 'The promoted summary directly addresses the question.', document_mode: 'none',
    catalog_ref: { path: projection.catalog_path, digest: projection.catalog_content_digest, generation: projection.generation },
    selected_shard_refs: [{ shard_id: shard.record.shard_id, path: shard.path, digest: shard.content_digest, generation: projection.generation, view: 'mainline' }],
    selected_record_refs: [{ ref: 'claim:runtime_boundary@1', path: semanticPath, digest: semanticDigest, evidence_refs: [], document_manifest_ref: null }],
    selected_manifest_refs: [], selected_chunk_refs: [], created_at: '2026-08-23T02:10:00.000Z'
  };
  return { runtime, input, projection, shard, semanticPath };
}
