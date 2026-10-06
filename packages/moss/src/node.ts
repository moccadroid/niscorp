import { readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { serve as listen } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { WebSocketServer } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { createServer } from './server';
import type { MossServer } from './server';
import type { NiscApp } from './app';
import type { NiscRuntime } from './runtime';
import { SUBPROTOCOL } from './socket';
import type { SocketAccept } from './socket';
import { renderDocument } from './document';
import type { DocumentConfig } from './document';

// ═══════════════════════════════════════════════════════════════
// The Node entry — runtime-specific by design: the transport is a seam, so
// the Bun flip swaps this file, never the app. Two exports: the
// websocket transport for hosts that run their own listener (the dev
// checks, vite), and the batteries-included `serve`.
// ═══════════════════════════════════════════════════════════════

// Anything that emits Node upgrade events — http.Server structurally, so
// the @hono/node-server return type needs no narrowing.
type Upgradeable = {
  on: (event: 'upgrade', handler: (req: IncomingMessage, socket: Duplex, head: Buffer) => void) => unknown;
};

// THE LARGEST MESSAGE A CONNECTION MAY SEND, in bytes, unless the host says
// otherwise (`options.maxMessageBytes`). Told nothing, `ws` takes 100 MiB — and
// what a terminal sends is an event: a press, a typed value, one row handed
// back. A few KB. Whatever a message carries, the server then keeps (the value
// in the shell, and again in the last frame it sent) and sends back down in
// every later frame of that canvas, so this is what ONE connection, signed in
// or not, can make the process hold and re-send: about 1.5 MB at this limit,
// 48 MB for a 16 MiB value. Compression is no bound — 64 MB of one letter is
// 60 KB on the wire — so the count is of the message once inflated. A message
// over it closes that connection with 1009, and nothing else.
const MAX_MESSAGE_BYTES = 256 * 1024;

// The `ws` half of the transport seam: RFC 6455 stays library-handled
// (permessage-deflate on by default — see `runtime.socketCompression`); the
// protocol above the seam is nisc's own (../socket.ts) and identical on every
// runtime.
export const attachSocket = (
  httpServer: Upgradeable,
  accept: SocketAccept,
  path = '/socket',
  options?: { compression?: boolean | Record<string, unknown>; maxMessageBytes?: number },
): void => {
  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: options?.compression ?? true,
    maxPayload: options?.maxMessageBytes ?? MAX_MESSAGE_BYTES,
    // Of what a terminal offers, `nisc` is answered and nothing else: the
    // other entry is its token (socket.ts), which is not said back.
    handleProtocols: (offered) => (offered.has(SUBPROTOCOL) ? SUBPROTOCOL : false),
  });
  httpServer.on('upgrade', (req, socket, head) => {
    const url = req.url ?? '/';
    // Not ours: leave it for whichever other listener owns it (vite's HMR
    // upgrade rides the same server in dev).
    if (new URL(url, 'http://nisc.local').pathname !== path) return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      // `ws` reports what it refuses from a client — a malformed frame, a
      // message over its size limit — as an 'error' on that connection, having
      // already closed it with the status that says why (1002, 1009). An
      // 'error' nobody listens for is thrown by Node, out of the socket's own
      // data handler where nothing can catch it: one bad frame from one
      // client took the process, and every session on it, down. Heard here it
      // is that connection's alone, and the close it already got is the answer.
      ws.on('error', (error) => {
        console.warn(`[moss/node] a connection was closed on what it sent: ${error.message}`);
      });
      // accept promises to handle its own failures (see socket.ts). This is
      // the floor under that promise: an await added there without a guard
      // degrades to one logged close here instead of an unhandled rejection
      // taking every session on the box down with it.
      accept(url, {
        send: (text) => ws.send(text),
        close: (code, reason) => ws.close(code, reason),
        onMessage: (fn) => ws.on('message', (data) => fn(String(data))),
        onClose: (fn) => ws.on('close', () => fn()),
        upgrade: { offered: String(req.headers['sec-websocket-protocol'] ?? '').split(',').map((entry) => entry.trim()) },
      }).catch((error: unknown) => {
        console.error('[moss/node] a connection escaped accept:', error);
        try {
          ws.close(1011, 'accept failed');
        } catch {
          // already gone
        }
      });
    });
  });
};

// THE BUILT TERMINAL, served by the same process as the app — one origin, so the
// socket is `/socket` wherever the page came from.
//
// `dist` is what the app's bundler wrote: index.html and its assets. Every GET
// that nothing registered earlier answers is a file from it, or a PAGE:
// index.html with the caller's screen drawn into it (./document) — the app's own
// for `/`, one of the manifest's pages for a path that leads to one. index.html
// itself is never served as a file: it is the template, and goes out drawn.
//
// A name with an extension that is neither a file in `dist` nor a page of the
// manifest is a MISSING FILE, and is answered 404 — not with a screen. A browser
// holding a page from before a deploy asks for that page's script by its old
// name; what it needs back is "gone", not a document that is not a script.
//
// Register the app's own routes FIRST; this is the catch-all. `owned` names the
// prefixes that are never a page (default: moss's own surfaces) — an unknown
// path under one is a 404, not a screen.
export type SiteConfig = Pick<DocumentConfig, 'draw' | 'htmlAttributes' | 'site' | 'tokenKey' | 'waitMs'> & {
  dist: string;
  owned?: RegExp;
};

// The paths the app server answers itself; everything else is the site's.
export const MOSS_PATHS = /^\/(api|catalog|socket|operator|integrations)(\/|$)/;

export const mountSite = (server: MossServer, config: SiteConfig): void => {
  const { dist, owned = MOSS_PATHS, ...drawing } = config;
  // serveStatic resolves `root` against the working directory.
  const root = relative(process.cwd(), dist) || '.';
  const files = serveStatic({ root });
  server.use('/*', async (c, next) => {
    const path = c.req.path;
    if (owned.test(path) || path === '/' || path === '/index.html' || server.page(path) !== undefined) return next();
    return files(c, next);
  });
  server.get('*', async (c) => {
    if (owned.test(c.req.path)) return c.notFound();
    // the static server above found no such file, and no page is at this path
    if (extname(c.req.path) !== '' && c.req.path !== '/index.html' && server.page(c.req.path) === undefined) return c.notFound();
    const template = await readFile(join(dist, 'index.html'), 'utf8');
    const page = await renderDocument({
      ...drawing,
      server,
      template,
      request: { path: c.req.path === '/index.html' ? '/' : c.req.path, cookie: c.req.header('cookie') ?? null },
    });
    return c.html(page.html, 200, page.headers);
  });
};

export const serve = async (app: NiscApp, runtime: NiscRuntime & { port?: number }): Promise<MossServer> => {
  const server = await createServer(app, runtime);
  const port = runtime.port ?? 8787;
  const httpServer = listen({ fetch: server.fetch, port });
  attachSocket(httpServer, server.socket, '/socket', { ...(runtime.socketCompression !== undefined ? { compression: runtime.socketCompression } : {}) });
  console.log(`moss serving http://localhost:${port}`);
  console.log(`surfaces: GET /catalog · GET|POST /api/vex · GET|POST /api/<resource>/vex · ws://localhost:${port}/socket`);
  return server;
};
