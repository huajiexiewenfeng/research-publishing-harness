#!/usr/bin/env node
import { access, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ManualAdapter } from '../adapters/x/manual/manual-adapter.js';
import { createLLMWikiRuntimeAdapter } from '../adapters/llm-wiki/runtime-adapter.js';
import { BrowserAdapter } from '../adapters/x/browser/browser-adapter.js';
import { CommandBroker } from '../adapters/x/browser/command-broker.js';
import { XWeb202608Contract } from '../adapters/x/browser/contracts/x-web-2026-08.js';
import { XArticleBrowserAdapter } from '../adapters/x/article-browser/article-browser-adapter.js';
import { XArticleWeb2026_08Contract } from '../adapters/x/article-browser/contracts/x-article-web-2026-08.js';
import { ArticleService } from '../branches/article-harness/article-service.js';
import { XArticleService } from '../branches/x-article-harness/x-article-service.js';
import { XService } from '../branches/x-harness/x-service.js';
import { approvePublication } from '../core/approval.js';
import { approvePublicationV2 } from '../core/approval-v2.js';
import { approvePublicationV2_1 } from '../core/approval-v2-1.js';
import { approveXArticlePublication } from '../core/x-article-approval.js';
import { assertXArticleFastPathAudit, confirmXArticleFastPath } from '../core/x-article-fast-path.js';
import { assertXArticleFastPathReleaseSet } from '../core/x-article-fast-path-release.js';
import { assertXArticlePublicationPlan } from '../core/x-article-publication-plan.js';
import { verifyXArticleFastPathResult } from '../core/x-article-materialization.js';
import { createXArticleExistingDraftBinding } from '../core/x-article-existing-draft-binding.js';
import { pruneBrowserArtifacts } from '../core/artifact-retention.js';
import { HarnessError } from '../core/errors.js';
import { X_ARTICLE_CONTROL_ROUTES, X_ARTICLE_HOST_PROTOCOL } from './x-article-control-surface.js';
import { sha256, sha256Bytes } from '../core/digest.js';
import { MemoryFeedbackService } from '../core/memory-feedback-service.js';
import { MemoryIngestService } from '../core/memory-ingest-service.js';
import { MemoryInsightService } from '../core/memory-insight-service.js';
import { MemoryQueryService } from '../core/memory-query-service.js';
import { MemoryPromotionService } from '../core/memory-promotion-service.js';
import { MonthlyEditorialReviewService } from '../core/monthly-editorial-review-service.js';
import { ProgressiveResearchQueryService } from '../core/progressive-research-query-service.js';
import { ResearchBacklogService } from '../core/research-backlog-service.js';
import { ResearchIndexMaintenanceService } from '../core/research-index-maintenance-service.js';
import { ResearchProgramStatusService } from '../core/research-program-status-service.js';
import { ResearchRoadmapService } from '../core/research-roadmap-service.js';
import { ResearchSynthesisService } from '../core/research-synthesis-service.js';
import { WeeklyResearchCycleService } from '../core/weekly-research-cycle-service.js';
import { WeeklyResearchBridgeService } from '../core/weekly-research-bridge-service.js';
import { WeeklyOutcomeService } from '../core/weekly-outcome-service.js';
import { WeeklyPackageCompiler } from '../core/weekly-package-compiler.js';
import { ResearchTerminalHooks } from '../core/research-terminal-hooks.js';
import { ResearchImportService } from '../core/research-import-service.js';
import { SemanticDeltaService } from '../core/semantic-delta-service.js';
import { ResearchEvidenceService } from '../core/research-evidence-service.js';
import { ResearchIncrementService } from '../core/research-increment-service.js';
import { PackageService } from '../core/package-service.js';
import { PublicationBundleService } from '../core/publication-bundle-service.js';
import { ExecutionStore } from '../core/execution-store.js';
import { assertContractsAvailable, validateContract } from '../core/schema-validator.js';
import { WorkspaceStore } from '../core/workspace-store.js';
const KNOWN_OPTIONS = new Set([
    'workspace', 'input', 'run-id', 'execution-id', 'command-id', 'adapter',
    'runtime-executable', 'runtime-launcher', 'runtime-version', 'output', 'plan', 'capabilities',
    'observation', 'execution', 'confirmation',
    'audit', 'release-set'
]);
const V3_2_COMPATIBILITY_ALIASES = [
    'x-article browser resume-editor --execution-id <id>'
];
const X_ARTICLE_BROWSER_CAPABILITIES = new Set([
    'observe_article_page', 'navigate', 'create_article_draft', 'set_article_title',
    'upload_article_cover', 'import_article_document', 'insert_article_block',
    'insert_article_image', 'replace_article_visual_anchor', 'set_article_image_alt',
    'open_article_preview', 'open_publish_review', 'publish_article_once'
]);
function parseArguments(argv) {
    const positional = [];
    const values = {};
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token.startsWith('--')) {
            positional.push(token);
            continue;
        }
        const name = token.slice(2);
        if (!KNOWN_OPTIONS.has(name)) {
            throw new HarnessError('CONTRACT_INVALID', `unknown option ${token}`);
        }
        if (values[name] !== undefined) {
            throw new HarnessError('CONTRACT_INVALID', `option ${token} may be provided only once`);
        }
        const value = argv[index + 1];
        if (value === undefined || value.startsWith('--')) {
            throw new HarnessError('CONTRACT_INVALID', `option ${token} requires a value`);
        }
        values[name] = value;
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
    const runtimeVersion = values['runtime-version'];
    if (runtimeVersion !== undefined && !['0.2.0', '0.3.0'].includes(runtimeVersion)) {
        throw new HarnessError('MEMORY_RUNTIME_INVALID_CONFIG', 'unsupported --runtime-version');
    }
    if (runtimeLauncher !== undefined &&
        runtimeLauncher !== 'console-script' && runtimeLauncher !== 'python-module') {
        throw new HarnessError('MEMORY_RUNTIME_INVALID_CONFIG', '--runtime-launcher must be console-script or python-module');
    }
    return {
        positional,
        options: {
            workspace: resolve(workspace),
            ...(values['input'] === undefined ? {} : { input: resolve(values['input']) }),
            ...(values['run-id'] === undefined ? {} : { runId: values['run-id'] }),
            ...(values['execution-id'] === undefined ? {} : { executionId: values['execution-id'] }),
            ...(values['command-id'] === undefined ? {} : { commandId: values['command-id'] }),
            ...(values['plan'] === undefined ? {} : { plan: resolve(values['plan']) }),
            ...(values['observation'] === undefined
                ? {}
                : { observation: resolve(values['observation']) }),
            ...(values['capabilities'] === undefined
                ? {}
                : { capabilities: resolve(values['capabilities']) }),
            ...(values['execution'] === undefined ? {} : { execution: values['execution'] }),
            ...(values['confirmation'] === undefined
                ? {}
                : { confirmation: resolve(values['confirmation']) }),
            ...(values['audit'] === undefined ? {} : { audit: resolve(values['audit']) }),
            ...(values['release-set'] === undefined
                ? {}
                : { releaseSet: resolve(values['release-set']) }),
            ...(adapter === undefined ? {} : { adapter }),
            ...(values['runtime-executable'] === undefined
                ? {}
                : { runtimeExecutable: values['runtime-executable'] }),
            ...(runtimeLauncher === undefined ? {} : { runtimeLauncher }),
            ...(runtimeVersion === undefined ? {} : { runtimeVersion: runtimeVersion }),
            output: values['output'] ?? 'json'
        },
        providedOptions: new Set(Object.keys(values))
    };
}
function validateOptionsWithOptional(operation, provided, required, optional) {
    const allowed = new Set(['workspace', 'output', ...required, ...optional]);
    const extra = [...provided].filter((name) => !allowed.has(name)).sort();
    if (extra.length > 0) {
        throw new HarnessError('CONTRACT_INVALID', `${operation} does not accept option${extra.length === 1 ? '' : 's'} ${extra.map((name) => `--${name}`).join(', ')}`);
    }
    for (const name of required) {
        if (!provided.has(name)) {
            throw new HarnessError('CONTRACT_INVALID', `${operation} requires --${name}`);
        }
    }
}
function validateExactOptions(operation, provided, operationOptions) {
    const allowed = new Set(['workspace', 'output', ...operationOptions]);
    const extra = [...provided].filter((name) => !allowed.has(name)).sort();
    if (extra.length > 0) {
        throw new HarnessError('CONTRACT_INVALID', `${operation} does not accept option${extra.length === 1 ? '' : 's'} ${extra.map((name) => `--${name}`).join(', ')}`);
    }
    for (const name of operationOptions) {
        if (!provided.has(name)) {
            throw new HarnessError('CONTRACT_INVALID', `${operation} requires --${name}`);
        }
    }
}
function validateResumeEditorOptions(operation, provided) {
    const allowed = new Set(['workspace', 'output', 'execution', 'execution-id']);
    const extra = [...provided].filter((name) => !allowed.has(name)).sort();
    if (extra.length > 0) {
        throw new HarnessError('CONTRACT_INVALID', `${operation} does not accept option${extra.length === 1 ? '' : 's'} ${extra.map((name) => `--${name}`).join(', ')}`);
    }
    const supplied = ['execution', 'execution-id'].filter((name) => provided.has(name));
    if (supplied.length !== 1) {
        throw new HarnessError('CONTRACT_INVALID', `${operation} requires exactly one of --execution or --execution-id`);
    }
}
function requiredStableExecutionId(options, allowCompatibilityAlias = false) {
    const executionId = options.execution
        ?? (allowCompatibilityAlias ? options.executionId : undefined);
    if (executionId === undefined || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(executionId)) {
        throw new HarnessError('WORKSPACE_PATH_INVALID', 'unsafe X Article execution identity');
    }
    return executionId;
}
async function readJsonFile(path, label) {
    try {
        return JSON.parse(await readFile(path, 'utf8'));
    }
    catch (error) {
        if (error instanceof SyntaxError) {
            throw new HarnessError('CONTRACT_INVALID', `${label} contains malformed JSON`);
        }
        throw new HarnessError('ARTIFACT_NOT_FOUND', `${label} is unavailable`);
    }
}
async function readOptionalJsonFile(path, label) {
    try {
        return JSON.parse(await readFile(path, 'utf8'));
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return null;
        if (error instanceof SyntaxError) {
            throw new HarnessError('CONTRACT_INVALID', `${label} contains malformed JSON`);
        }
        throw new HarnessError('ARTIFACT_NOT_FOUND', `${label} is unavailable`);
    }
}
function assertCapabilityManifest(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new HarnessError('CONTRACT_INVALID', 'capabilities must be a JSON object');
    }
    const manifest = value;
    const keys = Object.keys(manifest).sort();
    const expected = [
        'browser_family', 'capabilities', 'executor', 'executor_version', 'observed_at'
    ];
    if (JSON.stringify(keys) !== JSON.stringify(expected)
        || manifest['executor'] !== 'codex-chrome'
        || manifest['browser_family'] !== 'chrome'
        || typeof manifest['executor_version'] !== 'string'
        || manifest['executor_version'].trim().length === 0
        || !Array.isArray(manifest['capabilities'])
        || manifest['capabilities'].some((item) => typeof item !== 'string' || !X_ARTICLE_BROWSER_CAPABILITIES.has(item))
        || new Set(manifest['capabilities']).size !== manifest['capabilities'].length
        || typeof manifest['observed_at'] !== 'string'
        || !Number.isFinite(Date.parse(manifest['observed_at']))) {
        throw new HarnessError('CONTRACT_INVALID', 'capabilities do not match the Browser Host manifest schema');
    }
}
function digestBody(value, digestField) {
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== digestField));
}
function assertReceiptBinding(receipt, plan, executionId) {
    if (receipt.execution_id !== executionId
        || receipt.materialization_digest !== plan.materialization_digest
        || receipt.strategy !== plan.strategy
        || receipt.inline_image_count !== plan.visual_anchors.length
        || receipt.command_ceiling !== plan.expected_command_ceiling
        || receipt.observation_ceiling !== plan.expected_observation_ceiling
        || receipt.receipt_digest !== sha256(digestBody(receipt, 'receipt_digest'))) {
        throw new HarnessError('CONTRACT_INVALID', 'materialization receipt binding is invalid');
    }
}
async function readMaterializationStatus(operation, options, providedOptions) {
    validateExactOptions(operation, providedOptions, ['execution']);
    const executionId = requiredStableExecutionId(options);
    try {
        if (!(await stat(options.workspace)).isDirectory()) {
            throw new HarnessError('ARTIFACT_NOT_FOUND', 'workspace is unavailable');
        }
    }
    catch (error) {
        if (error instanceof HarnessError)
            throw error;
        throw new HarnessError('ARTIFACT_NOT_FOUND', 'workspace is unavailable');
    }
    const prefix = resolve(options.workspace, 'runs', executionId, 'x-article', 'browser');
    const contextValue = await readJsonFile(resolve(prefix, 'adapter-context.json'), 'execution state');
    if (typeof contextValue !== 'object'
        || contextValue === null
        || Array.isArray(contextValue)) {
        throw new HarnessError('CONTRACT_INVALID', 'materialization-status requires a prepared compatibility or Fast Path execution');
    }
    const context = contextValue;
    const executionMode = context.execution_mode;
    if (context.schema_version !== '1.0'
        || (executionMode !== 'materialization_v3_2'
            && executionMode !== 'media_completion_v3_3')
        || context.plan === undefined
        || context.materialization_plan === undefined) {
        throw new HarnessError('CONTRACT_INVALID', 'materialization-status requires a prepared compatibility or Fast Path execution');
    }
    assertXArticlePublicationPlan(context.plan);
    const publicationPlan = context.plan;
    const contextPlan = validateContract('x-article-materialization-plan', context.materialization_plan);
    const durablePlanValue = await readOptionalJsonFile(resolve(prefix, 'materialization-plan.json'), 'materialization plan');
    const plan = durablePlanValue === null
        ? contextPlan
        : validateContract('x-article-materialization-plan', durablePlanValue);
    const planBody = digestBody(plan, 'materialization_digest');
    if (plan.execution_id !== executionId
        || plan.publication_plan_digest !== publicationPlan.plan_digest
        || plan.target_account !== publicationPlan.intent.target_account
        || plan.materialization_digest !== sha256(planBody)
        || contextPlan.materialization_digest !== plan.materialization_digest
        || (executionMode === 'materialization_v3_2' && plan.draft_binding !== null)
        || (executionMode === 'media_completion_v3_3' && plan.draft_binding === null)) {
        throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'materialization status artifacts are not bound to the requested execution');
    }
    const checkpointValue = await readOptionalJsonFile(resolve(prefix, 'materialization-checkpoint.json'), 'materialization checkpoint');
    if (checkpointValue === null) {
        const prebindingState = context.snapshot?.state;
        if (executionMode !== 'media_completion_v3_3'
            || durablePlanValue !== null
            || context.snapshot?.execution_id !== executionId
            || !['created', 'preflight', 'materialization_blocked', 'cancelled_before_publish']
                .includes(typeof prebindingState === 'string' ? prebindingState : '')) {
            throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'materialization status artifacts are not bound to the requested execution');
        }
        const [preview, publicReceipt, confirmation] = await Promise.all([
            readOptionalJsonFile(resolve(prefix, 'materialization-receipt.json'), 'Preview materialization receipt'),
            readOptionalJsonFile(resolve(prefix, 'materialization-receipt-public.json'), 'public materialization receipt'),
            readOptionalJsonFile(resolve(prefix, 'publish-confirmation.json'), 'publish confirmation')
        ]);
        if (preview !== null || publicReceipt !== null || confirmation !== null) {
            throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'preflight materialization status contains later-phase evidence');
        }
        const artifact = {
            execution_id: executionId,
            phase: prebindingState === 'materialization_blocked' ? 'blocked' : 'preflight_pending',
            publication_plan_digest: plan.publication_plan_digest,
            materialization_digest: plan.materialization_digest,
            receipt: { present: false, status: 'absent', receipt_digest: null },
            confirmation: { state: 'absent', confirmation_digest: null },
            publication_status: 'pre_public'
        };
        return { ok: true, operation, artifact, state: 'pre_public' };
    }
    const checkpoint = validateContract('x-article-materialization-checkpoint', checkpointValue);
    const mediaBound = checkpoint.media.length === plan.visual_anchors.length
        && checkpoint.media.every((entry, index) => {
            const anchor = plan.visual_anchors[index];
            return anchor !== undefined
                && entry.anchor_id === anchor.anchor_id
                && entry.asset_id === anchor.asset_id
                && entry.block_ordinal === anchor.block_ordinal
                && entry.asset_digest === anchor.asset_digest;
        });
    if (durablePlanValue === null
        || checkpoint.execution_id !== executionId
        || checkpoint.materialization_digest !== plan.materialization_digest
        || !mediaBound) {
        throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'materialization status artifacts are not bound to the requested execution');
    }
    const preview = await readOptionalJsonFile(resolve(prefix, 'materialization-receipt.json'), 'Preview materialization receipt');
    let previewReceipt = null;
    if (preview !== null) {
        previewReceipt = validateContract('x-article-materialization-receipt', preview);
        assertReceiptBinding(previewReceipt, plan, executionId);
        if (previewReceipt.supersedes_receipt_digest !== null) {
            throw new HarnessError('CONTRACT_INVALID', 'Preview materialization receipt is invalid');
        }
    }
    const publicValue = await readOptionalJsonFile(resolve(prefix, 'materialization-receipt-public.json'), 'public materialization receipt');
    let publicReceipt = null;
    if (publicValue !== null) {
        publicReceipt = validateContract('x-article-materialization-receipt', publicValue);
        assertReceiptBinding(publicReceipt, plan, executionId);
        if (previewReceipt === null
            || publicReceipt.supersedes_receipt_digest !== previewReceipt.receipt_digest
            || Date.parse(publicReceipt.issued_at) < Date.parse(previewReceipt.issued_at)) {
            throw new HarnessError('CONTRACT_INVALID', 'public materialization receipt is not bound to Preview');
        }
        const expectedPublicBody = {
            ...digestBody(previewReceipt, 'receipt_digest'),
            human_wait_seconds: publicReceipt.human_wait_seconds,
            supersedes_receipt_digest: previewReceipt.receipt_digest,
            issued_at: publicReceipt.issued_at
        };
        if (publicReceipt.receipt_digest !== sha256(expectedPublicBody)) {
            throw new HarnessError('CONTRACT_INVALID', 'public materialization receipt is not authoritative');
        }
    }
    const confirmationValue = await readOptionalJsonFile(resolve(prefix, 'publish-confirmation.json'), 'publish confirmation');
    let confirmationState = checkpoint.publish_confirmation;
    let confirmationDigest = null;
    if (confirmationValue !== null) {
        const confirmation = validateContract('x-article-publish-confirmation', confirmationValue);
        const assetDigests = publicationPlan.intent.visuals.map((item) => item.asset.digest);
        if (confirmation.execution_id !== executionId
            || confirmation.draft_id !== checkpoint.draft_id
            || confirmation.target_account !== plan.target_account
            || confirmation.plan_digest !== plan.publication_plan_digest
            || confirmation.document_digest !== plan.document_digest
            || JSON.stringify(confirmation.asset_digests) !== JSON.stringify(assetDigests)
            || confirmation.confirmation_digest !== sha256(digestBody(confirmation, 'confirmation_digest'))) {
            throw new HarnessError('CONTRACT_INVALID', 'publish confirmation binding is invalid');
        }
        confirmationDigest = confirmation.confirmation_digest;
        if (checkpoint.publish_confirmation === 'absent')
            confirmationState = 'uncommitted';
    }
    else if (checkpoint.publish_confirmation !== 'absent') {
        throw new HarnessError('PUBLISH_GATE_BLOCKED', 'publish confirmation is unavailable');
    }
    const receiptStatus = publicReceipt !== null
        ? 'public_verified'
        : previewReceipt !== null
            ? 'preview_verified'
            : 'absent';
    const receiptDigest = publicReceipt?.receipt_digest ?? previewReceipt?.receipt_digest ?? null;
    const publicationStatus = publicReceipt !== null
        ? 'public_verified'
        : 'pre_public';
    const artifact = {
        execution_id: executionId,
        phase: checkpoint.phase,
        publication_plan_digest: plan.publication_plan_digest,
        materialization_digest: plan.materialization_digest,
        receipt: {
            present: previewReceipt !== null || publicReceipt !== null,
            status: receiptStatus,
            receipt_digest: receiptDigest
        },
        confirmation: {
            state: confirmationState,
            confirmation_digest: confirmationDigest
        },
        publication_status: publicationStatus
    };
    return { ok: true, operation, artifact, state: publicationStatus };
}
async function packagedMemoryAssets() {
    const candidates = [
        resolve(import.meta.dirname, '../../..'),
        resolve(import.meta.dirname, '../../../..')
    ];
    let root = null;
    for (const candidate of candidates) {
        try {
            await access(resolve(candidate, 'registry/harnesses.json'));
            root = candidate;
            break;
        }
        catch {
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
        xScpPath: resolve(root, 'skills/x-publishing-copilot/scp.yml'),
        synthesisScpPath: resolve(root, 'skills/research-synthesis-copilot/scp.yml')
    };
}
async function configuredMemoryRuntime(options, assets) {
    if (options.runtimeExecutable === undefined && options.runtimeLauncher === undefined)
        return null;
    if (options.runtimeExecutable === undefined || options.runtimeLauncher === undefined) {
        throw new HarnessError('MEMORY_RUNTIME_INVALID_CONFIG', '--runtime-executable and --runtime-launcher must be supplied together');
    }
    return createLLMWikiRuntimeAdapter({
        launcher: options.runtimeLauncher,
        executable: options.runtimeExecutable,
        expected_version: options.runtimeVersion ?? '0.2.0',
        workspace: options.workspace,
        profile_path: assets.profilePath,
        mapping_path: assets.mappingPath,
        scp_paths: [
            assets.harnessScpPath, assets.articleScpPath, assets.xScpPath, assets.synthesisScpPath
        ]
    });
}
const unavailableQueryRuntime = {
    async query() {
        return {
            status: 'unavailable', runtime_version: null, items: [],
            excluded_count: 0, truncated_count: 0
        };
    }
};
const unavailableIngestRuntime = {
    async version() {
        throw new HarnessError('MEMORY_RUNTIME_UNAVAILABLE', 'Runtime is not configured');
    },
    async validateMapping() {
        throw new HarnessError('MEMORY_RUNTIME_UNAVAILABLE', 'Runtime is not configured');
    },
    async copySource() {
        throw new HarnessError('MEMORY_RUNTIME_UNAVAILABLE', 'Runtime is not configured');
    },
    async writeRecord() {
        throw new HarnessError('MEMORY_RUNTIME_UNAVAILABLE', 'Runtime is not configured');
    },
    async registerArtifact() {
        throw new HarnessError('MEMORY_RUNTIME_UNAVAILABLE', 'Runtime is not configured');
    },
    async appendLog() {
        throw new HarnessError('MEMORY_RUNTIME_UNAVAILABLE', 'Runtime is not configured');
    },
    async findCatalog() {
        throw new HarnessError('MEMORY_RUNTIME_UNAVAILABLE', 'Runtime is not configured');
    }
};
const unavailableProgressiveRuntime = {
    async findRecords() {
        throw new HarnessError('MEMORY_RUNTIME_UNAVAILABLE', 'Runtime is not configured');
    },
    async loadPaths() {
        throw new HarnessError('MEMORY_RUNTIME_UNAVAILABLE', 'Runtime is not configured');
    }
};
function requireMemoryRuntime(runtime) {
    if (runtime === null) {
        throw new HarnessError('MEMORY_RUNTIME_INVALID_CONFIG', 'Memory mutation requires explicit --runtime-executable and --runtime-launcher');
    }
    return runtime;
}
function requiredExecutionId(options) {
    if (options.executionId === undefined || options.executionId.length === 0) {
        throw new HarnessError('CONTRACT_INVALID', '--execution-id is required');
    }
    return options.executionId;
}
function requiredCommandId(options) {
    if (options.commandId === undefined || options.commandId.length === 0) {
        throw new HarnessError('CONTRACT_INVALID', '--command-id is required');
    }
    return options.commandId;
}
async function readInput(options) {
    if (options.input === undefined) {
        throw new HarnessError('CONTRACT_INVALID', '--input <json> is required for this operation');
    }
    return readJsonFile(options.input, 'input');
}
function requiredRunId(options, input) {
    const runId = options.runId ?? input?.run_id;
    if (runId === undefined || runId.length === 0) {
        throw new HarnessError('CONTRACT_INVALID', '--run-id or input.run_id is required');
    }
    return runId;
}
async function execute(argv) {
    if (argv.length === 1 && argv[0] === '--help') {
        return {
            ok: true,
            operation: 'help',
            artifact: {
                host_protocol: `Host protocol: ${X_ARTICLE_HOST_PROTOCOL}`,
                routes: X_ARTICLE_CONTROL_ROUTES,
                compatibility_aliases: V3_2_COMPATIBILITY_ALIASES
            },
            state: 'ready'
        };
    }
    const { positional, options, providedOptions } = parseArguments(argv);
    if (options.output !== 'json') {
        throw new HarnessError('CONTRACT_INVALID', 'V1 supports --output json only');
    }
    const operation = positional.join(' ');
    if (operation === 'x-article browser materialization-status') {
        return readMaterializationStatus(operation, options, providedOptions);
    }
    if (operation === 'x-article browser prepare-existing-media') {
        validateExactOptions(operation, providedOptions, ['plan', 'observation', 'capabilities']);
        const plan = await readJsonFile(options.plan, 'plan');
        assertXArticlePublicationPlan(plan);
        const observation = validateContract('x-article-browser-observation', await readJsonFile(options.observation, 'existing Draft observation'));
        for (const [label, value] of [
            ['execution', observation.execution_id],
            ['command', observation.command_id],
            ['observation', observation.observation_id]
        ]) {
            if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value)) {
                throw new HarnessError('WORKSPACE_PATH_INVALID', `unsafe source ${label} identity`);
            }
        }
        const pageContract = new XArticleWeb2026_08Contract();
        pageContract.detectPage(observation);
        createXArticleExistingDraftBinding({ publication_plan: plan, observation });
        const capabilities = await readJsonFile(options.capabilities, 'capabilities');
        assertCapabilityManifest(capabilities);
        const preparedStore = await WorkspaceStore.open(options.workspace);
        const browser = new XArticleBrowserAdapter(preparedStore, pageContract);
        const artifact = await browser.prepareExistingDraftMedia(plan, observation, capabilities);
        return { ok: true, operation, artifact, state: artifact.state };
    }
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
        const artifact = await packages.captureCandidate(await readInput(options));
        return { ok: true, operation, artifact, state: artifact.status };
    }
    if (operation === 'candidate qualify') {
        const input = await readInput(options);
        const artifact = await packages.qualifyCandidate(input.candidate_id, {
            ...(input.novelty_hint === undefined ? {} : { novelty_hint: input.novelty_hint })
        });
        return { ok: true, operation, artifact, state: artifact.status };
    }
    if (operation === 'package build') {
        const input = await readInput(options);
        const artifact = await packages.buildPackage(input.candidate, input.package);
        return { ok: true, operation, artifact, state: artifact.status };
    }
    if (operation === 'package review') {
        const input = await readInput(options);
        const artifact = await packages.reviewPackage(input.package);
        return { ok: true, operation, artifact, state: artifact.package.status, findings: artifact.report.findings };
    }
    if (operation === 'package freeze') {
        const input = await readInput(options);
        const artifact = await packages.freezePackage(input.package);
        return { ok: true, operation, artifact, state: artifact.package.status };
    }
    if (operation.startsWith('publication bundle ')) {
        const roadmaps = new ResearchRoadmapService(store);
        const backlog = new ResearchBacklogService(store, roadmaps);
        const weeks = new WeeklyResearchCycleService(store, roadmaps, backlog);
        const bundles = new PublicationBundleService(store, weeks);
        if (operation === 'publication bundle plan') {
            const artifact = await bundles.plan(await readInput(options));
            return { ok: true, operation, artifact, state: 'planned' };
        }
        if (operation === 'publication bundle audit') {
            const { bundle_id } = await readInput(options);
            return { ok: true, operation, artifact: await bundles.audit(bundle_id), state: 'planned' };
        }
        if (operation === 'publication bundle approve') {
            const artifact = await bundles.approve(await readInput(options));
            return { ok: true, operation, artifact, state: 'approved' };
        }
        if (operation === 'publication bundle article-authorization') {
            const { bundle_id } = await readInput(options);
            const artifact = await bundles.articleAuthorization(bundle_id);
            return { ok: true, operation, artifact, state: 'article_authorized' };
        }
        if (operation === 'publication bundle bind-article-execution') {
            const artifact = await bundles.bindArticleExecution(await readInput(options));
            return { ok: true, operation, artifact, state: 'article_in_progress' };
        }
        if (operation === 'publication bundle attach-article-receipt') {
            const artifact = await bundles.attachArticleReceipt(await readInput(options));
            return { ok: true, operation, artifact, state: artifact.phase };
        }
        if (operation === 'publication bundle materialize-single') {
            const { bundle_id } = await readInput(options);
            const artifact = await bundles.materializeSingle(bundle_id);
            return { ok: true, operation, artifact, state: 'single_materialized' };
        }
        if (operation === 'publication bundle single-authorization') {
            const { bundle_id } = await readInput(options);
            const artifact = await bundles.singleAuthorization(bundle_id);
            return { ok: true, operation, artifact, state: 'single_authorized' };
        }
        if (operation === 'publication bundle bind-single-execution') {
            const artifact = await bundles.bindSingleExecution(await readInput(options));
            return { ok: true, operation, artifact, state: 'single_in_progress' };
        }
        if (operation === 'publication bundle attach-single-receipt') {
            const artifact = await bundles.attachSingleReceipt(await readInput(options));
            return {
                ok: true,
                operation,
                artifact,
                state: 'phase' in artifact ? artifact.phase : artifact.status
            };
        }
        if (operation === 'publication bundle status') {
            const { bundle_id } = await readInput(options);
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
        const outcomes = new WeeklyOutcomeService(store, roadmaps, backlog, weeks);
        const compiler = new WeeklyPackageCompiler(store);
        if (operation === 'program roadmap create') {
            const artifact = await roadmaps.create(await readInput(options));
            return { ok: true, operation, artifact, state: 'created' };
        }
        if (operation === 'program roadmap revise') {
            const artifact = await roadmaps.revise(await readInput(options));
            return { ok: true, operation, artifact, state: 'revised' };
        }
        if (operation === 'program roadmap status') {
            const input = await readInput(options);
            const artifact = await roadmaps.current(input.roadmap_id);
            return { ok: true, operation, artifact, state: 'current' };
        }
        if (operation === 'program backlog add') {
            const artifact = await backlog.add(await readInput(options));
            return { ok: true, operation, artifact, state: artifact.availability };
        }
        if (operation === 'program backlog revise') {
            const artifact = await backlog.revise(await readInput(options));
            return { ok: true, operation, artifact, state: artifact.availability };
        }
        if (operation === 'program backlog status') {
            const input = await readInput(options);
            const artifact = await backlog.catalog(input.roadmap_id);
            return { ok: true, operation, artifact, state: 'current' };
        }
        if (operation === 'program backlog rebuild') {
            const input = await readInput(options);
            const artifact = await backlog.rebuildCatalog(input.roadmap_id);
            return { ok: true, operation, artifact, state: 'rebuilt' };
        }
        if (operation === 'program month review') {
            const artifact = await reviews.create(await readInput(options));
            return { ok: true, operation, artifact, state: 'reviewed' };
        }
        if (operation === 'program month status') {
            const input = await readInput(options);
            const artifact = await reviews.status(input.month_id);
            return { ok: true, operation, artifact, state: artifact === null ? 'not_started' : 'reviewed' };
        }
        if (operation === 'program status') {
            const input = await readInput(options);
            const artifact = await programStatus.status(input.roadmap_id);
            return { ok: true, operation, artifact, state: artifact.next_action };
        }
        if (operation === 'program week open') {
            const artifact = await weeks.open(await readInput(options));
            return { ok: true, operation, artifact, state: 'opened' };
        }
        if (operation === 'program week submit-candidates') {
            const artifact = await weeks.submitCandidates(await readInput(options));
            return { ok: true, operation, artifact, state: 'candidates_submitted' };
        }
        if (operation === 'program week select') {
            const artifact = await weeks.select(await readInput(options));
            return { ok: true, operation, artifact, state: 'topic_selected' };
        }
        if (operation === 'program week cancel') {
            const artifact = await weeks.cancel(await readInput(options));
            return { ok: true, operation, artifact, state: artifact.phase };
        }
        if (operation === 'program week compile-package') {
            const artifact = await compiler.compile(await readInput(options));
            return { ok: true, operation, artifact, state: artifact.status };
        }
        if (operation === 'program week status') {
            const input = await readInput(options);
            const artifact = await weeks.status(input.cycle_id);
            return { ok: true, operation, artifact, state: artifact.phase };
        }
        if (operation === 'program week outcome assemble') {
            const artifact = await outcomes.assemble(await readInput(options));
            return { ok: true, operation, artifact, state: 'outcome_created' };
        }
        if (operation === 'program week outcome status') {
            const { cycle_id } = await readInput(options);
            const artifact = await outcomes.status(cycle_id);
            return { ok: true, operation, artifact, state: artifact.phase };
        }
        if (operation === 'program week outcome resume') {
            const artifact = await outcomes.resume(await readInput(options));
            return { ok: true, operation, artifact, state: artifact.phase };
        }
        throw new HarnessError('CONTRACT_INVALID', `unknown operation: ${operation}`);
    }
    if (operation.startsWith('research ')) {
        const bridge = new WeeklyResearchBridgeService(store);
        const synthesis = new ResearchSynthesisService(store);
        if (operation === 'research bridge assemble') {
            const artifact = await bridge.assemble(await readInput(options));
            return { ok: true, operation, artifact, state: artifact.phase };
        }
        if (operation === 'research bridge status') {
            const { cycle_id } = await readInput(options);
            const artifact = await bridge.status(cycle_id);
            return { ok: true, operation, artifact, state: artifact.phase };
        }
        if (operation === 'research bridge resume') {
            const artifact = await bridge.resume(await readInput(options));
            return { ok: true, operation, artifact, state: artifact.phase };
        }
        if (operation === 'research synthesis plan') {
            const artifact = await synthesis.plan(await readInput(options));
            return { ok: true, operation, artifact, state: 'planned' };
        }
        if (operation === 'research synthesis record') {
            const artifact = await synthesis.record(await readInput(options));
            return { ok: true, operation, artifact, state: artifact.disposition };
        }
        if (operation === 'research synthesis status') {
            const { synthesis_id } = await readInput(options);
            const artifact = await synthesis.status(synthesis_id);
            return { ok: true, operation, artifact, state: artifact.phase };
        }
        if (operation === 'research continuation propose') {
            const artifact = await synthesis.proposeContinuation(await readInput(options));
            return { ok: true, operation, artifact, state: 'proposed' };
        }
        if (operation === 'research continuation status') {
            const input = await readInput(options);
            const artifact = await synthesis.continuationStatus(input.synthesis_id, input.proposal_id);
            return { ok: true, operation, artifact, state: 'proposed' };
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
        const promotion = new MemoryPromotionService(store, (runtime ?? unavailableIngestRuntime), {
            profile_path: assets.profilePath,
            mapping_path: assets.mappingPath,
            scp_paths: [
                assets.harnessScpPath, assets.articleScpPath,
                assets.xScpPath, assets.synthesisScpPath
            ]
        });
        const progressive = new ProgressiveResearchQueryService(store, (runtime ?? unavailableProgressiveRuntime));
        const indexMaintenance = new ResearchIndexMaintenanceService(store, (runtime ?? unavailableProgressiveRuntime));
        const terminalHooks = new ResearchTerminalHooks(store);
        const researchImport = new ResearchImportService(store);
        const ingest = new MemoryIngestService(store, (runtime ?? unavailableIngestRuntime), {
            profile_path: assets.profilePath,
            mapping_path: assets.mappingPath,
            scp_paths: [
                assets.harnessScpPath, assets.articleScpPath,
                assets.xScpPath, assets.synthesisScpPath
            ]
        });
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
            const artifact = await evidence.capture(await readInput(options));
            return { ok: true, operation, artifact, state: 'evidence_captured' };
        }
        if (operation === 'memory evidence status') {
            const input = await readInput(options);
            const artifact = await evidence.status(input.evidence_snapshot_id);
            return { ok: true, operation, artifact, state: artifact.state };
        }
        if (operation === 'memory terminal-hook status') {
            const input = await readInput(options);
            const artifact = await terminalHooks.status(input.event_id);
            return { ok: true, operation, artifact, state: artifact.status };
        }
        if (operation === 'memory terminal-hook resume') {
            const input = await readInput(options);
            const artifact = await terminalHooks.resume(input.event_id);
            return { ok: true, operation, artifact, state: artifact.status };
        }
        if (operation === 'memory import inspect') {
            const artifact = await researchImport.inspect(await readInput(options));
            return { ok: true, operation, artifact, state: 'inspected' };
        }
        if (operation === 'memory import capture') {
            const artifact = await researchImport.capture(await readInput(options));
            return { ok: true, operation, artifact, state: 'evidence_captured' };
        }
        if (operation === 'memory import propose') {
            const input = await readInput(options);
            const artifact = await researchImport.propose(input.manifest, input.evidence_snapshot_id);
            return { ok: true, operation, artifact, state: 'delta_proposed' };
        }
        if (operation === 'memory increment assemble') {
            const artifact = await increments.assemble(await readInput(options));
            return { ok: true, operation, artifact, state: 'working' };
        }
        if (operation === 'memory increment status') {
            const input = await readInput(options);
            const artifact = await increments.status(input.increment_id);
            return { ok: true, operation, artifact, state: artifact.state };
        }
        if (operation === 'memory lineage show') {
            const input = await readInput(options);
            const artifact = await increments.lineage(input.increment_id);
            return { ok: true, operation, artifact, state: artifact.state };
        }
        if (operation === 'memory delta propose') {
            const artifact = await deltas.propose(await readInput(options));
            return { ok: true, operation, artifact, state: 'delta_proposed' };
        }
        if (operation === 'memory delta review') {
            const input = await readInput(options);
            const artifact = await deltas.review(input.delta_id, input.review);
            return { ok: true, operation, artifact, state: 'reviewed' };
        }
        if (operation === 'memory promotion plan') {
            requireMemoryRuntime(runtime);
            const input = await readInput(options);
            const artifact = await promotion.plan(input.delta_id, input.review_id);
            return { ok: true, operation, artifact, state: 'planned' };
        }
        if (operation === 'memory promotion approve') {
            const input = await readInput(options);
            const artifact = await promotion.approve(input.plan_id, input.confirmed_plan_digest, input.approved_by, input.ttl_ms);
            return { ok: true, operation, artifact, state: 'approved' };
        }
        if (operation === 'memory promotion execute') {
            requireMemoryRuntime(runtime);
            const input = await readInput(options);
            const artifact = await promotion.execute(input.plan_id, input.approval);
            return { ok: true, operation, artifact, state: artifact.status };
        }
        if (operation === 'memory promotion status') {
            const input = await readInput(options);
            const artifact = await promotion.status(input.plan_id);
            return { ok: true, operation, artifact, state: artifact.phase };
        }
        if (operation === 'memory promotion resume') {
            requireMemoryRuntime(runtime);
            const input = await readInput(options);
            const artifact = await promotion.resume(input.plan_id, input.approval);
            return { ok: true, operation, artifact, state: artifact.status };
        }
        if (operation === 'memory query plan') {
            const raw = await readInput(options);
            if ('track_id' in raw) {
                const artifact = await progressive.plan(raw);
                return { ok: true, operation, artifact, state: 'planned' };
            }
            const input = raw;
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
            const input = await readInput(options);
            if (await store.exists(`memory/queries-v2/${input.query_id}/plan.json`)) {
                const artifact = await progressive.execute(input.query_id);
                return { ok: true, operation, artifact, state: artifact.query_status };
            }
            const artifact = await query.executeQuery(input.query_id);
            return { ok: true, operation, artifact, state: artifact.status };
        }
        if (operation === 'memory query review') {
            const input = await readInput(options);
            const artifact = await progressive.review(input.query_id, {
                selected_context_refs: input.selected_context_refs,
                reviewer: input.reviewer, reviewed_at: input.reviewed_at
            });
            return { ok: true, operation, artifact, state: 'reviewed' };
        }
        if (operation === 'memory query status') {
            const input = await readInput(options);
            if (await store.exists(`memory/queries-v2/${input.query_id}/plan.json`)) {
                const artifact = await progressive.status(input.query_id);
                return { ok: true, operation, artifact, state: artifact.phase };
            }
            const artifact = await query.queryStatus(input.query_id);
            return { ok: true, operation, artifact, state: artifact.state };
        }
        if (operation === 'memory query bind-package') {
            const raw = await readInput(options);
            const queryId = raw.query_id;
            if (await store.exists(`memory/queries-v2/${queryId}/plan.json`)) {
                const input = raw;
                const artifact = await progressive.bindPackage(input.query_id, input.package);
                return { ok: true, operation, artifact, state: artifact.memory_context.status };
            }
            const input = raw;
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
            const input = await readInput(options);
            const artifact = await indexMaintenance.doctor(input.track_id);
            return { ok: true, operation, artifact, state: artifact.status };
        }
        if (operation === 'memory index rebuild-plan') {
            requireMemoryRuntime(runtime);
            const input = await readInput(options);
            const artifact = await indexMaintenance.rebuildPlan(input.track_id);
            return { ok: true, operation, artifact, state: 'planned' };
        }
        if (operation === 'memory feedback capture') {
            const raw = await readInput(options);
            const artifact = await feedback.capture({ ...raw, observed_at: new Date(raw.observed_at) });
            return { ok: true, operation, artifact, state: 'feedback_captured' };
        }
        if (operation === 'memory feedback review') {
            const input = await readInput(options);
            const artifact = await store.readJson(`feedback/${input.feedback_snapshot_id}/snapshot.json`);
            return { ok: true, operation, artifact, state: 'feedback_captured' };
        }
        if (operation === 'memory insight propose') {
            const artifact = await insight.propose(await readInput(options));
            return { ok: true, operation, artifact, state: 'insight_proposed' };
        }
        if (operation === 'memory insight review') {
            const input = await readInput(options);
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
            const input = await readInput(options);
            const artifact = input.ingest_kind === 'feedback_insight'
                ? await ingest.planFeedbackInsight(input)
                : await ingest.planPublicationCheckpoint(input);
            return { ok: true, operation, artifact, state: 'ingest_previewed' };
        }
        if (operation === 'memory ingest approve') {
            const input = await readInput(options);
            const artifact = await ingest.approve(input.ingest_id, input.approved_by, input.ttl_ms);
            return { ok: true, operation, artifact, state: 'ingest_approved' };
        }
        if (operation === 'memory ingest execute') {
            requireMemoryRuntime(runtime);
            const input = await readInput(options);
            const artifact = await ingest.execute(input.ingest_id, input.approval);
            return { ok: true, operation, artifact, state: artifact.status };
        }
        if (operation === 'memory ingest status') {
            const input = await readInput(options);
            const artifact = await ingest.status(input.ingest_id);
            return { ok: true, operation, artifact, state: artifact.state };
        }
        if (operation === 'memory ingest resume') {
            requireMemoryRuntime(runtime);
            const input = await readInput(options);
            const artifact = await ingest.resume(input.ingest_id, input.approval);
            return { ok: true, operation, artifact, state: artifact.status };
        }
    }
    const articleInput = options.input === undefined ? undefined : await readInput(options);
    if (operation.startsWith('article ')) {
        const article = new ArticleService(store, {
            ...(options.runId === undefined ? {} : { runId: () => options.runId })
        });
        if (operation === 'article prepare') {
            const input = articleInput;
            const artifact = await article.prepareArticle(input.package, input.brief);
            return { ok: true, operation, artifact, state: 'generation_ready' };
        }
        if (operation === 'article accept-draft') {
            const input = articleInput;
            const artifact = await article.acceptArticleDraft(requiredRunId(options, input), input.draft);
            return { ok: true, operation, artifact, state: 'drafted' };
        }
        const runId = requiredRunId(options, articleInput);
        if (operation === 'article review') {
            const artifact = await article.reviewArticle(runId);
            if (!artifact.passed) {
                const privacy = artifact.findings.some((finding) => ['WINDOWS_PRIVATE_PATH', 'UNIX_PRIVATE_PATH', 'BEARER_TOKEN', 'COOKIE_VALUE'].includes(finding.code));
                throw new HarnessError(privacy ? 'PRIVACY_GATE_BLOCKED' : 'EVIDENCE_GATE_BLOCKED', 'article review contains blocking findings', artifact.findings);
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
            const value = articleInput;
            const visual = value.visual ?? articleInput;
            return { ok: true, operation, artifact: await article.attachVisual(runId, visual), state: 'reviewed' };
        }
        if (operation === 'article visual remove') {
            const value = articleInput;
            await article.removeVisual(runId, value.candidate_id);
            return { ok: true, operation, artifact: { candidate_id: value.candidate_id, removed: true }, state: 'reviewed' };
        }
        if (operation === 'article visual review') {
            const value = articleInput;
            return { ok: true, operation, artifact: await article.reviewVisual(runId, value.review ?? articleInput), state: 'reviewed' };
        }
        if (operation === 'article handoff-x') {
            const value = articleInput;
            return { ok: true, operation, artifact: await article.createXHandoff(runId, value?.asset_id), state: 'finalized' };
        }
    }
    if (operation.startsWith('x-article ')) {
        const input = articleInput;
        if (operation === 'x-article fast-path audit') {
            validateExactOptions(operation, providedOptions, ['input']);
            const value = input;
            const artifact = await new XArticleService(store).planFastPath(value.package_ref, value.target_account, value.draft_target);
            return { ok: true, operation, artifact, state: 'confirmation_pending' };
        }
        if (operation === 'x-article fast-path confirm') {
            validateExactOptions(operation, providedOptions, ['input']);
            const value = input;
            assertXArticleFastPathAudit(value.audit);
            const artifact = confirmXArticleFastPath(value.audit, value.confirmed_by, value.ttl_ms);
            await store.writeNew(`runs/${value.audit.publication_plan.run_id}/x-article/fast-path-confirmation-v1.json`, artifact);
            return { ok: true, operation, artifact, state: 'confirmed' };
        }
        if (operation === 'x-article plan') {
            const value = input;
            const artifact = await new XArticleService(store).plan(value.package_ref, value.target_account);
            return { ok: true, operation, artifact, state: 'approval_pending' };
        }
        if (operation === 'x-article approve') {
            const value = input;
            const artifact = approveXArticlePublication(value.plan, value.approved_by, value.ttl_ms);
            await store.writeNew(`approvals/${artifact.approval_id}.json`, artifact);
            return { ok: true, operation, artifact, state: 'approved' };
        }
        const executionId = options.executionId ?? input?.execution_id;
        const browser = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), operation === 'x-article browser start' && executionId !== undefined
            ? { executionId: () => executionId }
            : {});
        if (operation === 'x-article fast-path prepare') {
            validateOptionsWithOptional(operation, providedOptions, ['audit', 'confirmation', 'capabilities', 'release-set'], ['observation']);
            const audit = await readJsonFile(options.audit, 'Fast Path Audit');
            assertXArticleFastPathAudit(audit);
            const confirmation = validateContract('x-article-fast-path-confirmation', await readJsonFile(options.confirmation, 'Fast Path confirmation'));
            const capabilities = await readJsonFile(options.capabilities, 'capabilities');
            assertCapabilityManifest(capabilities);
            const releaseSet = await readJsonFile(options.releaseSet, 'Fast Path release set');
            assertXArticleFastPathReleaseSet(releaseSet);
            const sourceObservation = options.observation === undefined
                ? undefined
                : validateContract('x-article-browser-observation', await readJsonFile(options.observation, 'existing Draft observation'));
            const artifact = await browser.prepareFastPath({
                audit,
                confirmation,
                capabilities,
                release_set: releaseSet,
                ...(sourceObservation === undefined ? {} : { source_observation: sourceObservation })
            });
            return { ok: true, operation, artifact, state: artifact.state };
        }
        if (operation === 'x-article fast-path status') {
            validateExactOptions(operation, providedOptions, ['execution']);
            const id = requiredStableExecutionId(options);
            const browserStatus = await browser.status(id);
            if (browserStatus.fast_path_status === undefined) {
                throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'execution is not a Fast Path execution');
            }
            const context = await store.readJson(`runs/${id}/x-article/browser/adapter-context.json`);
            assertXArticlePublicationPlan(context.plan);
            if (!Number.isFinite(Date.parse(context.fast_path.started_at))
                || (context.fast_path.time_budget_seconds !== 600
                    && context.fast_path.time_budget_seconds !== 900)
                || (context.fast_path.recovery_count !== 0 && context.fast_path.recovery_count !== 1)) {
                throw new HarnessError('CONTRACT_INVALID', 'Fast Path status binding is invalid');
            }
            const resultPath = `runs/${id}/x-article/browser/fast-path-result-v1.json`;
            const result = await store.exists(resultPath)
                ? verifyXArticleFastPathResult(await store.readJson(resultPath))
                : null;
            const checkpointPath = `runs/${id}/x-article/browser/materialization-checkpoint.json`;
            const checkpoint = await store.exists(checkpointPath)
                ? validateContract('x-article-materialization-checkpoint', await store.readJson(checkpointPath))
                : null;
            const verifiedInlineAlt = checkpoint?.media.filter((entry) => entry.status === 'completed'
                && entry.observed_media_ref !== null
                && entry.observed_context_digest !== null).length ?? 0;
            const elapsedSeconds = result?.elapsed_seconds ?? Math.max(0, (Date.now() - Date.parse(context.fast_path.started_at)) / 1000);
            const artifact = {
                execution_id: id,
                stage: browserStatus.fast_path_status.stage,
                timed_out: browserStatus.fast_path_status.timed_out,
                elapsed_seconds: elapsedSeconds,
                cover: browserStatus.fast_path_status.cover,
                inline_images: browserStatus.fast_path_status.inline_images,
                alt: result === null
                    ? `${verifiedInlineAlt}/${context.plan.intent.visuals.length}`
                    : `${result.alt.verified}/${result.alt.expected}`,
                recovery_count: context.fast_path.recovery_count,
                terminal_state: browserStatus.state,
                draft_url: browserStatus.draft_id === null
                    ? null
                    : `https://x.com/compose/articles/edit/${browserStatus.draft_id}`,
                evidence_paths: {
                    checkpoint: checkpoint === null ? null : checkpointPath,
                    result: result === null ? null : resultPath
                }
            };
            return { ok: true, operation, artifact, state: browserStatus.state };
        }
        if (operation === 'x-article fast-path recover') {
            validateExactOptions(operation, providedOptions, ['execution']);
            const artifact = await browser.recoverFastPath(requiredStableExecutionId(options));
            return { ok: true, operation, artifact, state: artifact.snapshot.state };
        }
        if (operation === 'x-article browser prepare') {
            validateExactOptions(operation, providedOptions, ['plan', 'capabilities']);
            const plan = await readJsonFile(options.plan, 'plan');
            const capabilitiesValue = await readJsonFile(options.capabilities, 'capabilities');
            assertCapabilityManifest(capabilitiesValue);
            const artifact = await browser.prepare(plan, capabilitiesValue);
            return { ok: true, operation, artifact, state: artifact.state };
        }
        if (operation === 'x-article browser start') {
            const value = input;
            const snapshot = await browser.start(value.plan, value.approval, value.capability_manifest);
            const artifact = { ...snapshot, capability_manifest: value.capability_manifest };
            return { ok: true, operation, artifact, state: snapshot.state };
        }
        if (operation === 'x-article browser next') {
            const artifact = await browser.next(requiredExecutionId(options));
            return { ok: true, operation, artifact, state: artifact.snapshot.state };
        }
        if (operation === 'x-article browser claim') {
            const id = requiredExecutionId(options);
            const commandId = requiredCommandId(options);
            const command = await store.readJson(`runs/${id}/x-article/browser/commands/${commandId}/command.json`);
            const artifact = await browser.claim(command);
            return { ok: true, operation, artifact, state: (await browser.status(id)).state };
        }
        if (operation === 'x-article browser report') {
            const artifact = await browser.report(input);
            return { ok: true, operation, artifact, state: artifact.state };
        }
        if (operation === 'x-article browser status') {
            const artifact = await browser.status(requiredExecutionId(options));
            return { ok: true, operation, artifact, state: artifact.state };
        }
        if (operation === 'x-article browser resume-editor') {
            validateResumeEditorOptions(operation, providedOptions);
            const artifact = await browser.resumeEditor(requiredStableExecutionId(options, true));
            return { ok: true, operation, artifact, state: artifact.state };
        }
        if (operation === 'x-article browser confirm-publish') {
            validateExactOptions(operation, providedOptions, ['execution', 'confirmation']);
            const id = requiredStableExecutionId(options);
            const confirmation = validateContract('x-article-publish-confirmation', await readJsonFile(options.confirmation, 'confirmation'));
            const artifact = await browser.confirmPublish(id, confirmation);
            return { ok: true, operation, artifact, state: artifact.state };
        }
        if (operation === 'x-article browser refresh-approval') {
            const value = input;
            const artifact = await browser.refreshApproval(requiredExecutionId(options), value.approval);
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
            ...(options.runId === undefined ? {} : { runId: () => options.runId })
        });
        const input = options.input === undefined ? undefined : await readInput(options);
        const executions = new ExecutionStore(store);
        const broker = new CommandBroker(store, executions);
        const browser = new BrowserAdapter(store, executions, broker, new XWeb202608Contract());
        if (operation === 'x browser prune') {
            const artifact = await pruneBrowserArtifacts(store);
            return { ok: true, operation, artifact, state: 'pruned' };
        }
        if (operation === 'x browser start') {
            const start = input;
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
            const artifact = await browser.report(executionId, input);
            return { ok: true, operation, artifact, state: artifact.state };
        }
        if (operation === 'x browser status') {
            const artifact = await browser.status(requiredExecutionId(options));
            return { ok: true, operation, artifact, state: artifact.snapshot.state };
        }
        if (operation === 'x browser resume-pre-submit') {
            const artifact = await browser.resumePreSubmit(requiredExecutionId(options));
            return { ok: true, operation, artifact, state: artifact.state };
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
            const prepare = input;
            return { ok: true, operation, artifact: await x.prepareX(prepare.package, prepare.brief), state: 'generation_ready' };
        }
        if (operation === 'x accept-draft') {
            const accept = input;
            return { ok: true, operation, artifact: await x.acceptXDraft(requiredRunId(options, accept), accept.draft), state: 'drafted' };
        }
        if (operation === 'x approve') {
            const approve = input;
            const artifact = approve.plan.schema_version === '2.1'
                ? approvePublicationV2_1(approve.plan, approve.approved_by, approve.ttl_ms)
                : approve.plan.schema_version === '2.0'
                    ? approvePublicationV2(approve.plan, approve.approved_by, approve.ttl_ms)
                    : approvePublication(approve.plan, approve.approved_by, approve.ttl_ms);
            await store.writeNew(`approvals/${artifact.approval_id}.json`, artifact);
            return { ok: true, operation, artifact, state: 'approved' };
        }
        if (operation === 'x handoff') {
            const handoff = input;
            const artifact = await new ManualAdapter(store).handoff(handoff.plan, handoff.approval);
            return { ok: true, operation, artifact, state: 'handed_off' };
        }
        if (operation === 'x record-manual') {
            const record = input;
            const artifact = await new ManualAdapter(store).recordPublished(record.receipt, record.public_result);
            return { ok: true, operation, artifact, state: 'finalized' };
        }
        if (operation === 'x record-observed') {
            const record = input;
            const artifact = await new ManualAdapter(store).recordObserved(record.plan, record.observation);
            return { ok: true, operation, artifact, state: artifact.status };
        }
        const runId = requiredRunId(options, input);
        if (operation === 'x review') {
            const artifact = await x.reviewX(runId);
            if (!artifact.passed) {
                const characters = artifact.findings.some((finding) => finding.code === 'CHARACTER_LIMIT_EXCEEDED');
                throw new HarnessError(characters ? 'CHARACTER_LIMIT_EXCEEDED' : 'EVIDENCE_GATE_BLOCKED', 'X review contains blocking findings', artifact.findings);
            }
            return { ok: true, operation, artifact, state: 'reviewed', findings: artifact.findings };
        }
        if (operation === 'x plan') {
            const handoff = input?.article_handoff;
            const visual = input?.single_visual;
            if (visual !== undefined && options.adapter !== 'browser') {
                throw new HarnessError('CONTRACT_INVALID', 'single_visual requires the browser Plan format');
            }
            const artifact = options.adapter === 'browser'
                ? visual !== undefined
                    ? await x.planXBrowser(runId, handoff, visual)
                    : handoff === undefined
                        ? await x.planXBrowser(runId)
                        : await x.planXBrowser(runId, handoff)
                : await x.planX(runId);
            return { ok: true, operation, artifact, state: 'approval_pending' };
        }
    }
    throw new HarnessError('CONTRACT_INVALID', `unknown operation: ${operation || '(empty)'}`);
}
function exitCode(error) {
    if (error instanceof HarnessError) {
        const contractCodes = ['CONTRACT_INVALID'];
        const gateCodes = [
            'RESEARCH_GATE_BLOCKED',
            'EVIDENCE_GATE_BLOCKED',
            'PRIVACY_GATE_BLOCKED',
            'PUBLISH_GATE_BLOCKED',
            'CHARACTER_LIMIT_EXCEEDED'
        ];
        const stateCodes = [
            'STATE_TRANSITION_INVALID',
            'APPROVAL_STALE',
            'COMMAND_REPLAY_REJECTED',
            'STALE_PAGE_REVISION',
            'EXECUTION_BUSY',
            'SUBMIT_ALREADY_ATTEMPTED'
        ];
        if (contractCodes.includes(error.code))
            return 2;
        if (gateCodes.includes(error.code))
            return 3;
        if (stateCodes.includes(error.code))
            return 4;
        return 5;
    }
    if (error.code !== undefined) {
        return 5;
    }
    return 10;
}
async function main() {
    let operation = operationFromArgv(process.argv.slice(2));
    try {
        const result = await execute(process.argv.slice(2));
        process.stdout.write(`${JSON.stringify(result)}\n`);
    }
    catch (error) {
        if (error instanceof HarnessError && operation.length === 0) {
            operation = 'unknown';
        }
        const code = error instanceof HarnessError
            ? error.code
            : error.code ?? 'UNEXPECTED';
        const message = error instanceof HarnessError
            ? error.message
            : 'operation failed';
        process.stdout.write(`${JSON.stringify({ ok: false, operation, error: { code, message } })}\n`);
        process.exitCode = exitCode(error);
    }
}
function operationFromArgv(argv) {
    const positional = [];
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (token.startsWith('--')) {
            index += 1;
            continue;
        }
        positional.push(token);
    }
    return positional.join(' ');
}
await main();
//# sourceMappingURL=index.js.map