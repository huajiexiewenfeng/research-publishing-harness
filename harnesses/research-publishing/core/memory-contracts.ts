import { randomUUID } from 'node:crypto';

import { sha256, sha256Bytes } from './digest.js';
import { validateContract } from './schema-validator.js';
import type {
  ContextSnapshotV1,
  Digest,
  MemoryQueryPlanInput,
  MemoryQueryPlanV1,
  RuntimeContextResult
} from './memory-types.js';

function digestValue(value: unknown): Digest {
  return sha256(value) as Digest;
}

export function createMemoryQueryPlan(
  input: MemoryQueryPlanInput,
  ids: Readonly<{
    queryId?: () => string;
    runId?: () => string;
    now?: () => Date;
  }> = {}
): MemoryQueryPlanV1 {
  const body = {
    schema_version: 'memory-query-plan/v1' as const,
    query_id: ids.queryId?.() ?? `query_${randomUUID().replaceAll('-', '')}`,
    run_id: ids.runId?.() ?? `run_${randomUUID().replaceAll('-', '')}`,
    ...input,
    action: 'query_once' as const,
    created_at: (ids.now?.() ?? new Date()).toISOString()
  };
  return validateContract<MemoryQueryPlanV1>('memory-query-plan', {
    ...body,
    plan_digest: digestValue(body)
  });
}

export function createContextSnapshot(
  plan: MemoryQueryPlanV1,
  result: RuntimeContextResult,
  ids: Readonly<{ snapshotId?: () => string }> = {}
): ContextSnapshotV1 {
  const items = [...result.items]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((item, index) => ({
      ordinal: index + 1,
      context_ref: `llm-wiki:${item.path}@${item.checksum}`,
      relative_path: item.path,
      content_checksum: item.checksum,
      excerpt_checksum: sha256Bytes(Buffer.from(item.content, 'utf8')) as Digest,
      excerpt: item.content,
      classification: 'data_only' as const,
      sanitized: item.sanitized,
      risk_flags: [...item.risk_flags]
    }));
  const body = {
    schema_version: 'context-snapshot/v1' as const,
    snapshot_id: ids.snapshotId?.() ?? `snapshot_${randomUUID().replaceAll('-', '')}`,
    query_plan_digest: plan.plan_digest,
    runtime_version: result.runtime_version,
    status: result.status,
    items,
    excluded_count: result.excluded_count,
    truncated_count: result.truncated_count,
    total_chars: items.reduce((total, item) => total + item.excerpt.length, 0)
  };
  return validateContract<ContextSnapshotV1>('context-snapshot', {
    ...body,
    snapshot_digest: digestValue(body)
  });
}
