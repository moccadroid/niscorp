import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The postgres suite boots a real PGlite per case — a WASM Postgres,
    // compiled and initdb'd. ~500ms alone, several seconds when every package
    // tests at once, which the default 5s budget reads as a hang (it did, in
    // the parallel workspace run). Same budget moss and vex give theirs.
    testTimeout: 30_000,
  },
});
