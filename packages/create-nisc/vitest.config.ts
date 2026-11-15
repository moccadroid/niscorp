import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // test/cli.test.ts runs the bin, which runs dist/.
    globalSetup: ['test/build.ts'],
  },
});
