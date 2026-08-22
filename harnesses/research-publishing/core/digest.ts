import { createHash } from 'node:crypto';

import { HarnessError } from './errors.js';

type JsonScalar = null | boolean | number | string;
type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };

function normalize(value: unknown, ancestors: Set<object>): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new HarnessError('CONTRACT_INVALID', 'non-finite numbers are not JSON values');
    }
    return value;
  }

  if (typeof value !== 'object') {
    throw new HarnessError(
      'CONTRACT_INVALID',
      `unsupported value in canonical JSON: ${typeof value}`
    );
  }

  if (ancestors.has(value)) {
    throw new HarnessError('CONTRACT_INVALID', 'cyclic values are not JSON values');
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => normalize(item, ancestors));
    }

    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new HarnessError(
        'CONTRACT_INVALID',
        'canonical JSON accepts plain objects only'
      );
    }

    const input = value as Record<string, unknown>;
    const output: Record<string, JsonValue> = {};
    for (const key of Object.keys(input).sort()) {
      output[key] = normalize(input[key], ancestors);
    }
    return output;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value, new Set<object>()));
}

export function sha256(value: unknown): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

export function sha256Bytes(value: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
