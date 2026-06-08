import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Live provider integration tests (real API calls, lenient
    // assertions) are opt-in — they don't belong in the deterministic
    // default suite. Run them with `pnpm test:integration`.
    exclude: [...configDefaults.exclude, '**/*integration.test.ts'],
  },
});
