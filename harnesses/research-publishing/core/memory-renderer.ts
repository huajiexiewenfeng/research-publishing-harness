import type {
  CandidateInsightProposalV1,
  MemoryIngestPlanV1,
  PublicationFeedbackSnapshotV1
} from './memory-types.js';

function text(value: unknown): string {
  return typeof value === 'string' ? value : 'unknown';
}

export function renderPublicationEvidenceRecord(receipt: Record<string, unknown>): string {
  const status = text(receipt.status);
  const publicResult = receipt.public_result;
  const publicUrl = publicResult !== null && typeof publicResult === 'object'
    ? text((publicResult as Record<string, unknown>).root_url ?? (publicResult as Record<string, unknown>).url)
    : receipt.public_evidence !== null && typeof receipt.public_evidence === 'object'
      ? text((receipt.public_evidence as Record<string, unknown>).canonical_url)
      : 'unavailable';
  const verified = status === 'finalized' && publicUrl !== 'unavailable' && publicUrl !== 'unknown';
  return [
    '# Publication Evidence',
    '',
    `- Receipt: ${text(receipt.receipt_id)}`,
    `- Recorded status: ${status}`,
    `- Canonical URL: ${publicUrl}`,
    `- Public verification: ${verified ? 'verified publication' : 'not established'}`,
    '',
    'This record preserves the Receipt evidence level and does not upgrade uncertain outcomes.',
    ''
  ].join('\n');
}

export function renderFeedbackRecord(snapshot: PublicationFeedbackSnapshotV1): string {
  return [
    '# Human-selected Publication Feedback',
    '',
    `- Feedback snapshot: ${snapshot.feedback_snapshot_id}`,
    `- Parent publication Receipt: ${snapshot.publication_receipt_id}`,
    `- Selected by: ${snapshot.selection_actor}`,
    `- Selection reason: ${snapshot.selection_reason}`,
    '- Instruction policy: data_only',
    '',
    ...snapshot.entries.flatMap((entry) => [
      `## Entry ${entry.ordinal}`,
      '',
      `- Author: ${entry.author}`,
      `- URL: ${entry.public_url}`,
      '',
      entry.observed_text,
      ''
    ])
  ].join('\n');
}

export function renderCandidateInsightRecord(proposal: CandidateInsightProposalV1): string {
  return [
    '# Candidate Insight',
    '',
    `- Proposal: ${proposal.proposal_id}`,
    `- Type: ${proposal.insight_type}`,
    `- Evidence strength: ${proposal.evidence_strength}`,
    `- Confidence: ${proposal.confidence}`,
    `- Disposition: ${proposal.recommended_disposition}`,
    '',
    '## Proposition',
    '',
    proposal.proposition,
    '',
    '## Boundary',
    '',
    proposal.boundary_note,
    '',
    '## Alternative explanations',
    '',
    ...proposal.alternative_explanations.map((value) => `- ${value}`),
    '',
    'This is a reviewed candidate for further research, not a verified conclusion.',
    ''
  ].join('\n');
}

export function renderMemoryIngestPreview(
  plan: MemoryIngestPlanV1,
  recordPreviews: readonly string[]
): string {
  return [
    '# Memory Ingest Preview',
    '',
    `- Ingest: ${plan.ingest_id}`,
    `- Kind: ${plan.ingest_kind}`,
    `- Research track: ${plan.research_track}`,
    `- Runtime: llm-wiki-runtime ${plan.runtime_version}`,
    `- Target: ${plan.target_domain}/${plan.target_profile}`,
    `- Profile digest: ${plan.profile_digest}`,
    `- SCP digest: ${plan.scp_digest}`,
    `- Mapping digest: ${plan.mapping_digest}`,
    `- Source snapshot: ${plan.source_artifact.relative_path}`,
    `- Audit event: ${plan.log_event.event_id}`,
    `- Plan digest: ${plan.plan_digest}`,
    '',
    '## Records',
    '',
    ...plan.record_operations.map((operation) =>
      `- ${operation.record_type}: ${operation.content_artifact.relative_path}`
    ),
    '',
    ...recordPreviews
  ].join('\n');
}
