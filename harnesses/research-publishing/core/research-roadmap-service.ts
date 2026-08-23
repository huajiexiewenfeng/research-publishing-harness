import { HarnessError } from './errors.js';
import { createResearchRoadmap } from './research-program-contracts.js';
import type {
  CreateResearchRoadmapInput,
  ResearchArtifactRefV1,
  ResearchRoadmapPort,
  ResearchRoadmapV1,
  ReviseResearchRoadmapInput
} from './research-program-types.js';
import { STABLE_ID_PATTERN } from './research-memory-contracts.js';
import type { WorkspaceStore } from './workspace-store.js';

function assertRoadmapId(roadmapId: string): void {
  if (!STABLE_ID_PATTERN.test(roadmapId)) {
    throw new HarnessError('CONTRACT_INVALID', 'Roadmap id must be an ASCII-safe stable id');
  }
}

function roadmapRoot(roadmapId: string): string {
  assertRoadmapId(roadmapId);
  return `program/roadmaps/${roadmapId}`;
}

function revisionPath(roadmapId: string, revision: number): string {
  return `${roadmapRoot(roadmapId)}/revisions/${revision}.json`;
}

function revisionRef(roadmap: ResearchRoadmapV1): ResearchArtifactRefV1 {
  return {
    path: revisionPath(roadmap.roadmap_id, roadmap.revision),
    digest: roadmap.roadmap_digest
  };
}

function refsEqual(
  left: ResearchArtifactRefV1 | null,
  right: ResearchArtifactRefV1
): boolean {
  return left !== null && left.path === right.path && left.digest === right.digest;
}

export class ResearchRoadmapService implements ResearchRoadmapPort {
  constructor(private readonly store: WorkspaceStore) {}

  async create(input: CreateResearchRoadmapInput): Promise<ResearchRoadmapV1> {
    const roadmap = createResearchRoadmap(input);
    if (roadmap.revision !== 1 || roadmap.previous_revision_ref !== null) {
      throw new HarnessError(
        'STATE_TRANSITION_INVALID',
        'A new Roadmap must start at revision one without a previous revision ref'
      );
    }
    const root = roadmapRoot(roadmap.roadmap_id);
    return this.store.withLock(`${root}/revision.lock`, async () => {
      await this.store.writeNew(revisionPath(roadmap.roadmap_id, 1), roadmap);
      const installed = await this.store.readJson<ResearchRoadmapV1>(
        revisionPath(roadmap.roadmap_id, 1)
      );
      await this.store.replaceAtomic(`${root}/current.json`, installed);
      return installed;
    });
  }

  async revise(input: ReviseResearchRoadmapInput): Promise<ResearchRoadmapV1> {
    const next = createResearchRoadmap(input.roadmap);
    const root = roadmapRoot(next.roadmap_id);
    return this.store.withLock(`${root}/revision.lock`, async () => {
      const current = await this.current(next.roadmap_id);
      if (input.confirmed_current_digest !== current.roadmap_digest) {
        throw new HarnessError(
          'APPROVAL_STALE',
          'Roadmap revision is not based on the current Roadmap digest'
        );
      }
      if (next.revision !== current.revision + 1) {
        throw new HarnessError(
          'STATE_TRANSITION_INVALID',
          'Roadmap revision must advance exactly one revision'
        );
      }
      if (!refsEqual(next.previous_revision_ref, revisionRef(current))) {
        throw new HarnessError(
          'APPROVAL_STALE',
          'Roadmap previous revision ref does not bind the current immutable revision'
        );
      }

      const nextPath = revisionPath(next.roadmap_id, next.revision);
      await this.store.writeNew(nextPath, next);
      const installed = await this.store.readJson<ResearchRoadmapV1>(nextPath);
      await this.store.replaceAtomic(`${root}/current.json`, installed);
      return installed;
    });
  }

  async current(roadmapId: string): Promise<ResearchRoadmapV1> {
    return this.store.readJson<ResearchRoadmapV1>(`${roadmapRoot(roadmapId)}/current.json`);
  }
}
