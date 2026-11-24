import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * unit        — pure logic (grading, slots), no database.
 * integration — every server function against a real Postgres (TEST_DATABASE_URL,
 *               default postgresql://postgres@localhost:5432/mm_test). One file at a
 *               time: each test file starts from a fresh copy of the demo data.
 * contract    — the wiring checker: each mock function vs its real twin.
 */
export default defineConfig({
  resolve: { alias: { '@': at('./src'), 'server-only': at('./tests/stubs/server-only.ts') } },
  test: {
    // integration and contract share one test database: never run two files at once.
    fileParallelism: false,
    globalSetup: ['tests/global-setup.ts'],
    projects: [
      { extends: true, test: { name: 'unit', include: ['tests/*.test.ts'] } },
      {
        extends: true,
        test: { name: 'integration', include: ['tests/integration/**/*.test.ts'], setupFiles: ['tests/integration/setup.ts'], fileParallelism: false, testTimeout: 30000, hookTimeout: 60000 },
      },
      {
        extends: true,
        test: { name: 'contract', include: ['tests/contract/**/*.test.ts'], setupFiles: ['tests/integration/setup.ts'], fileParallelism: false, testTimeout: 60000, hookTimeout: 60000 },
      },
    ],
  },
});
