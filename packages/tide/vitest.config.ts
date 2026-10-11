import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The one PGlite the run initialises from nothing is made here, before
    // any test file and with no limit on how long it takes
    // (test/initialised-database.ts says why).
    globalSetup: ['test/initialised-database.ts'],
    // Two files run on a PGlite, a WASM Postgres. They started one for each
    // test (45 and 26; 660 ms each on an idle machine); they start one for a
    // file now, in a hook, from the directory the run initialised, and empty
    // its tables for each test (test/support.ts, `oneDatabase`). Measured
    // with this suite running alone: the slowest test takes about 200 ms, and
    // the two files take 2 s between them where they took 55.
    //
    // The 30 s for a hook and for a test is the budget vex and moss give
    // their PGlite-backed cases, and for the same reason: under contention
    // the same honest work takes several times longer. Measured on 2026-10-11
    // with the defaults and every package's tests running at once
    // (`pnpm verify`, 32 cores): a hook here passed 10 s while it still
    // initialised a database from nothing, and a database test of moss's
    // passed 5 s. A two-core CI runner is slower still. 30 s still catches a
    // real hang.
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
