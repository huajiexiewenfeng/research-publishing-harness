import { HarnessError } from '../../core/errors.js';
import { validateContract } from '../../core/schema-validator.js';
import type {
  CompileXArticleDocumentInput,
  XArticleBlockV1,
  XArticleDocumentV1,
  XArticleInlineMarkV1,
  XArticleInlineRunV1
} from './article-document.js';

const IMAGE = /^!\[([^\]]*)\]\(([^)]+)\)$/;
const ORDERED_ITEM = /^(\d+)\. (.+)$/;

function unsupported(message: string): never {
  throw new HarnessError('ARTICLE_FORMAT_UNSUPPORTED', message);
}

function mergeRuns(runs: readonly XArticleInlineRunV1[]): XArticleInlineRunV1[] {
  const merged: XArticleInlineRunV1[] = [];
  for (const run of runs) {
    if (run.text.length === 0) continue;
    const previous = merged.at(-1);
    if (
      previous !== undefined &&
      previous.link === run.link &&
      previous.marks.join(',') === run.marks.join(',')
    ) {
      merged[merged.length - 1] = { ...previous, text: previous.text + run.text };
    } else {
      merged.push(run);
    }
  }
  return merged;
}

function addMark(
  runs: readonly XArticleInlineRunV1[],
  mark: XArticleInlineMarkV1
): XArticleInlineRunV1[] {
  return runs.map((run) => ({
    ...run,
    marks: [...new Set([...run.marks, mark])].sort() as XArticleInlineMarkV1[]
  }));
}

function addLink(runs: readonly XArticleInlineRunV1[], link: string): XArticleInlineRunV1[] {
  if (!/^https:\/\//.test(link)) unsupported('X Article links must use https');
  return runs.map((run) => ({ ...run, link }));
}

function inline(text: string): XArticleInlineRunV1[] {
  const value = text.normalize('NFC');
  const runs: XArticleInlineRunV1[] = [];
  let cursor = 0;
  while (cursor < value.length) {
    const bold = value.indexOf('**', cursor);
    const italic = value.indexOf('*', cursor);
    const link = value.indexOf('[', cursor);
    const candidates = [bold, italic, link].filter((index) => index >= 0);
    const next = candidates.length === 0 ? -1 : Math.min(...candidates);
    if (next < 0) {
      runs.push({ text: value.slice(cursor), marks: [], link: null });
      break;
    }
    if (next > cursor) {
      runs.push({ text: value.slice(cursor, next), marks: [], link: null });
      cursor = next;
      continue;
    }
    if (value.startsWith('**', cursor)) {
      const end = value.indexOf('**', cursor + 2);
      if (end < 0 || end === cursor + 2) unsupported('unclosed or empty bold span');
      runs.push(...addMark(inline(value.slice(cursor + 2, end)), 'bold'));
      cursor = end + 2;
      continue;
    }
    if (value.startsWith('*', cursor)) {
      const end = value.indexOf('*', cursor + 1);
      if (end < 0 || end === cursor + 1) unsupported('unclosed or empty italic span');
      runs.push(...addMark(inline(value.slice(cursor + 1, end)), 'italic'));
      cursor = end + 1;
      continue;
    }
    const linkMatch = value.slice(cursor).match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch === null) unsupported('unsupported or unclosed link syntax');
    runs.push(...addLink(inline(linkMatch[1]!), linkMatch[2]!));
    cursor += linkMatch[0].length;
  }
  return mergeRuns(runs);
}

function rejectUnsupportedLine(line: string): void {
  if (
    /^\s+[-*+] /.test(line) ||
    /^```/.test(line) ||
    /^\|.*\|$/.test(line) ||
    /<\/?[A-Za-z][^>]*>/.test(line) ||
    /`/.test(line) ||
    /~~/.test(line) ||
    /^#{4,} /.test(line)
  ) {
    unsupported(`unsupported Markdown: ${line}`);
  }
}

function assertHeadingPlacements(input: CompileXArticleDocumentInput, blocks: readonly XArticleBlockV1[]): void {
  const anchored = input.visuals.filter((visual) => visual.placement.kind === 'after_heading');
  if (anchored.length === 0) return;
  const sections = input.sections ?? [];
  const visibleText = (value: string): string => inline(value).map((run) => run.text).join('');
  const headings = blocks.flatMap((block, index) => block.kind === 'heading'
    ? [{ index, text: block.runs.map((run) => run.text).join('') }] : []);
  for (const visual of anchored) {
    const placement = visual.placement;
    if (placement.kind !== 'after_heading') continue;
    const sources = sections.filter((section) => section.section_id === placement.heading_id);
    if (sources.length !== 1 || visibleText(sources[0]!.heading) !== visibleText(placement.heading_text)) {
      throw new HarnessError('ARTICLE_ASSET_MISMATCH', `Visual ${visual.asset.asset_id} has an invalid heading identity`);
    }
    const text = visibleText(placement.heading_text);
    const sameTextSources = sections.filter((section) => visibleText(section.heading) === text);
    const matches = headings.filter((heading) => heading.text === text);
    if (matches.length !== sameTextSources.length) {
      throw new HarnessError('ARTICLE_ASSET_MISMATCH', `Visual ${visual.asset.asset_id} has a missing or ambiguous heading`);
    }
    const occurrence = sameTextSources.findIndex((section) => section.section_id === placement.heading_id);
    const headingIndex = matches[occurrence]!.index;
    const actual: string[] = [];
    for (let index = headingIndex + 1; blocks[index]?.kind === 'image'; index += 1) {
      const image = blocks[index]!;
      if (image.kind === 'image') actual.push(image.asset_id);
    }
    const expected = anchored.filter((candidate) => candidate.placement.kind === 'after_heading'
      && candidate.placement.heading_id === placement.heading_id).map((candidate) => candidate.asset.asset_id);
    if (actual.length !== expected.length || actual.some((assetId, index) => assetId !== expected[index])) {
      throw new HarnessError('ARTICLE_ASSET_MISMATCH', `Visuals must appear immediately after heading ${placement.heading_id} in declared order`);
    }
  }
}

