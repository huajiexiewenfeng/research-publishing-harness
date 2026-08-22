import type { Finding, GateResult } from './types.js';

interface ClaimLike {
  readonly claim_id: string;
  readonly statement: string;
  readonly claim_status: string;
  readonly evidence_refs: readonly string[];
}

interface EvidenceLike {
  readonly evidence_id: string;
  readonly source_ref: string;
  readonly evidence_type: string;
  readonly supports: readonly string[];
}

interface SourceLike {
  readonly source_id: string;
  readonly source_type: string;
  readonly publication_policy: string;
}

interface ResearchPackageLike {
  readonly research_track: { readonly id: string };
  readonly topic: string;
  readonly thesis: { readonly summary: string; readonly claim_status: string };
  readonly claims: readonly ClaimLike[];
  readonly evidence: readonly EvidenceLike[];
  readonly sources: readonly SourceLike[];
  readonly memory_context?: {
    readonly status: string;
    readonly context_refs: readonly string[];
  };
}

interface PublicationRequestLike {
  readonly publication_digest: string;
  readonly target_account: string;
  readonly adapter: string;
  readonly target_post_id: string | null;
}

interface ApprovalLike extends PublicationRequestLike {
  readonly expires_at: string;
}

function result(
  gate: GateResult['gate'],
  findings: Finding[]
): GateResult {
  return {
    gate,
    passed: findings.every((finding) => finding.severity !== 'error'),
    findings
  };
}

export function runResearchGate(packageValue: ResearchPackageLike): GateResult {
  const findings: Finding[] = [];
  if (packageValue.research_track.id.trim().length === 0) {
    findings.push({
      code: 'RESEARCH_TRACK_REQUIRED',
      severity: 'error',
      message: 'a user-selected research track is required',
      path: '/research_track/id'
    });
  }
  if (packageValue.topic.trim().length === 0 || packageValue.claims.length === 0) {
    findings.push({
      code: 'RESEARCH_INCREMENT_REQUIRED',
      severity: 'error',
      message: 'the package needs a topic and at least one research claim'
    });
  }

  const externalEvidenceOnly =
    packageValue.evidence.length > 0 &&
    packageValue.evidence.every(
      (evidence) => evidence.evidence_type === 'external_context'
    );
  const externalSourcesOnly =
    packageValue.sources.length > 0 &&
    packageValue.sources.every((source) => source.source_type === 'external');
  if (externalEvidenceOnly && externalSourcesOnly) {
    findings.push({
      code: 'EXTERNAL_SIGNAL_ONLY',
      severity: 'error',
      message: 'external signals must advance, support, or challenge an active research track'
    });
  }

  return result('research', findings);
}

const SHIPPED_LANGUAGE =
  /\b(is implemented|is available|has shipped|currently supports|already provides|is production-ready)\b/i;

export function runEvidenceGate(packageValue: ResearchPackageLike): GateResult {
  const findings: Finding[] = [];
  const evidenceById = new Map(
    packageValue.evidence.map((evidence) => [evidence.evidence_id, evidence])
  );
  const sourceById = new Map(
    packageValue.sources.map((source) => [source.source_id, source])
  );

  for (const claim of packageValue.claims) {
    if (claim.claim_status === 'verified' && claim.evidence_refs.length === 0) {
      findings.push({
        code: 'VERIFIED_WITHOUT_EVIDENCE',
        severity: 'error',
        message: `verified claim ${claim.claim_id} has no evidence`,
        path: `/claims/${claim.claim_id}`
      });
    }

    if (claim.claim_status === 'planned' && SHIPPED_LANGUAGE.test(claim.statement)) {
      findings.push({
        code: 'CLAIM_STATUS_LANGUAGE_MISMATCH',
        severity: 'error',
        message: `planned claim ${claim.claim_id} uses shipped-capability language`,
        path: `/claims/${claim.claim_id}/statement`
      });
    }

    for (const evidenceRef of claim.evidence_refs) {
      const evidence = evidenceById.get(evidenceRef);
      if (evidence === undefined || !evidence.supports.includes(claim.claim_id)) {
        findings.push({
          code: 'EVIDENCE_REFERENCE_INVALID',
          severity: 'error',
          message: `claim ${claim.claim_id} references missing or unrelated evidence ${evidenceRef}`
        });
        continue;
      }
      const source = sourceById.get(evidence.source_ref);
      const isAppliedMemory =
        packageValue.memory_context?.status === 'applied' &&
        packageValue.memory_context.context_refs.includes(evidence.source_ref);
      if (source === undefined && !isAppliedMemory) {
        findings.push({
          code: 'SOURCE_REFERENCE_INVALID',
          severity: 'error',
          message: `evidence ${evidenceRef} references missing source ${evidence.source_ref}`
        });
      } else if (source?.publication_policy === 'internal_only') {
        findings.push({
          code: 'INTERNAL_ONLY_CLAIM',
          severity: 'error',
          message: `public claim ${claim.claim_id} depends on internal-only source ${source.source_id}`
        });
      }
    }
  }

  return result('evidence', findings);
}

