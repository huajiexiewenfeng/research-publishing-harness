import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { RESEARCH_PROGRAM_POLICY_V1 } from './research-program-policy.js';
import { STABLE_ID_PATTERN } from './research-memory-contracts.js';
import { validateContract } from './schema-validator.js';
const LOCKED_STREAM_IDS = new Set([
    'knowledge_runtime_governance',
    'project_harness_lifecycle',
    'skill_cognitive_runtime',
    'runtime_evolution',
    'enterprise_validation'
]);
const LOCKED_STAGE_IDS = new Set([
    'week_01_04_wiki_contract',
    'week_05_12_failure_trace',
    'week_13_20_trace_eval',
    'week_21_24_synthesis'
]);
function fail(message) {
    throw new HarnessError('CONTRACT_INVALID', message);
}
function assertStableId(value, label) {
    if (!STABLE_ID_PATTERN.test(value)) {
        fail(`${label} must be an ASCII-safe stable id`);
    }
}
function assertUnique(values, label) {
    if (new Set(values).size !== values.length) {
        fail(`${label} must be unique`);
    }
}
function refKey(ref) {
    return `${ref.path}\u0000${ref.digest}`;
}
function assertUniqueRefs(refs, label) {
    assertUnique(refs.map(refKey), label);
}
function assertRevisionChain(revision, previousRevisionRef, label) {
    if (revision === 1 && previousRevisionRef !== null) {
        fail(`${label} revision one cannot have a previous revision ref`);
    }
    if (revision > 1 && previousRevisionRef === null) {
        fail(`${label} revision greater than one requires a previous revision ref`);
    }
}
function requiresEvidence(status) {
    return status === 'shipped' || status === 'validated';
}
function codePointLength(value) {
    return Array.from(value).length;
}
function assertRoadmapSemantics(input) {
    assertStableId(input.roadmap_id, 'Roadmap id');
    assertRevisionChain(input.revision, input.previous_revision_ref, 'Roadmap');
    if (input.research_streams.length !== LOCKED_STREAM_IDS.size) {
        fail('Roadmap requires five Research Streams');
    }
    const streamIds = input.research_streams.map((stream) => stream.stream_id);
    assertUnique(streamIds, 'Research Stream ids');
    if (streamIds.some((streamId) => !LOCKED_STREAM_IDS.has(streamId))) {
        fail('Roadmap must contain the five locked Research Streams');
    }
    for (const stream of input.research_streams) {
        assertUnique(stream.project_refs, `${stream.stream_id} project refs`);
        assertUnique(stream.research_questions, `${stream.stream_id} research questions`);
        assertUnique(stream.relationship_notes, `${stream.stream_id} relationship notes`);
    }
    if (input.research_stages.length !== LOCKED_STAGE_IDS.size) {
        fail('Roadmap requires four Research Stages');
    }
    const stageIds = input.research_stages.map((stage) => stage.stage_id);
    assertUnique(stageIds, 'Research Stage ids');
    if (stageIds.some((stageId) => !LOCKED_STAGE_IDS.has(stageId))) {
        fail('Roadmap must contain the four locked Research Stages');
    }
    let expectedWeek = 1;
    for (const stage of [...input.research_stages].sort((left, right) => left.start_week - right.start_week)) {
        if (stage.start_week !== expectedWeek ||
            stage.end_week < stage.start_week ||
            stage.window_role !== 'target_only' ||
            stage.progression_mode !== 'evidence_gated') {
            fail('Research Stages must be contiguous evidence-gated target windows');
        }
        assertUnique(stage.completion_signals, `${stage.stage_id} completion signals`);
        assertUnique(stage.evidence_refs, `${stage.stage_id} evidence refs`);
        if (requiresEvidence(stage.capability_status) && stage.evidence_refs.length === 0) {
            fail('shipped or validated Research Stages require evidence');
        }
        expectedWeek = stage.end_week + 1;
    }
    if (expectedWeek !== RESEARCH_PROGRAM_POLICY_V1.horizon_weeks + 1) {
        fail('Research Stages must cover weeks one through twenty-four exactly once');
    }
    if (input.article_slots.length !== RESEARCH_PROGRAM_POLICY_V1.horizon_weeks) {
        fail('Roadmap requires twenty-four Article Slots');
    }
    assertUnique(input.article_slots.map((slot) => slot.slot_id), 'Article Slot ids');
    assertUnique(input.article_slots.map((slot) => String(slot.week_number)), 'Article Slot weeks');
    const slots = [...input.article_slots].sort((left, right) => left.week_number - right.week_number);
    for (let index = 0; index < slots.length; index += 1) {
        const slot = slots[index];
        const week = index + 1;
        const expectedMonth = `month_${String(Math.floor(index / 4) + 1).padStart(2, '0')}`;
        if (slot.week_number !== week || slot.month_id !== expectedMonth) {
            fail('Article Slots must map weeks one through twenty-four into six four-slot months');
        }
        const abstractLength = codePointLength(slot.planning_abstract);
        if (abstractLength < 40 || abstractLength > 600) {
            fail('Article Slot planning abstract must contain 40 to 600 code points');
        }
        assertUnique(slot.stream_ids, `${slot.slot_id} stream ids`);
        if (slot.stream_ids.length === 0 || slot.stream_ids.some((id) => !LOCKED_STREAM_IDS.has(id))) {
            fail('Article Slot stream ids must resolve to the locked Roadmap Streams');
        }
        assertUnique(slot.evidence_refs, `${slot.slot_id} evidence refs`);
        if (requiresEvidence(slot.capability_status) && slot.evidence_refs.length === 0) {
            fail('shipped or validated Article Slots require evidence');
        }
    }
    for (let month = 1; month <= RESEARCH_PROGRAM_POLICY_V1.horizon_months; month += 1) {
        const monthId = `month_${String(month).padStart(2, '0')}`;
        const monthLayers = input.article_slots
            .filter((slot) => slot.month_id === monthId)
            .map((slot) => slot.article_layer);
        if (monthLayers.length !== RESEARCH_PROGRAM_POLICY_V1.monthly_layers.length ||
            new Set(monthLayers).size !== RESEARCH_PROGRAM_POLICY_V1.monthly_layers.length ||
            RESEARCH_PROGRAM_POLICY_V1.monthly_layers.some((layer) => !monthLayers.includes(layer))) {
            fail('Every month requires the four monthly Article layers');
        }
    }
    assertUnique(input.prologue_refs, 'Roadmap prologue refs');
    assertUnique(input.non_goals, 'Roadmap non-goals');
}
export function createResearchRoadmap(input) {
    assertRoadmapSemantics(input);
    const body = { schema_version: 'research-roadmap/v1', ...input };
    return validateContract('research-roadmap', {
        ...body,
        roadmap_digest: sha256(body)
    });
}
export function createResearchTopicRevision(input) {
    assertStableId(input.topic_id, 'Topic id');
    assertStableId(input.roadmap_id, 'Roadmap id');
    assertRevisionChain(input.revision, input.previous_revision_ref, 'Topic');
    assertUnique(input.stream_ids, 'Topic stream ids');
    assertUnique(input.evidence_refs, 'Topic evidence refs');
    assertUnique(input.boundary_notes, 'Topic boundary notes');
    assertUnique(input.source_refs, 'Topic source refs');
    if (input.stream_ids.length === 0 || input.stream_ids.some((id) => !LOCKED_STREAM_IDS.has(id))) {
        fail('Topic stream ids must use locked Research Streams');
    }
    if (input.backlog_state === 'evidence_ready' &&
        (input.evidence_refs.length === 0 || input.boundary_notes.length === 0)) {
        fail('Evidence Ready Topics require evidence and a boundary note');
    }
    if (requiresEvidence(input.claim_status) && input.evidence_refs.length === 0) {
        fail('shipped or validated Topics require evidence');
    }
    if ((input.availability === 'reserved' || input.availability === 'completed') &&
        input.selection_ref === null) {
        fail('reserved or completed Topics require a Human Selection ref');
    }
    if (input.availability === 'completed' && input.outcome_ref === null) {
        fail('completed Topics require a Weekly Outcome ref');
    }
    if (input.availability !== 'completed' && input.outcome_ref !== null) {
        fail('only completed Topics may bind a Weekly Outcome ref');
    }
    const body = { schema_version: 'research-topic-revision/v1', ...input };
    return validateContract('research-topic-revision', {
        ...body,
        revision_digest: sha256(body)
    });
}
export function createResearchBacklogCatalog(input) {
    const sortedEntries = [...input.entries].sort((left, right) => left.topic_id.localeCompare(right.topic_id));
    assertUnique(sortedEntries.map((entry) => entry.topic_id), 'Backlog Topic ids');
    assertUniqueRefs(sortedEntries.map((entry) => entry.current_revision_ref), 'Backlog revision refs');
    const expectedCounts = { evidence_ready: 0, researching: 0, long_term: 0 };
    for (const entry of sortedEntries) {
        assertStableId(entry.topic_id, 'Topic id');
        if (entry.availability === 'available') {
            expectedCounts[entry.backlog_state] += 1;
        }
    }
    if (input.counts.evidence_ready !== expectedCounts.evidence_ready ||
        input.counts.researching !== expectedCounts.researching ||
        input.counts.long_term !== expectedCounts.long_term) {
        fail('Backlog counts must match available Topic entries');
    }
    const body = {
        schema_version: 'research-backlog-catalog/v1',
        ...input,
        entries: sortedEntries
    };
    return validateContract('research-backlog-catalog', {
        ...body,
        catalog_digest: sha256(body)
    });
}
function assertUniqueReviewContent(input) {
    assertUniqueRefs(input.completed_outcome_refs, 'Monthly Outcome refs');
    assertUnique(input.stream_coverage, 'Monthly Stream coverage');
    assertUnique(input.claim_changes.map((change) => change.claim_ref), 'Monthly Claim refs');
    for (const change of input.claim_changes) {
        assertUnique(change.evidence_refs, `${change.claim_ref} evidence refs`);
    }
    for (const [label, values] of [
        ['implementation Evidence refs', input.implementation_evidence_refs],
        ['failure refs', input.failure_refs],
        ['decision refs', input.decision_refs],
        ['boundary change refs', input.boundary_change_refs],
        ['open question refs', input.open_question_refs],
        ['repeated Topic refs', input.repeated_topic_refs],
        ['off-track findings', input.off_track_findings]
    ]) {
        assertUnique(values, `Monthly ${label}`);
    }
}
export function createMonthlyEditorialReview(input) {
    assertStableId(input.review_id, 'Monthly Review id');
    if (input.next_candidate_topic_refs.length !== 4) {
        fail('Monthly Review requires exactly four next-Candidate Topic refs');
    }
    assertUniqueRefs(input.next_candidate_topic_refs, 'next-Candidate Topic refs');
    assertUniqueReviewContent(input);
    if (input.roadmap_change_requested !== (input.roadmap_change_reason !== null) ||
        (input.roadmap_change_reason !== null && input.roadmap_change_reason.trim().length === 0)) {
        fail('Roadmap change requests require one non-empty reason');
    }
    const cadenceMet = input.completed_outcome_refs.length >= 4;
    const researchProgressMet = input.claim_changes.length > 0 ||
        input.implementation_evidence_refs.length > 0 ||
        input.failure_refs.length > 0 ||
        input.decision_refs.length > 0 ||
        input.boundary_change_refs.length > 0 ||
        input.open_question_refs.length > 0;
    const body = {
        schema_version: 'monthly-editorial-review/v1',
        ...input,
        cadence_met: cadenceMet,
        research_progress_met: researchProgressMet,
        evidence_ready_guard_met: input.evidence_ready_count >= RESEARCH_PROGRAM_POLICY_V1.minimum_evidence_ready_topics
    };
    return validateContract('monthly-editorial-review', {
        ...body,
        review_digest: sha256(body)
    });
}
export function createResearchProgramStatus(input) {
    assertUniqueRefs(input.active_cycle_refs, 'active Weekly Cycle refs');
    assertUnique(input.warnings, 'Program warnings');
    const body = { schema_version: 'research-program-status/v1', ...input };
    return validateContract('research-program-status', {
        ...body,
        projection_digest: sha256(body)
    });
}
function assertWeeklyContextBinding(binding) {
    assertStableId(binding.query_id, 'Weekly Context query id');
    if (typeof binding.review_digest !== 'string' || !binding.review_digest.startsWith('sha256:')) {
        fail('Weekly Context review digest is required');
    }
    assertUnique(binding.selected_context_refs, 'Weekly selected Context refs');
    if (binding.application_status === 'applied' &&
        (binding.query_status !== 'loaded' || binding.selected_context_refs.length === 0)) {
        fail(`${binding.query_status} Context cannot be applied`);
    }
    if (binding.application_status === 'reviewed_not_applied' &&
        binding.selected_context_refs.length > 0) {
        fail('reviewed_not_applied Context cannot contain selected Context refs');
    }
    if (binding.query_status !== 'loaded' && binding.selected_context_refs.length > 0) {
        fail(`${binding.query_status} Context cannot select Context refs`);
    }
}
function cycleRef(cycle) {
    return {
        path: `program/weeks/${cycle.cycle_id}/cycle.json`,
        digest: cycle.cycle_digest
    };
}
function selectionRef(selection) {
    return {
        path: `program/weeks/${selection.cycle_id}/selection.json`,
        digest: selection.selection_digest
    };
}
export function createWeeklyResearchCycle(input) {
    assertStableId(input.cycle_id, 'Weekly Cycle id');
    assertWeeklyContextBinding(input.context_binding);
    const expectedMonth = `month_${String(Math.floor((input.week_number - 1) / 4) + 1).padStart(2, '0')}`;
    if (input.week_number < 1 || input.week_number > 24 || input.month_id !== expectedMonth) {
        fail('Weekly Cycle week and month must map to the six-month Roadmap');
    }
    if (input.opened_by.trim().length === 0)
        fail('Weekly Cycle opener is required');
    const body = { schema_version: 'weekly-research-cycle/v1', ...input };
    return validateContract('weekly-research-cycle', {
        ...body,
        cycle_digest: sha256(body)
    });
}
export function createWeeklyCandidateSet(input) {
    assertStableId(input.candidate_set_id, 'Candidate Set id');
    assertStableId(input.cycle_id, 'Weekly Cycle id');
    assertWeeklyContextBinding(input.context_binding);
    if (input.candidates.length < 2 || input.candidates.length > 3) {
        fail('Weekly Candidate Set requires two or three Candidate Briefs');
    }
    assertUnique(input.candidates.map((candidate) => candidate.brief_id), 'Candidate Brief ids');
    assertUniqueRefs(input.candidates.map((candidate) => candidate.topic_ref), 'Candidate Topic refs');
    for (const candidate of input.candidates) {
        assertStableId(candidate.brief_id, 'Candidate Brief id');
        assertUnique(candidate.stream_ids, `${candidate.brief_id} Stream ids`);
        if (candidate.stream_ids.length === 0 ||
            candidate.stream_ids.some((streamId) => !LOCKED_STREAM_IDS.has(streamId))) {
            fail('Candidate Brief Stream ids must use locked Research Streams');
        }
        for (const [label, values] of [
            ['Evidence refs', candidate.evidence_refs],
            ['Lineage refs', candidate.lineage_refs],
            ['prior Publication refs', candidate.prior_publication_refs],
            ['Source refs', candidate.source_refs],
            ['established boundaries', candidate.boundaries.established],
            ['not-established boundaries', candidate.boundaries.not_established],
            ['explicit non-claims', candidate.boundaries.explicitly_not_claimed],
            ['planned work', candidate.boundaries.planned_work]
        ]) {
            assertUnique(values, `${candidate.brief_id} ${label}`);
        }
        assertUnique(candidate.visual_plan.map((visual) => visual.purpose), `${candidate.brief_id} Visual purposes`);
        if (requiresEvidence(candidate.claim_status) && candidate.evidence_refs.length === 0) {
            fail('shipped or validated Candidate Briefs require evidence');
        }
    }
    const body = { schema_version: 'weekly-candidate-set/v1', ...input };
    return validateContract('weekly-candidate-set', {
        ...body,
        candidate_set_digest: sha256(body)
    });
}
export function createWeeklyTopicSelection(candidateSet, input) {
    if (input.selection_source !== 'human_explicit') {
        fail('Weekly Topic selection_source must be human_explicit');
    }
    if (input.selected_by.trim().length === 0)
        fail('Weekly Topic selected_by is required');
    if (input.cycle_id !== candidateSet.cycle_id ||
        input.candidate_set_digest !== candidateSet.candidate_set_digest) {
        fail('Weekly Topic Selection must bind the exact Candidate Set digest');
    }
    if (!candidateSet.candidates.some((candidate) => candidate.brief_id === input.selected_brief_id)) {
        fail('Weekly Topic Selection names an unknown Candidate Brief');
    }
    const body = {
        schema_version: 'weekly-topic-selection/v1',
        selection_id: `${input.cycle_id}_selection`,
        ...input
    };
    return validateContract('weekly-topic-selection', {
        ...body,
        selection_digest: sha256(body)
    });
}
export function createWeeklyCycleCancellation(cycle, selection, input) {
    if (input.cycle_id !== cycle.cycle_id ||
        selection.cycle_id !== cycle.cycle_id ||
        input.confirmed_selection_digest !== selection.selection_digest) {
        fail('Weekly Cycle Cancellation must bind the exact Cycle and Selection');
    }
    if (input.reason.trim().length === 0 || input.cancelled_by.trim().length === 0) {
        fail('Weekly Cycle Cancellation requires a Human reason and actor');
    }
    const body = {
        schema_version: 'weekly-cycle-cancellation/v1',
        cancellation_id: `${cycle.cycle_id}_cancellation`,
        cycle_ref: cycleRef(cycle),
        selection_ref: selectionRef(selection),
        reason: input.reason,
        cancelled_by: input.cancelled_by,
        cancelled_at: input.cancelled_at
    };
    return validateContract('weekly-cycle-cancellation', {
        ...body,
        cancellation_digest: sha256(body)
    });
}
export function createWeeklyCycleStatus(input) {
    const match = /^program\/weeks\/([a-z0-9][a-z0-9_-]*)\/cycle\.json$/.exec(input.cycle_ref.path);
    if (match === null)
        fail('Weekly Cycle Status requires a canonical Cycle ref');
    const cycleId = match[1];
    for (const ref of [
        input.candidate_set_ref,
        input.selection_ref,
        input.cancellation_ref,
        input.package_ref,
        input.article_ref,
        input.bundle_ref,
        input.outcome_ref
    ]) {
        if (ref !== null && !ref.path.startsWith(`program/weeks/${cycleId}/`)) {
            fail('Weekly Cycle Status refs must remain inside the same Cycle directory');
        }
    }
    const requiresCandidate = !['opened', 'blocked'].includes(input.phase);
    const requiresSelection = [
        'topic_selected', 'package_compiled', 'package_frozen', 'article_finalized',
        'publication_planned', 'published', 'cancelled'
    ].includes(input.phase);
    if (requiresCandidate && input.candidate_set_ref === null) {
        fail(`${input.phase} status requires a Candidate Set ref`);
    }
    if (requiresSelection && input.selection_ref === null) {
        fail(`${input.phase} status requires a Topic Selection ref`);
    }
    if (input.phase === 'cancelled' && input.cancellation_ref === null) {
        fail('cancelled status requires a Cancellation ref');
    }
    if (['package_compiled', 'package_frozen', 'article_finalized', 'publication_planned', 'published'].includes(input.phase) && input.package_ref === null) {
        fail(`${input.phase} status requires a Package ref`);
    }
    if (['article_finalized', 'publication_planned', 'published'].includes(input.phase) && input.article_ref === null) {
        fail(`${input.phase} status requires an Article ref`);
    }
    if (['publication_planned', 'published'].includes(input.phase) && input.bundle_ref === null) {
        fail(`${input.phase} status requires a Publication Bundle ref`);
    }
    if (input.phase === 'published' && input.outcome_ref === null) {
        fail('published status requires a Weekly Outcome ref');
    }
    if ((input.phase === 'blocked') !== (input.blocked_reason !== null)) {
        fail('blocked status requires exactly one blocked reason');
    }
    const body = { schema_version: 'weekly-cycle-status/v1', ...input };
    return validateContract('weekly-cycle-status', {
        ...body,
        projection_digest: sha256(body)
    });
}
export function createWeeklyPublicationBundleBinding(input) {
    const match = /^program\/weeks\/([a-z0-9][a-z0-9_-]*)\/cycle\.json$/.exec(input.cycle_ref.path);
    if (match === null)
        fail('Weekly Publication Bundle Binding requires a canonical Cycle ref');
    const cycleId = match[1];
    if (input.selection_ref.path !== `program/weeks/${cycleId}/selection.json` ||
        input.research_content_package_ref.path !== `program/weeks/${cycleId}/package.json` ||
        input.weekly_article_ref.path !== `program/weeks/${cycleId}/article.json` ||
        !/^runs\/[a-z0-9][a-z0-9_-]*\/publication-bundle\/plan\.json$/.test(input.bundle_plan_ref.path)) {
        fail('Weekly Publication Bundle Binding refs do not match the exact Cycle and Bundle layout');
    }
    for (const ref of [
        input.cycle_ref,
        input.selection_ref,
        input.research_content_package_ref,
        input.weekly_article_ref,
        input.article_package_ref,
        input.bundle_plan_ref
    ]) {
        if (ref.path.includes('\\') || ref.path.startsWith('/') || /^[A-Za-z]:/.test(ref.path) ||
            ref.path.split('/').includes('..')) {
            fail('Weekly Publication Bundle Binding refs must be safe workspace-relative paths');
        }
    }
    const body = {
        schema_version: 'weekly-publication-bundle-binding/v1',
        ...input
    };
    return validateContract('weekly-publication-bundle-binding', { ...body, binding_digest: sha256(body) });
}
//# sourceMappingURL=research-program-contracts.js.map