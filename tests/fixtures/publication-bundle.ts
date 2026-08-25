import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { XArticleService } from '../../harnesses/research-publishing/branches/x-article-harness/x-article-service.js';
import { XArticleBrowserAdapter } from '../../harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.js';
import { createXArticleReceipt } from '../../harnesses/research-publishing/adapters/x/article-browser/article-receipt.js';
import { XArticleWeb2026_08Contract } from '../../harnesses/research-publishing/adapters/x/article-browser/contracts/x-article-web-2026-08.js';
import { BrowserAdapter } from '../../harnesses/research-publishing/adapters/x/browser/browser-adapter.js';
import type { BrowserCapabilityManifest } from '../../harnesses/research-publishing/adapters/x/browser/browser-protocol.js';
import { CommandBroker } from '../../harnesses/research-publishing/adapters/x/browser/command-broker.js';
import { XWeb202608Contract } from '../../harnesses/research-publishing/adapters/x/browser/contracts/x-web-2026-08.js';
import { createPublicationReceiptV2 } from '../../harnesses/research-publishing/adapters/x/browser/receipt-v2.js';
import { createPublicationReceiptV2_1 } from '../../harnesses/research-publishing/adapters/x/browser/receipt-v2-1.js';
import { sha256, sha256Bytes } from '../../harnesses/research-publishing/core/digest.js';
import { ExecutionStore } from '../../harnesses/research-publishing/core/execution-store.js';
import { PublicationBundleService } from '../../harnesses/research-publishing/core/publication-bundle-service.js';
import { ResearchBacklogService } from '../../harnesses/research-publishing/core/research-backlog-service.js';
import {
  createResearchContextReview,
  createResearchContextSnapshot,
  createResearchQueryPlan
} from '../../harnesses/research-publishing/core/research-query-types.js';
import { ResearchRoadmapService } from '../../harnesses/research-publishing/core/research-roadmap-service.js';
import {
  createWeeklyCycleStatus
} from '../../harnesses/research-publishing/core/research-program-contracts.js';
import type { ResearchTopicRevisionV1 } from '../../harnesses/research-publishing/core/research-program-types.js';
import type { PlanPublicationBundleInput } from '../../harnesses/research-publishing/core/publication-bundle-types.js';
import { WeeklyResearchCycleService } from '../../harnesses/research-publishing/core/weekly-research-cycle-service.js';
import type {
  ResearchContentPackageV1_2,
  VisualAssetRef
} from '../../harnesses/research-publishing/core/types.js';
import { validateContract } from '../../harnesses/research-publishing/core/schema-validator.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { researchPackage } from './research-package.js';
import {
  roadmapInput,
  topicInput,
  weeklyCandidateBrief
} from './research-program.js';

export interface PublicationBundleFixture {
  readonly store: WorkspaceStore;
  readonly roadmaps: ResearchRoadmapService;
  readonly backlog: ResearchBacklogService;
  readonly weeks: WeeklyResearchCycleService;
  readonly planInput: PlanPublicationBundleInput;
}

export interface ApprovedPublicationBundleFixture extends PublicationBundleFixture {
  readonly service: PublicationBundleService;
  readonly plan: Awaited<ReturnType<PublicationBundleService['plan']>>;
  readonly authorization: Awaited<ReturnType<PublicationBundleService['articleAuthorization']>>;
}

export interface SingleAuthorizedPublicationBundleFixture
extends ApprovedPublicationBundleFixture {
  readonly materialized: Awaited<ReturnType<PublicationBundleService['materializeSingle']>>;
  readonly singleAuthorization: Awaited<ReturnType<PublicationBundleService['singleAuthorization']>>;
}

export const publicationBundleNow = new Date('2026-08-24T12:00:00.000Z');

const fixtureDigest = (char: string) => `sha256:${char.repeat(64)}` as const;

