import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');

export default defineConfig(({ command }) => ({
  // GitHub Pages serves under /niscorp/. Apply the subpath only at
  // build time so `pnpm dev` keeps serving from `/`.
  base: command === 'build' ? '/niscorp/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@showroom': resolve(here, 'src'),
      // Workspace-internal access to package SOURCE (not the
      // built dist). Used for showroom inspector tabs that show
      // the original .ts of an agent or component via ?raw.
      '@packages': resolve(workspaceRoot, 'packages'),
    },
  },
  server: {
    port: 5173,
    open: true,
    fs: {
      // Allow Vite to read markdown docs from the workspace packages
      // (packages/nova/README.md, packages/prism/README.md, etc.) via
      // ?raw imports inside the library modules.
      allow: [workspaceRoot],
    },
  },
  // Signal's openai-compatible adapter does `await import('openai')` at
  // runtime. Vite can't statically analyse a dynamic specifier inside
  // the workspace-linked signal/dist bundle, so we pre-bundle `openai`
  // here. That lets recipe code call `createSignal('groq')` directly,
  // with no `client` injection in user-facing recipes.
  optimizeDeps: {
    include: ['openai'],
  },
}));
