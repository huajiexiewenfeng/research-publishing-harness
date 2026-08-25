import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { validateContract } from './schema-validator.js';
import type {
  CreateWeeklyOutcomeClosureInput,
  CreateWeeklyOutcomeStatusInput,
  CreateWeeklyPublicationOutcomeInput,
  WeeklyOutcomeClosureV1,
  WeeklyOutcomeStatusV1,
  WeeklyPublicationOutcomeV1
} from './weekly-outcome-types.js';

const STABLE_ID = /^[a-z0-9][a-z0-9_-]*$/;
const SAFE_PATH_SEGMENT = /^[a-zA-Z0-9._-]+$/;

function fail(message: string): never {
  throw new HarnessError('CONTRACT_INVALID', message);
}

function assertSafeRelativePath(path: string, label: string): void {
  if (
    path.length === 0 || path.includes('\\') || path.startsWith('/') ||
    /^[A-Za-z]:/.test(path) || path.split('/').some(
      (segment) => segment.length === 0 || segment === '..' || segment === '.' ||
        !SAFE_PATH_SEGMENT.test(segment)
    )
  ) {
    fail(`${label} must be a safe workspace-relative path`);
  }
}

function assertRef(
  ref: { readonly path: string; readonly digest: string },
  label: string
): void {
  assertSafeRelativePath(ref.path, `${label} path`);
  if (!/^sha256:[a-f0-9]{64}$/.test(ref.digest)) {
    fail(`${label} digest must be a canonical SHA-256 digest`);
  }
}

function cycleIdFromPath(path: string): string {
  const match = /^program\/weeks\/([a-z0-9][a-z0-9_-]*)\/cycle\.json$/.exec(path);
  if (match === null) fail('Weekly Outcome requires a canonical Weekly Cycle ref');
  return match[1]!;
}

function assertUniqueStrings(values: readonly string[], label: string): void {
  if (values.some((value) => value.trim().length === 0)) {
    fail(`${label} must contain only non-empty values`);
  }
  if (new Set(values).size !== values.length) {
    fail(`${label} must be unique`);
  }
}

function assertOutcomeInvariants(outcome: WeeklyPublicationOutcomeV1): void {
  if (!STABLE_ID.test(outcome.outcome_id)) fail('Weekly Outcome id is invalid');
  const cycleId = cycleIdFromPath(outcome.cycle_ref.path);
  const cycleRoot = `program/weeks/${cycleId}/`;
  for (const [label, ref] of [
    ['Cycle', outcome.cycle_ref],
    ['Roadmap', outcome.roadmap_ref],
    ['Topic', outcome.topic_ref],
    ['Selection', outcome.selection_ref],
    ['Research Content Package', outcome.research_content_package_ref],
    ['Weekly Article', outcome.weekly_article_ref],
    ['Article Package', outcome.article_package_ref],
    ['Bundle Plan', outcome.bundle_plan_ref],
    ['Bundle Approval', outcome.bundle_approval_ref],
    ['Bundle Receipt', outcome.bundle_receipt_ref],
    ['Article Plan', outcome.article.plan_ref],
    ['Article Receipt', outcome.article.receipt_ref],
    ['Single Plan', outcome.single.plan_ref],
    ['Single Receipt', outcome.single.receipt_ref]
  ] as const) {
    assertRef(ref, label);
  }
  for (const ref of [
    outcome.selection_ref,
    outcome.research_content_package_ref,
    outcome.weekly_article_ref
  ]) {
    if (!ref.path.startsWith(cycleRoot)) {
      fail('Weekly Outcome Program refs must belong to the exact Weekly Cycle');
    }
  }
  if (
    outcome.public_urls.length !== 2 ||
    outcome.public_urls[0] !== outcome.article.public_url ||
    outcome.public_urls[1] !== outcome.single.public_url
  ) {
    fail('Weekly Outcome public URL order is invalid');
  }
  for (const [label, child] of [
    ['Article', outcome.article],
    ['Single', outcome.single]
  ] as const) {
    if (!child.public_url.startsWith('https://')) fail(`${label} public URL must use HTTPS`);
    if (child.verification_status.trim().length === 0) {
      fail(`${label} verification status is required`);
    }
    assertUniqueStrings(child.limitations, `${label} limitations`);
  }
  assertUniqueStrings(outcome.research_stream_ids, 'Research Stream ids');
  if (outcome.research_stream_ids.length === 0) fail('Weekly Outcome requires a Research Stream');
  assertUniqueStrings(outcome.package_claim_refs, 'Package Claim refs');
  assertUniqueStrings(outcome.package_evidence_refs, 'Package Evidence refs');
  assertUniqueStrings(outcome.package_boundary_refs, 'Package Boundary refs');
  assertUniqueStrings(outcome.package_open_question_refs, 'Package Open Question refs');
}

