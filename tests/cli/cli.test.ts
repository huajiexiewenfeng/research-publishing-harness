import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { approvePublicationV2 } from '../../harnesses/research-publishing/core/approval-v2.js';
import { XService } from '../../harnesses/research-publishing/branches/x-harness/x-service.js';
import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
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

describe('research-publish CLI', () => {
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

  it('packages both X Article bulk-import capabilities in the manifest and Host reference', async () => {
    const [manifestText, reference] = await Promise.all([
      readFile(resolve('registry/manifests/research-publishing.json'), 'utf8'),
      readFile(resolve('skills/x-publishing-copilot/references/browser-adapter-flow.md'), 'utf8')
    ]);
    const manifest = JSON.parse(manifestText) as {
      interfaces: { x_article_browser: { capabilities: Record<string, string> } };
    };

    expect(manifest.interfaces.x_article_browser.capabilities).toHaveProperty('import_article_document');
    expect(manifest.interfaces.x_article_browser.capabilities).toHaveProperty('replace_article_visual_anchor');
    expect(reference).toContain('import_article_document');
    expect(reference).toContain('replace_article_visual_anchor');
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

    for (const operation of ['resume-verification', 'cancel-before-publish']) {
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
  });
});
