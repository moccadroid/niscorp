import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      '@compile': r('./src/compile'),
      '@editor': r('./src/editor'),
      '@plugins': r('./src/plugins'),
      '@react': r('./src/react'),
    },
  },
});
