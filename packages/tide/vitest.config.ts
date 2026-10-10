import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The Postgres store's tests each boot their own PGlite — a WASM Postgres,
    // compiled and initdb'd per case. That is ~800ms on a dev machine and
    // several seconds on a two-core CI runner under worker contention, so the
    // default 5s budget reads honest work as a hang. 30s still catches a real
    // one. (The same number, for the same tests, as when they ran in moss.)
    testTimeout: 30_000,
  },
});
