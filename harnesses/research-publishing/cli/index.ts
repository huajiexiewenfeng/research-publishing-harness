#!/usr/bin/env node

import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { ManualAdapter, type ManualPublicResult, type PublishReceipt } from '../adapters/x/manual/manual-adapter.js';
import { createLLMWikiRuntimeAdapter, type LLMWikiRuntimeAdapter } from '../adapters/llm-wiki/runtime-adapter.js';
import { BrowserAdapter } from '../adapters/x/browser/browser-adapter.js';
import type { BrowserActionResultInput, BrowserCapabilityManifest } from '../adapters/x/browser/browser-protocol.js';
import { CommandBroker } from '../adapters/x/browser/command-broker.js';
import { XWeb202608Contract } from '../adapters/x/browser/contracts/x-web-2026-08.js';
import {
  XArticleBrowserAdapter,
  type XArticleBrowserCapabilityManifestV1,
  type XArticleBrowserReportInput
} from '../adapters/x/article-browser/article-browser-adapter.js';
import type { XArticleBrowserCommandV1 } from '../adapters/x/article-browser/article-command-broker.js';
import { XArticleWeb2026_08Contract } from '../adapters/x/article-browser/contracts/x-article-web-2026-08.js';
import { ArticleService, type ArticleBrief, type ArticleDraft, type VisualReviewInput, type XHandoff } from '../branches/article-harness/article-service.js';
import { XArticleService } from '../branches/x-article-harness/x-article-service.js';
import { XService, type PublicationPlan, type XBrief, type XDraft } from '../branches/x-harness/x-service.js';
import { approvePublication, type Approval } from '../core/approval.js';
import { approvePublicationV2, type ApprovalV2 } from '../core/approval-v2.js';
import { approvePublicationV2_1, type ApprovalV2_1 } from '../core/approval-v2-1.js';
import {
  approveXArticlePublication,
  type XArticleApprovalV1
} from '../core/x-article-approval.js';
import type { XArticlePublicationPlanV1 } from '../core/x-article-publication-plan.js';
import { pruneBrowserArtifacts } from '../core/artifact-retention.js';
import { HarnessError, type ErrorCode } from '../core/errors.js';
import { sha256Bytes } from '../core/digest.js';
import { MemoryFeedbackService, type CaptureFeedbackInput } from '../core/memory-feedback-service.js';
import { MemoryIngestService, type FeedbackInsightInput, type PublicationCheckpointInput } from '../core/memory-ingest-service.js';
import { MemoryInsightService, type ProposeInsightInput } from '../core/memory-insight-service.js';
import { MemoryQueryService } from '../core/memory-query-service.js';
import type { MemoryIngestApprovalV1, RuntimeContextResult } from '../core/memory-types.js';
import { MemoryPromotionService } from '../core/memory-promotion-service.js';
import { MonthlyEditorialReviewService } from '../core/monthly-editorial-review-service.js';
import { ProgressiveResearchQueryService } from '../core/progressive-research-query-service.js';
import { ResearchBacklogService } from '../core/research-backlog-service.js';
import { ResearchIndexMaintenanceService } from '../core/research-index-maintenance-service.js';
import { ResearchProgramStatusService } from '../core/research-program-status-service.js';
import type {
  AddResearchTopicInput,
  CancelWeeklyCycleInput,
  CreateMonthlyEditorialReviewInput,
  CreateResearchRoadmapInput,
  OpenWeeklyCycleInput,
  ReviseResearchRoadmapInput,
  ReviseResearchTopicInput,
  SelectWeeklyTopicInput,
  SubmitWeeklyCandidatesInput
} from '../core/research-program-types.js';
import { ResearchRoadmapService } from '../core/research-roadmap-service.js';
import { WeeklyResearchCycleService } from '../core/weekly-research-cycle-service.js';
import { WeeklyPackageCompiler } from '../core/weekly-package-compiler.js';
import { ResearchTerminalHooks } from '../core/research-terminal-hooks.js';
import {
  ResearchImportService,
  type ResearchImportManifestV1
} from '../core/research-import-service.js';
import { SemanticDeltaService } from '../core/semantic-delta-service.js';
import type { PlanResearchQueryInput } from '../core/research-query-types.js';
import type {
  MemoryPromotionApprovalV2,
  ReviewDeltaInput,
  SemanticMemoryDeltaInput
} from '../core/research-memory-types.js';
import {
  ResearchEvidenceService,
  type CaptureResearchEvidenceInput
} from '../core/research-evidence-service.js';
import {
  ResearchIncrementService,
  type AssembleResearchIncrementInput
} from '../core/research-increment-service.js';
import { PackageService } from '../core/package-service.js';
import { PublicationBundleService } from '../core/publication-bundle-service.js';
import type {
  ApprovePublicationBundleInput,
  AttachArticleReceiptInput,
  AttachSingleReceiptInput,
  BindArticleExecutionInput,
  BindSingleExecutionInput,
  PlanPublicationBundleInput
} from '../core/publication-bundle-types.js';
import { ExecutionStore } from '../core/execution-store.js';
import type { PublicationPlanV2 } from '../core/publication-plan-v2.js';
import type { PublicationPlanV2_1 } from '../core/publication-plan-v2-1.js';
import type { AttachVisualInput } from '../core/visual-assets.js';
import { assertContractsAvailable } from '../core/schema-validator.js';
import type {
  Candidate,
  CompileWeeklyPackageInput,
  ResearchContentPackage
} from '../core/types.js';
import { WorkspaceStore } from '../core/workspace-store.js';

interface CliOptions {
  readonly workspace: string;
  readonly input?: string;
  readonly runId?: string;
  readonly executionId?: string;
  readonly commandId?: string;
  readonly adapter?: 'manual' | 'browser';
  readonly runtimeExecutable?: string;
  readonly runtimeLauncher?: 'console-script' | 'python-module';
  readonly output: string;
}

interface CliResult {
  readonly ok: boolean;
  readonly operation: string;
  readonly artifact?: unknown;
  readonly state?: string;
  readonly findings?: unknown;
  readonly error?: { readonly code: string; readonly message: string };
}

