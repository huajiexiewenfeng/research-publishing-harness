import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Browser and filesystem integration tests share Windows I/O under the full suite.
    // Keep the bound finite while avoiding false failures from the 5 s default.
    testTimeout: 15_000,
    maxWorkers: 4,
    exclude: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.worktrees/**',
      '**/worktrees/**'
    ]
  }
});
