import { readFile } from 'node:fs/promises';
import { BlockList, isIPv4, isIPv6 } from 'node:net';
import { resolve } from 'node:path';
import type { Connect, Plugin, ViteDevServer } from 'vite';
import { getRequestListener } from '@hono/node-server';
import { renderDocument } from '../documents';
import type { DocumentConfig } from '../documents';
import { sessionCookies } from '../identity';
import type { MossServer } from './moss-server';
import { MOSS_PATHS } from './node';
import { createTransport, listenForUpgrades } from './transport';
import type { Transport } from './transport';

// ═══════════════════════════════════════════════════════════════
// @niscorp/moss/vite — the app server inside vite's dev process.
//
// One `nisc dev`, no proxy, no second terminal: the app boots in vite's own
// process, through vite's own module loading (`ssrLoadModule`), so the boot it
// runs is the source on disk and an edit is a fresh boot. What it does, in the
// order a request meets it:
//
//   the socket   heard ONCE on vite's listener; each upgrade is answered by the
//                transport of whichever app is booted now — one for each app,
//                set as its runtime says, and retired with it
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
// and is then let go, timers included and its connections closed: a terminal
// that is not a page (a console) connects again, to the app that is booted.
// ═══════════════════════════════════════════════════════════════

export type DevApp = {
  server: MossServer;
  // how to let it go (default: `server.close()`)
  close?: () => void | Promise<void>;
  // How one of its screens is drawn. Absent: pages go out as vite's index.html,
  // undrawn, and the terminal paints them as it always did.
  draw?: DocumentConfig['draw'];
  htmlAttributes?: DocumentConfig['htmlAttributes'];
  site?: DocumentConfig['site'];
  tokenKey?: string;
  // A dev-only signed-in URL: `/dev/as/<who>` puts the token this returns in
  // the browser's own session cookie (../identity, session-cookie.ts) — as a sign-in the
  // app answers over HTTP would — and goes to `/`. `null` is nobody of that
  // name. It lives in vite's middleware and nowhere else, so it cannot ship.
  // It answers requests from this machine only, unless the plugin was told
  // otherwise (`MossDevOptions.signInFromNetwork`).
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
  // ANSWER THE SIGN-IN URL (`/dev/as/<who>`) TO EVERY DEVICE THAT CAN REACH THE
  // DEV SERVER, where it answers this machine only (default `false`). It hands
  // out a session for whoever the address names, so with this on and vite
  // listening on a network (`--host`), anybody on that network signs in as
  // anybody. For trying a signed-in screen on a phone, on a network you trust.
  //
  // IT ALSO OPENS THE SIGN-IN TO ANY PAGE, OF ANY SITE, in a browser on a
  // device that can reach the dev server, the developer's own included. The
  // refusal of another site's page (`signInRefusal`, below) reads a header a
  // browser sends only to an address it trusts: https, or this machine's own
  // names. To the dev server's network address over plain http, which is how
  // another device reaches it, a browser sends none, so a request a page of
  // another site started there is not told from one that was typed. With
  // this off that request is refused anyway: it does not arrive from this
  // machine's loopback address.
  signInFromNetwork?: boolean;
};

const DEFAULT_WATCH = /([\\/]src[\\/](app|server|db|ui)[\\/])|([\\/]nisc\.config\.[cm]?[jt]s$)/;
const REBOOT_DEBOUNCE_MS = 200;

// THIS MACHINE'S OWN ADDRESSES: 127.0.0.0/8 and ::1. An IPv4 address written
// as an IPv6 one (`::ffff:127.0.0.1`, what a listener on both families reports)
// is held to the IPv4 rule.
const loopback = (): BlockList => {
  const addresses = new BlockList();
  addresses.addSubnet('127.0.0.0', 8, 'ipv4');
  addresses.addAddress('::1', 'ipv6');
  return addresses;
};
const LOOPBACK = loopback();

// Whether a request came from this machine, by the address at the other end of
// its socket and by nothing else: what a header says of where a request came
// from (`X-Forwarded-For`) is written by whoever sent it. A socket with no
// address left is nobody's.
const isFromThisMachine = (address: string | undefined): boolean =>
  address !== undefined && (isIPv4(address) ? LOOPBACK.check(address, 'ipv4') : isIPv6(address) && LOOPBACK.check(address, 'ipv6'));