function parseArguments(argv: readonly string[]): { positional: string[]; options: CliOptions } {
  const positional: string[] = [];
  const values: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new HarnessError('CONTRACT_INVALID', `option ${token} requires a value`);
    }
    values[token.slice(2)] = value;
    index += 1;
  }
  const workspace = values['workspace'];
  if (workspace === undefined || workspace.trim().length === 0) {
    throw new HarnessError('CONTRACT_INVALID', '--workspace is required');
  }
  const adapter = values['adapter'];
  if (adapter !== undefined && adapter !== 'manual' && adapter !== 'browser') {
    throw new HarnessError('CONTRACT_INVALID', '--adapter must be manual or browser');
  }
  const runtimeLauncher = values['runtime-launcher'];
  if (
    runtimeLauncher !== undefined &&
    runtimeLauncher !== 'console-script' && runtimeLauncher !== 'python-module'
  ) {
    throw new HarnessError(
      'MEMORY_RUNTIME_INVALID_CONFIG',
      '--runtime-launcher must be console-script or python-module'
    );
  }
  return {
    positional,
    options: {
      workspace: resolve(workspace),
      ...(values['input'] === undefined ? {} : { input: resolve(values['input']) }),
      ...(values['run-id'] === undefined ? {} : { runId: values['run-id'] }),
      ...(values['execution-id'] === undefined ? {} : { executionId: values['execution-id'] }),
      ...(values['command-id'] === undefined ? {} : { commandId: values['command-id'] }),
      ...(adapter === undefined ? {} : { adapter }),
      ...(values['runtime-executable'] === undefined
        ? {}
        : { runtimeExecutable: values['runtime-executable'] }),
      ...(runtimeLauncher === undefined ? {} : { runtimeLauncher }),
      output: values['output'] ?? 'json'
    }
  };
}

interface PackagedMemoryAssets {
  readonly profilePath: string;
  readonly mappingPath: string;
  readonly harnessScpPath: string;
  readonly articleScpPath: string;
  readonly xScpPath: string;
}

async function packagedMemoryAssets(): Promise<PackagedMemoryAssets> {
  const candidates = [
    resolve(import.meta.dirname, '../../..'),
    resolve(import.meta.dirname, '../../../..')
  ];
  let root: string | null = null;
  for (const candidate of candidates) {
    try {
      await access(resolve(candidate, 'registry/harnesses.json'));
      root = candidate;
      break;
    } catch {
      // Continue to the installed-package layout.
    }
  }
  if (root === null) {
    throw new HarnessError('MEMORY_RUNTIME_INVALID_CONFIG', 'packaged Memory Domain assets are unavailable');
  }
  return {
    profilePath: resolve(root, 'harnesses/research-publishing/memory/llm-wiki-profile.yml'),
    mappingPath: resolve(root, 'harnesses/research-publishing/memory/ingest-mapping.yml'),
    harnessScpPath: resolve(root, 'harnesses/research-publishing/memory/scp.yml'),
    articleScpPath: resolve(root, 'skills/article-publishing-copilot/scp.yml'),
    xScpPath: resolve(root, 'skills/x-publishing-copilot/scp.yml')
  };
}

async function configuredMemoryRuntime(
  options: CliOptions,
  assets: PackagedMemoryAssets
): Promise<LLMWikiRuntimeAdapter | null> {
  if (options.runtimeExecutable === undefined && options.runtimeLauncher === undefined) return null;
  if (options.runtimeExecutable === undefined || options.runtimeLauncher === undefined) {
    throw new HarnessError(
      'MEMORY_RUNTIME_INVALID_CONFIG',
      '--runtime-executable and --runtime-launcher must be supplied together'
    );
  }
  return createLLMWikiRuntimeAdapter({
    launcher: options.runtimeLauncher,
    executable: options.runtimeExecutable,
    expected_version: '0.2.0',
    workspace: options.workspace,
    profile_path: assets.profilePath,
    mapping_path: assets.mappingPath,
    scp_paths: [assets.harnessScpPath, assets.articleScpPath, assets.xScpPath]
  });
}

const unavailableQueryRuntime = {
  async query(): Promise<RuntimeContextResult> {
    return {
      status: 'unavailable', runtime_version: null, items: [],
      excluded_count: 0, truncated_count: 0
    };
  }
};

const unavailableIngestRuntime = {
  async version(): Promise<'0.2.0'> {
    throw new HarnessError('MEMORY_RUNTIME_UNAVAILABLE', 'Runtime is not configured');
  },
  async validateMapping(): Promise<never> {
    throw new HarnessError('MEMORY_RUNTIME_UNAVAILABLE', 'Runtime is not configured');
  },
  async copySource(): Promise<never> {
    throw new HarnessError('MEMORY_RUNTIME_UNAVAILABLE', 'Runtime is not configured');
  },
  async writeRecord(): Promise<never> {
    throw new HarnessError('MEMORY_RUNTIME_UNAVAILABLE', 'Runtime is not configured');
  },
  async registerArtifact(): Promise<never> {
    throw new HarnessError('MEMORY_RUNTIME_UNAVAILABLE', 'Runtime is not configured');
  },
  async appendLog(): Promise<never> {
    throw new HarnessError('MEMORY_RUNTIME_UNAVAILABLE', 'Runtime is not configured');
  },
  async findCatalog(): Promise<never> {
    throw new HarnessError('MEMORY_RUNTIME_UNAVAILABLE', 'Runtime is not configured');
  }
};

const unavailableProgressiveRuntime = {
  async findRecords(): Promise<never> {
    throw new HarnessError('MEMORY_RUNTIME_UNAVAILABLE', 'Runtime is not configured');
  },
  async loadPaths(): Promise<never> {
    throw new HarnessError('MEMORY_RUNTIME_UNAVAILABLE', 'Runtime is not configured');
  }
};

function requireMemoryRuntime(runtime: LLMWikiRuntimeAdapter | null): LLMWikiRuntimeAdapter {
  if (runtime === null) {
    throw new HarnessError(
      'MEMORY_RUNTIME_INVALID_CONFIG',
      'Memory mutation requires explicit --runtime-executable and --runtime-launcher'
    );
  }
  return runtime;
}

