import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Browser and filesystem integration tests share Windows I/O under the full suite.
    // Keep the bound finite while avoiding false failures from the 5 s default.
    testTimeout: 15_000,
    maxWorkers: 4,
    exclude: [
      // Only the memory launcher uses Node's runner; Article .mjs tests use Vitest.
      'tests/skills/memory-routing.test.mjs',
      '**/dist/**',
      '**/node_modules/**',
      '**/.worktrees/**',
      '**/worktrees/**'
    ]
  }
});
