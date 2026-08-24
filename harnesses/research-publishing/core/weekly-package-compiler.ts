import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { validatePackageMemoryBinding } from './memory-package.js';
import {
  createWeeklyCandidateSet,
  createWeeklyCycleStatus,
  createWeeklyResearchCycle,
  createWeeklyTopicSelection
} from './research-program-contracts.js';
import type {
  CreateWeeklyCycleStatusInput,
  OpenWeeklyCycleInput,
  SelectWeeklyTopicInput,
  SubmitWeeklyCandidatesInput,
  WeeklyCandidateSetV1,
  WeeklyCycleStatusV1,
  WeeklyResearchCycleV1,
  WeeklyTopicSelectionV1
} from './research-program-types.js';
import type { ResearchContextReviewV2 } from './research-query-types.js';
import { STABLE_ID_PATTERN } from './research-memory-contracts.js';
import { validateContract } from './schema-validator.js';
import type {
  CompileWeeklyPackageInput,
  ResearchContentPackageV1_2,
  WeeklyPackageCompilerPort
} from './types.js';
import type { ContractName } from './types.js';
import type { WorkspaceStore } from './workspace-store.js';

function omitFields(value: object, fields: readonly string[]): Record<string, unknown> {
  const body = { ...(value as Record<string, unknown>) };
  for (const field of fields) delete body[field];
  return body;
}

function fail(message: string): never {
  throw new HarnessError('APPROVAL_STALE', message);
}

export class WeeklyPackageCompiler implements WeeklyPackageCompilerPort {
  constructor(private readonly store: WorkspaceStore) {}

  async compile(input: CompileWeeklyPackageInput): Promise<ResearchContentPackageV1_2> {
    if (!STABLE_ID_PATTERN.test(input.cycle_id)) {
      throw new HarnessError('CONTRACT_INVALID', 'Weekly Cycle id must be stable');
    }
    const root = `program/weeks/${input.cycle_id}`;
    const cycle = await this.readCycle(root, input.cycle_id);
    const candidateSet = await this.readCandidateSet(root, input.cycle_id);
    const selection = await this.readSelection(root, candidateSet);
    if (
      candidateSet.candidate_set_digest !== input.candidate_set_digest ||
      selection.selection_digest !== input.selection_digest ||
      selection.selected_brief_id !== input.selected_brief_id
    ) {
      fail('Compile input does not bind the exact Candidate Set and Human Selection');
    }
    const selected = candidateSet.candidates.find(
      (candidate) => candidate.brief_id === input.selected_brief_id
    );
    if (selected === undefined) fail('Human-selected Candidate Brief is absent');
    const review = await this.readReview(cycle);

    const packageValue = validatePackageMemoryBinding(
      validateContract<ResearchContentPackageV1_2>('research-content-package', {
        ...input.package,
        schema_version: '1.2',
        topic: selected.working_title,
        thesis: { summary: selected.thesis, claim_status: selected.claim_status },
        memory_context: {
          schema_version: 'memory-context/v2',
          research_query_plan_digest: cycle.context_binding.plan_digest,
          research_context_snapshot_digest: cycle.context_binding.snapshot_digest,
          context_refs: [...cycle.context_binding.selected_context_refs],
          status: cycle.context_binding.application_status,
          reviewer: review.reviewer,
          reviewed_at: review.reviewed_at
        },
        research_program_binding: {
          roadmap_ref: cycle.roadmap_ref,
          topic_ref: selected.topic_ref,
          candidate_set_ref: {
            path: `${root}/candidates.json`,
            digest: candidateSet.candidate_set_digest
          },
          selection_ref: {
            path: `${root}/selection.json`,
            digest: selection.selection_digest
          }
        }
      })
    );
    await this.store.writeNew(`${root}/package.json`, packageValue);
    const installed = await this.readContract<ResearchContentPackageV1_2>(
      `${root}/package.json`, 'research-content-package'
    );
    if (sha256(installed) !== sha256(packageValue)) fail('Installed V1.2 Package changed after write');
    await this.projectStatusIfPresent(root, cycle, candidateSet, selection, installed);
    return installed;
  }

