import { describe, expect, it } from 'vitest';

import { PublicationBundleService } from '../../harnesses/research-publishing/core/publication-bundle-service.js';
import { createPublicationBundleFixture } from '../fixtures/publication-bundle.js';
import { createPreparedPublicationBundleFixture } from './prepared-article-fixture.js';

describe('PublicationBundleService planning', () => {
  it('plans one exact Article plus one tokenized Single and installs the week binding', async () => {
    const fixture = await createPublicationBundleFixture();
    const service = new PublicationBundleService(fixture.store, fixture.weeks);
    const plan = await service.plan(fixture.planInput);
    expect(plan.execution_order).toEqual(['x_article', 'x_single']);
    expect(plan.authorization_ttl_ms).toBe(7_200_000);
    await expect(fixture.store.readJson(
      `program/weeks/${plan.cycle_id}/publication-bundle-binding.json`
    )).resolves.toMatchObject({ bundle_plan_ref: { digest: plan.bundle_digest } });
    expect((await fixture.weeks.status(plan.cycle_id)).phase).toBe('publication_planned');
  });

  it('accepts a byte-identical Plan retry and rejects a second Bundle for the Cycle', async () => {
    const fixture = await createPublicationBundleFixture();
    const service = new PublicationBundleService(fixture.store, fixture.weeks);
    const first = await service.plan(fixture.planInput);
    await expect(service.plan(fixture.planInput)).resolves.toEqual(first);
    await expect(service.plan({
      ...fixture.planInput,
      bundle_id: 'bundle_week_01_second'
    })).rejects.toMatchObject({ code: 'STATE_TRANSITION_INVALID' });
  });
});

