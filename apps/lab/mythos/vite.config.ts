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
  define: {
    // A production build rewrites `globalThis.process.env` to `{}` (vite's
    // define plugin, build only). PGlite reads exactly that as "am I in Node?"
    // and, told yes, writes `process.exitCode` — a ReferenceError in a browser,
    // so the bundle never booted (dev serves PGlite unrewritten, which is why it
    // only ever failed built). Nothing else in the bundle reads it; in a page
    // the true answer is that there is no process.
    'globalThis.process.env': 'undefined',
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
