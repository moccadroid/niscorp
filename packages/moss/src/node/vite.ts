import { readFile } from 'node:fs/promises';
import { BlockList, isIPv4, isIPv6 } from 'node:net';
import { resolve } from 'node:path';
import type { Connect, Plugin, ViteDevServer } from 'vite';
import { getRequestListener } from '@hono/node-server';
import { renderDocument } from '../documents';
import type { DocumentConfig } from '../documents';
import { sessionCookies } from '../identity';
import type { MossServer } from '../server';
import { MOSS_PATHS } from './index';
import { createTransport, listenForUpgrades } from './transport';
import type { Transport } from './transport';

export type DevApp = {
  server: MossServer;
  close?: () => void | Promise<void>;
  draw?: DocumentConfig['draw'];
  htmlAttributes?: DocumentConfig['htmlAttributes'];
  site?: DocumentConfig['site'];
  tokenKey?: string;
  signIn?: (who: string) => string | null | Promise<string | null>;
};

export type MossDevOptions = {
  app: (load: (id: string) => Promise<Record<string, unknown>>) => Promise<DevApp>;
  watch?: RegExp;
  index?: string;
  owned?: RegExp;
  label?: string;
  signInFromNetwork?: boolean;
};

const DEFAULT_WATCH = /([\\/]src[\\/](app|server|db|ui)[\\/])|([\\/]nisc\.config\.[cm]?[jt]s$)/;
const REBOOT_DEBOUNCE_MS = 200;

const loopback = (): BlockList => {
  const addresses = new BlockList();
  addresses.addSubnet('127.0.0.0', 8, 'ipv4');
  addresses.addAddress('::1', 'ipv6');
  return addresses;
};
const LOOPBACK = loopback();

// By the socket's address alone: `X-Forwarded-For` is written by whoever sent
// the request. `BlockList` checks an IPv4-mapped IPv6 address
// (`::ffff:127.0.0.1`) to the IPv4 rule.
const isFromThisMachine = (address: string | undefined): boolean =>
  address !== undefined && (isIPv4(address) ? LOOPBACK.check(address, 'ipv4') : isIPv6(address) && LOOPBACK.check(address, 'ipv6'));

const signInRefusal = (req: Connect.IncomingMessage, fromNetwork: boolean): string | undefined => {
  if (!fromNetwork && !isFromThisMachine(req.socket.remoteAddress)) {
    return (
      `The dev sign-in (/dev/as/…) answers requests from this machine only, and this one came from ${req.socket.remoteAddress ?? 'an address the server cannot see'}. ` +
      'It hands out a session for whoever the address names. To sign in from another device, set `signInFromNetwork: true` on mossDev: anybody who can reach this dev server then signs in as anybody.'
    );
  }
  return undefined;
};

// What a header says decides nothing here: a sign-in that a proxy on this machine, a tunnel among
// them, carried for somebody elsewhere is only said in the log.
const carriedFor = (req: Connect.IncomingMessage): string | undefined => {
  const header = (name: string): string => {
    const value = req.headers[name];
    return Array.isArray(value) ? value.join(',') : (value ?? '');
  };
  const listed = `${header('x-forwarded-for')},${header('x-real-ip')}`.split(',');
  const named = [...header('forwarded').matchAll(/for="?\[?([^\]";,]+)/gi)].map((found) => found[1] ?? '');
  return [...listed, ...named]
    .map((address) => address.trim().replace(/^(\d+\.\d+\.\d+\.\d+):\d+$/, '$1'))
    .find((address) => address !== '' && !isFromThisMachine(address));
};

type Booted = { app: DevApp; listener: ReturnType<typeof getRequestListener>; transport?: Transport };

const retire = async (booted: Booted): Promise<void> => {
  booted.transport?.close();
  booted.app.server.socket.stop();
  await (booted.app.close ?? ((): void => booted.app.server.close()))();
};

