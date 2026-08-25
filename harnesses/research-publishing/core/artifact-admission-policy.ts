import { isAbsolute } from 'node:path';

import { HarnessError } from './errors.js';
import type { PrivacyClassification } from './research-memory-types.js';

const SENSITIVE_PATH =
  /(?:^|\/)(?:cookies?|login[-_]?state|browser[-_]?state|credentials?)(?:\.|\/|$)/i;
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\b(?:api[_-]?(?:key|token)|token|password|secret)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{8,}/i
] as const;

const PRIVACY_RANK: Readonly<Record<PrivacyClassification, number>> = {
  public: 0,
  internal: 1,
  data_only: 1,
  restricted: 2
};

function textLike(mediaType: string): boolean {
  return mediaType.startsWith('text/') ||
    mediaType === 'application/json' ||
    mediaType === 'application/yaml' ||
    mediaType === 'application/x-yaml';
}

function assertSafePath(path: string): string {
  const portable = path.replaceAll('\\', '/');
  if (portable.length === 0 || isAbsolute(path) || /^[A-Za-z]:/.test(path) ||
      portable.startsWith('/') || portable.split('/').some(
        (segment) => segment.length === 0 || segment === '.' || segment === '..'
      )) {
    throw new HarnessError('WORKSPACE_PATH_INVALID', 'artifact path is not workspace-relative');
  }
  return portable;
}

export function privacyRank(value: PrivacyClassification): number {
  return PRIVACY_RANK[value];
}

export function assertArtifactAdmissible(input: {
  readonly workspace_relative_path: string;
  readonly media_type: string;
  readonly privacy_classification: PrivacyClassification;
  readonly bytes: Uint8Array;
  readonly allow_restricted: boolean;
}): void {
  const path = assertSafePath(input.workspace_relative_path);
  if (SENSITIVE_PATH.test(path)) {
    throw new HarnessError('PRIVACY_GATE_BLOCKED', 'browser login state is not admissible');
  }
  if (!input.allow_restricted && input.privacy_classification === 'restricted') {
    throw new HarnessError('PRIVACY_GATE_BLOCKED', 'restricted context is not admissible');
  }
  if (!textLike(input.media_type)) return;
  const text = Buffer.from(input.bytes).toString('utf8');
  if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) {
    throw new HarnessError('PRIVACY_GATE_BLOCKED', 'potential secret detected in artifact');
  }
}