async function seedReviewedQuery(store: WorkspaceStore) {
  const plan = createResearchQueryPlan({
    query_id: 'query_week_01', track_id: 'enterprise-agent-runtime',
    query_intent: 'Find evidence for the Runtime boundary.', view: 'mainline',
    include_working: false, selection_terms: ['runtime', 'boundary'],
    selection_rationale: 'Prefer accepted claims with canonical evidence.',
    document_mode: 'none', catalog_ref: null, selected_shard_refs: [],
    selected_record_refs: [], selected_manifest_refs: [], selected_chunk_refs: [],
    created_at: '2026-08-24T07:00:00.000Z'
  });
  const snapshot = createResearchContextSnapshot({
    snapshot_id: 'snapshot_week_01', query_plan_digest: plan.plan_digest,
    query_id: plan.query_id, query_intent: plan.query_intent, track_id: plan.track_id,
    view: plan.view, index_refs: [], selected_summary_refs: [], selected_record_refs: [],
    selected_evidence_refs: ['evidence:runtime_boundary'], context_items: [{
      context_ref: 'claim:runtime_boundary@1',
      relative_path: 'domains/research-publishing/tracks/enterprise-agent-runtime/claims/runtime_boundary/versions/1.md',
      content_digest: fixtureDigest('a'),
      content: 'Deterministic access belongs in the Runtime.',
      source_layer: 'semantic_record', classification: 'data_only', sanitized: true, risk_flags: []
    }], risk_flags: [], budgets: plan.budgets, selection_rationale: plan.selection_rationale,
    query_status: 'loaded', runtime_version: '0.2.0', created_at: '2026-08-24T07:01:00.000Z'
  });
  const review = createResearchContextReview(snapshot, {
    review_id: 'review_week_01', selected_context_refs: ['claim:runtime_boundary@1'],
    reviewer: 'human', reviewed_at: '2026-08-24T07:02:00.000Z'
  });
  const root = `memory/queries-v2/${plan.query_id}`;
  await store.writeNew(`${root}/plan.json`, plan);
  await store.writeNew(`${root}/snapshot.json`, snapshot);
  await store.writeNew(`${root}/review.json`, review);
  return { plan, snapshot, review };
}

export const articleBrowserCapabilities = {
  executor: 'codex-chrome',
  executor_version: '26.818.31338',
  browser_family: 'chrome',
  capabilities: [
    'observe_article_page', 'create_article_draft', 'set_article_title',
    'upload_article_cover', 'insert_article_block', 'insert_article_image',
    'set_article_image_alt', 'open_article_preview', 'open_publish_review',
    'publish_article_once'
  ],
  observed_at: publicationBundleNow.toISOString()
} as const;

