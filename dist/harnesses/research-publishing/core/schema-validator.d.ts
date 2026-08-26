import type { ContractName } from './types.js';
export declare function validateContract<T>(name: ContractName, value: unknown): T;
export declare function assertContractsAvailable(): readonly ContractName[];
