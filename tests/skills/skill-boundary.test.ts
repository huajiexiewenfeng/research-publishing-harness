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
    expect(content).toContain('references/memory-loop.md');
    const memory = await readFile(
      resolve('skills/article-publishing-copilot/references/memory-loop.md'), 'utf8'
    );
    expect(memory).toMatch(/before.*Package 1\.1/is);
    expect(memory).toContain('data_only');
    expect(memory).toMatch(/Candidate Insight.*not.*conclusion/is);
    expect(memory).toMatch(/exact.*preview.*approval/is);
    expect(memory).toMatch(/never.*\.llm-wiki/is);
    expect(memory).toMatch(/Catalog-first/i);
    expect(memory).toMatch(/terminal.*Evidence Capture/is);
    expect(memory).toMatch(/one.*Promotion confirmation/is);
    expect(memory).toMatch(/never.*automatic semantic promotion/is);
    const weekly = await readFile(
      resolve('skills/article-publishing-copilot/references/weekly-research-cycle.md'), 'utf8'
    );
    expect(weekly).toMatch(/memory query plan.*execute.*review/is);
    expect(weekly).toMatch(/exactly 2.?3|2.?3.*Brief/is);
    expect(weekly).toMatch(/stop.*Human selection/is);
    expect(weekly).toMatch(/never.*auto-select/is);
    expect(weekly).toMatch(/compile.*only.*selected Brief/is);
    expect(weekly).toMatch(/Evidence Gate fails.*cancel.*release.*Topic/is);
    expect(weekly).toMatch(/finalization.*not.*publication authorization/is);
  });
});

