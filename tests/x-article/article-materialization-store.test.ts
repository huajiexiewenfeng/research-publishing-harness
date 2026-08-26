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

function plan(executionId = 'execution_v32'): XArticleMaterializationPlanV1 {
  const body = {
    schema_version: 'x-article-materialization-plan/v1' as const,
    execution_id: executionId,
    publication_plan_digest: digest('a'),
    target_account: '@Glen56121',
    strategy: 'rich_text_anchor_import/v1' as const,
    document_digest: digest('b'),
    import_template_digest: digest('c'),
    visual_anchors: [],
    expected_command_ceiling: 12,
    expected_observation_ceiling: 9,
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
    materialization_digest: materializationPlan.materialization_digest,
    revision: 0,
    phase: 'preflight_pending',
    body: { status: 'pending', observed_digest: null },
    media: [],
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
});
