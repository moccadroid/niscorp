import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { getRequestListener } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';

// The app server runs INSIDE vite's dev process — one `pnpm dev`, no proxy,
// no second terminal. ssrLoadModule gives the composition vite's own
// resolution (aliases, TS), so this is the same boot serve.ts runs standalone.
const appServer = (): Plugin => ({
  name: 'relay-app-server',
  configureServer: (viteServer: ViteDevServer) => {
    const ready = (async () => {
      const mod = (await viteServer.ssrLoadModule('/src/server/boot.ts')) as {
        boot: () => Promise<{ server: { fetch: (req: Request) => Response | Promise<Response>; socket: Parameters<typeof attachSocket>[1] } }>;
      };
      const { server } = await mod.boot();
      // The socket rides vite's own http server — one port, app + api + ws.
      if (viteServer.httpServer !== null) attachSocket(viteServer.httpServer, server.socket);
      return getRequestListener(server.fetch);
    })();
    viteServer.middlewares.use((req, res, next) => {
      if (req.url !== undefined && (req.url.startsWith('/api') || req.url.startsWith('/catalog'))) {
        void ready.then((listener) => listener(req, res));
        return;
      }
      next();
    });
  },
});
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../../..');

export default defineConfig({
  plugins: [react(), appServer()],
  resolve: {
    alias: {
      '@relay': resolve(here, 'src'),
      // @niscorp/vex's cache hashing imports createHash from `node:crypto`
      // — a Node builtin absent in the browser (its bundled dist normalizes
      // the specifier to bare `crypto`). Point both at a tiny
      // @noble/hashes-backed shim whose SHA-256 is byte-identical.
      'node:crypto': resolve(here, 'node-crypto-shim.ts'),
      crypto: resolve(here, 'node-crypto-shim.ts'),
    },
  },
  server: {
    port: 5174,
    open: true,
    fs: {
      // Allow Vite to read the workspace-linked package source.
      allow: [workspaceRoot],
    },
  },
  optimizeDeps: {
    // PGlite ships its Postgres WASM + extension assets and resolves them
    // via import.meta.url at runtime; pre-bundling breaks that, so exclude
    // it (per ElectricSQL's Vite guidance).
    exclude: ['@electric-sql/pglite', '@electric-sql/pglite-pgvector'],
  },
});
