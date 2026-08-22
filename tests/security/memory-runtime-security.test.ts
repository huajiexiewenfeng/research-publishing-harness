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
});
