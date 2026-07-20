import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      '@shared': r('./src/shared'),
      '@action': r('./src/action'),
      '@layout': r('./src/layout'),
      '@shell': r('./src/shell'),
      '@react': r('./src/adapters/react'),
    },
  },
});
