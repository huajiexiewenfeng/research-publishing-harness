import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createLLMWikiRuntimeAdapter } from '../../harnesses/research-publishing/adapters/llm-wiki/runtime-adapter.js';
import { HarnessError } from '../../harnesses/research-publishing/core/errors.js';
import { FakeRuntimeProcessRunner } from './fake-runtime-process.js';

function paths() {
  return {
    executable: resolve('fixtures/python.exe'),
    workspace: resolve('fixtures/publishing-workspace'),
    profile_path: resolve('harnesses/research-publishing/memory/llm-wiki-profile.yml'),
    mapping_path: resolve('harnesses/research-publishing/memory/ingest-mapping.yml'),
    scp_paths: [
      resolve('harnesses/research-publishing/memory/scp.yml'),
      resolve('skills/article-publishing-copilot/scp.yml'),
      resolve('skills/x-publishing-copilot/scp.yml')
    ]
  } as const;
}

const envelope = (value: Record<string, unknown>) => ({
  warnings: [], next_actions: [], context_refs: [], ...value
});

describe('LLMWikiRuntimeAdapter', () => {
  it('spawns python module mode with fixed argv and no shell', async () => {
    const runner = new FakeRuntimeProcessRunner();
    runner.enqueue(envelope({ status: 'ok', version: '0.2.0' }));
    const adapter = createLLMWikiRuntimeAdapter({
      launcher: 'python-module', expected_version: '0.2.0', ...paths(), runner
    });
    await expect(adapter.version()).resolves.toBe('0.2.0');
    expect(runner.calls[0]).toEqual({
      executable: paths().executable,
      args: ['-m', 'llm_wiki_runtime.cli', 'version'],
      cwd: paths().workspace,
      shell: false,
      timeout_ms: 15_000,
      max_output_bytes: 1_048_576
    });
  });

  it('doctors version, config, SCP registry, and mapping through fixed commands', async () => {
    const runner = new FakeRuntimeProcessRunner();
    runner.enqueue(envelope({ status: 'ok', version: '0.2.0' }));
    runner.enqueue(envelope({
      status: 'enabled', enabled: true, scope_root: paths().workspace,
      wiki_root: resolve(paths().workspace, '.llm-wiki'), primary_profile: 'research-publishing'
    }));
    runner.enqueue(envelope({ status: 'ok', version: 'v0.1', skills: {}, domains: {} }));
    runner.enqueue(envelope({ status: 'ok', mapping_id: 'research-publishing-memory' }));
    const adapter = createLLMWikiRuntimeAdapter({
      launcher: 'console-script', expected_version: '0.2.0', ...paths(), runner
    });
    await expect(adapter.doctor()).resolves.toMatchObject({
      status: 'ok', runtime_version: '0.2.0', configured: true,
      profile: 'research-publishing', mapping_id: 'research-publishing-memory'
    });
    expect(runner.calls.map((call) => call.args[0])).toEqual([
      'version', 'resolve-config', 'scan-scp', 'validate-mapping'
    ]);
    expect(runner.calls[2]!.args).toContain('--write');
    expect(runner.calls[3]!.args).toEqual([
      'validate-mapping', '--mapping-path', paths().mapping_path,
      '--registry-path', resolve(paths().workspace, 'memory/runtime/skill-registry.json'),
      '--profile-path', paths().profile_path
    ]);
  });

  it('degrades Query failures but fails closed for incompatible versions and Ingest', async () => {
    const queryRunner = new FakeRuntimeProcessRunner();
    queryRunner.error = new HarnessError('MEMORY_RUNTIME_UNAVAILABLE', 'runtime unavailable');
    const queryAdapter = createLLMWikiRuntimeAdapter({
      launcher: 'console-script', expected_version: '0.2.0', ...paths(), runner: queryRunner
    });
    await expect(queryAdapter.query({
      allowed_paths: ['domains/research-publishing/tracks/enterprise-agent-runtime/**'],
      excluded_paths: ['sources/originals/**', '.meta/**'],
      max_items: 8,
      max_item_chars: 4_000,
      ordering_policy: 'path_asc'
    })).resolves.toMatchObject({ status: 'unavailable', runtime_version: null, items: [] });

    const incompatible = new FakeRuntimeProcessRunner();
    incompatible.enqueue(envelope({ status: 'ok', version: '0.1.0' }));
    const incompatibleAdapter = createLLMWikiRuntimeAdapter({
      launcher: 'console-script', expected_version: '0.2.0', ...paths(), runner: incompatible
    });
    await expect(incompatibleAdapter.version()).rejects.toMatchObject({
      code: 'MEMORY_RUNTIME_INCOMPATIBLE'
    });

    const ingestRunner = new FakeRuntimeProcessRunner();
    ingestRunner.enqueue(envelope({ status: 'validation_error', error: 'rejected' }), 2);
    const ingestAdapter = createLLMWikiRuntimeAdapter({
      launcher: 'console-script', expected_version: '0.2.0', ...paths(), runner: ingestRunner
    });
    await expect(ingestAdapter.validateMapping()).rejects.toMatchObject({
      code: 'MEMORY_RUNTIME_FAILED'
    });
  });

  it('treats exact already_exists write results as idempotent success', async () => {
    const runner = new FakeRuntimeProcessRunner();
    runner.enqueue(envelope({
      status: 'already_exists', path: 'domains/research-publishing/tracks/x/publications/p1.md',
      checksum: `sha256:${'a'.repeat(64)}`
    }));
    const adapter = createLLMWikiRuntimeAdapter({
      launcher: 'console-script', expected_version: '0.2.0', ...paths(), runner
    });
    await expect(adapter.writeRecord({
      record_type: 'publication_evidence',
      variables: { research_track: 'x', publication_id: 'p1' },
      refs: { source_id: 'source_1' },
      content_file: resolve(paths().workspace, 'memory/staging/p1.md')
    })).resolves.toMatchObject({ status: 'already_exists' });
  });

  it('normalizes Runtime 0.2.0 raw SHA-256 values at the Adapter boundary', async () => {
    const runner = new FakeRuntimeProcessRunner();
    runner.enqueue(envelope({
      status: 'ok', path: 'domains/research-publishing/tracks/x/publications/p1.md',
      checksum: 'a'.repeat(64)
    }));
    const adapter = createLLMWikiRuntimeAdapter({
      launcher: 'console-script', expected_version: '0.2.0', ...paths(), runner
    });
    await expect(adapter.writeRecord({
      record_type: 'publication_evidence',
      variables: { research_track: 'x', publication_id: 'p1' },
      refs: { source_id: 'src-aaaaaaaaaaaa' },
      content_file: resolve(paths().workspace, 'memory/staging/p1.md')
    })).resolves.toMatchObject({ checksum: `sha256:${'a'.repeat(64)}` });
  });

  it('writes V2.3 records and research sources through fixed argv', async () => {
    const runner = new FakeRuntimeProcessRunner();
    runner.enqueue(envelope({
      status: 'ok', path: 'domains/research-publishing/tracks/runtime/indexes/catalog.md',
      checksum: 'b'.repeat(64)
    }));
    runner.enqueue(envelope({
      status: 'ok', path: 'sources/originals/research-publishing/promotion.json',
      checksum: 'c'.repeat(64)
    }));
    const adapter = createLLMWikiRuntimeAdapter({
      launcher: 'console-script', expected_version: '0.2.0', ...paths(), runner
    });
    await expect(adapter.writeRecord({
      record_type: 'research_index_catalog', variables: { research_track: 'runtime' },
      refs: { promotion_id: 'promotion_001' },
      content_file: resolve(paths().workspace, 'memory/staging/catalog.md')
    })).resolves.toMatchObject({ status: 'ok', checksum: `sha256:${'b'.repeat(64)}` });
    await expect(adapter.copySource({
      source: resolve(paths().workspace, 'memory/staging/promotion.json'),
      logical_path: 'sources/originals/research-publishing/promotion.json',
      source_type: 'research_promotion', metadata: {}
    })).resolves.toMatchObject({ checksum: `sha256:${'c'.repeat(64)}` });
    expect(runner.calls.map((call) => call.args[0])).toEqual(['write-record', 'copy-source']);
    expect(runner.calls[0]!.args).toEqual([
      'write-record', '--scope-root', paths().workspace, '--profile-path', paths().profile_path,
      '--record-type', 'research_index_catalog', '--variables-json', '{"research_track":"runtime"}',
      '--refs-json', '{"promotion_id":"promotion_001"}', '--content-file',
      resolve(paths().workspace, 'memory/staging/catalog.md')
    ]);
  });

  it('finds the exact current Catalog checksum for Promotion rechecks', async () => {
    const runner = new FakeRuntimeProcessRunner();
    runner.enqueue(envelope({
      status: 'found', matches: [{
        path: 'domains/research-publishing/tracks/runtime/indexes/catalog.md',
        checksum: 'd'.repeat(64), identity: 'runtime:research', display: 'runtime:research', fields: {}
      }]
    }));
    const adapter = createLLMWikiRuntimeAdapter({
      launcher: 'console-script', expected_version: '0.2.0', ...paths(), runner
    });
    await expect(adapter.findCatalog('runtime')).resolves.toEqual({
      status: 'found', path: 'domains/research-publishing/tracks/runtime/indexes/catalog.md',
      digest: `sha256:${'d'.repeat(64)}`
    });
    expect(runner.calls[0]!.args).toEqual([
      'find-records', '--scope-root', paths().workspace,
      '--record-type', 'research_index_catalog', '--lookup-value-json', '"runtime:research"',
      '--caller-domain', 'research-publishing', '--target-domain', 'research-publishing'
    ]);
  });

  it('finds records through a declared exact lookup without reading bodies', async () => {
    const runner = new FakeRuntimeProcessRunner();
    runner.enqueue(envelope({
      status: 'found', record_type: 'research_index_catalog', lookup_value: 'runtime:research',
      matches: [{
        path: 'domains/research-publishing/tracks/runtime/indexes/catalog.md',
        checksum: 'e'.repeat(64), identity: 'runtime:research', display: 'runtime:research',
        fields: { index_id: 'runtime:research', track_id: 'runtime', generation: 'generation_001' }
      }], truncated: false
    }));
    const adapter = createLLMWikiRuntimeAdapter({
      launcher: 'console-script', expected_version: '0.2.0', ...paths(), runner
    });
    await expect(adapter.findRecords({
      record_type: 'research_index_catalog', lookup: { index_id: 'runtime:research' }
    })).resolves.toMatchObject({
      status: 'found', matches: [{ checksum: `sha256:${'e'.repeat(64)}` }]
    });
    expect(runner.calls[0]!.args).toEqual([
      'find-records', '--scope-root', paths().workspace,
      '--record-type', 'research_index_catalog', '--lookup-value-json', '"runtime:research"',
      '--caller-domain', 'research-publishing', '--target-domain', 'research-publishing'
    ]);
  });

  it('loads only caller-supplied exact paths and restores caller order', async () => {
    const first = 'domains/research-publishing/tracks/runtime/indexes/catalog.md';
    const second = 'domains/research-publishing/tracks/runtime/indexes/generations/g1/mainline/shards/s1-a.md';
    const runner = new FakeRuntimeProcessRunner();
    runner.enqueue(envelope({
      status: 'ok', excluded_count: 0,
      items: [
        { path: second, checksum: '2'.repeat(64), content: 'shard', instruction_policy: 'data_only', sanitized: false, risk_flags: [] },
        { path: first, checksum: '1'.repeat(64), content: 'catalog', instruction_policy: 'data_only', sanitized: false, risk_flags: [] }
      ]
    }));
    const adapter = createLLMWikiRuntimeAdapter({
      launcher: 'console-script', expected_version: '0.2.0', ...paths(), runner
    });
    const result = await adapter.loadPaths({
      paths: [first, second], max_items: 2, max_item_chars: 12_000, max_total_chars: 20_000
    });
    expect(result.items.map((item) => item.path)).toEqual([first, second]);
    expect(runner.calls[0]!.args).toEqual([
      'load-context-pack', '--wiki-root', resolve(paths().workspace, '.llm-wiki'),
      '--include-json', '["domains/research-publishing/**"]',
      '--exclude-json', '["sources/originals/**",".meta/**"]',
      '--max-files', '2', '--max-chars-per-file', '12000',
      '--path-json', JSON.stringify([first, second]), '--glob-json', '[]',
      '--order', 'path_asc', '--policy', 'data_only',
      '--caller-domain', 'research-publishing', '--target-domain', 'research-publishing'
    ]);
  });

  it('fails closed when exact path loading exceeds the total character budget', async () => {
    const path = 'domains/research-publishing/tracks/runtime/indexes/catalog.md';
    const runner = new FakeRuntimeProcessRunner();
    runner.enqueue(envelope({
      status: 'ok', excluded_count: 0,
      items: [{
        path, checksum: '3'.repeat(64), content: 'too long',
        instruction_policy: 'data_only', sanitized: false, risk_flags: []
      }]
    }));
    const adapter = createLLMWikiRuntimeAdapter({
      launcher: 'console-script', expected_version: '0.2.0', ...paths(), runner
    });
    await expect(adapter.loadPaths({
      paths: [path], max_items: 1, max_item_chars: 12_000, max_total_chars: 3
    })).rejects.toThrowError(/context_budget_exceeded/);
  });
});


describe('Runtime 0.3 compatibility', () => {
  it('accepts an explicitly selected 0.3 runtime and reports its real version', async () => {
    const runner = new FakeRuntimeProcessRunner();
    runner.enqueue(envelope({ status: 'ok', version: '0.3.0' }));
    const adapter = createLLMWikiRuntimeAdapter({
      launcher: 'python-module', expected_version: '0.3.0', ...paths(), runner
    });
    await expect(adapter.version()).resolves.toBe('0.3.0');
  });
  it('does not treat 0.3 as the version bound by an old 0.2 plan', async () => {
    const runner = new FakeRuntimeProcessRunner();
    runner.enqueue(envelope({ status: 'ok', version: '0.3.0' }));
    const adapter = createLLMWikiRuntimeAdapter({
      launcher: 'python-module', expected_version: '0.2.0', ...paths(), runner
    });
    await expect(adapter.version()).rejects.toMatchObject({code:'MEMORY_RUNTIME_INCOMPATIBLE'});
  });
});
