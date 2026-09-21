import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { getRequestListener } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import type { Connection } from '@niscorp/moss';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import type { Booted } from './src/server/boot';

// The app server runs INSIDE vite's dev process — one `pnpm dev`, one port, no
// proxy. `ssrLoadModule` gives the composition vite's own resolution, so this
// is the same boot `serve.ts` runs standalone and the checks run in-process.
//
// And it RE-boots on save: vite invalidates the SSR modules but nothing re-runs
// the composition, so a manifest, layout or seed edit would serve stale until a
// restart. The watcher rebuilds the whole world (fresh PGlite, fresh seed,
// fresh shells, fresh decider) and broadcasts a full reload.
//
// `ui` is in the list because the SERVER holds the component names too: it
// registers every name a layout mentions, so a new primitive has to reach both
// sides or it renders as "the control silently isn't there".
const SERVER_DIRS = /[\\/]src[\\/](app|server|db|lib|ui)[\\/]/;

// `ssrLoadModule` hands back an untyped record. It is parsed, not cast: the one
// thing this file needs from it is a function called `boot`.
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

    // Vite restarts ITSELF when a `.env` or this config changes, and runs this
    // hook again on a new server: the world booted here has to go with the
    // server it was booted for, or every restart leaks a listener and its
    // timers into a process that outlives them.
    viteServer.httpServer?.once('close', () => void current.then(({ booted }) => booted.close(), () => {}));

    // The socket is attached ONCE with a delegating accept — every rebuild
    // swaps what it delegates to, never the upgrade handler.
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
        // The outgoing world keeps serving until the new one is up — a failed
        // rebuild must not take the dev server down — and is then retired
        // WHOLE: its timers and its fake provider's listener. (The new world's
        // provider asks for the same port while the old one still holds it;
        // it falls back to a free one, which is why the app only ever reaches
        // its provider by the port that was actually bound.)
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

// A default export because vite's config loader demands one (AGENTS.md rule 16
// excepts files that must match an external tool's shape).
export default defineConfig({
  plugins: [react(), appServer()],
  resolve: { alias: { '@encore': resolve(here, 'src') } },
  server: { port: 5195, strictPort: true, fs: { allow: [workspaceRoot] } },
  optimizeDeps: {
    // PGlite resolves its WASM assets via import.meta.url at runtime;
    // pre-bundling breaks that.
    exclude: ['@electric-sql/pglite'],
  },
});
