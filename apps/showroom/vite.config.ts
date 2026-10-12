import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { copyFileSync, existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');

// GitHub Pages falls back to 404.html for any path that is not a file, so a
// copy of index.html there serves the app on a deep link or a refresh.
const spaFallback = (): Plugin => ({
  name: 'showroom-spa-404-fallback',
  apply: 'build',
  closeBundle() {
    const index = resolve(here, 'dist/index.html');
    if (existsSync(index)) copyFileSync(index, resolve(here, 'dist/404.html'));
  },
});

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/niscorp/' : '/',
  plugins: [react(), spaFallback()],
  resolve: {
    alias: {
      '@showroom': resolve(here, 'src'),
      '@packages': resolve(workspaceRoot, 'packages'),
    },
  },
  server: {
    port: 5173,
    open: true,
    fs: {
      allow: [workspaceRoot],
    },
  },
  // Signal's openai-compatible adapter does `await import('openai')` at
  // runtime, which Vite cannot discover inside the workspace-linked bundle.
  optimizeDeps: {
    include: ['openai'],
    // PGlite resolves its WASM and extension assets via import.meta.url at
    // runtime, which pre-bundling breaks.
    exclude: ['@electric-sql/pglite', '@electric-sql/pglite-pgvector'],
  },
}));
