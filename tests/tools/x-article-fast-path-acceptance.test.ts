import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('X Article Fast Path acceptance command', () => {
  it('emits passing JSON records for the complete V3.4 matrix', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'tools/x-article-fast-path-acceptance.ts'],
      { encoding: 'utf8' }
    );

    expect(result.status, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout) as {
      ok: boolean;
      protocol: string;
      host_protocol: string;
      scenarios: Array<{
        name: string;
        ok: boolean;
        cover: { expected: number; completed: number; alt: string };
        inline_images: { expected: number; completed: number };
        issued_command_kinds: string[];
        preview_command_count: number;
        publish_command_count: number;
      }>;
    };
    expect(output).toMatchObject({
      ok: true,
      protocol: 'x-article-materialization/v3.4',
      host_protocol: 'x-article-host-bridge/v3.5'
    });
    expect(output.scenarios.map((scenario) => scenario.name)).toEqual([
      '0', '1', '3', '10', 'disconnect_recovery'
    ]);
    expect(output.scenarios.every((scenario) => scenario.ok)).toBe(true);
    for (const scenario of output.scenarios) {
      expect(scenario.cover).toEqual({ expected: 1, completed: 1, alt: 'unobservable' });
      expect(scenario.inline_images.completed).toBe(scenario.inline_images.expected);
      expect(scenario.preview_command_count).toBe(0);
      expect(scenario.publish_command_count).toBe(0);
      expect(scenario.issued_command_kinds).not.toContain('open_article_preview');
      expect(scenario.issued_command_kinds).not.toContain('open_publish_review');
      expect(scenario.issued_command_kinds).not.toContain('publish_article_once');
    }
  }, 60_000);

  it('registers the focused acceptance command in package scripts', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts['acceptance:x-article-fast-path'])
      .toBe('tsx tools/x-article-fast-path-acceptance.ts');
    expect(packageJson.scripts.acceptance).toBe('tsx tools/acceptance.ts');
  });
});
