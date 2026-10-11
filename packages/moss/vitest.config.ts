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
    // its own from the directory the run initialised (140 ms on an idle
    // machine, test/pristine-database.ts), where it used to initialise one
    // from nothing (660 ms; 62 of them). That took the suite from 19.8 s to
    // 9.6 s and its slowest database test to 0.7 s, measured with this suite
    // running alone.
    //
    // The 30 s stays, and for the reason it was set: under contention the
    // same honest work takes several times longer. Measured on 2026-10-11
    // with the default 5 s and every package's tests running at once
    // (`pnpm verify`, 32 cores): this suite took 33.7 s instead of 12, and
    // one database test passed 5 s and failed with nothing wrong in it. A
    // two-core CI runner is slower still. 30 s still catches a real hang.
    testTimeout: 30_000,
  },
});
