import type { Telemetry } from '../runtime';
import type { ShellHost } from '../shells';

// WHAT THE SOCKET IS HANDED.
//
// Each member is one function or one value of whoever owns it. The socket is
// handed no application manifest, no runtime and no shell host: whoever stands
// it up (../server) says where each comes from.

// WHAT THE SOCKET ASKS OF A SHELL HOST (../shells): the session a connection is
// attached to. One function of the host, so a host is handed here as that and
// no more.
export type SessionSource = Pick<ShellHost, 'session'>;

// What somebody holds of the application, as `hello` says it: the ids of the
// actions granted to them, and the version token of that set. Written out
// here: whoever stands the socket up says where it comes from.
export type HeldCatalog = { ids: readonly string[]; hash: string };

export type SocketConfig = {
  session: (token: string) => string | null | Promise<string | null>;
  catalog: (principal: string | null) => HeldCatalog | Promise<HeldCatalog>;
  // The shell host — when the manifest declares a shell, events route into
  // the session's server shell and render frames flow back.
  shells?: SessionSource;
  // WHICH HOST A PATH LEADS TO. A terminal on a page names the path it is on
  // (`?path=`); this answers with that page's host and the input its path
  // carries, or undefined for a path that is the app's. Absent: every
  // connection is the app's.
  page?: (path: string) => { host: SessionSource; inputs: Record<string, Record<string, unknown>> } | undefined;
  // How many shells for nobody signed in may be alive at once (./socket.ts).
  // Default `DEFAULT_ANONYMOUS_SHELL_MAX`; `Infinity` is no limit.
  anonymousShellMax?: number;
  // How often a LIVE connection's credential is re-verified. Default
  // `DEFAULT_REVALIDATE_MS`; `0` or `Infinity` disables it, and a token
  // checked once at upgrade is then trusted for the life of the connection.
  revalidateMs?: number;
  // The deployment's telemetry sink, if any — a `socket.upgrade` span per
  // connection admitted or refused, and a `socket.close` span carrying the
  // whole connection's lifetime. See ../runtime, telemetry.ts.
  telemetry?: Telemetry;
  // Origins that are this app's own page beside the host a request is
  // addressed to (`runtime.origins`) — a proxy that rewrites `Host`.
  origins?: readonly string[];
  // How much longer a token resolves, when the credential knows — how long a
  // browser is told to keep the cookie that carries it. Unknown: until the
  // browser closes.
  sessionLastsMs?: (token: string) => number | null | Promise<number | null>;
};

// The transport seam — what a runtime's websocket must provide. Four
// functions, and what the request that opened the connection offered;
// everything above them is identical on every runtime.
export type Connection = {
  send: (text: string) => void;
  close: (code?: number, reason?: string) => void;
  onMessage: (fn: (text: string) => void) => void;
  onClose: (fn: () => void) => void;
  // The upgrade request, as far as it says who is asking: the subprotocols it
  // offered (`Sec-WebSocket-Protocol`, split), and — for a browser's session
  // (../identity, session-cookie.ts) — where the page is, where the request was
  // addressed, and the cookies it carried. A transport that leaves this out
  // serves every terminal as nobody.
  //
  // `answer`: a transport that has NOT answered the request yet says so by
  // giving this, and is told — once who is asking is decided, before the
  // connection is used at all — the `Set-Cookie` values its answer is to
  // carry: the one moment a cookie can be written. It answers when the
  // connection is first used.
  // Without it nothing is written, and a browser's terminal goes on holding
  // its own token.
  upgrade?: {
    offered: readonly string[];
    origin?: string | null;
    host?: string | null;
    cookie?: string | null;
    answer?: (cookies: readonly string[]) => void;
  };
  // Set here, not by a transport: how this connection's terminal is handed a
  // session when its browser holds a seal (../identity, session-cookie.ts) — sealed, so
  // the page carries it to the next upgrade and cannot open it. Absent, a
  // session is handed over as its token.
  seal?: (token: string) => Promise<string>;
};

// WHAT A TRANSPORT IS TOLD ABOUT THE CONNECTIONS IT OPENS: whether their frames
// are compressed (permessage-deflate; an object is the library's own tuning),
// and the largest message one may send, in bytes, counted once inflated. Both
// are the deployment's (`runtime.socketCompression`,
// `runtime.socketMaxMessageBytes`); one that is not said is the transport's
// default.
export type TransportSettings = { compression?: boolean | Record<string, unknown>; maxMessageBytes?: number };

// One accept per new connection: authenticate (who a terminal is rides the
// upgrade request; absent = the anonymous principal, invalid = closed with
// 4401), then say hello with the resolved catalog and settle into the message
// loop. `stop` ends revalidation, for hosts that outlive their server (dev
// checks, embedded tools) — the timer is unref'd, so a plain process needn't
// call it.
//
// `transport`: HOW IT IS TO BE ATTACHED. Whoever stands the socket up says it
// (../server, server.ts, from the runtime), and a runtime's transport reads it
// when it is handed the accept, so a host that attaches the socket has nothing
// to say and cannot forget to. Absent: the transport's defaults.
export type SocketAccept = ((url: string, connection: Connection) => Promise<void>) & { stop: () => void; transport?: TransportSettings };
