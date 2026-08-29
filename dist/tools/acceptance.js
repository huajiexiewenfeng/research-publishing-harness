import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { ManualAdapter } from '../harnesses/research-publishing/adapters/x/manual/manual-adapter.js';
import { BrowserAdapter } from '../harnesses/research-publishing/adapters/x/browser/browser-adapter.js';
import { CommandBroker } from '../harnesses/research-publishing/adapters/x/browser/command-broker.js';
import { XWeb202608Contract } from '../harnesses/research-publishing/adapters/x/browser/contracts/x-web-2026-08.js';
import { XArticleBrowserAdapter } from '../harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.js';
import { computeXArticlePageRevision } from '../harnesses/research-publishing/adapters/x/article-browser/article-browser-protocol.js';
import { XArticleWeb2026_08Contract } from '../harnesses/research-publishing/adapters/x/article-browser/contracts/x-article-web-2026-08.js';
import { ArticleService } from '../harnesses/research-publishing/branches/article-harness/article-service.js';
import { XArticleService } from '../harnesses/research-publishing/branches/x-article-harness/x-article-service.js';
import { XService } from '../harnesses/research-publishing/branches/x-harness/x-service.js';
import { approvePublication } from '../harnesses/research-publishing/core/approval.js';
import { approvePublicationV2_1 } from '../harnesses/research-publishing/core/approval-v2-1.js';
import { approveXArticlePublication } from '../harnesses/research-publishing/core/x-article-approval.js';
import { CanonicalDocumentService } from '../harnesses/research-publishing/core/canonical-document-service.js';
import { sha256, sha256Bytes } from '../harnesses/research-publishing/core/digest.js';
import { ExecutionStore } from '../harnesses/research-publishing/core/execution-store.js';
import { MemoryFeedbackService } from '../harnesses/research-publishing/core/memory-feedback-service.js';
import { MemoryIngestService } from '../harnesses/research-publishing/core/memory-ingest-service.js';
import { MemoryInsightService } from '../harnesses/research-publishing/core/memory-insight-service.js';
import { MemoryQueryService } from '../harnesses/research-publishing/core/memory-query-service.js';
import { MemoryPromotionService } from '../harnesses/research-publishing/core/memory-promotion-service.js';
import { ProgressiveResearchQueryService } from '../harnesses/research-publishing/core/progressive-research-query-service.js';
import { PackageService } from '../harnesses/research-publishing/core/package-service.js';
import { ResearchEvidenceService } from '../harnesses/research-publishing/core/research-evidence-service.js';
import { ResearchFlywheelService } from '../harnesses/research-publishing/core/research-flywheel-service.js';
import { ResearchIncrementService } from '../harnesses/research-publishing/core/research-increment-service.js';
import { ResearchIndexProjector } from '../harnesses/research-publishing/core/research-index-projector.js';
import { createPublicationExpression } from '../harnesses/research-publishing/core/research-memory-contracts.js';
import { renderResearchRecord } from '../harnesses/research-publishing/core/research-record-renderer.js';
import { ResearchTerminalHooks } from '../harnesses/research-publishing/core/research-terminal-hooks.js';
import { SemanticDeltaService } from '../harnesses/research-publishing/core/semantic-delta-service.js';
import { WorkspaceStore } from '../harnesses/research-publishing/core/workspace-store.js';
const examples = resolve(import.meta.dirname, '../harnesses/research-publishing/examples/synthetic');
async function fixture(name) {
    return JSON.parse(await readFile(join(examples, name), 'utf8'));
}
const workspace = await mkdtemp(join(tmpdir(), 'research-publishing-acceptance-'));
let articleComplete = false;
let manualXComplete = false;
let browserXComplete = false;
let xArticleComplete = false;
let memoryQueryComplete = false;
let publicationCheckpointComplete = false;
let feedbackInsightComplete = false;
let memoryResumeComplete = false;
let researchEvidenceFoundationComplete = false;
let researchPromotionComplete = false;
let progressiveQueryComplete = false;
let promotionResumeComplete = false;
let packageBindingComplete = false;
let terminalHookResumeComplete = false;
let publicationFlywheelComplete = false;
let submitCommands = 0;
let submitClaims = 0;
let xArticlePublishCommands = 0;
let xArticleImportCommands = 0;
let xArticleAnchorReplacementCommands = 0;
const xArticleAnchorReplacementOrdinals = [];
const browserAt = '2026-08-18T16:00:00.000Z';
const browserManifest = {
    executor: 'codex-chrome', executor_version: 'acceptance-fake-host', browser_family: 'chrome',
    capabilities: ['observe_page', 'navigate', 'click', 'set_text', 'press_key', 'wait'],
    observed_at: browserAt
};
function accountNode() {
    return {
        ref: 'account', role: 'button', name: 'Account menu', text: '@runtime_ai',
        test_id: 'SideNav_AccountSwitcher_Button', editable: false, disabled: false, parent_ref: null
    };
}
function composerNodes(values) {
    return [
        accountNode(),
        ...values.map((text, index) => ({
            ref: `item_${index + 1}`, role: 'textbox', name: 'Post text', text,
            test_id: `tweetTextarea_${index}`, editable: true, disabled: false, parent_ref: null
        })),
        {
            ref: 'add', role: 'button', name: 'Add post', text: 'Add post', test_id: 'addButton',
            editable: false, disabled: false, parent_ref: null
        },
        {
            ref: 'submit', role: 'button', name: 'Post all', text: 'Post all', test_id: 'tweetButton',
            editable: false, disabled: values.some((value) => value.length === 0), parent_ref: null
        }
    ];
}
function observed(command, url, nodes, posts = [], composerAttachments = []) {
    return {
        schema_version: '2.0', observation_id: `obs_${command.command_id}`,
        execution_id: command.execution_id, command_id: command.command_id,
        origin: 'https://x.com', canonical_url: url, observed_at: browserAt,
        nodes, public_posts: posts, composer_attachments: composerAttachments
    };
}
async function browserReport(adapter, command, observation, status = 'success') {
    await adapter.claim(command.execution_id, command.command_id);
    await adapter.report(command.execution_id, {
        schema_version: '2.0', execution_id: command.execution_id, command_id: command.command_id,
        status, observation, error_code: null, reported_at: browserAt
    });
}
function articleObserved(command, value) {
    const input = {
        schema_version: '1.0', observation_id: `obs_${command.command_id}`,
        execution_id: command.execution_id, command_id: command.command_id,
        origin: 'https://x.com', observed_at: browserAt, account_handle: '@runtime_ai',
        controls: [], editor: null, preview: null, publish_review: null, public_article: null,
        ...value
    };
    return { ...input, page_revision: computeXArticlePageRevision(input) };
}
async function articleReport(adapter, command, value) {
    await adapter.claim(command);
    await adapter.report({ command, status: 'success', observation: articleObserved(command, value) });
}
try {
    const store = await WorkspaceStore.open(workspace);
    const packages = new PackageService(store, () => new Date('2026-08-18T13:00:00.000Z'));
    const candidate = await fixture('candidate.json');
    await packages.captureCandidate(candidate);
    const qualified = await packages.qualifyCandidate(candidate.candidate_id, {
        novelty_hint: candidate.novelty_hint
    });
    const built = await packages.buildPackage(qualified, await fixture('package.json'));
    const reviewed = await packages.reviewPackage(built);
    const frozen = await packages.freezePackage(reviewed.package);
    const articles = new ArticleService(store, {
        runId: () => 'acceptance_article',
        now: () => new Date('2026-08-18T14:00:00.000Z')
    });
    const articleRun = await articles.prepareArticle(frozen.package, {
        articleType: 'architecture_note',
        primaryAudience: 'AI Agent and AI Infra developers',
        language: 'en',
        targetDepth: 'deep',
        includeOpenQuestions: true
    });
    const inlineVisualSpecs = [
        {
            slotId: 'runtime-boundary-inline', candidateId: 'candidate_runtime_boundary',
            assetId: 'asset_runtime_boundary', sectionId: 'runtime-boundary',
            altText: 'Runtime boundary diagram.', claimRefs: ['claim_contract_test']
        },
        {
            slotId: 'research-hypothesis-inline', candidateId: 'candidate_research_hypothesis',
            assetId: 'asset_research_hypothesis', sectionId: 'research-hypothesis',
            altText: 'Research hypothesis diagram.', claimRefs: ['claim_runtime_hypothesis']
        },
        {
            slotId: 'planned-work-inline', candidateId: 'candidate_planned_work',
            assetId: 'asset_planned_work', sectionId: 'planned-work',
            altText: 'Planned work diagram.', claimRefs: ['claim_trace_planned']
        }
    ];
    const sectionIds = ['runtime-boundary', 'research-hypothesis', 'planned-work'];
    const articleDraft = {
        ...(await fixture('article-draft.json')),
        run_id: articleRun.run_id,
        sections: (await fixture('article-draft.json')).sections.map((section, index) => ({ ...section, section_id: sectionIds[index] })),
        visual_slots: [{
                slot_id: 'cover', placement: { kind: 'cover' }, purpose: 'cover',
                required: true, brief: 'Show one evidence-backed runtime boundary.', claim_refs: ['claim_contract_test']
            }, ...inlineVisualSpecs.map((visual) => ({
                slot_id: visual.slotId,
                placement: { kind: 'after_section', section_id: visual.sectionId },
                purpose: 'explanation', required: true, brief: visual.altText,
                claim_refs: visual.claimRefs
            }))]
    };
    await articles.acceptArticleDraft(articleRun.run_id, articleDraft);
    const articleReview = await articles.reviewArticle(articleRun.run_id);
    const visualSource = join(workspace, 'acceptance-visual.png');
    await writeFile(visualSource, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
    const visualCandidate = await articles.attachVisual(articleRun.run_id, {
        candidateId: 'candidate_cover', assetId: 'asset_cover', slotId: 'cover',
        sourcePath: visualSource, altText: 'One evidence-backed runtime boundary.',
        claimRefs: ['claim_contract_test'], provenance: { method: 'generated', tool: 'acceptance-synthetic' }
    });
    const inlineVisualCandidates = [];
    for (const visual of inlineVisualSpecs) {
        inlineVisualCandidates.push(await articles.attachVisual(articleRun.run_id, {
            candidateId: visual.candidateId, assetId: visual.assetId, slotId: visual.slotId,
            sourcePath: visualSource, altText: visual.altText, claimRefs: visual.claimRefs,
            provenance: { method: 'generated', tool: 'acceptance-synthetic' }
        }));
    }
    await articles.reviewVisual(articleRun.run_id, {
        selectedCandidates: {
            cover: visualCandidate.candidate_id,
            ...Object.fromEntries(inlineVisualCandidates.map((candidate) => [
                candidate.slot_id, candidate.candidate_id
            ]))
        },
        reviewedBy: 'acceptance-reviewer',
        claimAlignment: true, boundaryAlignment: true, mobileLegibility: true,
        singleMessage: true, privacyReview: true
    });
    const canonical = await articles.finalizeArticle(articleRun.run_id);
    const articleHandoff = await articles.createXHandoff(articleRun.run_id, 'asset_cover');
    articleComplete =
        articleReview.passed &&
            canonical.artifacts.includes(`${canonical.root}/visual-manifest.json`) &&
            canonical.artifacts.includes(`${canonical.root}/assets/asset_cover.png`) &&
            inlineVisualSpecs.every((visual) => canonical.artifacts.includes(`${canonical.root}/assets/${visual.assetId}.png`)) &&
            articleHandoff.article_digest === canonical.digest &&
            articleHandoff.visual_asset?.asset_id === 'asset_cover';
    const xArticles = new XArticleService(store, {
        runId: () => 'acceptance_x_article', planId: () => 'plan_acceptance_x_article',
        now: () => new Date(browserAt)
    });
    const xArticlePlan = await xArticles.plan(canonical, '@runtime_ai');
    const xArticleApproval = approveXArticlePublication(xArticlePlan, 'acceptance-reviewer', 60_000, new Date(browserAt), () => 'approval_acceptance_x_article');
    let xArticleEvent = 0;
    let xArticleCommand = 0;
    const xArticleAdapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
        executionId: () => 'exec_acceptance_x_article',
        eventId: () => `event_acceptance_x_article_${++xArticleEvent}`,
        commandId: () => `command_acceptance_x_article_${++xArticleCommand}`,
        attemptId: () => 'attempt_acceptance_x_article',
        receiptId: () => 'receipt_acceptance_x_article',
        now: () => new Date(browserAt)
    });
    const xArticleExecution = await xArticleAdapter.start(xArticlePlan, xArticleApproval, {
        executor: 'codex-chrome', executor_version: 'acceptance-fake-host', browser_family: 'chrome',
        capabilities: [
            'observe_article_page', 'create_article_draft', 'set_article_title',
            'import_article_document', 'replace_article_visual_anchor',
            'upload_article_cover', 'insert_article_block', 'insert_article_image',
            'set_article_image_alt', 'open_article_preview', 'open_publish_review',
            'publish_article_once'
        ], observed_at: browserAt
    });
    const xArticleDraftId = '2090731994279755776';
    let xArticleTitle = '';
    let xArticleBlocks = [];
    let xArticleVisuals = [];
    let xArticleImportState = null;
    const xArticleCommandKinds = [];
    const editorControls = [
        { ref: 'title', role: 'textbox', name: 'Add a title', test_id: null, disabled: false },
        { ref: 'body', role: 'textbox', name: '', test_id: 'composer', disabled: false },
        { ref: 'preview', role: 'link', name: 'Preview', test_id: null, disabled: false },
        { ref: 'publish', role: 'button', name: 'Publish', test_id: null, disabled: false }
    ];
    while (true) {
        const step = await xArticleAdapter.next(xArticleExecution.execution_id);
        if (step.command === null) {
            if (step.snapshot.state === 'finalized')
                break;
            throw new Error(`X Article acceptance stalled in ${step.snapshot.state}`);
        }
        const command = step.command;
        xArticleCommandKinds.push(command.kind);
        if (command.kind === 'observe_article_page' && command.payload.kind === 'observe_article_page') {
            if (command.payload.scope === 'index') {
                await articleReport(xArticleAdapter, command, {
                    canonical_url: 'https://x.com/compose/articles', page_kind: 'articles_index',
                    controls: [{ ref: 'create', role: 'button', name: 'create', test_id: null, disabled: false }]
                });
            }
            else if (command.payload.scope === 'public_article') {
                const articleId = '2091000000000000000';
                const publicVisuals = xArticleVisuals.map((visual) => ({ ...visual, owned_by_execution: false }));
                await articleReport(xArticleAdapter, command, {
                    canonical_url: `https://x.com/runtime_ai/article/${articleId}`, page_kind: 'public_article',
                    public_article: {
                        article_id: articleId, canonical_url: `https://x.com/runtime_ai/article/${articleId}`,
                        author_handle: '@runtime_ai', title: xArticleTitle, blocks: xArticleBlocks,
                        visuals: publicVisuals, published_at: browserAt
                    }
                });
            }
            else {
                throw new Error(`unexpected Article observation scope ${command.payload.scope}`);
            }
            continue;
        }
        if (command.kind === 'create_article_draft') {
            await articleReport(xArticleAdapter, command, {
                canonical_url: `https://x.com/compose/articles/edit/${xArticleDraftId}`, page_kind: 'article_editor',
                controls: editorControls,
                editor: { draft_id: xArticleDraftId, title: xArticleTitle, blocks: xArticleBlocks, visuals: xArticleVisuals, import_state: xArticleImportState, has_unknown_content: false, autosave_state: 'saved' }
            });
            continue;
        }
        if (command.kind === 'set_article_title')
            xArticleTitle = command.payload.kind === 'set_article_title' ? command.payload.title : xArticleTitle;
        if (command.kind === 'import_article_document' && command.payload.kind === 'import_article_document') {
            xArticleImportCommands += 1;
            xArticleImportState = {
                template_digest: command.payload.template.template_digest,
                source_document_digest: command.payload.template.source_document_digest,
                unresolved_anchors: command.payload.template.anchors
            };
            xArticleBlocks = xArticlePlan.intent.document.blocks.filter((block) => block.kind !== 'image');
        }
        if (command.kind === 'replace_article_visual_anchor' &&
            command.payload.kind === 'replace_article_visual_anchor') {
            const nextAnchor = xArticleImportState?.unresolved_anchors[0];
            if (nextAnchor === undefined || nextAnchor.anchor_id !== command.payload.anchor.anchor_id) {
                throw new Error('X Article acceptance Host received an out-of-order visual anchor replacement');
            }
            xArticleAnchorReplacementCommands += 1;
            xArticleAnchorReplacementOrdinals.push(command.payload.anchor.block_ordinal);
            const unresolvedAnchors = xArticleImportState.unresolved_anchors.slice(1);
            xArticleVisuals = [...xArticleVisuals, {
                    ref: `image_${command.payload.anchor.block_ordinal}`,
                    asset_id: command.payload.asset.asset_id, kind: 'inline',
                    block_ordinal: command.payload.anchor.block_ordinal,
                    alt_text: command.payload.asset.alt_text, status: 'uploaded', owned_by_execution: true
                }];
            if (unresolvedAnchors.length === 0) {
                xArticleImportState = null;
                xArticleBlocks = xArticlePlan.intent.document.blocks;
            }
            else {
                xArticleImportState = { ...xArticleImportState, unresolved_anchors: unresolvedAnchors };
                const unresolvedOrdinals = new Set(unresolvedAnchors.map((anchor) => anchor.block_ordinal));
                xArticleBlocks = xArticlePlan.intent.document.blocks.filter((block, index) => block.kind !== 'image' || !unresolvedOrdinals.has(index + 1));
            }
        }
        if (command.kind === 'upload_article_cover' && command.payload.kind === 'upload_article_cover') {
            xArticleVisuals = [{
                    ref: 'cover_acceptance', asset_id: command.payload.asset.asset_id, kind: 'cover',
                    block_ordinal: null, alt_text: null, status: 'uploaded', owned_by_execution: true
                }, ...xArticleVisuals];
        }
        if (command.kind === 'set_article_image_alt' && command.payload.kind === 'set_article_image_alt') {
            const altText = command.payload.alt_text;
            const visualRef = command.payload.visual_ref;
            xArticleVisuals = xArticleVisuals.map((visual) => visual.ref === visualRef ? { ...visual, alt_text: altText } : visual);
        }
        if (command.kind === 'insert_article_block' && command.payload.kind === 'insert_article_block') {
            xArticleBlocks = [...xArticleBlocks, command.payload.block];
        }
        if (command.kind === 'insert_article_image' && command.payload.kind === 'insert_article_image') {
            xArticleBlocks = [
                ...xArticleBlocks,
                xArticlePlan.intent.document.blocks[command.payload.block_ordinal - 1]
            ];
            xArticleVisuals = [...xArticleVisuals, {
                    ref: `image_${command.payload.block_ordinal}`, asset_id: command.payload.asset.asset_id,
                    kind: 'inline', block_ordinal: command.payload.block_ordinal, alt_text: command.payload.asset.alt_text,
                    status: 'uploaded', owned_by_execution: true
                }];
        }
        if (command.kind === 'open_article_preview') {
            await articleReport(xArticleAdapter, command, {
                canonical_url: `https://x.com/compose/articles/edit/${xArticleDraftId}/preview`, page_kind: 'article_preview',
                controls: [{ ref: 'publish', role: 'button', name: 'Publish', test_id: null, disabled: false }],
                preview: { draft_id: xArticleDraftId, title: xArticleTitle, blocks: xArticleBlocks, visuals: xArticleVisuals }
            });
            continue;
        }
        if (command.kind === 'open_publish_review') {
            await articleReport(xArticleAdapter, command, {
                canonical_url: `https://x.com/compose/articles/edit/${xArticleDraftId}/preview`, page_kind: 'publish_review',
                controls: [{ ref: 'publish_final', role: 'button', name: 'Publish', test_id: null, disabled: false }],
                publish_review: { draft_id: xArticleDraftId, audience: 'everyone', final_publish_ref: 'publish_final' }
            });
            continue;
        }
        if (command.kind === 'publish_article_once') {
            xArticlePublishCommands += 1;
            await xArticleAdapter.claim(command);
            await xArticleAdapter.report({ command, status: 'uncertain', observation: null });
            await xArticleAdapter.resumeVerification(xArticleExecution.execution_id);
            continue;
        }
        await articleReport(xArticleAdapter, command, {
            canonical_url: `https://x.com/compose/articles/edit/${xArticleDraftId}`, page_kind: 'article_editor',
            controls: editorControls,
            editor: { draft_id: xArticleDraftId, title: xArticleTitle, blocks: xArticleBlocks, visuals: xArticleVisuals, import_state: xArticleImportState, has_unknown_content: false, autosave_state: 'saved' }
        });
    }
    const xArticleStatus = await xArticleAdapter.status(xArticleExecution.execution_id);
    const xArticleReceipt = await store.readJson(xArticleStatus.latest_receipt_path);
    xArticleComplete =
        xArticleStatus.state === 'finalized' &&
            xArticleStatus.publish_command_count === 1 &&
            xArticlePublishCommands === 1 &&
            xArticleImportCommands === 1 &&
            xArticleAnchorReplacementCommands === 3 &&
            sha256(xArticleAnchorReplacementOrdinals) === sha256(xArticlePlan.intent.visuals.flatMap((visual) => visual.placement.kind === 'block' ? [visual.placement.block_ordinal] : [])) &&
            xArticleCommandKinds.filter((kind) => kind === 'insert_article_block').length === 0 &&
            xArticleCommandKinds.filter((kind) => kind === 'open_article_preview').length === 1 &&
            xArticleImportState === null &&
            sha256(xArticleBlocks) === sha256(xArticlePlan.intent.document.blocks) &&
            !JSON.stringify({ blocks: xArticleBlocks, visuals: xArticleVisuals }).includes('RPH_VISUAL_ANCHOR:') &&
            xArticleReceipt.status === 'published';
    const x = new XService(store, {
        runId: () => 'acceptance_x',
        now: () => new Date('2026-08-18T15:00:00.000Z')
    });
    const xRun = await x.prepareX(frozen.package, {
        contentType: 'anchor',
        format: 'thread',
        language: 'en',
        targetAccount: '@runtime_ai'
    });
    const xDraft = { ...(await fixture('x-draft.json')), run_id: xRun.run_id };
    await x.acceptXDraft(xRun.run_id, xDraft);
    const xReview = await x.reviewX(xRun.run_id);
    const plan = await x.planX(xRun.run_id);
    const approval = approvePublication(plan, 'acceptance-reviewer', 60_000, new Date('2026-08-18T15:00:10.000Z'));
    const manual = new ManualAdapter(store, {
        receiptId: () => 'receipt_acceptance_x',
        now: () => new Date('2026-08-18T15:00:20.000Z')
    });
    const receipt = await manual.handoff(plan, approval);
    const recorded = await manual.recordPublished(receipt, {
        url: 'https://x.com/runtime_ai/status/2000000000000000200',
        postIds: ['2000000000000000200', '2000000000000000201', '2000000000000000202'],
        publishedAt: '2026-08-18T15:10:00.000Z'
    });
    manualXComplete =
        xReview.passed &&
            receipt.status === 'handed_off' &&
            recorded.status === 'manual_recorded' &&
            recorded.verification_source === 'manual';
    const browserX = new XService(store, {
        runId: () => 'acceptance_browser_x',
        planId: () => 'plan_acceptance_browser_x',
        now: () => new Date(browserAt)
    });
    const browserRun = await browserX.prepareX(frozen.package, {
        contentType: 'anchor', format: 'thread', language: 'en', targetAccount: '@runtime_ai'
    });
    const browserDraft = { ...(await fixture('x-draft.json')), run_id: browserRun.run_id };
    await browserX.acceptXDraft(browserRun.run_id, browserDraft);
    const browserReview = await browserX.reviewX(browserRun.run_id);
    const browserPlan = await browserX.planXBrowser(browserRun.run_id, articleHandoff);
    if (browserPlan.schema_version !== '2.1')
        throw new Error('visual handoff did not create a V2.1 Plan');
    const browserApproval = approvePublicationV2_1(browserPlan, 'acceptance-reviewer', 60_000, new Date(browserAt), () => 'approval_acceptance_browser');
    let browserEvent = 0;
    let browserCommand = 0;
    const browserExecutions = new ExecutionStore(store, () => new Date(browserAt), () => `evt_acceptance_${++browserEvent}`);
    const browserBroker = new CommandBroker(store, browserExecutions, () => new Date(browserAt), () => `cmd_acceptance_${++browserCommand}`);
    const browserAdapter = new BrowserAdapter(store, browserExecutions, browserBroker, new XWeb202608Contract(), () => new Date(browserAt), () => 'attempt_acceptance_browser', () => 'receipt_acceptance_browser');
    await browserAdapter.start({
        execution_id: 'exec_acceptance_browser', plan: browserPlan,
        approval: browserApproval,
        capability_manifest: {
            ...browserManifest,
            capabilities: [...browserManifest.capabilities, 'file_upload', 'attachment_alt_text', 'upload_attachment', 'set_attachment_alt_text']
        }
    });
    let browserNext = (await browserAdapter.next('exec_acceptance_browser'));
    await browserReport(browserAdapter, browserNext, observed(browserNext, 'https://x.com/home', [accountNode()]));
    browserNext = (await browserAdapter.next('exec_acceptance_browser'));
    await browserReport(browserAdapter, browserNext, observed(browserNext, 'https://x.com/compose/post', composerNodes([''])));
    const browserTexts = browserPlan.items.map((item) => item.text);
    for (let index = 0; index < browserTexts.length; index += 1) {
        browserNext = (await browserAdapter.next('exec_acceptance_browser'));
        await browserReport(browserAdapter, browserNext, observed(browserNext, 'https://x.com/compose/post', composerNodes(browserTexts.slice(0, index + 1))));
        if (index < browserTexts.length - 1) {
            browserNext = (await browserAdapter.next('exec_acceptance_browser'));
            await browserReport(browserAdapter, browserNext, observed(browserNext, 'https://x.com/compose/post', composerNodes([
                ...browserTexts.slice(0, index + 1), ''
            ])));
        }
    }
    browserNext = (await browserAdapter.next('exec_acceptance_browser'));
    const attachment = {
        ref: 'attachment_acceptance', ordinal: 1, kind: 'image',
        mime_type: 'image/png', alt_text: null, status: 'uploaded',
        owned_by_execution: true
    };
    await browserReport(browserAdapter, browserNext, observed(browserNext, 'https://x.com/compose/post', composerNodes(browserTexts), [], [attachment]));
    browserNext = (await browserAdapter.next('exec_acceptance_browser'));
    const altAttachment = { ...attachment, alt_text: articleHandoff.visual_asset.alt_text };
    await browserReport(browserAdapter, browserNext, observed(browserNext, 'https://x.com/compose/post', composerNodes(browserTexts), [], [altAttachment]));
    browserNext = (await browserAdapter.next('exec_acceptance_browser'));
    await browserReport(browserAdapter, browserNext, observed(browserNext, 'https://x.com/compose/post', composerNodes(browserTexts), [], [altAttachment]));
    const submit = (await browserAdapter.next('exec_acceptance_browser'));
    await browserReport(browserAdapter, submit, null, 'uncertain');
    const publicPosts = browserTexts.map((text, index) => {
        const id = (800000000000000100n + BigInt(index)).toString();
        return {
            post_id: id, canonical_url: `https://x.com/runtime_ai/status/${id}`,
            author_handle: '@runtime_ai', text, links: [], published_at: browserAt,
            reply_to_id: index === 0 ? null : (800000000000000100n + BigInt(index - 1)).toString(),
            ...(index === 0 ? { media: [{ kind: 'image', alt_text: articleHandoff.visual_asset.alt_text, url: 'https://pbs.twimg.com/media/acceptance' }] } : {})
        };
    });
    browserNext = (await browserAdapter.next('exec_acceptance_browser'));
    await browserReport(browserAdapter, browserNext, observed(browserNext, publicPosts[0].canonical_url, [accountNode()], publicPosts));
    const browserStatus = await browserAdapter.status('exec_acceptance_browser');
    const visualReceipt = await store.readJson(browserStatus.latest_receipt_path);
    const browserPrefix = 'runs/acceptance_browser_x/x/browser/exec_acceptance_browser';
    for (const entry of await store.list(`${browserPrefix}/commands`)) {
        if (entry.kind !== 'file')
            continue;
        const persisted = await store.readJson(entry.relative_path);
        if (persisted.side_effect === 'submit')
            submitCommands += 1;
    }
    submitClaims = (await store.list(`${browserPrefix}/claims`)).filter((entry) => entry.name === `${submit.command_id}.json`).length;
    browserXComplete =
        browserReview.passed &&
            browserStatus.snapshot.state === 'finalized' &&
            browserStatus.snapshot.submit_command_count === 1 &&
            submitCommands === 1 &&
            submitClaims === 1 &&
            visualReceipt.schema_version === '2.1' &&
            visualReceipt.media_evidence.source_asset_verified &&
            visualReceipt.media_evidence.composer_attachment_verified &&
            visualReceipt.media_evidence.public_media_verified;
    const researchEvidencePath = 'packages/acceptance_research_evidence.md';
    const researchEvidenceText = '# Runtime boundary\n\nDeterministic access belongs in the Runtime.\n';
    await store.writeNew(researchEvidencePath, researchEvidenceText);
    const researchEvidence = await new ResearchEvidenceService(store, {
        evidenceSnapshotId: () => 'evidence_acceptance_foundation',
        now: () => new Date(browserAt)
    }).capture({
        increment_id: 'increment_acceptance_foundation', increment_revision: 1,
        capture_event: 'research_package_finalized', capture_kind: 'automatic_terminal',
        workspace_identity_digest: `sha256:${'a'.repeat(64)}`,
        artifacts: [{
                workspace_relative_path: researchEvidencePath, role: 'research_package',
                media_type: 'text/markdown', canonical: true, privacy_classification: 'internal'
            }],
        source_refs: ['acceptance:research-package'], privacy_classification: 'internal'
    });
    const canonicalDocuments = new CanonicalDocumentService(store);
    const canonicalProjection = await canonicalDocuments.project({
        document_id: 'document_acceptance_foundation', document_role: 'research_package',
        track_id: 'enterprise-agent-runtime',
        increment_ref: 'increment:enterprise-agent-runtime:increment_acceptance_foundation@1',
        artifact_ref: researchEvidence.artifact_refs[0], language: 'en'
    });
    if (canonicalProjection.status !== 'projected') {
        throw new Error('acceptance canonical research document was not projected');
    }
    const increment = await new ResearchIncrementService(store, {
        lifecycleEventId: () => 'event_acceptance_foundation',
        now: () => new Date(browserAt)
    }).assemble({
        increment_id: 'increment_acceptance_foundation', revision: 1,
        title: 'Runtime boundary', research_question: 'Where should deterministic access live?',
        thesis: 'Deterministic knowledge access belongs in the Runtime.',
        summary: 'Human-promoted acceptance summary for the Runtime boundary.',
        document_manifest_refs: [`document:${canonicalProjection.manifest.document_id}@${canonicalProjection.manifest.manifest_digest}`],
        tags: ['agent-runtime'], claim_refs: [], decision_refs: [], boundary_refs: [],
        open_question_refs: [], source_refs: ['acceptance:research-package'],
        evidence_snapshot_refs: [`evidence:${researchEvidence.evidence_snapshot_id}`], predecessor_refs: []
    });
    researchEvidenceFoundationComplete =
        increment.revision === 1 &&
            await canonicalDocuments.reconstruct(canonicalProjection.manifest) === researchEvidenceText;
    const promotionTarget = {
        frontmatter: { claim_id: 'claim_acceptance_promotion', version: 1, claim_status: 'observed' },
        body: '# Catalog-last promotion\n\nHuman-promoted acceptance claim.\n',
        variables: {
            research_track: 'enterprise-agent-runtime', claim_id: 'claim_acceptance_promotion', version: '1'
        },
        refs: {},
        index_entry: {
            ref: 'claim:claim_acceptance_promotion@1',
            record_path: 'domains/research-publishing/tracks/enterprise-agent-runtime/claims/claim_acceptance_promotion/versions/1.md',
            record_digest: `sha256:${'b'.repeat(64)}`, title: 'Catalog-last promotion',
            summary: 'Human-promoted acceptance claim.', tags: ['promotion'], category: 'semantic',
            claim_status: 'observed', lifecycle_status: 'accepted', evolution_target: null,
            updated_at: browserAt, accepted_at: browserAt, published_at: null,
            evidence_available: true, document_manifest_available: false
        }
    };
    const promotionDeltas = new SemanticDeltaService(store);
    const promotionDelta = await promotionDeltas.propose({
        delta_id: 'delta_acceptance_promotion',
        increment_ref: 'increment:enterprise-agent-runtime:increment_acceptance_foundation@1',
        base_catalog_digest: sha256({ catalog: null }),
        evidence_snapshot_refs: [`evidence:${researchEvidence.evidence_snapshot_id}`],
        proposed_operations: [{
                operation_id: 'op_acceptance_promotion', operation_type: 'add_record',
                target_id: 'claim_acceptance_promotion', record_type: 'claim_version',
                target_content: promotionTarget, target_content_digest: sha256(promotionTarget),
                evidence_refs: [`evidence:${researchEvidence.evidence_snapshot_id}`],
                evidence_privacy_classification: 'internal', target_privacy_classification: 'internal',
                index_impact: ['mainline', 'history']
            }],
        generated_by: 'acceptance', generated_at: browserAt, policy_version: 'semantic-promotion/v1'
    });
    const promotionReview = await promotionDeltas.review(promotionDelta.delta_id, {
        review_id: 'review_acceptance_promotion', accepted_operation_ids: ['op_acceptance_promotion'],
        rejected_operation_ids: [], rejection_reasons: [], operation_replacements: [],
        reviewer: 'acceptance-reviewer', reviewed_at: browserAt
    });
    let acceptanceCatalog = null;
    let promotionShardFailure = true;
    const promotionRuntimeCalls = [];
    const acceptancePromotionRuntime = {
        async version() { promotionRuntimeCalls.push('version'); return '0.2.0'; },
        async validateMapping() { promotionRuntimeCalls.push('validate_mapping'); return { status: 'ok' }; },
        async findCatalog() {
            promotionRuntimeCalls.push('find_catalog');
            return acceptanceCatalog === null
                ? { status: 'not_found' }
                : { status: 'found', ...acceptanceCatalog };
        },
        async copySource(input) {
            promotionRuntimeCalls.push('copy_source');
            return {
                status: 'ok', path: input.logical_path,
                checksum: sha256Bytes(await readFile(input.source))
            };
        },
        async writeRecord(input) {
            const checksum = sha256Bytes(await readFile(input.content_file));
            const recordType = input.record_type;
            promotionRuntimeCalls.push(`write_record:${recordType}`);
            if (recordType === 'research_index_shard' && promotionShardFailure) {
                promotionShardFailure = false;
                throw new Error('synthetic promotion shard failure');
            }
            const path = `acceptance/${recordType}.md`;
            if (recordType === 'research_index_catalog')
                acceptanceCatalog = { path, digest: checksum };
            return { status: 'ok', path, checksum };
        },
        async registerArtifact() { promotionRuntimeCalls.push('register_artifact'); return { status: 'ok' }; },
        async appendLog() { promotionRuntimeCalls.push('append_log'); return { status: 'ok', path: 'logs/research-promotion.jsonl' }; }
    };
    const promotionService = new MemoryPromotionService(store, acceptancePromotionRuntime, {
        profile_path: resolve('harnesses/research-publishing/memory/llm-wiki-profile.yml'),
        mapping_path: resolve('harnesses/research-publishing/memory/ingest-mapping.yml'),
        scp_paths: [
            resolve('harnesses/research-publishing/memory/scp.yml'),
            resolve('skills/article-publishing-copilot/scp.yml'),
            resolve('skills/x-publishing-copilot/scp.yml'),
            resolve('skills/research-synthesis-copilot/scp.yml')
        ]
    }, {
        planId: () => 'promotion_plan_acceptance', approvalId: () => 'promotion_approval_acceptance',
        receiptId: () => 'promotion_receipt_acceptance', now: () => new Date(browserAt)
    });
    const promotionPlan = await promotionService.plan(promotionDelta.delta_id, promotionReview.review_id);
    const promotionApproval = await promotionService.approve(promotionPlan.plan_id, promotionPlan.plan_digest, 'acceptance-reviewer', 60_000);
    const partialPromotionReceipt = await promotionService.execute(promotionPlan.plan_id, promotionApproval);
    const copiedBeforeResume = promotionRuntimeCalls.filter((call) => call === 'copy_source').length;
    const promotionReceipt = await promotionService.resume(promotionPlan.plan_id, promotionApproval);
    const observedCatalog = acceptanceCatalog;
    researchPromotionComplete =
        promotionReceipt.status === 'complete' &&
            observedCatalog?.digest === promotionPlan.expected_final_catalog_digest &&
            promotionRuntimeCalls.filter((call) => call.startsWith('write_record:')).at(-1) === 'write_record:research_index_catalog';
    promotionResumeComplete =
        partialPromotionReceipt.status === 'partial' &&
            promotionRuntimeCalls.filter((call) => call === 'copy_source').length === copiedBeforeResume;
    const queryRecordContent = renderResearchRecord({
        record_type: 'claim_version',
        frontmatter: { claim_id: 'claim_acceptance_query', version: 1, claim_status: 'observed' },
        body: '# Runtime boundary\n\nDeterministic knowledge access belongs in the Runtime.\n'
    });
    const queryRecordPath = 'domains/research-publishing/tracks/enterprise-agent-runtime/claims/claim_acceptance_query/versions/1.md';
    const queryRecordDigest = sha256Bytes(Buffer.from(queryRecordContent, 'utf8'));
    const queryProjection = new ResearchIndexProjector().project({
        track_id: 'enterprise-agent-runtime', prior_catalog: null,
        records: [{
                ref: 'claim:claim_acceptance_query@1', record_path: queryRecordPath,
                record_digest: queryRecordDigest, title: 'Runtime boundary',
                summary: 'Deterministic knowledge access belongs in the Runtime.', tags: ['runtime'],
                category: 'semantic', claim_status: 'observed', lifecycle_status: 'accepted',
                evolution_target: null, updated_at: browserAt, accepted_at: browserAt, published_at: null,
                evidence_available: true, document_manifest_available: false
            }]
    });
    const queryShard = queryProjection.shards.find((item) => item.record.view === 'mainline');
    const queryRuntimeContent = new Map([
        [queryProjection.catalog_path, queryProjection.catalog_content],
        [queryShard.path, queryShard.content],
        [queryRecordPath, queryRecordContent]
    ]);
    const queryRuntimeCalls = [];
    const progressiveQuery = new ProgressiveResearchQueryService(store, {
        async findRecords() {
            queryRuntimeCalls.push('find:catalog');
            return {
                status: 'found', record_type: 'research_index_catalog',
                matches: [{
                        path: queryProjection.catalog_path, checksum: queryProjection.catalog_content_digest,
                        identity: 'enterprise-agent-runtime:research', display: 'enterprise-agent-runtime:research', fields: {}
                    }]
            };
        },
        async loadPaths(input) {
            queryRuntimeCalls.push(`load:${input.paths.join(',')}`);
            const items = input.paths.map((path) => {
                const content = queryRuntimeContent.get(path);
                if (content === undefined)
                    throw new Error('acceptance exact Query path is missing');
                return {
                    path, checksum: sha256Bytes(Buffer.from(content, 'utf8')), content,
                    instruction_policy: 'data_only', sanitized: false, risk_flags: []
                };
            });
            return { status: 'loaded', runtime_version: '0.2.0', items, excluded_count: 0, truncated_count: 0 };
        }
    }, {
        snapshotId: () => 'snapshot_acceptance_progressive',
        reviewId: () => 'review_acceptance_progressive', now: () => new Date(browserAt)
    });
    const progressivePlan = await progressiveQuery.plan({
        query_id: 'query_acceptance_progressive', track_id: 'enterprise-agent-runtime',
        query_intent: 'Explain the Runtime boundary.', view: 'mainline', include_working: false,
        selection_terms: ['runtime', 'boundary'], selection_rationale: 'The accepted claim directly answers the question.',
        document_mode: 'none', catalog_ref: {
            path: queryProjection.catalog_path, digest: queryProjection.catalog_content_digest,
            generation: queryProjection.generation
        },
        selected_shard_refs: [{
                shard_id: queryShard.record.shard_id, path: queryShard.path, digest: queryShard.content_digest,
                generation: queryProjection.generation, view: 'mainline'
            }],
        selected_record_refs: [{
                ref: 'claim:claim_acceptance_query@1', path: queryRecordPath, digest: queryRecordDigest,
                evidence_refs: [], document_manifest_ref: null
            }],
        selected_manifest_refs: [], selected_chunk_refs: [], created_at: browserAt
    });
    const progressiveSnapshot = await progressiveQuery.execute(progressivePlan.query_id);
    const progressiveReview = await progressiveQuery.review(progressivePlan.query_id, {
        selected_context_refs: [progressiveSnapshot.context_items[0].context_ref],
        reviewer: 'acceptance-reviewer', reviewed_at: browserAt
    });
    if (frozen.package.schema_version === '1.2') {
        throw new Error('legacy acceptance package unexpectedly resolved to V1.2');
    }
    const packageDraftV1_1 = {
        ...frozen.package,
        schema_version: '1.1',
        status: 'draft',
        memory_context: {
            query_plan_digest: null, context_snapshot_digest: null, context_refs: [],
            status: 'not_configured', reviewer: null, reviewed_at: null
        }
    };
    const boundPackage = await progressiveQuery.bindPackage(progressivePlan.query_id, packageDraftV1_1);
    packageBindingComplete =
        boundPackage.memory_context.status === 'applied' &&
            boundPackage.memory_context.context_refs.includes(progressiveSnapshot.context_items[0].context_ref);
    progressiveQueryComplete =
        progressiveSnapshot.query_status === 'loaded' &&
            progressiveReview.snapshot_digest === progressiveSnapshot.snapshot_digest &&
            queryRuntimeCalls.length === 4 && queryRuntimeCalls.every((call) => !call.includes('**'));
    const memoryQuery = new MemoryQueryService(store, {
        async query() {
            return {
                status: 'loaded', runtime_version: '0.2.0',
                excluded_count: 0, truncated_count: 0,
                items: [{
                        path: 'domains/research-publishing/tracks/enterprise-agent-runtime/insights/acceptance.md',
                        checksum: `sha256:${'d'.repeat(64)}`,
                        content: 'A governed memory loop preserves provenance.',
                        instruction_policy: 'data_only', sanitized: false, risk_flags: []
                    }]
            };
        }
    }, {
        queryId: () => 'query_acceptance_memory', runId: () => 'run_acceptance_memory',
        snapshotId: () => 'snapshot_acceptance_memory', now: () => new Date(browserAt)
    });
    const memoryQueryPlan = await memoryQuery.planQuery({
        research_track: 'enterprise-agent-runtime', purpose: 'candidate_enrichment', query_terms: [],
        context_budget: { max_items: 4, max_chars: 8_000, max_item_chars: 2_000 },
        profile_digest: `sha256:${'e'.repeat(64)}`, scp_digest: `sha256:${'f'.repeat(64)}`
    });
    const memorySnapshot = await memoryQuery.executeQuery(memoryQueryPlan.query_id);
    const memoryReview = await memoryQuery.reviewContext(memoryQueryPlan.query_id, {
        selected_refs: [memorySnapshot.items[0].context_ref], reviewed_by: 'acceptance-reviewer',
        reviewed_at: new Date(browserAt)
    });
    memoryQueryComplete = memoryReview.status === 'applied';
    const memoryPublicationPath = 'receipts/acceptance_memory_publication.json';
    await store.writeNew(memoryPublicationPath, {
        receipt_id: 'publication_acceptance_memory', status: 'finalized', target_account: '@runtime_ai',
        public_result: { root_url: 'https://x.com/runtime_ai/status/900000000000000000' }
    });
    const memoryPublication = await store.resolveExistingArtifact(memoryPublicationPath);
    let appendLogFailure = false;
    const fakeMemoryRuntime = {
        async version() { return '0.2.0'; },
        async validateMapping() { return { status: 'ok', warnings: [], next_actions: [], context_refs: [] }; },
        async copySource() {
            return { status: 'ok', path: 'sources/originals/research-publishing/acceptance.json', checksum: `sha256:${'1'.repeat(64)}`, warnings: [], next_actions: [], context_refs: [] };
        },
        async writeRecord() {
            return { status: 'ok', path: 'domains/research-publishing/tracks/enterprise-agent-runtime/acceptance.md', checksum: `sha256:${'2'.repeat(64)}`, warnings: [], next_actions: [], context_refs: [] };
        },
        async registerArtifact() {
            return { status: 'ok', path: 'artifacts/index.json', checksum: `sha256:${'3'.repeat(64)}`, warnings: [], next_actions: [], context_refs: [] };
        },
        async appendLog() {
            if (appendLogFailure) {
                appendLogFailure = false;
                throw new Error('synthetic append failure');
            }
            return { status: 'ok', path: 'logs/research-publishing-memory-event.jsonl', checksum: `sha256:${'4'.repeat(64)}`, warnings: [], next_actions: [], context_refs: [] };
        }
    };
    let memoryIngestId = 0;
    let memoryApprovalId = 0;
    let memoryReceiptId = 0;
    const memoryIngest = new MemoryIngestService(store, fakeMemoryRuntime, {
        profile_path: resolve('harnesses/research-publishing/memory/llm-wiki-profile.yml'),
        mapping_path: resolve('harnesses/research-publishing/memory/ingest-mapping.yml'),
        scp_paths: [
            resolve('harnesses/research-publishing/memory/scp.yml'),
            resolve('skills/article-publishing-copilot/scp.yml'),
            resolve('skills/x-publishing-copilot/scp.yml'),
            resolve('skills/research-synthesis-copilot/scp.yml')
        ]
    }, {
        ingestId: () => `ingest_acceptance_${++memoryIngestId}`,
        approvalId: () => `approval_acceptance_${++memoryApprovalId}`,
        receiptId: () => `memory_receipt_acceptance_${++memoryReceiptId}`,
        now: () => new Date(browserAt)
    });
    const checkpointPlan = await memoryIngest.planPublicationCheckpoint({
        receipt_path: memoryPublicationPath, receipt_digest: memoryPublication.digest,
        research_track: 'enterprise-agent-runtime', publication_id: 'publication_acceptance_memory'
    });
    const checkpointApproval = await memoryIngest.approve(checkpointPlan.ingest_id, 'acceptance-reviewer', 60_000);
    const checkpointReceipt = await memoryIngest.execute(checkpointPlan.ingest_id, checkpointApproval);
    publicationCheckpointComplete = checkpointReceipt.status === 'succeeded';
    const acceptanceFeedback = await new MemoryFeedbackService(store, {
        feedbackSnapshotId: () => 'feedback_acceptance_memory'
    }).capture({
        receipt_path: memoryPublicationPath, receipt_digest: memoryPublication.digest,
        publication_kind: 'x_thread', public_url: 'https://x.com/runtime_ai/status/900000000000000000',
        account: '@runtime_ai', observed_at: new Date(browserAt), selection_actor: 'acceptance-reviewer',
        selection_reason: 'Synthetic counterexample selected by the acceptance Human gate.',
        entries: [{
                public_url: 'https://x.com/peer/status/900000000000000001', platform_id: '900000000000000001',
                author: '@peer', observed_text: 'Recovery needs explicit idempotency.', observed_metrics: { replies: 1 }
            }]
    });
    const acceptanceFeedbackPath = `feedback/${acceptanceFeedback.feedback_snapshot_id}/snapshot.json`;
    const acceptanceFeedbackArtifact = await store.resolveExistingArtifact(acceptanceFeedbackPath);
    const memoryInsights = new MemoryInsightService(store, { proposalId: () => 'insight_acceptance_memory' });
    const acceptanceInsight = await memoryInsights.propose({
        feedback_snapshot_path: acceptanceFeedbackPath,
        feedback_snapshot_digest: acceptanceFeedbackArtifact.digest,
        basis: 'observed_text', research_track: 'enterprise-agent-runtime', insight_type: 'counterexample',
        proposition: 'Recovery may need an explicit idempotency contract.',
        source_refs: ['feedback:feedback_acceptance_memory:1'], affected_claim_refs: [],
        evidence_strength: 'anecdotal', confidence: 0.4,
        boundary_note: 'Synthetic feedback is not production evidence.', alternative_explanations: ['Host retry policy.'],
        recommended_disposition: 'investigate', created_by_skill: 'x-publishing-copilot'
    });
    await memoryInsights.reviewInsight(acceptanceInsight.proposal_id, {
        reviewed_by: 'acceptance-reviewer', accepted: true, reason: 'Candidate only.',
        reviewed_at: new Date(browserAt)
    });
    const feedbackPlan = await memoryIngest.planFeedbackInsight({
        receipt_path: memoryPublicationPath, receipt_digest: memoryPublication.digest,
        feedback_snapshot_path: acceptanceFeedbackPath,
        feedback_snapshot_file_digest: acceptanceFeedbackArtifact.digest,
        proposal_ids: [acceptanceInsight.proposal_id], research_track: 'enterprise-agent-runtime',
        publication_id: 'publication_acceptance_memory', feedback_id: acceptanceFeedback.feedback_snapshot_id
    });
    const feedbackApproval = await memoryIngest.approve(feedbackPlan.ingest_id, 'acceptance-reviewer', 60_000);
    appendLogFailure = true;
    const partialFeedbackReceipt = await memoryIngest.execute(feedbackPlan.ingest_id, feedbackApproval);
    const resumedFeedbackReceipt = await memoryIngest.resume(feedbackPlan.ingest_id, feedbackApproval);
    feedbackInsightComplete = resumedFeedbackReceipt.status === 'succeeded';
    memoryResumeComplete =
        partialFeedbackReceipt.status === 'partial' &&
            partialFeedbackReceipt.resume_cursor === 'append_log' &&
            resumedFeedbackReceipt.resume_cursor === null;
    const foundationStatusPath = 'memory/increments/increment_acceptance_foundation/status.json';
    const foundationStatus = await store.readJson(foundationStatusPath);
    await store.replaceAtomic(foundationStatusPath, {
        ...foundationStatus, state: 'accepted', latest_event_seq: 2,
        latest_event_ref: `lifecycle:event_acceptance_promoted@${promotionReceipt.receipt_digest}`,
        updated_at: browserAt
    });
    const publicationExpression = createPublicationExpression({
        expression_id: 'expression_acceptance_thread',
        increment_ref: 'increment:enterprise-agent-runtime:increment_acceptance_foundation@1',
        channel: 'x_thread', language: 'en', derivation_type: 'adaptation',
        claim_refs: ['claim:claim_acceptance_promotion@1'], visual_refs: [],
        evidence_snapshot_refs: [`evidence:${researchEvidence.evidence_snapshot_id}`],
        intended_content: {
            approved_plan_ref: 'x/acceptance/plan.json', approved_plan_digest: sha256('acceptance-plan'),
            local_content_path: `${canonical.root}/article.md`, content_digest: sha256(canonical),
            expected_item_order: [1, 2], link_refs: [memoryPublicationPath], visual_refs: []
        },
        observed_content: {
            source: 'user_report', public_url: 'https://x.com/runtime_ai/status/900000000000000000',
            platform_ids: ['900000000000000000', '900000000000000002'],
            observed_digest: sha256(['acceptance-thread-1', 'acceptance-thread-2']),
            actual_item_order: [1, 2], media_verification: 'unverified', link_verification: 'matched',
            missing_content: [], unexpected_content: [], mismatches: []
        },
        verification_level: 'manual_recorded',
        platform_refs: ['https://x.com/runtime_ai/status/900000000000000000'],
        publication_receipt_ref: `receipt:${memoryPublicationPath}#${memoryPublication.digest}`,
        published_at: browserAt
    });
    const expressionPath = 'receipts/acceptance-publication-expression.json';
    await store.writeNew(expressionPath, publicationExpression);
    const expressionArtifact = await store.resolveExistingArtifact(expressionPath);
    let terminalCaptureFailure = true;
    const terminalHooks = new ResearchTerminalHooks(store, {
        now: () => new Date(browserAt),
        capture: async (event, snapshotId) => {
            if (terminalCaptureFailure) {
                terminalCaptureFailure = false;
                throw new Error('synthetic terminal Evidence failure');
            }
            return ResearchTerminalHooks.captureDefault(store, event, snapshotId, () => new Date(browserAt));
        }
    });
    const terminalEvent = {
        event_id: 'terminal_acceptance_publication', kind: 'publication_receipt_terminal',
        publication_kind: 'x_post',
        increment_id: 'increment_acceptance_foundation', increment_revision: 1,
        workspace_identity_digest: `sha256:${'a'.repeat(64)}`,
        source_digest: memoryPublication.digest,
        artifacts: [
            { workspace_relative_path: memoryPublication.relative_path, digest: memoryPublication.digest,
                role: 'publication_receipt', media_type: 'application/json', canonical: true,
                privacy_classification: 'internal' },
            { workspace_relative_path: expressionArtifact.relative_path, digest: expressionArtifact.digest,
                role: 'publication_expression', media_type: 'application/json', canonical: true,
                privacy_classification: 'internal' }
        ],
        source_refs: ['publication:acceptance-thread'], privacy_classification: 'internal',
        occurred_at: browserAt
    };
    const pendingTerminal = await terminalHooks.record(terminalEvent);
    const completedTerminal = await terminalHooks.resume(terminalEvent.event_id);
    terminalHookResumeComplete =
        pendingTerminal.status === 'evidence_capture_pending' && completedTerminal.status === 'complete';
    const publicationEvidenceId = completedTerminal.evidence_snapshot_ref.slice('evidence:'.length);
    const nextDelta = await new ResearchFlywheelService(store, {
        deltaId: () => 'delta_acceptance_next_unapproved',
        lifecycleEventId: () => 'event_acceptance_publication_attached',
        now: () => new Date(browserAt),
        baseCatalogDigest: async () => promotionPlan.expected_final_catalog_digest
    }).proposeFromEvidence(publicationEvidenceId);
    const nextQuestions = await new ResearchFlywheelService(store).proposeNextQuestions('increment:enterprise-agent-runtime:increment_acceptance_foundation@1');
    publicationFlywheelComplete =
        acceptanceFeedback.entries.length === 1 &&
            nextDelta.proposed_operations.some((operation) => operation.operation_type === 'attach_publication') &&
            nextQuestions.every((question) => question.data_classification === 'data_only') &&
            !(await store.exists('memory/reviews/review_acceptance_next_unapproved/review.json')) &&
            !(await store.exists('memory/promotions/delta_acceptance_next_unapproved/approval.json'));
    if (!articleComplete || !manualXComplete || !browserXComplete || !xArticleComplete ||
        !memoryQueryComplete || !publicationCheckpointComplete ||
        !feedbackInsightComplete || !memoryResumeComplete || !researchEvidenceFoundationComplete ||
        !researchPromotionComplete || !progressiveQueryComplete || !promotionResumeComplete ||
        !packageBindingComplete || !terminalHookResumeComplete || !publicationFlywheelComplete) {
        throw new Error('acceptance workflow did not reach the required terminal artifacts');
    }
    const acceptanceCriteria = {
        AC01: 'canonical Package source', AC02: 'immutable Increment revision',
        AC03: 'content-addressed Evidence', AC04: 'lossless canonical reconstruction',
        AC05: 'workspace-relative persistence', AC06: 'Evidence and Promotion separated',
        AC07: 'terminal Evidence hook', AC08: 'unapproved Delta excluded',
        AC09: 'Review-bound one-confirmation Promotion', AC10: 'Working excluded by default',
        AC11: 'lifecycle and Claim status separated', AC12: 'intended and observed expression',
        AC13: 'observation does not overwrite intent', AC14: 'adaptation preserves Claim strength',
        AC15: 'Human-selected feedback only', AC16: 'metrics remain non-technical evidence',
        AC17: 'versioned evolution contracts', AC18: 'history remains auditable',
        AC19: 'semantic records create-only', AC20: 'digest-bound derived Index',
        AC21: 'generation-bound Shards and Catalog', AC22: 'Catalog-first exact Query',
        AC23: 'bounded document retrieval', AC24: 'no broad research glob',
        AC25: 'budget fail-closed', AC26: 'Catalog committed last',
        AC27: 'partial Promotion invisible', AC28: 'digest changes stale Approval',
        AC29: 'safe Resume skips confirmed work', AC30: 'registration reconciliation contract',
        AC31: 'reviewed Context bound to Package', AC32: 'V2.2 read-only compatibility',
        AC33: 'bounded one-Increment six-item Import', AC34: 'offline fake-only acceptance',
        AC35: 'Runtime-only Wiki access', AC36: 'monotonic lifecycle chain',
        AC37: 'next question and Delta remain unapproved', AC38: 'enterprise runtime default Track isolation'
    };
    process.stdout.write(`${JSON.stringify({
        ok: true,
        article: 'complete',
        manual_x: 'complete',
        browser_x: 'simulated_complete',
        visual_v2_1: 'simulated_complete',
        x_article: 'simulated_complete',
        memory_query: 'simulated_complete',
        publication_checkpoint: 'simulated_complete',
        feedback_insight: 'simulated_complete',
        memory_resume: 'simulated_complete',
        research_evidence_foundation: 'simulated_complete',
        research_promotion: 'simulated_complete',
        promotion_resume: 'simulated_complete',
        progressive_query: 'simulated_complete',
        package_binding: 'simulated_complete',
        terminal_hook_resume: 'simulated_complete',
        publication_flywheel: 'simulated_complete',
        phase4_owned_acceptance: ['AC12', 'AC13', 'AC14', 'AC15', 'AC16', 'AC32', 'AC33', 'AC34', 'AC37'],
        acceptance_criteria: acceptanceCriteria,
        network: 'unused',
        submit_commands: submitCommands,
        submit_claims: submitClaims,
        x_article_publish_commands: xArticlePublishCommands,
        x_article_import_commands: xArticleImportCommands,
        x_article_anchor_replacement_commands: xArticleAnchorReplacementCommands
    })}\n`);
}
finally {
    const verifiedRoot = resolve(workspace);
    if (resolve(verifiedRoot, '..') !== resolve(tmpdir()) ||
        !basename(verifiedRoot).startsWith('research-publishing-acceptance-')) {
        throw new Error('refusing to remove an unverified acceptance path');
    }
    await rm(verifiedRoot, { recursive: true, force: false });
}
//# sourceMappingURL=acceptance.js.map