import { WebSocketServer } from 'ws';
import type { WebSocket as ServerSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { SUBPROTOCOL } from '../protocol';
import type { SocketAccept, TransportSettings } from '../socket';

export type Upgradeable = {
  on: (event: 'upgrade', handler: (req: IncomingMessage, socket: Duplex, head: Buffer) => void) => unknown;
};

const MAX_MESSAGE_BYTES = 256 * 1024;

export type Transport = {
  upgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
  close: () => void;
};

export const createTransport = (accept: SocketAccept, told?: TransportSettings): Transport => {
  const settings: TransportSettings = { ...accept.transport, ...told };
  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: settings.compression ?? true,
    maxPayload: settings.maxMessageBytes ?? MAX_MESSAGE_BYTES,
    // Only `nisc` is answered: the other entry a terminal offers is its token,
    // which is not said back.
    handleProtocols: (offered) => (offered.has(SUBPROTOCOL) ? SUBPROTOCOL : false),
  });
  const answers = new WeakMap<IncomingMessage, readonly string[]>();
  wss.on('headers', (headers, req) => {
    for (const cookie of answers.get(req) ?? []) headers.push(`Set-Cookie: ${cookie}`);
  });
  const upgrade: Transport['upgrade'] = (req, socket, head) => {
    const url = req.url ?? '/';
    let ws: ServerSocket | undefined;
    let answered = false;
    let cookies: readonly string[] = [];
    // The request is answered at the first use of the connection: by then moss
    // has named the cookies the 101 carries. One `ws` will not upgrade leaves
    // `ws` undefined.
    const answer = (): ServerSocket | undefined => {
      if (answered) return ws;
      answered = true;
      answers.set(req, cookies);
      wss.handleUpgrade(req, socket, head, (opened) => {
        ws = opened;
        // An 'error' nobody listens for is thrown by Node and ends the process.
        // `ws` has already closed the connection with the status that says why.
        opened.on('error', (error) => {
          console.warn(`[moss/node] a connection was closed on what it sent: ${error.message}`);
        });
      });
      return ws;
    };
    accept(url, {
      send: (text) => void answer()?.send(text),
      close: (code, reason) => void answer()?.close(code, reason),
      onMessage: (fn) => void answer()?.on('message', (data) => fn(String(data))),
      onClose: (fn) => {
        const opened = answer();
        if (opened === undefined) queueMicrotask(fn);
        else opened.on('close', () => fn());
      },
      upgrade: {
        offered: String(req.headers['sec-websocket-protocol'] ?? '').split(',').map((entry) => entry.trim()),
        origin: req.headers.origin ?? null,
        host: req.headers.host ?? null,
        cookie: req.headers.cookie ?? null,
        answer: (given) => void (cookies = given),
      },
    }).catch((error: unknown) => {
      console.error('[moss/node] a connection escaped accept:', error);
      try {
        answer()?.close(1011, 'accept failed');
      } catch {
        // Already gone.
      }
    });
  };
  return {
    upgrade,
    close: () => {
      for (const client of wss.clients) client.close(1001, 'server closing');
      wss.close();
    },
  };
};

export const listenForUpgrades = (httpServer: Upgradeable, path: string, upgrade: Transport['upgrade']): void => {
  httpServer.on('upgrade', (req, socket, head) => {
    // Any other is left for the listener that owns it (vite's HMR in dev).
    if (new URL(req.url ?? '/', 'http://nisc.local').pathname !== path) return;
    // Until moss answers the request, a peer that resets the raw socket would
    // be an 'error' nobody hears, which ends the process.
    socket.on('error', () => {});
    upgrade(req, socket, head);
  });
};
