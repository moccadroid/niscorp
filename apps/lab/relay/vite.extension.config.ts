import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../../..');

// The Chrome extension build: `pnpm extension` → extension/dist, load
// unpacked from there. Root is extension/ (panel.html), publicDir carries
// the manifest and the plain-JS extension plumbing verbatim. base '' keeps
// asset urls relative — extension pages live under chrome-extension://.
export default defineConfig({
  root: resolve(here, 'extension'),
  base: '',
  publicDir: resolve(here, 'extension/public'),
  plugins: [react()],
  resolve: {
    alias: {
      '@relay': resolve(here, 'src'),
      // same shim as the app build — see vite.config.ts
      'node:crypto': resolve(here, 'node-crypto-shim.ts'),
      crypto: resolve(here, 'node-crypto-shim.ts'),
    },
  },
  server: {
    fs: { allow: [workspaceRoot] },
  },
  build: {
    outDir: resolve(here, 'extension/dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(here, 'extension/panel.html'),
    },
  },
});
