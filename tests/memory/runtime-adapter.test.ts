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
});
