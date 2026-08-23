import { HarnessError } from './errors.js';
import {
  createResearchBacklogCatalog,
  createResearchTopicRevision
} from './research-program-contracts.js';
import { RESEARCH_PROGRAM_POLICY_V1 } from './research-program-policy.js';
import type {
  AddResearchTopicInput,
  CompleteResearchTopicInput,
  ReleaseResearchTopicInput,
  ResearchArtifactRefV1,
  ResearchBacklogCatalogV1,
  ResearchBacklogPort,
  ResearchRoadmapPort,
  ResearchRoadmapV1,
  ResearchTopicRevisionV1,
  ReserveResearchTopicInput,
  ReviseResearchTopicInput
} from './research-program-types.js';
import { STABLE_ID_PATTERN } from './research-memory-contracts.js';
import { validateContract } from './schema-validator.js';
import type { WorkspaceStore } from './workspace-store.js';

const TOPIC_REF_PATTERN = /^program\/backlog\/topics\/([a-z0-9][a-z0-9_-]*)\/revisions\/([1-9][0-9]*)\.json$/;

type MutablePartial<T> = { -readonly [Key in keyof T]?: T[Key] };

function fail(code: 'CONTRACT_INVALID' | 'STATE_TRANSITION_INVALID' | 'APPROVAL_STALE', message: string): never {
  throw new HarnessError(code, message);
}

function assertStableId(value: string, label: string): void {
  if (!STABLE_ID_PATTERN.test(value)) fail('CONTRACT_INVALID', `${label} must be an ASCII-safe stable id`);
}

function topicRoot(topicId: string): string {
  assertStableId(topicId, 'Topic id');
  return `program/backlog/topics/${topicId}`;
}

function topicRevisionPath(topicId: string, revision: number): string {
  return `${topicRoot(topicId)}/revisions/${revision}.json`;
}

function topicRef(topic: ResearchTopicRevisionV1): ResearchArtifactRefV1 {
  return {
    path: topicRevisionPath(topic.topic_id, topic.revision),
    digest: topic.revision_digest
  };
}

function sameRef(left: ResearchArtifactRefV1 | null, right: ResearchArtifactRefV1 | null): boolean {
  if (left === null || right === null) return left === right;
  return left.path === right.path && left.digest === right.digest;
}

function topicInputFromRevision(topic: ResearchTopicRevisionV1): AddResearchTopicInput {
  const input = { ...topic } as MutablePartial<ResearchTopicRevisionV1>;
  delete input.schema_version;
  delete input.revision_digest;
  return input as AddResearchTopicInput;
}

function catalogInputFromContract(catalog: ResearchBacklogCatalogV1) {
  const input = { ...catalog } as MutablePartial<ResearchBacklogCatalogV1>;
  delete input.schema_version;
  delete input.catalog_digest;
  return input as Omit<ResearchBacklogCatalogV1, 'schema_version' | 'catalog_digest'>;
}

function assertExactRef(actual: ResearchArtifactRefV1, expected: ResearchArtifactRefV1, label: string): void {
  if (!sameRef(actual, expected)) fail('APPROVAL_STALE', `${label} does not bind the current immutable revision`);
}

export class ResearchBacklogService implements ResearchBacklogPort {
  constructor(
    private readonly store: WorkspaceStore,
    private readonly roadmaps: ResearchRoadmapPort
  ) {}

  async add(input: AddResearchTopicInput): Promise<ResearchTopicRevisionV1> {
    const topic = createResearchTopicRevision(input);
    if (topic.revision !== 1 || topic.previous_revision_ref !== null) {
      fail('STATE_TRANSITION_INVALID', 'A new Topic must start at revision one without a previous revision ref');
    }
    await this.assertAgainstRoadmap(topic);
    return this.store.withLock(`${topicRoot(topic.topic_id)}/revision.lock`, async () => {
      const installed = await this.install(topic);
      await this.rebuildCatalog(topic.roadmap_id);
      return installed;
    });
  }