  private async readCycle(root: string, cycleId: string): Promise<WeeklyResearchCycleV1> {
    const value = await this.readContract<WeeklyResearchCycleV1>(`${root}/cycle.json`, 'weekly-research-cycle');
    const verified = createWeeklyResearchCycle(
      omitFields(value, ['schema_version', 'cycle_digest']) as OpenWeeklyCycleInput
    );
    if (value.cycle_id !== cycleId || value.cycle_digest !== verified.cycle_digest) {
      fail('Weekly Cycle path or digest is stale');
    }
    return value;
  }

  private async readCandidateSet(root: string, cycleId: string): Promise<WeeklyCandidateSetV1> {
    const value = await this.readContract<WeeklyCandidateSetV1>(`${root}/candidates.json`, 'weekly-candidate-set');
    const verified = createWeeklyCandidateSet(
      omitFields(value, ['schema_version', 'candidate_set_digest']) as SubmitWeeklyCandidatesInput
    );
    if (value.cycle_id !== cycleId || value.candidate_set_digest !== verified.candidate_set_digest) {
      fail('Candidate Set path or digest is stale');
    }
    return value;
  }

  private async readSelection(
    root: string,
    candidateSet: WeeklyCandidateSetV1
  ): Promise<WeeklyTopicSelectionV1> {
    const value = await this.readContract<WeeklyTopicSelectionV1>(`${root}/selection.json`, 'weekly-topic-selection');
    const verified = createWeeklyTopicSelection(
      candidateSet,
      omitFields(value, ['schema_version', 'selection_id', 'selection_digest']) as unknown as SelectWeeklyTopicInput
    );
    if (value.selection_digest !== verified.selection_digest) fail('Topic Selection digest is stale');
    return value;
  }

  private async readReview(cycle: WeeklyResearchCycleV1): Promise<ResearchContextReviewV2> {
    const value = await this.readContract<ResearchContextReviewV2>(
      `memory/queries-v2/${cycle.context_binding.query_id}/review.json`,
      'research-context-review-v2'
    );
    const body = omitFields(value, ['review_digest']);
    if (
      value.review_digest !== sha256(body) ||
      value.review_digest !== cycle.context_binding.review_digest ||
      value.query_plan_digest !== cycle.context_binding.plan_digest ||
      value.snapshot_digest !== cycle.context_binding.snapshot_digest ||
      sha256(value.selected_context_refs) !== sha256(cycle.context_binding.selected_context_refs)
    ) {
      fail('Reviewed Context no longer matches the Weekly Cycle binding');
    }
    return value;
  }

  private async projectStatusIfPresent(
    root: string,
    cycle: WeeklyResearchCycleV1,
    candidateSet: WeeklyCandidateSetV1,
    selection: WeeklyTopicSelectionV1,
    packageValue: ResearchContentPackageV1_2
  ): Promise<void> {
    const path = `${root}/status.json`;
    if (!await this.store.exists(path)) return;
    const current = await this.readContract<WeeklyCycleStatusV1>(path, 'weekly-cycle-status');
    const input: CreateWeeklyCycleStatusInput = {
      ...omitFields(current, ['schema_version', 'projection_digest']) as unknown as CreateWeeklyCycleStatusInput,
      cycle_ref: { path: `${root}/cycle.json`, digest: cycle.cycle_digest },
      phase: 'package_compiled',
      candidate_set_ref: { path: `${root}/candidates.json`, digest: candidateSet.candidate_set_digest },
      selection_ref: { path: `${root}/selection.json`, digest: selection.selection_digest },
      package_ref: { path: `${root}/package.json`, digest: sha256(packageValue) },
      blocked_reason: null,
      updated_at: packageValue.updated_at
    };
    await this.store.replaceAtomic(path, createWeeklyCycleStatus(input));
  }

  private async readContract<T>(path: string, contract: ContractName): Promise<T> {
    const artifact = await this.store.readContainedArtifact(path);
    let value: unknown;
    try {
      value = JSON.parse(artifact.content.toString('utf8'));
    } catch {
      throw new HarnessError('CONTRACT_INVALID', `${contract} is not valid JSON`);
    }
    return validateContract<T>(contract, value);
  }
}
