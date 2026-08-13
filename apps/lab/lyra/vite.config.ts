// .env first — OPERATOR_KEY lives there, and the server reads it from the
// environment when it decides whether the operator seam exists at all. Vite
// puts VITE_-prefixed values on import.meta.env for the browser; this is the
// server half, and nothing prefixed VITE_ should ever hold a key.
try {
  process.loadEnvFile();
} catch {
  /* no .env present — the seam simply does not exist */
}

import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { getRequestListener } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// The app server runs INSIDE vite's dev process — one `pnpm dev`, no proxy, no
// second terminal. `ssrLoadModule` gives the composition vite's own resolution,
// so this is the same boot `serve.ts` runs standalone, and it re-boots on save:
// a fresh PGlite, a fresh seed, fresh shells, then a full reload so the browser
// reconnects to the new server. Sessions reset on each save; that is what a dev
// reload is.
//
// `ui` is in the watch set because the SERVER holds the component registry too
// — it verifies a layout's props against the kit's schemas before serving it.
// Leave the kit out and a new prop is valid in the browser and rejected on the
// server, which reads as "the control silently isn't there".
const SERVER_DIRS = /[\\/]src[\\/](app|server|db|ui)[\\/]/;

type BootedServer = {
  fetch: (req: Request) => Response | Promise<Response>;
  socket: Parameters<typeof attachSocket>[1];
  // A booted server owns timers — the socket's revalidation pass, the shell
  // host's idle sweep. A hot rebuild has to hand them back.
  shells?: { stop: () => void };
};

const appServer = (): Plugin => ({
  name: 'lyra-app-server',
  configureServer: (viteServer: ViteDevServer) => {
    let current: Promise<{ listener: ReturnType<typeof getRequestListener>; server: BootedServer }>;

    const build = async (): Promise<{ listener: ReturnType<typeof getRequestListener>; server: BootedServer }> => {
      const mod = (await viteServer.ssrLoadModule('/src/server/boot.ts')) as { bootDevServer: () => Promise<{ server: BootedServer }> };
      const { server } = await mod.bootDevServer();
      return { listener: getRequestListener(server.fetch), server };
    };
    current = build();

    // The socket is attached ONCE with a delegating accept — every rebuild
    // swaps what it delegates to, never the upgrade handler.
    if (viteServer.httpServer !== null) {
      attachSocket(
        viteServer.httpServer,
        Object.assign(async (url: string, connection: Parameters<BootedServer['socket']>[1]) => (await current).server.socket(url, connection), {
          stop: () => void current.then(({ server }) => server.socket.stop(), () => {}),
        }),
      );
    }

    let timer: NodeJS.Timeout | undefined;
    const rebuild = (file: string): void => {
      if (!SERVER_DIRS.test(file)) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        // The outgoing server keeps running until the new one is up (a failed
        // rebuild must not take the dev server down with it), and is then
        // retired, timers included.
        const outgoing = current;
        current = build();
        void current.then(
          () => {
            void outgoing.then(
              ({ server }) => {
                server.socket.stop();
                server.shells?.stop();
              },
              () => {}, // it never booted; there is nothing to retire
            );
            viteServer.config.logger.info('[lyra] app server re-booted', { timestamp: true });
            viteServer.ws.send({ type: 'full-reload' });
          },
          (error: unknown) => viteServer.config.logger.error(`[lyra] re-boot failed: ${error instanceof Error ? error.message : String(error)}`, { timestamp: true }),
        );
      }, 200);
    };
    viteServer.watcher.on('change', rebuild);
    viteServer.watcher.on('add', rebuild);
    viteServer.watcher.on('unlink', rebuild);

    // ─── /dev/as/<username> — a signed-in URL ────────────────
    //
    // A headless browser can photograph a page but cannot click one, so any
    // judgement about a SIGNED-IN screen would otherwise be made without
    // looking at it. This mints the same dev token the login page mints and
    // hands it to the wire the same way, then redirects.
    //
    // It lives in vite's dev middleware and nowhere else, so it cannot ship:
    // no route on the moss server, nothing in the bundle.
    viteServer.middlewares.use((req, res, next) => {
      const who = /^\/dev\/as\/([\w.@-]+)/.exec(req.url ?? '')?.[1];
      if (who === undefined) {
        next();
        return;
      }
      void current
        .then(async () => {
          const users = (await viteServer.ssrLoadModule('/src/server/users.ts')) as { mintToken: (u: string) => string | null };
          const token = users.mintToken(decodeURIComponent(who));
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
      // THREE PREFIXES THE APP SERVER OWNS, and the list is the whole routing
      // table: /api (vex and the app's own surfaces), /catalog (the resolved
      // application), /operator (the keyed seam an administration tool talks to)
      // and /integrations (the proxy out to a registered service). Anything else
      // is vite's — which is why a missing prefix here reads as an HTML page
      // where a JSON answer was expected, rather than as a 404.
      const OWNED = ['/api', '/catalog', '/operator', '/integrations'];
      if (req.url !== undefined && OWNED.some((prefix) => req.url?.startsWith(prefix) === true)) {
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
    alias: { '@lyra': resolve(here, 'src') },
  },
  server: { port: 5180, open: true, fs: { allow: [workspaceRoot] } },
  optimizeDeps: {
    // PGlite resolves its WASM assets via import.meta.url at runtime;
    // pre-bundling breaks that.
    exclude: ['@electric-sql/pglite'],
  },
});
