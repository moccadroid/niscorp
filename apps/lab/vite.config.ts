import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    open: true,
    fs: {
      allow: [workspaceRoot],
    },
  },
});
