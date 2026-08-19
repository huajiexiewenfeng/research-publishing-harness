import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

async function skill(name: string): Promise<string> {
  return readFile(resolve(`skills/${name}/SKILL.md`), 'utf8');
}

describe('article-publishing-copilot boundary', () => {
  it('has discoverable frontmatter and delegates mechanics to the CLI', async () => {
    const content = await skill('article-publishing-copilot');
    const frontmatter = parse(content.split('---')[1]!) as { name: string; description: string };
    expect(frontmatter.name).toBe('article-publishing-copilot');
    expect(frontmatter.description).toMatch(/^Use when /);
    expect(content).toContain('scripts/invoke.mjs');
    expect(content).toContain('Publish Gate');
    expect(content).toMatch(/never.*automatically.*X/i);
    expect(content).not.toMatch(/function\s+run(?:Evidence|Privacy|Publish)Gate/);
  });
});

describe('x-publishing-copilot boundary', () => {
  it('requires exact preview and content-specific approval without implementing gates', async () => {
    const content = await skill('x-publishing-copilot');
    const frontmatter = parse(content.split('---')[1]!) as { name: string; description: string };
    expect(frontmatter.name).toBe('x-publishing-copilot');
    expect(frontmatter.description).toMatch(/^Use when /);
    expect(content).toContain('scripts/invoke.mjs');
    expect(content).toContain('Publish Gate');
    expect(content).toMatch(/exact.*Preview/i);
    expect(content).toMatch(/content-specific approval/i);
    expect(content).not.toMatch(/function\s+run(?:Evidence|Privacy|Publish)Gate/);
    expect(content).toContain('Browser Adapter');
    expect(content).toContain('one explicit confirmation');
    expect(content).toContain('x browser claim');
    expect(content).toContain('resume-verification');
    expect(content).toMatch(/Manual.*explicit.*fallback/is);
    expect(content).not.toMatch(/querySelector|data-testid|CSS selector|screen coordinate/i);
    expect(content).toMatch(/never.*(?:in-app browser|Edge|Computer Use)/i);
  });

  it('documents the exact claim loop and forbids a second Submit claim', async () => {
    const reference = await readFile(
      resolve('skills/x-publishing-copilot/references/browser-adapter-flow.md'),
      'utf8'
    );
    expect(reference).toMatch(/next[\s\S]*claim[\s\S]*execute[\s\S]*report/i);
    expect(reference).toMatch(/never.*second Submit claim/i);
  });
});
