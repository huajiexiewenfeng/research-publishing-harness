#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const skillDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(skillDir, '..', '..');

function discoverCli() {
  const explicit = process.env.RESEARCH_PUBLISHING_HARNESS_CLI;
  if (explicit && existsSync(explicit)) return resolve(explicit);

  const bundled = resolve(repositoryRoot, 'dist', 'harnesses', 'research-publishing', 'cli', 'index.js');
  if (existsSync(bundled)) return bundled;

  const registryPath = process.env.RESEARCH_PUBLISHING_HARNESS_REGISTRY
    ? resolve(process.env.RESEARCH_PUBLISHING_HARNESS_REGISTRY)
    : resolve(repositoryRoot, 'registry', 'harnesses.json');
  if (existsSync(registryPath)) {
    const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
    const entry = registry.harnesses?.find((candidate) => candidate.id === 'research-publishing');
    if (entry?.cli) {
      const discovered = resolve(dirname(registryPath), entry.cli);
      if (existsSync(discovered)) return discovered;
    }
  }
  throw new Error('No compatible research-publishing Harness CLI was found.');
}

try {
  const result = spawnSync(process.execPath, [discoverCli(), ...process.argv.slice(2)], {
    stdio: 'inherit',
    windowsHide: true
  });
  process.exitCode = result.status ?? 10;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Harness discovery failed'}\n`);
  process.exitCode = 10;
}
