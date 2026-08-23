import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
import type { ResearchImportManifestV1 } from '../../harnesses/research-publishing/core/research-import-service.js';
import type { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

export async function firstIncrementImportFixture(store: WorkspaceStore): Promise<ResearchImportManifestV1> {
  await store.writeNew('articles/import/mother.md', '# Skill / Runtime boundary\n\nDeterministic knowledge access belongs in the Runtime.\n');
  await store.writeNew('receipts/import-thread.json', {
    receipt_id: 'receipt_import_thread', status: 'manual_recorded',
    public_result: { url: 'https://x.com/Glen56121/status/2089976025677725798', published_at: '2026-02-09T00:00:00.000Z' }
  });
  const mother = await store.resolveExistingArtifact('articles/import/mother.md');
  const receipt = await store.resolveExistingArtifact('receipts/import-thread.json');
  const body = {
    schema_version: 'research-import-manifest/v1' as const,
    import_id: 'import_first_runtime_boundary',
    import_scope: 'single_increment' as const,
    workspace_identity_digest: sha256({ workspace: 'synthetic-import' }),
    track_id: 'enterprise-agent-runtime',
    increment: {
      increment_id: 'increment_skill_runtime_boundary', revision: 1 as const,
      title: 'Where should Skill memory end?',
      research_question: 'Which knowledge concerns belong in a Skill versus a deterministic Runtime?',
      thesis: 'Domain semantics belong in the Skill; deterministic knowledge access belongs in the Runtime.',
      summary: 'The first imported research increment and its publication lineage.',
      tags: ['enterprise-agent-runtime', 'memory'],
      claim_refs: ['claim:skill-runtime-boundary@1'],
      boundary_refs: ['boundary:no-production-impact'],
      open_question_refs: ['question:trace@1', 'question:eval@1', 'question:controlled-loop@1'],
      source_refs: ['gist:a507a4b080bdbd2e30cf8a05556b3f15']
    },
    mother_article: {
      path: mother.relative_path, digest: mother.digest, source_classification: 'local_verified' as const
    },
    gist: {
      url: 'https://gist.github.com/huajiexiewenfeng/a507a4b080bdbd2e30cf8a05556b3f15',
      source_classification: 'user_asserted' as const
    },
    thread: {
      root_url: 'https://x.com/Glen56121/status/2089976025677725798',
      source_classification: 'user_asserted' as const,
      receipt: { path: receipt.relative_path, digest: receipt.digest },
      items: Array.from({ length: 6 }, (_, index) => ({
        ordinal: index + 1,
        text: `Imported research thread item ${index + 1}`,
        content_digest: sha256(`Imported research thread item ${index + 1}`),
        platform_id: index < 2 ? String(2089976025677725798n + BigInt(index)) : null,
        public_url: index < 2 ? `https://x.com/Glen56121/status/${2089976025677725798n + BigInt(index)}` : null,
        metrics: null,
        source_classification: index < 2 ? 'receipt_backed' as const : 'user_asserted' as const
      }))
    },
    claims: [{
      claim_id: 'skill_runtime_boundary', version: 1,
      statement: 'Domain semantics belong in the Skill; deterministic knowledge access belongs in the Runtime.',
      claim_status: 'observed' as const,
      evidence_refs: ['evidence:import'], boundary_refs: ['boundary:no-production-impact'],
      summary: 'A boundary extracted from working PDC and llm-wiki-runtime experience.'
    }],
    boundaries: {
      established: ['The HR Skill integration works in the author’s own use.'],
      not_established: ['No public production benchmark or business-impact evidence.'],
      planned_work: ['Trace', 'Eval', 'Controlled Loop']
    },
    explicit_assertions: [{
      field: 'thread.item_order', value: 'The supplied six items are in publication order.',
      source_classification: 'user_asserted' as const
    }],
    imported_at: '2026-08-23T04:00:00.000Z'
  };
  return { ...body, manifest_digest: sha256(body) };
}
