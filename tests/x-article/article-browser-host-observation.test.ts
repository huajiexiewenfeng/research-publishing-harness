import { describe, expect, it } from 'vitest';

import {
  buildXArticleHostObservation,
  type XArticleHostPageBlockV1,
  type XArticleHostPageSnapshotV1
} from '../../harnesses/research-publishing/adapters/x/article-browser/article-browser-host-observation.js';
import {
  computeXArticlePageRevision,
  type XArticleBrowserObservation
} from '../../harnesses/research-publishing/adapters/x/article-browser/article-browser-protocol.js';
import type { XArticleBrowserCommandV1 } from '../../harnesses/research-publishing/adapters/x/article-browser/article-command-broker.js';
import { createXArticleImportTemplate } from '../../harnesses/research-publishing/adapters/x/article-browser/article-import-template.js';
import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
import { validateContract } from '../../harnesses/research-publishing/core/schema-validator.js';
import {
  createXArticleMaterializationPlan,
  type XArticleMaterializationPlanV1
} from '../../harnesses/research-publishing/core/x-article-materialization.js';
import { createXArticlePublicationPlan } from '../../harnesses/research-publishing/core/x-article-publication-plan.js';
import type { VisualAssetRef } from '../../harnesses/research-publishing/core/types.js';

const executionId = 'execution_host_observation_1';
const draftId = '2093554993261654016';

function asset(assetId: string, suffix: string): VisualAssetRef {
  return {
    asset_id: assetId,
    relative_path: `assets/${assetId}.png`,
    digest: sha256({ asset: assetId, suffix }),
    mime_type: 'image/png',
    alt_text: `${assetId} diagram`,
    claim_refs: [`claim_${assetId}`]
  };
}

const assets = [
  asset('asset_alpha', 'a'),
  asset('asset_beta', 'b'),
  asset('asset_gamma', 'c')
] as const;

const publicationPlan = createXArticlePublicationPlan({
  planId: 'plan_host_observation_1',
  runId: 'run_host_observation_1',
  targetAccount: '@Glen56121',
  articlePackage: {
    root: 'articles/shared-agent-knowledge',
    digest: sha256({ package: 'shared-agent-knowledge' })
  },
  document: {
    schema_version: '1.0',
    title: 'From Skill Memory to Shared Agent Knowledge',
    cover_asset_id: null,
    blocks: [
      { kind: 'paragraph', runs: [{ text: 'Opening.', marks: [], link: null }] },
      { kind: 'heading', runs: [{ text: 'Boundary', marks: [], link: null }] },
      {
        kind: 'bullet_list',
        items: [[{ text: 'Domain semantics', marks: ['bold'], link: null }]]
      },
      { kind: 'quote', runs: [{ text: 'Runtime boundary.', marks: [], link: null }] },
      { kind: 'paragraph', runs: [{ text: 'Before the first visual.', marks: [], link: null }] },
      { kind: 'image', asset_id: assets[0].asset_id, alt_text: assets[0].alt_text },
      { kind: 'paragraph', runs: [{ text: 'Between alpha and beta.', marks: [], link: null }] },
      { kind: 'image', asset_id: assets[1].asset_id, alt_text: assets[1].alt_text },
      { kind: 'paragraph', runs: [{ text: 'Between beta and gamma.', marks: [], link: null }] },
      { kind: 'image', asset_id: assets[2].asset_id, alt_text: assets[2].alt_text }
    ]
  },
  visuals: [
    { asset: assets[0], placement: { kind: 'block', block_ordinal: 6 } },
    { asset: assets[1], placement: { kind: 'block', block_ordinal: 8 } },
    { asset: assets[2], placement: { kind: 'block', block_ordinal: 10 } }
  ],
  plannedAt: '2026-08-29T08:00:00.000Z',
  provenance: { source: 'host-observation-test' }
});

const template = createXArticleImportTemplate(publicationPlan.intent.document);
const materializationPlan = createXArticleMaterializationPlan({
  execution_id: executionId,
  publication_plan: publicationPlan,
  import_template: template,
  strategy: 'rich_text_anchor_import/v1'
});

type ReplaceVisualCommand = Extract<
  XArticleBrowserCommandV1,
  { readonly kind: 'replace_article_visual_anchor' }
>;

function replacementCommand(
  overrides: Partial<ReplaceVisualCommand> = {}
): ReplaceVisualCommand {
  const payload = {
    kind: 'replace_article_visual_anchor' as const,
    target_ref: 'testid:composer',
    anchor: template.anchors[0]!,
    package_root: publicationPlan.intent.article_package.root,
    package_digest: publicationPlan.intent.article_package.digest,
    asset: assets[0]
  };
  return {
    schema_version: '1.0',
    execution_id: executionId,
    run_id: publicationPlan.run_id,
    draft_id: draftId,
    kind: 'replace_article_visual_anchor',
    purpose: 'replace_article_visual_anchor',
    expected_page_revision: null,
    allowed_origin: 'https://x.com',
    side_effect: 'write',
    payload,
    command_id: 'command_host_observation_1',
    payload_digest: sha256(payload),
    issued_at: '2026-08-29T08:00:01.000Z',
    ...overrides
  } as ReplaceVisualCommand;
}

