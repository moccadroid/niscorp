import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { getRequestListener } from '@hono/node-server';
import { renderDocument } from './document';
import type { DocumentConfig } from './document';
import { attachSocket, MOSS_PATHS } from './node';
import type { MossServer } from './server';

// ═══════════════════════════════════════════════════════════════
// @niscorp/moss/vite — the app server inside vite's dev process.
//
// One `nisc dev`, no proxy, no second terminal: the app boots in vite's own
// process, through vite's own module loading (`ssrLoadModule`), so the boot it
// runs is the source on disk and an edit is a fresh boot. What it does, in the
// order a request meets it:
//
//   the socket   attached ONCE, delegating to whichever server is current —
//                a re-boot swaps what it delegates to, never the handler
//   /dev/as/:who a signed-in URL, when the app can mint a dev token
//   a page       `/`, or a path one of the manifest's pages answers: index.html
//                through vite first (its client, the framework's refresh
//                preamble), then the screen drawn into it (`renderDocument`)
//   moss's paths /api, /catalog, /operator, /integrations — the app server's
//   the rest     vite's: source files, assets, its own urls
//
// A change under one of the watched directories re-boots the whole app — a
// fresh database, fresh seed, fresh shells — then reloads the page so the
// browser reconnects to the new server. The outgoing server keeps answering
// until the new one is up, so a broken edit does not take the dev server down,
// and is then let go, timers included.
// ═══════════════════════════════════════════════════════════════

export type DevApp = {
  server: MossServer;
  // how to let it go (default: `server.close()`)
  close?: () => void | Promise<void>;
  // How one of its screens is drawn. Absent: pages go out as vite's index.html,
  // undrawn, and the terminal paints them as it always did.
  draw?: DocumentConfig['draw'];
  htmlAttributes?: DocumentConfig['htmlAttributes'];
  tokenKey?: string;
  // A dev-only signed-in URL: `/dev/as/<who>` stores the token this returns —
  // where the wire keeps it and in the cookie copy a page is drawn by — and
  // goes to `/`. `null` is nobody of that name. It lives in vite's middleware
  // and nowhere else, so it cannot ship.
  signIn?: (who: string) => string | null | Promise<string | null>;
};

export type MossDevOptions = {
  // Stand the app up. `load` is vite's own module loader: what it loads is the
  // source as it is on disk now, with the app's aliases resolved.
  app: (load: (id: string) => Promise<Record<string, unknown>>) => Promise<DevApp>;
  // Which edits re-boot the app (default: anything under src/app, src/server,
  // src/db or src/ui — the kit is in it because the SERVER holds the component
  // registry too — and the nisc config).
  watch?: RegExp;
  // The page template, relative to vite's root (default `index.html`).
  index?: string;
  // The paths the app server answers (default: moss's own).
  owned?: RegExp;
  // The name in vite's log (default `moss`).
  label?: string;
};

const DEFAULT_WATCH = /([\\/]src[\\/](app|server|db|ui)[\\/])|([\\/]nisc\.config\.[cm]?[jt]s$)/;
const REBOOT_DEBOUNCE_MS = 200;

type Booted = { app: DevApp; listener: ReturnType<typeof getRequestListener> };

const retire = async (booted: Booted): Promise<void> => {
  booted.app.server.socket.stop();
  await (booted.app.close ?? ((): void => booted.app.server.close()))();
};

