import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/initialised-database.ts'],
    // Under contention (every package's tests at once, a two-core CI runner) starting a database
    // outlasts the defaults of 10 s and 5 s.
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
