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
import { sha256 } from '../harnesses/research-publishing/core/digest.js';
import { ExecutionStore } from '../harnesses/research-publishing/core/execution-store.js';
import { PackageService } from '../harnesses/research-publishing/core/package-service.js';
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
    if (!articleComplete || !manualXComplete || !browserXComplete || !xArticleComplete) {
        throw new Error('acceptance workflow did not reach the required terminal artifacts');
    }
    process.stdout.write(`${JSON.stringify({
        ok: true,
        article: 'complete',
        manual_x: 'complete',
        browser_x: 'simulated_complete',
        visual_v2_1: 'simulated_complete',
        x_article: 'simulated_complete',
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