// SHIM (AGENTS.md rule 16, declared exception): vite loads its config from this
// file's DEFAULT export and nothing else, so this one file keeps one.
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import { getRequestListener } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintSession, sessionCookies } from '@niscorp/moss';
import type { Connection } from '@niscorp/moss';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import type { PGlite } from '@electric-sql/pglite';
import type { Booted } from './src/server/boot';
import type { mountLogin as mountLoginType } from './src/server/login';

// The app server runs INSIDE vite's dev process — one `pnpm dev`, one port.
// `ssrLoadModule` gives the composition vite's own resolution, so this is the
// same boot `serve.ts` runs standalone and the checks run in-process. It
// re-boots on save: a manifest, layout or seed edit rebuilds the server and its
// shells, and the browser reloads onto it. The DATABASE is not rebuilt: it is
// opened once here and lent to every boot, so everybody stays signed in across
// an edit. A fresh room is a restart of `pnpm dev`.
const SERVER_DIRS = /[\\/]src[\\/](app|server|db)[\\/]/;

// `ssrLoadModule` hands back an untyped record; the one thing this file needs
// from it is a function called `boot`, so that is what is parsed.
const BootModuleSchema = z.object({ boot: z.custom<(db: PGlite, options: { publicUrl?: string }) => Promise<Booted>>((value) => typeof value === 'function') });
const RuntimeModuleSchema = z.object({ openDevDatabase: z.custom<() => PGlite>((value) => typeof value === 'function') });
const LoginModuleSchema = z.object({ mountLogin: z.custom<typeof mountLoginType>((value) => typeof value === 'function') });
// The slide on screen, as deck/current answers it: where it is, and how many.
const DeckSchema = z.object({ result: z.object({ position: z.number(), count: z.number() }) }).transform((body) => body.result);

type Running = { listener: ReturnType<typeof getRequestListener>; booted: Booted };

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

// Keys (GROQ_API_KEY, TYPESAFE_API_KEY) for the dev server, from this app's own
// .env — read once, before the first boot.
const here = dirname(fileURLToPath(import.meta.url));
if (existsSync(resolve(here, '.env'))) process.loadEnvFile(resolve(here, '.env'));

// What the projector's QR code says in dev. localhost unless told otherwise:
// vite listens on this machine only, and it should — /dev/as would otherwise
// sign anybody on the wifi in as the speaker. To try it with a real phone, run
// `pnpm dev --host` with PUBLIC_URL set to this machine's address, knowing that.
const PORT = 5197;
const PUBLIC_URL = process.env['PUBLIC_URL'] ?? `http://localhost:${PORT}`;

