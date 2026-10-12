import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../../..');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@fable': resolve(here, 'src'),
    },
  },
  server: {
    port: 5175,
    open: true,
    fs: {
      allow: [workspaceRoot],
    },
  },
  optimizeDeps: {
    // PGlite resolves its WASM assets via import.meta.url at runtime, which
    // pre-bundling breaks.
    exclude: ['@electric-sql/pglite'],
  },
});
