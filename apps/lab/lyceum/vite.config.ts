// Vite loads its config from this file's default export and nothing else, so
// this one file keeps one.
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import { getRequestListener } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { mintSession, sessionCookies } from '@niscorp/moss';
import type { Connection } from '@niscorp/moss/protocol';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { BlockList, isIPv4, isIPv6 } from 'node:net';
import { z } from 'zod';
import type { PGlite } from '@electric-sql/pglite';
import type { Booted } from './src/server/boot';
import type { mountLogin as mountLoginType } from './src/server/login';

const SERVER_DIRS = /[\\/]src[\\/](app|server|db)[\\/]/;

const BootModuleSchema = z.object({ boot: z.custom<(db: PGlite, options: { publicUrl?: string }) => Promise<Booted>>((value) => typeof value === 'function') });
const RuntimeModuleSchema = z.object({ openDevDatabase: z.custom<() => PGlite>((value) => typeof value === 'function') });
const LoginModuleSchema = z.object({ mountLogin: z.custom<typeof mountLoginType>((value) => typeof value === 'function') });
const DeckSchema = z.object({ result: z.object({ position: z.number(), count: z.number() }) }).transform((body) => body.result);

type Running = { listener: ReturnType<typeof getRequestListener>; booted: Booted };

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const here = dirname(fileURLToPath(import.meta.url));
if (existsSync(resolve(here, '.env'))) process.loadEnvFile(resolve(here, '.env'));

const PORT = 5197;
const PUBLIC_URL = process.env['PUBLIC_URL'] ?? `http://localhost:${PORT}`;

// /dev/as answers this machine only, by the socket's address, never by a
// header. An IPv4-mapped address (`::ffff:127.0.0.1`) is held to the IPv4 rule.
const thisMachine = new BlockList();
thisMachine.addSubnet('127.0.0.0', 8, 'ipv4');
thisMachine.addAddress('::1', 'ipv6');
const fromThisMachine = (address: string | undefined): boolean =>
  address !== undefined && (isIPv4(address) ? thisMachine.check(address, 'ipv4') : isIPv6(address) && thisMachine.check(address, 'ipv6'));

const appServer = (): Plugin => ({
  name: 'lyceum-app-server',
  configureServer: (viteServer: ViteDevServer) => {
    const database = viteServer.ssrLoadModule('/src/server/runtime.ts').then((module) => RuntimeModuleSchema.parse(module).openDevDatabase());
    const build = async (): Promise<Running> => {
      const { boot } = BootModuleSchema.parse(await viteServer.ssrLoadModule('/src/server/boot.ts'));
      const booted = await boot(await database, { publicUrl: PUBLIC_URL });
      const { mountLogin } = LoginModuleSchema.parse(await viteServer.ssrLoadModule('/src/server/login.ts'));
      mountLogin(booted.server, booted.runtime.pool);
      return { listener: getRequestListener(booted.server.fetch), booted };
    };
    let current = build();

    viteServer.httpServer?.once('close', () => {
      void current.then(({ booted }) => booted.close(), () => {});
      void database.then((db) => (db.closed ? undefined : db.close()), () => {});
    });

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
      if (!fromThisMachine(req.socket.remoteAddress)) {
        res.statusCode = 403;
        res.end('/dev/as signs a browser in as whoever the address names, so it answers this machine only.');
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
