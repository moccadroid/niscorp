import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');

export default defineConfig({
  plugins: [react()],
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
});
