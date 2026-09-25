// SHIM (AGENTS.md rule 16, declared exception): vite loads its config from this
// file's DEFAULT export and nothing else, so this one file keeps one.
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import { getRequestListener } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintSession } from '@niscorp/moss';
import type { Connection } from '@niscorp/moss';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import type { Booted } from './src/server/boot';

// The app server runs INSIDE vite's dev process — one `pnpm dev`, one port.
// `ssrLoadModule` gives the composition vite's own resolution, so this is the
// same boot `serve.ts` runs standalone and the checks run in-process. It
// re-boots on save: a manifest, layout or seed edit rebuilds the whole world
// (fresh database, fresh shells) and the browser reloads onto it.
const SERVER_DIRS = /[\\/]src[\\/](app|server|db)[\\/]/;

// `ssrLoadModule` hands back an untyped record; the one thing this file needs
// from it is a function called `boot`, so that is what is parsed.
const BootModuleSchema = z.object({ boot: z.custom<() => Promise<Booted>>((value) => typeof value === 'function') });

type Running = { listener: ReturnType<typeof getRequestListener>; booted: Booted };

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const appServer = (): Plugin => ({
  name: 'lyceum-app-server',
  configureServer: (viteServer: ViteDevServer) => {
    const build = async (): Promise<Running> => {
      const { boot } = BootModuleSchema.parse(await viteServer.ssrLoadModule('/src/server/boot.ts'));
      const booted = await boot();
      return { listener: getRequestListener(booted.server.fetch), booted };
    };
    let current = build();

    viteServer.httpServer?.once('close', () => void current.then(({ booted }) => booted.close(), () => {}));

    // The socket is attached ONCE with a delegating accept — every rebuild swaps
    // what it delegates to, never the upgrade handler.
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
            viteServer.config.logger.info('[lyceum] app server re-booted', { timestamp: true });
            viteServer.ws.send({ type: 'full-reload' });
          },
          (error: unknown) => viteServer.config.logger.error(`[lyceum] re-boot failed: ${error instanceof Error ? error.message : String(error)}`, { timestamp: true }),
        );
      }, 200);
    };
    viteServer.watcher.on('change', rebuild);
    viteServer.watcher.on('add', rebuild);
    viteServer.watcher.on('unlink', rebuild);

    // ─── /dev/as/<principal> — sign a browser in as the speaker or the stage ──
    //
    // DEV ONLY: it lives in vite's middleware and nowhere else, so it cannot
    // ship. It mints a REAL session — the same credential stepping in mints —
    // and only for a principal the `grants` table names; a member signs in by
    // stepping in, like everybody in the room. The talk's own sign-in for the
    // speaker and the stage is decided before the VPS (PLAN.md, Open).
    viteServer.middlewares.use((req, res, next) => {
      const who = /^\/dev\/as\/([\w-]+)/.exec(req.url ?? '')?.[1];
      if (who === undefined) {
        next();
        return;
      }
      void current
        .then(async ({ booted }) => {
          const held = await booted.runtime.pool.query('SELECT 1 FROM grants WHERE principal = $1', [who]);
          if (held.rows.length === 0) {
            res.statusCode = 404;
            res.end(`no such principal: ${who}`);
            return;
          }
          const token = await mintSession(booted.runtime.pool, who, SESSION_TTL_MS);
          res.setHeader('content-type', 'text/html');
          res.end(`<script>localStorage.setItem('nisc.token',${JSON.stringify(token)});location.replace('/')</script>`);
        })
        .catch(() => {
          res.statusCode = 500;
          res.end('dev sign-in failed');
        });
    });

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

export default defineConfig({
  plugins: [appServer()],
  resolve: { alias: { '@lyceum': resolve(here, 'src') } },
  server: { port: 5197, fs: { allow: [workspaceRoot] } },
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
});
