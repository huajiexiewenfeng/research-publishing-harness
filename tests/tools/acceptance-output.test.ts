import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('offline acceptance', () => {
  it('packages the bounded existing Draft media-completion Skill protocol', async () => {
    const [skill, browserFlow, materialization, mediaCompletion] = await Promise.all([
      readFile('skills/x-publishing-copilot/SKILL.md', 'utf8'),
      readFile('skills/x-publishing-copilot/references/browser-adapter-flow.md', 'utf8'),
      readFile('skills/x-publishing-copilot/references/x-article-materialization-v3-2.md', 'utf8'),
      readFile(
        'skills/x-publishing-copilot/references/x-article-existing-draft-media-completion-v3-3.md',
        'utf8'
      )
    ]);

    expect(skill).toContain('x-article-materialization/v3.3');
    expect(skill).toContain('prepare-existing-media');
    expect(skill).toContain('draft_reconciled');
    expect(browserFlow).toContain('existing Draft media completion');
    expect(materialization).toContain('x-article-materialization/v3.3');
    expect(mediaCompletion).toContain('prepare-existing-media');
    expect(mediaCompletion).toContain('durable normalized Observation');
    expect(mediaCompletion).toContain('Never create a Draft or rewrite its title or body');
    expect(mediaCompletion).toContain('draft_reconciled');
    expect(mediaCompletion).toContain('Preview and Publish');
    expect(mediaCompletion).toContain('one bounded retry');
  });

  it('reports media-unverified publication evidence without laundering it into success', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'tools/acceptance.ts'],
      { encoding: 'utf8' }
    );
    expect(result.status, result.stderr).toBe(0);
    const output = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(output).toMatchObject({
      ok: true,
      x_article: 'simulated_verification_needed',
      x_article_execution_state: 'published_unverified',
      x_article_receipt_status: 'published_media_unverified',
      x_article_public_content_verified: true,
      x_article_media_verified: false,
      x_article_verification_needed: true,
      x_article_publish_commands: 1,
      x_article_host_transactions: [
        'import_article_document',
        'replace_article_visual_anchor',
        'replace_article_visual_anchor',
        'replace_article_visual_anchor'
      ],
      x_article_paragraph_level_transactions: 0,
      x_article_host_progress_events: 12,
      x_article_host_grouped_image_corrections: 3,
      x_article_host_observations: 4,
      x_article_network: 'unused',
      memory_query: 'simulated_complete',
      publication_checkpoint: 'simulated_complete',
      feedback_insight: 'simulated_complete',
      memory_resume: 'simulated_complete',
      research_evidence_foundation: 'simulated_complete',
      research_promotion: 'simulated_complete',
      progressive_query: 'simulated_complete',
      network: 'unused'
    });
    expect(output.x_article).not.toBe('simulated_complete');
  }, 60_000);
});
