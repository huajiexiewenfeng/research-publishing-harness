import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
import { XArticleMaterializationStore } from '../../harnesses/research-publishing/core/x-article-materialization-store.js';
import {
  createXArticleStageProgress,
  type XArticleMaterializationCheckpointV1,
  type XArticleMaterializationPlanV1
} from '../../harnesses/research-publishing/core/x-article-materialization.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

const digest = (character: string): `sha256:${string}` =>
  `sha256:${character.repeat(64)}`;

function plan(
  executionId = 'execution_v32',
  withMedia = false,
  targetAccount = '@Glen56121'
): XArticleMaterializationPlanV1 {
  const visualAnchors = withMedia ? [{
    anchor_id: 'anchor_1',
    asset_id: 'asset_1',
    block_ordinal: 2,
    asset_digest: digest('d'),
    alt_text: 'A governed runtime boundary.',
    context_digest: digest('e')
  }] : [];
  const body = {
    schema_version: 'x-article-materialization-plan/v1' as const,
    execution_id: executionId,
    publication_plan_digest: digest('a'),
    target_account: targetAccount,
    strategy: 'rich_text_anchor_import/v1' as const,
    document_digest: digest('b'),
    import_template_digest: digest('c'),
    draft_binding: null,
    visual_anchors: visualAnchors,
    expected_command_ceiling: 12 + visualAnchors.length,
    expected_observation_ceiling: 9 + visualAnchors.length,
    budget: {
      fixed_seconds: 180 as const,
      per_inline_visual_seconds: 60 as const,
      no_progress_seconds: 20 as const
    }
  };
  return { ...body, materialization_digest: sha256(body) };
}

function checkpoint(
  materializationPlan = plan()
): XArticleMaterializationCheckpointV1 {
  return {
    schema_version: 'x-article-materialization-checkpoint/v1',
    execution_id: materializationPlan.execution_id,
    draft_id: null,
    draft_origin: 'created_new',
    source_execution_id: null,
    materialization_digest: materializationPlan.materialization_digest,
    revision: 0,
    phase: 'preflight_pending',
    body: { status: 'pending', observed_digest: null },
    media: materializationPlan.visual_anchors.map((anchor) => ({
      anchor_id: anchor.anchor_id,
      asset_id: anchor.asset_id,
      block_ordinal: anchor.block_ordinal,
      asset_digest: anchor.asset_digest,
      status: 'pending' as const,
      observed_media_ref: null,
      observed_context_digest: null
    })),
    last_editor_revision: null,
    publish_confirmation: 'absent',
    updated_at: '2026-08-26T08:01:00.000Z'
  };
}

function progress(
  override: Partial<Parameters<typeof createXArticleStageProgress>[0]> = {}
) {
  return createXArticleStageProgress({
    execution_id: 'execution_v32',
    stage: 'import_article_document',
    asset_id: null,
    elapsed_seconds: 21,
    waiting_for: 'editor_document_import',
    retry_count: 0,
    observed_effect: 'partial',
    recorded_at: '2026-08-26T08:02:00.000Z',
    ...override
  });
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'rph-article-materialization-store-'));
  const workspace = await WorkspaceStore.open(root);
  return {
    workspace,
    store: new XArticleMaterializationStore(workspace)
  };
}

