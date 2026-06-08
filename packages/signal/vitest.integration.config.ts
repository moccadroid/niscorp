import { defineConfig } from 'vitest/config';

// Opt-in config for live provider integration tests. These hit real
// APIs (each describe self-skips without its provider key) and assert
// leniently — connectivity, response shape, no throw — not specific
// model behaviour. Run with `pnpm test:integration`.
export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*integration.test.ts'],
  },
});
