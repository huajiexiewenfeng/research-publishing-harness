import { existsSync, readFileSync } from 'node:fs';

import {
  Ajv2020,
  type ErrorObject,
  type ValidateFunction
} from 'ajv/dist/2020.js';
import formatsModule, { type FormatsPlugin } from 'ajv-formats';

import { HarnessError } from './errors.js';
import type { ContractName } from './types.js';

const ajv = new Ajv2020({ allErrors: true, strict: true });
(formatsModule as unknown as FormatsPlugin)(ajv);

const validators = new Map<ContractName, ValidateFunction>();

function loadValidator(name: ContractName): ValidateFunction {
  const cached = validators.get(name);
  if (cached !== undefined) {
    return cached;
  }

  const adjacentUrl = new URL(`../contracts/${name}.schema.json`, import.meta.url);
  const packagedUrl = new URL(
    `../../../../harnesses/research-publishing/contracts/${name}.schema.json`,
    import.meta.url
  );
  const contractUrl = existsSync(adjacentUrl) ? adjacentUrl : packagedUrl;
  const schema = JSON.parse(readFileSync(contractUrl, 'utf8')) as object;
  const validator = ajv.compile(schema);
  validators.set(name, validator);
  return validator;
}

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  if (errors === null || errors === undefined || errors.length === 0) {
    return 'contract validation failed';
  }

  return errors
    .map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`)
    .join('; ');
}

export function validateContract<T>(name: ContractName, value: unknown): T {
  const validator = loadValidator(name);
  if (!validator(value)) {
    throw new HarnessError(
      'CONTRACT_INVALID',
      `${name}: ${formatErrors(validator.errors)}`,
      validator.errors
    );
  }
  return value as T;
}