const said = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const mossDev = (options: MossDevOptions): Plugin => ({
  name: 'moss-dev',
  apply: 'serve',
  configureServer: (vite: ViteDevServer) => {
    const label = options.label ?? 'moss';
    const watch = options.watch ?? DEFAULT_WATCH;
    const owned = options.owned ?? MOSS_PATHS;
    const load = (id: string): Promise<Record<string, unknown>> => vite.ssrLoadModule(id);

    const boot = async (): Promise<Booted> => {
      const app = await options.app(load);
      return { app, listener: getRequestListener(app.server.fetch) };
    };
    let current = boot();
    current.catch((error: unknown) => vite.config.logger.error(`[${label}] the app did not boot: ${said(error)}`, { timestamp: true }));

    if (vite.httpServer !== null) {
      attachSocket(
        vite.httpServer,
        Object.assign(async (url: string, connection: Parameters<MossServer['socket']>[1]) => (await current).app.server.socket(url, connection), {
          // whichever server is current owns the revalidation timer; this handler owns none
          stop: (): void => void current.then(({ app }) => app.server.socket.stop(), () => undefined),
        }),
      );
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const reboot = (file: string): void => {
      if (!watch.test(file)) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const outgoing = current;
        current = boot();
        current.then(
          () => {
            void outgoing.then(retire, () => undefined);
            vite.config.logger.info(`[${label}] app server re-booted`, { timestamp: true });
            vite.ws.send({ type: 'full-reload' });
          },
          (error: unknown) => {
            // the old server goes on answering until an edit boots
            current = outgoing;
            vite.config.logger.error(`[${label}] re-boot failed: ${said(error)}`, { timestamp: true });
          },
        );
      }, REBOOT_DEBOUNCE_MS);
    };
    vite.watcher.on('change', reboot);
    vite.watcher.on('add', reboot);
    vite.watcher.on('unlink', reboot);
    vite.httpServer?.once('close', () => void current.then(retire, () => undefined));

    vite.middlewares.use((req, res, next) => {
      const url = req.url ?? '/';
      const path = url.split('?')[0] ?? '/';

      const who = /^\/dev\/as\/([\w.@%-]+)$/.exec(path)?.[1];
      if (who !== undefined) {
        void current
          .then(async ({ app }) => {
            if (app.signIn === undefined) {
              next();
              return;
            }
            const token = await app.signIn(decodeURIComponent(who));
            const key = JSON.stringify(app.tokenKey ?? 'nisc.token');
            res.setHeader('content-type', 'text/html; charset=utf-8');
            res.end(
              token === null
                ? `<p>nobody called ${who.replace(/[<&"]/g, '')}</p>`
                : `<script>localStorage.setItem(${key},${JSON.stringify(token)});document.cookie=encodeURIComponent(${key})+'='+encodeURIComponent(${JSON.stringify(token)})+'; Path=/; SameSite=Lax';location.replace('/')</script>`,
            );
          })
          .catch(() => {
            res.statusCode = 500;
            res.end('the dev sign-in failed');
          });
        return;
      }

      if (owned.test(path)) {
        void current.then(({ listener }) => listener(req, res)).catch(() => {
          res.statusCode = 503;
          res.end('the app server did not boot — see the dev server’s log');
        });
        return;
      }

      if (req.method !== 'GET') {
        next();
        return;
      }
      void current
        .then(async ({ app }) => {
          if (app.draw === undefined || (path !== '/' && path !== '/index.html' && app.server.page(path) === undefined)) {
            next();
            return;
          }
          const template = await vite.transformIndexHtml(url, await readFile(resolve(vite.config.root, options.index ?? 'index.html'), 'utf8'));
          const page = await renderDocument({
            server: app.server,
            template,
            request: { path: path === '/index.html' ? '/' : path, cookie: req.headers.cookie ?? null },
            draw: app.draw,
            ...(app.htmlAttributes !== undefined ? { htmlAttributes: app.htmlAttributes } : {}),
            ...(app.tokenKey !== undefined ? { tokenKey: app.tokenKey } : {}),
          });
          res.statusCode = 200;
          res.setHeader('content-type', 'text/html; charset=utf-8');
          for (const [name, value] of Object.entries(page.headers)) res.setHeader(name, value);
          res.end(page.html);
        })
        // not drawn is not broken: vite serves index.html as it always did
        .catch(() => next());
    });
  },
});