describe('XArticleMaterializationStore', () => {
  it('reads the validated persisted plan bound to the requested execution', async () => {
    const { workspace, store } = await fixture();
    const materializationPlan = plan('execution_read_plan');
    await store.create(materializationPlan, checkpoint(materializationPlan));

    await expect(store.readPlan(materializationPlan.execution_id)).resolves.toEqual(materializationPlan);

    await workspace.replaceAtomic(
      'runs/execution_read_plan/x-article/browser/materialization-plan.json',
      { ...materializationPlan, execution_id: 'execution_foreign' }
    );
    await expect(store.readPlan(materializationPlan.execution_id))
      .rejects.toMatchObject({ code: 'ARTICLE_CHECKPOINT_CONFLICT' });
  });

  it('creates and reads a validated plan and checkpoint at the execution paths', async () => {
    const { workspace, store } = await fixture();
    const materializationPlan = plan();
    const initialCheckpoint = checkpoint(materializationPlan);

    await expect(store.create(materializationPlan, initialCheckpoint))
      .resolves.toEqual(initialCheckpoint);
    await expect(store.readCheckpoint('execution_v32')).resolves.toEqual(initialCheckpoint);
    await expect(workspace.readJson(
      'runs/execution_v32/x-article/browser/materialization-plan.json'
    )).resolves.toEqual(materializationPlan);
    await expect(workspace.readJson(
      'runs/execution_v32/x-article/browser/materialization-checkpoint.json'
    )).resolves.toEqual(initialCheckpoint);
  });

  it('updates checkpoints with compare-and-swap and rejects a stale revision', async () => {
    const { store } = await fixture();
    const materializationPlan = plan();
    await store.create(materializationPlan, checkpoint(materializationPlan));
    await store.appendProgress(progress());

    const next = await store.updateCheckpoint('execution_v32', 0, (current) => ({
      ...current,
      phase: 'body_imported',
      body: {
        status: 'verified',
        observed_digest: materializationPlan.import_template_digest
      },
      updated_at: '2026-08-26T08:03:00.000Z'
    }));

    expect(next).toMatchObject({ revision: 1, phase: 'body_imported' });
    await expect(store.readCheckpoint('execution_v32')).resolves.toEqual(next);
    await expect(store.updateCheckpoint('execution_v32', 0, (current) => current))
      .rejects.toMatchObject({ code: 'ARTICLE_CHECKPOINT_CONFLICT' });
  });

  it('repairs an exact plan-only create after an injected checkpoint-write failure', async () => {
    const { workspace, store } = await fixture();
    const materializationPlan = plan('execution_repair');
    const initialCheckpoint = checkpoint(materializationPlan);
    const writeNew = workspace.writeNew.bind(workspace);
    let failCheckpointWrite = true;
    workspace.writeNew = async (path, value) => {
      if (path.endsWith('/materialization-checkpoint.json') && failCheckpointWrite) {
        failCheckpointWrite = false;
        throw new Error('injected checkpoint write failure');
      }
      return writeNew(path, value);
    };

    await expect(store.create(materializationPlan, initialCheckpoint))
      .rejects.toThrow('injected checkpoint write failure');
    await expect(workspace.readJson(
      'runs/execution_repair/x-article/browser/materialization-plan.json'
    )).resolves.toEqual(materializationPlan);
    await expect(workspace.exists(
      'runs/execution_repair/x-article/browser/materialization-checkpoint.json'
    )).resolves.toBe(false);

    await expect(store.create(materializationPlan, initialCheckpoint))
      .resolves.toEqual(initialCheckpoint);
    await expect(store.readCheckpoint('execution_repair')).resolves.toEqual(initialCheckpoint);
  });

  it('repairs only exact partial creates and never overwrites a complete run', async () => {
    const { workspace, store } = await fixture();
    const materializationPlan = plan('execution_checkpoint_only', true);
    const initialCheckpoint = checkpoint(materializationPlan);
    await workspace.writeNew(
      'runs/execution_checkpoint_only/x-article/browser/materialization-checkpoint.json',
      initialCheckpoint
    );

    await expect(store.create(materializationPlan, initialCheckpoint))
      .resolves.toEqual(initialCheckpoint);
    await expect(store.create(materializationPlan, initialCheckpoint)).rejects.toMatchObject({
      code: 'ARTICLE_CHECKPOINT_CONFLICT'
    });

    const partialPlan = plan('execution_mismatched_partial');
    await workspace.writeNew(
      'runs/execution_mismatched_partial/x-article/browser/materialization-plan.json',
      partialPlan
    );
    const replacementPlan = plan('execution_mismatched_partial', false, '@OtherAccount');
    await expect(store.create(replacementPlan, checkpoint(replacementPlan)))
      .rejects.toMatchObject({ code: 'ARTICLE_CHECKPOINT_CONFLICT' });
    await expect(workspace.readJson(
      'runs/execution_mismatched_partial/x-article/browser/materialization-plan.json'
    )).resolves.toEqual(partialPlan);
  });

  it('makes readers fail busy instead of exposing a plan-only create in progress', async () => {
    const { workspace, store } = await fixture();
    const materializationPlan = plan('execution_reader_contention');
    const initialCheckpoint = checkpoint(materializationPlan);
    const writeNew = workspace.writeNew.bind(workspace);
    let releaseCheckpointWrite!: () => void;
    const checkpointWriteReleased = new Promise<void>((resolve) => {
      releaseCheckpointWrite = resolve;
    });
    let checkpointWriteEntered!: () => void;
    const checkpointWriteStarted = new Promise<void>((resolve) => {
      checkpointWriteEntered = resolve;
    });
    workspace.writeNew = async (path, value) => {
      if (path.endsWith('/materialization-checkpoint.json')) {
        checkpointWriteEntered();
        await checkpointWriteReleased;
      }
      return writeNew(path, value);
    };

    const creating = store.create(materializationPlan, initialCheckpoint);
    await checkpointWriteStarted;
    await expect(store.readCheckpoint('execution_reader_contention')).rejects.toMatchObject({
      code: 'EXECUTION_BUSY'
    });
    releaseCheckpointWrite();
    await creating;
    await expect(store.readCheckpoint('execution_reader_contention'))
      .resolves.toEqual(initialCheckpoint);
  });

  it('snapshots create inputs before the first await and returns a detached checkpoint', async () => {
    const { workspace, store } = await fixture();
    const materializationPlan = plan('execution_create_snapshot', true);
    const initialCheckpoint = checkpoint(materializationPlan);
    const expectedPlan = structuredClone(materializationPlan);
    const expectedCheckpoint = structuredClone(initialCheckpoint);

    const creating = store.create(materializationPlan, initialCheckpoint);
    Reflect.set(materializationPlan, 'execution_id', 'execution_mutated');
    Reflect.set(materializationPlan.visual_anchors[0]!, 'alt_text', 'mutated');
    Reflect.set(initialCheckpoint.body, 'status', 'verified');

    const created = await creating;
    expect(created).toEqual(expectedCheckpoint);
    expect(created).not.toBe(initialCheckpoint);
    await expect(workspace.readJson(
      'runs/execution_create_snapshot/x-article/browser/materialization-plan.json'
    )).resolves.toEqual(expectedPlan);
    await expect(store.readCheckpoint('execution_create_snapshot'))
      .resolves.toEqual(expectedCheckpoint);
    await expect(workspace.exists(
      'runs/execution_mutated/x-article/browser/materialization-plan.json'
    )).resolves.toBe(false);
  });

  it('snapshots updater output before awaiting atomic replacement', async () => {
    const { workspace, store } = await fixture();
    const materializationPlan = plan('execution_update_snapshot');
    await store.create(materializationPlan, checkpoint(materializationPlan));
    const replaceAtomic = workspace.replaceAtomic.bind(workspace);
    let releaseReplacement!: () => void;
    const replacementReleased = new Promise<void>((resolve) => {
      releaseReplacement = resolve;
    });
    let replacementEntered!: () => void;
    const replacementStarted = new Promise<void>((resolve) => {
      replacementEntered = resolve;
    });
    workspace.replaceAtomic = async (path, value) => {
      if (path.endsWith('/materialization-checkpoint.json')) {
        replacementEntered();
        await replacementReleased;
      }
      return replaceAtomic(path, value);
    };
    let candidate!: XArticleMaterializationCheckpointV1;
    const expected = {
      ...checkpoint(materializationPlan),
      revision: 1,
      phase: 'body_imported' as const,
      body: {
        status: 'verified' as const,
        observed_digest: materializationPlan.import_template_digest
      },
      updated_at: '2026-08-26T08:03:00.000Z'
    };

    const updating = store.updateCheckpoint('execution_update_snapshot', 0, (current) => {
      candidate = {
        ...current,
        phase: expected.phase,
        body: structuredClone(expected.body),
        updated_at: expected.updated_at
      };
      return candidate;
    });
    await replacementStarted;
    Reflect.set(candidate.body, 'status', 'issued');
    releaseReplacement();

    const updated = await updating;
    expect(updated).toEqual(expected);
    expect(updated.body).not.toBe(candidate.body);
    await expect(store.readCheckpoint('execution_update_snapshot')).resolves.toEqual(expected);
  });

  it('snapshots progress input before the first await and returns a detached entry', async () => {
    const { store } = await fixture();
    const materializationPlan = plan();
    await store.create(materializationPlan, checkpoint(materializationPlan));
    const entry = progress();
    const expected = structuredClone(entry);

    const appending = store.appendProgress(entry);
    Reflect.set(entry, 'stage', 'mutated_stage');
    Reflect.set(entry, 'waiting_for', 'mutated_wait');

    const appended = await appending;
    expect(appended).toEqual(expected);
    expect(appended).not.toBe(entry);
    await expect(store.readProgress('execution_v32')).resolves.toEqual([expected]);
  });

  it('rejects a valid foreign plan/checkpoint pair copied under another execution path', async () => {
    const { workspace, store } = await fixture();
    const foreignPlan = plan('execution_foreign', true);
    const foreignCheckpoint = checkpoint(foreignPlan);
    await workspace.writeNew(
      'runs/execution_copy/x-article/browser/materialization-plan.json',
      foreignPlan
    );
    await workspace.writeNew(
      'runs/execution_copy/x-article/browser/materialization-checkpoint.json',
      foreignCheckpoint
    );

    await expect(store.readCheckpoint('execution_copy')).rejects.toMatchObject({
      code: 'ARTICLE_CHECKPOINT_CONFLICT'
    });
  });

  it('fails a simultaneous checkpoint updater busy while preserving stale CAS conflicts', async () => {
    const { workspace, store } = await fixture();
    const materializationPlan = plan('execution_update_contention');
    await store.create(materializationPlan, checkpoint(materializationPlan));
    const replaceAtomic = workspace.replaceAtomic.bind(workspace);
    let releaseReplacement!: () => void;
    const replacementReleased = new Promise<void>((resolve) => {
      releaseReplacement = resolve;
    });
    let replacementEntered!: () => void;
    const replacementStarted = new Promise<void>((resolve) => {
      replacementEntered = resolve;
    });
    workspace.replaceAtomic = async (path, value) => {
      if (path.endsWith('/materialization-checkpoint.json')) {
        replacementEntered();
        await replacementReleased;
      }
      return replaceAtomic(path, value);
    };
    const first = store.updateCheckpoint('execution_update_contention', 0, (current) => ({
      ...current,
      phase: 'preflight_passed',
      updated_at: '2026-08-26T08:03:00.000Z'
    }));
    await replacementStarted;

    await expect(store.updateCheckpoint('execution_update_contention', 0, (current) => current))
      .rejects.toMatchObject({ code: 'EXECUTION_BUSY' });
    releaseReplacement();
    await first;
    await expect(store.updateCheckpoint('execution_update_contention', 0, (current) => current))
      .rejects.toMatchObject({ code: 'ARTICLE_CHECKPOINT_CONFLICT' });
  });

  it('appends and reads validated progress entries in ledger order', async () => {
    const { workspace, store } = await fixture();
    const materializationPlan = plan();
    await store.create(materializationPlan, checkpoint(materializationPlan));
    const first = progress();
    const second = progress({
      stage: 'verify_imported_body',
      elapsed_seconds: 29,
      waiting_for: null,
      observed_effect: 'complete',
      recorded_at: '2026-08-26T08:02:08.000Z'
    });

    await expect(store.readProgress('execution_v32')).resolves.toEqual([]);
    await expect(store.appendProgress(first)).resolves.toEqual(first);
    await expect(store.appendProgress(second)).resolves.toEqual(second);
    await expect(store.readProgress('execution_v32')).resolves.toEqual([first, second]);
    await expect(workspace.readText(
      'runs/execution_v32/x-article/browser/materialization-progress.jsonl'
    )).resolves.toBe(`${JSON.stringify(first)}\n${JSON.stringify(second)}\n`);
  });

  it('rejects missing or corrupt checkpoints without inferring publication state', async () => {
    const { workspace, store } = await fixture();

    const missingCheckpointPlan = plan('execution_missing');
    await store.create(missingCheckpointPlan, checkpoint(missingCheckpointPlan));
    await workspace.removeFile(
      'runs/execution_missing/x-article/browser/materialization-checkpoint.json'
    );
    await expect(store.readCheckpoint('execution_missing')).rejects.toMatchObject({
      code: 'ARTICLE_CHECKPOINT_CONFLICT'
    });

    const materializationPlan = plan('execution_corrupt');
    await store.create(materializationPlan, checkpoint(materializationPlan));
    await workspace.replaceAtomic(
      'runs/execution_corrupt/x-article/browser/materialization-checkpoint.json',
      '{broken'
    );
    await expect(store.readCheckpoint('execution_corrupt')).rejects.toMatchObject({
      code: 'ARTICLE_CHECKPOINT_CONFLICT'
    });
  });

  it('rejects corrupt progress and unsafe execution identifiers fail-closed', async () => {
    const { workspace, store } = await fixture();
    const materializationPlan = plan();
    await store.create(materializationPlan, checkpoint(materializationPlan));
    await workspace.appendLine(
      'runs/execution_v32/x-article/browser/materialization-progress.jsonl',
      JSON.stringify({ ...progress(), elapsed_seconds: -1 })
    );

    await expect(store.readProgress('execution_v32')).rejects.toMatchObject({
      code: 'CONTRACT_INVALID'
    });
    await expect(store.readCheckpoint('../escape')).rejects.toMatchObject({
      code: 'WORKSPACE_PATH_INVALID'
    });
    await expect(store.readProgress('execution_v32/../../escape')).rejects.toMatchObject({
      code: 'WORKSPACE_PATH_INVALID'
    });
  });

  it('rejects malformed progress lines and internal blank JSONL records', async () => {
    const malformed = await fixture();
    const materializationPlan = plan();
    await malformed.store.create(materializationPlan, checkpoint(materializationPlan));
    await malformed.workspace.appendLine(
      'runs/execution_v32/x-article/browser/materialization-progress.jsonl',
      '{broken'
    );
    await expect(malformed.store.readProgress('execution_v32')).rejects.toMatchObject({
      code: 'CONTRACT_INVALID'
    });

    const blank = await fixture();
    await blank.store.create(materializationPlan, checkpoint(materializationPlan));
    await blank.store.appendProgress(progress());
    await blank.workspace.appendLine(
      'runs/execution_v32/x-article/browser/materialization-progress.jsonl',
      ''
    );
    await blank.store.appendProgress(progress({
      stage: 'verify_imported_body',
      recorded_at: '2026-08-26T08:02:08.000Z'
    }));
    await expect(blank.store.readProgress('execution_v32')).rejects.toMatchObject({
      code: 'CONTRACT_INVALID'
    });
  });
});