function observeCommand(
  expectedPageRevision: string | null = null
): XArticleBrowserCommandV1 {
  const payload = { kind: 'observe_article_page' as const, scope: 'editor' as const };
  return {
    schema_version: '1.0',
    execution_id: executionId,
    run_id: publicationPlan.run_id,
    draft_id: draftId,
    kind: 'observe_article_page',
    purpose: 'observe_article_page',
    expected_page_revision: expectedPageRevision,
    allowed_origin: 'https://x.com',
    side_effect: 'read',
    payload,
    command_id: 'command_host_observe_2',
    payload_digest: sha256(payload),
    issued_at: '2026-08-29T08:00:02.000Z'
  };
}

function rawTemplateBlocks(): XArticleHostPageBlockV1[] {
  return template.blocks.map((block) => block.kind === 'visual_anchor'
    ? { kind: 'visual_anchor', marker: block.marker }
    : structuredClone(block));
}

const pageSnapshot: XArticleHostPageSnapshotV1 = {
  schema_version: 'x-article-host-page-snapshot/v1',
  canonical_url: `https://x.com/compose/articles/edit/${draftId}`,
  account_handle: '@Glen56121',
  page_kind: 'article_editor',
  controls: [
    {
      ref: 'role:button|name:Add Media',
      role: 'button',
      name: 'Add Media',
      test_id: null,
      disabled: false
    }
  ],
  editor: {
    draft_id: draftId,
    title: publicationPlan.intent.document.title,
    blocks: rawTemplateBlocks(),
    cover: null,
    autosave_state: 'saved',
    has_unknown_content: false
  }
};

const baseInput = {
  command: replacementCommand(),
  context: {
    publication_plan: publicationPlan,
    materialization_plan: materializationPlan
  },
  page_snapshot: pageSnapshot,
  previous_observation: null,
  observation_id: 'observation_host_1',
  observed_at: '2026-08-29T08:00:03.000Z'
};

function validInput(overrides: Partial<typeof baseInput> = {}) {
  return { ...baseInput, ...overrides };
}

function inputWithPagePatch(
  patch: Partial<Omit<XArticleHostPageSnapshotV1, 'editor'>> & {
    readonly editor?: Partial<XArticleHostPageSnapshotV1['editor']>;
  }
) {
  return validInput({
    page_snapshot: {
      ...pageSnapshot,
      ...patch,
      editor: { ...pageSnapshot.editor, ...patch.editor }
    }
  });
}

function mediaAt(
  zeroBasedIndex: number,
  ref: string,
  blockOrdinal = zeroBasedIndex + 1
): Extract<XArticleHostPageBlockV1, { readonly kind: 'media' }> {
  return {
    kind: 'media',
    ref,
    block_ordinal: blockOrdinal,
    alt_text: assets[0].alt_text,
    status: 'uploaded'
  };
}

function inputWithMediaAt(
  zeroBasedIndex: number,
  media: readonly Extract<XArticleHostPageBlockV1, { readonly kind: 'media' }>[]
) {
  const blocks = rawTemplateBlocks();
  blocks.splice(zeroBasedIndex, 1, ...media);
  return inputWithPagePatch({ editor: { blocks } });
}

function legacyRevisionBody(observation: XArticleBrowserObservation): object {
  return Object.fromEntries(
    Object.entries(observation).filter(([key]) => key !== 'page_revision')
  );
}

