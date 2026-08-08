import { serve as listen } from '@hono/node-server';
import { WebSocketServer } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { createServer } from './server';
import type { MossServer } from './server';
import type { NiscApp } from './app';
import type { NiscRuntime } from './runtime';
import type { SocketAccept } from './socket';

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

// The `ws` half of the transport seam: RFC 6455 stays library-handled
// (permessage-deflate on); the protocol above the seam is
// nisc's own (../socket.ts) and identical on every runtime.
export const attachSocket = (httpServer: Upgradeable, accept: SocketAccept, path = '/socket'): void => {
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: true });
  httpServer.on('upgrade', (req, socket, head) => {
    const url = req.url ?? '/';
    // Not ours: leave it for whichever other listener owns it (vite's HMR
    // upgrade rides the same server in dev).
    if (new URL(url, 'http://nisc.local').pathname !== path) return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      void accept(url, {
        send: (text) => ws.send(text),
        close: (code, reason) => ws.close(code, reason),
        onMessage: (fn) => ws.on('message', (data) => fn(String(data))),
        onClose: (fn) => ws.on('close', () => fn()),
      });
    });
  });
};

export const serve = async (app: NiscApp, runtime: NiscRuntime & { port?: number }): Promise<MossServer> => {
  const server = await createServer(app, runtime);
  const port = runtime.port ?? 8787;
  const httpServer = listen({ fetch: server.fetch, port });
  attachSocket(httpServer, server.socket);
  console.log(`moss serving http://localhost:${port}`);
  console.log(`surfaces: GET /catalog · GET|POST /api/vex · GET|POST /api/<resource>/vex · ws://localhost:${port}/socket`);
  return server;
};
