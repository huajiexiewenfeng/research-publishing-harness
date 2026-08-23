import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
import type {
  AssemblePublicationExpressionInput,
  PublicationChannel
} from '../../harnesses/research-publishing/core/publication-expression-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

const now = '2026-08-23T02:00:00.000Z';

function explicitObservation(channel: PublicationChannel, status: 'manual_recorded' | 'public_verified') {
  return {
    schema_version: 'publication-observation/v1',
    channel,
    status,
    source: status === 'public_verified' ? 'public_page' : 'user_report',
    public_url: `https://example.com/${channel}/published`,
    platform_ids: [`${channel}_public_1`],
    observed_digest: sha256(`${channel}:observed`),
    actual_item_order: [1],
    media_verification: 'matched',
    link_verification: 'matched',
    missing_content: [],
    unexpected_content: [],
    mismatches: [],
    published_at: now
  } as const;
}

function xReceipt(channel: 'x_thread' | 'x_single', planDigest: string) {
  const posts = channel === 'x_thread'
    ? [
        { ordinal: 1, post_id: '1001', canonical_url: 'https://x.com/runtime/status/1001', observed_digest: sha256(`${channel}:1`), reply_to_id: null },
        { ordinal: 2, post_id: '1002', canonical_url: 'https://x.com/runtime/status/1002', observed_digest: sha256(`${channel}:2`), reply_to_id: '1001' }
      ]
    : [{ ordinal: 1, post_id: '1001', canonical_url: 'https://x.com/runtime/status/1001', observed_digest: sha256(`${channel}:1`), reply_to_id: null }];
  const common = {
    schema_version: channel === 'x_single' ? '2.1' : '2.0',
    receipt_id: `receipt_${channel}`,
    supersedes_receipt_id: null,
    execution_id: `execution_${channel}`,
    attempt_id: `attempt_${channel}`,
    run_id: `run_${channel}`,
    platform: 'x',
    adapter: 'browser',
    status: 'finalized',
    target_account: '@runtime',
    observed_account: '@runtime',
    approval: {
      plan_digest: planDigest,
      approval_digest: sha256(`${channel}:approval`),
      approved_at: '2026-08-23T01:00:00.000Z',
      expires_at: '2026-08-23T03:00:00.000Z'
    },
    submission: {
      armed_at: '2026-08-23T01:10:00.000Z',
      attempted_at: '2026-08-23T01:11:00.000Z',
      submit_command_count: 1,
      page_contract_version: 'fixture/v1',
      executor_version: 'fixture/v1'
    },
    public_result: {
      root_url: posts[0]!.canonical_url,
      published_at: now,
      ordered_post_ids: posts.map((post) => post.post_id),
      posts,
      matched_ordinals: posts.map((post) => post.ordinal),
      missing_ordinals: [],
      unexpected_post_ids: []
    },
    verification: {
      source: 'browser_public_page', strength: 'public_browser_verified', verified_at: now,
      account_match: true, count_match: true, content_match: true, order_match: true,
      reply_chain_match: true, links_match: true, unique_post_ids: true,
      evidence_digest: sha256(`${channel}:verification`)
    },
    created_at: now
  };
  return channel === 'x_single'
    ? { ...common, schema_version: '2.1', plan_digest: planDigest, media_evidence: null }
    : { ...common, schema_version: '2.0' };
}

function xArticleReceipt(planDigest: string) {
  return {
    schema_version: '1.0', receipt_id: 'receipt_x_article', execution_id: 'execution_x_article',
    plan_id: 'plan_x_article', plan_digest: planDigest,
    status: 'published', issued_at: now,
    source_evidence: {
      article_package_digest: sha256('article-package'), document_digest: sha256('article-document'),
      asset_digests: []
    },
    editor_evidence: {
      draft_id: 'draft_2001', editor_revision: sha256('editor'), preview_revision: sha256('preview'),
      content_match: true
    },
    public_evidence: {
      kind: 'full_match', article_id: '2001', canonical_url: 'https://x.com/runtime/article/2001',
      author_match: true, content_match: true, links_match: true, media_match: true, verified_at: now
    },
    supersedes_receipt_id: null,
    receipt_digest: sha256('x-article-receipt')
  };
}

function manualReceipt(planDigest: string) {
  return {
    schema_version: '1.0', receipt_id: 'receipt_x_reply', run_id: 'run_x_reply',
    publication_digest: planDigest, adapter: 'manual', status: 'manual_recorded',
    verification_source: 'manual',
    public_result: { url: 'https://x.com/runtime/status/3001', post_ids: ['3001'], published_at: now },
    created_at: now
  };
}

