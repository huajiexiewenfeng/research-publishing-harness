import type { RuntimeContextResult } from '../../core/memory-types.js';
import type { ResearchRuntimeRecordType } from '../../core/research-memory-types.js';
export interface RuntimeProcessInput {
    readonly executable: string;
    readonly args: readonly string[];
    readonly cwd: string;
    readonly shell: false;
    readonly timeout_ms?: number;
    readonly max_output_bytes?: number;
}
export interface RuntimeProcessOutput {
    readonly exit_code: number | null;
    readonly envelope: Readonly<Record<string, unknown>>;
    readonly stderr_present: boolean;
}
export interface RuntimeProcessRunner {
    run(input: RuntimeProcessInput): Promise<RuntimeProcessOutput>;
}
export type RuntimeLaunchConfig = Readonly<{
    launcher: 'console-script';
    executable: string;
    expected_version: '0.2.0';
}> | Readonly<{
    launcher: 'python-module';
    executable: string;
    expected_version: '0.2.0';
}>;
export interface RuntimeEnvelope extends Readonly<Record<string, unknown>> {
    readonly status: string;
    readonly warnings?: readonly unknown[];
    readonly next_actions?: readonly unknown[];
    readonly context_refs?: readonly unknown[];
}
export interface RuntimeFindRecordsInput {
    readonly record_type: ResearchRuntimeRecordType;
    readonly lookup: Readonly<Record<string, string>>;
}
export interface RuntimeFindRecordMatch {
    readonly path: string;
    readonly checksum: `sha256:${string}`;
    readonly identity: string;
    readonly display: string;
    readonly fields: Readonly<Record<string, unknown>>;
}
export type RuntimeFindRecordsResult = Readonly<{
    status: 'not_found';
    record_type: ResearchRuntimeRecordType;
    matches: readonly [];
}> | Readonly<{
    status: 'found';
    record_type: ResearchRuntimeRecordType;
    matches: readonly [RuntimeFindRecordMatch];
}>;
export interface RuntimeLoadPathsInput {
    readonly paths: readonly string[];
    readonly max_items: number;
    readonly max_item_chars: number;
    readonly max_total_chars: number;
}
export type RuntimeLoadPathsResult = RuntimeContextResult;