export function createWeeklyPublicationOutcome(
  input: CreateWeeklyPublicationOutcomeInput
): WeeklyPublicationOutcomeV1 {
  const body = {
    schema_version: 'weekly-publication-outcome/v1' as const,
    ...input,
    public_urls: [input.article.public_url, input.single.public_url] as const
  };
  const outcome: WeeklyPublicationOutcomeV1 = {
    ...body,
    outcome_digest: sha256(body)
  };
  assertOutcomeInvariants(outcome);
  return validateContract<WeeklyPublicationOutcomeV1>('weekly-publication-outcome', outcome);
}

export function assertWeeklyPublicationOutcome(outcome: WeeklyPublicationOutcomeV1): void {
  validateContract<WeeklyPublicationOutcomeV1>('weekly-publication-outcome', outcome);
  assertOutcomeInvariants(outcome);
  const { outcome_digest, public_urls: _publicUrls, ...input } = outcome;
  const recreated = createWeeklyPublicationOutcome(input);
  if (recreated.outcome_digest !== outcome_digest) {
    fail('Weekly Outcome digest mismatch');
  }
}

export function outcomeReleaseReason(outcome: WeeklyPublicationOutcomeV1): string {
  assertWeeklyPublicationOutcome(outcome);
  return `released after Weekly Outcome ${outcome.outcome_id}@${outcome.outcome_digest}`;
}

export function createWeeklyOutcomeClosure(
  input: CreateWeeklyOutcomeClosureInput
): WeeklyOutcomeClosureV1 {
  assertRef(input.outcome_ref, 'Outcome');
  assertRef(input.released_topic_ref, 'Released Topic');
  if (!/^program\/weeks\/[a-z0-9][a-z0-9_-]*\/outcome\.json$/.test(input.outcome_ref.path)) {
    fail('Weekly Outcome Closure requires a canonical Outcome ref');
  }
  if (!/^program\/backlog\/topics\/[a-z0-9][a-z0-9_-]*\/revisions\/[1-9][0-9]*\.json$/.test(input.released_topic_ref.path)) {
    fail('Weekly Outcome Closure requires a canonical released Topic revision ref');
  }
  const body = {
    schema_version: 'weekly-outcome-closure/v1' as const,
    ...input,
    status: 'complete' as const
  };
  return validateContract<WeeklyOutcomeClosureV1>('weekly-outcome-closure', {
    ...body,
    closure_digest: sha256(body)
  });
}

export function assertWeeklyOutcomeClosure(closure: WeeklyOutcomeClosureV1): void {
  validateContract<WeeklyOutcomeClosureV1>('weekly-outcome-closure', closure);
  const { closure_digest, status: _status, schema_version: _schema, ...input } = closure;
  if (createWeeklyOutcomeClosure(input).closure_digest !== closure_digest) {
    fail('Weekly Outcome Closure digest mismatch');
  }
}

export function createWeeklyOutcomeStatus(
  input: CreateWeeklyOutcomeStatusInput
): WeeklyOutcomeStatusV1 {
  if (!STABLE_ID.test(input.cycle_id)) fail('Weekly Outcome Status cycle id is invalid');
  if (input.outcome_ref !== null) assertRef(input.outcome_ref, 'Outcome Status Outcome');
  if (input.released_topic_ref !== null) assertRef(input.released_topic_ref, 'Outcome Status Topic');
  if (input.phase === 'complete' && (
    input.outcome_ref === null || input.released_topic_ref === null || input.blocked_reason !== null
  )) {
    fail('complete Weekly Outcome Status requires Outcome and released Topic refs');
  }
  if (input.phase === 'pending' && (
    input.outcome_ref !== null || input.released_topic_ref !== null || input.blocked_reason !== null
  )) {
    fail('pending Weekly Outcome Status cannot contain completed or blocked state');
  }
  if (input.phase === 'conflict' && input.blocked_reason?.trim().length === 0) {
    fail('conflict Weekly Outcome Status requires a blocked reason');
  }
  const body = { schema_version: 'weekly-outcome-status/v1' as const, ...input };
  return validateContract<WeeklyOutcomeStatusV1>('weekly-outcome-status', {
    ...body,
    projection_digest: sha256(body)
  });
}