function requiredExecutionId(options: CliOptions): string {
  if (options.executionId === undefined || options.executionId.length === 0) {
    throw new HarnessError('CONTRACT_INVALID', '--execution-id is required');
  }
  return options.executionId;
}

function requiredCommandId(options: CliOptions): string {
  if (options.commandId === undefined || options.commandId.length === 0) {
    throw new HarnessError('CONTRACT_INVALID', '--command-id is required');
  }
  return options.commandId;
}

async function readInput<T>(options: CliOptions): Promise<T> {
  if (options.input === undefined) {
    throw new HarnessError('CONTRACT_INVALID', '--input <json> is required for this operation');
  }
  try {
    return JSON.parse(await readFile(options.input, 'utf8')) as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new HarnessError('CONTRACT_INVALID', `input is not valid JSON: ${error.message}`);
    }
    throw error;
  }
}

function requiredRunId(options: CliOptions, input?: { readonly run_id?: string }): string {
  const runId = options.runId ?? input?.run_id;
  if (runId === undefined || runId.length === 0) {
    throw new HarnessError('CONTRACT_INVALID', '--run-id or input.run_id is required');
  }
  return runId;
}

async function execute(argv: readonly string[]): Promise<CliResult> {
  const { positional, options } = parseArguments(argv);
  if (options.output !== 'json') {
    throw new HarnessError('CONTRACT_INVALID', 'V1 supports --output json only');
  }
  const operation = positional.join(' ');
  const store = await WorkspaceStore.open(options.workspace);
  const packages = new PackageService(store);

  if (operation === 'doctor') {
    return {
      ok: true,
      operation,
      artifact: {
        node: process.versions.node,
        workspace: store.root,
        contracts: assertContractsAvailable(),
        network_required: false
      },
      state: 'ready'
    };
  }

  if (operation === 'candidate capture') {
    const artifact = await packages.captureCandidate(await readInput<Candidate>(options));
    return { ok: true, operation, artifact, state: artifact.status };
  }
  if (operation === 'candidate qualify') {
    const input = await readInput<{ candidate_id: string; novelty_hint?: string }>(options);
    const artifact = await packages.qualifyCandidate(input.candidate_id, {
      ...(input.novelty_hint === undefined ? {} : { novelty_hint: input.novelty_hint })
    });
    return { ok: true, operation, artifact, state: artifact.status };
  }
  if (operation === 'package build') {
    const input = await readInput<{ candidate: Candidate; package: ResearchContentPackage }>(options);
    const artifact = await packages.buildPackage(input.candidate, input.package);
    return { ok: true, operation, artifact, state: artifact.status };
  }
  if (operation === 'package review') {
    const input = await readInput<{ package: ResearchContentPackage }>(options);
    const artifact = await packages.reviewPackage(input.package);
    return { ok: true, operation, artifact, state: artifact.package.status, findings: artifact.report.findings };
  }
  if (operation === 'package freeze') {
    const input = await readInput<{ package: ResearchContentPackage }>(options);
    const artifact = await packages.freezePackage(input.package);
    return { ok: true, operation, artifact, state: artifact.package.status };
  }

  if (operation.startsWith('publication bundle ')) {
    const roadmaps = new ResearchRoadmapService(store);
    const backlog = new ResearchBacklogService(store, roadmaps);
    const weeks = new WeeklyResearchCycleService(store, roadmaps, backlog);
    const bundles = new PublicationBundleService(store, weeks);
    if (operation === 'publication bundle plan') {
      const artifact = await bundles.plan(await readInput<PlanPublicationBundleInput>(options));
      return { ok: true, operation, artifact, state: 'planned' };
    }
    if (operation === 'publication bundle audit') {
      const { bundle_id } = await readInput<{ bundle_id: string }>(options);
      return { ok: true, operation, artifact: await bundles.audit(bundle_id), state: 'planned' };
    }
    if (operation === 'publication bundle approve') {
      const artifact = await bundles.approve(await readInput<ApprovePublicationBundleInput>(options));
      return { ok: true, operation, artifact, state: 'approved' };
    }
    if (operation === 'publication bundle article-authorization') {
      const { bundle_id } = await readInput<{ bundle_id: string }>(options);
      const artifact = await bundles.articleAuthorization(bundle_id);
      return { ok: true, operation, artifact, state: 'article_authorized' };
    }
    if (operation === 'publication bundle bind-article-execution') {
      const artifact = await bundles.bindArticleExecution(
        await readInput<BindArticleExecutionInput>(options)
      );
      return { ok: true, operation, artifact, state: 'article_in_progress' };
    }
    if (operation === 'publication bundle attach-article-receipt') {
      const artifact = await bundles.attachArticleReceipt(
        await readInput<AttachArticleReceiptInput>(options)
      );
      return { ok: true, operation, artifact, state: artifact.phase };
    }
    if (operation === 'publication bundle materialize-single') {
      const { bundle_id } = await readInput<{ bundle_id: string }>(options);
      const artifact = await bundles.materializeSingle(bundle_id);
      return { ok: true, operation, artifact, state: 'single_materialized' };
    }
    if (operation === 'publication bundle single-authorization') {
      const { bundle_id } = await readInput<{ bundle_id: string }>(options);
      const artifact = await bundles.singleAuthorization(bundle_id);
      return { ok: true, operation, artifact, state: 'single_authorized' };
    }
    if (operation === 'publication bundle bind-single-execution') {
      const artifact = await bundles.bindSingleExecution(
        await readInput<BindSingleExecutionInput>(options)
      );
      return { ok: true, operation, artifact, state: 'single_in_progress' };
    }
    if (operation === 'publication bundle attach-single-receipt') {
      const artifact = await bundles.attachSingleReceipt(
        await readInput<AttachSingleReceiptInput>(options)
      );
      return {
        ok: true,
        operation,
        artifact,
        state: 'phase' in artifact ? artifact.phase : artifact.status
      };
    }
    if (operation === 'publication bundle status') {
      const { bundle_id } = await readInput<{ bundle_id: string }>(options);
      const artifact = await bundles.status(bundle_id);
      return { ok: true, operation, artifact, state: artifact.phase };
    }
    throw new HarnessError('CONTRACT_INVALID', `unknown operation: ${operation}`);
  }

  if (operation.startsWith('program ')) {
    const roadmaps = new ResearchRoadmapService(store);
    const backlog = new ResearchBacklogService(store, roadmaps);
    const reviews = new MonthlyEditorialReviewService(store);
    const programStatus = new ResearchProgramStatusService(store, roadmaps, backlog, reviews);
    const weeks = new WeeklyResearchCycleService(store, roadmaps, backlog);
    const compiler = new WeeklyPackageCompiler(store);

    if (operation === 'program roadmap create') {
      const artifact = await roadmaps.create(await readInput<CreateResearchRoadmapInput>(options));
      return { ok: true, operation, artifact, state: 'created' };
    }
    if (operation === 'program roadmap revise') {
      const artifact = await roadmaps.revise(await readInput<ReviseResearchRoadmapInput>(options));
      return { ok: true, operation, artifact, state: 'revised' };
    }
    if (operation === 'program roadmap status') {
      const input = await readInput<{ roadmap_id: string }>(options);
      const artifact = await roadmaps.current(input.roadmap_id);
      return { ok: true, operation, artifact, state: 'current' };
    }
    if (operation === 'program backlog add') {
      const artifact = await backlog.add(await readInput<AddResearchTopicInput>(options));
      return { ok: true, operation, artifact, state: artifact.availability };
    }
    if (operation === 'program backlog revise') {
      const artifact = await backlog.revise(await readInput<ReviseResearchTopicInput>(options));
      return { ok: true, operation, artifact, state: artifact.availability };
    }
    if (operation === 'program backlog status') {
      const input = await readInput<{ roadmap_id: string }>(options);
      const artifact = await backlog.catalog(input.roadmap_id);
      return { ok: true, operation, artifact, state: 'current' };
    }
    if (operation === 'program backlog rebuild') {
      const input = await readInput<{ roadmap_id: string }>(options);
      const artifact = await backlog.rebuildCatalog(input.roadmap_id);
      return { ok: true, operation, artifact, state: 'rebuilt' };
    }
    if (operation === 'program month review') {
      const artifact = await reviews.create(
        await readInput<CreateMonthlyEditorialReviewInput>(options)
      );
      return { ok: true, operation, artifact, state: 'reviewed' };
    }
    if (operation === 'program month status') {
      const input = await readInput<{ month_id: string }>(options);
      const artifact = await reviews.status(input.month_id);
      return { ok: true, operation, artifact, state: artifact === null ? 'not_started' : 'reviewed' };
    }
    if (operation === 'program status') {
      const input = await readInput<{ roadmap_id: string }>(options);
      const artifact = await programStatus.status(input.roadmap_id);
      return { ok: true, operation, artifact, state: artifact.next_action };
    }
    if (operation === 'program week open') {
      const artifact = await weeks.open(await readInput<OpenWeeklyCycleInput>(options));
      return { ok: true, operation, artifact, state: 'opened' };
    }
    if (operation === 'program week submit-candidates') {
      const artifact = await weeks.submitCandidates(
        await readInput<SubmitWeeklyCandidatesInput>(options)
      );
      return { ok: true, operation, artifact, state: 'candidates_submitted' };
    }
    if (operation === 'program week select') {
      const artifact = await weeks.select(await readInput<SelectWeeklyTopicInput>(options));
      return { ok: true, operation, artifact, state: 'topic_selected' };
    }
    if (operation === 'program week cancel') {
      const artifact = await weeks.cancel(await readInput<CancelWeeklyCycleInput>(options));
      return { ok: true, operation, artifact, state: artifact.phase };
    }
    if (operation === 'program week compile-package') {
      const artifact = await compiler.compile(await readInput<CompileWeeklyPackageInput>(options));
      return { ok: true, operation, artifact, state: artifact.status };
    }
    if (operation === 'program week status') {
      const input = await readInput<{ cycle_id: string }>(options);
      const artifact = await weeks.status(input.cycle_id);
      return { ok: true, operation, artifact, state: artifact.phase };
    }
    throw new HarnessError('CONTRACT_INVALID', `unknown operation: ${operation}`);
  }

  if (operation.startsWith('memory ')) {
    const assets = await packagedMemoryAssets();
    const runtime = await configuredMemoryRuntime(options, assets);
    const query = new MemoryQueryService(store, runtime ?? unavailableQueryRuntime);
    const feedback = new MemoryFeedbackService(store);
    const insight = new MemoryInsightService(store);
    const evidence = new ResearchEvidenceService(store);
    const increments = new ResearchIncrementService(store);
    const deltas = new SemanticDeltaService(store);
    const promotion = new MemoryPromotionService(
      store,
      (runtime ?? unavailableIngestRuntime) as ConstructorParameters<typeof MemoryPromotionService>[1],
      {
        profile_path: assets.profilePath,
        mapping_path: assets.mappingPath,
        scp_paths: [assets.harnessScpPath, assets.articleScpPath, assets.xScpPath]
      }
    );
    const progressive = new ProgressiveResearchQueryService(
      store,
      (runtime ?? unavailableProgressiveRuntime) as ConstructorParameters<typeof ProgressiveResearchQueryService>[1]
    );
    const indexMaintenance = new ResearchIndexMaintenanceService(
      store,
      (runtime ?? unavailableProgressiveRuntime) as ConstructorParameters<typeof ResearchIndexMaintenanceService>[1]
    );
    const terminalHooks = new ResearchTerminalHooks(store);
    const researchImport = new ResearchImportService(store);
    const ingest = new MemoryIngestService(
      store,
      (runtime ?? unavailableIngestRuntime) as ConstructorParameters<typeof MemoryIngestService>[1],
      {
        profile_path: assets.profilePath,
        mapping_path: assets.mappingPath,
        scp_paths: [assets.harnessScpPath, assets.articleScpPath, assets.xScpPath]
      }
    );

    if (operation === 'memory doctor') {
      const artifact = runtime === null
        ? {
            status: 'not_configured', configured: false,
            runtime_version: null, profile: 'research-publishing'
          }
        : await runtime.doctor();
      return { ok: true, operation, artifact, state: artifact.status };
    }
    if (operation === 'memory evidence capture') {
      const artifact = await evidence.capture(await readInput<CaptureResearchEvidenceInput>(options));
      return { ok: true, operation, artifact, state: 'evidence_captured' };
    }
    if (operation === 'memory evidence status') {
      const input = await readInput<{ evidence_snapshot_id: string }>(options);
      const artifact = await evidence.status(input.evidence_snapshot_id);
      return { ok: true, operation, artifact, state: artifact.state };
    }
    if (operation === 'memory terminal-hook status') {
      const input = await readInput<{ event_id: string }>(options);
      const artifact = await terminalHooks.status(input.event_id);
      return { ok: true, operation, artifact, state: artifact.status };
    }
    if (operation === 'memory terminal-hook resume') {
      const input = await readInput<{ event_id: string }>(options);
      const artifact = await terminalHooks.resume(input.event_id);
      return { ok: true, operation, artifact, state: artifact.status };
    }
    if (operation === 'memory import inspect') {
      const artifact = await researchImport.inspect(await readInput<ResearchImportManifestV1>(options));
      return { ok: true, operation, artifact, state: 'inspected' };
    }
    if (operation === 'memory import capture') {
      const artifact = await researchImport.capture(await readInput<ResearchImportManifestV1>(options));
      return { ok: true, operation, artifact, state: 'evidence_captured' };
    }
    if (operation === 'memory import propose') {
      const input = await readInput<{
        manifest: ResearchImportManifestV1; evidence_snapshot_id: string;
      }>(options);
      const artifact = await researchImport.propose(input.manifest, input.evidence_snapshot_id);
      return { ok: true, operation, artifact, state: 'delta_proposed' };
    }
    if (operation === 'memory increment assemble') {
      const artifact = await increments.assemble(
        await readInput<AssembleResearchIncrementInput>(options)
      );
      return { ok: true, operation, artifact, state: 'working' };
    }
    if (operation === 'memory increment status') {
      const input = await readInput<{ increment_id: string }>(options);
      const artifact = await increments.status(input.increment_id);
      return { ok: true, operation, artifact, state: artifact.state };
    }
    if (operation === 'memory lineage show') {
      const input = await readInput<{ increment_id: string }>(options);
      const artifact = await increments.lineage(input.increment_id);
      return { ok: true, operation, artifact, state: artifact.state };
    }
    if (operation === 'memory delta propose') {
      const artifact = await deltas.propose(await readInput<SemanticMemoryDeltaInput>(options));
      return { ok: true, operation, artifact, state: 'delta_proposed' };
    }
    if (operation === 'memory delta review') {
      const input = await readInput<{ delta_id: string; review: ReviewDeltaInput }>(options);
      const artifact = await deltas.review(input.delta_id, input.review);
      return { ok: true, operation, artifact, state: 'reviewed' };
    }
    if (operation === 'memory promotion plan') {
      requireMemoryRuntime(runtime);
      const input = await readInput<{ delta_id: string; review_id: string }>(options);
      const artifact = await promotion.plan(input.delta_id, input.review_id);
      return { ok: true, operation, artifact, state: 'planned' };
    }
    if (operation === 'memory promotion approve') {
      const input = await readInput<{
        plan_id: string; confirmed_plan_digest: `sha256:${string}`;
        approved_by: string; ttl_ms: number;
      }>(options);
      const artifact = await promotion.approve(
        input.plan_id, input.confirmed_plan_digest, input.approved_by, input.ttl_ms
      );
      return { ok: true, operation, artifact, state: 'approved' };
    }
    if (operation === 'memory promotion execute') {
      requireMemoryRuntime(runtime);
      const input = await readInput<{ plan_id: string; approval: MemoryPromotionApprovalV2 }>(options);
      const artifact = await promotion.execute(input.plan_id, input.approval);
      return { ok: true, operation, artifact, state: artifact.status };
    }
    if (operation === 'memory promotion status') {
      const input = await readInput<{ plan_id: string }>(options);
      const artifact = await promotion.status(input.plan_id);
      return { ok: true, operation, artifact, state: artifact.phase };
    }
    if (operation === 'memory promotion resume') {
      requireMemoryRuntime(runtime);
      const input = await readInput<{ plan_id: string; approval: MemoryPromotionApprovalV2 }>(options);
      const artifact = await promotion.resume(input.plan_id, input.approval);
      return { ok: true, operation, artifact, state: artifact.status };
    }
    if (operation === 'memory query plan') {
      const raw = await readInput<Record<string, unknown>>(options);
      if ('track_id' in raw) {
        const artifact = await progressive.plan(raw as unknown as PlanResearchQueryInput);
        return { ok: true, operation, artifact, state: 'planned' };
      }
      const input = raw as unknown as {
        research_track: string;
        purpose: 'candidate_enrichment' | 'feedback_followup';
        query_terms: readonly string[];
        context_budget: { max_items: number; max_chars: number; max_item_chars: number };
        skill: 'article' | 'x';
      };
      const [profileBytes, scpBytes] = await Promise.all([
        readFile(assets.profilePath),
        readFile(input.skill === 'x' ? assets.xScpPath : assets.articleScpPath)
      ]);
      const artifact = await query.planQuery({
        research_track: input.research_track,
        purpose: input.purpose,
        query_terms: input.query_terms,
        context_budget: input.context_budget,
        profile_digest: sha256Bytes(profileBytes),
        scp_digest: sha256Bytes(scpBytes)
      });
      return { ok: true, operation, artifact, state: 'query_planned' };
    }
    if (operation === 'memory query execute') {
      const input = await readInput<{ query_id: string }>(options);
      if (await store.exists(`memory/queries-v2/${input.query_id}/plan.json`)) {
        const artifact = await progressive.execute(input.query_id);
        return { ok: true, operation, artifact, state: artifact.query_status };
      }
      const artifact = await query.executeQuery(input.query_id);
      return { ok: true, operation, artifact, state: artifact.status };
    }
    if (operation === 'memory query review') {
      const input = await readInput<{
        query_id: string; selected_context_refs: readonly string[];
        reviewer: string; reviewed_at: string;
      }>(options);
      const artifact = await progressive.review(input.query_id, {
        selected_context_refs: input.selected_context_refs,
        reviewer: input.reviewer, reviewed_at: input.reviewed_at
      });
      return { ok: true, operation, artifact, state: 'reviewed' };
    }
    if (operation === 'memory query status') {
      const input = await readInput<{ query_id: string }>(options);
      if (await store.exists(`memory/queries-v2/${input.query_id}/plan.json`)) {
        const artifact = await progressive.status(input.query_id);
        return { ok: true, operation, artifact, state: artifact.phase };
      }
      const artifact = await query.queryStatus(input.query_id);
      return { ok: true, operation, artifact, state: artifact.state };
    }
    if (operation === 'memory query bind-package') {
      const raw = await readInput<Record<string, unknown>>(options);
      const queryId = raw.query_id as string;
      if (await store.exists(`memory/queries-v2/${queryId}/plan.json`)) {
        const input = raw as unknown as {
          query_id: string; package: Extract<ResearchContentPackage, { schema_version: '1.1' }>;
        };
        const artifact = await progressive.bindPackage(input.query_id, input.package);
        return { ok: true, operation, artifact, state: artifact.memory_context.status };
      }
      const input = raw as unknown as {
        query_id: string;
        package: Extract<ResearchContentPackage, { schema_version: '1.1' }>;
        selected_refs: readonly string[];
        reviewed_by: string;
        reviewed_at: string;
      };
      await query.reviewContext(input.query_id, {
        selected_refs: input.selected_refs,
        reviewed_by: input.reviewed_by,
        reviewed_at: new Date(input.reviewed_at)
      });
      const artifact = await query.bindPackage(input.query_id, input.package);
      return { ok: true, operation, artifact, state: artifact.memory_context.status };
    }
    if (operation === 'memory index doctor') {
      requireMemoryRuntime(runtime);
      const input = await readInput<{ track_id: string }>(options);
      const artifact = await indexMaintenance.doctor(input.track_id);
      return { ok: true, operation, artifact, state: artifact.status };
    }
    if (operation === 'memory index rebuild-plan') {
      requireMemoryRuntime(runtime);
      const input = await readInput<{ track_id: string }>(options);
      const artifact = await indexMaintenance.rebuildPlan(input.track_id);
      return { ok: true, operation, artifact, state: 'planned' };
    }
    if (operation === 'memory feedback capture') {
      const raw = await readInput<Omit<CaptureFeedbackInput, 'observed_at'> & { observed_at: string }>(options);
      const artifact = await feedback.capture({ ...raw, observed_at: new Date(raw.observed_at) });
      return { ok: true, operation, artifact, state: 'feedback_captured' };
    }
    if (operation === 'memory feedback review') {
      const input = await readInput<{ feedback_snapshot_id: string }>(options);
      const artifact = await store.readJson(`feedback/${input.feedback_snapshot_id}/snapshot.json`);
      return { ok: true, operation, artifact, state: 'feedback_captured' };
    }
    if (operation === 'memory insight propose') {
      const artifact = await insight.propose(await readInput<ProposeInsightInput>(options));
      return { ok: true, operation, artifact, state: 'insight_proposed' };
    }
    if (operation === 'memory insight review') {
      const input = await readInput<{
        proposal_id: string;
        reviewed_by: string;
        accepted: boolean;
        reason: string;
        reviewed_at: string;
      }>(options);
      const artifact = await insight.reviewInsight(input.proposal_id, {
        reviewed_by: input.reviewed_by,
        accepted: input.accepted,
        reason: input.reason,
        reviewed_at: new Date(input.reviewed_at)
      });
      return { ok: true, operation, artifact, state: 'evidence_reviewed' };
    }
    if (operation === 'memory ingest plan') {
      requireMemoryRuntime(runtime);
      const input = await readInput<
        ({ ingest_kind: 'publication_checkpoint' } & PublicationCheckpointInput) |
        ({ ingest_kind: 'feedback_insight' } & FeedbackInsightInput)
      >(options);
      const artifact = input.ingest_kind === 'feedback_insight'
        ? await ingest.planFeedbackInsight(input)
        : await ingest.planPublicationCheckpoint(input);
      return { ok: true, operation, artifact, state: 'ingest_previewed' };
    }
    if (operation === 'memory ingest approve') {
      const input = await readInput<{ ingest_id: string; approved_by: string; ttl_ms: number }>(options);
      const artifact = await ingest.approve(input.ingest_id, input.approved_by, input.ttl_ms);
      return { ok: true, operation, artifact, state: 'ingest_approved' };
    }
    if (operation === 'memory ingest execute') {
      requireMemoryRuntime(runtime);
      const input = await readInput<{ ingest_id: string; approval: MemoryIngestApprovalV1 }>(options);
      const artifact = await ingest.execute(input.ingest_id, input.approval);
      return { ok: true, operation, artifact, state: artifact.status };
    }
    if (operation === 'memory ingest status') {
      const input = await readInput<{ ingest_id: string }>(options);
      const artifact = await ingest.status(input.ingest_id);
      return { ok: true, operation, artifact, state: artifact.state };
    }
    if (operation === 'memory ingest resume') {
      requireMemoryRuntime(runtime);
      const input = await readInput<{ ingest_id: string; approval: MemoryIngestApprovalV1 }>(options);
      const artifact = await ingest.resume(input.ingest_id, input.approval);
      return { ok: true, operation, artifact, state: artifact.status };
    }
  }

  const articleInput = options.input === undefined ? undefined : await readInput<Record<string, unknown>>(options);
  if (operation.startsWith('article ')) {
    const article = new ArticleService(store, {
      ...(options.runId === undefined ? {} : { runId: () => options.runId! })
    });
    if (operation === 'article prepare') {
      const input = articleInput as unknown as { package: ResearchContentPackage; brief: ArticleBrief };
      const artifact = await article.prepareArticle(input.package, input.brief);
      return { ok: true, operation, artifact, state: 'generation_ready' };
    }
    if (operation === 'article accept-draft') {
      const input = articleInput as unknown as { run_id?: string; draft: ArticleDraft };
      const artifact = await article.acceptArticleDraft(requiredRunId(options, input), input.draft);
      return { ok: true, operation, artifact, state: 'drafted' };
    }
    const runId = requiredRunId(options, articleInput as { run_id?: string } | undefined);
    if (operation === 'article review') {
      const artifact = await article.reviewArticle(runId);
      if (!artifact.passed) {
        const privacy = artifact.findings.some((finding) =>
          ['WINDOWS_PRIVATE_PATH', 'UNIX_PRIVATE_PATH', 'BEARER_TOKEN', 'COOKIE_VALUE'].includes(finding.code)
        );
        throw new HarnessError(
          privacy ? 'PRIVACY_GATE_BLOCKED' : 'EVIDENCE_GATE_BLOCKED',
          'article review contains blocking findings',
          artifact.findings
        );
      }
      return { ok: true, operation, artifact, state: 'reviewed', findings: artifact.findings };
    }
    if (operation === 'article finalize') {
      return { ok: true, operation, artifact: await article.finalizeArticle(runId), state: 'finalized' };
    }
    if (operation === 'article visual status') {
      return { ok: true, operation, artifact: await article.visualStatus(runId), state: 'reviewed' };
    }
    if (operation === 'article visual attach') {
      const value = articleInput as unknown as { visual?: Omit<AttachVisualInput, 'runId'> };
      const visual = value.visual ?? (articleInput as unknown as Omit<AttachVisualInput, 'runId'>);
      return { ok: true, operation, artifact: await article.attachVisual(runId, visual), state: 'reviewed' };
    }
    if (operation === 'article visual remove') {
      const value = articleInput as unknown as { candidate_id: string };
      await article.removeVisual(runId, value.candidate_id);
      return { ok: true, operation, artifact: { candidate_id: value.candidate_id, removed: true }, state: 'reviewed' };
    }
    if (operation === 'article visual review') {
      const value = articleInput as unknown as { review?: VisualReviewInput };
      return { ok: true, operation, artifact: await article.reviewVisual(runId, value.review ?? articleInput as unknown as VisualReviewInput), state: 'reviewed' };
    }
    if (operation === 'article handoff-x') {
      const value = articleInput as unknown as { asset_id?: string } | undefined;
      return { ok: true, operation, artifact: await article.createXHandoff(runId, value?.asset_id), state: 'finalized' };
    }
  }

  if (operation.startsWith('x-article ')) {
    const input = articleInput;
    if (operation === 'x-article plan') {
      const value = input as unknown as {
        package_ref: Parameters<XArticleService['plan']>[0];
        target_account: string;
      };
      const artifact = await new XArticleService(store).plan(value.package_ref, value.target_account);
      return { ok: true, operation, artifact, state: 'approval_pending' };
    }
    if (operation === 'x-article approve') {
      const value = input as unknown as {
        plan: XArticlePublicationPlanV1;
        approved_by: string;
        ttl_ms: number;
      };
      const artifact = approveXArticlePublication(
        value.plan, value.approved_by, value.ttl_ms
      );
      await store.writeNew(`approvals/${artifact.approval_id}.json`, artifact);
      return { ok: true, operation, artifact, state: 'approved' };
    }

    const executionId = options.executionId ?? (input as { execution_id?: string } | undefined)?.execution_id;
    const browser = new XArticleBrowserAdapter(
      store,
      new XArticleWeb2026_08Contract(),
      operation === 'x-article browser start' && executionId !== undefined
        ? { executionId: () => executionId }
        : {}
    );
    if (operation === 'x-article browser start') {
      const value = input as unknown as {
        execution_id: string;
        plan: XArticlePublicationPlanV1;
        approval: XArticleApprovalV1;
        capability_manifest: XArticleBrowserCapabilityManifestV1;
      };
      const artifact = await browser.start(value.plan, value.approval, value.capability_manifest);
      return { ok: true, operation, artifact, state: artifact.state };
    }
    if (operation === 'x-article browser next') {
      const artifact = await browser.next(requiredExecutionId(options));
      return { ok: true, operation, artifact, state: artifact.snapshot.state };
    }
    if (operation === 'x-article browser claim') {
      const id = requiredExecutionId(options);
      const commandId = requiredCommandId(options);
      const command = await store.readJson<XArticleBrowserCommandV1>(
        `runs/${id}/x-article/browser/commands/${commandId}/command.json`
      );
      const artifact = await browser.claim(command);
      return { ok: true, operation, artifact, state: (await browser.status(id)).state };
    }
    if (operation === 'x-article browser report') {
      const artifact = await browser.report(input as unknown as XArticleBrowserReportInput);
      return { ok: true, operation, artifact, state: artifact.state };
    }
    if (operation === 'x-article browser status') {
      const artifact = await browser.status(requiredExecutionId(options));
      return { ok: true, operation, artifact, state: artifact.state };
    }
    if (operation === 'x-article browser resume-verification') {
      const artifact = await browser.resumeVerification(requiredExecutionId(options));
      return { ok: true, operation, artifact, state: artifact.state };
    }
    if (operation === 'x-article browser cancel-before-publish') {
      const artifact = await browser.cancelBeforePublish(requiredExecutionId(options));
      return { ok: true, operation, artifact, state: artifact.state };
    }
  }

  if (operation.startsWith('x ')) {
    const x = new XService(store, {
      ...(options.runId === undefined ? {} : { runId: () => options.runId! })
    });
    const input = options.input === undefined ? undefined : await readInput<Record<string, unknown>>(options);
    const executions = new ExecutionStore(store);
    const broker = new CommandBroker(store, executions);
    const browser = new BrowserAdapter(
      store,
      executions,
      broker,
      new XWeb202608Contract()
    );
    if (operation === 'x browser prune') {
      const artifact = await pruneBrowserArtifacts(store);
      return { ok: true, operation, artifact, state: 'pruned' };
    }
    if (operation === 'x browser start') {
      const start = input as unknown as {
        execution_id: string;
        plan: PublicationPlanV2 | PublicationPlanV2_1;
        approval: ApprovalV2 | ApprovalV2_1;
        capability_manifest: BrowserCapabilityManifest;
      };
      await pruneBrowserArtifacts(store);
      const snapshot = await browser.start(start);
      const status = await browser.status(start.execution_id);
      return {
        ok: true,
        operation,
        artifact: {
          execution_id: start.execution_id,
          snapshot,
          command: status.pending_command
        },
        state: snapshot.state
      };
    }
    if (operation === 'x browser next') {
      const executionId = requiredExecutionId(options);
      const artifact = await browser.next(executionId);
      const status = await browser.status(executionId);
      return { ok: true, operation, artifact, state: status.snapshot.state };
    }
    if (operation === 'x browser claim') {
      const executionId = requiredExecutionId(options);
      const artifact = await browser.claim(executionId, requiredCommandId(options));
      const status = await browser.status(executionId);
      return { ok: true, operation, artifact, state: status.snapshot.state };
    }
    if (operation === 'x browser report') {
      const executionId = requiredExecutionId(options);
      const artifact = await browser.report(executionId, input as unknown as BrowserActionResultInput);
      return { ok: true, operation, artifact, state: artifact.state };
    }
    if (operation === 'x browser status') {
      const artifact = await browser.status(requiredExecutionId(options));
      return { ok: true, operation, artifact, state: artifact.snapshot.state };
    }
    if (operation === 'x browser resume-verification') {
      const artifact = await browser.resumeVerification(requiredExecutionId(options));
      return { ok: true, operation, artifact, state: artifact.state };
    }
    if (operation === 'x browser cancel-before-submit') {
      const artifact = await browser.cancelBeforeSubmit(requiredExecutionId(options));
      return { ok: true, operation, artifact, state: artifact.state };
    }
    if (operation === 'x prepare') {
      const prepare = input as unknown as { package: ResearchContentPackage; brief: XBrief };
      return { ok: true, operation, artifact: await x.prepareX(prepare.package, prepare.brief), state: 'generation_ready' };
    }
    if (operation === 'x accept-draft') {
      const accept = input as unknown as { run_id?: string; draft: XDraft };
      return { ok: true, operation, artifact: await x.acceptXDraft(requiredRunId(options, accept), accept.draft), state: 'drafted' };
    }
    if (operation === 'x approve') {
      const approve = input as unknown as {
        plan: PublicationPlan | PublicationPlanV2 | PublicationPlanV2_1;
        approved_by: string;
        ttl_ms: number;
      };
      const artifact = approve.plan.schema_version === '2.1'
        ? approvePublicationV2_1(approve.plan, approve.approved_by, approve.ttl_ms)
        : approve.plan.schema_version === '2.0'
          ? approvePublicationV2(approve.plan, approve.approved_by, approve.ttl_ms)
          : approvePublication(approve.plan, approve.approved_by, approve.ttl_ms);
      await store.writeNew(`approvals/${artifact.approval_id}.json`, artifact);
      return { ok: true, operation, artifact, state: 'approved' };
    }
    if (operation === 'x handoff') {
      const handoff = input as unknown as { plan: PublicationPlan; approval: Approval };
      const artifact = await new ManualAdapter(store).handoff(handoff.plan, handoff.approval);
      return { ok: true, operation, artifact, state: 'handed_off' };
    }
    if (operation === 'x record-manual') {
      const record = input as unknown as { receipt: PublishReceipt; public_result: ManualPublicResult };
      const artifact = await new ManualAdapter(store).recordPublished(record.receipt, record.public_result);
      return { ok: true, operation, artifact, state: 'finalized' };
    }
    const runId = requiredRunId(options, input as { run_id?: string } | undefined);
    if (operation === 'x review') {
      const artifact = await x.reviewX(runId);
      if (!artifact.passed) {
        const characters = artifact.findings.some(
          (finding) => finding.code === 'CHARACTER_LIMIT_EXCEEDED'
        );
        throw new HarnessError(
          characters ? 'CHARACTER_LIMIT_EXCEEDED' : 'EVIDENCE_GATE_BLOCKED',
          'X review contains blocking findings',
          artifact.findings
        );
      }
      return { ok: true, operation, artifact, state: 'reviewed', findings: artifact.findings };
    }
    if (operation === 'x plan') {
      const handoff = (input as { article_handoff?: XHandoff } | undefined)?.article_handoff;
      const artifact = options.adapter === 'browser'
        ? handoff === undefined
          ? await x.planXBrowser(runId)
          : await x.planXBrowser(runId, handoff)
        : await x.planX(runId);
      return { ok: true, operation, artifact, state: 'approval_pending' };
    }
  }

  throw new HarnessError('CONTRACT_INVALID', `unknown operation: ${operation || '(empty)'}`);
}

