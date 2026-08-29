import { isAbsolute } from 'node:path';
import { HarnessError } from './errors.js';
const SENSITIVE_PATH = /(?:^|\/)(?:cookies?|login[-_]?state|browser[-_]?state|credentials?)(?:\.|\/|$)/i;
const SECRET_PATTERNS = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bsk-[A-Za-z0-9_-]{16,}\b/,
    /\b(?:api[_-]?(?:key|token)|token|password|secret)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{8,}/i
];
const PRIVACY_RANK = {
    public: 0,
    internal: 1,
    data_only: 1,
    restricted: 2
};
function textLike(mediaType) {
    return mediaType.startsWith('text/') ||
        mediaType === 'application/json' ||
        mediaType === 'application/yaml' ||
        mediaType === 'application/x-yaml';
}
function assertSafePath(path) {
    const portable = path.replaceAll('\\', '/');
    if (portable.length === 0 || isAbsolute(path) || /^[A-Za-z]:/.test(path) ||
        portable.startsWith('/') || portable.split('/').some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
        throw new HarnessError('WORKSPACE_PATH_INVALID', 'artifact path is not workspace-relative');
    }
    return portable;
}
export function privacyRank(value) {
    return PRIVACY_RANK[value];
}
export function assertArtifactAdmissible(input) {
    const path = assertSafePath(input.workspace_relative_path);
    if (SENSITIVE_PATH.test(path)) {
        throw new HarnessError('PRIVACY_GATE_BLOCKED', 'browser login state is not admissible');
    }
    if (!input.allow_restricted && input.privacy_classification === 'restricted') {
        throw new HarnessError('PRIVACY_GATE_BLOCKED', 'restricted context is not admissible');
    }
    if (!textLike(input.media_type))
        return;
    const text = Buffer.from(input.bytes).toString('utf8');
    if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) {
        throw new HarnessError('PRIVACY_GATE_BLOCKED', 'potential secret detected in artifact');
    }
}
//# sourceMappingURL=artifact-admission-policy.js.map