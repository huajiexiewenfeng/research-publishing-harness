import { beforeAll, describe, expect, it } from 'vitest';

import { runXArticleFastPathAcceptanceMatrix } from '../../tools/x-article-fast-path-acceptance.js';

describe('X Article Fast Path V3.4 workflow', () => {
  let result: Awaited<ReturnType<typeof runXArticleFastPathAcceptanceMatrix>>;

  beforeAll(async () => {
    result = await runXArticleFastPathAcceptanceMatrix();
  }, 60_000);

  it('materializes 0, 1, 3, and 10 inline images through one confirmed Draft-only loop', () => {
    const regular = result.scenarios.filter((scenario) => scenario.name !== 'disconnect_recovery');

    expect(regular.map((scenario) => scenario.inline_images.expected)).toEqual([0, 1, 3, 10]);
    for (const scenario of regular) {
      expect(scenario).toMatchObject({
        ok: true,
        confirmation_count: 1,
        human_browser_operation_count: 0,
        terminal_state: 'draft_reconciled',
        cover: { expected: 1, completed: 1 },
        preview_command_count: 0,
        publish_command_count: 0,
        removed_editorial_metadata_absent: true,
        visual_anchors_absent: true,
        recovery_count: 0
      });
      expect(scenario.elapsed_seconds).toBeLessThan(600);
      expect(scenario.inline_images.completed).toBe(scenario.inline_images.expected);
      expect(scenario.alt.completed).toBe(scenario.alt.expected);
    }
  });

  it('recovers a disconnected image transaction without duplicating writes', () => {
    const scenario = result.scenarios.find((candidate) => candidate.name === 'disconnect_recovery');

    expect(scenario).toMatchObject({
      ok: true,
      confirmation_count: 1,
      human_browser_operation_count: 0,
      terminal_state: 'draft_reconciled',
      cover: { expected: 1, completed: 1 },
      inline_images: { expected: 3, completed: 3 },
      alt: { expected: 3, completed: 3 },
      recovery_count: 1,
      duplicate_draft_count: 0,
      duplicate_upload_count: 0,
      duplicate_write_count: 0,
      preview_command_count: 0,
      publish_command_count: 0
    });
    expect(scenario!.elapsed_seconds).toBeLessThan(600);
  });
});
