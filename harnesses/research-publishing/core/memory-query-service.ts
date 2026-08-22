import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { createContextSnapshot, createMemoryQueryPlan } from './memory-contracts.js';
import { bindMemoryContext, validatePackageMemoryBinding } from './memory-package.js';
import { transitionMemoryQueryState } from './memory-state.js';
import type {
  ContextSnapshotV1,
  Digest,
  MemoryContextV1,
  MemoryQueryPlanV1,
  MemoryQueryState,
  RuntimeContextResult
} from './memory-types.js';
import { validateContract } from './schema-validator.js';
import type { ResearchContentPackageV1_1 } from './types.js';
import type { WorkspaceStore } from './workspace-store.js';

export interface MemoryQueryRuntime {
  query(input: Readonly<{
    allowed_paths: readonly string[];
    excluded_paths: readonly string[];
    max_items: number;
    max_item_chars: number;
    ordering_policy: 'path_asc';
  }>): Promise<RuntimeContextResult>;
}

export interface PlanMemoryQueryInput {
  readonly research_track: string;
  readonly purpose: 'candidate_enrichment' | 'feedback_followup';
  readonly query_terms: readonly string[];
  readonly context_budget: Readonly<{
    max_items: number;
    max_chars: number;
    max_item_chars: number;
  }>;
  readonly profile_digest: Digest;
  readonly scp_digest: Digest;
}

export interface MemoryContextReviewV1 {
  readonly schema_version: 'memory-context-review/v1';
  readonly query_id: string;
  readonly query_plan_digest: Digest;
  readonly context_snapshot_digest: Digest;
  readonly selected_refs: readonly string[];
  readonly status: 'applied' | 'reviewed_not_applied' | 'memory_unavailable';
  readonly reviewed_by: string;
  readonly reviewed_at: string;
  readonly review_digest: Digest;
}

export interface MemoryQueryStatusV1 {
  readonly schema_version: 'memory-query-status/v1';
  readonly query_id: string;
  readonly state: MemoryQueryState;
  readonly plan_digest: Digest;
  readonly snapshot_digest: Digest | null;
  readonly review_digest: Digest | null;
  readonly updated_at: string;
}

export interface MemoryQueryServiceIds {
  readonly queryId?: () => string;
  readonly runId?: () => string;
  readonly snapshotId?: () => string;
  readonly now?: () => Date;
}

function withoutDigest<T extends object, K extends keyof T>(value: T, key: K): object {
  const copy = { ...value } as Record<PropertyKey, unknown>;
  Reflect.deleteProperty(copy, key);
  return copy;
}

function validReviewer(value: string, at: Date): string {
  const reviewer = value.trim();
  if (reviewer.length === 0 || !Number.isFinite(at.getTime())) {
    throw new HarnessError('CONTRACT_INVALID', 'context review requires reviewer and valid time');
  }
  return reviewer;
}

export class MemoryQueryService {
  private readonly now: () => Date;

  constructor(
    private readonly store: WorkspaceStore,
    private readonly runtime: MemoryQueryRuntime,
    private readonly ids: MemoryQueryServiceIds = {}
  ) {
    this.now = ids.now ?? (() => new Date());
  }

  private base(queryId: string): string {
    return `memory/queries/${queryId}`;
  }

  private async writeStatus(status: MemoryQueryStatusV1): Promise<void> {
    await this.store.replaceAtomic(`${this.base(status.query_id)}/status.json`, status);
  }

