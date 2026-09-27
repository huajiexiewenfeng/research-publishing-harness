import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MemoryPromotionService } from '../../harnesses/research-publishing/core/memory-promotion-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { createPromotionFixture, FakePromotionRuntime, promotionAssets } from './memory-promotion-fixture.js';

function withoutDigest<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const copy = { ...value };
  Reflect.deleteProperty(copy, key);
  return copy;
}

async function setup() {
  const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-promotion-service-')));
  const fixture = await createPromotionFixture(store);
  const runtime = new FakePromotionRuntime();
  const service = new MemoryPromotionService(store, runtime, promotionAssets, {
    planId: () => 'promotion_plan_001', approvalId: () => 'promotion_approval_001',
    receiptId: () => 'promotion_receipt_001', now: () => new Date('2026-08-23T04:05:00.000Z')
  });
  return { store, runtime, service, ...fixture };
}

describe('MemoryPromotionService', () => {
  it('binds one approval and commits Catalog last', async () => {
    const { service, runtime, delta, review } = await setup();
    const plan = await service.plan(delta.delta_id, review.review_id);
    const approval = await service.approve(plan.plan_id, plan.plan_digest, 'human-reviewer', 60_000);
    const receipt = await service.execute(plan.plan_id, approval);
    expect(receipt).toMatchObject({ status: 'complete', reconciliation_required: false, final_catalog_digest: plan.expected_final_catalog_digest });
    expect(runtime.calls.filter((call) => call.startsWith('write_record:')).at(-1))
      .toBe('write_record:research_index_catalog');
    expect(runtime.calls.indexOf('find_catalog')).toBeLessThan(runtime.calls.lastIndexOf('find_catalog'));
  });

  it('fails closed when already_exists checksum differs from the Plan', async () => {
    const { service, runtime, delta, review } = await setup();
    const plan = await service.plan(delta.delta_id, review.review_id);
    const approval = await service.approve(plan.plan_id, plan.plan_digest, 'human-reviewer', 60_000);
    runtime.mismatchAlreadyExistsType = 'claim_version';
    const receipt = await service.execute(plan.plan_id, approval);
    expect(receipt).toMatchObject({ status: 'partial', final_catalog_digest: null });
    expect(runtime.calls).not.toContain('write_record:research_index_catalog');
  });

  it('resumes after a safe shard failure without repeating confirmed mutations', async () => {
    const { service, runtime, delta, review } = await setup();
    const plan = await service.plan(delta.delta_id, review.review_id);
    const approval = await service.approve(plan.plan_id, plan.plan_digest, 'human-reviewer', 60_000);
    runtime.failOnceAt = 'write_record:research_index_shard';
    await expect(service.execute(plan.plan_id, approval)).resolves.toMatchObject({ status: 'partial' });
    const copied = runtime.calls.filter((call) => call === 'copy_source').length;
    await expect(service.resume(plan.plan_id, approval)).resolves.toMatchObject({ status: 'complete' });
    expect(runtime.calls.filter((call) => call === 'copy_source')).toHaveLength(copied);
  });
});


describe('Promotion target preflight', () => {
  it('rejects missing profile variables before staging or Runtime mutations', async () => {
    const { service, runtime, store, delta, review } = await setup();
    const { sha256 } = await import('../../harnesses/research-publishing/core/digest.js');
    const broken = structuredClone(delta);
    const target = broken.proposed_operations[0]!.target_content as {variables: Record<string,string>};
    delete target.variables.claim_id;
    const unsignedDelta = withoutDigest(broken, 'delta_digest');
    const nextDelta = {...unsignedDelta, delta_digest:sha256(unsignedDelta)};
    const unsignedReview = withoutDigest(review, 'review_digest');
    const nextReview = {...unsignedReview, delta_digest: nextDelta.delta_digest};
    await store.replaceAtomic(`memory/deltas/${delta.delta_id}/delta.json`, nextDelta);
    await store.replaceAtomic(`memory/reviews/${review.review_id}/review.json`, {...nextReview,review_digest:sha256(nextReview)});
    await expect(service.plan(delta.delta_id,review.review_id)).rejects.toThrow(/required variable: claim_id/);
    expect(runtime.calls).not.toContain('copy_source');
    expect(await store.exists('memory/promotions/promotion_plan_001/staging/source.json')).toBe(false);
  });
  it('binds a new plan and receipt to the selected 0.3 runtime', async () => {
    const {store,delta,review}=await setup();
    class CurrentRuntime extends FakePromotionRuntime {
      override async version(): Promise<'0.2.0' | '0.3.0'> {return '0.3.0';}
    }
    const runtime = new CurrentRuntime();
    const service = new MemoryPromotionService(store,runtime,promotionAssets);
    const plan=await service.plan(delta.delta_id,review.review_id);
    expect(plan.runtime_requirement.version).toBe('0.3.0');
    const approval=await service.approve(plan.plan_id,plan.plan_digest,'human-reviewer',60000);
    const receipt=await service.execute(plan.plan_id,approval);
    expect(receipt).toMatchObject({status:'complete',runtime_version:'0.3.0'});
  });
});

it('stores document manifests without presenting them as additional mainline knowledge', async () => {
  const {service,store,delta,review}=await setup();
  const {sha256}=await import('../../harnesses/research-publishing/core/digest.js');
  const target={frontmatter:{document_id:'doc_example'},variables:{research_track:'enterprise-agent-runtime',document_id:'doc_example'},refs:{},body:'# Manifest\n{}\n',index_entry:{...(delta.proposed_operations[0]!.target_content as {index_entry:object}).index_entry,ref:'document:doc_example',record_path:'domains/research-publishing/tracks/enterprise-agent-runtime/documents/doc_example/manifest.md'}};
  const document={...delta.proposed_operations[0]!,operation_id:'op_doc',target_id:'doc_example',record_type:'canonical_document_manifest',target_content:target,target_content_digest:sha256(target)};
  const d = withoutDigest(delta, 'delta_digest');
  const body={...d,proposed_operations:[...d.proposed_operations,document]};
  const next={...body,delta_digest:sha256(body)};
  const r = withoutDigest(review, 'review_digest');
  const rb={...r,delta_digest:next.delta_digest,accepted_operation_ids:[...r.accepted_operation_ids,'op_doc']};
  await store.replaceAtomic(`memory/deltas/${delta.delta_id}/delta.json`,next);
  await store.replaceAtomic(`memory/reviews/${review.review_id}/review.json`,{...rb,review_digest:sha256(rb)});
  const plan=await service.plan(delta.delta_id,review.review_id);
  expect(plan.document_record_operations).toHaveLength(1);
  const projection=await store.readJson<{records:unknown[]}>(`memory/promotions/${plan.plan_id}/projection.json`);
  expect(projection.records).toHaveLength(1);
});