export async function createPublicationBundleFixture(
  options: { readonly withVisual?: boolean } = {}
): Promise<PublicationBundleFixture> {
  const store = await WorkspaceStore.open(
    await mkdtemp(join(tmpdir(), 'rph-publication-bundle-'))
  );
  const roadmaps = new ResearchRoadmapService(store);
  const roadmap = await roadmaps.create(roadmapInput);
  const backlog = new ResearchBacklogService(store, roadmaps);
  const topics: ResearchTopicRevisionV1[] = [];
  for (const id of ['a', 'b', 'c']) {
    topics.push(await backlog.add(topicInput(`topic_${id}`, 'evidence_ready')));
  }
  const query = await seedReviewedQuery(store);
  const contextBinding = {
    query_id: query.plan.query_id,
    plan_digest: query.plan.plan_digest,
    snapshot_digest: query.snapshot.snapshot_digest,
    review_digest: query.review.review_digest,
    selected_context_refs: query.review.selected_context_refs,
    query_status: query.snapshot.query_status,
    application_status: 'applied' as const,
    runtime_version: query.snapshot.runtime_version
  };
  const weeks = new WeeklyResearchCycleService(store, roadmaps, backlog);
  const cycle = await weeks.open({
    cycle_id: 'week_01_2026',
    roadmap_ref: {
      path: `program/roadmaps/${roadmap.roadmap_id}/revisions/${roadmap.revision}.json`,
      digest: roadmap.roadmap_digest
    },
    week_number: 1,
    month_id: 'month_01',
    context_binding: contextBinding,
    opened_by: 'human',
    opened_at: '2026-08-24T08:00:00.000Z'
  });
  const candidateSet = await weeks.submitCandidates({
    candidate_set_id: 'candidate_set_week_01_2026',
    cycle_id: cycle.cycle_id,
    roadmap_ref: cycle.roadmap_ref,
    context_binding: contextBinding,
    candidates: ['a', 'b'].map((id, index) => ({
      ...weeklyCandidateBrief(id),
      topic_ref: {
        path: `program/backlog/topics/topic_${id}/revisions/1.json`,
        digest: topics[index]!.revision_digest
      }
    })),
    generated_by_skill: 'article-publishing-copilot',
    created_at: '2026-08-24T09:00:00.000Z'
  });
  const selection = await weeks.select({
    cycle_id: cycle.cycle_id,
    candidate_set_digest: candidateSet.candidate_set_digest,
    selected_brief_id: 'brief_b',
    selection_source: 'human_explicit',
    selected_by: 'human',
    selected_at: '2026-08-24T10:00:00.000Z'
  });
  const root = `program/weeks/${cycle.cycle_id}`;

  const selected = candidateSet.candidates.find(
    (candidate) => candidate.brief_id === selection.selected_brief_id
  )!;
  const packageValue = validateContract<ResearchContentPackageV1_2>(
    'research-content-package',
    {
      ...researchPackage,
      schema_version: '1.2',
      status: 'frozen',
      thesis: { ...researchPackage.thesis, claim_status: 'observed' },
      claims: researchPackage.claims.map((claim) => ({
        ...claim,
        claim_status: claim.claim_status === 'planned' ? 'planned' : 'observed'
      })),
      memory_context: {
        schema_version: 'memory-context/v2',
        research_query_plan_digest: cycle.context_binding.plan_digest,
        research_context_snapshot_digest: cycle.context_binding.snapshot_digest,
        context_refs: cycle.context_binding.selected_context_refs,
        status: cycle.context_binding.application_status,
        reviewer: 'human',
        reviewed_at: '2026-08-24T09:30:00.000Z'
      },
      research_program_binding: {
        roadmap_ref: cycle.roadmap_ref,
        topic_ref: selected.topic_ref,
        candidate_set_ref: {
          path: `${root}/candidates.json`,
          digest: candidateSet.candidate_set_digest
        },
        selection_ref: {
          path: `${root}/selection.json`,
          digest: selection.selection_digest
        }
      }
    }
  );
  await store.writeNew(`${root}/package.json`, packageValue);

  const articleRoot = 'articles/runtime-boundary/article_bundle_1';
  const visualBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const visualAsset: VisualAssetRef | null = options.withVisual === true
    ? {
        asset_id: 'asset_bundle_cover',
        relative_path: 'assets/asset_bundle_cover.png',
        digest: sha256Bytes(visualBytes),
        mime_type: 'image/png',
        alt_text: 'A boundary separating Skill semantics from Runtime knowledge access.',
        claim_refs: ['claim_verified']
      }
    : null;
  const manifestBase = {
    schema_version: '1.0' as const,
    article_run_id: 'article_bundle_1',
    bindings: visualAsset === null ? [] : [{
      slot_id: 'slot_bundle_cover',
      asset: visualAsset,
      placement_ordinal: 1,
      width: 1200,
      height: 675,
      byte_size: visualBytes.byteLength,
      normalization_version: 'fixture/v1',
      provenance: {
        method: 'deterministic' as const,
        tool: 'vitest',
        source_digest: sha256('fixture-cover')
      },
      editable_source: null
    }]
  };
  const articleMarkdown = visualAsset === null
    ? '# Runtime boundary\n\nSkills own semantics. Runtime owns deterministic access.\n'
    : `# Runtime boundary\n\n![${visualAsset.alt_text}](${visualAsset.relative_path})\n\n` +
      'Skills own semantics. Runtime owns deterministic access.\n';
  const articleFiles: Record<string, string | object | Uint8Array> = {
    'article.md': articleMarkdown,
    'visual-manifest.json': {
      ...manifestBase,
      manifest_digest: sha256(manifestBase)
    },
    'draft-candidate.json': {
      schema_version: '1.0',
      run_id: 'article_bundle_1',
      title: 'The Skill and Runtime boundary',
      summary: 'A source-calibrated boundary for Agent knowledge access.',
      language: 'en',
      sections: [{
        section_id: 'boundary',
        heading: 'Boundary',
        markdown: 'Skills own semantics. Runtime owns deterministic access.',
        claim_refs: ['claim_verified'],
        source_refs: ['source_test']
      }],
      visual_slots: visualAsset === null ? [] : [{
        slot_id: 'slot_bundle_cover',
        placement: { kind: 'cover' },
        purpose: 'cover',
        required: true,
        brief: 'Show the Skill and Runtime boundary.',
        claim_refs: ['claim_verified']
      }],
      open_questions: []
    }
  };
  if (visualAsset !== null) articleFiles[visualAsset.relative_path] = visualBytes;
  const articleDigest = sha256(Object.entries(articleFiles)
    .map(([path, value]) => ({
      path,
      digest: value instanceof Uint8Array ? sha256Bytes(value) : sha256(value)
    }))
    .sort((left, right) => left.path.localeCompare(right.path)));
  const packageRef = {
    root: articleRoot,
    digest: articleDigest,
    artifacts: Object.keys(articleFiles).map((path) => `${articleRoot}/${path}`),
    warnings: []
  };
  await store.writeNewDirectory(articleRoot, {
    ...articleFiles,
    'package-ref.json': packageRef
  });
  const articlePlan = await new XArticleService(store, {
    runId: () => 'x_article_run_bundle_1',
    planId: () => 'x_article_plan_bundle_1',
    now: () => new Date('2026-08-24T11:00:00.000Z')
  }).plan(packageRef, '@Glen56121');

  await store.writeNew(`${root}/article.json`, packageRef);
  await store.replaceAtomic(`${root}/status.json`, createWeeklyCycleStatus({
    cycle_ref: { path: `${root}/cycle.json`, digest: cycle.cycle_digest },
    phase: 'article_finalized',
    candidate_set_ref: { path: `${root}/candidates.json`, digest: candidateSet.candidate_set_digest },
    selection_ref: { path: `${root}/selection.json`, digest: selection.selection_digest },
    cancellation_ref: null,
    package_ref: { path: `${root}/package.json`, digest: sha256(packageValue) },
    article_ref: { path: `${root}/article.json`, digest: sha256(packageRef) },
    bundle_ref: null,
    outcome_ref: null,
    blocked_reason: null,
    updated_at: '2026-08-24T11:05:00.000Z'
  }));

  return {
    store,
    roadmaps,
    backlog,
    weeks,
    planInput: {
      bundle_id: 'bundle_week_01_2026',
      cycle_id: cycle.cycle_id,
      cycle_ref: { path: `${root}/cycle.json`, digest: cycle.cycle_digest },
      selection_ref: { path: `${root}/selection.json`, digest: selection.selection_digest },
      research_content_package_ref: { path: `${root}/package.json`, digest: sha256(packageValue) },
      canonical_article_package: {
        root: packageRef.root,
        package_digest: packageRef.digest,
        package_ref: { path: `${packageRef.root}/package-ref.json`, digest: sha256(packageRef) }
      },
      article_plan: articlePlan,
      single_intent: {
        run_id: 'x_single_run_bundle_1',
        target_account: '@Glen56121',
        language: 'en',
        content_type: 'anchor',
        text_template: 'Read the complete argument: {{X_ARTICLE_URL}}',
        claim_refs: ['claim_verified'],
        visual_asset: visualAsset,
        article_package: { root: packageRef.root, digest: packageRef.digest }
      },
      planned_at: '2026-08-24T11:10:00.000Z'
    }
  };
}

