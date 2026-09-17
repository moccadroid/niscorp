import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.ts'],
    // The composite-key test boots a real PGlite — a WASM Postgres, compiled
    // and initdb'd — in a beforeAll. That's ~1s on a dev machine and more
    // than the default 10s on a two-core CI runner under worker contention,
    // so the default read honest work as a hang. 30s still catches a real
    // one. Same budget moss gives its PGlite-backed cases.
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