  async planQuery(input: PlanMemoryQueryInput): Promise<MemoryQueryPlanV1> {
    if (!/^[a-z0-9][a-z0-9_-]{0,127}$/.test(input.research_track)) {
      throw new HarnessError('CONTRACT_INVALID', 'research track must be a safe slug');
    }
    const plan = createMemoryQueryPlan({
      research_track: input.research_track,
      purpose: input.purpose,
      primary_domain: 'research-publishing',
      allowed_paths: [`domains/research-publishing/tracks/${input.research_track}/**`],
      query_terms: [...input.query_terms],
      context_budget: input.context_budget,
      ordering_policy: 'path_asc',
      profile_digest: input.profile_digest,
      scp_digest: input.scp_digest,
      runtime_requirement: { name: 'llm-wiki-runtime', version: '0.2.0' }
    }, {
      ...(this.ids.queryId === undefined ? {} : { queryId: this.ids.queryId }),
      ...(this.ids.runId === undefined ? {} : { runId: this.ids.runId }),
      now: this.now
    });
    await this.store.writeNew(`${this.base(plan.query_id)}/plan.json`, plan);
    await this.writeStatus({
      schema_version: 'memory-query-status/v1', query_id: plan.query_id,
      state: 'query_planned', plan_digest: plan.plan_digest,
      snapshot_digest: null, review_digest: null, updated_at: this.now().toISOString()
    });
    return plan;
  }

  private boundResult(plan: MemoryQueryPlanV1, result: RuntimeContextResult): RuntimeContextResult {
    if (result.status !== 'loaded') return result;
    const unique = new Map<string, (typeof result.items)[number]>();
    for (const item of [...result.items].sort((a, b) => a.path.localeCompare(b.path))) {
      if (!unique.has(item.path)) unique.set(item.path, item);
    }
    const items: Array<(typeof result.items)[number]> = [];
    let remaining = plan.context_budget.max_chars;
    let truncated = result.truncated_count + Math.max(0, result.items.length - unique.size);
    for (const item of unique.values()) {
      if (items.length >= plan.context_budget.max_items || remaining <= 0) {
        truncated += 1;
        continue;
      }
      const itemLimit = Math.min(plan.context_budget.max_item_chars, remaining);
      const content = item.content.slice(0, itemLimit);
      if (content.length < item.content.length) truncated += 1;
      items.push({ ...item, content });
      remaining -= content.length;
    }
    return {
      ...result,
      status: items.length > 0 ? 'loaded' : 'empty',
      items,
      truncated_count: truncated
    };
  }

  async executeQuery(queryId: string): Promise<ContextSnapshotV1> {
    const existingPath = `${this.base(queryId)}/snapshot.json`;
    if (await this.store.exists(existingPath)) {
      return this.store.readJson<ContextSnapshotV1>(existingPath);
    }
    const plan = validateContract<MemoryQueryPlanV1>(
      'memory-query-plan',
      await this.store.readJson<MemoryQueryPlanV1>(`${this.base(queryId)}/plan.json`)
    );
    const result = this.boundResult(plan, await this.runtime.query({
      allowed_paths: plan.allowed_paths,
      excluded_paths: ['sources/originals/**', '.meta/**'],
      max_items: plan.context_budget.max_items,
      max_item_chars: plan.context_budget.max_item_chars,
      ordering_policy: plan.ordering_policy
    }));
    const snapshot = createContextSnapshot(plan, result, {
      ...(this.ids.snapshotId === undefined ? {} : { snapshotId: this.ids.snapshotId })
    });
    await this.store.writeNew(existingPath, snapshot);
    const state = result.status === 'unavailable' || result.status === 'failed'
      ? transitionMemoryQueryState('query_planned', 'memory_unavailable')
      : transitionMemoryQueryState('query_planned', 'context_loaded');
    await this.writeStatus({
      schema_version: 'memory-query-status/v1', query_id: queryId, state,
      plan_digest: plan.plan_digest, snapshot_digest: snapshot.snapshot_digest,
      review_digest: null, updated_at: this.now().toISOString()
    });
    return snapshot;
  }

