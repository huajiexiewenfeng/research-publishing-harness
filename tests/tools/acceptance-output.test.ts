import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

describe('offline acceptance', () => {
  it('reports the simulated X Article workflow and at-most-once Publish evidence', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'tools/acceptance.ts'],
      { encoding: 'utf8' }
    );
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      x_article: 'simulated_complete',
      x_article_publish_commands: 1,
      network: 'unused'
    });
  }, 20_000);
});
