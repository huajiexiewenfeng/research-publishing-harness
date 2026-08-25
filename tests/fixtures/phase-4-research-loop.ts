import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
import type { PublicationBundleReceiptV1 } from '../../harnesses/research-publishing/core/publication-bundle-types.js';
import type { ResearchBacklogService } from '../../harnesses/research-publishing/core/research-backlog-service.js';
import type { ResearchRoadmapService } from '../../harnesses/research-publishing/core/research-roadmap-service.js';
import type { WeeklyResearchCycleService } from '../../harnesses/research-publishing/core/weekly-research-cycle-service.js';
import type { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import type { PublicationBundleService } from '../../harnesses/research-publishing/core/publication-bundle-service.js';
import {
  installSingleReceipt,
  prepareBundleThroughSingleAuthorization,
  startBundleSingleExecution
} from './publication-bundle.js';

export interface CompletedPhase4BundleFixture {
  readonly store: WorkspaceStore;
  readonly roadmaps: ResearchRoadmapService;
  readonly backlog: ResearchBacklogService;
  readonly weeks: WeeklyResearchCycleService;
  readonly bundles: PublicationBundleService;
  readonly cycle_id: string;
  readonly topic_id: string;
  readonly bundle_id: string;
  readonly bundle_receipt: PublicationBundleReceiptV1;
  readonly workspace_identity_digest: `sha256:${string}`;
}

export async function createCompletedPhase4BundleFixture(): Promise<CompletedPhase4BundleFixture> {
  const fixture = await prepareBundleThroughSingleAuthorization();
  const { snapshot } = await startBundleSingleExecution(fixture);
  await fixture.service.bindSingleExecution({
    bundle_id: fixture.plan.bundle_id,
    execution_id: snapshot.execution_id,
    bound_at: '2026-08-24T12:03:00.000Z'
  });
  const single = await installSingleReceipt(fixture, snapshot.execution_id);
  const receipt = await fixture.service.attachSingleReceipt({
    bundle_id: fixture.plan.bundle_id,
    receipt_path: single.path,
    receipt_digest: single.digest
  });
  if (receipt.schema_version !== 'publication-bundle-receipt/v1') {
    throw new Error('Phase 4 fixture requires a completed Publication Bundle Receipt');
  }
  return {
    store: fixture.store,
    roadmaps: fixture.roadmaps,
    backlog: fixture.backlog,
    weeks: fixture.weeks,
    bundles: fixture.service,
    cycle_id: fixture.plan.cycle_id,
    topic_id: 'topic_b',
    bundle_id: fixture.plan.bundle_id,
    bundle_receipt: receipt,
    workspace_identity_digest: sha256({
      profile: 'research-publishing',
      account: fixture.plan.article_plan.intent.target_account
    })
  };
}
