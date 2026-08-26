import { claimLanguageMatchesBoundary } from './claim-boundary.js';
function result(gate, findings) {
    return {
        gate,
        passed: findings.every((finding) => finding.severity !== 'error'),
        findings
    };
}
const CLAIM_STATUSES = new Set([
    'verified', 'shipped', 'validated', 'observed',
    'inferred', 'exploring', 'hypothesis', 'planned'
]);
function isClaimStatus(value) {
    return CLAIM_STATUSES.has(value);
}
export function runResearchGate(packageValue) {
    const findings = [];
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
    const externalEvidenceOnly = packageValue.evidence.length > 0 &&
        packageValue.evidence.every((evidence) => evidence.evidence_type === 'external_context');
    const externalSourcesOnly = packageValue.sources.length > 0 &&
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
export function runEvidenceGate(packageValue) {
    const findings = [];
    const evidenceById = new Map(packageValue.evidence.map((evidence) => [evidence.evidence_id, evidence]));
    const sourceById = new Map(packageValue.sources.map((source) => [source.source_id, source]));
    for (const claim of packageValue.claims) {
        if (claim.claim_status === 'verified' && claim.evidence_refs.length === 0) {
            findings.push({
                code: 'VERIFIED_WITHOUT_EVIDENCE',
                severity: 'error',
                message: `verified claim ${claim.claim_id} has no evidence`,
                path: `/claims/${claim.claim_id}`
            });
        }
        if (isClaimStatus(claim.claim_status) &&
            !claimLanguageMatchesBoundary(claim.claim_status, claim.statement)) {
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
            const isAppliedMemory = packageValue.memory_context?.status === 'applied' &&
                packageValue.memory_context.context_refs.includes(evidence.source_ref);
            if (source === undefined && !isAppliedMemory) {
                findings.push({
                    code: 'SOURCE_REFERENCE_INVALID',
                    severity: 'error',
                    message: `evidence ${evidenceRef} references missing source ${evidence.source_ref}`
                });
            }
            else if (source?.publication_policy === 'internal_only') {
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
export function runResearchLineageGate(packageValue) {
    const findings = [];
    if (packageValue.schema_version === '1.2' && (packageValue.research_lineage?.length ?? 0) === 0) {
        findings.push({
            code: 'RESEARCH_LINEAGE_REQUIRED',
            severity: 'error',
            message: 'V1.2 requires explicit Research Lineage',
            path: '/research_lineage'
        });
    }
    return result('research_lineage', findings);
}
export function runClaimBoundaryGate(packageValue) {
    const findings = [];
    const evidenceById = new Map(packageValue.evidence.map((evidence) => [evidence.evidence_id, evidence]));
    for (const claim of packageValue.claims) {
        const evidenceTypes = claim.evidence_refs.flatMap((ref) => {
            const evidence = evidenceById.get(ref);
            return evidence === undefined ? [] : [evidence.evidence_type];
        });
        if (claim.claim_status === 'shipped' &&
            !evidenceTypes.some((type) => type === 'implementation' || type === 'test')) {
            findings.push({
                code: 'SHIPPED_EVIDENCE_REQUIRED', severity: 'error',
                message: `shipped claim ${claim.claim_id} requires implementation or test Evidence`,
                path: `/claims/${claim.claim_id}`
            });
        }
        if (claim.claim_status === 'validated' &&
            !evidenceTypes.some((type) => type === 'test' || type === 'usage_observation')) {
            findings.push({
                code: 'VALIDATION_EVIDENCE_REQUIRED', severity: 'error',
                message: `validated claim ${claim.claim_id} requires test or usage-observation Evidence`,
                path: `/claims/${claim.claim_id}`
            });
        }
        if (claim.claim_status === 'observed' &&
            (claim.evidence_refs.length === 0 || (packageValue.boundaries?.not_established.length ?? 0) === 0)) {
            findings.push({
                code: 'OBSERVATION_BOUNDARY_REQUIRED', severity: 'error',
                message: `observed claim ${claim.claim_id} requires Evidence and a not-established boundary`,
                path: `/claims/${claim.claim_id}`
            });
        }
        if (isClaimStatus(claim.claim_status) &&
            !claimLanguageMatchesBoundary(claim.claim_status, claim.statement)) {
            findings.push({
                code: 'CLAIM_STATUS_LANGUAGE_MISMATCH', severity: 'error',
                message: `${claim.claim_status} claim ${claim.claim_id} uses shipped-capability language`,
                path: `/claims/${claim.claim_id}/statement`
            });
        }
    }
    return result('claim_boundary', findings);
}
const SENSITIVE_PATTERNS = [
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
function collectStrings(value, path, output, seen) {
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
    }
    else {
        for (const [key, child] of Object.entries(value)) {
            collectStrings(child, `${path}/${key}`, output, seen);
        }
    }
}
export function runPrivacyGate(value) {
    const findings = [];
    const strings = [];
    collectStrings(value, '', strings, new Set());
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
export function runPublishGate(request, approval, now = new Date()) {
    const findings = [];
    if (approval === undefined) {
        findings.push({
            code: 'APPROVAL_REQUIRED',
            severity: 'error',
            message: 'an explicit approval bound to the final publication is required'
        });
        return result('publish', findings);
    }
    const boundFields = [
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
//# sourceMappingURL=gates.js.map