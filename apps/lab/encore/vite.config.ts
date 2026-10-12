import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { getRequestListener } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import type { Connection } from '@niscorp/moss/protocol';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import type { Booted } from './src/server/boot';

// `ui` is in the list because the server holds the component names too: it
// registers every name a layout mentions.
const SERVER_DIRS = /[\\/]src[\\/](app|server|db|lib|ui)[\\/]/;

const BootModuleSchema = z.object({ boot: z.custom<() => Promise<Booted>>((value) => typeof value === 'function') });

type Running = { listener: ReturnType<typeof getRequestListener>; booted: Booted };

const appServer = (): Plugin => ({
  name: 'encore-app-server',
  configureServer: (viteServer: ViteDevServer) => {
    const build = async (): Promise<Running> => {
      const { boot } = BootModuleSchema.parse(await viteServer.ssrLoadModule('/src/server/boot.ts'));
      const booted = await boot();
      viteServer.config.logger.info(`[encore] decision provider: ${booted.decider.id} · agent: ${booted.agent.id}`, { timestamp: true });
      return { listener: getRequestListener(booted.server.fetch), booted };
    };
    let current = build();

    // Vite restarts itself when a `.env` or this config changes and runs this hook again on a
    // new server: the world booted here has to go with its server, or every restart leaks it.
    viteServer.httpServer?.once('close', () => void current.then(({ booted }) => booted.close(), () => {}));

    if (viteServer.httpServer !== null) {
      attachSocket(
        viteServer.httpServer,
        Object.assign(async (url: string, connection: Connection) => (await current).booted.server.socket(url, connection), {
          stop: () => void current.then(({ booted }) => booted.server.socket.stop(), () => {}),
        }),
      );
    }

    let timer: NodeJS.Timeout | undefined;
    const rebuild = (file: string): void => {
      if (!SERVER_DIRS.test(file)) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const outgoing = current;
        current = build();
        void current.then(
          () => {
            void outgoing.then(({ booted }) => booted.close(), () => {});
            viteServer.config.logger.info('[encore] app server re-booted', { timestamp: true });
            viteServer.ws.send({ type: 'full-reload' });
          },
          (error: unknown) => viteServer.config.logger.error(`[encore] re-boot failed: ${error instanceof Error ? error.message : String(error)}`, { timestamp: true }),
        );
      }, 200);
    };
    viteServer.watcher.on('change', rebuild);
    viteServer.watcher.on('add', rebuild);
    viteServer.watcher.on('unlink', rebuild);

    viteServer.middlewares.use((req, res, next) => {
      if (req.url !== undefined && (req.url.startsWith('/api') || req.url.startsWith('/catalog'))) {
        void current.then(({ listener }) => listener(req, res));
        return;
      }
      next();
    });
  },
});

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../../..');

// A default export because vite's config loader demands one.
export default defineConfig({
  plugins: [react(), appServer()],
  resolve: { alias: { '@encore': resolve(here, 'src') } },
  server: { port: 5195, strictPort: true, fs: { allow: [workspaceRoot] } },
  optimizeDeps: {
    // PGlite resolves its WASM assets via import.meta.url at runtime; pre-bundling breaks that.
    exclude: ['@electric-sql/pglite'],
  },
});
