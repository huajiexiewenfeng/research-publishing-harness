import { createHash } from 'node:crypto';
import { HarnessError } from './errors.js';
function normalize(value, ancestors) {
    if (value === null ||
        typeof value === 'string' ||
        typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new HarnessError('CONTRACT_INVALID', 'non-finite numbers are not JSON values');
        }
        return value;
    }
    if (typeof value !== 'object') {
        throw new HarnessError('CONTRACT_INVALID', `unsupported value in canonical JSON: ${typeof value}`);
    }
    if (ancestors.has(value)) {
        throw new HarnessError('CONTRACT_INVALID', 'cyclic values are not JSON values');
    }
    ancestors.add(value);
    try {
        if (Array.isArray(value)) {
            return value.map((item) => normalize(item, ancestors));
        }
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
            throw new HarnessError('CONTRACT_INVALID', 'canonical JSON accepts plain objects only');
        }
        const input = value;
        const output = {};
        for (const key of Object.keys(input).sort()) {
            output[key] = normalize(input[key], ancestors);
        }
        return output;
    }
    finally {
        ancestors.delete(value);
    }
}
export function canonicalJson(value) {
    return JSON.stringify(normalize(value, new Set()));
}
export function sha256(value) {
    return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}
export function sha256Bytes(value) {
    return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
//# sourceMappingURL=digest.js.map