describe('x-publishing-copilot boundary', () => {
  it('documents PNG clipboard transport without weakening source placement or publish authority', async () => {
    const reference = await readFile(resolve('skills/x-publishing-copilot/references/x-article-fast-path-v3-4.md'), 'utf8');
    expect(reference).toContain('PNG inline images default to clipboard');
    expect(reference).toContain('actual source location');
    expect(reference).toContain('current-focus keyboard');
    expect(reference).toContain('never paste again');
    expect(reference).toContain('does not authorize Preview or Publish');
  });
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
    expect(content).toContain('references/memory-loop.md');
    const memory = await readFile(
      resolve('skills/x-publishing-copilot/references/memory-loop.md'), 'utf8'
    );
    expect(memory).toMatch(/Human.*select.*feedback/is);
    expect(memory).toContain('data_only');
    expect(memory).toMatch(/Candidate Insight.*not.*conclusion/is);
    expect(memory).toMatch(/exact.*preview.*approval/is);
    expect(memory).toMatch(/never.*\.llm-wiki/is);
    expect(memory).toMatch(/Catalog-first/i);
    expect(memory).toMatch(/terminal.*Evidence Capture/is);
    expect(memory).toMatch(/one.*Promotion confirmation/is);
    expect(memory).toMatch(/never.*automatic semantic promotion/is);
  });

  it('documents the exact claim loop and forbids a second Submit claim', async () => {
    const reference = await readFile(
      resolve('skills/x-publishing-copilot/references/browser-adapter-flow.md'),
      'utf8'
    );
    expect(reference).toMatch(/next[\s\S]*claim[\s\S]*execute[\s\S]*report/i);
    expect(reference).toMatch(/never.*second Submit claim/i);
  });

  it('routes long-form X Articles without degrading them to a Thread', async () => {
    const content = await skill('x-publishing-copilot');
    expect(content).toContain('Never convert an X Article to a Thread');
    expect(content).toContain('x-article browser next');
    expect(content).toContain('x-article browser claim');
    expect(content).toContain('x-article browser report');

    const reference = await readFile(
      resolve('skills/x-publishing-copilot/references/x-article-browser-flow.md'),
      'utf8'
    );
    expect(reference).toMatch(/plan[\s\S]*approve[\s\S]*start[\s\S]*next[\s\S]*claim[\s\S]*report/i);
    expect(reference).toMatch(/action-time approval/i);
    expect(reference).toMatch(/never.*publish.*twice/i);
  });

  it('orchestrates the V3.4 Fast Path through the complete V3.5 Draft-only Host Bridge', async () => {
    const content = await skill('x-publishing-copilot');
    const [reference, browserFlow] = await Promise.all([
      readFile(
        resolve('skills/x-publishing-copilot/references/x-article-fast-path-v3-4.md'),
        'utf8'
      ),
      readFile(
        resolve('skills/x-publishing-copilot/references/browser-adapter-flow.md'),
        'utf8'
      )
    ]);

    expect(content).toContain('x-article-materialization/v3.4');
    expect(content).toContain('x-article-host-bridge/v3.5');
    expect(content).toContain('references/x-article-fast-path-v3-4.md');
    expect(content).toContain('one confirmation');
    expect(content).toContain('one recovery');
    expect(content).toContain('draft_reconciled');
    expect(reference).toMatch(/status[\s\S]*next[\s\S]*verify[\s\S]*claim[\s\S]*transaction[\s\S]*observation[\s\S]*report[\s\S]*continue/i);
    expect(reference).toContain('no per-image `continue`');
    expect(reference).toContain('No Subagent');
    expect(reference).toContain('Insert -> Media');
    expect(reference).toContain('cover region');
    expect(reference).toContain('scripts/x-article-host-bridge.mjs');
    expect(reference).toContain('runXArticleHostBridge');
    expect(reference).toContain('await runXArticleHostBridge');
    expect(reference).toContain('same Node REPL call');
    expect(reference).toContain('Do not start a background browser promise');
    expect(reference).toMatch(/never.*directly.*runCoverUpload/is);
    expect(reference).toMatch(/do not call.*Cover.*Inline Host.*directly/is);
    expect(reference).toMatch(/do not handwrite[\s\S]*filechooser[\s\S]*setFiles/is);
    expect(reference).toMatch(/do not locally retry/is);
    expect(reference).toContain('visible scoped upload button');
    expect(reference).not.toContain('Verify the selected input binding');
    expect(reference).toMatch(/register.*chooser.*before.*causal click/is);
    expect(reference).toMatch(/never.*locator\.setInputFiles/is);
    expect(reference).toContain('stage progress');
    expect(reference).toContain('one recovery');
    expect(reference).toContain('draft_reconciled');
    expect(reference).toMatch(/ban.*Preview.*Publish/is);
    expect(browserFlow).toContain('x-article-fast-path-v3-4.md');
    expect(browserFlow).toContain('continuous command consumption');

    const manifest = JSON.parse(await readFile(
      resolve('registry/manifests/research-publishing.json'),
      'utf8'
    )) as { files: Array<{ path: string }> };
    const manifestPaths = manifest.files.map((file) => file.path);
    for (const path of [
      'skills/x-publishing-copilot/scripts/x-article-editor-extractor.mjs',
      'skills/x-publishing-copilot/scripts/x-article-host-runtime.mjs',
      'skills/x-publishing-copilot/scripts/x-article-host-common.mjs',
      'skills/x-publishing-copilot/scripts/x-article-cover-host.mjs',
      'skills/x-publishing-copilot/scripts/x-article-inline-image-host.mjs',
      'skills/x-publishing-copilot/scripts/x-article-host-bridge.mjs'
    ]) expect(manifestPaths).toContain(path);
  });

  it('routes one-confirmation Publication Bundles through bind-before-next boundaries', async () => {
    const content = await skill('x-publishing-copilot');
    expect(content).toContain('references/publication-bundle-flow.md');
    const reference = await readFile(
      resolve('skills/x-publishing-copilot/references/publication-bundle-flow.md'),
      'utf8'
    );
    expect(reference).toContain('one exact Bundle confirmation');
    expect(reference).toContain('bind-article-execution');
    expect(reference).toContain('before `x-article browser next`');
    expect(reference).toContain('bind-single-execution');
    expect(reference).toContain('before `x browser next`');
    expect(reference).toContain('resume-verification');
    expect(reference).toContain('Never replay Submit');
    expect(reference).toContain('Memory Promotion requires a separate confirmation');
  });
});

describe('research-synthesis-copilot boundary', () => {
  it('routes bounded checkpoints without manufacturing novelty or authority', async () => {
    const content = await skill('research-synthesis-copilot');
    const frontmatter = parse(content.split('---')[1]!) as { name: string; description: string };
    expect(frontmatter.name).toBe('research-synthesis-copilot');
    expect(frontmatter.description).toMatch(/^Use when /);
    expect(content).toContain('scripts/invoke.mjs');
    expect(content).toContain('meaningful checkpoint');
    expect(content).toMatch(/no_material_change.*successful/is);
    expect(content).toMatch(/insufficient_evidence.*successful/is);
    expect(content).toMatch(/never.*force.*novel/is);
    expect(content).toMatch(/Runtime.*unavailable.*limitation/is);
    expect(content).toMatch(/never.*chain-of-thought/is);
    expect(content).toMatch(/Continuation Proposal.*non-authoritative/is);
    expect(content).toMatch(/Memory Promotion.*separate confirmation/is);
    expect(content).toMatch(/never.*\.llm-wiki/is);
    expect(content).toMatch(/at most three.*display|display.*at most three/is);
    expect(content).toMatch(/Harness.*lossless|lossless.*Harness/is);
  });
});
