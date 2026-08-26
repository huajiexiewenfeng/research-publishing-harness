import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { approvePublicationV2 } from '../../harnesses/research-publishing/core/approval-v2.js';
import { XService } from '../../harnesses/research-publishing/branches/x-harness/x-service.js';
import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
import {
  createSupersedingXArticleMaterializationReceipt,
  createXArticleMaterializationReceipt,
  type XArticleMaterializationCheckpointV1,
  type XArticleMaterializationPlanV1
} from '../../harnesses/research-publishing/core/x-article-materialization.js';
import { createXArticlePublicationPlan } from '../../harnesses/research-publishing/core/x-article-publication-plan.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { publicationPlanV2Fixture } from '../fixtures/publication-plan-v2.js';
import { publicationPlanV2_1Fixture } from '../fixtures/publication-plan-v2-1.js';
import { researchPackage } from '../fixtures/research-package.js';

const cli = resolve('dist/harnesses/research-publishing/cli/index.js');
const sourceCli = resolve('harnesses/research-publishing/cli/index.ts');

function run(args: readonly string[]) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

function runSource(args: readonly string[]) {
  return spawnSync(process.execPath, ['--import', 'tsx', sourceCli, ...args], { encoding: 'utf8' });
}

async function filesystemSnapshot(root: string): Promise<readonly string[]> {
  const entries: string[] = [];
  async function visit(path: string, relativePath: string): Promise<void> {
    const metadata = await stat(path);
    entries.push([
      relativePath || '.', metadata.isDirectory() ? 'directory' : 'file',
      metadata.size, metadata.mtimeMs
    ].join('|'));
    if (!metadata.isDirectory()) return;
    for (const name of (await readdir(path)).sort()) {
      await visit(join(path, name), relativePath.length === 0 ? name : `${relativePath}/${name}`);
    }
  }
  await visit(root, '');
  return entries;
}

function materializationCliPlan() {
  return createXArticlePublicationPlan({
    planId: 'plan_cli_materialization',
    runId: 'run_cli_materialization',
    targetAccount: '@Glen56121',
    articlePackage: {
      root: 'articles/runtime/article_cli_materialization',
      digest: `sha256:${'a'.repeat(64)}`
    },
    document: {
      schema_version: '1.0',
      title: 'Fast materialization',
      cover_asset_id: null,
      blocks: [{
        kind: 'paragraph',
        runs: [{ text: 'Bulk import remains evidence-bound.', marks: [], link: null }]
      }]
    },
    visuals: [],
    plannedAt: '2026-08-27T09:00:00.000Z',
    provenance: {}
  });
}

const materializationCliCapabilities = {
  executor: 'codex-chrome',
  executor_version: '26.820.60940',
  browser_family: 'chrome',
  capabilities: [
    'observe_article_page', 'create_article_draft', 'import_article_document',
    'replace_article_visual_anchor', 'open_article_preview', 'open_publish_review',
    'publish_article_once'
  ],
  observed_at: '2026-08-27T09:00:00.000Z'
} as const;