  async reviewContext(
    queryId: string,
    input: Readonly<{
      selected_refs: readonly string[];
      reviewed_by: string;
      reviewed_at: Date;
    }>
  ): Promise<MemoryContextReviewV1> {
    const reviewer = validReviewer(input.reviewed_by, input.reviewed_at);
    const plan = await this.store.readJson<MemoryQueryPlanV1>(`${this.base(queryId)}/plan.json`);
    const snapshot = await this.store.readJson<ContextSnapshotV1>(`${this.base(queryId)}/snapshot.json`);
    const available = new Set(snapshot.items.map((item) => item.context_ref));
    const selected = [...new Set(input.selected_refs)];
    if (selected.some((ref) => !available.has(ref))) {
      throw new HarnessError('CONTRACT_INVALID', 'selected ref is absent from the frozen context snapshot');
    }
    if (snapshot.status !== 'loaded' && selected.length > 0) {
      throw new HarnessError('CONTRACT_INVALID', 'unavailable or empty context cannot be selected');
    }
    const ordered = snapshot.items.map((item) => item.context_ref).filter((ref) => selected.includes(ref));
    const status: MemoryContextReviewV1['status'] = snapshot.status === 'unavailable' || snapshot.status === 'failed'
      ? 'memory_unavailable'
      : ordered.length > 0 ? 'applied' : 'reviewed_not_applied';
    const body = {
      schema_version: 'memory-context-review/v1' as const,
      query_id: queryId,
      query_plan_digest: plan.plan_digest,
      context_snapshot_digest: snapshot.snapshot_digest,
      selected_refs: ordered,
      status,
      reviewed_by: reviewer,
      reviewed_at: input.reviewed_at.toISOString()
    };
    const review: MemoryContextReviewV1 = { ...body, review_digest: sha256(body) };
    await this.store.writeNew(`${this.base(queryId)}/review.json`, review);
    const current = await this.queryStatus(queryId);
    const state = status === 'applied'
      ? transitionMemoryQueryState(current.state, 'context_reviewed')
      : status === 'reviewed_not_applied'
        ? transitionMemoryQueryState(current.state, 'memory_not_applied')
        : current.state;
    await this.writeStatus({ ...current, state, review_digest: review.review_digest, updated_at: this.now().toISOString() });
    return review;
  }

  unavailableContext(
    plan: MemoryQueryPlanV1,
    reviewer: string,
    reviewedAt: Date = this.now()
  ): MemoryContextV1 {
    return {
      query_plan_digest: plan.plan_digest,
      context_snapshot_digest: null,
      context_refs: [],
      status: 'memory_unavailable',
      reviewer: validReviewer(reviewer, reviewedAt),
      reviewed_at: reviewedAt.toISOString()
    };
  }

  async bindPackage(
    queryId: string,
    packageDraft: ResearchContentPackageV1_1
  ): Promise<ResearchContentPackageV1_1> {
    const plan = await this.store.readJson<MemoryQueryPlanV1>(`${this.base(queryId)}/plan.json`);
    const snapshot = await this.store.readJson<ContextSnapshotV1>(`${this.base(queryId)}/snapshot.json`);
    const review = await this.store.readJson<MemoryContextReviewV1>(`${this.base(queryId)}/review.json`);
    if (sha256(withoutDigest(review, 'review_digest')) !== review.review_digest) {
      throw new HarnessError('CONTRACT_INVALID', 'stored context review digest does not match');
    }
    let bound: ResearchContentPackageV1_1;
    if (review.status === 'memory_unavailable') {
      if (packageDraft.status !== 'draft') {
        throw new HarnessError('STATE_TRANSITION_INVALID', 'memory may bind to a draft package only');
      }
      bound = validatePackageMemoryBinding({
        ...packageDraft,
        memory_context: this.unavailableContext(plan, review.reviewed_by, new Date(review.reviewed_at))
      });
    } else {
      bound = bindMemoryContext(
        packageDraft, snapshot, review.selected_refs,
        review.reviewed_by, new Date(review.reviewed_at)
      );
    }
    const current = await this.queryStatus(queryId);
    if (review.status === 'applied') {
      await this.writeStatus({
        ...current,
        state: transitionMemoryQueryState(current.state, 'package_bound'),
        updated_at: this.now().toISOString()
      });
    }
    return bound;
  }

  async queryStatus(queryId: string): Promise<MemoryQueryStatusV1> {
    return this.store.readJson<MemoryQueryStatusV1>(`${this.base(queryId)}/status.json`);
  }
}
