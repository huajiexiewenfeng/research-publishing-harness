import { existsSync, readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import formatsModule, {} from 'ajv-formats';
import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { CONTRACT_NAMES } from './types.js';
const ajv = new Ajv2020({ allErrors: true, strict: true });
formatsModule(ajv);
ajv.addKeyword({
    keyword: 'orderedUniqueAnchorIds',
    type: 'array',
    schemaType: 'boolean',
    errors: false,
    validate: (enabled, value) => {
        if (!enabled)
            return true;
        const anchorIds = new Set();
        let previousOrdinal = 0;
        for (const item of value) {
            if (typeof item !== 'object' || item === null)
                return false;
            const anchorId = Reflect.get(item, 'anchor_id');
            const blockOrdinal = Reflect.get(item, 'block_ordinal');
            if (typeof anchorId !== 'string'
                || typeof blockOrdinal !== 'number'
                || anchorIds.has(anchorId)
                || blockOrdinal <= previousOrdinal) {
                return false;
            }
            anchorIds.add(anchorId);
            previousOrdinal = blockOrdinal;
        }
        return true;
    }
});
ajv.addKeyword({
    keyword: 'materializationPlanConsistent',
    type: 'object',
    schemaType: 'boolean',
    errors: false,
    validate: (enabled, value) => {
        if (!enabled)
            return true;
        try {
            const visualAnchors = Reflect.get(value, 'visual_anchors');
            const draftBinding = Reflect.get(value, 'draft_binding');
            const existingDraft = draftBinding !== null;
            const commandCeiling = Reflect.get(value, 'expected_command_ceiling');
            const observationCeiling = Reflect.get(value, 'expected_observation_ceiling');
            const materializationDigest = Reflect.get(value, 'materialization_digest');
            if (!Array.isArray(visualAnchors)
                || commandCeiling !== (existingDraft ? 4 : 12) + visualAnchors.length
                || observationCeiling !== (existingDraft ? 3 : 9) + visualAnchors.length
                || typeof materializationDigest !== 'string') {
                return false;
            }
            if (existingDraft) {
                if (typeof draftBinding !== 'object' || draftBinding === null)
                    return false;
                const bindingBody = Object.fromEntries(Object.entries(draftBinding).filter(([key]) => key !== 'binding_digest'));
                if (Reflect.get(draftBinding, 'binding_digest') !== sha256(bindingBody)
                    || Reflect.get(draftBinding, 'expected_account') !== Reflect.get(value, 'target_account')
                    || Reflect.get(draftBinding, 'expected_document_digest') !== Reflect.get(value, 'document_digest')
                    || Reflect.get(draftBinding, 'expected_import_template_digest') !== Reflect.get(value, 'import_template_digest')) {
                    return false;
                }
            }
            const body = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'materialization_digest'));
            return materializationDigest === sha256(body);
        }
        catch {
            return false;
        }
    }
});
const validators = new Map();
function isPlainContractObject(value) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === null || prototype === Object.prototype)
        return true;
    const parent = Object.getPrototypeOf(prototype);
    const constructor = Object.prototype.hasOwnProperty.call(prototype, 'constructor')
        ? Reflect.get(prototype, 'constructor')
        : null;
    return parent === null
        && typeof constructor === 'function'
        && constructor.name === 'Object';
}
function normalizeContractJson(value, ancestors = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new HarnessError('CONTRACT_INVALID', 'non-finite numbers are not JSON values');
        }
        return value;
    }
    if (typeof value !== 'object') {
        throw new HarnessError('CONTRACT_INVALID', `unsupported value in contract JSON: ${typeof value}`);
    }
    if (ancestors.has(value)) {
        throw new HarnessError('CONTRACT_INVALID', 'cyclic values are not contract JSON');
    }
    ancestors.add(value);
    try {
        if (Array.isArray(value)) {
            return Array.from(value, (item) => normalizeContractJson(item, ancestors));
        }
        if (!isPlainContractObject(value)) {
            throw new HarnessError('CONTRACT_INVALID', 'contract JSON accepts plain objects only');
        }
        const normalized = {};
        for (const key of Object.keys(value)) {
            normalized[key] = normalizeContractJson(Reflect.get(value, key), ancestors);
        }
        return normalized;
    }
    finally {
        ancestors.delete(value);
    }
}
function loadValidator(name) {
    const cached = validators.get(name);
    if (cached !== undefined) {
        return cached;
    }
    const adjacentUrl = new URL(`../contracts/${name}.schema.json`, import.meta.url);
    const packagedUrl = new URL(`../../../../harnesses/research-publishing/contracts/${name}.schema.json`, import.meta.url);
    const contractUrl = existsSync(adjacentUrl) ? adjacentUrl : packagedUrl;
    const schema = JSON.parse(readFileSync(contractUrl, 'utf8'));
    const validator = ajv.compile(schema);
    validators.set(name, validator);
    return validator;
}
function formatErrors(errors) {
    if (errors === null || errors === undefined || errors.length === 0) {
        return 'contract validation failed';
    }
    return errors
        .map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`)
        .join('; ');
}
export function validateContract(name, value) {
    const normalized = normalizeContractJson(value);
    const validator = loadValidator(name);
    if (!validator(normalized)) {
        throw new HarnessError('CONTRACT_INVALID', `${name}: ${formatErrors(validator.errors)}`, validator.errors);
    }
    return value;
}
export function assertContractsAvailable() {
    for (const name of CONTRACT_NAMES) {
        loadValidator(name);
    }
    return CONTRACT_NAMES;
}
//# sourceMappingURL=schema-validator.js.map