const SENSITIVE_PATTERNS: ReadonlyArray<{
  code: string;
  pattern: RegExp;
  message: string;
}> = [
  {
    code: 'PROMPT_INJECTION',
    pattern: /\b(?:ignore|override)\s+(?:all\s+)?(?:previous|prior|system)\s+instructions\b|\bdisable\s+(?:the\s+)?(?:research|evidence|privacy|publish)\s+gate\b/i,
    message: 'instruction-like source content attempted to override Harness policy'
  },
  {
    code: 'WINDOWS_PRIVATE_PATH',
    pattern: /\b[A-Za-z]:\\(?:Users|Documents and Settings)\\[^\s"']+/,
    message: 'workstation-specific Windows path detected'
  },
  {
    code: 'UNIX_PRIVATE_PATH',
    pattern: /(?:^|[\s"'])(?:\/home|\/Users)\/[^\s"']+/,
    message: 'workstation-specific Unix path detected'
  },
  {
    code: 'BEARER_TOKEN',
    pattern: /\bAuthorization\s*:\s*Bearer\s+[^\s"']{8,}/i,
    message: 'Bearer credential detected'
  },
  {
    code: 'COOKIE_VALUE',
    pattern: /\b(?:Cookie|Set-Cookie)\s*:\s*[^\r\n]+/i,
    message: 'Cookie material detected'
  },
  {
    code: 'SECRET_ASSIGNMENT',
    pattern: /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*[^\s"']{8,}/i,
    message: 'secret-like assignment detected'
  }
];

function collectStrings(
  value: unknown,
  path: string,
  output: Array<{ path: string; value: string }>,
  seen: Set<object>
): void {
  if (typeof value === 'string') {
    output.push({ path, value });
    return;
  }
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${path}/${index}`, output, seen));
  } else {
    for (const [key, child] of Object.entries(value)) {
      collectStrings(child, `${path}/${key}`, output, seen);
    }
  }
}

export function runPrivacyGate(value: unknown): GateResult {
  const findings: Finding[] = [];
  const strings: Array<{ path: string; value: string }> = [];
  collectStrings(value, '', strings, new Set<object>());

  for (const item of strings) {
    for (const sensitive of SENSITIVE_PATTERNS) {
      if (sensitive.pattern.test(item.value)) {
        findings.push({
          code: sensitive.code,
          severity: 'error',
          message: sensitive.message,
          path: item.path || '/'
        });
      }
    }
  }

  return result('privacy', findings);
}

export function runPublishGate(
  request: PublicationRequestLike,
  approval?: ApprovalLike,
  now = new Date()
): GateResult {
  const findings: Finding[] = [];
  if (approval === undefined) {
    findings.push({
      code: 'APPROVAL_REQUIRED',
      severity: 'error',
      message: 'an explicit approval bound to the final publication is required'
    });
    return result('publish', findings);
  }

  const boundFields: ReadonlyArray<keyof PublicationRequestLike> = [
    'publication_digest',
    'target_account',
    'adapter',
    'target_post_id'
  ];
  for (const field of boundFields) {
    if (request[field] !== approval[field]) {
      findings.push({
        code: 'APPROVAL_MISMATCH',
        severity: 'error',
        message: `approval does not match publication field ${field}`,
        path: `/${field}`
      });
    }
  }

  const expiry = Date.parse(approval.expires_at);
  if (!Number.isFinite(expiry) || expiry <= now.getTime()) {
    findings.push({
      code: 'APPROVAL_EXPIRED',
      severity: 'error',
      message: 'approval is expired or has an invalid expiry'
    });
  }

  return result('publish', findings);
}