  async revise(input: ReviseResearchTopicInput): Promise<ResearchTopicRevisionV1> {
    const next = createResearchTopicRevision(input.topic);
    await this.assertAgainstRoadmap(next);
    return this.store.withLock(`${topicRoot(next.topic_id)}/revision.lock`, async () => {
      const current = await this.latest(next.topic_id);
      if (current.roadmap_id !== next.roadmap_id) {
        fail('STATE_TRANSITION_INVALID', 'Topic revisions cannot move between Roadmaps');
      }
      if (input.confirmed_current_digest !== current.revision_digest) {
        fail('APPROVAL_STALE', 'Topic revision is not based on the current Topic digest');
      }
      if (next.revision !== current.revision + 1) {
        fail('STATE_TRANSITION_INVALID', 'Topic revision must advance exactly one revision');
      }
      assertExactRef(next.previous_revision_ref!, topicRef(current), 'Topic previous revision ref');
      if (
        next.availability !== current.availability ||
        !sameRef(next.selection_ref, current.selection_ref) ||
        !sameRef(next.outcome_ref, current.outcome_ref)
      ) {
        fail(
          'STATE_TRANSITION_INVALID',
          'Topic availability and lifecycle refs may change only through reserve, release, or complete'
        );
      }
      const installed = await this.install(next);
      await this.rebuildCatalog(next.roadmap_id);
      return installed;
    });
  }

  async reserve(input: ReserveResearchTopicInput): Promise<ResearchTopicRevisionV1> {
    return this.transition(input.topic_ref, async (current) => {
      if (current.availability !== 'available') {
        fail('STATE_TRANSITION_INVALID', 'Only an available Topic may be reserved');
      }
      return createResearchTopicRevision({
        ...topicInputFromRevision(current),
        revision: current.revision + 1,
        previous_revision_ref: topicRef(current),
        availability: 'reserved',
        selection_ref: input.selection_ref,
        outcome_ref: null,
        changed_by: input.changed_by,
        change_reason: 'reserved for a confirmed Human Selection',
        created_at: input.changed_at
      });
    });
  }

  async release(input: ReleaseResearchTopicInput): Promise<ResearchTopicRevisionV1> {
    if (input.release_reason.trim().length === 0) {
      fail('CONTRACT_INVALID', 'Topic release requires an explicit recovery reason');
    }
    return this.transition(input.topic_ref, async (current) => {
      if (current.availability !== 'reserved') {
        fail('STATE_TRANSITION_INVALID', 'Only a reserved Topic may be released');
      }
      return createResearchTopicRevision({
        ...topicInputFromRevision(current),
        revision: current.revision + 1,
        previous_revision_ref: topicRef(current),
        availability: 'available',
        outcome_ref: null,
        changed_by: input.changed_by,
        change_reason: input.release_reason,
        created_at: input.changed_at
      });
    });
  }

  async complete(input: CompleteResearchTopicInput): Promise<ResearchTopicRevisionV1> {
    return this.transition(input.topic_ref, async (current) => {
      if (current.availability !== 'reserved') {
        fail('STATE_TRANSITION_INVALID', 'Only a reserved Topic may be completed');
      }
      return createResearchTopicRevision({
        ...topicInputFromRevision(current),
        revision: current.revision + 1,
        previous_revision_ref: topicRef(current),
        availability: 'completed',
        outcome_ref: input.outcome_ref,
        changed_by: input.changed_by,
        change_reason: 'completed with a bound Weekly Outcome',
        created_at: input.changed_at
      });
    });
  }

  async catalog(roadmapId: string): Promise<ResearchBacklogCatalogV1> {
    assertStableId(roadmapId, 'Roadmap id');
    const value = validateContract<ResearchBacklogCatalogV1>(
      'research-backlog-catalog',
      await this.store.readJson('program/backlog/catalog.json')
    );
    const verified = createResearchBacklogCatalog(catalogInputFromContract(value));
    if (verified.catalog_digest !== value.catalog_digest) {
      fail('APPROVAL_STALE', 'Backlog Catalog digest no longer matches its content');
    }
    const roadmap = await this.roadmaps.current(roadmapId);
    assertExactRef(value.roadmap_ref, this.roadmapRef(roadmap), 'Backlog Catalog Roadmap ref');
    return value;
  }

  async rebuildCatalog(roadmapId: string): Promise<ResearchBacklogCatalogV1> {
    assertStableId(roadmapId, 'Roadmap id');
    return this.store.withLock('program/backlog/catalog.lock', async () => {
      const roadmap = await this.roadmaps.current(roadmapId);
      const topics = await this.latestTopics(roadmapId);
      const entries = topics.map((topic) => ({
        topic_id: topic.topic_id,
        current_revision_ref: topicRef(topic),
        backlog_state: topic.backlog_state,
        availability: topic.availability,
        claim_status: topic.claim_status
      }));
      const counts = { evidence_ready: 0, researching: 0, long_term: 0 };
      for (const entry of entries) {
        if (entry.availability === 'available') counts[entry.backlog_state] += 1;
      }
      const catalog = createResearchBacklogCatalog({
        roadmap_ref: this.roadmapRef(roadmap),
        entries,
        counts,
        rebuilt_at: new Date().toISOString()
      });
      await this.store.replaceAtomic('program/backlog/catalog.json', catalog);
      return this.store.readJson<ResearchBacklogCatalogV1>('program/backlog/catalog.json');
    });
  }

