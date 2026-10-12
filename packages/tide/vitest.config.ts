import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The one PGlite the run initialises from nothing is made here, before any test file and
    // with no limit on how long it takes.
    globalSetup: ['test/initialised-database.ts'],
    // 30 s for a hook and a test: under contention (every package's tests at once, a two-core CI runner)
    // starting a database takes many times what it takes alone, and the defaults of 10 s and 5 s read
    // honest work as a hang.
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