function exitCode(error: unknown): number {
  if (error instanceof HarnessError) {
    const contractCodes: readonly ErrorCode[] = ['CONTRACT_INVALID'];
    const gateCodes: readonly ErrorCode[] = [
      'RESEARCH_GATE_BLOCKED',
      'EVIDENCE_GATE_BLOCKED',
      'PRIVACY_GATE_BLOCKED',
      'PUBLISH_GATE_BLOCKED',
      'CHARACTER_LIMIT_EXCEEDED'
    ];
    const stateCodes: readonly ErrorCode[] = [
      'STATE_TRANSITION_INVALID',
      'APPROVAL_STALE',
      'COMMAND_REPLAY_REJECTED',
      'STALE_PAGE_REVISION',
      'EXECUTION_BUSY',
      'SUBMIT_ALREADY_ATTEMPTED'
    ];
    if (contractCodes.includes(error.code)) return 2;
    if (gateCodes.includes(error.code)) return 3;
    if (stateCodes.includes(error.code)) return 4;
    return 5;
  }
  if ((error as NodeJS.ErrnoException).code !== undefined) {
    return 5;
  }
  return 10;
}

async function main(): Promise<void> {
  let operation = operationFromArgv(process.argv.slice(2));
  try {
    const result = await execute(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    if (error instanceof HarnessError && operation.length === 0) {
      operation = 'unknown';
    }
    const code = error instanceof HarnessError
      ? error.code
      : (error as NodeJS.ErrnoException).code ?? 'UNEXPECTED';
    const message = error instanceof Error ? error.message : 'unexpected error';
    process.stdout.write(`${JSON.stringify({ ok: false, operation, error: { code, message } })}\n`);
    process.exitCode = exitCode(error);
  }
}

function operationFromArgv(argv: readonly string[]): string {
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (token.startsWith('--')) {
      index += 1;
      continue;
    }
    positional.push(token);
  }
  return positional.join(' ');
}

await main();
