import { HarnessError } from '../../harnesses/research-publishing/core/errors.js';
import type { RuntimeEnvelope } from '../../harnesses/research-publishing/adapters/llm-wiki/runtime-protocol.js';

export class FakeMemoryIngestRuntime {
  readonly calls: Array<{ method: string; input?: unknown }> = [];
  private failMethod: string | null = null;

  failOnce(method: 'validateMapping' | 'copySource' | 'writeRecord' | 'registerArtifact' | 'appendLog'): void {
    this.failMethod = method;
  }

  count(method: string): number {
    return this.calls.filter((call) => call.method === method).length;
  }

  private result(method: string, input?: unknown): RuntimeEnvelope {
    this.calls.push({ method, input });
    if (this.failMethod === method) {
      this.failMethod = null;
      throw new HarnessError('MEMORY_RUNTIME_FAILED', `${method} failed`);
    }
    return {
      status: 'ok', path: `runtime/${method}.json`, checksum: `sha256:${'a'.repeat(64)}`,
      warnings: [], next_actions: [], context_refs: []
    };
  }

  async version(): Promise<'0.2.0'> {
    this.calls.push({ method: 'version' });
    return '0.2.0';
  }
  async validateMapping(): Promise<RuntimeEnvelope> { return this.result('validateMapping'); }
  async copySource(input: unknown): Promise<RuntimeEnvelope> { return this.result('copySource', input); }
  async writeRecord(input: unknown): Promise<RuntimeEnvelope> { return this.result('writeRecord', input); }
  async registerArtifact(input: unknown): Promise<RuntimeEnvelope> { return this.result('registerArtifact', input); }
  async appendLog(input: unknown): Promise<RuntimeEnvelope> { return this.result('appendLog', input); }
}
