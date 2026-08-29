import { describe, expect, it } from 'vitest';

import { PublicationBundleService } from '../../harnesses/research-publishing/core/publication-bundle-service.js';
import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
import { createPublicationBundleFixture } from '../fixtures/publication-bundle.js';
import { createPreparedPublicationBundleFixture } from '../publication-bundle/prepared-article-fixture.js';

describe('Publication Bundle Approval security', () => {
  it('takes no TTL and derives the locked expiry from the installed Plan', async () => {
    const fixture = await createPublicationBundleFixture();
    const service = new PublicationBundleService(fixture.store, fixture.weeks, {
      now: () => new Date('2026-08-24T12:00:00.000Z'),
      approvalId: () => 'bundle_approval_week_01'
    });
    const plan = await service.plan(fixture.planInput);
    const approval = await service.approve({
      bundle_id: plan.bundle_id,
      confirmed_bundle_digest: plan.bundle_digest,
      approved_by: 'human:Glen56121'
    });
    expect(Date.parse(approval.expires_at) - Date.parse(approval.approved_at))
      .toBe(plan.authorization_ttl_ms);
    expect(approval).not.toHaveProperty('ttl_ms');
    const approvalPath = `runs/${plan.bundle_id}/publication-bundle/approval.json`;
    const historicalBytes = await fixture.store.readBytes(approvalPath);
    await expect(service.approve({
      bundle_id: plan.bundle_id,
      confirmed_bundle_digest: plan.bundle_digest,
      approved_by: 'human:Glen56121'
    })).resolves.toEqual(approval);
    expect(await fixture.store.readBytes(approvalPath)).toEqual(historicalBytes);
    await service.status(plan.bundle_id);
    await service.articleAuthorization(plan.bundle_id);
    expect(await fixture.store.readBytes(approvalPath)).toEqual(historicalBytes);
    expect(approval.schema_version).toBe('publication-bundle-approval/v1');
  });

  it('rejects missing receipt evidence and foreign prepared account state', async () => {
    const missing = await createPreparedPublicationBundleFixture({ executionId: 'execution_missing' });
    await missing.store.removeFile(missing.receiptRef.path);
    await expect(missing.service.bindPreparedArticle({
      bundle_id: missing.plan.bundle_id,
      execution_id: missing.execution.execution_id,
      preview_revision: missing.preview.page_revision,
      materialization_receipt_ref: missing.receiptRef,
      bound_at: '2026-08-26T00:10:00.000Z'
    })).rejects.toMatchObject({ code: 'ARTIFACT_NOT_FOUND' });

    const foreign = await createPreparedPublicationBundleFixture({ executionId: 'execution_foreign' });
    const contextPath = `runs/${foreign.execution.execution_id}/x-article/browser/adapter-context.json`;
    const context = await foreign.store.readJson<Record<string, unknown>>(contextPath);
    await foreign.store.replaceAtomic(contextPath, {
      ...context,
      plan: {
        ...(context.plan as Record<string, unknown>),
        intent: {
          ...((context.plan as { intent: Record<string, unknown> }).intent),
          target_account: '@OtherAccount'
        }
      }
    });
    await expect(foreign.service.bindPreparedArticle({
      bundle_id: foreign.plan.bundle_id,
      execution_id: foreign.execution.execution_id,
      preview_revision: foreign.preview.page_revision,
      materialization_receipt_ref: foreign.receiptRef,
      bound_at: '2026-08-26T00:10:00.000Z'
    })).rejects.toMatchObject({ code: 'PUBLISH_GATE_BLOCKED' });
  });

  it('derives confirmation that cannot widen the approved audience or ordered assets', async () => {
    const fixture = await createPreparedPublicationBundleFixture({ executionId: 'execution_exact' });
    const binding = await fixture.service.bindPreparedArticle({
      bundle_id: fixture.plan.bundle_id,
      execution_id: fixture.execution.execution_id,
      preview_revision: fixture.preview.page_revision,
      materialization_receipt_ref: fixture.receiptRef,
      bound_at: '2026-08-26T00:10:00.000Z'
    });
    await fixture.service.approve({
      bundle_id: fixture.plan.bundle_id,
      confirmed_bundle_digest: fixture.plan.bundle_digest,
      confirmed_preview_revision: binding.preview_revision,
      approved_by: 'human:Glen56121'
    });
    const confirmation = await fixture.service.articlePublishConfirmation(fixture.plan.bundle_id);
    const body = Object.fromEntries(
      Object.entries(confirmation).filter(([key]) => key !== 'confirmation_digest')
    ) as Omit<typeof confirmation, 'confirmation_digest'>;
    const widenedAudience = {
      ...body,
      audience: 'followers',
      confirmation_digest: sha256({ ...body, audience: 'followers' })
    };
    await expect(fixture.adapter.confirmPublish(
      fixture.execution.execution_id,
      widenedAudience as typeof confirmation
    )).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });

    const widenedAssetsBody = {
      ...body,
      asset_digests: [...body.asset_digests, `sha256:${'e'.repeat(64)}`]
    };
    await expect(fixture.adapter.confirmPublish(
      fixture.execution.execution_id,
      {
        ...widenedAssetsBody,
        confirmation_digest: sha256(widenedAssetsBody)
      } as typeof confirmation
    )).rejects.toMatchObject({ code: 'PUBLISH_GATE_BLOCKED' });
    await expect(fixture.adapter.confirmPublish(
      fixture.execution.execution_id,
      confirmation
    )).resolves.toMatchObject({ state: 'publish_armed', publish_command_count: 0 });
  });

  it('does not allow one prepared child execution to cross Bundle identity', async () => {
    const fixture = await createPreparedPublicationBundleFixture({ executionId: 'execution_owned' });
    const input = {
      bundle_id: fixture.plan.bundle_id,
      execution_id: fixture.execution.execution_id,
      preview_revision: fixture.preview.page_revision,
      materialization_receipt_ref: fixture.receiptRef,
      bound_at: '2026-08-26T00:10:00.000Z'
    } as const;
    await fixture.service.bindPreparedArticle(input);
    const installedBody = Object.fromEntries(
      Object.entries(fixture.plan).filter(([key]) => key !== 'bundle_digest')
    ) as Omit<typeof fixture.plan, 'bundle_digest'>;
    const foreignBody = { ...installedBody, bundle_id: 'bundle_foreign_2026' };
    const foreignPlan = { ...foreignBody, bundle_digest: sha256(foreignBody) };
    await fixture.store.writeNew(
      `runs/${foreignPlan.bundle_id}/publication-bundle/plan.json`,
      foreignPlan
    );
    await expect(fixture.service.bindPreparedArticle({
      ...input,
      bundle_id: foreignPlan.bundle_id
    })).rejects.toMatchObject({ code: 'PUBLISH_GATE_BLOCKED' });
  });

  it('fails closed on stale Preview evidence and on an already-issued Publish command', async () => {
    const fixture = await createPreparedPublicationBundleFixture();
    await expect(fixture.service.bindPreparedArticle({
      bundle_id: fixture.plan.bundle_id,
      execution_id: fixture.execution.execution_id,
      preview_revision: `sha256:${'f'.repeat(64)}`,
      materialization_receipt_ref: fixture.receiptRef,
      bound_at: '2026-08-26T00:10:00.000Z'
    })).rejects.toMatchObject({ code: 'PUBLISH_GATE_BLOCKED' });

    const prefix = `runs/${fixture.execution.execution_id}/x-article/browser`;
    const existingCommands = await fixture.store.list(`${prefix}/commands`);
    const source = await fixture.store.readJson<Record<string, unknown>>(
      `${existingCommands[0]!.relative_path}/command.json`
    );
    const payload = { kind: 'publish_article_once', target_ref: 'publish' };
    await fixture.store.writeNew(`${prefix}/commands/forged_publish/command.json`, {
      ...source,
      command_id: 'forged_publish', kind: 'publish_article_once',
      purpose: 'publish_article_once', side_effect: 'submit', payload,
      payload_digest: sha256(payload)
    });
    await expect(fixture.service.bindPreparedArticle({
      bundle_id: fixture.plan.bundle_id,
      execution_id: fixture.execution.execution_id,
      preview_revision: fixture.preview.page_revision,
      materialization_receipt_ref: fixture.receiptRef,
      bound_at: '2026-08-26T00:10:00.000Z'
    })).rejects.toMatchObject({ code: 'PUBLISH_GATE_BLOCKED' });
  });
});
