#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverHarnessCli } from './x-article-host-runtime.mjs';

const skillDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(skillDir, '..', '..');

function forwardedArgs() {
  const args = [...process.argv.slice(2)];
  if (args[0] !== 'memory') return args;
  const executable = process.env.LLM_WIKI_RUNTIME_EXECUTABLE;
  const launcher = process.env.LLM_WIKI_RUNTIME_LAUNCHER;
  if (executable && !args.includes('--runtime-executable')) {
    args.push('--runtime-executable', executable);
  }
  if (launcher && !args.includes('--runtime-launcher')) {
    args.push('--runtime-launcher', launcher);
  }
  return args;
}

try {
  const result = spawnSync(process.execPath, [
    discoverHarnessCli({ repositoryRoot }),
    ...forwardedArgs()
  ], {
    stdio: 'inherit',
    windowsHide: true
  });
  process.exitCode = result.status ?? 10;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Harness discovery failed'}\n`);
  process.exitCode = 10;
}
