import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createLLMWikiRuntimeAdapter } from '../../harnesses/research-publishing/adapters/llm-wiki/runtime-adapter.js';
import { FakeRuntimeProcessRunner } from '../memory/fake-runtime-process.js';

const valid = {
  launcher: 'console-script' as const,
  executable: resolve('fixtures/llm-wiki.exe'),
  expected_version: '0.2.0' as const,
  workspace: resolve('fixtures/publishing-workspace'),
  profile_path: resolve('harnesses/research-publishing/memory/llm-wiki-profile.yml'),
  mapping_path: resolve('harnesses/research-publishing/memory/ingest-mapping.yml'),
  scp_paths: [resolve('harnesses/research-publishing/memory/scp.yml')],
  runner: new FakeRuntimeProcessRunner()
};

describe('Memory Runtime security boundary', () => {
  it.each(['cmd /c evil', 'version && evil', '--unknown'])(
    'rejects unsafe launcher data: %s',
    (launcher) => {
      expect(() => createLLMWikiRuntimeAdapter({ ...valid, launcher: launcher as never }))
        .toThrowError(/runtime launcher/);
    }
  );

  it('rejects relative executable, workspace, and Domain asset paths', () => {
    expect(() => createLLMWikiRuntimeAdapter({ ...valid, executable: 'python' }))
      .toThrowError(/absolute runtime executable/);
    expect(() => createLLMWikiRuntimeAdapter({ ...valid, workspace: 'workspace' }))
      .toThrowError(/absolute publishing workspace/);
    expect(() => createLLMWikiRuntimeAdapter({ ...valid, profile_path: 'profile.yml' }))
      .toThrowError(/absolute Domain asset/);
  });

  it('rejects path filters outside the research-publishing Domain', async () => {
    const adapter = createLLMWikiRuntimeAdapter(valid);
    await expect(adapter.query({
      allowed_paths: ['domains/research-publishing/** && calc.exe'],
      excluded_paths: ['.meta/**'],
      max_items: 1,
      max_item_chars: 100,
      ordering_policy: 'path_asc'
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
    expect(valid.runner.calls).toHaveLength(0);
  });

  it('rejects user-controlled record types and unsafe V2.3 path variables before spawning', async () => {
    const adapter = createLLMWikiRuntimeAdapter(valid);
    await expect(adapter.writeRecord({
      record_type: 'evil-command' as never,
      variables: { research_track: 'runtime' }, refs: {},
      content_file: resolve(valid.workspace, 'memory/staging/record.md')
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
    await expect(adapter.writeRecord({
      record_type: 'research_index_catalog' as never,
      variables: { research_track: '../escape' }, refs: { promotion_id: 'p1' },
      content_file: resolve(valid.workspace, 'memory/staging/record.md')
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
    expect(valid.runner.calls).toHaveLength(0);
  });

  it.each([
    { paths: [] },
    { paths: ['domains/research-publishing/**'] },
    { paths: ['../catalog.md'] },
    { paths: ['C:/secrets/catalog.md'] },
    { paths: ['domains\\research-publishing\\catalog.md'] },
    { paths: ['domains/research-publishing/tracks/runtime/indexes/catalog.md', 'domains/research-publishing/tracks/runtime/indexes/catalog.md'] }
  ])('rejects non-exact or duplicate Runtime paths before spawning: $paths', async ({ paths }) => {
    const runner = new FakeRuntimeProcessRunner();
    const adapter = createLLMWikiRuntimeAdapter({ ...valid, runner });
    await expect(adapter.loadPaths({
      paths, max_items: 2, max_item_chars: 12_000, max_total_chars: 20_000
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
    expect(runner.calls).toHaveLength(0);
  });

  it('rejects undeclared lookup keys and unsafe lookup values before spawning', async () => {
    const runner = new FakeRuntimeProcessRunner();
    const adapter = createLLMWikiRuntimeAdapter({ ...valid, runner });
    await expect(adapter.findRecords({
      record_type: 'research_index_catalog', lookup: { track_id: 'runtime' }
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
    await expect(adapter.findRecords({
      record_type: 'research_index_catalog', lookup: { index_id: '../runtime:research' }
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
    expect(runner.calls).toHaveLength(0);
  });
});
