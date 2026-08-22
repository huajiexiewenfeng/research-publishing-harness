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

export type RuntimeLaunchConfig =
  | Readonly<{
      launcher: 'console-script';
      executable: string;
      expected_version: '0.2.0';
    }>
  | Readonly<{
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
