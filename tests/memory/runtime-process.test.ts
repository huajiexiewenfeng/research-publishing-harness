import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { NodeRuntimeProcessRunner } from '../../harnesses/research-publishing/adapters/llm-wiki/runtime-process.js';

describe('NodeRuntimeProcessRunner', () => {
  it('runs without a shell and accepts exactly one JSON object', async () => {
    const runner = new NodeRuntimeProcessRunner();
    const output = await runner.run({
      executable: process.execPath,
      args: ['-e', 'process.stdout.write(JSON.stringify({status:"ok",version:"0.2.0"}))'],
      cwd: resolve('.'),
      shell: false,
      timeout_ms: 2_000,
      max_output_bytes: 8_192
    });
    expect(output).toEqual({
      exit_code: 0,
      envelope: { status: 'ok', version: '0.2.0' },
      stderr_present: false
    });
  });

  it('rejects extra stdout, oversized output, and timeout without leaking output', async () => {
    const runner = new NodeRuntimeProcessRunner();
    const base = { executable: process.execPath, cwd: resolve('.'), shell: false as const };
    await expect(runner.run({
      ...base,
      args: ['-e', 'process.stdout.write("{}\\n{}")']
    })).rejects.toMatchObject({ code: 'MEMORY_RUNTIME_PROTOCOL_ERROR' });
    await expect(runner.run({
      ...base,
      args: ['-e', 'process.stdout.write("x".repeat(4096))'],
      max_output_bytes: 1024
    })).rejects.toMatchObject({ code: 'MEMORY_RUNTIME_PROTOCOL_ERROR' });
    await expect(runner.run({
      ...base,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      timeout_ms: 100
    })).rejects.toMatchObject({ code: 'MEMORY_RUNTIME_TIMEOUT' });
  });
});
