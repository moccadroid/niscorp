import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The postgres suite boots a PGlite per case, which takes several seconds
    // when every package tests at once.
    testTimeout: 30_000,
  },
});
