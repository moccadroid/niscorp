// Vite puts only VITE_-prefixed values on import.meta.env, for the browser. The
// app server reads its keys (OPERATOR_KEY) from the environment.
try {
  process.loadEnvFile();
} catch {
  /* no .env present */
}

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../../..');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@lyra': resolve(here, 'src') },
  },
  server: { port: 5180, open: true, fs: { allow: [workspaceRoot] } },
  optimizeDeps: {
    // PGlite resolves its WASM assets via import.meta.url at runtime;
    // pre-bundling breaks that.
    exclude: ['@electric-sql/pglite'],
  },
});