describe('deterministic X Article Host observations', () => {
  it('binds three exact anchors without guessing media ownership', () => {
    const result = buildXArticleHostObservation(validInput());

    expect(result).toMatchObject({
      schema_version: '1.0',
      execution_id: executionId,
      command_id: baseInput.command.command_id,
      origin: 'https://x.com',
      account_handle: '@Glen56121',
      page_kind: 'article_editor',
      editor: {
        draft_id: draftId,
        title: publicationPlan.intent.document.title,
        visuals: [],
        import_state: {
          unresolved_anchors: materializationPlan.visual_anchors.map((anchor) => ({
            anchor_id: anchor.anchor_id,
            asset_id: anchor.asset_id,
            block_ordinal: anchor.block_ordinal,
            marker: `RPH_VISUAL_ANCHOR:${anchor.asset_id}:${anchor.block_ordinal}`
          }))
        }
      }
    });
    expect(result.page_revision).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.page_state_revision).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it.each([
    ['account', { account_handle: '@Foreign' }],
    ['draft URL', { canonical_url: 'https://x.com/compose/articles/edit/1' }],
    ['editor draft', { editor: { draft_id: '1' } }],
    ['title', { editor: { title: 'Changed' } }]
  ])('rejects changed %s identity', (_name, patch) => {
    expect(() => buildXArticleHostObservation(inputWithPagePatch(patch)))
      .toThrowError(expect.objectContaining({ code: 'ARTICLE_DRAFT_CONFLICT' }));
  });

  it('rejects duplicate, foreign, and wrong-ordinal media', () => {
    expect(() => buildXArticleHostObservation(inputWithMediaAt(5, [
      mediaAt(5, 'media-a'),
      mediaAt(5, 'media-b')
    ]))).toThrow(/duplicate/i);

    expect(() => buildXArticleHostObservation(inputWithMediaAt(6, [
      mediaAt(6, 'foreign-media')
    ]))).toThrow(/ordinal/i);

    expect(() => buildXArticleHostObservation(inputWithMediaAt(5, [
      mediaAt(5, 'wrong-ordinal-media', 8)
    ]))).toThrow(/ordinal/i);
  });

  it('maps post-command media only from the locked command and plan', () => {
    const result = buildXArticleHostObservation(inputWithMediaAt(5, [
      mediaAt(5, 'media-alpha')
    ]));

    expect(result.editor?.blocks).toContainEqual({
      kind: 'image',
      asset_id: assets[0].asset_id,
      alt_text: assets[0].alt_text
    });
    expect(result.editor?.visuals).toContainEqual({
      ref: 'media-alpha',
      asset_id: assets[0].asset_id,
      kind: 'inline',
      block_ordinal: 6,
      alt_text: assets[0].alt_text,
      status: 'uploaded',
      owned_by_execution: true
    });
    expect(result.editor?.import_state?.unresolved_anchors)
      .toEqual(template.anchors.slice(1));
  });

  it('maps uniquely placed media but does not invent execution ownership', () => {
    const result = buildXArticleHostObservation({
      ...inputWithMediaAt(5, [mediaAt(5, 'media-alpha')]),
      command: observeCommand()
    });

    expect(result.editor?.visuals[0]).toMatchObject({
      ref: 'media-alpha',
      asset_id: assets[0].asset_id,
      owned_by_execution: false
    });
  });

  it('preserves proven previous ownership without re-claiming the media', () => {
    const mediaInput = inputWithMediaAt(5, [mediaAt(5, 'media-alpha')]);
    const previous = buildXArticleHostObservation(mediaInput);
    const result = buildXArticleHostObservation({
      ...mediaInput,
      command: observeCommand(previous.page_revision),
      previous_observation: previous,
      observation_id: 'observation_host_2',
      observed_at: '2026-08-29T08:00:04.000Z'
    });

    expect(result.editor?.visuals[0]?.owned_by_execution).toBe(true);
  });

  it('rejects independently valid materialization or command binding drift', () => {
    const {
      materialization_digest: _digest,
      ...materializationBody
    } = materializationPlan;
    void _digest;
    const changedMaterializationBody = {
      ...materializationBody,
      publication_plan_digest: sha256({ foreign: 'publication-plan' })
    };
    const changedMaterializationPlan = {
      ...changedMaterializationBody,
      materialization_digest: sha256(changedMaterializationBody)
    } as XArticleMaterializationPlanV1;
    expect(() => buildXArticleHostObservation(validInput({
      context: {
        publication_plan: publicationPlan,
        materialization_plan: changedMaterializationPlan
      }
    }))).toThrow(/publication plan digest/i);

    const payload = {
      ...baseInput.command.payload,
      asset: assets[1]
    };
    const changedCommand = replacementCommand({
      payload,
      payload_digest: sha256(payload)
    });
    expect(() => buildXArticleHostObservation(validInput({ command: changedCommand })))
      .toThrow(/command.*asset|asset.*command/i);
  });

  it('keeps legacy revisions compatible while semantic page revisions stay stable', () => {
    const first = buildXArticleHostObservation(validInput());
    const second = buildXArticleHostObservation(validInput({
      command: replacementCommand({
        command_id: 'command_host_observation_2',
        issued_at: '2026-08-29T08:00:04.000Z'
      }),
      observation_id: 'observation_host_2',
      observed_at: '2026-08-29T08:00:05.000Z'
    }));

    expect(first.page_revision).toBe(computeXArticlePageRevision(legacyRevisionBody(first)));
    expect(second.page_revision).toBe(computeXArticlePageRevision(legacyRevisionBody(second)));
    expect(second.page_revision).not.toBe(first.page_revision);
    expect(second.page_state_revision).toBe(first.page_state_revision);
  });

  it('keeps historical observations without page_state_revision valid', () => {
    const current = buildXArticleHostObservation(validInput());
    const { page_state_revision: _stateRevision, ...legacy } = current;
    void _stateRevision;
    const legacyBody = Object.fromEntries(
      Object.entries(legacy).filter(([key]) => key !== 'page_revision')
    );
    const compatibleLegacy = {
      ...legacy,
      page_revision: computeXArticlePageRevision(legacyBody)
    };

    expect(validateContract('x-article-browser-observation', compatibleLegacy))
      .toEqual(compatibleLegacy);
  });

  it('does not expose raw DOM, storage, or local file data', () => {
    const serialized = JSON.stringify(buildXArticleHostObservation(validInput()));

    expect(serialized)
      .not.toMatch(/innerHTML|cookie|localStorage|sessionStorage|absoluteAssetPath|file:\/\//i);
  });
});
