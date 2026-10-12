import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.ts'],
    // The one PGlite the run initialises from nothing is made here, before any test file and
    // with no limit on how long it takes.
    globalSetup: ['test/initialised-database.ts'],
    // 30 s for a test: under contention (every package's tests at once, a two-core CI runner) starting
    // a database takes many times what it takes alone, and the default 5 s reads honest work as a hang.
    testTimeout: 30_000,
  },
});