// THE SIGN-IN SIGNS WHOEVER ASKS IN AS WHOEVER THE ADDRESS NAMES, so it is
// answered to the developer and to nobody else. Why a request is refused, or
// undefined when it is answered:
//
//   - it did not come from this machine, unless the host opened the sign-in
//     to the network (`signInFromNetwork`);
//   - a page of another site started it. That page is open in the developer's
//     own browser, so its request comes from this machine too: sent there by
//     such a page, the browser came back signed in as whoever the page had
//     named, and an image or a fetch of the address had the app mint a session
//     each time. A browser says which site started a request
//     (`Sec-Fetch-Site`), and a page cannot write that header. An address that
//     is typed, pasted, bookmarked, or linked from the app's own page is not
//     another site's, and something that is not a browser sends no such header.
//
// WHERE THE SECOND RULE DOES NOT HOLD. A browser sends `Sec-Fetch-Site` only
// to an address it trusts: https, and this machine's own names (`localhost`,
// `127.0.0.1`, `[::1]`). To any other name or address over plain http it sends
// none, whichever page started the request (run in Chrome: a request to
// `localhost` from another origin carried `cross-site`; the same request to
// the machine's network address carried no such header). Those requests are
// stopped by the first rule, because one made to the network address arrives
// from that address and not from loopback, this machine's own browser
// included. So the second rule is whole while the first one stands, and with
// `signInFromNetwork` on it does not cover the network address: there a page
// of another site signs a browser in as whoever it names. No check is made
// for it, because none that reads what a browser sends would be complete:
// run the same way, that request carried no `Origin`, and no `Referer` once
// the page asked for it to be left off. The option's own comment and DOCS.md
// say what it opens.
const signInRefusal = (req: Connect.IncomingMessage, fromNetwork: boolean): string | undefined => {
  if (!fromNetwork && !isFromThisMachine(req.socket.remoteAddress)) {
    return (
      `The dev sign-in (/dev/as/…) answers requests from this machine only, and this one came from ${req.socket.remoteAddress ?? 'an address the server cannot see'}. ` +
      'It hands out a session for whoever the address names. To sign in from another device, set `signInFromNetwork: true` on mossDev: anybody who can reach this dev server then signs in as anybody.'
    );
  }
  if (req.headers['sec-fetch-site'] === 'cross-site') {
    return (
      'The dev sign-in (/dev/as/…) was asked for by a page of another site, and is not answered to one: it would sign this browser in as whoever that page named. ' +
      'Open the address yourself, from the address bar.'
    );
  }
  return undefined;
};

// An app that is booted, and what answers for it. `transport` is the one its
// connections are opened by: made for this app, set as its server's socket
// says (the two settings of its runtime), and retired with it. Absent where
// vite has no listener of its own (middleware mode): then there is no socket.
type Booted = { app: DevApp; listener: ReturnType<typeof getRequestListener>; transport?: Transport };

// Let an app go: its connections first (closed 1001 — the server they were
// attached to is going, and a terminal that is closed connects again, to the
// app that is booted now), then its timers, then whatever it says itself.
const retire = async (booted: Booted): Promise<void> => {
  booted.transport?.close();
  booted.app.server.socket.stop();
  await (booted.app.close ?? ((): void => booted.app.server.close()))();
};

const said = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// WHAT A REQUEST MEETS IN DEV, in this order: the sign-in URL, the paths the
// app server answers, then a page drawn into vite's own index.html. Anything
// else is vite's. `current` is the app that is booted now: a re-boot swaps
// what it answers, never this handler.
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
          // Refused before the app is asked anything.
          const refusal = signInRefusal(req, options.signInFromNetwork === true);
          if (refusal !== undefined) {
            res.statusCode = 403;
            res.setHeader('content-type', 'text/plain; charset=utf-8');
            res.end(refusal);
            return;
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
          request: { path: path === '/index.html' ? '/' : path, cookie: req.headers.cookie ?? null, host: req.headers.host ?? null },
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
      // not drawn is not broken: vite serves index.html as it always did
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

    // THE SOCKET FOLLOWS THE APP THAT IS BOOTED NOW. The listener is vite's and
    // is heard once, before any app is up; which transport answers an upgrade
    // is asked at each one, so a connection is set as the runtime of the app
    // it reaches says (`socketMaxMessageBytes`, `socketCompression`), and one
    // that arrives during a boot waits for it, as a page does. An app that did
    // not boot has no socket: the request is refused, as its routes are.
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

    vite.middlewares.use(devMiddleware(vite, options, owned, () => current));
  },
});
