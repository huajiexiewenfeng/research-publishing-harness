export type ErrorCode =
  | 'CONTRACT_INVALID'
  | 'STATE_TRANSITION_INVALID'
  | 'RESEARCH_GATE_BLOCKED'
  | 'EVIDENCE_GATE_BLOCKED'
  | 'PRIVACY_GATE_BLOCKED'
  | 'PUBLISH_GATE_BLOCKED'
  | 'APPROVAL_STALE'
  | 'ARTIFACT_EXISTS'
  | 'ARTIFACT_NOT_FOUND'
  | 'CHARACTER_LIMIT_EXCEEDED';

export class HarnessError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'HarnessError';
    this.code = code;
    this.details = details;
  }
}
