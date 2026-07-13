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
      // @niscorp/vex's cache hashing imports createHash from `node:crypto` — a
      // Node builtin absent in the browser (its bundled dist normalizes the
      // specifier to bare `crypto`). Point both at a tiny @noble/hashes-backed
      // shim whose SHA-256 is byte-identical.
      'node:crypto': resolve(here, 'src/lib/node-crypto-shim.ts'),
      crypto: resolve(here, 'src/lib/node-crypto-shim.ts'),
    },
  },
  server: {
    port: 5176,
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