export async function createApprovedPublicationBundleFixture(
  options: { readonly withVisual?: boolean } = {}
): Promise<ApprovedPublicationBundleFixture> {
  const fixture = await createPublicationBundleFixture(options);
  const service = new PublicationBundleService(fixture.store, fixture.weeks, {
    now: () => publicationBundleNow,
    approvalId: () => 'bundle_approval_fixture_1'
  });
  const plan = await service.plan(fixture.planInput);
  await service.approve({
    bundle_id: plan.bundle_id,
    confirmed_bundle_digest: plan.bundle_digest,
    approved_by: 'human:Glen56121'
  });
  const authorization = await service.articleAuthorization(plan.bundle_id);
  return { ...fixture, service, plan, authorization };
}

export async function startBundleArticleExecution(
  fixture: ApprovedPublicationBundleFixture,
  executionId = 'article_execution_bundle_1'
) {
  const adapter = new XArticleBrowserAdapter(
    fixture.store,
    new XArticleWeb2026_08Contract(),
    {
      executionId: () => executionId,
      now: () => new Date('2026-08-24T12:01:00.000Z')
    }
  );
  const snapshot = await adapter.start(
    fixture.plan.article_plan,
    fixture.authorization.child_approval,
    articleBrowserCapabilities
  );
  return { adapter, snapshot };
}

