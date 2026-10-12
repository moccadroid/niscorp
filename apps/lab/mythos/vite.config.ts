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
      '@mythos': resolve(here, 'src'),
    },
  },
  define: {
    // A production build rewrites `globalThis.process.env` to `{}` (vite's
    // define plugin, build only). PGlite reads that as running in Node and
    // writes `process.exitCode`, a ReferenceError in a browser. Nothing else
    // in the bundle reads it.
    'globalThis.process.env': 'undefined',
  },
  server: {
    port: 5176,
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
