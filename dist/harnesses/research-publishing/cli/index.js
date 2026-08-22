#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ManualAdapter } from '../adapters/x/manual/manual-adapter.js';
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
import { pruneBrowserArtifacts } from '../core/artifact-retention.js';
import { HarnessError } from '../core/errors.js';
import { PackageService } from '../core/package-service.js';
import { ExecutionStore } from '../core/execution-store.js';
import { assertContractsAvailable } from '../core/schema-validator.js';
import { WorkspaceStore } from '../core/workspace-store.js';
function parseArguments(argv) {
    const positional = [];
    const values = {};
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
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
    return {
        positional,
        options: {
            workspace: resolve(workspace),
            ...(values['input'] === undefined ? {} : { input: resolve(values['input']) }),
            ...(values['run-id'] === undefined ? {} : { runId: values['run-id'] }),
            ...(values['execution-id'] === undefined ? {} : { executionId: values['execution-id'] }),
            ...(values['command-id'] === undefined ? {} : { commandId: values['command-id'] }),
            ...(adapter === undefined ? {} : { adapter }),
            output: values['output'] ?? 'json'
        }
    };
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
    try {
        return JSON.parse(await readFile(options.input, 'utf8'));
    }
    catch (error) {
        if (error instanceof SyntaxError) {
            throw new HarnessError('CONTRACT_INVALID', `input is not valid JSON: ${error.message}`);
        }
        throw error;
    }
}
function requiredRunId(options, input) {
    const runId = options.runId ?? input?.run_id;
    if (runId === undefined || runId.length === 0) {
        throw new HarnessError('CONTRACT_INVALID', '--run-id or input.run_id is required');
    }
    return runId;
}
async function execute(argv) {
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
        const message = error instanceof Error ? error.message : 'unexpected error';
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