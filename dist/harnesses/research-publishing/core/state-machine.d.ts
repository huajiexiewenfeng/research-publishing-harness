import type { PackageState, RunState } from './types.js';
export declare function transitionPackageState(from: PackageState, to: PackageState): PackageState;
export declare function transitionRunState(from: RunState, to: RunState): RunState;