const said = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const devMiddleware =
  (vite: ViteDevServer, options: MossDevOptions, owned: RegExp, current: () => Promise<Booted>): Connect.NextHandleFunction =>
  (req, res, next) => {
    const url = req.url ?? '/';
    const path = url.split('?')[0] ?? '/';

    const who = /^\/dev\/as\/([\w.@%-]+)$/.exec(path)?.[1];
    if (who !== undefined) {
      void current()
        .then(async ({ app }) => {
          if (app.signIn === undefined) {
            next();
            return;
          }
          const refusal = signInRefusal(req, options.signInFromNetwork === true);
          if (refusal !== undefined) {
            res.statusCode = 403;
            res.setHeader('content-type', 'text/plain; charset=utf-8');
            res.end(refusal);
            return;
          }
          const elsewhere = options.signInFromNetwork === true ? undefined : carriedFor(req);
          if (elsewhere !== undefined) {
            vite.config.logger.warn(
              `[${options.label ?? 'moss'}] /dev/as/${who} was answered for a request a proxy on this machine carried for ${elsewhere}. ` +
                'Through a tunnel, anybody who has its address signs in as anybody: close the tunnel, or keep it away from /dev/as.',
              { timestamp: true },
            );
          }
          const token = await app.signIn(decodeURIComponent(who));
          if (token === null) {
            res.setHeader('content-type', 'text/html; charset=utf-8');
            res.end(`<p>nobody called ${who.replace(/[<&"]/g, '')}</p>`);
            return;
          }
          const scheme = 'encrypted' in req.socket && req.socket.encrypted === true ? 'https' : 'http';
          res.statusCode = 302;
          res.setHeader('set-cookie', sessionCookies(`${scheme}://${req.headers.host ?? 'localhost'}`, token, app.tokenKey !== undefined ? { key: app.tokenKey } : {}));
          res.setHeader('location', '/');
          res.end();
        })
        .catch(() => {
          res.statusCode = 500;
          res.end('the dev sign-in failed');
        });
      return;
    }

    if (owned.test(path)) {
      void current().then(({ listener }) => listener(req, res)).catch(() => {
        res.statusCode = 503;
        res.end('the app server did not boot — see the dev server’s log');
      });
      return;
    }

    if (req.method !== 'GET') {
      next();
      return;
    }
    void current()
      .then(async ({ app }) => {
        if (app.draw === undefined || (path !== '/' && path !== '/index.html' && app.server.page(path) === undefined)) {
          next();
          return;
        }
        const template = await vite.transformIndexHtml(url, await readFile(resolve(vite.config.root, options.index ?? 'index.html'), 'utf8'));
        const page = await renderDocument({
          server: app.server,
          template,
          request: {
            path: path === '/index.html' ? '/' : path,
            cookie: req.headers.cookie ?? null,
            host: req.headers.host ?? null,
            peer: req.socket.remoteAddress ?? null,
            headers: req.headers,
          },
          draw: app.draw,
          ...(app.htmlAttributes !== undefined ? { htmlAttributes: app.htmlAttributes } : {}),
          ...(app.site !== undefined ? { site: app.site } : {}),
          ...(app.tokenKey !== undefined ? { tokenKey: app.tokenKey } : {}),
        });
        res.statusCode = 200;
        res.setHeader('content-type', 'text/html; charset=utf-8');
        for (const [name, value] of Object.entries(page.headers)) res.setHeader(name, value);
        res.end(page.html);
      })
      // Not drawn is not broken: vite serves index.html.
      .catch(() => next());
  };

export const mossDev = (options: MossDevOptions): Plugin => ({
  name: 'moss-dev',
  apply: 'serve',
  configureServer: (vite: ViteDevServer) => {
    const label = options.label ?? 'moss';
    const watch = options.watch ?? DEFAULT_WATCH;
    const owned = options.owned ?? MOSS_PATHS;
    const load = (id: string): Promise<Record<string, unknown>> => vite.ssrLoadModule(id);

    const httpServer = vite.httpServer;
    const boot = async (): Promise<Booted> => {
      const app = await options.app(load);
      return { app, listener: getRequestListener(app.server.fetch), ...(httpServer !== null ? { transport: createTransport(app.server.socket) } : {}) };
    };
    let current = boot();
    current.catch((error: unknown) => vite.config.logger.error(`[${label}] the app did not boot: ${said(error)}`, { timestamp: true }));

    if (httpServer !== null) {
      listenForUpgrades(httpServer, '/socket', (req, socket, head) => {
        void current.then(
          ({ transport }) => transport?.upgrade(req, socket, head),
          () => socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'),
        );
      });
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

    // A boot line scrolls away; over the page, it comes back on every reload until the charter is fixed.
    // Only where the server it is handed can say that a browser connected.
    if (typeof Reflect.get(vite.ws, 'on') === 'function') {
      vite.ws.on('connection', () => {
        void current
          .then(({ app }) => {
            const unread = app.server.charterReport().warnings.flatMap((warning) => (warning.rule === 'shape' ? [`  ${warning.detail}`] : []));
            if (unread.length === 0) return;
            const message = ['The charter has what it does not read as written — the app runs, and what it lists does not apply:', ...unread].join('\n');
            vite.ws.send({ type: 'error', err: { message, stack: '', plugin: label } });
          })
          .catch(() => undefined);
      });
    }

    vite.middlewares.use(devMiddleware(vite, options, owned, () => current));
  },
});