  async assertCadenceReady(roadmapId: string): Promise<void> {
    const catalog = await this.catalog(roadmapId);
    if (catalog.counts.evidence_ready < RESEARCH_PROGRAM_POLICY_V1.minimum_evidence_ready_topics) {
      throw new HarnessError(
        'RESEARCH_GATE_BLOCKED',
        `Cadence requires at least ${RESEARCH_PROGRAM_POLICY_V1.minimum_evidence_ready_topics} available Evidence Ready Topics`
      );
    }
  }

  private async transition(
    ref: ResearchArtifactRefV1,
    build: (current: ResearchTopicRevisionV1) => Promise<ResearchTopicRevisionV1>
  ): Promise<ResearchTopicRevisionV1> {
    const match = TOPIC_REF_PATTERN.exec(ref.path);
    if (match === null) fail('APPROVAL_STALE', 'Topic ref path is not a canonical Topic revision path');
    const topicId = match[1]!;
    return this.store.withLock(`${topicRoot(topicId)}/revision.lock`, async () => {
      const current = await this.latest(topicId);
      assertExactRef(ref, topicRef(current), 'Topic lifecycle ref');
      const next = await build(current);
      await this.assertAgainstRoadmap(next);
      const installed = await this.install(next);
      await this.rebuildCatalog(next.roadmap_id);
      return installed;
    });
  }

  private async install(topic: ResearchTopicRevisionV1): Promise<ResearchTopicRevisionV1> {
    const path = topicRevisionPath(topic.topic_id, topic.revision);
    await this.store.writeNew(path, topic);
    return this.readRevision(path);
  }

  private async latest(topicId: string): Promise<ResearchTopicRevisionV1> {
    const entries = await this.store.list(`${topicRoot(topicId)}/revisions`);
    const revisions = entries
      .filter((entry) => entry.kind === 'file' && /^[1-9][0-9]*\.json$/.test(entry.name))
      .map((entry) => Number.parseInt(entry.name.slice(0, -5), 10))
      .sort((left, right) => right - left);
    if (revisions.length === 0) {
      throw new HarnessError('ARTIFACT_NOT_FOUND', `Topic has no immutable revisions: ${topicId}`);
    }
    return this.readRevision(topicRevisionPath(topicId, revisions[0]!));
  }

  private async latestTopics(roadmapId: string): Promise<readonly ResearchTopicRevisionV1[]> {
    const topicEntries = await this.store.list('program/backlog/topics');
    const topics: ResearchTopicRevisionV1[] = [];
    for (const entry of topicEntries) {
      if (entry.kind !== 'directory' || !STABLE_ID_PATTERN.test(entry.name)) continue;
      const topic = await this.latest(entry.name);
      if (topic.roadmap_id === roadmapId) topics.push(topic);
    }
    return topics.sort((left, right) => left.topic_id.localeCompare(right.topic_id));
  }

  private async readRevision(path: string): Promise<ResearchTopicRevisionV1> {
    const value = validateContract<ResearchTopicRevisionV1>(
      'research-topic-revision',
      await this.store.readJson(path)
    );
    const verified = createResearchTopicRevision(topicInputFromRevision(value));
    if (verified.revision_digest !== value.revision_digest) {
      fail('APPROVAL_STALE', 'Topic revision digest no longer matches its content');
    }
    if (path !== topicRevisionPath(value.topic_id, value.revision)) {
      fail('APPROVAL_STALE', 'Topic revision content does not match its immutable path');
    }
    return value;
  }

  private async assertAgainstRoadmap(topic: ResearchTopicRevisionV1): Promise<void> {
    const roadmap = await this.roadmaps.current(topic.roadmap_id);
    const streamIds = new Set(roadmap.research_streams.map((stream) => stream.stream_id));
    if (topic.stream_ids.some((streamId) => !streamIds.has(streamId))) {
      fail('CONTRACT_INVALID', 'Topic references a Stream outside its current Roadmap');
    }
  }

  private roadmapRef(roadmap: ResearchRoadmapV1): ResearchArtifactRefV1 {
    return {
      path: `program/roadmaps/${roadmap.roadmap_id}/revisions/${roadmap.revision}.json`,
      digest: roadmap.roadmap_digest
    };
  }
}
