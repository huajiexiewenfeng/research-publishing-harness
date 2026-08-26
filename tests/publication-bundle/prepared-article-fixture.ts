import { XArticleBrowserAdapter } from '../../harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.js';
import {
  computeXArticlePageRevision,
  type XArticleBrowserObservation
} from '../../harnesses/research-publishing/adapters/x/article-browser/article-browser-protocol.js';
import { XArticleWeb2026_08Contract } from '../../harnesses/research-publishing/adapters/x/article-browser/contracts/x-article-web-2026-08.js';
import { createXArticleImportTemplate } from '../../harnesses/research-publishing/adapters/x/article-browser/article-import-template.js';
import { PublicationBundleService } from '../../harnesses/research-publishing/core/publication-bundle-service.js';
import { createPublicationBundleFixture } from '../fixtures/publication-bundle.js';

const PREPARED_AT = '2026-08-26T00:10:00.000Z';

const capabilities = {
  executor: 'codex-chrome', executor_version: 'test', browser_family: 'chrome',
  capabilities: [
    'observe_article_page', 'create_article_draft', 'open_article_preview',
    'open_publish_review', 'publish_article_once', 'import_article_document',
    'replace_article_visual_anchor'
  ],
  observed_at: PREPARED_AT
} as const;

function observed(executionId: string, commandId: string, value: Record<string, unknown>) {
  const body = {
    schema_version: '1.0', observation_id: `obs_${commandId}`, execution_id: executionId,
    command_id: commandId, origin: 'https://x.com', observed_at: PREPARED_AT,
    account_handle: '@Glen56121', controls: [], editor: null, preview: null,
    publish_review: null, public_article: null, ...value
  } as const;
  return { ...body, page_revision: computeXArticlePageRevision(body) } as unknown as
    XArticleBrowserObservation;
}

async function claimAndReport(
  adapter: XArticleBrowserAdapter,
  command: NonNullable<Awaited<ReturnType<XArticleBrowserAdapter['next']>>['command']>,
  observation: XArticleBrowserObservation
): Promise<void> {
  await adapter.claim(command);
  await adapter.report({ command, status: 'success', observation });
}

export async function createPreparedPublicationBundleFixture(
  input: { readonly bundleId?: string; readonly executionId?: string } = {}
) {
  const fixture = await createPublicationBundleFixture();
  const service = new PublicationBundleService(fixture.store, fixture.weeks, {
    now: () => new Date(PREPARED_AT),
    approvalId: () => 'bundle_approval_prepared_1'
  });
  const plan = await service.plan({
    ...fixture.planInput,
    bundle_id: input.bundleId ?? fixture.planInput.bundle_id
  });
  let eventNumber = 0;
  let commandNumber = 0;
  const executionId = input.executionId ?? 'execution_v32';
  const adapter = new XArticleBrowserAdapter(
    fixture.store,
    new XArticleWeb2026_08Contract(),
    {
      executionId: () => executionId,
      eventId: () => `${executionId}_event_${++eventNumber}`,
      commandId: () => `${executionId}_command_${++commandNumber}`,
      attemptId: () => `${executionId}_attempt`,
      now: () => new Date(PREPARED_AT)
    }
  );
  const execution = await adapter.prepare(plan.article_plan, capabilities);
  let next = await adapter.next(execution.execution_id);
  await claimAndReport(adapter, next.command!, observed(execution.execution_id, next.command!.command_id, {
    canonical_url: 'https://x.com/compose/articles', page_kind: 'articles_index',
    controls: [{ ref: 'create', role: 'button', name: 'create', test_id: null, disabled: false }]
  }));
  next = await adapter.next(execution.execution_id);
  const editorControls = [
    { ref: 'body', role: 'textbox', name: '', test_id: 'composer', disabled: false },
    { ref: 'preview', role: 'link', name: 'Preview', test_id: null, disabled: false }
  ];
  await claimAndReport(adapter, next.command!, observed(execution.execution_id, next.command!.command_id, {
    canonical_url: 'https://x.com/compose/articles/edit/2092246293603373056',
    page_kind: 'article_editor', controls: editorControls,
    editor: {
      draft_id: '2092246293603373056', title: '', blocks: [], visuals: [],
      import_state: null, has_unknown_content: false, autosave_state: 'saved'
    }
  }));
  next = await adapter.next(execution.execution_id);
  const template = createXArticleImportTemplate(plan.article_plan.intent.document);
  await claimAndReport(adapter, next.command!, observed(execution.execution_id, next.command!.command_id, {
    canonical_url: 'https://x.com/compose/articles/edit/2092246293603373056',
    page_kind: 'article_editor', controls: editorControls,
    editor: {
      draft_id: '2092246293603373056', title: plan.article_plan.intent.document.title,
      blocks: plan.article_plan.intent.document.blocks, visuals: [], has_unknown_content: false,
      autosave_state: 'saved', import_state: {
        template_digest: template.template_digest,
        source_document_digest: template.source_document_digest,
        unresolved_anchors: []
      }
    }
  }));
  next = await adapter.next(execution.execution_id);
  await claimAndReport(adapter, next.command!, observed(execution.execution_id, next.command!.command_id, {
    canonical_url: 'https://x.com/compose/articles/edit/2092246293603373056',
    page_kind: 'article_editor', controls: editorControls,
    editor: {
      draft_id: '2092246293603373056', title: plan.article_plan.intent.document.title,
      blocks: plan.article_plan.intent.document.blocks, visuals: [], import_state: null,
      has_unknown_content: false, autosave_state: 'saved'
    }
  }));
  next = await adapter.next(execution.execution_id);
  const preview = observed(execution.execution_id, next.command!.command_id, {
    canonical_url: 'https://x.com/compose/articles/edit/2092246293603373056/preview',
    page_kind: 'article_preview',
    controls: [{ ref: 'publish', role: 'button', name: 'Publish', test_id: null, disabled: false }],
    preview: {
      draft_id: '2092246293603373056', title: plan.article_plan.intent.document.title,
      blocks: plan.article_plan.intent.document.blocks, visuals: []
    }
  });
  await claimAndReport(adapter, next.command!, preview);
  const receiptPath = `runs/${execution.execution_id}/x-article/browser/materialization-receipt.json`;
  const receiptArtifact = await fixture.store.readContainedArtifact(receiptPath);
  return {
    ...fixture,
    service,
    plan,
    adapter,
    execution,
    preview,
    receiptRef: { path: receiptArtifact.relative_path, digest: receiptArtifact.digest }
  };
}
