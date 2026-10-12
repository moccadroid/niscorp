import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { getRequestListener } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';

// ssrLoadModule gives boot.ts vite's own resolution (aliases, TS).
const appServer = (): Plugin => ({
  name: 'relay-app-server',
  configureServer: (viteServer: ViteDevServer) => {
    const ready = (async () => {
      const mod = (await viteServer.ssrLoadModule('/src/server/boot.ts')) as {
        boot: () => Promise<{ server: { fetch: (req: Request) => Response | Promise<Response>; socket: Parameters<typeof attachSocket>[1] } }>;
      };
      const { server } = await mod.boot();
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
    },
  },
  server: {
    port: 5174,
    open: true,
    fs: {
      allow: [workspaceRoot],
    },
  },
  optimizeDeps: {
    // PGlite resolves its Postgres WASM and extension assets via
    // import.meta.url at runtime; pre-bundling breaks that.
    exclude: ['@electric-sql/pglite', '@electric-sql/pglite-pgvector'],
  },
});
