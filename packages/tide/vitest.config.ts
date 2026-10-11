import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The one PGlite the run initialises from nothing is made here, before
    // any test file and with no limit on how long it takes
    // (test/initialised-database.ts says why).
    globalSetup: ['test/initialised-database.ts'],
    // Two files run on a PGlite, a WASM Postgres: one database for a file,
    // started in a hook from the directory the run initialised, its tables
    // emptied for each test (test/support.ts, `oneDatabase`).
    //
    // 30 s for a hook and for a test, as in vex. Under contention (every
    // package's tests running at once, a two-core CI runner) starting a
    // database takes many times what it takes alone, and the defaults of 10 s
    // and 5 s read honest work as a hang. 30 s still catches a real one.
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
