import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createLLMWikiRuntimeAdapter } from '../../harnesses/research-publishing/adapters/llm-wiki/runtime-adapter.js';
import { NodeRuntimeProcessRunner } from '../../harnesses/research-publishing/adapters/llm-wiki/runtime-process.js';

const runtimePython = process.env.LLM_WIKI_RUNTIME_PYTHON;
const runtimeSource = process.env.LLM_WIKI_RUNTIME_SOURCE;
const realRuntimeConfigured = runtimePython !== undefined && runtimeSource !== undefined;

describe.skipIf(!realRuntimeConfigured)('llm-wiki-runtime 0.2.0 integration', () => {
  it('runs the pinned JSON CLI contract in an isolated temporary Publishing Workspace', async () => {
    const executable = resolve(runtimePython!);
    const source = resolve(runtimeSource!);
    await expect(stat(executable)).resolves.toMatchObject({});
    await expect(stat(join(source, 'llm_wiki_runtime', 'cli.py'))).resolves.toMatchObject({});

    const root = await mkdtemp(join(tmpdir(), 'rph-real-llm-wiki-'));
    const profile = resolve('harnesses/research-publishing/memory/llm-wiki-profile.yml');
    const mapping = resolve('harnesses/research-publishing/memory/ingest-mapping.yml');
    const scps = [
      resolve('harnesses/research-publishing/memory/scp.yml'),
      resolve('skills/article-publishing-copilot/scp.yml'),
      resolve('skills/x-publishing-copilot/scp.yml')
    ];
    const runner = new NodeRuntimeProcessRunner();
    const previousPythonPath = process.env.PYTHONPATH;
    process.env.PYTHONPATH = previousPythonPath === undefined
      ? source
      : `${source}${process.platform === 'win32' ? ';' : ':'}${previousPythonPath}`;

    try {
      await mkdir(join(root, 'memory', 'runtime'), { recursive: true });
      await mkdir(join(root, 'memory', 'staging'), { recursive: true });
      const initialized = await runner.run({
        executable,
        args: [
          '-m', 'llm_wiki_runtime.cli', 'init-profile',
          '--scope-root', root, '--profile-path', profile,
          '--scope-id', 'rph-v2-2-integration'
        ],
        cwd: root,
        shell: false,
        timeout_ms: 15_000,
        max_output_bytes: 1_048_576
      });
      expect(initialized.envelope).toMatchObject({ status: 'ok' });

      const adapter = createLLMWikiRuntimeAdapter({
        launcher: 'python-module', executable, expected_version: '0.2.0',
        workspace: root, profile_path: profile, mapping_path: mapping, scp_paths: scps
      });
      await expect(adapter.doctor()).resolves.toMatchObject({
        status: 'ok', runtime_version: '0.2.0', configured: true,
        profile: 'research-publishing', mapping_id: 'research-publishing-memory'
      });

      const sourceFile = join(root, 'memory', 'staging', 'publication.json');
      const recordFile = join(root, 'memory', 'staging', 'publication.md');
      await writeFile(sourceFile, '{"receipt_id":"publication_real_001"}\n', 'utf8');
      await writeFile(recordFile, '# Runtime boundary\n\nA deterministic memory record.\n', 'utf8');
      const copied = await adapter.copySource({
        source: sourceFile,
        logical_path: 'sources/originals/research-publishing/publication_real_001.json',
        source_type: 'publication_checkpoint',
        metadata: {}
      });
      expect(copied.status).toBe('ok');
      const written = await adapter.writeRecord({
        record_type: 'publication_evidence',
        variables: {
          research_track: 'enterprise-agent-runtime',
          publication_id: 'publication_real_001'
        },
        refs: { source_id: String(copied.source_id) },
        content_file: recordFile
      });
      expect(written.status).toBe('ok');
      await expect(adapter.query({
        allowed_paths: ['domains/research-publishing/tracks/enterprise-agent-runtime/**'],
        excluded_paths: ['sources/originals/**', '.meta/**'],
        max_items: 8,
        max_item_chars: 4_000,
        ordering_policy: 'path_asc'
      })).resolves.toMatchObject({
        status: 'loaded', runtime_version: '0.2.0',
        items: [{ path: 'domains/research-publishing/tracks/enterprise-agent-runtime/publications/publication_real_001.md' }]
      });
      await expect(adapter.registerArtifact({
        artifact_id: 'publication_real_001', artifact_type: 'publication_receipt'
      })).resolves.toMatchObject({ status: 'ok' });
      const event = {
        event_id: 'memory-ingest:publication_real_001', event_type: 'memory_ingest',
        ingest_id: 'publication_real_001', ingest_kind: 'publication_checkpoint'
      };
      await expect(adapter.appendLog(event)).resolves.toMatchObject({ status: 'ok' });

      await expect(adapter.copySource({
        source: sourceFile,
        logical_path: 'sources/originals/research-publishing/publication_real_001.json',
        source_type: 'publication_checkpoint',
        metadata: {}
      })).resolves.toMatchObject({ status: 'already_exists' });
      await expect(adapter.writeRecord({
        record_type: 'publication_evidence',
        variables: {
          research_track: 'enterprise-agent-runtime',
          publication_id: 'publication_real_001'
        },
        refs: { source_id: String(copied.source_id) },
        content_file: recordFile
      })).resolves.toMatchObject({ status: 'already_exists' });
      await expect(adapter.appendLog(event)).resolves.toMatchObject({ status: 'already_exists' });
    } finally {
      if (previousPythonPath === undefined) delete process.env.PYTHONPATH;
      else process.env.PYTHONPATH = previousPythonPath;
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});