export function compileXArticleDocument(
  input: CompileXArticleDocumentInput
): XArticleDocumentV1 {
  const markdown = input.markdown.replaceAll('\r\n', '\n').replaceAll('\r', '\n').normalize('NFC');
  const lines = markdown.split('\n');
  while (lines[0] === '') lines.shift();
  const titleLine = lines.shift();
  if (titleLine === undefined || !titleLine.startsWith('# ') || titleLine.slice(2).length === 0) {
    unsupported('canonical Article must start with exactly one H1 title');
  }
  if (lines.some((line) => line.startsWith('# '))) unsupported('canonical Article must contain exactly one H1 title');

  const byPath = new Map(input.visuals.map((visual) => [visual.asset.relative_path, visual]));
  const seenAssets = new Set<string>();
  const blocks: XArticleBlockV1[] = [];
  let coverAssetId: string | null = null;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;
    if (line === '') {
      index += 1;
      continue;
    }
    rejectUnsupportedLine(line);

    const imageMatch = line.match(IMAGE);
    if (imageMatch !== null) {
      const visual = byPath.get(imageMatch[2]!);
      if (visual === undefined || visual.asset.alt_text !== imageMatch[1]) {
        throw new HarnessError('ARTICLE_ASSET_MISMATCH', 'Markdown image is not bound by the finalized visual manifest');
      }
      if (seenAssets.has(visual.asset.asset_id)) {
        throw new HarnessError('ARTICLE_ASSET_MISMATCH', 'Markdown uses a visual asset more than once');
      }
      seenAssets.add(visual.asset.asset_id);
      if (visual.placement.kind === 'cover') {
        if (coverAssetId !== null) throw new HarnessError('ARTICLE_ASSET_MISMATCH', 'Article has multiple cover assets');
        coverAssetId = visual.asset.asset_id;
      } else {
        blocks.push({ kind: 'image', asset_id: visual.asset.asset_id, alt_text: visual.asset.alt_text });
      }
      index += 1;
      continue;
    }

    if (line.startsWith('### ')) {
      blocks.push({ kind: 'subheading', runs: inline(line.slice(4)) });
      index += 1;
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push({ kind: 'heading', runs: inline(line.slice(3)) });
      index += 1;
      continue;
    }
    if (line.startsWith('> ')) {
      blocks.push({ kind: 'quote', runs: inline(line.slice(2)) });
      index += 1;
      continue;
    }
    if (line.startsWith('- ')) {
      const items: XArticleInlineRunV1[][] = [];
      while (index < lines.length && lines[index]!.startsWith('- ')) {
        items.push(inline(lines[index]!.slice(2)));
        index += 1;
      }
      blocks.push({ kind: 'bullet_list', items });
      continue;
    }
    if (ORDERED_ITEM.test(line)) {
      const items: XArticleInlineRunV1[][] = [];
      let expected = 1;
      while (index < lines.length) {
        const match = lines[index]!.match(ORDERED_ITEM);
        if (match === null) break;
        if (Number(match[1]) !== expected) unsupported('ordered lists must be contiguous and start at one');
        items.push(inline(match[2]!));
        expected += 1;
        index += 1;
      }
      blocks.push({ kind: 'ordered_list', items });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index] !== '') {
      const candidate = lines[index]!;
      rejectUnsupportedLine(candidate);
      if (
        candidate.startsWith('## ') || candidate.startsWith('### ') || candidate.startsWith('> ') ||
        candidate.startsWith('- ') || ORDERED_ITEM.test(candidate) || IMAGE.test(candidate)
      ) break;
      paragraph.push(candidate);
      index += 1;
    }
    if (paragraph.length === 0) unsupported(`unsupported Markdown: ${lines[index] ?? ''}`);
    blocks.push({ kind: 'paragraph', runs: inline(paragraph.join(' ')) });
  }

  if (seenAssets.size !== input.visuals.length) {
    throw new HarnessError('ARTICLE_ASSET_MISMATCH', 'finalized visual manifest contains an unused asset');
  }
  assertHeadingPlacements(input, blocks);

  return validateContract<XArticleDocumentV1>('x-article-document', {
    schema_version: '1.0',
    title: titleLine.slice(2).normalize('NFC'),
    cover_asset_id: coverAssetId,
    blocks
  });
}
