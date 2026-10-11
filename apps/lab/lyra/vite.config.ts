// .env first — OPERATOR_KEY lives there, and the server reads it from the
// environment when it decides whether the operator seam exists at all. Vite
// puts VITE_-prefixed values on import.meta.env for the browser; this is the
// server half, and nothing prefixed VITE_ should ever hold a key.
try {
  process.loadEnvFile();
} catch {
  /* no .env present — the seam simply does not exist */
}

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// THE FRAMEWORK'S PLUGIN, THE ALIAS, THE PORT: what vite needs to know of this
// app, and nothing of how its server runs.
//
// The app server runs inside vite's dev process under `nisc dev` (`pnpm dev`):
// the command adds moss's dev plugin (`@niscorp/moss/vite`) and feeds it from
// nisc.config.ts, the same boot and the same drawing `nisc build` and
// `nisc start` use. That plugin re-boots the app on an edit (a fresh PGlite, a
// fresh seed, fresh shells, then a full reload), attaches the socket with the
// settings the app's runtime says, draws `/` and the pages, and answers the
// dev sign-in (`/dev/as/<email>`, nisc.config.ts `dev.signIn`) to this machine
// only.
//
// This file held a plugin of its own that did all of that a second time, and
// answered first: its sign-in asked nothing about where a request came from.
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
