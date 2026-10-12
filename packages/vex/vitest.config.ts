import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.ts'],
    // A beforeAll that boots PGlite, a WASM Postgres, takes more than the
    // default 10s on a two-core CI runner under worker contention.
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
