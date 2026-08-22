import type {
  RuntimeProcessInput,
  RuntimeProcessOutput,
  RuntimeProcessRunner
} from '../../harnesses/research-publishing/adapters/llm-wiki/runtime-protocol.js';

export class FakeRuntimeProcessRunner implements RuntimeProcessRunner {
  readonly calls: RuntimeProcessInput[] = [];
  readonly outputs: RuntimeProcessOutput[] = [];
  error: Error | null = null;

  enqueue(envelope: Readonly<Record<string, unknown>>, exitCode = 0): void {
    this.outputs.push({ exit_code: exitCode, envelope, stderr_present: false });
  }

  async run(input: RuntimeProcessInput): Promise<RuntimeProcessOutput> {
    this.calls.push(input);
    if (this.error !== null) throw this.error;
    const output = this.outputs.shift();
    if (output === undefined) throw new Error('fake runtime output queue is empty');
    return output;
  }
}
