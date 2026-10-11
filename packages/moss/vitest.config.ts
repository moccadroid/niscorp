import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.ts'],
    // No `testTimeout`: a test has vitest's own 5 s. It was 30 s, for the
    // tests that start a database: ten files started 62 PGlites, each
    // initialised from nothing (660 ms on an idle machine, 1.0 to 2.7 s with
    // every core busy), and 35 tests took over a second, the slowest 3.5 s.
    // A file initialises one database now and each test starts its own from
    // that directory, in 140 ms (test/pristine-database.ts). Measured after,
    // the whole suite running at once: one test over a second (1.1 s, and it
    // starts no database), the slowest that does 0.7 s.
  },
});