const appServer = (): Plugin => ({
  name: 'lyceum-app-server',
  configureServer: (viteServer: ViteDevServer) => {
    // The one database of this `pnpm dev`, opened with the first boot.
    const database = viteServer.ssrLoadModule('/src/server/runtime.ts').then((module) => RuntimeModuleSchema.parse(module).openDevDatabase());
    const build = async (): Promise<Running> => {
      const { boot } = BootModuleSchema.parse(await viteServer.ssrLoadModule('/src/server/boot.ts'));
      const booted = await boot(await database, { publicUrl: PUBLIC_URL });
      // The deployment's own sign-ins (/speaker, /login, /stage), the same here.
      const { mountLogin } = LoginModuleSchema.parse(await viteServer.ssrLoadModule('/src/server/login.ts'));
      mountLogin(booted.server, booted.runtime.pool);
      return { listener: getRequestListener(booted.server.fetch), booted };
    };
    let current = build();

    viteServer.httpServer?.once('close', () => {
      void current.then(({ booted }) => booted.close(), () => {});
      void database.then((db) => (db.closed ? undefined : db.close()), () => {});
    });

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
    // stepping in, like everybody in the room. The talk's own sign-ins
    // (/speaker, /login, /stage) are mounted above, as the deployment has them.
    // ─── /dev/vendor/bundle, /dev/vendor-broken/bundle — the Q&A, from source ──
    //
    // DEV ONLY: the third party's bundle (apps/lab/lyceum-vendor-demo) as its
    // source has it now, so a rehearsal installs the Q&A without the network
    // and before a change to it is published. Point the server at it with
    // LYCEUM_VENDOR_URL=http://localhost:<port>/dev/vendor (and -broken).
    viteServer.middlewares.use((req, res, next) => {
      const which = /^\/dev\/(vendor|vendor-broken)\/bundle$/.exec(req.url ?? '')?.[1];
      if (which === undefined) {
        next();
        return;
      }
      void viteServer
        .ssrLoadModule('../lyceum-vendor-demo/src/bundle.ts')
        .then((mod) => {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(which === 'vendor' ? mod['QA_BUNDLE'] : mod['QA_BROKEN_BUNDLE']));
        })
        .catch(() => {
          res.statusCode = 500;
          res.end('the bundle could not be loaded');
        });
    });

    // ─── /dev/new — a fresh seat: somebody new at the door, in a tab of its own ──
    viteServer.middlewares.use((req, res, next) => {
      if (req.url !== '/dev/new') {
        next();
        return;
      }
      res.statusCode = 302;
      res.setHeader('location', `/?seat=guest-${Math.random().toString(36).slice(2, 8)}`);
      res.end();
    });

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
          // Into the principal's own SEAT (src/main.ts), so the stage, the
          // speaker and any number of members can share one browser — as the
          // real sign-ins do it (src/server/login.ts): the seat's cookie, set
          // by this answer.
          res.statusCode = 302;
          res.setHeader('set-cookie', sessionCookies(`http://${req.headers.host ?? 'localhost'}`, token, { key: `nisc.token.${who}`, lastsMs: SESSION_TTL_MS }));
          res.setHeader('location', `/?seat=${who}`);
          res.end();
        })
        .catch(() => {
          res.statusCode = 500;
          res.end('dev sign-in failed');
        });
    });

    // ─── /dev/deck/next, /dev/deck/back — move the deck from the keyboard ──
    //
    // DEV ONLY, for rehearsing: the arrow keys on the projector or the
    // controller (src/main.ts) move the deck as the speaker would, so nobody
    // switches windows to press Next. The stage's own principal cannot move
    // the deck, and stays that way; this is the speaker, minted here, doing
    // what the controller's Back and Next do (deck/current, then deck/go).
    viteServer.middlewares.use((req, res, next) => {
      const way = /^\/dev\/deck\/(next|back)$/.exec(req.url ?? '')?.[1];
      if (way === undefined || req.method !== 'POST') {
        next();
        return;
      }
      void current
        .then(async ({ booted }) => {
          const token = await mintSession(booted.runtime.pool, 'speaker', 60_000);
          const vex = async (fingerprint: string, context: Record<string, unknown>): Promise<unknown> =>
            (await booted.server.request('/api/vex', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ fingerprint, context }) })).json();
          const deck = DeckSchema.parse(await vex('deck/current', {}));
          const position = Math.max(0, Math.min(deck.count - 1, deck.position + (way === 'next' ? 1 : -1)));
          await vex('deck/go', { deck: 'talk', position });
          res.statusCode = 204;
          res.end();
        })
        .catch(() => {
          res.statusCode = 500;
          res.end('dev deck move failed');
        });
    });

    viteServer.middlewares.use((req, res, next) => {
      if (req.url !== undefined && /^\/(api|catalog|login|speaker|stage)(\/|\?|$)/.test(req.url)) {
        void current.then(({ listener }) => listener(req, res));
        return;
      }
      next();
    });
  },
});

const workspaceRoot = resolve(here, '../../..');

export default defineConfig({
  plugins: [appServer()],
  resolve: { alias: { '@lyceum': resolve(here, 'src') } },
  server: { port: PORT, fs: { allow: [workspaceRoot] } },
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
});