export async function installArticleReceipt(
  fixture: ApprovedPublicationBundleFixture,
  executionId: string,
  input: {
    readonly status?: 'published' | 'published_media_unverified' | 'verification_conflict';
    readonly canonicalUrl?: string;
  } = {}
) {
  const status = input.status ?? 'published';
  const kind = status === 'published'
    ? 'full_match'
    : status === 'published_media_unverified'
      ? 'media_unverified'
      : 'conflict';
  const canonicalUrl = input.canonicalUrl ??
    'https://x.com/Glen56121/article/2091000000000000000';
  const receipt = createXArticleReceipt({
    receiptId: `receipt_${executionId}`,
    executionId,
    plan: fixture.plan.article_plan,
    status,
    draftId: '2090731994279755776',
    editorRevision: `sha256:${'b'.repeat(64)}`,
    previewRevision: `sha256:${'c'.repeat(64)}`,
    publicVerification: {
      kind,
      article_id: '2091000000000000000',
      canonical_url: canonicalUrl,
      author_match: status !== 'verification_conflict',
      content_match: status !== 'verification_conflict',
      links_match: true,
      media_match: status === 'published_media_unverified' ? null : status === 'published',
      verified_at: '2026-08-24T12:02:00.000Z'
    },
    issuedAt: '2026-08-24T12:02:01.000Z',
    supersedesReceiptId: null
  });
  const path = `receipts/${receipt.receipt_id}.json`;
  await fixture.store.writeNew(path, receipt);
  const contextPath = `runs/${executionId}/x-article/browser/adapter-context.json`;
  const context = await fixture.store.readJson<Record<string, unknown>>(contextPath);
  await fixture.store.replaceAtomic(contextPath, {
    ...context,
    snapshot: {
      ...(context.snapshot as Record<string, unknown>),
      state: status === 'verification_conflict' ? 'verification_conflict' : 'finalized',
      publish_command_count: 1,
      latest_receipt_path: path,
      updated_at: '2026-08-24T12:02:01.000Z'
    }
  });
  const artifact = await fixture.store.readContainedArtifact(path);
  return { receipt, path, digest: artifact.digest };
}

export async function prepareBundleThroughSingleAuthorization(
  options: { readonly withVisual?: boolean } = {}
): Promise<
SingleAuthorizedPublicationBundleFixture
> {
  const fixture = await createApprovedPublicationBundleFixture(options);
  const { snapshot } = await startBundleArticleExecution(fixture);
  await fixture.service.bindArticleExecution({
    bundle_id: fixture.plan.bundle_id,
    execution_id: snapshot.execution_id,
    bound_at: '2026-08-24T12:01:01.000Z'
  });
  const receipt = await installArticleReceipt(fixture, snapshot.execution_id);
  await fixture.service.attachArticleReceipt({
    bundle_id: fixture.plan.bundle_id,
    receipt_path: receipt.path,
    receipt_digest: receipt.digest
  });
  const materialized = await fixture.service.materializeSingle(fixture.plan.bundle_id);
  const singleAuthorization = await fixture.service.singleAuthorization(fixture.plan.bundle_id);
  return { ...fixture, materialized, singleAuthorization };
}

export const singleBrowserCapabilities: BrowserCapabilityManifest = {
  executor: 'codex-chrome',
  executor_version: '26.814.41407',
  browser_family: 'chrome',
  capabilities: [
    'observe_page', 'navigate', 'click', 'set_text', 'press_key', 'wait',
    'file_upload', 'attachment_alt_text', 'upload_attachment', 'set_attachment_alt_text'
  ],
  observed_at: '2026-08-24T12:03:00.000Z'
};

export async function startBundleSingleExecution(
  fixture: SingleAuthorizedPublicationBundleFixture,
  executionId = 'single_execution_bundle_1'
) {
  let event = 0;
  let command = 0;
  const now = () => new Date('2026-08-24T12:03:00.000Z');
  const executions = new ExecutionStore(fixture.store, now, () => `single_event_${++event}`);
  const broker = new CommandBroker(
    fixture.store,
    executions,
    now,
    () => `single_command_${++command}`
  );
  const adapter = new BrowserAdapter(
    fixture.store,
    executions,
    broker,
    new XWeb202608Contract(),
    now,
    () => 'single_attempt_bundle_1'
  );
  const snapshot = await adapter.start({
    execution_id: executionId,
    plan: fixture.materialized.child_plan,
    approval: fixture.singleAuthorization.child_approval,
    capability_manifest: singleBrowserCapabilities
  });
  return { adapter, snapshot };
}