describe('PublicationBundleService prepared Article binding', () => {
  it('binds a verified Preview and derives the exact Task 6 confirmation from one V2 approval', async () => {
    const fixture = await createPreparedPublicationBundleFixture();
    const prepared = await fixture.service.bindPreparedArticle({
      bundle_id: fixture.plan.bundle_id,
      execution_id: fixture.execution.execution_id,
      preview_revision: fixture.preview.page_revision,
      materialization_receipt_ref: fixture.receiptRef,
      bound_at: '2026-08-26T00:10:00.000Z'
    });
    expect((await fixture.service.status(fixture.plan.bundle_id)).phase)
      .toBe('article_preview_ready');

    const approval = await fixture.service.approve({
      bundle_id: fixture.plan.bundle_id,
      confirmed_bundle_digest: fixture.plan.bundle_digest,
      confirmed_preview_revision: prepared.preview_revision,
      approved_by: 'human:Glen56121'
    });
    expect(approval).toMatchObject({
      schema_version: 'publication-bundle-approval/v2',
      confirmed_preview_revision: prepared.preview_revision,
      prepared_article_binding_ref: {
        path: expect.stringContaining('/prepared-article-bindings/')
      }
    });
    expect((await fixture.service.status(fixture.plan.bundle_id)).phase)
      .toBe('confirmation_pending');
    await expect(fixture.service.articlePublishConfirmation(fixture.plan.bundle_id))
      .resolves.toMatchObject({
        execution_id: fixture.execution.execution_id,
        scope: 'publish_article_once',
        target_account: fixture.plan.article_plan.intent.target_account,
        audience: 'everyone',
        asset_digests: fixture.plan.article_plan.intent.visuals.map((item) => item.asset.digest)
      });
    await expect(fixture.adapter.status(fixture.execution.execution_id))
      .resolves.toMatchObject({ state: 'confirmation_pending', publish_command_count: 0 });
  });

  it('repairs partial binding and approval persistence without changing authority', async () => {
    const fixture = await createPreparedPublicationBundleFixture();
    const bindInput = {
      bundle_id: fixture.plan.bundle_id,
      execution_id: fixture.execution.execution_id,
      preview_revision: fixture.preview.page_revision,
      materialization_receipt_ref: fixture.receiptRef,
      bound_at: '2026-08-26T00:10:00.000Z'
    } as const;
    const replaceAtomic = fixture.store.replaceAtomic.bind(fixture.store);
    let failProjection = true;
    fixture.store.replaceAtomic = async (path, value) => {
      if (path.endsWith('/prepared-article-active.json') && failProjection) {
        failProjection = false;
        throw new Error('injected projection crash');
      }
      return replaceAtomic(path, value);
    };
    await expect(fixture.service.bindPreparedArticle(bindInput))
      .rejects.toThrow('injected projection crash');
    const repaired = await fixture.service.bindPreparedArticle(bindInput);
    expect(repaired.binding_version).toBe(1);

    const writeNew = fixture.store.writeNew.bind(fixture.store);
    let failConfirmation = true;
    fixture.store.writeNew = async (path, value) => {
      if (path.endsWith('/article-publish-confirmation.json') && failConfirmation) {
        failConfirmation = false;
        throw new Error('injected confirmation crash');
      }
      return writeNew(path, value);
    };
    const approvalInput = {
      bundle_id: fixture.plan.bundle_id,
      confirmed_bundle_digest: fixture.plan.bundle_digest,
      confirmed_preview_revision: repaired.preview_revision,
      approved_by: 'human:Glen56121'
    } as const;
    await expect(fixture.service.approve(approvalInput))
      .rejects.toThrow('injected confirmation crash');
    const approval = await fixture.service.approve(approvalInput);
    const retry = await fixture.service.approve(approvalInput);
    expect(retry).toEqual(approval);
    await expect(fixture.service.articlePublishConfirmation(fixture.plan.bundle_id))
      .resolves.toMatchObject({ confirmed_by: approval.approved_by });
  });

  it('serializes concurrent prepared bindings at the Bundle control lock', async () => {
    const fixture = await createPreparedPublicationBundleFixture();
    const input = {
      bundle_id: fixture.plan.bundle_id,
      execution_id: fixture.execution.execution_id,
      preview_revision: fixture.preview.page_revision,
      materialization_receipt_ref: fixture.receiptRef,
      bound_at: '2026-08-26T00:10:00.000Z'
    } as const;
    const withLock = fixture.store.withLock.bind(fixture.store);
    let enteredResolve!: () => void;
    let releaseResolve!: () => void;
    const entered = new Promise<void>((resolve) => { enteredResolve = resolve; });
    const release = new Promise<void>((resolve) => { releaseResolve = resolve; });
    let pause = true;
    fixture.store.withLock = (path, operation) => withLock(path, async () => {
      if (path.endsWith('/control-plane.lock') && pause) {
        pause = false;
        enteredResolve();
        await release;
      }
      return operation();
    });
    const first = fixture.service.bindPreparedArticle(input);
    await entered;
    await expect(fixture.service.bindPreparedArticle(input))
      .rejects.toMatchObject({ code: 'EXECUTION_BUSY' });
    releaseResolve();
    await expect(first).resolves.toMatchObject({ binding_version: 1 });
  });

  it('keeps immutable binding history while unbinding and rebinding before approval', async () => {
    const fixture = await createPreparedPublicationBundleFixture();
    const input = {
      bundle_id: fixture.plan.bundle_id,
      execution_id: fixture.execution.execution_id,
      preview_revision: fixture.preview.page_revision,
      materialization_receipt_ref: fixture.receiptRef,
      bound_at: '2026-08-26T00:10:00.000Z'
    } as const;
    const first = await fixture.service.bindPreparedArticle(input);
    await expect(fixture.service.unbindPreparedArticle(fixture.plan.bundle_id))
      .resolves.toMatchObject({ phase: 'article_materializing' });
    await expect(fixture.service.unbindPreparedArticle(fixture.plan.bundle_id))
      .resolves.toMatchObject({ phase: 'article_materializing' });
    const secondInput = {
      ...input,
      bound_at: '2026-08-26T00:10:01.000Z'
    } as const;
    const replaceAtomic = fixture.store.replaceAtomic.bind(fixture.store);
    let failRebindProjection = true;
    fixture.store.replaceAtomic = async (path, value) => {
      if (path.endsWith('/prepared-article-active.json') && failRebindProjection) {
        failRebindProjection = false;
        throw new Error('injected rebind projection crash');
      }
      return replaceAtomic(path, value);
    };
    await expect(fixture.service.bindPreparedArticle(secondInput))
      .rejects.toThrow('injected rebind projection crash');
    const second = await fixture.service.bindPreparedArticle(secondInput);
    expect(second.binding_version).toBe(2);
    expect(second.binding_digest).not.toBe(first.binding_digest);
    await expect(fixture.store.exists(first.binding_ref.path)).resolves.toBe(true);

    await fixture.service.approve({
      bundle_id: fixture.plan.bundle_id,
      confirmed_bundle_digest: fixture.plan.bundle_digest,
      confirmed_preview_revision: second.preview_revision,
      approved_by: 'human:Glen56121'
    });
    await expect(fixture.service.unbindPreparedArticle(fixture.plan.bundle_id))
      .rejects.toMatchObject({ code: 'STATE_TRANSITION_INVALID' });
    await expect(fixture.service.bindPreparedArticle(input))
      .rejects.toMatchObject({ code: 'STATE_TRANSITION_INVALID' });
  });

  it('recovers an interrupted unbind with its authoritative persisted time', async () => {
    const fixture = await createPreparedPublicationBundleFixture();
    const input = {
      bundle_id: fixture.plan.bundle_id,
      execution_id: fixture.execution.execution_id,
      preview_revision: fixture.preview.page_revision,
      materialization_receipt_ref: fixture.receiptRef,
      bound_at: '2026-08-26T00:10:00.000Z'
    } as const;
    await fixture.service.bindPreparedArticle(input);
    const replaceAtomic = fixture.store.replaceAtomic.bind(fixture.store);
    let failProjectionClear = true;
    fixture.store.replaceAtomic = async (path, value) => {
      if (path.endsWith('/prepared-article-active.json') && failProjectionClear) {
        failProjectionClear = false;
        throw new Error('injected unbind projection crash');
      }
      return replaceAtomic(path, value);
    };

    await expect(fixture.service.unbindPreparedArticle(fixture.plan.bundle_id))
      .rejects.toThrow('injected unbind projection crash');
    const unbindingPath = `runs/${fixture.plan.bundle_id}/publication-bundle/`
      + 'prepared-article-unbindings/000001.json';
    const persisted = await fixture.store.readJson(unbindingPath);
    const retryService = new PublicationBundleService(fixture.store, fixture.weeks, {
      now: () => new Date('2026-08-26T00:11:00.000Z'),
      approvalId: () => 'bundle_approval_prepared_retry'
    });

    await expect(retryService.unbindPreparedArticle(fixture.plan.bundle_id))
      .resolves.toMatchObject({ phase: 'article_materializing' });
    await expect(fixture.store.readJson(unbindingPath)).resolves.toEqual(persisted);
    await expect(retryService.unbindPreparedArticle(fixture.plan.bundle_id))
      .resolves.toMatchObject({ phase: 'article_materializing' });
    await expect(fixture.store.readJson(
      `runs/${fixture.plan.bundle_id}/publication-bundle/prepared-article-active.json`
    )).resolves.toMatchObject({
      revision: 2,
      active_binding_ref: null,
      updated_at: (persisted as { unbound_at: string }).unbound_at
    });
  });

  it('never returns an active binding already revoked by an interrupted unbind', async () => {
    const fixture = await createPreparedPublicationBundleFixture();
    const input = {
      bundle_id: fixture.plan.bundle_id,
      execution_id: fixture.execution.execution_id,
      preview_revision: fixture.preview.page_revision,
      materialization_receipt_ref: fixture.receiptRef,
      bound_at: '2026-08-26T00:10:00.000Z'
    } as const;
    const first = await fixture.service.bindPreparedArticle(input);
    const replaceAtomic = fixture.store.replaceAtomic.bind(fixture.store);
    let failProjectionClear = true;
    fixture.store.replaceAtomic = async (path, value) => {
      if (path.endsWith('/prepared-article-active.json') && failProjectionClear) {
        failProjectionClear = false;
        throw new Error('injected unbind projection crash');
      }
      return replaceAtomic(path, value);
    };
    await expect(fixture.service.unbindPreparedArticle(fixture.plan.bundle_id))
      .rejects.toThrow('injected unbind projection crash');

    const rebound = await fixture.service.bindPreparedArticle(input);
    expect(rebound.binding_version).toBe(2);
    expect(rebound.binding_ref).not.toEqual(first.binding_ref);
    expect(rebound.binding_digest).not.toBe(first.binding_digest);
    await expect(fixture.store.exists(first.binding_ref.path)).resolves.toBe(true);
  });

  it.each([
    ['Bundle approval', '/publication-bundle/approval.json'],
    ['derived confirmation', '/publication-bundle/article-publish-confirmation.json']
  ])('holds the child lock through %s persistence', async (_boundary, boundaryPath) => {
    const fixture = await createPreparedPublicationBundleFixture();
    const prepared = await fixture.service.bindPreparedArticle({
      bundle_id: fixture.plan.bundle_id,
      execution_id: fixture.execution.execution_id,
      preview_revision: fixture.preview.page_revision,
      materialization_receipt_ref: fixture.receiptRef,
      bound_at: '2026-08-26T00:10:00.000Z'
    });
    const writeNew = fixture.store.writeNew.bind(fixture.store);
    let enteredResolve!: () => void;
    let releaseResolve!: () => void;
    const entered = new Promise<void>((resolve) => { enteredResolve = resolve; });
    const release = new Promise<void>((resolve) => { releaseResolve = resolve; });
    let pause = true;
    fixture.store.writeNew = async (path, value) => {
      if (path.endsWith(boundaryPath) && pause) {
        pause = false;
        enteredResolve();
        await release;
      }
      return writeNew(path, value);
    };
    const approving = fixture.service.approve({
      bundle_id: fixture.plan.bundle_id,
      confirmed_bundle_digest: fixture.plan.bundle_digest,
      confirmed_preview_revision: prepared.preview_revision,
      approved_by: 'human:Glen56121'
    });
    await entered;
    try {
      await expect(fixture.adapter.cancelBeforePublish(fixture.execution.execution_id))
        .rejects.toMatchObject({ code: 'EXECUTION_BUSY' });
    } finally {
      releaseResolve();
    }
    await expect(approving).resolves.toMatchObject({
      schema_version: 'publication-bundle-approval/v2'
    });
    await expect(fixture.service.articlePublishConfirmation(fixture.plan.bundle_id))
      .resolves.toMatchObject({ execution_id: fixture.execution.execution_id });
  });

  it('creates no approval authority when child cancellation wins the lock', async () => {
    const fixture = await createPreparedPublicationBundleFixture();
    const prepared = await fixture.service.bindPreparedArticle({
      bundle_id: fixture.plan.bundle_id,
      execution_id: fixture.execution.execution_id,
      preview_revision: fixture.preview.page_revision,
      materialization_receipt_ref: fixture.receiptRef,
      bound_at: '2026-08-26T00:10:00.000Z'
    });
    const withLock = fixture.store.withLock.bind(fixture.store);
    let enteredResolve!: () => void;
    let releaseResolve!: () => void;
    const entered = new Promise<void>((resolve) => { enteredResolve = resolve; });
    const release = new Promise<void>((resolve) => { releaseResolve = resolve; });
    let pauseChild = true;
    fixture.store.withLock = (path, operation) => withLock(path, async () => {
      if (path.endsWith('/x-article/adapter-execution.lock') && pauseChild) {
        pauseChild = false;
        enteredResolve();
        await release;
      }
      return operation();
    });
    const cancelling = fixture.adapter.cancelBeforePublish(fixture.execution.execution_id);
    await entered;
    await expect(fixture.service.approve({
      bundle_id: fixture.plan.bundle_id,
      confirmed_bundle_digest: fixture.plan.bundle_digest,
      confirmed_preview_revision: prepared.preview_revision,
      approved_by: 'human:Glen56121'
    })).rejects.toMatchObject({ code: 'EXECUTION_BUSY' });
    releaseResolve();
    await expect(cancelling).resolves.toMatchObject({ state: 'cancelled_before_publish' });
    await expect(fixture.service.approve({
      bundle_id: fixture.plan.bundle_id,
      confirmed_bundle_digest: fixture.plan.bundle_digest,
      confirmed_preview_revision: prepared.preview_revision,
      approved_by: 'human:Glen56121'
    })).rejects.toMatchObject({ code: 'PUBLISH_GATE_BLOCKED' });
    await expect(fixture.store.exists(
      `runs/${fixture.plan.bundle_id}/publication-bundle/approval.json`
    )).resolves.toBe(false);
    await expect(fixture.store.exists(
      `runs/${fixture.plan.bundle_id}/publication-bundle/article-publish-confirmation.json`
    )).resolves.toBe(false);
  });
});