export async function createPublicationExpressionFixtures() {
  const root = await import('node:fs/promises').then(({ mkdtemp }) =>
    import('node:os').then(({ tmpdir }) =>
      import('node:path').then(({ join }) => mkdtemp(join(tmpdir(), 'rph-expression-')))
    )
  );
  const store = await WorkspaceStore.open(root);
  const channels: PublicationChannel[] = [
    'article', 'x_article', 'x_thread', 'x_single', 'x_reply', 'gist', 'github_article'
  ];
  const fixtures = {} as Record<PublicationChannel, AssemblePublicationExpressionInput & { expected_verification: string }>;

  for (const channel of channels) {
    const itemCount = channel === 'x_thread' ? 2 : 1;
    const content = Array.from({ length: itemCount }, (_, index) => `${channel}:${index + 1}`).join('\n');
    const contentPath = `articles/expression/${channel}.md`;
    await store.writeNew(contentPath, content);
    const contentRef = await store.resolveExistingArtifact(contentPath);
    const plan = {
      schema_version: 'publication-expression-intent/v1', channel,
      content_path: contentRef.relative_path, content_digest: contentRef.digest,
      expected_item_order: Array.from({ length: itemCount }, (_, index) => index + 1),
      link_refs: [`https://example.com/${channel}`], visual_refs: [`visual:${channel}`]
    };
    const planPath = `x/expression/${channel}-plan.json`;
    await store.writeNew(planPath, plan);
    const planRef = await store.resolveExistingArtifact(planPath);
    let receipt: unknown | null = null;
    let receiptKind: AssemblePublicationExpressionInput['receipt'] extends infer T
      ? T extends { kind: infer K } ? K : never : never;
    let expected = 'planned';
    if (channel === 'x_article') {
      receipt = xArticleReceipt(planRef.digest); receiptKind = 'x_article'; expected = 'public_verified';
    } else if (channel === 'x_thread' || channel === 'x_single') {
      receipt = xReceipt(channel, planRef.digest); receiptKind = channel === 'x_single' ? 'x_v2_1' : 'x_v2'; expected = 'public_verified';
    } else if (channel === 'x_reply') {
      receipt = manualReceipt(planRef.digest); receiptKind = 'x_v1'; expected = 'manual_recorded';
    } else if (channel === 'gist' || channel === 'github_article') {
      receipt = explicitObservation(channel, channel === 'gist' ? 'manual_recorded' : 'public_verified');
      receiptKind = 'explicit'; expected = channel === 'gist' ? 'manual_recorded' : 'public_verified';
    }
    const receiptPath = `receipts/${channel}.json`;
    if (receipt !== null) await store.writeNew(receiptPath, receipt as object);
    const receiptRef = receipt === null ? null : await store.resolveExistingArtifact(receiptPath);
    fixtures[channel] = {
      expression_id: `expression_${channel}`,
      increment_ref: 'increment:runtime-boundary@1', channel, language: 'en',
      derivation_type: channel === 'article' ? 'original' : 'adaptation',
      claim_refs: ['claim:runtime-boundary@1'], visual_refs: [`visual:${channel}`],
      evidence_snapshot_refs: [`evidence:${channel}`],
      intent: {
        kind: 'explicit', path: planRef.relative_path, digest: planRef.digest,
        content_path: contentRef.relative_path, content_digest: contentRef.digest,
        privacy_classification: 'public'
      },
      receipt: receiptRef === null ? null : {
        kind: receiptKind!, path: receiptRef.relative_path, digest: receiptRef.digest,
        privacy_classification: 'public'
      },
      source_claim_statuses: { 'claim:runtime-boundary@1': 'observed' },
      expression_claim_statuses: { 'claim:runtime-boundary@1': 'observed' },
      target_privacy_classification: 'public',
      expected_verification: expected
    };
  }

  return { store, fixtures };
}

export async function createConflictingPublicationFixture() {
  const { store, fixtures } = await createPublicationExpressionFixtures();
  const base = fixtures.x_thread;
  const receipt = xReceipt('x_thread', base.intent.digest) as Record<string, unknown>;
  receipt.status = 'verification_conflict';
  receipt.public_result = {
    ...(receipt.public_result as object),
    unexpected_post_ids: ['9999']
  };
  receipt.verification = {
    ...(receipt.verification as object),
    content_match: false
  };
  await store.writeNew('receipts/x-thread-conflict.json', receipt);
  const receiptRef = await store.resolveExistingArtifact('receipts/x-thread-conflict.json');
  return {
    store,
    approvedDigest: base.intent.content_digest,
    input: {
      ...base,
      expression_id: 'expression_x_thread_conflict',
      receipt: {
        kind: 'x_v2' as const, path: receiptRef.relative_path, digest: receiptRef.digest,
        privacy_classification: 'public' as const
      }
    }
  };
}
