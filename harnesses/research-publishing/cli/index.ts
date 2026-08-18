#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { ManualAdapter, type ManualPublicResult, type PublishReceipt } from '../adapters/x/manual/manual-adapter.js';
import { ArticleService, type ArticleBrief, type ArticleDraft } from '../branches/article-harness/article-service.js';
import { XService, type PublicationPlan, type XBrief, type XDraft } from '../branches/x-harness/x-service.js';
import { approvePublication, type Approval } from '../core/approval.js';
import { HarnessError, type ErrorCode } from '../core/errors.js';
import { PackageService } from '../core/package-service.js';
import { assertContractsAvailable } from '../core/schema-validator.js';
import type { Candidate, ResearchContentPackage } from '../core/types.js';
import { WorkspaceStore } from '../core/workspace-store.js';

interface CliOptions {
  readonly workspace: string;
  readonly input?: string;
  readonly runId?: string;
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
  return {
    positional,
    options: {
      workspace: resolve(workspace),
      ...(values['input'] === undefined ? {} : { input: resolve(values['input']) }),
      ...(values['run-id'] === undefined ? {} : { runId: values['run-id'] }),
      output: values['output'] ?? 'json'
    }
  };
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
    if (operation === 'article handoff-x') {
      return { ok: true, operation, artifact: await article.createXHandoff(runId), state: 'finalized' };
    }
  }

  if (operation.startsWith('x ')) {
    const x = new XService(store, {
      ...(options.runId === undefined ? {} : { runId: () => options.runId! })
    });
    const input = options.input === undefined ? undefined : await readInput<Record<string, unknown>>(options);
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
        plan: PublicationPlan;
        approved_by: string;
        ttl_ms: number;
      };
      const artifact = approvePublication(approve.plan, approve.approved_by, approve.ttl_ms);
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
      return { ok: true, operation, artifact: await x.planX(runId), state: 'approval_pending' };
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
      'APPROVAL_STALE'
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
  let operation = process.argv.slice(2).filter((value) => !value.startsWith('--')).slice(0, 2).join(' ');
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

await main();
