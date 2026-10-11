import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The one PGlite the run initialises from nothing is made here, before
    // any test file and with no limit on how long it takes
    // (test/initialised-database.ts says why).
    globalSetup: ['test/initialised-database.ts'],
    // No `testTimeout`: a test has vitest's own 5 s. It was 30 s, because the
    // two files that run on Postgres started a PGlite for each test (45 and
    // 26; 660 ms each on an idle machine, several seconds on a loaded one).
    // They start one for a file now, in a hook, from the directory the run
    // initialised, and empty its tables for each test (test/support.ts,
    // `oneDatabase`). Measured after: the slowest test of the package takes
    // about 200 ms, and the two files take 2 s between them where they took
    // 55.
  },
});
