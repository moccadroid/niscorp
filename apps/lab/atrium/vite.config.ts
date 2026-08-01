import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { getRequestListener } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// The app server runs INSIDE vite's dev process — one `pnpm dev`, no proxy, no
// second terminal. `ssrLoadModule` gives the composition vite's own resolution,
// so this is the same boot `serve.ts` runs standalone.
//
// And it RE-boots on save: vite invalidates the SSR modules but nothing re-ran
// the composition, so manifest/layout/seed edits used to serve stale until a
// manual restart. Now the watcher rebuilds the whole world (fresh PGlite,
// fresh seed, fresh shells — ~a second) and broadcasts a full reload, so the
// browser reconnects to the new server. Sessions reset on each save; that is
// what a dev reload is.
// `ui` is in here because the SERVER holds the component registry too — it
// verifies a layout's props against the kit's schemas before serving it. Leave
// the kit out and a new prop is valid in the browser and rejected on the
// server, which renders as "the control silently isn't there".
const SERVER_DIRS = /[\\/]src[\\/](app|server|db|integrations|ui)[\\/]/;

type BootedServer = { fetch: (req: Request) => Response | Promise<Response>; socket: Parameters<typeof attachSocket>[1] };

const appServer = (): Plugin => ({
  name: 'atrium-app-server',
  configureServer: (viteServer: ViteDevServer) => {
    let current: Promise<{ listener: ReturnType<typeof getRequestListener>; server: BootedServer }>;

    const build = async (): Promise<{ listener: ReturnType<typeof getRequestListener>; server: BootedServer }> => {
      const mod = (await viteServer.ssrLoadModule('/src/server/boot.ts')) as { boot: () => Promise<{ server: BootedServer }> };
      const { server } = await mod.boot();
      return { listener: getRequestListener(server.fetch), server };
    };
    current = build();

    // The socket is attached ONCE with a delegating accept — every rebuild
    // swaps what it delegates to, never the upgrade handler.
    if (viteServer.httpServer !== null) {
      attachSocket(viteServer.httpServer, async (url, connection) => (await current).server.socket(url, connection));
    }

    let timer: NodeJS.Timeout | undefined;
    const rebuild = (file: string): void => {
      if (!SERVER_DIRS.test(file)) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        current = build();
        void current.then(
          () => {
            viteServer.config.logger.info('[atrium] app server re-booted', { timestamp: true });
            viteServer.ws.send({ type: 'full-reload' });
          },
          (error: unknown) => viteServer.config.logger.error(`[atrium] re-boot failed: ${error instanceof Error ? error.message : String(error)}`, { timestamp: true }),
        );
      }, 200);
    };
    viteServer.watcher.on('change', rebuild);
    viteServer.watcher.on('add', rebuild);
    viteServer.watcher.on('unlink', rebuild);

    // ─── /dev/as/<username> — a signed-in URL ────────────────
    //
    // A headless browser can photograph a page but cannot click one, so any
    // judgement about a SIGNED-IN screen was being made without looking at it.
    // This mints the same dev token the login picker mints and hands it to the
    // wire the same way the admin pill's link does, then redirects.
    //
    // It lives in vite's dev middleware and nowhere else, so it cannot ship: no
    // route on the moss server, nothing in the bundle. It grants exactly what
    // the login page already grants to anyone who opens it — choosing a name IS
    // the auth in this demo (PLAN.md), and when that stops being true this goes
    // with the mint.
    viteServer.middlewares.use((req, res, next) => {
      const who = /^\/dev\/as\/([\w.]+)/.exec(req.url ?? '')?.[1];
      if (who === undefined) {
        next();
        return;
      }
      void current
        .then(async () => {
          const users = (await viteServer.ssrLoadModule('/src/server/users.ts')) as { mintToken: (u: string) => string | null };
          const token = users.mintToken(who);
          res.setHeader('content-type', 'text/html');
          res.end(
            token === null
              ? `<p>no such person: ${who}</p>`
              : `<script>localStorage.setItem('nisc.token',${JSON.stringify(token)});location.replace('/')</script>`,
          );
        })
        .catch(() => {
          res.statusCode = 500;
          res.end('dev login failed');
        });
    });

    viteServer.middlewares.use((req, res, next) => {
      if (req.url !== undefined && (req.url.startsWith('/api') || req.url.startsWith('/catalog') || req.url.startsWith('/integrations') || req.url.startsWith('/operator'))) {
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
  plugins: [react(), appServer()],
  resolve: {
    alias: { '@atrium': resolve(here, 'src') },
  },
  server: { port: 5175, open: true, fs: { allow: [workspaceRoot] } },
  optimizeDeps: {
    // PGlite resolves its WASM assets via import.meta.url at runtime;
    // pre-bundling breaks that.
    exclude: ['@electric-sql/pglite'],
  },
});
