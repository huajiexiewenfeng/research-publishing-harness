import { existsSync, readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import formatsModule, {} from 'ajv-formats';
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
const validators = new Map();
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
    const validator = loadValidator(name);
    if (!validator(value)) {
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