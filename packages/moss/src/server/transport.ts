import { WebSocketServer } from 'ws';
import type { WebSocket as ServerSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { SUBPROTOCOL } from '../protocol';
import type { SocketAccept, TransportSettings } from '../socket';

// ═══════════════════════════════════════════════════════════════
// The `ws` half of the transport seam: RFC 6455 stays library-handled
// (permessage-deflate on by default — see `runtime.socketCompression`); the
// protocol above the seam is nisc's own (../socket) and identical on every
// runtime.
//
// Two things, because they have two lifetimes. A TRANSPORT answers upgrade
// requests through one accept and holds the connections it opened; HEARING
// the upgrades of a listener is deciding which requests are the socket's.
// `attachSocket` (./node.ts) is one of each.
// ═══════════════════════════════════════════════════════════════

// Anything that emits Node upgrade events — http.Server structurally, so
// the @hono/node-server return type needs no narrowing.
export type Upgradeable = {
  on: (event: 'upgrade', handler: (req: IncomingMessage, socket: Duplex, head: Buffer) => void) => unknown;
};

// THE LARGEST MESSAGE A CONNECTION MAY SEND, in bytes, unless the deployment
// says otherwise (`runtime.socketMaxMessageBytes`). Told nothing, `ws` takes 100 MiB — and
// what a terminal sends is an event: a press, a typed value, one row handed
// back. A few KB. Whatever a message carries, the server then keeps (the value
// in the shell, and again in the last frame it sent) and sends back down in
// every later frame of that canvas, so this is what ONE connection, signed in
// or not, can make the process hold and re-send: about 1.5 MB at this limit,
// 48 MB for a 16 MiB value. Compression is no bound — 64 MB of one letter is
// 60 KB on the wire — so the count is of the message once inflated. A message
// over it closes that connection with 1009, and nothing else.
const MAX_MESSAGE_BYTES = 256 * 1024;

export type Transport = {
  // One upgrade request that is the socket's, answered through the accept the
  // transport was made over.
  upgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
  // How the transport is retired: every connection it opened is ended (1001,
  // going away) and it takes no more.
  close: () => void;
};

// HOW ITS CONNECTIONS ARE SET IS THE ACCEPT'S TO SAY (`accept.transport`: the
// socket a server hands out carries its deployment's two settings). `told` is
// a host saying otherwise, setting by setting; what neither says is the
// default: compressed, and `MAX_MESSAGE_BYTES`.
export const createTransport = (accept: SocketAccept, told?: TransportSettings): Transport => {
  const settings: TransportSettings = { ...accept.transport, ...told };
  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: settings.compression ?? true,
    maxPayload: settings.maxMessageBytes ?? MAX_MESSAGE_BYTES,
    // Of what a terminal offers, `nisc` is answered and nothing else: the
    // other entry is its token (../socket), which is not said back.
    handleProtocols: (offered) => (offered.has(SUBPROTOCOL) ? SUBPROTOCOL : false),
  });
  // The cookies moss answers an upgrade with ride the 101 itself.
  const answers = new WeakMap<IncomingMessage, readonly string[]>();
  wss.on('headers', (headers, req) => {
    for (const cookie of answers.get(req) ?? []) headers.push(`Set-Cookie: ${cookie}`);
  });
  const upgrade: Transport['upgrade'] = (req, socket, head) => {
    const url = req.url ?? '/';
    let ws: ServerSocket | undefined;
    let answered = false;
    // The first use of the connection answers the request, with the cookies
    // moss has named by then — which is as soon as it has decided who is
    // asking, or is refusing the terminal outright. A request `ws` will not
    // upgrade (a bad key, a peer already gone) leaves no websocket: nothing is
    // sent to it, and it is closed already.
    let cookies: readonly string[] = [];
    const answer = (): ServerSocket | undefined => {
      if (answered) return ws;
      answered = true;
      answers.set(req, cookies);
      wss.handleUpgrade(req, socket, head, (opened) => {
        ws = opened;
        // `ws` reports what it refuses from a client — a malformed frame, a
        // message over its size limit — as an 'error' on that connection, having
        // already closed it with the status that says why (1002, 1009). An
        // 'error' nobody listens for is thrown by Node, out of the socket's own
        // data handler where nothing can catch it: one bad frame from one
        // client took the process, and every session on it, down. Heard here it
        // is that connection's alone, and the close it already got is the answer.
        opened.on('error', (error) => {
          console.warn(`[moss/node] a connection was closed on what it sent: ${error.message}`);
        });
      });
      return ws;
    };
    // accept promises to handle its own failures (see ../socket). This is
    // the floor under that promise: an await added there without a guard
    // degrades to one logged close here instead of an unhandled rejection
    // taking every session on the box down with it.
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
        // already gone
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

// WHICH UPGRADE REQUESTS OF A LISTENER ARE THE SOCKET'S: the ones made to
// `path`. Each is handed to `upgrade`; any other is left for whichever other
// listener owns it (vite's HMR upgrade rides the same server in dev).
export const hearUpgrades = (httpServer: Upgradeable, path: string, upgrade: Transport['upgrade']): void => {
  httpServer.on('upgrade', (req, socket, head) => {
    if (new URL(req.url ?? '/', 'http://nisc.local').pathname !== path) return;
    // THE REQUEST IS ANSWERED ONCE MOSS HAS DECIDED WHO IS ASKING, because the
    // answer is the one thing that can write a browser's session cookie
    // (../identity, session-cookie.ts). Until then the raw socket is nobody's to listen to,
    // and a peer that resets it would be an 'error' thrown out of Node — the
    // whole process. Heard here, it is that request's alone.
    socket.on('error', () => {});
    upgrade(req, socket, head);
  });
};