export async function installSingleReceipt(
  fixture: SingleAuthorizedPublicationBundleFixture,
  executionId: string,
  status: 'finalized' | 'outcome_unknown' | 'verification_conflict' |
    'partial' | 'failed_after_submit' | 'published_media_unverified' = 'finalized'
) {
  const plan = fixture.materialized.child_plan;
  const approval = fixture.singleAuthorization.child_approval;
  const postId = '2092000000000000000';
  const publicUrl = `https://x.com/Glen56121/status/${postId}`;
  const successful = status === 'finalized' || status === 'published_media_unverified';
  const common = {
    supersedes_receipt_id: null,
    execution_id: executionId,
    attempt_id: 'single_attempt_bundle_1',
    run_id: plan.run_id,
    platform: 'x',
    adapter: 'browser',
    status,
    target_account: plan.intent.target_account,
    observed_account: successful ? plan.intent.target_account : null,
    approval: {
      plan_digest: plan.plan_digest,
      approval_digest: approval.approval_digest,
      approved_at: approval.approved_at,
      expires_at: approval.expires_at
    },
    submission: {
      armed_at: '2026-08-24T12:03:01.000Z',
      attempted_at: '2026-08-24T12:03:02.000Z',
      submit_command_count: 1,
      page_contract_version: '2026-08',
      executor_version: '26.814.41407'
    },
    public_result: successful ? {
      root_url: publicUrl,
      published_at: '2026-08-24T12:03:03.000Z',
      ordered_post_ids: [postId],
      posts: [{
        ordinal: 1,
        post_id: postId,
        canonical_url: publicUrl,
        observed_digest: plan.items[0]!.digest,
        reply_to_id: null
      }],
      matched_ordinals: [1],
      missing_ordinals: [],
      unexpected_post_ids: []
    } : null,
    verification: {
      source: 'browser_public_page',
      strength: status === 'finalized' ? 'public_browser_verified' as const : 'unverified' as const,
      verified_at: successful ? '2026-08-24T12:03:04.000Z' : null,
      account_match: successful,
      count_match: successful,
      content_match: successful,
      order_match: successful,
      reply_chain_match: successful,
      links_match: successful,
      unique_post_ids: successful,
      evidence_digest: sha256({ status, executionId })
    }
  } as const;
  const receipt = plan.schema_version === '2.0' && approval.schema_version === '2.0'
    ? createPublicationReceiptV2(
        { ...common, plan, status: status === 'published_media_unverified' ? 'published_unverified' : status },
        () => `single_receipt_${status}`,
        () => new Date('2026-08-24T12:03:05.000Z')
      )
    : plan.schema_version === '2.1' && approval.schema_version === '2.1'
      ? createPublicationReceiptV2_1({
          ...common,
          plan,
          status,
          plan_digest: plan.plan_digest,
          media_evidence: {
            asset_id: plan.items[0]!.attachments[0]!.asset_id,
            source_digest: plan.items[0]!.attachments[0]!.digest,
            source_asset_verified: true,
            composer_attachment_verified: true,
            public_media_verified: status === 'finalized',
            target_ordinal: 1,
            alt_text_verified: status === 'finalized' ? true : null,
            public_media_url: status === 'finalized'
              ? 'https://pbs.twimg.com/media/bundle'
              : null,
            limitations: status === 'published_media_unverified'
              ? ['public media was not verified']
              : []
          }
        }, () => `single_receipt_${status}`, () => new Date('2026-08-24T12:03:05.000Z'))
      : (() => { throw new Error('Single Plan and Approval versions differ'); })();
  const path = `receipts/${receipt.receipt_id}.json`;
  await fixture.store.writeNew(path, receipt);
  const prefix = `runs/${plan.run_id}/x/browser/${executionId}`;
  const contextPath = `${prefix}/execution-context.json`;
  const context = await fixture.store.readJson<Record<string, unknown>>(contextPath);
  await fixture.store.replaceAtomic(contextPath, {
    ...context,
    submit_command_count: 1,
    attempt_id: 'single_attempt_bundle_1',
    latest_receipt_id: receipt.receipt_id,
    latest_receipt_path: path
  });
  const statePath = `${prefix}/state.json`;
  const snapshot = await fixture.store.readJson<Record<string, unknown>>(statePath);
  await fixture.store.replaceAtomic(statePath, {
    ...snapshot,
    state: status === 'published_media_unverified' ? 'published_unverified' : status,
    attempt_id: 'single_attempt_bundle_1',
    submit_command_count: 1,
    updated_at: receipt.created_at
  });
  const artifact = await fixture.store.readContainedArtifact(path);
  return { receipt, path, digest: artifact.digest, publicUrl };
}
