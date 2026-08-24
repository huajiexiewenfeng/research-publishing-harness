import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { XArticleService } from '../../harnesses/research-publishing/branches/x-article-harness/x-article-service.js';
import { XArticleBrowserAdapter } from '../../harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.js';
import { createXArticleReceipt } from '../../harnesses/research-publishing/adapters/x/article-browser/article-receipt.js';
import { XArticleWeb2026_08Contract } from '../../harnesses/research-publishing/adapters/x/article-browser/contracts/x-article-web-2026-08.js';
import { sha256, sha256Bytes } from '../../harnesses/research-publishing/core/digest.js';
import { PublicationBundleService } from '../../harnesses/research-publishing/core/publication-bundle-service.js';
import {
  createWeeklyCandidateSet,
  createWeeklyCycleStatus,
  createWeeklyResearchCycle,
  createWeeklyTopicSelection
} from '../../harnesses/research-publishing/core/research-program-contracts.js';
import type { PlanPublicationBundleInput } from '../../harnesses/research-publishing/core/publication-bundle-types.js';
import type {
  ResearchBacklogPort,
  ResearchRoadmapPort
} from '../../harnesses/research-publishing/core/research-program-types.js';
import { WeeklyResearchCycleService } from '../../harnesses/research-publishing/core/weekly-research-cycle-service.js';
import type {
  ResearchContentPackageV1_2,
  VisualAssetRef
} from '../../harnesses/research-publishing/core/types.js';
import { validateContract } from '../../harnesses/research-publishing/core/schema-validator.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { researchPackage } from './research-package.js';
import { weeklyCandidateSetInput, weeklyCycleInput } from './research-program.js';

export interface PublicationBundleFixture {
  readonly store: WorkspaceStore;
  readonly weeks: WeeklyResearchCycleService;
  readonly planInput: PlanPublicationBundleInput;
}

export interface ApprovedPublicationBundleFixture extends PublicationBundleFixture {
  readonly service: PublicationBundleService;
  readonly plan: Awaited<ReturnType<PublicationBundleService['plan']>>;
  readonly authorization: Awaited<ReturnType<PublicationBundleService['articleAuthorization']>>;
}

export const publicationBundleNow = new Date('2026-08-24T12:00:00.000Z');

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
  const cycle = createWeeklyResearchCycle(weeklyCycleInput);
  const candidateSet = createWeeklyCandidateSet(weeklyCandidateSetInput);
  const selection = createWeeklyTopicSelection(candidateSet, {
    cycle_id: cycle.cycle_id,
    candidate_set_digest: candidateSet.candidate_set_digest,
    selected_brief_id: 'brief_b',
    selection_source: 'human_explicit',
    selected_by: 'human',
    selected_at: '2026-08-24T10:00:00.000Z'
  });
  const root = `program/weeks/${cycle.cycle_id}`;
  await store.writeNew(`${root}/cycle.json`, cycle);
  await store.writeNew(`${root}/candidates.json`, candidateSet);
  await store.writeNew(`${root}/selection.json`, selection);

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
  await store.writeNew(`${root}/status.json`, createWeeklyCycleStatus({
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

  const weeks = new WeeklyResearchCycleService(
    store,
    {} as ResearchRoadmapPort,
    {} as ResearchBacklogPort
  );
  return {
    store,
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
