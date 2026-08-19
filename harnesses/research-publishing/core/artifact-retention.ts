import type { BrowserExecutionState } from './browser-execution.js';
import { HarnessError } from './errors.js';
import { ExecutionStore } from './execution-store.js';
import type { WorkspaceEntry, WorkspaceStore } from './workspace-store.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const DIGEST = /^sha256:[a-f0-9]{64}$/;

const TERMINAL_STATES = new Set<BrowserExecutionState>([
  'finalized',
  'partial',
  'failed_after_submit',
  'verification_conflict',
  'cancelled_before_submit'
]);

interface ArtifactPolicy {
  readonly folder: string;
  readonly timestamp: string;
  readonly retention_ms: number;
}

const POLICIES: readonly ArtifactPolicy[] = [
  { folder: 'commands', timestamp: 'issued_at', retention_ms: THIRTY_DAYS_MS },
  { folder: 'claims', timestamp: 'claimed_at', retention_ms: THIRTY_DAYS_MS },
  { folder: 'results', timestamp: 'reported_at', retention_ms: THIRTY_DAYS_MS },
  { folder: 'observations', timestamp: 'observed_at', retention_ms: THIRTY_DAYS_MS },
  { folder: 'diagnostics', timestamp: 'created_at', retention_ms: SEVEN_DAYS_MS }
];

export interface ArtifactRetentionReport {
  readonly schema_version: '2.0';
  readonly pruned_at: string;
  readonly deleted_paths: readonly string[];
  readonly deleted_bytes: number;
  readonly skipped_resumable_executions: readonly string[];
  readonly retained_audit_artifacts: number;
}

export async function pruneBrowserArtifacts(
  store: WorkspaceStore,
  now = new Date()
): Promise<ArtifactRetentionReport> {
  if (!Number.isFinite(now.getTime())) {
    throw new HarnessError('CONTRACT_INVALID', 'retention time must be valid');
  }
  const executions = new ExecutionStore(store);
  const deletedPaths: string[] = [];
  const skipped = new Set<string>();
  let deletedBytes = 0;
  let retainedAuditArtifacts = 0;

  for (const run of await directories(store, 'runs')) {
    const browserRoot = `${run.relative_path}/x/browser`;
    for (const execution of await directories(store, browserRoot)) {
      const snapshot = await executions.read(execution.name);
      if (snapshot.run_id !== run.name || snapshot.execution_id !== execution.name) {
        throw new HarnessError(
          'CONTRACT_INVALID',
          `browser execution locator does not match directory: ${execution.relative_path}`
        );
      }
      if (!TERMINAL_STATES.has(snapshot.state)) {
        skipped.add(snapshot.execution_id);
        continue;
      }

      retainedAuditArtifacts += (await store.list(execution.relative_path)).filter(
        (entry) => entry.kind === 'file' && entry.name !== 'execution.lock'
      ).length;
      for (const policy of POLICIES) {
        const folder = `${execution.relative_path}/${policy.folder}`;
        for (const artifact of await store.list(folder)) {
          if (artifact.kind !== 'file') continue;
          const value = await store.readJson<Record<string, unknown>>(artifact.relative_path);
          if (policy.folder === 'diagnostics') validateDiagnostic(value, artifact.relative_path);
          const timestamp = value[policy.timestamp];
          if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) {
            throw new HarnessError(
              'CONTRACT_INVALID',
              `retention timestamp is invalid: ${artifact.relative_path}`
            );
          }
          if (now.getTime() - Date.parse(timestamp) <= policy.retention_ms) continue;
          deletedBytes += await store.removeFile(artifact.relative_path);
          deletedPaths.push(artifact.relative_path);
        }
      }
    }
  }

  return {
    schema_version: '2.0',
    pruned_at: now.toISOString(),
    deleted_paths: deletedPaths.sort(),
    deleted_bytes: deletedBytes,
    skipped_resumable_executions: [...skipped].sort(),
    retained_audit_artifacts: retainedAuditArtifacts
  };
}

async function directories(store: WorkspaceStore, path: string): Promise<readonly WorkspaceEntry[]> {
  return (await store.list(path)).filter((entry) => entry.kind === 'directory');
}

function validateDiagnostic(value: Record<string, unknown>, path: string): void {
  const created = value['created_at'];
  const expires = value['expires_at'];
  if (
    value['local_only'] !== true ||
    typeof value['digest'] !== 'string' ||
    !DIGEST.test(value['digest']) ||
    typeof created !== 'string' ||
    !Number.isFinite(Date.parse(created)) ||
    typeof expires !== 'string' ||
    !Number.isFinite(Date.parse(expires))
  ) {
    throw new HarnessError('CONTRACT_INVALID', `diagnostic metadata is invalid: ${path}`);
  }
}
