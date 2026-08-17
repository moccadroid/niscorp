import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.ts'],
    // Most of these tests boot their own PGlite — a WASM Postgres, compiled
    // and initdb'd per case. That's ~800ms on a dev machine and several
    // seconds on a two-core CI runner under worker contention, so the default
    // 5s budget reads honest work as a hang. 30s still catches a real one.
    testTimeout: 30_000,
  },
});
