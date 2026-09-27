import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { XArticleBrowserAdapter } from '../harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.js';
import { computeXArticlePageRevision } from '../harnesses/research-publishing/adapters/x/article-browser/article-browser-protocol.js';
import { createXArticleImportTemplate } from '../harnesses/research-publishing/adapters/x/article-browser/article-import-template.js';
import { XArticleWeb2026_08Contract } from '../harnesses/research-publishing/adapters/x/article-browser/contracts/x-article-web-2026-08.js';
import { createXArticlePublicationPreflight } from '../harnesses/research-publishing/branches/x-article-harness/article-publication-preflight.js';
import { sha256 } from '../harnesses/research-publishing/core/digest.js';
import { confirmXArticleFastPath, createXArticleFastPathAudit } from '../harnesses/research-publishing/core/x-article-fast-path.js';
import { createXArticlePublicationPlan } from '../harnesses/research-publishing/core/x-article-publication-plan.js';
import { WorkspaceStore } from '../harnesses/research-publishing/core/workspace-store.js';
const protocol = 'x-article-materialization/v3.4';
const hostProtocol = 'x-article-host-bridge/v3.5';
const releaseSet = {
    harness_protocol: protocol,
    registry_protocol: protocol,
    skill_protocol: protocol,
    browser_host_protocol: protocol
};
const capabilities = {
    executor: 'codex-chrome',
    executor_version: 'fast-path-acceptance-host',
    browser_family: 'chrome',
    capabilities: [
        'observe_article_page', 'create_article_draft', 'set_article_title',
        'import_article_document', 'replace_article_visual_anchor', 'upload_article_cover',
        'open_article_preview', 'open_publish_review', 'publish_article_once'
    ],
    observed_at: '2026-08-29T00:00:00.000Z'
};
const draftId = '2092851979932647424';
const editorialMetadata = 'Status: X Article Draft (v0.1) · Derived from a longer evidence note · Evidence review date: 2026-08-25';
let hostBridgeRunner = null;
async function loadHostBridge() {
    hostBridgeRunner ??= import(pathToFileURL(resolve('skills/x-publishing-copilot/scripts/x-article-host-bridge.mjs')).href).then((loaded) => {
        if (typeof loaded.runXArticleHostBridge !== 'function') {
            throw new Error('X Article Host Bridge acceptance runtime is incompatible');
        }
        return loaded.runXArticleHostBridge;
    });
    return hostBridgeRunner;
}
function asset(id, suffix) {
    return {
        asset_id: id,
        relative_path: `assets/${id}.png`,
        digest: sha256({ id, suffix }),
        mime_type: 'image/png',
        alt_text: `Approved Alt for ${id}.`,
        claim_refs: [`claim:${id}`]
    };
}
function fixture(inlineCount, suffix) {
    const cover = asset(`cover_${suffix}`, suffix);
    const blocks = [{
            kind: 'paragraph',
            runs: [{ text: 'Domain semantics belong in the Skill.', marks: [], link: null }]
        }];
    const visuals = [{ asset: cover, placement: { kind: 'cover' } }];
    for (let index = 0; index < inlineCount; index += 1) {
        const inline = asset(`inline_${suffix}_${index + 1}`, suffix);
        blocks.push({ kind: 'image', asset_id: inline.asset_id, alt_text: inline.alt_text });
        visuals.push({ asset: inline, placement: { kind: 'block', block_ordinal: blocks.length } });
        blocks.push({
            kind: 'paragraph',
            runs: [{ text: `Evidence-backed explanation ${index + 1}.`, marks: [], link: null }]
        });
    }
    blocks.push({
        kind: 'paragraph',
        runs: [{ text: editorialMetadata, marks: ['italic'], link: null }]
    });
    const rawDocument = {
        schema_version: '1.0',
        title: `Fast Path acceptance ${suffix}`,
        cover_asset_id: cover.asset_id,
        blocks
    };
    const preflight = createXArticlePublicationPreflight({ document: rawDocument, visuals });
    const plan = createXArticlePublicationPlan({
        planId: `plan_fast_path_${suffix}`,
        runId: `run_fast_path_${suffix}`,
        targetAccount: '@Glen56121',
        articlePackage: {
            root: `articles/fast-path/${suffix}`,
            digest: sha256({ suffix, inlineCount, kind: 'package' })
        },
        document: preflight.sanitized_document,
        visuals,
        plannedAt: '2026-08-29T00:00:00.000Z',
        provenance: { fixture: 'x-article-fast-path-acceptance' }
    });
    return { plan, preflight };
}
function observation(executionId, commandId, document, resolvedInline, coverCompleted, preserveEmptyImportState = false, observedAt = '2026-08-29T00:01:00.000Z') {
    const template = createXArticleImportTemplate(document);
    const unresolved = template.anchors.filter((anchor) => !resolvedInline.has(anchor.asset_id));
    const visualByAsset = new Map(template.anchors.map((anchor) => [anchor.asset_id, anchor]));
    const altByAsset = new Map(document.blocks.flatMap((block) => block.kind === 'image' ? [[block.asset_id, block.alt_text]] : []));
    const visuals = [
        ...(coverCompleted ? [{
                ref: 'cover', asset_id: document.cover_asset_id, kind: 'cover',
                block_ordinal: null, alt_text: null, status: 'uploaded',
                owned_by_execution: true
            }] : []),
        ...[...resolvedInline].map((assetId) => {
            const anchor = visualByAsset.get(assetId);
            return {
                ref: `visual_${assetId}`, asset_id: assetId, kind: 'inline',
                block_ordinal: anchor.block_ordinal, alt_text: altByAsset.get(assetId),
                status: 'uploaded', owned_by_execution: true
            };
        })
    ];
    const input = {
        schema_version: '1.0', observation_id: `obs_${commandId}`,
        execution_id: executionId, command_id: commandId, origin: 'https://x.com',
        canonical_url: `https://x.com/compose/articles/edit/${draftId}`,
        observed_at: observedAt, account_handle: '@Glen56121',
        page_kind: 'article_editor',
        controls: [
            { ref: 'title', role: 'textbox', name: 'Add a title', test_id: null, disabled: false },
            { ref: 'body', role: 'textbox', name: '', test_id: 'composer', disabled: false },
            { ref: 'preview', role: 'link', name: 'Preview', test_id: null, disabled: false }
        ],
        editor: {
            draft_id: draftId,
            title: document.title,
            blocks: document.blocks.filter((block) => block.kind !== 'image' || resolvedInline.has(block.asset_id)),
            visuals,
            has_unknown_content: false,
            autosave_state: 'saved',
            import_state: unresolved.length === 0 && !preserveEmptyImportState ? null : {
                template_digest: template.template_digest,
                source_document_digest: template.source_document_digest,
                unresolved_anchors: unresolved
            }
        },
        preview: null, publish_review: null, public_article: null
    };
    return {
        ...input,
        page_revision: computeXArticlePageRevision(input)
    };
}
class FakeDraftPage {
    plan;
    resolvedInline = new Set();
    writes = new Map();
    coverCompleted = false;
    constructor(plan) {
        this.plan = plan;
    }
    execute(command) {
        if (command.kind === 'upload_article_cover') {
            const assetId = command.payload.kind === 'upload_article_cover'
                ? command.payload.asset.asset_id : 'invalid-cover';
            this.writes.set(assetId, (this.writes.get(assetId) ?? 0) + 1);
            this.coverCompleted = true;
        }
        else if (command.kind === 'replace_article_visual_anchor') {
            const assetId = command.payload.kind === 'replace_article_visual_anchor'
                ? command.payload.asset.asset_id : 'invalid-inline';
            this.writes.set(assetId, (this.writes.get(assetId) ?? 0) + 1);
            this.resolvedInline.add(assetId);
        }
        else if (command.kind !== 'observe_article_page' && command.kind !== 'navigate') {
            throw new Error(`Fast Path acceptance received forbidden command ${command.kind}`);
        }
        return observation(command.execution_id, command.command_id, this.plan.intent.document, this.resolvedInline, this.coverCompleted, !this.coverCompleted);
    }
}
function fakeHostDependencies(page) {
    const transaction = async (input) => ({
        status: 'success',
        effect: 'complete',
        reason: input.command.kind === 'upload_article_cover'
            ? 'cover_uploaded'
            : input.command.kind === 'replace_article_visual_anchor'
                ? 'inline_image_uploaded'
                : 'observation_captured',
        observation: page.execute(input.command),
        retry_authorized: false
    });
    return {
        runNavigate: transaction,
        runObserve: transaction,
        runCoverUpload: transaction,
        runInlineImageUpload: transaction
    };
}
async function runScenario(name, inlineCount, disconnect) {
    const started = performance.now();
    const workspace = await mkdtemp(join(tmpdir(), `rph-fast-path-${name}-`));
    try {
        const store = await WorkspaceStore.open(workspace);
        let commandNumber = 0;
        const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
            executionId: () => `execution_fast_path_acceptance_${name}`,
            commandId: () => `command_fast_path_acceptance_${name}_${++commandNumber}`,
            eventId: () => `event_fast_path_acceptance_${name}_${commandNumber}`,
            now: () => new Date('2026-08-29T00:01:00.000Z')
        });
        const { plan, preflight } = fixture(inlineCount, name);
        const audit = createXArticleFastPathAudit({
            preflight,
            publication_plan: plan,
            draft_target: { kind: 'existing', draft_id: draftId }
        });
        const confirmation = confirmXArticleFastPath(audit, 'human:Glen56121', 3_600_000, new Date('2026-08-29T00:00:00.000Z'));
        const page = new FakeDraftPage(plan);
        const source = observation('source', 'source_command', plan.intent.document, new Set(), false, true, '2026-08-29T00:00:00.000Z');
        const execution = await adapter.prepareFastPath({
            audit, confirmation, capabilities, release_set: releaseSet, source_observation: source
        });
        const commandKinds = [];
        const runHostBridge = await loadHostBridge();
        const hostDependencies = fakeHostDependencies(page);
        let hostDispatchCount = 0;
        let disconnected = false;
        let recoveryCount = 0;
        let terminalState = '';
        const trace = [];
        while (true) {
            const next = await adapter.next(execution.execution_id);
            if (next.command === null) {
                terminalState = next.snapshot.state;
                break;
            }
            const command = next.command;
            commandKinds.push(command.kind);
            const claim = await adapter.claim(command);
            const hostOutcome = await runHostBridge({
                tab: {},
                command,
                claim,
                context: { publication_plan: plan, materialization_plan: {} },
                previousObservation: source,
                beforeObservation: source,
                observationId: `host_observation_${command.command_id}`,
                observedAt: '2026-08-29T00:01:00.000Z',
                absoluteAssetPath: null,
                deadline: { exceeded: () => false },
                dependencies: hostDependencies
            });
            hostDispatchCount += 1;
            if (disconnect && !disconnected && command.kind === 'replace_article_visual_anchor') {
                disconnected = true;
                await adapter.report({
                    command,
                    status: 'uncertain',
                    host_reason: 'observation_unavailable_after_selection',
                    observation: null
                });
                const recovery = await adapter.recoverFastPath(execution.execution_id);
                recoveryCount = 1;
                commandKinds.push(recovery.command.kind);
                const recoveryClaim = await adapter.claim(recovery.command);
                const recoveryOutcome = await runHostBridge({
                    tab: {},
                    command: recovery.command,
                    claim: recoveryClaim,
                    context: { publication_plan: plan, materialization_plan: {} },
                    previousObservation: source,
                    observationId: `host_observation_${recovery.command.command_id}`,
                    observedAt: '2026-08-29T00:01:00.000Z',
                    absoluteAssetPath: null,
                    deadline: { exceeded: () => false },
                    dependencies: hostDependencies
                });
                hostDispatchCount += 1;
                const recoveredSnapshot = await adapter.report(recoveryOutcome.report);
                trace.push({ command: recovery.command.kind, state: recoveredSnapshot.state });
            }
            else {
                const reported = await adapter.report(hostOutcome.report);
                trace.push({ command: command.kind, state: reported.state });
            }
        }
        if (terminalState !== 'draft_reconciled') {
            const checkpointPath = `runs/${execution.execution_id}/x-article/browser/materialization-checkpoint.json`;
            const checkpoint = await store.exists(checkpointPath)
                ? await store.readJson(checkpointPath)
                : null;
            const events = await store.list(`runs/${execution.execution_id}/x-article/browser/events`);
            const lastEvent = events.length === 0 ? null : await store.readJson(events[events.length - 1].relative_path);
            const evidenceEntries = await store.list(`runs/${execution.execution_id}/x-article/browser/reconciliation-evidence`);
            const rejectionEvidence = evidenceEntries.length === 0
                ? null
                : await store.readJson(evidenceEntries[0].relative_path);
            throw new Error(`Fast Path stopped before reconciliation: ${JSON.stringify({
                name, terminal_state: terminalState, trace, checkpoint, last_event: lastEvent,
                rejection_evidence: rejectionEvidence
            })}`);
        }
        const result = await store.readJson(`runs/${execution.execution_id}/x-article/browser/fast-path-result-v1.json`);
        const duplicateUploads = [...page.writes.values()].filter((count) => count > 1)
            .reduce((total, count) => total + count - 1, 0);
        const elapsedSeconds = (performance.now() - started) / 1_000;
        const current = observation(execution.execution_id, 'final', plan.intent.document, page.resolvedInline, page.coverCompleted).editor;
        const forbiddenKinds = new Set([
            'open_article_preview',
            'open_publish_review',
            'publish_article_once'
        ]);
        const scenario = {
            name,
            ok: result.state === 'draft_reconciled'
                && result.cover.completed === 1
                && result.inline_images.completed === inlineCount
                && result.alt.verified === inlineCount
                && result.preview_command_count === 0
                && result.publish_command_count === 0
                && duplicateUploads === 0
                && hostDispatchCount === commandKinds.length
                && commandKinds.every((kind) => !forbiddenKinds.has(kind))
                && elapsedSeconds < 600,
            confirmation_count: 1,
            human_browser_operation_count: 0,
            terminal_state: result.state,
            elapsed_seconds: elapsedSeconds,
            cover: { ...result.cover, alt: 'unobservable' },
            inline_images: result.inline_images,
            alt: { expected: inlineCount, completed: result.alt.verified },
            removed_editorial_metadata_absent: !JSON.stringify(current.blocks).includes(editorialMetadata),
            visual_anchors_absent: current.import_state === null,
            recovery_count: recoveryCount,
            duplicate_draft_count: commandKinds.filter((kind) => kind === 'create_article_draft').length,
            duplicate_upload_count: duplicateUploads,
            duplicate_write_count: duplicateUploads,
            preview_command_count: result.preview_command_count,
            publish_command_count: result.publish_command_count,
            issued_command_kinds: commandKinds,
            host_dispatch_count: hostDispatchCount
        };
        return { ...scenario, ok: scenario.ok && scenario.removed_editorial_metadata_absent
                && scenario.visual_anchors_absent };
    }
    finally {
        const verified = resolve(workspace);
        if (resolve(verified, '..') !== resolve(tmpdir()) || !verified.includes('rph-fast-path-')) {
            throw new Error('refusing to remove unverified Fast Path acceptance workspace');
        }
        await rm(verified, { recursive: true, force: false });
    }
}
export async function runXArticleFastPathAcceptanceMatrix() {
    const scenarios = [];
    for (const count of [0, 1, 3, 10]) {
        scenarios.push(await runScenario(String(count), count, false));
    }
    scenarios.push(await runScenario('disconnect_recovery', 3, true));
    return {
        ok: scenarios.every((scenario) => scenario.ok),
        protocol,
        host_protocol: hostProtocol,
        network: 'unused',
        scenarios
    };
}
if (process.argv[1] !== undefined
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    process.stdout.write(`${JSON.stringify(await runXArticleFastPathAcceptanceMatrix())}\n`);
}
//# sourceMappingURL=x-article-fast-path-acceptance.js.map