describe('research-publish CLI', () => {
  it('advertises the stable X Article V3.2 control-plane routes as machine-readable help', () => {
    const result = runSource(['--help']);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      operation: 'help',
      artifact: {
        routes: [
          'x-article browser prepare --workspace <path> --plan <path> --capabilities <path> --output json',
          'x-article browser resume-editor --workspace <path> --execution <id> --output json',
          'x-article browser confirm-publish --workspace <path> --execution <id> --confirmation <path> --output json',
          'x-article browser materialization-status --workspace <path> --execution <id> --output json'
        ],
        compatibility_aliases: [
          'x-article browser resume-editor --execution-id <id>'
        ]
      },
      state: 'ready'
    });
    expect(run(['--help']).stdout).toBe(result.stdout);
  });

  it('prepares V3.2 from separate validated files and reports redacted durable status', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'rph-cli-materialization-'));
    const workspace = join(parent, 'workspace');
    const planPath = join(parent, 'plan.json');
    const capabilitiesPath = join(parent, 'capabilities.json');
    await writeFile(planPath, JSON.stringify(materializationCliPlan()));
    await writeFile(capabilitiesPath, JSON.stringify(materializationCliCapabilities));

    const prepared = runSource([
      'x-article', 'browser', 'prepare', '--workspace', workspace,
      '--plan', planPath, '--capabilities', capabilitiesPath, '--output', 'json'
    ]);
    expect(prepared.status).toBe(0);
    expect(prepared.stderr).toBe('');
    const preparedJson = JSON.parse(prepared.stdout) as {
      artifact: { execution_id: string; state: string };
    };
    expect(preparedJson).toMatchObject({
      ok: true, operation: 'x-article browser prepare',
      artifact: { state: 'created' }, state: 'created'
    });

    const statusArgs = [
      'x-article', 'browser', 'materialization-status', '--workspace', workspace,
      '--execution', preparedJson.artifact.execution_id, '--output', 'json'
    ];
    const beforeStatus = await filesystemSnapshot(workspace);
    const firstStatus = runSource(statusArgs);
    const secondStatus = runSource(statusArgs);
    expect(firstStatus.status).toBe(0);
    expect(secondStatus.stdout).toBe(firstStatus.stdout);
    const status = JSON.parse(firstStatus.stdout);
    expect(status).toMatchObject({
      ok: true,
      operation: 'x-article browser materialization-status',
      artifact: {
        execution_id: preparedJson.artifact.execution_id,
        phase: 'preflight_pending',
        publication_plan_digest: expect.stringMatching(/^sha256:/),
        materialization_digest: expect.stringMatching(/^sha256:/),
        receipt: { present: false, status: 'absent', receipt_digest: null },
        confirmation: { state: 'absent', confirmation_digest: null },
        publication_status: 'pre_public'
      },
      state: 'pre_public'
    });
    expect(run(statusArgs).stdout).toBe(firstStatus.stdout);
    await expect(filesystemSnapshot(workspace)).resolves.toEqual(beforeStatus);
    expect(Object.keys(status.artifact).sort()).toEqual([
      'confirmation', 'execution_id', 'materialization_digest', 'phase',
      'publication_plan_digest', 'publication_status', 'receipt'
    ]);
    expect(firstStatus.stdout).not.toContain('confirmed_by');
    expect(firstStatus.stdout).not.toContain('Bulk import remains evidence-bound.');
    expect(firstStatus.stdout).not.toMatch(/run_id|plan_id|draft_id|attempt_id|command_id|observation_id|latest_receipt_path/);

    const base = join(
      workspace, 'runs', preparedJson.artifact.execution_id, 'x-article', 'browser'
    );
    const context = JSON.parse(await readFile(join(base, 'adapter-context.json'), 'utf8'));
    await writeFile(join(base, 'adapter-context.json'), JSON.stringify({
      ...context,
      snapshot: { ...context.snapshot, state: 'finalized' }
    }));
    const contextOnly = runSource(statusArgs);
    expect(JSON.parse(contextOnly.stdout)).toMatchObject({
      artifact: { publication_status: 'pre_public', receipt: { present: false } },
      state: 'pre_public'
    });

    const materializationPlan = JSON.parse(
      await readFile(join(base, 'materialization-plan.json'), 'utf8')
    ) as XArticleMaterializationPlanV1;
    const storedCheckpoint = JSON.parse(
      await readFile(join(base, 'materialization-checkpoint.json'), 'utf8')
    ) as XArticleMaterializationCheckpointV1;
    const previewCheckpoint: XArticleMaterializationCheckpointV1 = {
      ...storedCheckpoint,
      draft_id: 'draft_cli_materialization',
      phase: 'preview_verified',
      body: { status: 'verified', observed_digest: materializationPlan.import_template_digest },
      last_editor_revision: `sha256:${'b'.repeat(64)}`,
      updated_at: '2026-08-27T09:01:00.000Z'
    };
    await writeFile(join(base, 'materialization-checkpoint.json'), JSON.stringify(previewCheckpoint));
    const previewReceipt = createXArticleMaterializationReceipt({
      plan: materializationPlan,
      checkpoint: previewCheckpoint,
      progress: [],
      cover_asset_id: null,
      body_block_count: 1,
      command_count: 0,
      observation_count: 0,
      automation_started_at: '2026-08-27T09:00:00.000Z',
      preview_verified_at: previewCheckpoint.updated_at,
      human_wait_seconds: 0,
      preview_revision: `sha256:${'c'.repeat(64)}`,
      issued_at: previewCheckpoint.updated_at
    });
    const publicReceipt = createSupersedingXArticleMaterializationReceipt({
      preview_receipt: previewReceipt,
      expected_preview_receipt_digest: previewReceipt.receipt_digest,
      human_wait_seconds: 5,
      issued_at: '2026-08-27T09:02:00.000Z'
    });
    await writeFile(join(base, 'materialization-receipt.json'), JSON.stringify(previewReceipt));
    const previewStatus = runSource(statusArgs);
    expect(JSON.parse(previewStatus.stdout)).toMatchObject({
      artifact: {
        receipt: { present: true, status: 'preview_verified' },
        publication_status: 'pre_public'
      },
      state: 'pre_public'
    });
    await writeFile(join(base, 'materialization-receipt-public.json'), JSON.stringify(publicReceipt));
    const publicStatus = runSource(statusArgs);
    expect(JSON.parse(publicStatus.stdout)).toMatchObject({
      artifact: {
        receipt: {
          present: true,
          status: 'public_verified',
          receipt_digest: publicReceipt.receipt_digest
        },
        publication_status: 'public_verified'
      },
      state: 'public_verified'
    });
    expect(run(statusArgs).stdout).toBe(publicStatus.stdout);
  });

  it('keeps missing status lookups strictly read-only and redacts filesystem paths', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'rph-cli-secret-client-alpha-'));
    const missingWorkspace = join(parent, 'secret-workspace-name');
    const beforeParent = await filesystemSnapshot(parent);
    const missing = runSource([
      'x-article', 'browser', 'materialization-status', '--workspace', missingWorkspace,
      '--execution', 'missing_execution', '--output', 'json'
    ]);
    expect(missing.status).toBe(5);
    expect(missing.stdout).not.toContain(parent);
    expect(missing.stdout).not.toContain('secret-workspace-name');
    expect(JSON.parse(missing.stdout)).toMatchObject({
      error: { code: 'ARTIFACT_NOT_FOUND', message: 'workspace is unavailable' }
    });
    await expect(filesystemSnapshot(parent)).resolves.toEqual(beforeParent);

    const workspace = join(parent, 'existing');
    await mkdir(workspace);
    const beforeWorkspace = await filesystemSnapshot(workspace);
    const missingExecution = runSource([
      'x-article', 'browser', 'materialization-status', '--workspace', workspace,
      '--execution', 'missing_execution', '--output', 'json'
    ]);
    expect(missingExecution.status).toBe(5);
    expect(missingExecution.stdout).not.toContain(workspace);
    await expect(filesystemSnapshot(workspace)).resolves.toEqual(beforeWorkspace);
  });

  it('returns stable redacted errors for malformed and non-file status artifacts', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'rph-cli-secret-artifact-'));
    const workspace = join(parent, 'workspace-secret');
    const planPath = join(parent, 'plan.json');
    const capabilitiesPath = join(parent, 'capabilities.json');
    await writeFile(planPath, JSON.stringify(materializationCliPlan()));
    await writeFile(capabilitiesPath, JSON.stringify(materializationCliCapabilities));
    const prepared = runSource([
      'x-article', 'browser', 'prepare', '--workspace', workspace,
      '--plan', planPath, '--capabilities', capabilitiesPath, '--output', 'json'
    ]);
    const executionId = JSON.parse(prepared.stdout).artifact.execution_id as string;
    const base = join(workspace, 'runs', executionId, 'x-article', 'browser');
    const originalPlan = await readFile(join(base, 'materialization-plan.json'), 'utf8');
    await writeFile(join(base, 'materialization-plan.json'), '{');
    const malformed = runSource([
      'x-article', 'browser', 'materialization-status', '--workspace', workspace,
      '--execution', executionId, '--output', 'json'
    ]);
    expect(JSON.parse(malformed.stdout)).toMatchObject({
      error: { code: 'CONTRACT_INVALID', message: 'materialization plan contains malformed JSON' }
    });
    expect(malformed.stdout).not.toContain(parent);
    expect(malformed.stdout).not.toMatch(/SyntaxError|Unexpected|position|stack/i);

    await writeFile(join(base, 'materialization-plan.json'), originalPlan);
    await mkdir(join(base, 'materialization-receipt.json'));
    const unreadable = runSource([
      'x-article', 'browser', 'materialization-status', '--workspace', workspace,
      '--execution', executionId, '--output', 'json'
    ]);
    expect(JSON.parse(unreadable.stdout)).toMatchObject({
      error: {
        code: 'ARTIFACT_NOT_FOUND',
        message: 'Preview materialization receipt is unavailable'
      }
    });
    expect(unreadable.stdout).not.toContain(parent);
    expect(unreadable.stdout).not.toMatch(/EISDIR|EACCES|EPERM|stack/i);
  });

  it('rejects non-object adapter contexts without mutation or path leakage in source and dist', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'rph-cli-secret-context-'));
    const workspace = join(parent, 'workspace-secret');
    const planPath = join(parent, 'plan.json');
    const capabilitiesPath = join(parent, 'capabilities.json');
    await writeFile(planPath, JSON.stringify(materializationCliPlan()));
    await writeFile(capabilitiesPath, JSON.stringify(materializationCliCapabilities));
    const prepared = runSource([
      'x-article', 'browser', 'prepare', '--workspace', workspace,
      '--plan', planPath, '--capabilities', capabilitiesPath, '--output', 'json'
    ]);
    const executionId = JSON.parse(prepared.stdout).artifact.execution_id as string;
    const contextPath = join(
      workspace, 'runs', executionId, 'x-article', 'browser', 'adapter-context.json'
    );
    const statusArgs = [
      'x-article', 'browser', 'materialization-status', '--workspace', workspace,
      '--execution', executionId, '--output', 'json'
    ];

    for (const invalidContext of [null, []] as const) {
      await writeFile(contextPath, JSON.stringify(invalidContext));
      const beforeStatus = await filesystemSnapshot(workspace);
      const sourceResult = runSource(statusArgs);
      const distResult = run(statusArgs);

      for (const result of [sourceResult, distResult]) {
        expect(result.status).toBe(2);
        expect(JSON.parse(result.stdout)).toMatchObject({
          error: {
            code: 'CONTRACT_INVALID',
            message: 'materialization-status requires a V3.2 prepared execution'
          }
        });
        expect(result.stdout).not.toContain(parent);
        expect(result.stdout).not.toContain('workspace-secret');
        expect(result.stdout).not.toMatch(/TypeError|Cannot read|stack|cause/i);
      }
      expect(distResult.stdout).toBe(sourceResult.stdout);
      await expect(filesystemSnapshot(workspace)).resolves.toEqual(beforeStatus);
    }
  });

  it('rejects unknown, extra, unsafe, malformed, and wrong-schema V3.2 CLI inputs', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'rph-cli-materialization-invalid-'));
    const workspace = join(parent, 'workspace');
    const planPath = join(parent, 'plan.json');
    const capabilitiesPath = join(parent, 'capabilities.json');
    const malformedPath = join(parent, 'malformed.json');
    const wrongSchemaPath = join(parent, 'wrong-schema.json');
    const unknownCapabilityPath = join(parent, 'unknown-capability.json');
    await writeFile(planPath, JSON.stringify(materializationCliPlan()));
    await writeFile(capabilitiesPath, JSON.stringify(materializationCliCapabilities));
    await writeFile(malformedPath, '{');
    await writeFile(wrongSchemaPath, JSON.stringify({ schema_version: 'wrong' }));
    await writeFile(unknownCapabilityPath, JSON.stringify({
      ...materializationCliCapabilities,
      capabilities: [...materializationCliCapabilities.capabilities, 'read_hidden_session_secret']
    }));

    const cases = [
      runSource([
        'x-article', 'browser', 'prepare', '--workspace', workspace,
        '--plan', planPath, '--capabilities', capabilitiesPath, '--mystery', 'value', '--output', 'json'
      ]),
      runSource([
        'x-article', 'browser', 'materialization-status', '--workspace', workspace,
        '--execution', 'safe_id', '--plan', planPath, '--output', 'json'
      ]),
      runSource([
        'x-article', 'browser', 'materialization-status', '--workspace', workspace,
        '--execution', '../escape', '--output', 'json'
      ]),
      runSource([
        'x-article', 'browser', 'prepare', '--workspace', workspace,
        '--plan', malformedPath, '--capabilities', capabilitiesPath, '--output', 'json'
      ]),
      runSource([
        'x-article', 'browser', 'prepare', '--workspace', workspace,
        '--plan', wrongSchemaPath, '--capabilities', capabilitiesPath, '--output', 'json'
      ]),
      runSource([
        'x-article', 'browser', 'prepare', '--workspace', workspace,
        '--plan', planPath, '--capabilities', unknownCapabilityPath, '--output', 'json'
      ])
    ];

    for (const result of cases) {
      expect(result.status).not.toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ ok: false });
    }
    expect(JSON.parse(cases[0]!.stdout)).toMatchObject({ error: { code: 'CONTRACT_INVALID' } });
    expect(JSON.parse(cases[1]!.stdout)).toMatchObject({ error: { code: 'CONTRACT_INVALID' } });
    expect(JSON.parse(cases[2]!.stdout)).toMatchObject({ error: { code: 'WORKSPACE_PATH_INVALID' } });
    expect(JSON.parse(cases[3]!.stdout)).toMatchObject({ error: { code: 'CONTRACT_INVALID' } });
    expect(JSON.parse(cases[4]!.stdout)).toMatchObject({ error: { code: 'CONTRACT_INVALID' } });
    expect(JSON.parse(cases[5]!.stdout)).toMatchObject({ error: { code: 'CONTRACT_INVALID' } });
  });

  it('routes resume and confirmation through the prepared V3.2 adapter APIs', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'rph-cli-materialization-controls-'));
    const workspace = join(parent, 'workspace');
    const confirmationPath = join(parent, 'confirmation.json');
    await writeFile(confirmationPath, JSON.stringify({ schema_version: 'wrong' }));

    for (const operation of ['resume-editor', 'materialization-status']) {
      const result = runSource([
        'x-article', 'browser', operation, '--workspace', workspace,
        '--execution', 'missing_execution', '--output', 'json'
      ]);
      expect(result.status).toBe(5);
      expect(JSON.parse(result.stdout)).toMatchObject({
        operation: `x-article browser ${operation}`,
        error: { code: 'ARTIFACT_NOT_FOUND' }
      });
    }

    const resumeAlias = runSource([
      'x-article', 'browser', 'resume-editor', '--workspace', workspace,
      '--execution-id', 'missing_execution', '--output', 'json'
    ]);
    expect(resumeAlias.status).toBe(5);
    expect(JSON.parse(resumeAlias.stdout)).toMatchObject({
      operation: 'x-article browser resume-editor',
      error: { code: 'ARTIFACT_NOT_FOUND' }
    });
    const conflictingAliases = runSource([
      'x-article', 'browser', 'resume-editor', '--workspace', workspace,
      '--execution', 'missing_execution', '--execution-id', 'missing_execution',
      '--output', 'json'
    ]);
    expect(conflictingAliases.status).toBe(2);
    expect(JSON.parse(conflictingAliases.stdout)).toMatchObject({
      operation: 'x-article browser resume-editor',
      error: { code: 'CONTRACT_INVALID' }
    });

    const confirm = runSource([
      'x-article', 'browser', 'confirm-publish', '--workspace', workspace,
      '--execution', 'missing_execution', '--confirmation', confirmationPath, '--output', 'json'
    ]);
    expect(confirm.status).toBe(2);
    expect(JSON.parse(confirm.stdout)).toMatchObject({
      operation: 'x-article browser confirm-publish',
      error: { code: 'CONTRACT_INVALID' }
    });
  });
  it('exposes the Phase 1 program command surface with JSON-only routing', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'rph-cli-program-routes-'));
    const workspace = join(parent, 'workspace');
    const input = join(parent, 'input.json');
    await writeFile(input, '{}', 'utf8');
    const operations = [
      'program roadmap create', 'program roadmap revise', 'program roadmap status',
      'program backlog add', 'program backlog revise', 'program backlog status',
      'program backlog rebuild', 'program month review', 'program month status',
      'program status'
    ];
    for (const operation of operations) {
      const result = run([
        ...operation.split(' '), '--workspace', workspace,
        '--input', input, '--output', 'json'
      ]);
      const payload = JSON.parse(result.stdout) as { operation: string; error?: { message: string } };
      expect(payload.operation).toBe(operation);
      expect(payload.error?.message ?? '').not.toMatch(/unknown operation/i);
    }
  }, 45_000);

  it('exposes the Phase 2 weekly article command surface with JSON-only routing', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'rph-cli-week-routes-'));
    const workspace = join(parent, 'workspace');
    const input = join(parent, 'input.json');
    await writeFile(input, '{}', 'utf8');
    const operations = [
      'program week open', 'program week submit-candidates', 'program week select',
      'program week cancel', 'program week compile-package', 'program week status',
      'program week outcome assemble', 'program week outcome status',
      'program week outcome resume'
    ];
    for (const operation of operations) {
      const result = run([
        ...operation.split(' '), '--workspace', workspace,
        '--input', input, '--output', 'json'
      ]);
      const payload = JSON.parse(result.stdout) as { operation: string; error?: { message: string } };
      expect(payload.operation).toBe(operation);
      expect(payload.error?.message ?? '').not.toMatch(/unknown operation/i);
    }
  }, 45_000);

  it('exposes all eleven Publication Bundle operations with JSON-only routing', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'rph-cli-bundle-routes-'));
    const workspace = join(parent, 'workspace');
    const input = join(parent, 'input.json');
    await writeFile(input, '{}', 'utf8');
    const operations = [
      'publication bundle plan',
      'publication bundle audit',
      'publication bundle approve',
      'publication bundle article-authorization',
      'publication bundle bind-article-execution',
      'publication bundle attach-article-receipt',
      'publication bundle materialize-single',
      'publication bundle single-authorization',
      'publication bundle bind-single-execution',
      'publication bundle attach-single-receipt',
      'publication bundle status'
    ];
    for (const operation of operations) {
      const result = run([
        ...operation.split(' '), '--workspace', workspace,
        '--input', input, '--output', 'json'
      ]);
      const payload = JSON.parse(result.stdout) as {
        operation: string;
        error?: { message: string };
      };
      expect(payload.operation).toBe(operation);
      expect(payload.error?.message ?? '').not.toMatch(/unknown operation/i);
    }
  }, 45_000);

  it('exposes the V2.2-compatible V2.3 Memory command surface with JSON-only routing', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'rph-cli-memory-routes-'));
    const workspace = join(parent, 'workspace');
    const input = join(parent, 'input.json');
    await writeFile(input, '{}', 'utf8');
    const operations = [
      'memory doctor', 'memory query plan', 'memory query execute', 'memory query review',
      'memory query status', 'memory query bind-package', 'memory index doctor',
      'memory index rebuild-plan', 'memory feedback capture', 'memory feedback review',
      'memory insight propose', 'memory insight review', 'memory ingest plan',
      'memory ingest approve', 'memory ingest execute', 'memory ingest status', 'memory ingest resume',
      'memory evidence capture', 'memory evidence status',
      'memory increment assemble', 'memory increment status', 'memory lineage show',
      'memory delta propose', 'memory delta review', 'memory promotion plan',
      'memory promotion approve', 'memory promotion execute', 'memory promotion status',
      'memory promotion resume', 'memory terminal-hook status', 'memory terminal-hook resume',
      'memory import inspect', 'memory import capture', 'memory import propose'
    ];
    for (const operation of operations) {
      const result = run([
        ...operation.split(' '), '--workspace', workspace, '--input', input, '--output', 'json'
      ]);
      const payload = JSON.parse(result.stdout) as { operation: string; error?: { message: string } };
      expect(payload.operation).toBe(operation);
      expect(payload.error?.message ?? '').not.toMatch(/unknown operation/i);
    }
  }, 120_000);

  it('exposes the Phase 4 research partner command surface with JSON-only routing', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'rph-cli-research-routes-'));
    const workspace = join(parent, 'workspace');
    const input = join(parent, 'input.json');
    await writeFile(input, '{}', 'utf8');
    const operations = [
      'research bridge assemble',
      'research bridge status',
      'research bridge resume',
      'research synthesis plan',
      'research synthesis record',
      'research synthesis status',
      'research continuation propose',
      'research continuation status'
    ];
    for (const operation of operations) {
      const result = run([
        ...operation.split(' '), '--workspace', workspace,
        '--input', input, '--output', 'json'
      ]);
      const payload = JSON.parse(result.stdout) as { operation: string; error?: { message: string } };
      expect(payload.operation).toBe(operation);
      expect(payload.error?.message ?? '').not.toMatch(/unknown operation/i);
    }
  }, 45_000);

  it('plans and degrades a Memory Query without configured Runtime', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'rph-cli-memory-query-'));
    const workspace = join(parent, 'workspace');
    const planInput = join(parent, 'plan.json');
    await writeFile(planInput, JSON.stringify({
      research_track: 'enterprise-agent-runtime', purpose: 'candidate_enrichment',
      query_terms: ['runtime boundary'],
      context_budget: { max_items: 4, max_chars: 8000, max_item_chars: 2000 },
      skill: 'article'
    }));
    const planned = run([
      'memory', 'query', 'plan', '--workspace', workspace, '--input', planInput, '--output', 'json'
    ]);
    expect(planned.status).toBe(0);
    const plan = JSON.parse(planned.stdout) as { artifact: { query_id: string } };
    const executeInput = join(parent, 'execute.json');
    await writeFile(executeInput, JSON.stringify({ query_id: plan.artifact.query_id }));
    const executed = run([
      'memory', 'query', 'execute', '--workspace', workspace, '--input', executeInput, '--output', 'json'
    ]);
    expect(JSON.parse(executed.stdout)).toMatchObject({
      ok: true, operation: 'memory query execute', artifact: { status: 'unavailable' }
    });
  });

  it('accepts only explicit absolute Runtime launcher configuration', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'rph-cli-memory-options-'));
    const invalid = run([
      'memory', 'doctor', '--workspace', workspace,
      '--runtime-executable', 'python', '--runtime-launcher', 'python-module', '--output', 'json'
    ]);
    expect(JSON.parse(invalid.stdout)).toMatchObject({
      ok: false, operation: 'memory doctor', error: { code: 'MEMORY_RUNTIME_INVALID_CONFIG' }
    });
  });
  it('returns JSON-only doctor output', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'rph-cli-doctor-'));
    const result = run(['doctor', '--workspace', workspace, '--output', 'json']);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const doctor = JSON.parse(result.stdout) as {
      artifact: { contracts: string[] };
    };
    expect(doctor).toMatchObject({ ok: true, operation: 'doctor', state: 'ready' });
    expect(doctor.artifact.contracts).toEqual(expect.arrayContaining([
      'x-article-browser-command',
      'x-article-browser-observation'
    ]));
  });

  it('packages the executable X Article V3.2 Browser Host protocol', async () => {
    const [manifestText, browserReference, materializationReference] = await Promise.all([
      readFile(resolve('registry/manifests/research-publishing.json'), 'utf8'),
      readFile(resolve('skills/x-publishing-copilot/references/browser-adapter-flow.md'), 'utf8'),
      readFile(
        resolve('skills/x-publishing-copilot/references/x-article-materialization-v3-2.md'),
        'utf8'
      )
    ]);
    const manifest = JSON.parse(manifestText) as {
      interfaces: { x_article_browser: { capabilities: Record<string, string> } };
    };

    expect(manifest.interfaces.x_article_browser.capabilities).toHaveProperty('import_article_document');
    expect(manifest.interfaces.x_article_browser.capabilities).toHaveProperty('replace_article_visual_anchor');
    expect(browserReference).toContain('import_article_document');
    expect(browserReference).toContain('replace_article_visual_anchor');
    expect(materializationReference).toContain('x-article-materialization/v3.2');
    expect(materializationReference).toContain('rich_text_anchor_import/v1');
    expect(materializationReference).toContain('import_article_document');
    expect(materializationReference).toContain('replace_article_visual_anchor');
    expect(materializationReference).toContain('materialization_progress');
    expect(materializationReference).toContain('confirm-publish');
    expect(materializationReference).toContain('never switch to `block_materialization/v1`');
    expect(materializationReference).not.toMatch(/^x-article browser progress\b/m);
  });

  it('captures a Candidate only below the selected workspace', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'rph-cli-candidate-'));
    const workspace = join(parent, 'workspace');
    const input = join(parent, 'candidate.json');
    await writeFile(
      input,
      JSON.stringify({
        schema_version: '1.0',
        candidate_id: 'candidate_cli',
        title: 'Synthetic context contract',
        source_type: 'design',
        research_track: 'enterprise-agent-runtime',
        thesis_hint: 'Context needs explicit evidence boundaries.',
        source_refs: ['https://example.com/synthetic'],
        privacy: 'public',
        status: 'idea',
        captured_at: '2026-08-18T12:00:00.000Z'
      })
    );

    const result = run([
      'candidate', 'capture', '--workspace', workspace, '--input', input, '--output', 'json'
    ]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      operation: 'candidate capture',
      artifact: { candidate_id: 'candidate_cli' }
    });
    await expect(readFile(join(workspace, 'candidates', 'candidate_cli.json'), 'utf8')).resolves.toContain(
      'candidate_cli'
    );
  });

  it('uses stable contract and state exit codes', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'rph-cli-errors-'));
    const workspace = join(parent, 'workspace');
    const invalidInput = join(parent, 'invalid.json');
    await writeFile(invalidInput, JSON.stringify({ candidate_id: '../escape' }));

    const invalid = run([
      'candidate', 'capture', '--workspace', workspace, '--input', invalidInput, '--output', 'json'
    ]);
    expect(invalid.status).toBe(2);
    expect(JSON.parse(invalid.stdout)).toMatchObject({
      ok: false,
      error: { code: 'CONTRACT_INVALID' }
    });

    const missing = run(['article', 'review', '--workspace', workspace, '--run-id', 'missing', '--output', 'json']);
    expect(missing.status).toBe(5);
    expect(JSON.parse(missing.stdout)).toMatchObject({ ok: false, error: { code: 'ARTIFACT_NOT_FOUND' } });
  });

  it('prunes browser artifacts through a JSON-only operation', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'rph-cli-prune-'));
    const result = run(['x', 'browser', 'prune', '--workspace', workspace, '--output', 'json']);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      operation: 'x browser prune',
      artifact: { schema_version: '2.0', deleted_paths: [] },
      state: 'pruned'
    });
  });

  it('persists the Browser Host Bridge across CLI processes and reports full operation names', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'rph-cli-browser-'));
    const workspace = join(parent, 'workspace');
    const input = join(parent, 'start.json');
    const plan = publicationPlanV2Fixture();
    const approval = approvePublicationV2(plan, 'human', 600_000);
    await writeFile(input, JSON.stringify({
      execution_id: 'exec_cli_browser',
      plan,
      approval,
      capability_manifest: {
        executor: 'codex-chrome',
        executor_version: '26.814.41407',
        browser_family: 'chrome',
        capabilities: ['observe_page', 'navigate', 'click', 'set_text', 'press_key', 'wait'],
        observed_at: new Date().toISOString()
      }
    }));

    const started = run([
      'x', 'browser', 'start', '--workspace', workspace, '--input', input, '--output', 'json'
    ]);
    expect(started.status).toBe(0);
    const startJson = JSON.parse(started.stdout) as {
      artifact: { command: { command_id: string } };
    };
    const commandId = startJson.artifact.command.command_id;

    const next = run([
      'x', 'browser', 'next', '--workspace', workspace,
      '--execution-id', 'exec_cli_browser', '--output', 'json'
    ]);
    expect(next.status).toBe(0);
    expect(JSON.parse(next.stdout)).toMatchObject({
      operation: 'x browser next',
      artifact: { command_id: commandId, side_effect: 'read' }
    });

    const claimed = run([
      'x', 'browser', 'claim', '--workspace', workspace,
      '--execution-id', 'exec_cli_browser', '--command-id', commandId, '--output', 'json'
    ]);
    expect(claimed.status).toBe(0);
    const replay = run([
      'x', 'browser', 'claim', '--workspace', workspace,
      '--execution-id', 'exec_cli_browser', '--command-id', commandId, '--output', 'json'
    ]);
    expect(replay.status).toBe(4);
    expect(JSON.parse(replay.stdout)).toMatchObject({
      ok: false,
      operation: 'x browser claim',
      error: { code: 'COMMAND_REPLAY_REJECTED' }
    });

    const status = run([
      'x', 'browser', 'status', '--workspace', workspace,
      '--execution-id', 'exec_cli_browser', '--output', 'json'
    ]);
    expect(status.status).toBe(0);
    expect(JSON.parse(status.stdout)).toMatchObject({
      operation: 'x browser status',
      artifact: { snapshot: { state: 'preflight' } }
    });

    const wrongResult = join(parent, 'wrong-result.json');
    await writeFile(wrongResult, JSON.stringify({
      schema_version: '2.0', execution_id: 'exec_cli_browser', command_id: 'cmd_wrong',
      status: 'success', observation: null, error_code: null, reported_at: new Date().toISOString()
    }));
    const wrongReport = run([
      'x', 'browser', 'report', '--workspace', workspace,
      '--execution-id', 'exec_cli_browser', '--input', wrongResult, '--output', 'json'
    ]);
    expect(wrongReport.status).toBe(2);
    expect(JSON.parse(wrongReport.stdout)).toMatchObject({
      operation: 'x browser report', error: { code: 'CONTRACT_INVALID' }
    });
  });

  it('dispatches x plan and approve by exact contract version', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'rph-cli-plan-v2-'));
    const workspace = join(parent, 'workspace');
    const store = await WorkspaceStore.open(workspace);
    const x = new XService(store, {
      runId: () => 'run_cli_plan_v2',
      planId: () => 'plan_cli_v2',
      now: () => new Date('2026-08-19T09:00:00.000Z')
    });
    const frozen = { ...researchPackage, status: 'frozen' as const, version: 3 };
    const prepared = await x.prepareX(frozen, {
      contentType: 'anchor', format: 'thread', language: 'en', targetAccount: '@runtime_ai'
    });
    await x.acceptXDraft(prepared.run_id, {
      schema_version: '1.0', run_id: prepared.run_id, content_type: 'anchor',
      format: 'thread', language: 'en',
      items: [
        { ordinal: 1, text: 'Runtime evidence is explicit.', claim_refs: ['claim_verified'] },
        { ordinal: 2, text: 'Trace remains planned.', claim_refs: ['claim_planned'], reply_to: 'previous' }
      ]
    });
    await x.reviewX(prepared.run_id);

    const planned = run([
      'x', 'plan', '--workspace', workspace, '--run-id', prepared.run_id,
      '--adapter', 'browser', '--output', 'json'
    ]);
    expect(planned.status).toBe(0);
    const planJson = JSON.parse(planned.stdout) as { artifact: ReturnType<typeof publicationPlanV2Fixture> };
    expect(planJson.artifact).toMatchObject({
      schema_version: '2.0', intent: { adapter: 'browser' }
    });
    expect(planJson.artifact.plan_id).toMatch(/^plan_/);

    const approveInput = join(parent, 'approve-v2.json');
    await writeFile(approveInput, JSON.stringify({
      plan: planJson.artifact, approved_by: 'human', ttl_ms: 600_000
    }));
    const approved = run([
      'x', 'approve', '--workspace', workspace, '--input', approveInput, '--output', 'json'
    ]);
    expect(approved.status).toBe(0);
    expect(JSON.parse(approved.stdout)).toMatchObject({
      operation: 'x approve', artifact: { schema_version: '2.0', scope: 'publish_once' }
    });

    const approveV2_1Input = join(parent, 'approve-v2-1.json');
    await writeFile(approveV2_1Input, JSON.stringify({
      plan: publicationPlanV2_1Fixture(), approved_by: 'human', ttl_ms: 600_000
    }));
    const approvedV2_1 = run([
      'x', 'approve', '--workspace', workspace, '--input', approveV2_1Input, '--output', 'json'
    ]);
    expect(approvedV2_1.status).toBe(0);
    expect(JSON.parse(approvedV2_1.stdout)).toMatchObject({
      operation: 'x approve',
      artifact: {
        schema_version: '2.1', scope: 'publish_once', adapter: 'browser',
        target_account: '@runtime_ai', plan_digest: publicationPlanV2_1Fixture().plan_digest
      }
    });
  });

  it('plans, approves, starts, and reports status for an X Article publication', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'rph-cli-x-article-'));
    const workspace = join(parent, 'workspace');
    const store = await WorkspaceStore.open(workspace);
    const root = 'articles/runtime-boundary/article_cli';
    const manifestBase = { schema_version: '1.0', article_run_id: 'article_cli', bindings: [] };
    const files = {
      'article.md': '# Runtime boundary\n\nSkills own semantics.\n',
      'visual-manifest.json': { ...manifestBase, manifest_digest: sha256(manifestBase) },
      'draft-candidate.json': {
        schema_version: '1.0', run_id: 'article_cli', title: 'Runtime boundary',
        summary: 'Skills own semantics.', language: 'en', sections: [{
          section_id: 'boundary', heading: 'Boundary', markdown: 'Skills own semantics.',
          claim_refs: [], source_refs: []
        }], visual_slots: [], open_questions: []
      }
    };
    const digest = sha256(Object.entries(files)
      .map(([path, value]) => ({ path, digest: sha256(value) }))
      .sort((left, right) => left.path.localeCompare(right.path)));
    const packageRef = {
      root, digest, artifacts: Object.keys(files).map((path) => `${root}/${path}`), warnings: []
    };
    await store.writeNewDirectory(root, { ...files, 'package-ref.json': packageRef });

    const planInput = join(parent, 'plan.json');
    await writeFile(planInput, JSON.stringify({ package_ref: packageRef, target_account: '@Glen56121' }));
    const planned = runSource([
      'x-article', 'plan', '--workspace', workspace, '--input', planInput, '--output', 'json'
    ]);
    expect(planned.status).toBe(0);
    const planResult = JSON.parse(planned.stdout) as { artifact: Record<string, unknown> };
    expect(planResult).toMatchObject({
      ok: true, operation: 'x-article plan', state: 'approval_pending',
      artifact: { schema_version: '1.0', intent: { action: 'publish_once', adapter: 'browser' } }
    });

    const approveInput = join(parent, 'approve.json');
    await writeFile(approveInput, JSON.stringify({
      plan: planResult.artifact, approved_by: 'human', ttl_ms: 600_000
    }));
    const approved = runSource([
      'x-article', 'approve', '--workspace', workspace, '--input', approveInput, '--output', 'json'
    ]);
    expect(approved.status).toBe(0);
    const approval = JSON.parse(approved.stdout).artifact;
    expect(approval).toMatchObject({ scope: 'publish_once', target_account: '@Glen56121' });

    const startInput = join(parent, 'start.json');
    const capabilities = [
      'observe_article_page', 'create_article_draft', 'set_article_title',
      'import_article_document', 'replace_article_visual_anchor',
      'insert_article_block', 'open_article_preview', 'open_publish_review',
      'publish_article_once'
    ];
    await writeFile(startInput, JSON.stringify({
      execution_id: 'exec_cli_x_article', plan: planResult.artifact, approval,
      capability_manifest: {
        executor: 'codex-chrome', executor_version: '26.818.31338', browser_family: 'chrome',
        capabilities, observed_at: new Date().toISOString()
      }
    }));
    const started = runSource([
      'x-article', 'browser', 'start', '--workspace', workspace, '--input', startInput, '--output', 'json'
    ]);
    expect(started.status).toBe(0);
    expect(JSON.parse(started.stdout)).toMatchObject({
      operation: 'x-article browser start',
      artifact: {
        execution_id: 'exec_cli_x_article',
        capability_manifest: { capabilities }
      },
      state: 'created'
    });
    await expect(store.readJson(
      'runs/exec_cli_x_article/x-article/browser/capabilities.json'
    )).resolves.toMatchObject({ capabilities });

    const status = runSource([
      'x-article', 'browser', 'status', '--workspace', workspace,
      '--execution-id', 'exec_cli_x_article', '--output', 'json'
    ]);
    expect(status.status).toBe(0);
    expect(JSON.parse(status.stdout)).toMatchObject({
      operation: 'x-article browser status', artifact: { state: 'created' }, state: 'created'
    });

    const wrongModeStatus = runSource([
      'x-article', 'browser', 'materialization-status', '--workspace', workspace,
      '--execution', 'exec_cli_x_article', '--output', 'json'
    ]);
    expect(wrongModeStatus.status).toBe(2);
    expect(JSON.parse(wrongModeStatus.stdout)).toMatchObject({
      operation: 'x-article browser materialization-status',
      error: { code: 'CONTRACT_INVALID' }
    });

    for (const operation of ['resume-verification', 'resume-editor', 'cancel-before-publish']) {
      const missing = runSource([
        'x-article', 'browser', operation, '--workspace', workspace,
        '--execution-id', 'missing_execution', '--output', 'json'
      ]);
      expect(missing.status).toBe(5);
      expect(JSON.parse(missing.stdout)).toMatchObject({
        ok: false, operation: `x-article browser ${operation}`,
        error: { code: 'ARTIFACT_NOT_FOUND' }
      });
    }

    const refreshInput = join(parent, 'refresh-approval.json');
    await writeFile(refreshInput, JSON.stringify({ approval }));
    const missingRefresh = runSource([
      'x-article', 'browser', 'refresh-approval', '--workspace', workspace,
      '--execution-id', 'missing_execution', '--input', refreshInput, '--output', 'json'
    ]);
    expect(missingRefresh.status).toBe(5);
    expect(JSON.parse(missingRefresh.stdout)).toMatchObject({
      ok: false, operation: 'x-article browser refresh-approval',
      error: { code: 'ARTIFACT_NOT_FOUND' }
    });
  });
});
