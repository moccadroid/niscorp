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
      // Allow Vite to read the workspace-linked package source.
      allow: [workspaceRoot],
    },
  },
  optimizeDeps: {
    // PGlite ships its Postgres WASM assets and resolves them via
    // import.meta.url at runtime; pre-bundling breaks that, so exclude it.
    exclude: ['@electric-sql/pglite'],
  },
});
