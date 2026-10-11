import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.ts'],
    // The one PGlite the run initialises from nothing is made here, before
    // any test file and with no limit on how long it takes
    // (test/initialised-database.ts says why).
    globalSetup: ['test/initialised-database.ts'],
    // Ten files run on a PGlite, a WASM Postgres. Each of their tests starts
    // its own from the directory the run initialised
    // (test/pristine-database.ts).
    //
    // 30 s for a test. Under contention (every package's tests running at
    // once, a two-core CI runner) starting a database takes many times what
    // it takes alone, and the default 5 s reads honest work as a hang. 30 s
    // still catches a real one.
    testTimeout: 30_000,
  },
});
